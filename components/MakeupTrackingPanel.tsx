"use client";
// ═══════════════════════════════════════════════════════════════
// 🎯 v3.36.0 보강 트래킹 & 자동 차감 시스템 UI 컴포넌트
// - 결석 유형/고지시간 필수 입력
// - 만료일 = 결석일 + 30일 자동 계산
// - 4단계 상태 트래킹 (대기/예약완료/완료/소멸)
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Calendar, AlertTriangle, CheckCircle2, Clock, XCircle, Trash2 } from "lucide-react";

type MakeupRecord = {
  id: string;
  member_id: string;
  absence_date: string;
  absence_type: string;
  notification_time: string;
  is_eligible: boolean;
  ineligible_reason: string | null;
  makeup_deadline: string;
  makeup_scheduled_date: string | null;
  makeup_completed_at: string | null;
  status: string;
};

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  pending:   { label: "🕒 보강 대기",       color: "bg-amber-100 text-amber-800 border-amber-300", icon: Clock },
  reserved:  { label: "📅 보강 예약 완료",  color: "bg-blue-100 text-blue-800 border-blue-300", icon: Calendar },
  completed: { label: "✅ 보강 완료",       color: "bg-emerald-100 text-emerald-800 border-emerald-300", icon: CheckCircle2 },
  expired:   { label: "⏰ 기한 만료 소멸",   color: "bg-slate-200 text-slate-700 border-slate-300", icon: XCircle },
  waived:    { label: "❌ 보강 불가",       color: "bg-rose-100 text-rose-800 border-rose-300", icon: AlertTriangle },
};

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export default function MakeupTrackingPanel({ memberId, memberName }: { memberId: string; memberName: string }) {
  const [records, setRecords] = useState<MakeupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    absence_date: new Date().toISOString().slice(0, 10),
    absence_type: "sick" as "sick" | "personal",
    notification_time: "before_10am" as "before_10am" | "after_10am",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [memberId]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("makeup_history")
      .select("*")
      .eq("member_id", memberId)
      .is("deleted_at", null)
      .order("absence_date", { ascending: false });
    if (error) console.warn("[v3.36.0] makeup_history 조회 실패:", error.message);
    setRecords(data || []);
    setLoading(false);
    console.log(`[v3.36.0] 보강 이력 로드: ${(data || []).length}건`);
  }

  const stats = useMemo(() => ({
    pending: records.filter(r => r.status === "pending").length,
    reserved: records.filter(r => r.status === "reserved").length,
    completed: records.filter(r => r.status === "completed").length,
    expired: records.filter(r => r.status === "expired").length,
  }), [records]);

  async function addAbsenceRecord() {
    setSaving(true);
    try {
      // 보강 자격 판정
      const isEligible = !(addForm.absence_type === "sick" && addForm.notification_time === "after_10am");
      const ineligibleReason = isEligible ? null : "병결 - 오전 10시 이후 통보로 보강 불가";

      // 만료일 = 결석일 + 30일
      const absenceDate = new Date(addForm.absence_date + "T00:00:00");
      const deadline = new Date(absenceDate.getTime() + 30 * 86400000).toISOString().slice(0, 10);

      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      const { error } = await supabase.from("makeup_history").insert({
        org_id: orgId,
        member_id: memberId,
        absence_date: addForm.absence_date,
        absence_type: addForm.absence_type,
        notification_time: addForm.notification_time,
        is_eligible: isEligible,
        ineligible_reason: ineligibleReason,
        makeup_deadline: deadline,
        status: isEligible ? "pending" : "waived",
      });
      if (error) { alert("저장 실패: " + error.message); return; }
      alert(`✅ 결석 등록 완료\n\n${isEligible ? `📅 보강 만료일: ${deadline}` : `❌ 보강 불가: ${ineligibleReason}`}`);
      setShowAddModal(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function markCompleted(id: string) {
    if (!confirm("이 보강을 완료 처리하시겠습니까?")) return;
    const { error } = await supabase.from("makeup_history")
      .update({ status: "completed", makeup_completed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { alert("실패: " + error.message); return; }
    await load();
  }

  async function forceExpire(id: string) {
    if (!confirm("이 보강을 기한 만료 소멸(차감) 처리하시겠습니까?\n\n주의: 회원권에서 -1회 차감됩니다.")) return;
    await supabase.from("makeup_history")
      .update({ status: "expired" })
      .eq("id", id);
    await load();
  }

  async function deleteRecord(id: string) {
    if (!confirm("이 결석 이력을 삭제하시겠습니까?")) return;
    await supabase.from("makeup_history")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    await load();
  }

  if (loading) return <div className="text-center py-8 text-gray-500">로딩 중...</div>;

  return (
    <div className="space-y-4">
      {/* KPI 4종 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center">
          <div className="text-xs text-amber-700">🕒 보강 대기</div>
          <div className="text-2xl font-bold text-amber-900">{stats.pending}</div>
        </div>
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-center">
          <div className="text-xs text-blue-700">📅 예약 완료</div>
          <div className="text-2xl font-bold text-blue-900">{stats.reserved}</div>
        </div>
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
          <div className="text-xs text-emerald-700">✅ 보강 완료</div>
          <div className="text-2xl font-bold text-emerald-900">{stats.completed}</div>
        </div>
        <div className="p-3 bg-slate-100 border border-slate-300 rounded-xl text-center">
          <div className="text-xs text-slate-700">⏰ 소멸(차감)</div>
          <div className="text-2xl font-bold text-slate-800">{stats.expired}</div>
        </div>
      </div>

      {/* 결석 등록 버튼 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">📋 {memberName} 보강 이력 ({records.length})</h3>
        <button onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs rounded-lg font-medium">
          + 결석 등록
        </button>
      </div>

      {/* 이력 목록 */}
      {records.length === 0 ? (
        <div className="p-8 text-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
          결석 기록이 없습니다. 결석 발생 시 위의 "결석 등록" 버튼을 눌러주세요.
        </div>
      ) : (
        <div className="space-y-2">
          {records.map(r => {
            const meta = STATUS_META[r.status] || STATUS_META.pending;
            const d = daysUntil(r.makeup_deadline);
            const isUrgent = r.status === "pending" && d >= 0 && d <= 7;
            return (
              <div key={r.id} className={`p-3 rounded-xl border-2 ${meta.color} ${isUrgent ? "ring-2 ring-red-400" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs font-bold">{meta.label}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded ${r.absence_type === "sick" ? "bg-red-200 text-red-800" : "bg-purple-200 text-purple-800"}`}>
                        {r.absence_type === "sick" ? "🤒 병결" : "📝 개인사정"}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded ${r.notification_time === "before_10am" ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800"}`}>
                        {r.notification_time === "before_10am" ? "⏰ 10시 이전" : "⚠️ 10시 이후"}
                      </span>
                    </div>
                    <div className="text-sm font-semibold">📅 결석일: {r.absence_date}</div>
                    <div className="text-xs mt-0.5">
                      ⌛ 보강 만료: <span className={isUrgent ? "font-bold text-red-700" : ""}>{r.makeup_deadline}</span>
                      {r.status === "pending" && d >= 0 && (
                        <span className="ml-2 font-semibold">(D-{d})</span>
                      )}
                      {r.status === "pending" && d < 0 && (
                        <span className="ml-2 font-semibold text-red-700">(기한 초과)</span>
                      )}
                    </div>
                    {r.makeup_scheduled_date && (
                      <div className="text-xs mt-0.5">📆 보강 예약일: {r.makeup_scheduled_date}</div>
                    )}
                    {r.makeup_completed_at && (
                      <div className="text-xs mt-0.5">✔ 완료 시각: {new Date(r.makeup_completed_at).toLocaleString("ko-KR")}</div>
                    )}
                    {r.ineligible_reason && (
                      <div className="text-xs mt-0.5 text-rose-700">🚫 {r.ineligible_reason}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {r.status === "reserved" && (
                      <button onClick={() => markCompleted(r.id)}
                        title="보강 완료 처리"
                        className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded">
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    )}
                    {(r.status === "pending" || r.status === "reserved") && (
                      <button onClick={() => forceExpire(r.id)}
                        title="기한 만료 소멸 처리 (차감)"
                        className="p-1.5 text-slate-600 hover:bg-slate-200 rounded">
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => deleteRecord(r.id)}
                      title="삭제"
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 결석 등록 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-[92%] shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-500" /> 결석 등록
            </h3>

            {/* 결석일 */}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">📅 결석일 (필수)</label>
              <input type="date"
                value={addForm.absence_date}
                onChange={e => setAddForm({ ...addForm, absence_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>

            {/* 결석 유형 */}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">🏷️ 결석 유형 (필수)</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setAddForm({ ...addForm, absence_type: "sick" })}
                  className={`py-2 rounded-lg border-2 text-sm font-semibold transition ${addForm.absence_type === "sick" ? "bg-red-100 border-red-500 text-red-800" : "bg-white border-slate-200 text-slate-600"}`}>
                  🤒 병결
                </button>
                <button
                  onClick={() => setAddForm({ ...addForm, absence_type: "personal" })}
                  className={`py-2 rounded-lg border-2 text-sm font-semibold transition ${addForm.absence_type === "personal" ? "bg-purple-100 border-purple-500 text-purple-800" : "bg-white border-slate-200 text-slate-600"}`}>
                  📝 개인사정
                </button>
              </div>
            </div>

            {/* 고지 시간 */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ⏰ 고지 시간 (필수)
                {addForm.absence_type === "personal" && <span className="text-slate-500 font-normal"> - 개인사정은 최소 1일 전 고지</span>}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setAddForm({ ...addForm, notification_time: "before_10am" })}
                  className={`py-2 rounded-lg border-2 text-xs font-semibold transition ${addForm.notification_time === "before_10am" ? "bg-emerald-100 border-emerald-500 text-emerald-800" : "bg-white border-slate-200 text-slate-600"}`}>
                  ⏰ 오전 10시 이전
                </button>
                <button
                  onClick={() => setAddForm({ ...addForm, notification_time: "after_10am" })}
                  className={`py-2 rounded-lg border-2 text-xs font-semibold transition ${addForm.notification_time === "after_10am" ? "bg-red-100 border-red-500 text-red-800" : "bg-white border-slate-200 text-slate-600"}`}>
                  ⚠️ 오전 10시 이후
                </button>
              </div>
              {addForm.absence_type === "sick" && addForm.notification_time === "after_10am" && (
                <p className="mt-2 text-[11px] text-red-700 bg-red-50 p-2 rounded border border-red-200">
                  🚫 병결 오전 10시 이후 통보는 <b>보강 불가</b> 자동 처리됩니다 (약관 제5조 2항).
                </p>
              )}
            </div>

            {/* 자동 계산 미리보기 */}
            <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs text-slate-600">📆 <b>보강 만료일 자동 계산</b>: {addForm.absence_date} + 30일</div>
              <div className="text-sm font-bold text-slate-800 mt-1">
                → {new Date(new Date(addForm.absence_date).getTime() + 30 * 86400000).toISOString().slice(0, 10)}
              </div>
            </div>

            {/* 액션 */}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm">
                취소
              </button>
              <button onClick={addAbsenceRecord} disabled={saving}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                {saving ? "저장 중..." : "결석 등록"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 안내 문구 */}
      <div className="mt-2 p-3 bg-blue-50 rounded-lg text-[11px] text-blue-800 border border-blue-200">
        💡 <b>약관 제5조</b>: 개인사정 결석은 1일 전 사전 고지, 병결은 당일 오전 10시 이전 통보 건에 한해 보강이 가능합니다.
        보강은 결석일 + 30일 이내에 완료해야 하며, 기한 초과 시 자동 소멸(차감)됩니다.
        보강 예약 슬롯은 재변경이 불가능하며, 당일 결석 시 즉시 차감 처리됩니다.
      </div>
    </div>
  );
}
