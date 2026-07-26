"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import HomeButton from "@/components/HomeButton";
import { FileCheck, Plus, X, Check, Ban, Clock, Edit2, Trash2, RotateCcw } from "lucide-react";

// ✅ v3.20.15: 결재 유형을 휴가 + 물품구매 + 기타로 확장
const CATEGORIES = [
  { v: "leave",    label: "휴가 신청",    icon: "🏖️" },
  { v: "purchase", label: "물품 구매",    icon: "🛒" },
  { v: "expense",  label: "지출 결재",    icon: "💸" },
  { v: "other",    label: "기타 결재",    icon: "📄" },
];
const TYPES = [
  // 휴가 관련
  { v: "annual",       label: "연차",       cat: "leave",    color: "bg-blue-100 text-blue-700" },
  { v: "sick",         label: "병가",       cat: "leave",    color: "bg-red-100 text-red-700" },
  { v: "personal",     label: "개인휴가",    cat: "leave",    color: "bg-purple-100 text-purple-700" },
  { v: "compensatory", label: "보상휴가",    cat: "leave",    color: "bg-emerald-100 text-emerald-700" },
  // 물품구매
  { v: "office",       label: "사무용품",    cat: "purchase", color: "bg-cyan-100 text-cyan-700" },
  { v: "equipment",    label: "장비/비품",   cat: "purchase", color: "bg-indigo-100 text-indigo-700" },
  { v: "supplies",     label: "수업용품",    cat: "purchase", color: "bg-teal-100 text-teal-700" },
  { v: "marketing",    label: "마케팅/홍보", cat: "purchase", color: "bg-pink-100 text-pink-700" },
  // 지출 결재
  { v: "reimburse",    label: "경비 정산",    cat: "expense",  color: "bg-amber-100 text-amber-700" },
  { v: "business",     label: "출장/외출",    cat: "expense",  color: "bg-orange-100 text-orange-700" },
  // 기타
  { v: "other",        label: "기타",       cat: "other",    color: "bg-gray-100 text-gray-700" },
];
const STATUS = {
  pending:  { label: "대기중", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  approved: { label: "승인",   color: "bg-green-100 text-green-700 border-green-300" },
  rejected: { label: "반려",   color: "bg-red-100 text-red-700 border-red-300" },
  canceled: { label: "취소",   color: "bg-gray-100 text-gray-600 border-gray-300" },
};

export default function LeavePage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isDirector, setIsDirector] = useState(false);
  const [editReq, setEditReq] = useState<any>(null);
  const [form, setForm] = useState<any>({
    staff_id: "",
    category: "leave", leave_type: "annual",
    start_date: new Date().toISOString().slice(0,10),
    end_date: new Date().toISOString().slice(0,10),
    reason: "",
    // ✅ v3.20.15: 물품구매/지출 결재 필드
    purchase_amount: 0, purchase_item: "", vendor: "", receipt_url: "",
  });

  useEffect(() => {
    loadAll();
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user?.email) { setIsDirector(true); return; }
      const { data: staffRow } = await supabase.from("staff").select("role").eq("email", userData.user.email).maybeSingle();
      setIsDirector(!staffRow || staffRow.role === "director");
    })();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [rRes, sRes] = await Promise.all([
      supabase.from("leave_requests").select("*, staff:staff_id(name, role)").order("created_at", { ascending: false }),
      supabase.from("staff").select("*").order("name"),
    ]);
    setRequests(rRes.data || []);
    setStaff(sRes.data || []);
    setLoading(false);
  }

  async function submitRequest() {
    if (!form.staff_id) return alert("신청자를 선택해 주세요");
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const days = Math.round((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000) + 1;

    // ✅ v3.20.15: category·purchase_* 필드 포함, 없는 컴럼은 자동 폴백
    const basePayload: any = {
      staff_id: form.staff_id,
      category: form.category,
      leave_type: form.leave_type,
      start_date: form.start_date,
      end_date: form.end_date,
      days,
      reason: form.reason || null,
      purchase_amount: Number(form.purchase_amount) || 0,
      purchase_item: form.purchase_item || null,
      vendor: form.vendor || null,
      receipt_url: form.receipt_url || null,
    };

    async function upsertWithFallback(op: "insert" | "update") {
      const payload: any = op === "insert" ? { ...basePayload, org_id: orgId, status: "pending" } : { ...basePayload };
      for (let i = 0; i < 8; i++) {
        const q = supabase.from("leave_requests");
        const { error } = op === "update"
          ? await q.update(payload).eq("id", editReq.id).select()
          : await q.insert(payload).select();
        if (!error) return null;
        const m = (error.message || "").match(/column "([^"]+)"/i);
        if (m?.[1] && m[1] in payload) { delete payload[m[1]]; continue; }
        return error;
      }
      return new Error("컴럼 폴백 수 초과");
    }

    const err = editReq?.id ? await upsertWithFallback("update") : await upsertWithFallback("insert");
    if (err) return alert(`❌ ${editReq?.id ? "수정" : "신청"} 실패: ${err.message}\n\n💡 SQL 실행 필요: AQUNOTE_V32015_STAFF_TRIGGER_FIX.sql`);

    setShowModal(false);
    setEditReq(null);
    setForm({ staff_id: "", category: "leave", leave_type: "annual",
      start_date: new Date().toISOString().slice(0,10),
      end_date: new Date().toISOString().slice(0,10),
      reason: "",
      purchase_amount: 0, purchase_item: "", vendor: "", receipt_url: "" });
    await loadAll();
  }

  function openEdit(r: any) {
    if (!isDirector) return alert("원장만 수정할 수 있습니다");
    setEditReq(r);
    setForm({
      staff_id: r.staff_id,
      category: r.category || "leave",
      leave_type: r.leave_type,
      start_date: r.start_date, end_date: r.end_date, reason: r.reason || "",
      purchase_amount: r.purchase_amount || 0,
      purchase_item: r.purchase_item || "",
      vendor: r.vendor || "",
      receipt_url: r.receipt_url || "",
    });
    setShowModal(true);
  }

  async function deleteRequest(r: any) {
    if (!isDirector) return alert("원장만 삭제할 수 있습니다");
    if (!confirm(`${r.staff?.name} 님의 ${r.start_date} 휴가 신청을 완전 삭제하시겠습니까?`)) return;
    const { error, data } = await supabase.from("leave_requests").delete().eq("id", r.id).select();
    if (error) return alert("삭제 실패: " + error.message);
    if (!data || data.length === 0) {
      alert("❌ 삭제되지 않음! Supabase RLS 정책 확인 필요 (AQUNOTE_FIX_RLS_UPDATE.sql 재실행)");
      return;
    }
    await loadAll();
  }

  async function revertToPending(id: string) {
    if (!isDirector) return alert("원장만 수정할 수 있습니다");
    await supabase.from("leave_requests").update({ status: "pending", approved_at: null, reject_reason: null }).eq("id", id);
    await loadAll();
  }

  async function approve(id: string) {
    await supabase.from("leave_requests").update({
      status: "approved",
      approved_at: new Date().toISOString(),
    }).eq("id", id);
    await loadAll();
  }
  async function reject(id: string) {
    const reason = prompt("반려 사유:");
    if (reason === null) return;
    await supabase.from("leave_requests").update({
      status: "rejected",
      reject_reason: reason,
    }).eq("id", id);
    await loadAll();
  }
  async function cancel(id: string) {
    if (!confirm("이 요청을 취소할까요?")) return;
    await supabase.from("leave_requests").update({ status: "canceled" }).eq("id", id);
    await loadAll();
  }

  const pending = requests.filter(r => r.status === "pending");
  const approved = requests.filter(r => r.status === "approved");

  return (
    <main className="max-w-5xl mx-auto px-3 md:px-6 py-6 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
          <FileCheck className="w-6 h-6 md:w-7 md:h-7 text-emerald-500" /> 휴가 · 전자결재
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setShowModal(true)}
            className="bg-aqu-600 hover:bg-aqu-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1">
            <Plus className="w-4 h-4" /> 휴가 신청
          </button>
          <HomeButton />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <KPI label="대기중" val={pending.length + "건"} color="text-yellow-600" />
        <KPI label="이번달 승인" val={approved.filter(r => r.start_date?.startsWith(new Date().toISOString().slice(0,7))).length + "건"} color="text-green-600" />
        <KPI label="전체 요청" val={requests.length + "건"} color="text-aqu-700" />
      </div>

      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
        <div className="p-3 border-b border-gray-100 font-bold text-aqu-900">신청 목록</div>
        {loading ? (
          <div className="p-6 text-center text-gray-500">로딩...</div>
        ) : requests.length === 0 ? (
          <div className="p-10 text-center text-gray-400">신청 내역이 없습니다</div>
        ) : (
          <div className="divide-y">
            {requests.map(r => {
              const t = TYPES.find(x => x.v === r.leave_type);
              const s = STATUS[r.status as keyof typeof STATUS];
              return (
                <div key={r.id} className="p-3 md:p-4 flex flex-wrap items-center gap-2 hover:bg-aqu-50/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded border ${s.color}`}>{s.label}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded ${t?.color}`}>{t?.label}</span>
                      <span className="font-medium text-sm">{r.staff?.name}</span>
                      <span className="text-xs text-gray-500">({r.staff?.role})</span>
                    </div>
                    <div className="text-sm text-gray-700">
                      📅 {r.start_date} ~ {r.end_date} <b>({r.days}일)</b>
                    </div>
                    {r.reason && <div className="text-xs text-gray-500 mt-0.5">💬 {r.reason}</div>}
                    {r.reject_reason && <div className="text-xs text-red-500 mt-0.5">❌ 반려: {r.reject_reason}</div>}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {r.status === "pending" && (
                      <>
                        <button onClick={() => approve(r.id)}
                          className="text-xs px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded flex items-center gap-1">
                          <Check className="w-3 h-3" /> 승인
                        </button>
                        <button onClick={() => reject(r.id)}
                          className="text-xs px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded flex items-center gap-1">
                          <Ban className="w-3 h-3" /> 반려
                        </button>
                        <button onClick={() => cancel(r.id)}
                          className="text-xs px-2 py-1 border border-gray-200 rounded">취소</button>
                      </>
                    )}
                    {isDirector && (
                      <>
                        {r.status !== "pending" && (
                          <button onClick={() => revertToPending(r.id)}
                            className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded flex items-center gap-1"
                            title="대기중으로 되돌리기">
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                        <button onClick={() => openEdit(r)}
                          className="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded flex items-center gap-1"
                          title="수정">
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button onClick={() => deleteRequest(r)}
                          className="text-xs px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded flex items-center gap-1"
                          title="완전 삭제">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3" onClick={() => { setShowModal(false); setEditReq(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-aqu-900">📝 {editReq ? "결재 신청 수정" : "결재 신청"}</h2>
              <button onClick={() => { setShowModal(false); setEditReq(null); }}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              {/* ✅ v3.20.15: category 탭 */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">결재 유형</label>
                <div className="grid grid-cols-4 gap-1">
                  {CATEGORIES.map(c => (
                    <button key={c.v} onClick={() => {
                      const firstType = TYPES.find(t => t.cat === c.v);
                      setForm({ ...form, category: c.v, leave_type: firstType?.v || "other" });
                    }}
                      className={`py-1.5 rounded text-xs border ${form.category === c.v ? "bg-aqu-600 text-white font-bold border-transparent" : "bg-white border-gray-200 text-gray-600"}`}>
                      {c.icon} {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">신청자 *</label>
                <select value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="">-- 선택 --</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">세부 종류</label>
                <div className="grid grid-cols-3 gap-1">
                  {TYPES.filter(t => t.cat === form.category).map(t => (
                    <button key={t.v} onClick={() => setForm({ ...form, leave_type: t.v })}
                      className={`py-1.5 rounded text-xs border ${form.leave_type === t.v ? t.color + " font-bold border-transparent" : "bg-white border-gray-200"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ✅ v3.20.15: 물품구매 / 지출 결재 전용 필드 */}
              {(form.category === "purchase" || form.category === "expense") && (
                <div className="border-2 border-orange-100 bg-orange-50/30 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-bold text-orange-800">🛒 {form.category === "purchase" ? "구매 정보" : "지출 정보"}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 mb-1 block">품목내역 *</label>
                      <input type="text" value={form.purchase_item} onChange={e => setForm({ ...form, purchase_item: e.target.value })}
                        placeholder="예: 오리가리 보드마커 20개"
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 mb-1 block">금액 (원) *</label>
                      <input type="number" value={form.purchase_amount} onChange={e => setForm({ ...form, purchase_amount: Number(e.target.value) })}
                        step={1000} className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-right" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 mb-1 block">구매처 / 거래처</label>
                      <input type="text" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })}
                        placeholder="예: 쿠팡, 이마트"
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 mb-1 block">영수증 URL / 사진</label>
                      <input type="url" value={form.receipt_url} onChange={e => setForm({ ...form, receipt_url: e.target.value })}
                        placeholder="https://"
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">{form.category === "leave" ? "시작일" : "구매일 / 지출일"}</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">{form.category === "leave" ? "종료일" : "정산 희망일"}</label>
                  <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">사유 / 메모</label>
                <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                  rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                  placeholder={form.category === "purchase" ? "예: 수업용 보드마커 재고 소진" : "사유를 입력해 주세요"} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setShowModal(false); setEditReq(null); }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">취소</button>
              <button onClick={submitRequest} disabled={!form.staff_id}
                className="flex-1 px-4 py-2 bg-aqu-600 hover:bg-aqu-700 text-white rounded-lg text-sm disabled:opacity-50">
                {editReq ? "수정 저장" : "제출"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function KPI({ label, val, color }: any) {
  return (
    <div className="p-3 bg-white rounded-xl border border-aqu-100 text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{val}</div>
    </div>
  );
}
