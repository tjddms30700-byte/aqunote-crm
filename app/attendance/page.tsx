"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { supabase } from "@/lib/supabase";
import { getActiveBranchId, useBranchWatch } from "@/lib/branchContext";
import {
  ClipboardCheck, Home, Calendar, RefreshCw, Save, Check,
  X as XIcon, AlertCircle, User, Clock, Filter, CalendarDays,
  FileSignature, Printer, Waves
} from "lucide-react";

/* ✅ v3.20.0: 수업을 하지 않은 상태(결석/병결/개인사정)는 회색 계열로 통일 */
const STATUS_OPTIONS = [
  { value: "present",  label: "출석",     color: "bg-green-100 text-green-800 border-green-400 hover:bg-green-200", icon: "✓" },
  { value: "absent",   label: "결석",     color: "bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200",   icon: "✗" },
  { value: "sick",     label: "병결",     color: "bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200",   icon: "🏥" },
  { value: "personal", label: "개인사정", color: "bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200",   icon: "📝" },
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
    // v3.23.0: slot 단위 drafts 초기화 (slotKey = memberId__timeSlot)
    const today = (aRes.data || []).filter((a: any) => normDate(a.attend_date) === date);
    const dr: Record<string, string> = {};
    today.forEach((a: any) => {
      // time_slot이 있으면 slotKey, 없으면 회원 단일 키로 폴백
      const key = a.time_slot ? `${a.member_id}__${a.time_slot}` : a.member_id;
      dr[key] = a.status;
    });
    setDrafts(dr);
    setChanged(new Set());
    setLoading(false);
  }

  /* 오늘 대상 회원 목록 – v3.21.1: 시간표 예약 시각순 정렬 */
  const todayMembers = useMemo(() => {
    // time_slot 정규화 helper: "09:30", "9:30", "HH:MM-HH:MM" 등 모두 분 단위 숫자로
    const toMinutes = (ts: any): number => {
      if (ts === null || ts === undefined) return 9999;
      const s = String(ts).trim();
      // "HH:MM-HH:MM" → 암젠 HH:MM
      const m = s.match(/(\d{1,2}):(\d{2})/);
      if (!m) return 9999;
      return Number(m[1]) * 60 + Number(m[2]);
    };
    // 회원별 최초 수업 시각(분) 매핑
    const firstSlotMin = new Map<string, number>();
    scheduleSlots.forEach((s: any) => {
      if (!s.member_id) return;
      const mm = toMinutes(s.time_slot ?? s.start_time ?? s.start_at);
      const prev = firstSlotMin.get(s.member_id);
      if (prev === undefined || mm < prev) firstSlotMin.set(s.member_id, mm);
    });

    if (mode === "all") {
      // 전체 회원: 예약이 있으면 시각순, 없으면 뒤에 이름순으로
      return [...members].sort((a: any, b: any) => {
        const av = firstSlotMin.get(a.id) ?? 9999;
        const bv = firstSlotMin.get(b.id) ?? 9999;
        if (av !== bv) return av - bv;
        return (a.name || "").localeCompare(b.name || "", "ko");
      });
    }
    // 시간표 기반: 오늘 수업이 있는 회원만 + 시각순 정렬
    const memberIds = new Set(
      scheduleSlots
        .filter((s: any) => s.member_id && (s.event_type === "lesson" || s.event_type === "trial"))
        .map((s: any) => s.member_id)
    );
    return members
      .filter(m => memberIds.has(m.id))
      .sort((a: any, b: any) => {
        const av = firstSlotMin.get(a.id) ?? 9999;
        const bv = firstSlotMin.get(b.id) ?? 9999;
        if (av !== bv) return av - bv;
        return (a.name || "").localeCompare(b.name || "", "ko");
      });
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
      const recs = attendance.filter((a: any) => a.member_id === m.id && normDate(a.attend_date) >= cutoffStr);
      const total = recs.length;
      const present = recs.filter(a => a.status === "present").length;
      const absent = recs.filter(a => a.status === "absent").length;
      const sick = recs.filter(a => a.status === "sick").length;
      const rate = total > 0 ? Math.round((present / total) * 100) : 0;
      return { ...m, total, present, absent, sick, rate };
    });
  }, [todayMembers, attendance]);

  // v3.23.0: slot 단위 상태 지정 - slotKey(memberId__timeSlot) 기반
  function pickStatus(memberId: string, status: string, timeSlot?: string) {
    const slotKey = timeSlot ? `${memberId}__${timeSlot}` : memberId;
    setDrafts(prev => {
      const currentSaved = attendance.find((a: any) =>
        a.member_id === memberId && normDate(a.attend_date) === date &&
        (timeSlot ? a.time_slot === timeSlot : true)
      );
      const newDrafts = { ...prev };
      if (newDrafts[slotKey] === status) {
        delete newDrafts[slotKey];
      } else {
        newDrafts[slotKey] = status;
      }
      const savedStatus = currentSaved?.status;
      const draftStatus = newDrafts[slotKey];
      setChanged(prevSet => {
        const s = new Set(prevSet);
        if (savedStatus === draftStatus) s.delete(slotKey);
        else s.add(slotKey);
        return s;
      });
      return newDrafts;
    });
  }

  function resetChanges() {
    if (!confirm("변경사항을 초기화합니다")) return;
    const today = attendance.filter((a: any) => normDate(a.attend_date) === date);
    const dr: Record<string, string> = {};
    today.forEach((a: any) => {
      const key = a.time_slot ? `${a.member_id}__${a.time_slot}` : a.member_id;
      dr[key] = a.status;
    });
    setDrafts(dr);
    setChanged(new Set());
  }

  /* v3.23.0: 저장 - slot 단위로 관리 → 연타임 시 slot 개수만큼 회원권 차감 */
  async function saveAll() {
    if (changed.size === 0) { alert("변경된 내용이 없습니다"); return; }
    setSaving(true);

    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;

    // changed는 slotKey(memberId__timeSlot) Set - memberId 추출
    const slotKeys = Array.from(changed);
    const memberIdsInvolved = Array.from(new Set(slotKeys.map(k => k.split("__")[0])));

    // 멤버십 로드 (자동차감용)
    const { data: allMs } = await supabase.from("memberships").select("*")
      .in("member_id", memberIdsInvolved)
      .or("status.is.null,status.neq.cancelled");

    const errors: string[] = [];
    let deductedCount = 0;
    let restoredCount = 0;

    // v3.23.0: 회원권 차감 상태 실시간 트래킹 (연타임 차감 시 used_sessions 누적)
    const msUsedCache = new Map<string, number>();
    (allMs || []).forEach((ms: any) => msUsedCache.set(ms.id, ms.used_sessions || 0));

    for (const slotKey of slotKeys) {
      const parts = slotKey.split("__");
      const memberId = parts[0];
      const timeSlot = parts.length > 1 ? parts.slice(1).join("__") : null;
      const draft = drafts[slotKey];
      // slot 단위 기존 레코드 - time_slot 매칭
      const existing = attendance.find((a: any) =>
        a.member_id === memberId && normDate(a.attend_date) === date &&
        (timeSlot ? a.time_slot === timeSlot : !a.time_slot)
      );
      // slot 매칭
      const slot = timeSlot
        ? scheduleSlots.find(s => s.member_id === memberId && s.time_slot === timeSlot)
        : scheduleSlots.find(s => s.member_id === memberId);

      // 해당 회원의 활성 회원권 (수업일 포함)
      const activeMs = (allMs || [])
        .filter((ms: any) => ms.member_id === memberId)
        .filter((ms: any) => (!ms.start_date || ms.start_date <= date) && (!ms.end_date || ms.end_date >= date))
        .sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""))[0];

      const prevStatus = existing?.status || null;
      // v3.21.2: 회원권 차감 기준 정정 – 출석(present) + 결석/노쇼(absent)만 -1 차감
      //   병결(sick)·개인사정(personal)은 차감 대상 아님
      const prevCounted = prevStatus === "present" || prevStatus === "absent";
      const newCounted  = draft === "present"       || draft === "absent";
      const nowIso = new Date().toISOString();

      if (!draft) {
        // 해제 → 삭제 + (이전이 차감되었다면) 회원권 복원
        if (existing) {
          // ✅ v3.25.0: Hard Delete (트리거가 회원권 되돌림 자동 처리)
          let { error } = await supabase.from("attendance").delete().eq("id", existing.id);
          if (error && (error as any).code === "42703") {
            const hd = await supabase.from("attendance").delete().eq("id", existing.id);
            error = hd.error as any;
          }
          if (error) errors.push(memberId + ": " + error.message);
          else if (prevCounted && existing.membership_id) {
            const ms = (allMs || []).find((x: any) => x.id === existing.membership_id);
            if (ms) {
              const curUsed = msUsedCache.get(ms.id) ?? (ms.used_sessions || 0);
              const newUsed = Math.max(0, curUsed - 1);
              await supabase.from("memberships").update({ used_sessions: newUsed }).eq("id", ms.id);
              msUsedCache.set(ms.id, newUsed);
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
        // v3.23.0: 상태 전환 시 회원권 차감/복원 (msUsedCache로 연타임 실시간 트래킹)
        if (!prevCounted && newCounted && activeMs) {
          const curUsed = msUsedCache.get(activeMs.id) ?? (activeMs.used_sessions || 0);
          const newUsed = curUsed + 1;
          await supabase.from("memberships").update({ used_sessions: newUsed }).eq("id", activeMs.id);
          msUsedCache.set(activeMs.id, newUsed);
          patch.membership_id = activeMs.id;
          patch.deducted_at = nowIso;
          patch.deduction_mode = "auto";
          deductedCount++;
        } else if (prevCounted && !newCounted && existing.membership_id) {
          const ms = (allMs || []).find((x: any) => x.id === existing.membership_id);
          if (ms) {
            const curUsed = msUsedCache.get(ms.id) ?? (ms.used_sessions || 0);
            const newUsed = Math.max(0, curUsed - 1);
            await supabase.from("memberships").update({ used_sessions: newUsed }).eq("id", ms.id);
            msUsedCache.set(ms.id, newUsed);
            restoredCount++;
          }
          patch.deducted_at = null;
          patch.deduction_mode = null;
        }
        // v3.23.2: 정규식 기반 자동 컴럼 drop 폴백 (최대 10회) - 어떤 컴럼이 없어도 저장 성공
        let patchTry: any = { ...patch };
        let up: any = { error: null };
        for (let i = 0; i < 10; i++) {
          up = await supabase.from("attendance").update(patchTry).eq("id", existing.id);
          if (!up.error) break;
          const m = /'([^']+)' column|column "([^"]+)"|Could not find the '([^']+)'/i.exec(up.error.message || "");
          const missing = m?.[1] || m?.[2] || m?.[3];
          if (missing && missing in patchTry) {
            const { [missing]: _drop, ...rest } = patchTry;
            patchTry = { ...rest };
            continue;
          }
          break;
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
          const curUsed = msUsedCache.get(activeMs.id) ?? (activeMs.used_sessions || 0);
          const newUsed = curUsed + 1;
          await supabase.from("memberships").update({ used_sessions: newUsed }).eq("id", activeMs.id);
          msUsedCache.set(activeMs.id, newUsed);
          insertPayload.membership_id  = activeMs.id;
          insertPayload.deducted_at    = nowIso;
          insertPayload.deduction_mode = "auto";
          deductedCount++;
        }
        // v3.23.2: INSERT 자동 컴럼 drop 폴백 (최대 10회) - time_slot/saved_at/deducted_at 등 어떤 컴럼이 없어도 저장 성공
        let payloadTry: any = { ...insertPayload };
        let ins: any = { error: null };
        for (let i = 0; i < 10; i++) {
          ins = await supabase.from("attendance").insert(payloadTry);
          if (!ins.error) break;
          const m = /'([^']+)' column|column "([^"]+)"|Could not find the '([^']+)'/i.exec(ins.error.message || "");
          const missing = m?.[1] || m?.[2] || m?.[3];
          if (missing && missing in payloadTry) {
            const { [missing]: _drop, ...rest } = payloadTry;
            payloadTry = { ...rest };
            continue;
          }
          break;
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

  // v3.23.0: slot 단위 통계 (연타임은 각각 카운트)
  const stat = {
    total: scheduleSlots.filter(s => s.member_id && (s.event_type === "lesson" || s.event_type === "trial" || s.event_type === "makeup")).length,
    present: Object.values(drafts).filter(v => v === "present").length,
    absent: Object.values(drafts).filter(v => v === "absent").length,
    sick: Object.values(drafts).filter(v => v === "sick").length,
    unchecked: Math.max(0, scheduleSlots.filter(s => s.member_id).length - Object.keys(drafts).length),
  };

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 md:gap-3">
          <HomeButton />
          <span className="text-gray-300">/</span>
          <h1 className="text-xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 md:w-7 md:h-7 text-teal-500" /> 회원 · 출결 관리
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

      {/* ✅ v3.20.3: 회원 DB / 출결장 / 사인 이력 통합 뷰 전환 */}
      <div className="flex items-center gap-2 mb-4 border-b border-gray-200 pb-2 flex-wrap">
        <Link href="/members"
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-aqu-200 text-aqu-700 hover:bg-aqu-50 flex items-center gap-1">
          <Waves className="w-4 h-4" /> 회원 DB
        </Link>
        <Link href="/attendance"
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-teal-600 text-white shadow-sm flex items-center gap-1">
          <ClipboardCheck className="w-4 h-4" /> 출결장
        </Link>
        <Link href="/attendance/signatures"
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 flex items-center gap-1">
          <FileSignature className="w-4 h-4" /> ✍️ 사인 출결 이력
        </Link>
        <Link href="/schedule"
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 flex items-center gap-1">
          <Calendar className="w-4 h-4" /> 시간표
        </Link>
      </div>

      {/* ✅ v3.20.2: 사인 출결 이력 배너 */}
      <div className="mb-3">
        <Link href="/attendance/signatures"
          className="block p-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-95 rounded-xl text-white shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSignature className="w-5 h-5" />
              <div>
                <div className="font-bold text-sm">✍️ 사인 출결 이력 리스트</div>
                <div className="text-[11px] opacity-90">서명 내역 조회 · 프린트 · CSV 임에이트</div>
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs bg-white/20 px-2 py-1 rounded-lg">
              <Printer className="w-3.5 h-3.5" /> 보기
            </div>
          </div>
        </Link>
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
          existingAttendance={attendance.find((a: any) => a.member_id === signTarget.id && normDate(a.attend_date) === date) || null}
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
              const mSlots = slotsForMember(m.id);
              // v3.23.0: slot별 slotKey 기준으로 변경 여부 판정 (연타임 대응)
              const isChanged = mSlots.length > 0
                ? mSlots.some(s => changed.has(`${m.id}__${s.time_slot}`))
                : changed.has(m.id);
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
                      {mSlots.length >= 2 && <span className="ml-1 text-[9px] px-1.5 py-0.5 bg-purple-200 text-purple-800 rounded font-bold">연타임 {mSlots.length}</span>}
                    </div>
                    <div className="text-[10px] text-gray-500">30일: {m.rate}%</div>
                  </div>
                  {/* v3.23.0: slot별 개별 상태 버튼 */}
                  {mSlots.length > 0 ? (
                    <div className="space-y-2">
                      {mSlots.map(sl => {
                        const slotKey = `${m.id}__${sl.time_slot}`;
                        const curSlot = drafts[slotKey];
                        return (
                          <div key={sl.id} className="border border-gray-100 rounded-lg p-2 bg-white">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
                                style={{ backgroundColor: staffColorFor(sl.staff_id) + "20", color: staffColorFor(sl.staff_id), border: `1px solid ${staffColorFor(sl.staff_id)}` }}>
                                <Clock className="w-2.5 h-2.5" /> {sl.time_slot?.slice(0, 5)}
                              </span>
                              <span className="text-[10px] text-gray-500">{staffNameFor(sl.staff_id) || "미배정"}</span>
                            </div>
                            <div className="grid grid-cols-4 gap-1">
                              {STATUS_OPTIONS.map(s => (
                                <button key={s.value} onClick={() => pickStatus(m.id, s.value, sl.time_slot)}
                                  className={`text-[11px] py-1.5 rounded border-2 transition font-medium ${curSlot === s.value ? s.color + " font-bold" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                                  {s.icon} {s.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-1">
                      {STATUS_OPTIONS.map(s => (
                        <button key={s.value} onClick={() => pickStatus(m.id, s.value)}
                          className={`text-xs py-2 rounded border-2 transition font-medium ${drafts[m.id] === s.value ? s.color + " font-bold" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                          {s.icon} {s.label}
                        </button>
                      ))}
                    </div>
                  )}
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
                <th className="p-3 text-center font-semibold text-aqu-800">관리</th>
              </tr>
            </thead>
            <tbody>
              {memberStats.flatMap(m => {
                const mSlots = slotsForMember(m.id);
                // v3.23.0: 예약이 없는 회원은 가상 slot 1개로 대응, 있으면 slot별 행
                const displaySlots = mSlots.length > 0 ? mSlots : [{ id: null, time_slot: null, staff_id: null }];
                return displaySlots.map((sl: any, idx: number) => {
                  const slotKey = sl.time_slot ? `${m.id}__${sl.time_slot}` : m.id;
                  const cur = drafts[slotKey];
                  const isChanged = changed.has(slotKey);
                  const isFirstRow = idx === 0;
                  return (
                  <tr key={`${m.id}_${sl.id || "virt"}`} className={`border-b border-gray-100 ${isChanged ? "bg-yellow-50/70" : "hover:bg-aqu-50/30"}`}>
                    <td className="p-3">
                      {isFirstRow ? (
                        <>
                          <Link href={`/members/${m.id}`} className="text-aqu-700 hover:underline font-medium">
                            {m.name}
                          </Link>
                          {mSlots.length >= 2 && <span className="ml-1 text-[9px] px-1.5 py-0.5 bg-purple-200 text-purple-800 rounded font-bold">연타임 {mSlots.length}</span>}
                          {isChanged && <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-yellow-200 text-yellow-800 rounded">변경</span>}
                        </>
                      ) : (
                        <span className="text-[10px] text-gray-400">↳ 연속 수업</span>
                      )}
                    </td>
                    <td className="p-3 text-gray-600 text-xs">{isFirstRow ? (m.member_type === "child" ? "아동" : "성인") : ""}</td>
                    <td className="p-3">
                      {sl.time_slot ? (
                        <span className="text-[10px] px-1.5 py-1 rounded inline-flex items-center gap-1"
                          style={{ backgroundColor: staffColorFor(sl.staff_id) + "20", color: staffColorFor(sl.staff_id), border: `1px solid ${staffColorFor(sl.staff_id)}` }}>
                          <Clock className="w-2.5 h-2.5" /> {sl.time_slot?.slice(0, 5)}
                          {staffNameFor(sl.staff_id) && ` · ${staffNameFor(sl.staff_id)}`}
                        </span>
                      ) : <span className="text-[10px] text-gray-400">예약 없음</span>}
                    </td>
                    {STATUS_OPTIONS.map(s => (
                      <td key={s.value} className="p-1 text-center">
                        <button onClick={() => pickStatus(m.id, s.value, sl.time_slot || undefined)}
                          className={`w-full text-xs px-2 py-1.5 rounded border-2 transition font-medium ${cur === s.value ? s.color + " font-bold shadow-sm" : "bg-white border-gray-200 text-gray-400 hover:bg-gray-50"}`}>
                          {s.icon} {s.label}
                        </button>
                      </td>
                    ))}
                    {/* ✅ v3.13.5: 저장일 / 차감일 / 수동·자동 배지 */}
                    <td className="p-2 text-center text-[10px]">
                      {(() => {
                        const rec = attendance.find((a: any) => a.member_id === m.id && normDate(a.attend_date) === date);
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
                    {/* ✅ v3.25.2: 출결 완전 삭제 버튼 (HARD DELETE - 복구 불가) */}
                    <td className="p-2 text-center">
                      <button
                        onClick={async () => {
                          const msg = sl.time_slot
                            ? `⚠️ 정말로 완전 삭제하시겠습니까? (복구 불가)\n\n회원: ${m.name}\n날짜: ${date}\n시간: ${sl.time_slot}\n\n💡 attendance 레코드가 DB에서 완전히 삭제됩니다.`
                            : `⚠️ 정말로 완전 삭제하시겠습니까? (복구 불가)\n\n회원: ${m.name}\n날짜: ${date}\n\n💡 attendance 레코드가 DB에서 완전히 삭제됩니다.`;
                          if (!confirm(msg)) return;
                          // 1) slot_id 매칭 HARD DELETE
                          if (sl.id) {
                            try { await supabase.from("attendance").delete().eq("slot_id", sl.id); } catch {}
                          }
                          // 2) member_id + date + time_slot 매칭 HARD DELETE (slot_id 없는 유령 데이터)
                          for (const dateCol of ["attend_date", "date", "attendance_date", "session_date"]) {
                            try {
                              let q: any = supabase.from("attendance").delete().eq("member_id", m.id).eq(dateCol, date);
                              if (sl.time_slot) q = q.eq("time_slot", sl.time_slot);
                              const r = await q;
                              if (!r.error) break;
                            } catch {}
                          }
                          alert("✅ 출결 항목이 완전 삭제되었습니다.");
                          if (typeof loadAll === "function") await loadAll();
                          else location.reload();
                        }}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded p-1.5 transition"
                        title="완전 삭제 (복구 불가)"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                  );
                });
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
  // ✅ v3.16.1: 사인 이력 표 프린트용 필터
  const [showHistory, setShowHistory] = useState(false);
  const [histMemberId, setHistMemberId] = useState("");
  const [histFrom, setHistFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [histTo, setHistTo] = useState(new Date().toISOString().slice(0, 10));

  // ✅ v3.25.2: attend_date가 timestamp일 때 substring(0,10) 정규화 - 사인입장 크래시 방지
  const todayRecs = (attendance || []).filter((a: any) => {
    if (!a || !a.attend_date) return false;
    const ad = typeof a.attend_date === "string"
      ? a.attend_date.substring(0, 10)
      : new Date(a.attend_date).toISOString().substring(0, 10);
    return ad === date;
  });
  const recMap = new Map<string, any>();
  todayRecs.forEach((r: any) => { if (r?.member_id) recMap.set(r.member_id, r); });

  const filtered = (members || []).filter((m: any) =>
    m && (!search.trim() || (m.name || "").toLowerCase().includes(search.trim().toLowerCase()))
  );

  // ✅ v3.16.1: 사인 이력 프린트 함수
  function printSignatureHistory() {
    const memberMap = new Map<string, any>();
    (members || []).forEach((m: any) => memberMap.set(m.id, m));

    const signedRecs = (attendance || [])
      .filter((a: any) => !!a.signature)
      .filter((a: any) => (!histMemberId || a.member_id === histMemberId))
      .filter((a: any) => (!histFrom || normDate(a.attend_date) >= histFrom))
      .filter((a: any) => (!histTo || normDate(a.attend_date) <= histTo))
      .sort((a: any, b: any) => (b.attend_date || "").localeCompare(a.attend_date || "") || (b.signed_at || "").localeCompare(a.signed_at || ""));

    if (signedRecs.length === 0) {
      alert("검색 조건에 맞는 사인 기록이 없습니다.");
      return;
    }

    const w = window.open("", "_blank", "width=1000,height=1200");
    if (!w) { alert("팝업 차단을 해제해주세요"); return; }

    const memberName = histMemberId ? (memberMap.get(histMemberId)?.name || "-") : "전체 회원";
    const escapeHtml = (s: any) => String(s || "").replace(/[&<>"']/g, (c: string) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));

    const rows = signedRecs.map((r: any, i: number) => {
      const m = memberMap.get(r.member_id) || {};
      const st = statusMeta(r.status || "");
      const signer = r.signer_role === "parent" ? "학부모" : r.signer_role === "staff" ? "직원" : "본인";
      return `
        <tr>
          <td>${i + 1}</td>
          <td><b>${escapeHtml(m.name || "-")}</b><br/><span class="sub">${m.member_type === "child" ? "아동" : "성인"}${m.guardian_name ? " · " + escapeHtml(m.guardian_name) : ""}</span></td>
          <td>${r.attend_date || "-"}</td>
          <td>${r.time_slot || "-"}</td>
          <td><span class="badge">${st?.label || r.status || "-"}</span></td>
          <td>${signer}</td>
          <td>${r.signed_at ? String(r.signed_at).replace("T", " ").slice(0, 19) : "-"}</td>
          <td class="sig-cell">${r.signature ? `<img src="${r.signature}" alt="sig" />` : ""}</td>
        </tr>
      `;
    }).join("");

    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>출석 사인 이력</title>
<style>
body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; padding: 25px; color: #111; font-size: 12px; }
h1 { text-align: center; font-size: 20px; margin-bottom: 4px; letter-spacing: 1px; }
.sub-title { text-align: center; color: #666; font-size: 11px; margin-bottom: 20px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #333; padding: 6px 8px; text-align: center; vertical-align: middle; }
th { background: #f3f4f6; font-weight: bold; }
td.sig-cell { padding: 2px; width: 140px; height: 60px; background: #fafafa; }
td.sig-cell img { max-width: 130px; max-height: 55px; object-fit: contain; }
.sub { font-size: 10px; color: #666; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; background: #e0e7ff; color: #3730a3; font-size: 10px; font-weight: bold; }
.footer { margin-top: 20px; text-align: right; font-size: 10px; color: #666; }
@media print { .no-print { display: none } }
.toolbar { text-align: center; margin-bottom: 15px; }
.toolbar button { padding: 8px 18px; margin: 0 4px; border: none; border-radius: 6px; cursor: pointer; }
.btn-print { background: #7c3aed; color: white; }
.btn-close { background: #e5e7eb; color: #111; }
</style></head><body>
<div class="toolbar no-print">
  <button class="btn-print" onclick="window.print()">🖨️ 인쇄 / PDF</button>
  <button class="btn-close" onclick="window.close()">❌ 닫기</button>
</div>
<h1>출석 사인 이력부</h1>
<div class="sub-title">아쿠수중운동센터 · 회원: <b>${escapeHtml(memberName)}</b> · 기간: ${histFrom} ~ ${histTo} · 총 ${signedRecs.length}건</div>
<table>
  <thead>
    <tr>
      <th style="width:30px">#</th>
      <th>회원</th>
      <th>날짜</th>
      <th>시간</th>
      <th>출결</th>
      <th>서명자</th>
      <th>서명 시각</th>
      <th style="width:150px">서명</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">발행: ${new Date().toISOString().slice(0, 19).replace("T", " ")} · AQUNOTE 출석부 자동생성</div>
</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 500);
  }

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
        <div className="flex items-center gap-2">
          {/* ✅ v3.16.1: 사인 이력 프린트 버튼 */}
          <button onClick={() => setShowHistory(!showHistory)}
            className="px-3 py-2 bg-white border-2 border-purple-300 text-purple-700 rounded-lg text-xs font-bold hover:bg-purple-50">
            📄 사인 이력 프린트
          </button>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 회원명 검색..."
            className="px-3 py-2 border border-purple-200 rounded-lg text-sm w-full md:w-64 focus:outline-none focus:ring-2 focus:ring-purple-300"
          />
        </div>
      </div>

      {/* ✅ v3.16.1: 사인 이력 프린트 패널 */}
      {showHistory && (
        <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-3 mb-4">
          <div className="text-xs font-bold text-purple-800 mb-2">📄 사인 이력 프린트</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
            <div>
              <div className="text-[10px] text-purple-700 mb-1">회원 선택</div>
              <select value={histMemberId} onChange={(e) => setHistMemberId(e.target.value)}
                className="w-full px-2 py-1.5 border border-purple-200 rounded text-sm bg-white">
                <option value="">전체 회원</option>
                {(members || []).map((m: any) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.member_type === "child" ? "아동" : "성인"})</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[10px] text-purple-700 mb-1">시작일</div>
              <input type="date" value={histFrom} onChange={(e) => setHistFrom(e.target.value)}
                className="w-full px-2 py-1.5 border border-purple-200 rounded text-sm bg-white" />
            </div>
            <div>
              <div className="text-[10px] text-purple-700 mb-1">종료일</div>
              <input type="date" value={histTo} onChange={(e) => setHistTo(e.target.value)}
                className="w-full px-2 py-1.5 border border-purple-200 rounded text-sm bg-white" />
            </div>
            <div className="flex items-end">
              <button onClick={printSignatureHistory}
                className="w-full px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-bold">
                🖨️ 프린트 생성
              </button>
            </div>
          </div>
          <div className="text-[10px] text-purple-700">💡 예: 손민오 회원 · 5월 1일 · 5월 2일 사인 기록이 표로 모두 표시되며, 서명 이미지가 함께 인쇄됩니다.</div>
        </div>
      )}

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
  // ✅ v3.25.3: 훅은 반드시 조건문 이전에 모두 호출 (React Hooks 규칙)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);
  const [status, setStatus] = useState<"present" | "absent" | "sick" | "personal">(existingAttendance?.status || "present");
  const [signer, setSigner] = useState<"parent" | "self" | "staff">(member?.member_type === "child" ? "parent" : "self");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // ✅ v3.25.3: member 없어도 훅은 실행되고, 캔버스 초기화만 조건부로 건너뜀
    if (!member || !member.id) return;
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
  }, [existingAttendance, member]);

  // ✅ v3.25.3: 훅 호출 완료 후에 조건부 early return (Hooks 규칙 준수)
  if (!member || !member.id || !date) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
          <div className="text-center">
            <p className="text-gray-700 mb-4">⚠️ 회원 정보가 없어 서명을 진행할 수 없습니다.</p>
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">닫기</button>
          </div>
        </div>
      </div>
    );
  }

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

      // v3.21.2: 회원권 차감 규칙 – present/absent만 -1, sick/personal은 미차감
      const prevStatus = existingAttendance?.status || null;
      const prevCounted = prevStatus === "present" || prevStatus === "absent";
      const newCounted  = status === "present"     || status === "absent";

      // 활성 회원권 조회 (차감/복원 필요할 때만)
      let activeMs: any = null;
      if ((newCounted && !prevCounted) || (prevCounted && !newCounted)) {
        const { data: allMs } = await supabase.from("memberships").select("*")
          .eq("member_id", member.id)
          .or("status.is.null,status.neq.cancelled");
        activeMs = (allMs || [])
          .filter((ms: any) => (!ms.start_date || ms.start_date <= date) && (!ms.end_date || ms.end_date >= date))
          .sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""))[0];
      }

      const basePayload: any = {
        status,
        signature: dataUrl,
        signer_role: signer,
        signed_at: nowIso,
        saved_at: nowIso,
        slot_id: scheduleSlot?.id || existingAttendance?.slot_id || null,
        time_slot: scheduleSlot?.time_slot || existingAttendance?.time_slot || null,
      };

      // v3.21.2: 차감/복원 로직
      let deducted = false, restored = false;
      if (!prevCounted && newCounted && activeMs) {
        await supabase.from("memberships").update({ used_sessions: (activeMs.used_sessions || 0) + 1 }).eq("id", activeMs.id);
        basePayload.membership_id  = activeMs.id;
        basePayload.deducted_at    = nowIso;
        basePayload.deduction_mode = "auto";
        deducted = true;
      } else if (prevCounted && !newCounted && existingAttendance?.membership_id) {
        const msId = existingAttendance.membership_id;
        const target = activeMs && activeMs.id === msId
          ? activeMs
          : (await supabase.from("memberships").select("*").eq("id", msId).single()).data;
        if (target) {
          await supabase.from("memberships").update({ used_sessions: Math.max(0, (target.used_sessions || 0) - 1) }).eq("id", msId);
          restored = true;
        }
        basePayload.membership_id  = null;
        basePayload.deducted_at    = null;
        basePayload.deduction_mode = null;
      }

      // 안전 저장 (누락 컬럼 자동 폴백 최대 6회)
      const isMissingCol = (msg: string) =>
        /signature|signer_role|signed_at|saved_at|deducted_at|deduction_mode|membership_id|time_slot|column|schema cache/i.test(msg);

      async function safeSave(payload: any, isUpdate: boolean, id?: string): Promise<any> {
        let cur: any = { ...payload };
        for (let i = 0; i < 6; i++) {
          const r = isUpdate
            ? await supabase.from("attendance").update(cur).eq("id", id!)
            : await supabase.from("attendance").insert(cur);
          if (!r.error) return null;
          const msg = String(r.error.message || "");
          if (!isMissingCol(msg)) return r.error;
          const m = /'([^']+)' column|column "([^"]+)"|column ([\w_]+) of|find the '([^']+)'/.exec(msg);
          const missing = m?.[1] || m?.[2] || m?.[3] || m?.[4];
          if (missing && missing in cur) { const rest = { ...cur }; delete rest[missing]; cur = rest; continue; }
          ["signature", "signer_role", "signed_at", "saved_at", "deducted_at", "deduction_mode", "membership_id", "time_slot"].forEach((k) => { if (k in cur) delete cur[k]; });
        }
        return null;
      }

      if (existingAttendance) {
        const err = await safeSave(basePayload, true, existingAttendance.id);
        if (err) throw err;
      } else {
        const insertPayload: any = { org_id: realOrgId, member_id: member.id, attend_date: date, ...basePayload };
        const err = await safeSave(insertPayload, false);
        if (err) throw err;
      }

      // v3.21.2: 시간표 상태 동기화 (personal 포함)
      if (scheduleSlot?.id) {
        const statusMap: Record<string, string> = { present: "done", absent: "noshow", sick: "sick", personal: "sick" };
        await supabase.from("schedule_slots").update({ status: statusMap[status] }).eq("id", scheduleSlot.id);
      }

      const parts: string[] = ["✅ 사인 저장 완료"];
      if (deducted) parts.push("회원권 1회 차감");
      if (restored) parts.push("회원권 1회 복원");
      if (!deducted && !restored && (status === "sick" || status === "personal")) {
        parts.push("(병결/개인사정 – 회원권 미차감)");
      }
      onSaved && (await onSaved(parts.join(" · ")));
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

          {/* ✅ v3.16.1: 출석 확인 동의문 */}
          <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-3">
            <div className="text-xs font-bold text-purple-800 mb-1 flex items-center gap-1">
              📜 출석 확인 및 동의서
            </div>
            <div className="text-[11px] text-purple-900 leading-relaxed bg-white rounded p-2 border border-purple-100">
              본 서명으로 <b>당일 출석 및 세션 차감</b>이 처리되며,<br/>
              서명 정보는 <b>출석 증빙 목적</b>으로 보관됩니다.
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
