"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { supabase } from "@/lib/supabase";
import {
  ClipboardCheck, Home, Calendar, RefreshCw, Save, Check,
  X as XIcon, AlertCircle, User, Clock, Filter, CalendarDays
} from "lucide-react";

/* 3가지 상태만 유지 */
const STATUS_OPTIONS = [
  { value: "present", label: "출석",  color: "bg-green-100 text-green-800 border-green-400 hover:bg-green-200",   icon: "✓" },
  { value: "absent",  label: "결석",  color: "bg-red-100 text-red-800 border-red-400 hover:bg-red-200",           icon: "✗" },
  { value: "sick",    label: "병결",  color: "bg-orange-100 text-orange-800 border-orange-400 hover:bg-orange-200", icon: "🏥" },
];
function statusMeta(s: string) { return STATUS_OPTIONS.find(x => x.value === s); }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function AttendancePage() {
  const [date, setDate]           = useState(todayStr());
  const [scheduleSlots, setSlots] = useState<any[]>([]); // 그날의 시간표 슬롯
  const [members, setMembers]     = useState<any[]>([]);
  const [staff, setStaff]         = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]); // 최근 90일
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  // 편집 중인 상태 저장 (memberId → status)
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [changed, setChanged] = useState<Set<string>>(new Set());

  // 모드: 시간표 연동 (그날 수업이 있는 회원만) OR 전체 회원
  const [mode, setMode] = useState<"schedule" | "all">("schedule");

  useEffect(() => { loadAll(); }, [date]);

  async function loadAll() {
    setLoading(true);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().slice(0,10);

    const [sRes, mRes, stRes, aRes] = await Promise.all([
      supabase.from("schedule_slots").select("*").eq("event_date", date).order("time_slot"),
      supabase.from("members").select("id, name, member_type").is("deleted_at", null).order("name"),
      supabase.from("staff").select("id, name, role, color").order("name"),
      supabase.from("attendance").select("*").gte("attend_date", cutoffStr).order("attend_date", { ascending: false }),
    ]);
    setSlots(sRes.data || []);
    setMembers(mRes.data || []);
    setStaff(stRes.data || []);
    setAttendance(aRes.data || []);
    // 오늘의 기존 출결 → drafts 초기값
    const today = (aRes.data || []).filter((a: any) => a.attend_date === date);
    const dr: Record<string, string> = {};
    today.forEach((a: any) => { dr[a.member_id] = a.status; });
    setDrafts(dr);
    setChanged(new Set());
    setLoading(false);
  }

  /* 오늘 대상 회원 목록 */
  const todayMembers = useMemo(() => {
    if (mode === "all") return members;
    // 시간표 기반: 오늘 수업이 있는 회원만
    const memberIds = new Set(
      scheduleSlots
        .filter(s => s.member_id && (s.event_type === "lesson" || s.event_type === "trial"))
        .map(s => s.member_id)
    );
    return members.filter(m => memberIds.has(m.id));
  }, [scheduleSlots, members, mode]);

  /* 회원별 그날의 시간표 슬롯 매핑 */
  function slotsForMember(memberId: string) {
    return scheduleSlots.filter(s => s.member_id === memberId);
  }
  function staffColorFor(staffId: string) {
    return staff.find(s => s.id === staffId)?.color || "#6b7280";
  }
  function staffNameFor(staffId: string) {
    return staff.find(s => s.id === staffId)?.name || "";
  }

  /* 30일 통계 */
  const memberStats = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0,10);
    return todayMembers.map(m => {
      const recs = attendance.filter((a: any) => a.member_id === m.id && a.attend_date >= cutoffStr);
      const total = recs.length;
      const present = recs.filter(a => a.status === "present").length;
      const absent = recs.filter(a => a.status === "absent").length;
      const sick = recs.filter(a => a.status === "sick").length;
      const rate = total > 0 ? Math.round((present / total) * 100) : 0;
      return { ...m, total, present, absent, sick, rate };
    });
  }, [todayMembers, attendance]);

  function pickStatus(memberId: string, status: string) {
    setDrafts(prev => {
      const currentSaved = attendance.find((a: any) => a.member_id === memberId && a.attend_date === date);
      const newDrafts = { ...prev };
      // 같은 상태 재클릭 → 해제
      if (newDrafts[memberId] === status) {
        delete newDrafts[memberId];
      } else {
        newDrafts[memberId] = status;
      }
      const savedStatus = currentSaved?.status;
      const draftStatus = newDrafts[memberId];
      setChanged(prevSet => {
        const s = new Set(prevSet);
        if (savedStatus === draftStatus) s.delete(memberId);
        else s.add(memberId);
        return s;
      });
      return newDrafts;
    });
  }

  function resetChanges() {
    if (!confirm("변경사항을 초기화합니다")) return;
    const today = attendance.filter((a: any) => a.attend_date === date);
    const dr: Record<string, string> = {};
    today.forEach((a: any) => { dr[a.member_id] = a.status; });
    setDrafts(dr);
    setChanged(new Set());
  }

  /* 저장 - 변경된 항목만 upsert/insert/delete */
  async function saveAll() {
    if (changed.size === 0) { alert("변경된 내용이 없습니다"); return; }
    setSaving(true);

    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;

    const errors: string[] = [];
    for (const memberId of Array.from(changed)) {
      const draft = drafts[memberId];
      const existing = attendance.find((a: any) => a.member_id === memberId && a.attend_date === date);
      const slot = scheduleSlots.find(s => s.member_id === memberId);

      if (!draft) {
        // 해제 → 삭제
        if (existing) {
          const { error } = await supabase.from("attendance").delete().eq("id", existing.id);
          if (error) errors.push(memberId + ": " + error.message);
        }
      } else if (existing) {
        // 업데이트
        const { error } = await supabase.from("attendance")
          .update({ status: draft, slot_id: slot?.id || existing.slot_id })
          .eq("id", existing.id);
        if (error) errors.push(memberId + ": " + error.message);
      } else {
        // 신규
        const { error } = await supabase.from("attendance").insert({
          org_id: orgId,
          member_id: memberId,
          attend_date: date,
          status: draft,
          slot_id: slot?.id || null,
          time_slot: slot?.time_slot || null,
        });
        if (error) errors.push(memberId + ": " + error.message);
      }

      // 시간표에도 상태 동기화 (있는 경우에만)
      if (slot) {
        const statusMap: Record<string, string> = {
          "present": "done",
          "absent": "noshow",
          "sick": "sick",
        };
        const scheduleStatus = draft ? statusMap[draft] : "scheduled";
        await supabase.from("schedule_slots").update({ status: scheduleStatus }).eq("id", slot.id);
      }
    }

    setSaving(false);
    if (errors.length > 0) {
      alert("일부 저장 실패:\n" + errors.join("\n"));
    } else {
      alert(`✅ ${changed.size}건 저장 완료 (시간표에도 자동 반영)`);
    }
    await loadAll();
  }

  const stat = {
    total: todayMembers.length,
    present: Object.values(drafts).filter(v => v === "present").length,
    absent: Object.values(drafts).filter(v => v === "absent").length,
    sick: Object.values(drafts).filter(v => v === "sick").length,
    unchecked: todayMembers.length - Object.keys(drafts).length,
  };

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 md:gap-3">
          <HomeButton />
          <span className="text-gray-300">/</span>
          <h1 className="text-xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 md:w-7 md:h-7 text-teal-500" /> 출결 관리
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
          <button onClick={() => setDate(todayStr())}
            className="px-3 py-2 bg-aqu-50 border border-aqu-200 text-aqu-700 rounded-lg text-xs hover:bg-aqu-100">
            오늘
          </button>
        </div>
      </div>

      {/* 모드 전환 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex bg-white border border-aqu-100 rounded-lg p-1 text-xs">
          <button onClick={() => setMode("schedule")}
            className={`px-3 py-1.5 rounded flex items-center gap-1 ${mode === "schedule" ? "bg-aqu-600 text-white" : "text-gray-600"}`}>
            <CalendarDays className="w-3.5 h-3.5" /> 이 날 수업 회원만
          </button>
          <button onClick={() => setMode("all")}
            className={`px-3 py-1.5 rounded flex items-center gap-1 ${mode === "all" ? "bg-aqu-600 text-white" : "text-gray-600"}`}>
            <User className="w-3.5 h-3.5" /> 전체 회원
          </button>
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-1">
          {mode === "schedule" ? (
            <>💡 <b>{date}</b> 시간표에 예약된 회원 <b>{todayMembers.length}명</b></>
          ) : (
            <>💡 전체 활성 회원 <b>{todayMembers.length}명</b></>
          )}
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3 mb-4">
        <KPI title="대상 회원"    val={stat.total + "명"}     color="text-aqu-700" />
        <KPI title="✓ 출석"      val={stat.present + "명"}   color="text-green-600" />
        <KPI title="✗ 결석"      val={stat.absent + "명"}    color="text-red-600" />
        <KPI title="🏥 병결"     val={stat.sick + "명"}      color="text-orange-600" />
        <KPI title="미체크"       val={stat.unchecked + "명"} color="text-gray-500" />
      </div>

      {/* Save bar */}
      {changed.size > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border-2 border-yellow-300 rounded-xl flex items-center justify-between animate-pulse">
          <div className="text-sm text-yellow-900 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <b>{changed.size}건</b> 변경 · 저장하지 않으면 사라집니다
          </div>
          <div className="flex gap-2">
            <button onClick={resetChanges}
              className="px-3 py-1.5 bg-white border border-yellow-300 text-yellow-700 rounded-lg text-xs hover:bg-yellow-50 flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" /> 되돌리기
            </button>
            <button onClick={saveAll} disabled={saving}
              className="px-4 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 disabled:opacity-50">
              <Save className="w-3.5 h-3.5" /> {saving ? "저장 중..." : "저장하기"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-500">로딩 중...</div>
      ) : memberStats.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-aqu-100 text-gray-400">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-2 opacity-30" />
          {mode === "schedule" ? (
            <>
              <p>이 날 시간표에 예약된 수업이 없습니다.</p>
              <Link href="/schedule" className="text-aqu-600 hover:underline text-sm">
                → 시간표에서 예약 추가
              </Link>
            </>
          ) : <p>회원이 없습니다.</p>}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
          {/* Mobile card view */}
          <div className="md:hidden divide-y divide-gray-100">
            {memberStats.map(m => {
              const cur = drafts[m.id];
              const isChanged = changed.has(m.id);
              const mSlots = slotsForMember(m.id);
              return (
                <div key={m.id} className={`p-3 ${isChanged ? "bg-yellow-50/50" : ""}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <Link href={`/members/${m.id}`} className="font-medium text-aqu-800 hover:underline">
                        {m.name}
                      </Link>
                      <span className="ml-2 text-[10px] text-gray-500">
                        {m.member_type === "child" ? "아동" : "성인"}
                      </span>
                      {isChanged && <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-yellow-200 text-yellow-800 rounded">변경</span>}
                    </div>
                    <div className="text-[10px] text-gray-500">30일: {m.rate}%</div>
                  </div>
                  {/* 그날의 수업 정보 */}
                  {mSlots.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {mSlots.map(s => (
                        <span key={s.id} className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
                          style={{ backgroundColor: staffColorFor(s.staff_id) + "20", color: staffColorFor(s.staff_id), border: `1px solid ${staffColorFor(s.staff_id)}` }}>
                          <Clock className="w-2.5 h-2.5" /> {s.time_slot?.slice(0,5)} · {staffNameFor(s.staff_id) || "미배정"}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-1">
                    {STATUS_OPTIONS.map(s => (
                      <button key={s.value} onClick={() => pickStatus(m.id, s.value)}
                        className={`text-xs py-2 rounded border-2 transition font-medium ${cur === s.value ? s.color + " font-bold" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                        {s.icon} {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <table className="w-full text-sm hidden md:table">
            <thead className="bg-aqu-50 border-b border-aqu-100">
              <tr>
                <th className="p-3 text-left font-semibold text-aqu-800">회원</th>
                <th className="p-3 text-left font-semibold text-aqu-800">유형</th>
                <th className="p-3 text-left font-semibold text-aqu-800">이 날 수업</th>
                <th className="p-3 text-center font-semibold text-aqu-800" colSpan={3}>{date} 출결</th>
                <th className="p-3 text-center font-semibold text-aqu-800">30일 출석률</th>
              </tr>
            </thead>
            <tbody>
              {memberStats.map(m => {
                const cur = drafts[m.id];
                const isChanged = changed.has(m.id);
                const mSlots = slotsForMember(m.id);
                return (
                  <tr key={m.id} className={`border-b border-gray-100 ${isChanged ? "bg-yellow-50/70" : "hover:bg-aqu-50/30"}`}>
                    <td className="p-3">
                      <Link href={`/members/${m.id}`} className="text-aqu-700 hover:underline font-medium">
                        {m.name}
                      </Link>
                      {isChanged && <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-yellow-200 text-yellow-800 rounded">변경</span>}
                    </td>
                    <td className="p-3 text-gray-600 text-xs">{m.member_type === "child" ? "아동" : "성인"}</td>
                    <td className="p-3">
                      {mSlots.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {mSlots.map(s => (
                            <span key={s.id} className="text-[10px] px-1.5 py-1 rounded inline-flex items-center gap-1"
                              style={{ backgroundColor: staffColorFor(s.staff_id) + "20", color: staffColorFor(s.staff_id), border: `1px solid ${staffColorFor(s.staff_id)}` }}>
                              <Clock className="w-2.5 h-2.5" /> {s.time_slot?.slice(0,5)}
                              {staffNameFor(s.staff_id) && ` · ${staffNameFor(s.staff_id)}`}
                            </span>
                          ))}
                        </div>
                      ) : <span className="text-[10px] text-gray-400">예약 없음</span>}
                    </td>
                    {STATUS_OPTIONS.map(s => (
                      <td key={s.value} className="p-1 text-center">
                        <button onClick={() => pickStatus(m.id, s.value)}
                          className={`w-full text-xs px-2 py-1.5 rounded border-2 transition font-medium ${cur === s.value ? s.color + " font-bold shadow-sm" : "bg-white border-gray-200 text-gray-400 hover:bg-gray-50"}`}>
                          {s.icon} {s.label}
                        </button>
                      </td>
                    ))}
                    <td className="p-3 text-center">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div className={`h-full rounded-full ${m.rate >= 80 ? "bg-green-500" : m.rate >= 50 ? "bg-yellow-500" : "bg-red-400"}`}
                               style={{ width: `${m.rate}%` }} />
                        </div>
                        <span className="text-xs font-bold text-gray-700 w-8">{m.rate}%</span>
                      </div>
                      <div className="text-[10px] text-gray-400">{m.present}/{m.total}회</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom save button (모바일 편의) */}
      {changed.size > 0 && (
        <div className="fixed bottom-4 right-4 z-40 md:hidden">
          <button onClick={saveAll} disabled={saving}
            className="px-5 py-3 bg-yellow-500 hover:bg-yellow-600 text-white rounded-full shadow-2xl text-sm font-bold flex items-center gap-1">
            <Save className="w-4 h-4" /> {changed.size}건 저장
          </button>
        </div>
      )}

      {/* 시간표 → 출결 자동 반영 안내 */}
      <div className="mt-4 p-3 bg-aqu-50/50 border border-aqu-100 rounded-xl text-xs text-aqu-800">
        🔗 <b>연동 정보</b>: 출결을 저장하면 시간표에도 자동으로 반영됩니다 (출석→완료, 결석→노쇼, 병결→병결)
      </div>
    </main>
  );
}

function KPI({ title, val, color }: any) {
  return (
    <div className="bg-white p-2 md:p-3 rounded-xl shadow-sm border border-aqu-100 text-center">
      <div className="text-[10px] md:text-xs text-gray-500">{title}</div>
      <div className={`text-base md:text-xl font-bold ${color}`}>{val}</div>
    </div>
  );
}
