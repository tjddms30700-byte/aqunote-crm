"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { supabase } from "@/lib/supabase";
import { getActiveBranchId, useBranchWatch } from "@/lib/branchContext";
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
  // ✅ v3.14.1: 뷰 모드 — 기본 출결장 / 태블릿용 사인 출석부
  const [view, setView] = useState<"list" | "sign">("list");
  const [signTarget, setSignTarget] = useState<any | null>(null);

  useEffect(() => { loadAll(); }, [date]);

  async function loadAll() {
    setLoading(true);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().slice(0,10);

    const branchId = getActiveBranchId();
    // ✅ branch_id 필터 (컴럼 미존재 시 폴백)
    const safeQ = async (baseFn: () => any, filterFn: (q: any) => any) => {
      if (!branchId) return await baseFn();
      const r = await filterFn(baseFn());
      if (r.error && (r.error.code === "42703" || r.error.message?.includes("branch_id"))) return await baseFn();
      return r;
    };
    const [sRes, mRes, stRes, aRes] = await Promise.all([
      safeQ(
        () => supabase.from("schedule_slots").select("*").eq("event_date", date).order("time_slot"),
        (q: any) => q.eq("branch_id", branchId).eq("event_date", date).order("time_slot")
      ),
      safeQ(
        () => supabase.from("members").select("id, name, member_type").is("deleted_at", null).order("name"),
        (q: any) => q.eq("branch_id", branchId).is("deleted_at", null).order("name")
      ),
      safeQ(
        () => supabase.from("staff").select("id, name, role, color").order("name"),
        (q: any) => q.eq("branch_id", branchId).order("name")
      ),
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

  /* 저장 - 변경된 항목만 upsert/insert/delete + 회원권 자동차감 */
  async function saveAll() {
    if (changed.size === 0) { alert("변경된 내용이 없습니다"); return; }
    setSaving(true);

    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;

    // 멤버십 로드 (자동차감용)
    const memberIds = Array.from(changed);
    const { data: allMs } = await supabase.from("memberships").select("*")
      .in("member_id", memberIds)
      .or("status.is.null,status.neq.cancelled");

    const errors: string[] = [];
    let deductedCount = 0;
    let restoredCount = 0;

    for (const memberId of memberIds) {
      const draft = drafts[memberId];
      const existing = attendance.find((a: any) => a.member_id === memberId && a.attend_date === date);
      const slot = scheduleSlots.find(s => s.member_id === memberId);

      // 해당 회원의 활성 회원권 (수업일 포함)
      const activeMs = (allMs || [])
        .filter((ms: any) => ms.member_id === memberId)
        .filter((ms: any) => (!ms.start_date || ms.start_date <= date) && (!ms.end_date || ms.end_date >= date))
        .sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""))[0];

      const prevStatus = existing?.status || null;
      const prevCounted = prevStatus === "present" || prevStatus === "sick";
      const newCounted = draft === "present" || draft === "sick";
      const nowIso = new Date().toISOString();

      if (!draft) {
        // 해제 → 삭제 + (이전이 차감되었다면) 회원권 복원
        if (existing) {
          const { error } = await supabase.from("attendance").delete().eq("id", existing.id);
          if (error) errors.push(memberId + ": " + error.message);
          else if (prevCounted && existing.membership_id) {
            const ms = (allMs || []).find((x: any) => x.id === existing.membership_id);
            if (ms) {
              await supabase.from("memberships").update({ used_sessions: Math.max(0, (ms.used_sessions || 0) - 1) }).eq("id", ms.id);
              restoredCount++;
            }
          }
        }
      } else if (existing) {
        // 업데이트
        const patch: any = {
          status: draft,
          slot_id: slot?.id || existing.slot_id,
          saved_at: nowIso,
        };
        // 상태 전환에 따른 회원권 차감/복원
        if (!prevCounted && newCounted && activeMs) {
          await supabase.from("memberships").update({ used_sessions: (activeMs.used_sessions || 0) + 1 }).eq("id", activeMs.id);
          patch.membership_id = activeMs.id;
          patch.deducted_at = nowIso;
          patch.deduction_mode = "auto";
          deductedCount++;
        } else if (prevCounted && !newCounted && existing.membership_id) {
          const ms = (allMs || []).find((x: any) => x.id === existing.membership_id);
          if (ms) {
            await supabase.from("memberships").update({ used_sessions: Math.max(0, (ms.used_sessions || 0) - 1) }).eq("id", ms.id);
            restoredCount++;
          }
          patch.deducted_at = null;
          patch.deduction_mode = null;
        }
        // ✅ v3.13.6: 신규 컴럼 4개가 DB에 없어도 이전 스키마로 재시도 (자동 fallback)
        let up = await supabase.from("attendance").update(patch).eq("id", existing.id);
        if (up.error && (up.error.code === "42703" || up.error.code === "PGRST204" ||
            up.error.message?.includes("column") || up.error.message?.includes("saved_at") ||
            up.error.message?.includes("deducted_at") || up.error.message?.includes("deduction_mode") ||
            up.error.message?.includes("membership_id"))) {
          const legacyPatch: any = { status: draft, slot_id: patch.slot_id };
          up = await supabase.from("attendance").update(legacyPatch).eq("id", existing.id);
        }
        if (up.error) errors.push(memberId + ": " + up.error.message);
      } else {
        // 신규
        const insertPayload: any = {
          org_id: orgId,
          member_id: memberId,
          attend_date: date,
          status: draft,
          slot_id: slot?.id || null,
          time_slot: slot?.time_slot || null,
          saved_at: nowIso,
        };
        if (newCounted && activeMs) {
          await supabase.from("memberships").update({ used_sessions: (activeMs.used_sessions || 0) + 1 }).eq("id", activeMs.id);
          insertPayload.membership_id  = activeMs.id;
          insertPayload.deducted_at    = nowIso;
          insertPayload.deduction_mode = "auto";
          deductedCount++;
        }
        // ✅ v3.13.6: 신규 컴럼 4개가 DB에 없어도 이전 스키마로 재시도 (자동 fallback)
        let ins = await supabase.from("attendance").insert(insertPayload);
        if (ins.error && (ins.error.code === "42703" || ins.error.code === "PGRST204" ||
            ins.error.message?.includes("column") || ins.error.message?.includes("saved_at") ||
            ins.error.message?.includes("deducted_at") || ins.error.message?.includes("deduction_mode") ||
            ins.error.message?.includes("membership_id"))) {
          const legacyPayload: any = {
            org_id: orgId,
            member_id: memberId,
            attend_date: date,
            status: draft,
            slot_id: slot?.id || null,
            time_slot: slot?.time_slot || null,
          };
          ins = await supabase.from("attendance").insert(legacyPayload);
        }
        if (ins.error) errors.push(memberId + ": " + ins.error.message);
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

    // ✅ v3.13.5 버그 수정: 저장 증시 changed 플래그만 초기화 → draft 값은 유지시켜 UI 리셋 방지
    setChanged(new Set());
    setSaving(false);

    if (errors.length > 0) {
      alert("일부 저장 실패:\n" + errors.join("\n"));
    } else {
      const parts: string[] = [`✅ ${changed.size}건 저장 완료`];
      if (deductedCount > 0) parts.push(`회원권 ${deductedCount}회 자동차감`);
      if (restoredCount > 0) parts.push(`${restoredCount}회 복원`);
      parts.push("(시간표에도 자동 반영)");
      alert(parts.join(" · "));
    }
    // 저장 성공 후 무조건 재로드 → 및 상태도 필터링 기준이 달라지지 않도록 loadAll은 유지하되
    // drafts는 loadAll 내에서 유지되어야 함 (이미 저장되었으므로 initDrafts 재적용 = 저장한 값 그대로 복원)
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

      {/* ✅ v3.14.1: 뷰 전환 (출결장 vs 사인입장) */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex bg-white border border-teal-200 rounded-lg p-1 text-xs">
          <button onClick={() => setView("list")}
            className={`px-3 py-1.5 rounded flex items-center gap-1 ${view === "list" ? "bg-teal-600 text-white shadow" : "text-gray-600"}`}>
            📋 출결장
          </button>
          <button onClick={() => setView("sign")}
            className={`px-3 py-1.5 rounded flex items-center gap-1 ${view === "sign" ? "bg-purple-600 text-white shadow" : "text-gray-600"}`}>
            ✍️ 태블릿 사인 입장
          </button>
        </div>
      </div>

      {/* 모드 전환 (대상 회원 범위) */}
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

      {/* ✅ v3.14.1: 사인 입장 모드 */}
      {view === "sign" && (
        <SignInBoard
          date={date}
          members={todayMembers}
          attendance={attendance}
          onOpenSign={(m: any) => setSignTarget(m)}
        />
      )}

      {/* 사인 모달 */}
      {signTarget && (
        <SignaturePadModal
          member={signTarget}
          date={date}
          orgId={null}
          existingAttendance={attendance.find((a: any) => a.member_id === signTarget.id && a.attend_date === date) || null}
          scheduleSlot={scheduleSlots.find((s: any) => s.member_id === signTarget.id) || null}
          onClose={() => setSignTarget(null)}
          onSaved={async () => { setSignTarget(null); await loadAll(); }}
        />
      )}

      {/* KPI (리스트 뷰에서만 표시) */}
      {view === "list" && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3 mb-4">
          <KPI title="대상 회원"    val={stat.total + "명"}     color="text-aqu-700" />
          <KPI title="✓ 출석"      val={stat.present + "명"}   color="text-green-600" />
          <KPI title="✗ 결석"      val={stat.absent + "명"}    color="text-red-600" />
          <KPI title="🏥 병결"     val={stat.sick + "명"}      color="text-orange-600" />
          <KPI title="미체크"       val={stat.unchecked + "명"} color="text-gray-500" />
        </div>
      )}

      {/* Save bar (리스트 뷰에서만) */}
      {view === "list" && changed.size > 0 && (
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

      {view === "list" && (loading ? (
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
                <th className="p-3 text-center font-semibold text-aqu-800">저장/차감</th>
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
                    {/* ✅ v3.13.5: 저장일 / 차감일 / 수동·자동 배지 */}
                    <td className="p-2 text-center text-[10px]">
                      {(() => {
                        const rec = attendance.find((a: any) => a.member_id === m.id && a.attend_date === date);
                        if (!rec) return <span className="text-gray-300">-</span>;
                        const savedAt  = rec.saved_at    ? String(rec.saved_at).slice(5, 16).replace("T", " ")  : (rec.created_at ? String(rec.created_at).slice(5, 16).replace("T", " ") : null);
                        const deducted = rec.deducted_at ? String(rec.deducted_at).slice(5, 16).replace("T", " ") : null;
                        const mode     = rec.deduction_mode || (rec.membership_id ? "auto" : null);
                        return (
                          <div className="flex flex-col items-center gap-0.5">
                            {savedAt && (
                              <div className="text-gray-600">💾 {savedAt}</div>
                            )}
                            {deducted && (
                              <div className="text-orange-600 font-medium">🔻 {deducted}</div>
                            )}
                            {mode && (
                              <span className={`px-1.5 py-0.5 rounded font-semibold ${mode === "auto" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                                {mode === "auto" ? "🤖 자동" : "✋ 수동"}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
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
      ))}

      {/* Bottom save button (모바일 편의) */}
      {view === "list" && changed.size > 0 && (
        <div className="fixed bottom-4 right-4 z-40 md:hidden">
          <button onClick={saveAll} disabled={saving}
            className="px-5 py-3 bg-yellow-500 hover:bg-yellow-600 text-white rounded-full shadow-2xl text-sm font-bold flex items-center gap-1">
            <Save className="w-4 h-4" /> {changed.size}건 저장
          </button>
        </div>
      )}

      {/* 시간표 → 출결 자동 반영 안내 */}
      {view === "list" && (
        <div className="mt-4 p-3 bg-aqu-50/50 border border-aqu-100 rounded-xl text-xs text-aqu-800">
          🔗 <b>연동 정보</b>: 출결을 저장하면 시간표에도 자동으로 반영됩니다 (출석→완료, 결석→노쇼, 병결→병결)
        </div>
      )}
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

/* ✅ v3.14.1: 태블릿 출석부 – 큰 카드로 모든 회원을 나열해 놀고, 학부모/직원이 파드에 사인 */
function SignInBoard({ date, members, attendance, onOpenSign }: any) {
  const [search, setSearch] = useState("");
  const todayRecs = (attendance || []).filter((a: any) => a.attend_date === date);
  const recMap = new Map<string, any>();
  todayRecs.forEach((r: any) => recMap.set(r.member_id, r));

  const filtered = (members || []).filter((m: any) =>
    !search.trim() || (m.name || "").toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="bg-white rounded-2xl shadow-md border border-purple-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-lg font-bold text-purple-700 flex items-center gap-2">
            ✍️ 태블릿 출석부
          </div>
          <div className="text-xs text-gray-500">
            회원 카드를 터치해 사인으로 출석을 기록하세요 (학부모/직원 사인 저장)
          </div>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 회원명 검색..."
          className="px-3 py-2 border border-purple-200 rounded-lg text-sm w-full md:w-64 focus:outline-none focus:ring-2 focus:ring-purple-300"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>표시할 회원이 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((m: any) => {
            const rec = recMap.get(m.id);
            const signed = !!rec?.signature;
            const status = rec?.status;
            const bgClass = signed
              ? "bg-purple-50 border-purple-400"
              : status === "present"
              ? "bg-green-50 border-green-300"
              : status === "absent"
              ? "bg-red-50 border-red-300"
              : status === "sick"
              ? "bg-orange-50 border-orange-300"
              : "bg-white border-gray-200 hover:bg-purple-50";
            return (
              <button
                key={m.id}
                onClick={() => onOpenSign(m)}
                className={`p-4 rounded-2xl border-2 transition-all text-left shadow-sm hover:shadow-md ${bgClass}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-base font-bold text-gray-800 truncate">{m.name}</div>
                  {signed && <span className="text-xs text-purple-600">✓ 사인</span>}
                </div>
                <div className="text-[10px] text-gray-500 mb-2">
                  {m.member_type === "child" ? "🧒 아동" : "👤 성인"}
                  {m.guardian_name ? ` · ${m.guardian_name}` : ""}
                </div>
                <div className="text-xs text-purple-700 font-semibold">
                  {signed ? "사인 수정" : status ? statusMeta(status).label : "터치해서 사인"}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ✅ v3.14.1: 사인패드 모달 (Canvas 기반) */
function SignaturePadModal({ member, date, orgId, existingAttendance, scheduleSlot, onClose, onSaved }: any) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);
  const [status, setStatus] = useState<"present" | "absent" | "sick">(existingAttendance?.status || "present");
  const [signer, setSigner] = useState<"parent" | "self" | "staff">(member?.member_type === "child" ? "parent" : "self");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (existingAttendance?.signature) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, c.width, c.height); setHasStroke(true); };
      img.src = existingAttendance.signature;
    }
  }, [existingAttendance]);

  const getPos = (e: any) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const scaleX = c.width / rect.width;
    const scaleY = c.height / rect.height;
    if (e.touches && e.touches[0]) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const start = (e: any) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDrawing(true);
  };
  const move = (e: any) => {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStroke(true);
  };
  const end = () => setDrawing(false);

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    setHasStroke(false);
  };

  async function save() {
    if (!hasStroke) { alert("사인을 입력해주세요"); return; }
    setSaving(true);
    try {
      const dataUrl = canvasRef.current!.toDataURL("image/png");
      const nowIso = new Date().toISOString();

      let realOrgId = orgId;
      if (!realOrgId) {
        realOrgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      }

      const basePayload: any = {
        status,
        signature: dataUrl,
        signer_role: signer,
        signed_at: nowIso,
        slot_id: scheduleSlot?.id || existingAttendance?.slot_id || null,
        time_slot: scheduleSlot?.time_slot || existingAttendance?.time_slot || null,
      };

      if (existingAttendance) {
        const { error } = await supabase.from("attendance").update(basePayload).eq("id", existingAttendance.id);
        if (error && (error.message?.includes("signature") || error.message?.includes("signer_role") || error.message?.includes("signed_at"))) {
          // 컴럼 미존재 → 안전 재시도
          delete basePayload.signature;
          delete basePayload.signer_role;
          delete basePayload.signed_at;
          await supabase.from("attendance").update(basePayload).eq("id", existingAttendance.id);
          alert("⚠️ DB에 signature 컴럼이 없어 출석만 저장되었습니다.\nSQL: alter table attendance add column signature text, signer_role text, signed_at timestamptz;");
        } else if (error) {
          throw error;
        }
      } else {
        const insertPayload: any = {
          org_id: realOrgId,
          member_id: member.id,
          attend_date: date,
          ...basePayload,
        };
        const { error } = await supabase.from("attendance").insert(insertPayload);
        if (error && (error.message?.includes("signature") || error.message?.includes("signer_role") || error.message?.includes("signed_at"))) {
          delete insertPayload.signature;
          delete insertPayload.signer_role;
          delete insertPayload.signed_at;
          await supabase.from("attendance").insert(insertPayload);
          alert("⚠️ DB에 signature 컴럼이 없어 출석만 저장되었습니다.\nSQL: alter table attendance add column signature text, signer_role text, signed_at timestamptz;");
        } else if (error) {
          throw error;
        }
      }

      // 시간표 상태 동기화
      if (scheduleSlot?.id) {
        const statusMap: Record<string, string> = { present: "done", absent: "noshow", sick: "sick" };
        await supabase.from("schedule_slots").update({ status: statusMap[status] }).eq("id", scheduleSlot.id);
      }

      onSaved && (await onSaved());
    } catch (e: any) {
      alert("저장 실패: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b bg-purple-50 rounded-t-2xl">
          <div>
            <div className="text-lg font-bold text-purple-800">✍️ 출석 사인</div>
            <div className="text-xs text-gray-600">{member?.name} · {date}</div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* 출결 상태 선택 */}
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-2">출결 상태</div>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => setStatus(opt.value as any)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border-2 ${status === opt.value ? opt.color + " border-current" : "bg-white text-gray-500 border-gray-200"}`}>
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 서명자 구분 */}
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-2">서명자</div>
            <div className="flex gap-2">
              {[
                { v: "parent", label: "👪 학부모" },
                { v: "self", label: "🙋 본인" },
                { v: "staff", label: "👨‍🏫 직원" },
              ].map((s) => (
                <button key={s.v} onClick={() => setSigner(s.v as any)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border-2 ${signer === s.v ? "bg-purple-100 text-purple-800 border-purple-400" : "bg-white text-gray-500 border-gray-200"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* 사인 캠버스 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-semibold text-gray-700">사인 입력</div>
              <button onClick={clear} className="text-[11px] px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700">다시 그리기</button>
            </div>
            <canvas
              ref={canvasRef}
              width={640} height={220}
              className="w-full h-[220px] bg-white border-2 border-dashed border-purple-300 rounded-lg touch-none cursor-crosshair"
              onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
              onTouchStart={start} onTouchMove={move} onTouchEnd={end}
            />
            <div className="text-[10px] text-gray-400 mt-1">💡 태블릿에서는 손가락/펄으로 직접 서명해주세요</div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">취소</button>
            <button onClick={save} disabled={saving || !hasStroke}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold">
              {saving ? "저장 중..." : "✓ 서명 완료"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
