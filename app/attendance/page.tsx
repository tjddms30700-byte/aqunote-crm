"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { supabase } from "@/lib/supabase";
import { saveActualAttendance } from "@/lib/actualMembershipUsage";
import { remainingOf, totalOf } from "@/lib/membershipFifo";
import { signatureMembershipDecision } from "@/lib/signatureMembership";
import { loadMemberMemberships } from "@/lib/memberMembershipQuery";
import { tabletSignTargets, attendanceForSignTarget } from "@/lib/tabletSignTargets";
import { lessonDurationMinutes } from "@/lib/lessonProduct";
import { getActiveBranchId, useBranchWatch } from "@/lib/branchContext";
import {
  ClipboardCheck, Home, Calendar, RefreshCw, Save, Check,
  X as XIcon, AlertCircle, User, Clock, Filter, CalendarDays,
  FileSignature, Printer, Waves
} from "lucide-react";

/* ✅ v3.31.0: 파스텔 톤 단일 드롭다운 (Select Box) 용 상태 옵션 */
const STATUS_OPTIONS = [
  { value: "present",  label: "출석",     color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "🟢", pill: "badge-present" },
  { value: "absent",   label: "결석",     color: "bg-rose-50 text-rose-700 border-rose-200",         icon: "🔴", pill: "badge-noshow" },
  { value: "sick",     label: "병결",     color: "bg-amber-50 text-amber-700 border-amber-200",      icon: "🟡", pill: "badge-sick" },
  { value: "personal", label: "개인사정", color: "bg-orange-50 text-orange-700 border-orange-200",   icon: "🟠", pill: "badge-personal" },
  { value: "carryover",label: "이월",     color: "bg-sky-50 text-sky-700 border-sky-200",            icon: "🔵", pill: "badge-carryover" },
  { value: "cancel",   label: "취소",     color: "bg-slate-100 text-slate-600 border-slate-200",     icon: "⚪", pill: "badge-cancel" },
];
function statusMeta(s: string) { return STATUS_OPTIONS.find(x => x.value === s); }

// ✅ v3.25.4: attend_date 정규화 - timestamp/date 모두 YYYY-MM-DD로 변환 (모든 컴포넌트에서 공유)
function normDate(v: any): string {
  if (!v) return "";
  try {
    if (typeof v === "string") return v.substring(0, 10);
    return new Date(v).toISOString().substring(0, 10);
  } catch { return ""; }
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function AttendancePage() {
  // ✅ v3.26.8: hydration mismatch 방지 - 초기값은 빈 문자열, 마운트 후 useEffect에서 설정
  const [date, setDate]           = useState<string>("");
  const [mounted, setMounted]     = useState(false);
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

  // ✅ v3.26.8: 클라이언트 마운트 후에만 오늘 날짜 설정 (SSR hydration 안전)
  useEffect(() => {
    setDate(todayStr());
    setMounted(true);
  }, []);

  useEffect(() => { if (date) loadAll(); }, [date]);

  async function loadAll() {
    setLoading(true);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().slice(0,10);

    const branchId = getActiveBranchId();
    // ✅ branch_id 필터 (컴럼 미존재 시 폴백)
    const safeQ = async (baseFn: () => any, filterFn: (q: any) => any) => {
      if (!branchId || branchId === "ALL") return await baseFn();
      const r = await filterFn(baseFn());
      if (r.error && (r.error.code === "42703" || r.error.message?.includes("branch_id"))) return await baseFn();
      return r;
    };
    // ✅ v3.26.4: event_date는 DATE 타입이므로 순수 date 문자열만 사용 (T23:59:59 붙이면 400 에러)
    // 다음 날을 구해서 gte(오늘) + lt(내일) 범위로 안전하게 필터
    const nextDate = (() => {
      const d = new Date(date + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    })();
    // ✅ v3.27.0: 400 Bad Request 방지 - order/is/deleted_at 오류 시 순차적 fallback
    const safeSelect = async (table: string, cols: string, extraFn: (q: any) => any) => {
      // 전체 시도 → order 없이 시도 → deleted_at 없이 시도
      const attempts = [
        () => extraFn(supabase.from(table).select(cols).is("deleted_at", null).order("name")),
        () => extraFn(supabase.from(table).select(cols).is("deleted_at", null)),
        () => extraFn(supabase.from(table).select(cols)),
      ];
      for (const fn of attempts) {
        try {
          const r = await fn();
          if (!r.error) return r;
          console.warn(`[v3.27.0] ${table} select fallback:`, r.error.message);
        } catch (e) { console.warn(`[v3.27.0] ${table} exception:`, e); }
      }
      return { data: [], error: null };
    };

    const [sRes, mRes, stRes, aRes] = await Promise.all([
      safeQ(
        () => supabase.from("schedule_slots").select("*").gte("event_date", date).lt("event_date", nextDate).order("time_slot"),
        (q: any) => q.eq("branch_id", branchId).gte("event_date", date).lt("event_date", nextDate).order("time_slot")
      ),
      // ✅ v3.36.2: members 전체 조회 (deleted_at null, branch 무관) - 반복예약 회원 누락 방지
      safeSelect("members", "id, name, member_type, guardian_name, branch_id", (q: any) => q),
      (branchId
        ? safeSelect("staff", "id, name, role, color", (q: any) => q.eq("branch_id", branchId))
        : safeSelect("staff", "id, name, role, color", (q: any) => q)),
      supabase.from("attendance").select("*").gte("attend_date", cutoffStr).order("attend_date", { ascending: false }),
    ]);

    // ✅ v3.36.2: 진단 로그 - 누락 회원 원인 추적
    const rawSlots = Array.isArray(sRes?.data) ? sRes.data : [];
    const rawMembers = Array.isArray(mRes?.data) ? mRes.data : [];
    console.log(`[v3.36.2] 슬롯 조회 ${date} ~ ${nextDate}: ${rawSlots.length}건`, rawSlots.map((s: any) => ({
      id: s.id?.slice(0, 8),
      time_slot: s.time_slot,
      member_id: s.member_id?.slice(0, 8),
      event_date: s.event_date,
      recurring: !!s.recurring_id,
      status: s.status,
      deleted: !!s.deleted_at,
    })));
    console.log(`[v3.36.2] members 전체: ${rawMembers.length}명`);

    // ✅ v3.36.2: 오늘 슬롯의 member_id 중 members 조회에 없는 것 발견 시 DB 직접 보강
    const slotMemberIds = new Set(rawSlots.filter((s: any) => !s.deleted_at && s.member_id).map((s: any) => s.member_id));
    const knownMemberIds = new Set(rawMembers.map((m: any) => m.id));
    const missingIds = Array.from(slotMemberIds).filter(id => !knownMemberIds.has(id));

    let finalMembers = rawMembers;
    if (missingIds.length > 0) {
      console.warn(`[v3.36.2] ⚠️ 슬롯은 있는데 members에 없는 회원 ${missingIds.length}명 - DB 보강:`, missingIds);
      const { data: extraMembers } = await supabase.from("members")
        .select("id, name, member_type, guardian_name, branch_id, deleted_at, status")
        .in("id", missingIds);
      if (extraMembers && extraMembers.length > 0) {
        console.log(`[v3.36.2] ✅ 누락 회원 ${extraMembers.length}명 DB 복원 완료:`, extraMembers.map((m: any) => ({ id: m.id?.slice(0, 8), name: m.name, deleted: !!m.deleted_at, status: m.status })));
        finalMembers = [...rawMembers, ...extraMembers];
      }
    }

    setSlots(rawSlots);
    setMembers(finalMembers);
    setStaff(Array.isArray(stRes?.data) ? stRes.data : []);
    setAttendance(Array.isArray(aRes?.data) ? aRes.data : []);
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

  /* ✅ v3.26.1: 시간표 완전 기점 - 그날 schedule_slots에 슬롯이 있는 회원만 표시 */
  const todayMembers = useMemo(() => {
    const toMinutes = (ts: any): number => {
      if (ts === null || ts === undefined) return 9999;
      const s = String(ts).trim();
      const m = s.match(/(\d{1,2}):(\d{2})/);
      if (!m) return 9999;
      return Number(m[1]) * 60 + Number(m[2]);
    };
    // ✅ v3.26.1: 오답 이앵이 예약이 있거나 삭제되지 않은 슬롯만 수집 (event_type 무관, deleted_at NULL만)
    const activeSlots = (scheduleSlots || []).filter((s: any) =>
      s && s.member_id && !s.deleted_at
    );

    const firstSlotMin = new Map<string, number>();
    activeSlots.forEach((s: any) => {
      const mm = toMinutes(s.time_slot ?? s.start_time ?? s.start_at);
      const prev = firstSlotMin.get(s.member_id);
      if (prev === undefined || mm < prev) firstSlotMin.set(s.member_id, mm);
    });

    if (mode === "all") {
      // 전체 회원 모드: 예약 막 재사랑 시각순, 없으면 이름순
      return [...members].sort((a: any, b: any) => {
        const av = firstSlotMin.get(a.id) ?? 9999;
        const bv = firstSlotMin.get(b.id) ?? 9999;
        if (av !== bv) return av - bv;
        return (a.name || "").localeCompare(b.name || "", "ko");
      });
    }

    // ✅ v3.36.2: 시간표 예약 모드 - 슬롯 기준으로 회원 100% 복원 (반복예약 누락 완전 차단)
    const memberIds = new Set(activeSlots.map((s: any) => s.member_id));
    const memberMap = new Map((members || []).map((m: any) => [m.id, m]));

    // 진단 로그 - 반복예약 회원 누락 상황 실시간 확인
    const missingInMembers = Array.from(memberIds).filter(id => !memberMap.has(id));
    if (missingInMembers.length > 0) {
      console.warn(`[v3.36.2] ⚠️ todayMembers 생성 시 누락 발생 - 슬롯으로 프록시 생성:`, missingInMembers);
      activeSlots.forEach((s: any) => {
        if (s.member_id && !memberMap.has(s.member_id)) {
          memberMap.set(s.member_id, {
            id: s.member_id,
            name: s.member_name || s.name || `(로드 중: ${s.member_id?.slice(0, 8)})`,
            member_type: s.member_type || "unknown",
            guardian_name: null,
            _from_slot: true,
          });
        }
      });
    }

    const result = Array.from(memberIds)
      .map(id => memberMap.get(id))
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const av = firstSlotMin.get(a.id) ?? 9999;
        const bv = firstSlotMin.get(b.id) ?? 9999;
        if (av !== bv) return av - bv;
        return (a.name || "").localeCompare(b.name || "", "ko");
      });

    console.log(`[v3.36.2] todayMembers 결과: ${result.length}명`, result.map((m: any) => ({ id: m.id?.slice(0, 8), name: m.name, from_slot: !!m._from_slot })));
    return result;
  }, [scheduleSlots, members, mode]);

  const tabletMembers = useMemo(() => tabletSignTargets(todayMembers, scheduleSlots, date), [todayMembers, scheduleSlots, date]);

  /* ✅ v3.26.1: 회원별 그날의 시간표 슬롯 - 삭제되지 않은 슬롯만 */
  function slotsForMember(memberId: string) {
    return (scheduleSlots || []).filter((s: any) => s && s.member_id === memberId && !s.deleted_at);
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

  // v3.73.1: 새 출석에 한해서 실제 사용 회원권을 선택. 과거 미연결 기록은 소급 차감하지 않음.
  async function saveAll() {
    if (saving) return;
    if (changed.size === 0) { alert("변경된 내용이 없습니다"); return; }
    setSaving(true);
    const failed = new Set<string>();
    const errors: string[] = [];
    const warnings = new Set<string>();
    let deducted = 0, restored = 0, saved = 0;
    try {
      const org = await supabase.from("organizations").select("id").limit(1).single();
      for (const key of Array.from(changed)) {
        const [memberId, ...parts] = key.split("__");
        const time = parts.join("__") || null;
        const slot = scheduleSlots.find((row: any) => row.member_id === memberId && (!time || row.time_slot === time));
        const existing = attendance.find((a: any) => a.member_id === memberId && normDate(a.attend_date || a.date || a.attendance_date || a.session_date) === date && (time ? a.time_slot === time : !a.time_slot));
        try {
          const result = await saveActualAttendance({ memberId, date, status: drafts[key] || null, slot, existing,
            timeSlot: time, orgId: org.data?.id });
          deducted += Number(result.deducted); restored += Number(result.restored); saved++;
          if (result.warning) warnings.add(result.warning);
        } catch (error: any) {
          failed.add(key);
          errors.push((members.find((m: any) => m.id === memberId)?.name || memberId) + ": " + (error?.message || error));
        }
      }
      await loadAll();
      setDrafts(current => {
        const next = { ...current };
        for (const key of failed) next[key] = drafts[key];
        return next;
      });
      setChanged(failed);
      alert([`저장 ${saved}건 · 차감 ${deducted}회 · 복원 ${restored}회`, ...Array.from(warnings),
        ...(errors.length ? ["미저장 (다시 확인해주세요):\n" + errors.join("\n")] : [])].join("\n"));
    } catch (error: any) {
      alert("저장 실패: " + (error?.message || error));
    } finally { setSaving(false); }
  }

  // ✅ v3.31.0: KPI 집계 확장 (개인사정/노쇼/이월 별도 카운트)
  const activeSlotsForKpi = scheduleSlots.filter((s: any) => s && s.member_id && !s.deleted_at);
  const stat = {
    total: todayMembers.length,
    present: Object.values(drafts).filter(v => v === "present").length,
    absent: Object.values(drafts).filter(v => v === "absent").length,
    sick: Object.values(drafts).filter(v => v === "sick").length,
    personal: Object.values(drafts).filter(v => v === "personal").length,
    carryover: Object.values(drafts).filter(v => v === "carryover").length,
    // 결석계 합산 = 결석(absent) + 병결(sick) + 개인사정(personal) + 노쇼(noshow)
    absentTotal: Object.values(drafts).filter(v => v === "absent" || v === "sick" || v === "personal" || v === "noshow").length,
    unchecked: Math.max(0, activeSlotsForKpi.length - Object.keys(drafts).length),
  };

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-10 bg-gradient-to-br from-sky-50 via-white to-cyan-50 min-h-screen">
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
          members={tabletMembers}
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
          existingAttendance={attendanceForSignTarget(signTarget, attendance, date)}
          scheduleSlot={signTarget._signSlot || null}
          onClose={() => setSignTarget(null)}
          onSaved={async () => { setSignTarget(null); await loadAll(); }}
        />
      )}

      {/* v3.31.0: KPI 파스텔 이당형 카드 상세화 */}
      {view === "list" && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 md:gap-3 mb-4">
          <KPI title="대상 회원"       val={stat.total + "명"}       color="text-sky-700" />
          <KPI title="🟢 출석"        val={stat.present + "명"}     color="text-emerald-600" />
          <KPI title="🔴 결석(전체)"  val={stat.absentTotal + "명"} color="text-rose-600" />
          <KPI title="🟡 병결"        val={stat.sick + "명"}        color="text-amber-600" />
          <KPI title="🟠 개인사정"    val={stat.personal + "명"}    color="text-orange-600" />
          <KPI title="미체크"          val={stat.unchecked + "명"}   color="text-slate-500" />
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
                            {/* v3.31.0: 모바일 슬롯별 단일 드롭다운 */}
                            <select
                              value={curSlot || ""}
                              onChange={(e) => pickStatus(m.id, e.target.value, sl.time_slot)}
                              className={`w-full text-xs px-2 py-1.5 rounded-full border-2 font-semibold ${
                                curSlot ? (statusMeta(curSlot)?.color || "bg-white border-slate-200") : "bg-white border-slate-200 text-slate-400"
                              }`}
                            >
                              <option value="">― 선택 ―</option>
                              {STATUS_OPTIONS.map(s => (
                                <option key={s.value} value={s.value}>{s.icon} {s.label}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* v3.31.0: 모바일용 단일 드롭다운 */
                    <select
                      value={drafts[m.id] || ""}
                      onChange={(e) => pickStatus(m.id, e.target.value)}
                      className={`w-full text-sm px-3 py-2 rounded-full border-2 font-semibold ${
                        drafts[m.id] ? (statusMeta(drafts[m.id])?.color || "bg-white border-slate-200") : "bg-white border-slate-200 text-slate-400"
                      }`}
                    >
                      <option value="">― 상태 선택 ―</option>
                      {STATUS_OPTIONS.map(s => (
                        <option key={s.value} value={s.value}>{s.icon} {s.label}</option>
                      ))}
                    </select>
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
                <th className="p-3 text-center font-semibold text-aqu-800" colSpan={3}>{date} 출결 (드롭다운 선택)</th>
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
                    {/* v3.31.0: 4개 버튼 → 단일 드롭다운(Select) 통합 */}
                    <td colSpan={3} className="p-2 text-center">
                      <select
                        value={cur || ""}
                        onChange={(e) => pickStatus(m.id, e.target.value, sl.time_slot || undefined)}
                        className={`w-full max-w-[180px] mx-auto text-sm px-3 py-2 rounded-full border-2 font-semibold cursor-pointer transition-all ${
                          cur ? (statusMeta(cur)?.color || "bg-white border-slate-200") : "bg-white border-slate-200 text-slate-400"
                        }`}
                      >
                        <option value="">― 상태 선택 ―</option>
                        {STATUS_OPTIONS.map(s => (
                          <option key={s.value} value={s.value}>{s.icon} {s.label}</option>
                        ))}
                      </select>
                    </td>
                    {/* ✅ v3.13.5: 저장일 / 차감일 / 수동·자동 배지 */}
                    <td className="p-2 text-center text-[10px]">
                      {(() => {
                        const rec = attendance.find((a: any) => a.member_id === m.id && (a.slot_id === sl.id || (!a.slot_id && normDate(a.attend_date) === date && (!a.time_slot || a.time_slot === sl.time_slot))));
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
                            {mode === "pending" && <button onClick={async () => {
                              try {
                                const result = await saveActualAttendance({ memberId: m.id, date, status: rec.status, slot: sl, existing: rec, resolvePending: true });
                                alert(result.deducted ? "선택한 회원권에서 1회 차감했습니다." : result.warning || "추가 차감 없이 확인했습니다.");
                                await loadAll();
                              } catch (error: any) { alert("차감 확인 실패: " + (error?.message || String(error))); }
                            }} className="px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 font-semibold">차감 확인</button>}
                            {mode && (
                              <span className={`px-1.5 py-0.5 rounded font-semibold ${mode === "auto" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                                {mode === "pending" ? "회원권 확인 대기" : mode === "auto" ? "🤖 자동" : "✋ 수동"}
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
                    {/* ✅ v3.26.0: 시간표 기점 - schedule_slots를 직접 HARD DELETE → 출결장도 즉시 사라짐 */}
                    <td className="p-2 text-center">
                      <button
                        onClick={async () => {
                          const msg = sl.time_slot
                            ? `⚠️ 정말로 완전 삭제하시겠습니까? (복구 불가)\n\n회원: ${m.name}\n날짜: ${date}\n시간: ${sl.time_slot}\n\n💡 시간표 예약 + 관련 출결 기록이 DB에서 완전 삭제됩니다.`
                            : `⚠️ 정말로 완전 삭제하시겠습니까? (복구 불가)\n\n회원: ${m.name}\n날짜: ${date}\n\n💡 시간표 예약 + 관련 출결 기록이 DB에서 완전 삭제됩니다.`;
                          if (!confirm(msg)) return;
                          // ✅ v3.26.0: 시간표(schedule_slots)를 기점으로 완전 삭제
                          // 1) schedule_slots HARD DELETE (시간표 자체 제거)
                          if (sl.id) {
                            try {
                              const r = await supabase.from("schedule_slots").delete().eq("id", sl.id);
                              if (r.error) {
                                // 권한 문제 시 soft delete fallback
                                await supabase.from("schedule_slots").update({ deleted_at: new Date().toISOString() }).eq("id", sl.id);
                              }
                            } catch {}
                          }
                          // 2) 관련 attendance 기록도 함께 HARD DELETE (카스케이드 트리거가 없을 경우 대비)
                          if (sl.id) {
                            try { await supabase.from("attendance").delete().eq("slot_id", sl.id); } catch {}
                          }
                          for (const dateCol of ["attend_date", "date", "attendance_date", "session_date"]) {
                            try {
                              let q: any = supabase.from("attendance").delete().eq("member_id", m.id).eq(dateCol, date);
                              if (sl.time_slot) q = q.eq("time_slot", sl.time_slot);
                              const r = await q;
                              if (!r.error) break;
                            } catch {}
                          }
                          alert("✅ 시간표와 출결 기록이 완전 삭제되었습니다.");
                          if (typeof loadAll === "function") await loadAll();
                          else location.reload();
                        }}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded p-1.5 transition"
                        title="시간표 + 출결 완전 삭제 (복구 불가)"
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
  // ✅ v3.26.8: hydration mismatch 방지
  const [histFrom, setHistFrom] = useState<string>("");
  const [histTo, setHistTo] = useState<string>("");
  useEffect(() => {
    setHistFrom(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
    setHistTo(new Date().toISOString().slice(0, 10));
  }, []);

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
          {filtered.filter((m: any) => m && m.id).map((m: any) => {
            // ✅ v3.26.3: null 방어 + 사인 완료 시 status 표시 강화
            const rec = attendanceForSignTarget(m, attendance, date);
            const signed = !!rec?.signature;
            const status = rec?.status;
            const bgClass = signed
              ? (status === "present" ? "bg-green-100 border-green-400"
                : status === "absent" ? "bg-red-100 border-red-400"
                : status === "sick" ? "bg-orange-100 border-orange-400"
                : status === "personal" ? "bg-blue-100 border-blue-400"
                : "bg-purple-50 border-purple-400")
              : status === "present" ? "bg-green-50 border-green-300"
              : status === "absent" ? "bg-red-50 border-red-300"
              : status === "sick" ? "bg-orange-50 border-orange-300"
              : "bg-white border-gray-200 hover:bg-purple-50";
            // ✅ v3.26.3: 사인 완료 시 상태 라벨 정확히 표시 (예: "✓ 출석")
            const statusInfo = status ? statusMeta(status) : null;
            const statusLabel = signed
              ? (statusInfo?.label ? `✓ ${statusInfo.label}` : "✓ 사인 완료")
              : status
                ? (statusInfo?.label || "상태")
                : "터치해서 사인";
            return (
              <button
                key={m._signKey || m.id}
                onClick={() => onOpenSign && onOpenSign(m)}
                className={`p-4 rounded-2xl border-2 transition-all text-left shadow-sm hover:shadow-md ${bgClass}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-base font-bold text-gray-800 truncate">{m.name || "-"}</div>
                  {signed && <span className="text-xs text-purple-600">✓ 사인</span>}
                </div>
                <div className="text-[10px] text-gray-500 mb-2">
                  {m._signSlot && <div className="font-semibold text-slate-700 mb-1">{m._signSlot.time_slot} · {m._signSlot.lesson_name || "수업"}{lessonDurationMinutes(m._signSlot.lesson_name) ? ` · ${lessonDurationMinutes(m._signSlot.lesson_name)}분` : ""}</div>}
                  {m.member_type === "child" ? "🧒 아동" : "👤 성인"}
                  {m.guardian_name ? ` · ${m.guardian_name}` : ""}
                </div>
                <div className="text-xs text-purple-700 font-semibold">
                  {signed ? "사인 수정" : statusLabel}
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
  // ✨ v3.32.2: 회원권 잔여 + 최근 결석(보강필요) 상태
  const [memberInfo, setMemberInfo] = useState<{
    activeMs: any | null;
    remain: number;
    total: number;
    loading: boolean; message?: string; reason?: string; error?: string;
  }>({ activeMs: null, remain: 0, total: 0, loading: true });

  const [membershipReload, setMembershipReload] = useState(0);
  // 공용 조회: 전체 보유권을 조회하고 실패·소진·만료·상품 불일치를 구분한다.
  useEffect(() => {
    if (!member?.id) return;
    let stopped=false;
    const refresh=async()=>{
      setMemberInfo((old:any)=>({...old,loading:true,error:undefined}));
      try {
        const allMs=await loadMemberMemberships(member.id);
        if(stopped)return;
        const context={...(scheduleSlot || {}),member_id:member.id,event_date:date};
        const resolution=signatureMembershipDecision(context,allMs,existingAttendance);
        const activeMs=resolution.activeMs;
        setMemberInfo({activeMs,remain:remainingOf(activeMs),total:totalOf(activeMs),loading:false,message:resolution.message,reason:resolution.reason});
      } catch(error:any){
        if(stopped)return;
        setMemberInfo({activeMs:null,remain:0,total:0,loading:false,error:error?.message || "회원권 조회 실패. 다시 조회해주세요.",reason:"query_error"});
      }
    };
    void refresh();
    const visible=()=>{if(!document.hidden)void refresh();};
    window.addEventListener("focus",visible);document.addEventListener("visibilitychange",visible);
    return ()=>{stopped=true;window.removeEventListener("focus",visible);document.removeEventListener("visibilitychange",visible);};
  },[member?.id,date,existingAttendance?.membership_id,existingAttendance?.deduction_mode,scheduleSlot?.id,scheduleSlot?.membership_id,scheduleSlot?.lesson_name,membershipReload]);

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

  // ✅ v3.26.5: "다시 그리기" = 캔버스만 지움 (새로 그려서 저장하면 기존 사인이 덮어쓰임)
  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    setHasStroke(false);
  };

  // ✅ v3.26.5: 사인 완전 삭제 (DB에서 attendance 기록까지 지우고 시간표를 scheduled로 복원)
  async function deleteSignature() {
    if (saving || !confirm(`${member?.name || ""} · ${date} 서명을 취소하고 예약으로 되돌릴까요?\n연결된 사용 회원권만 복원하며 미연결 과거 기록은 복원하지 않습니다.`)) return;
    setSaving(true);
    try {
      const result = await saveActualAttendance({ memberId: member.id, date, status: null,
        slot: scheduleSlot, existing: existingAttendance, slotStatus: "scheduled" });
      if (result.warning) alert(result.warning);
      onSaved && (await onSaved("서명 취소 완료"));
    } catch (error: any) { alert("취소 실패: " + (error?.message || error)); }
    finally { setSaving(false); }
  }

  async function save() {
    if (saving) return;
    if (!hasStroke) { alert("사인을 입력해주세요"); return; }
    setSaving(true);
    try {
      const organization = orgId || (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      const result = await saveActualAttendance({ memberId: member.id, date, status, signatureOnly: true, allowAutoUnique: true, deferInvalidMembership: true,
        slot: scheduleSlot, existing: existingAttendance, orgId: organization,
        extra: { signature: canvasRef.current!.toDataURL("image/png"), signer_role: signer,
          signed_at: new Date().toISOString() } });
      const message = ["사인 저장 완료", result.deducted ? "선택한 회원권 1회 차감" : result.restored ? "연결 회원권 1회 복원" : "추가 차감 없음", result.warning].filter(Boolean).join(" · ");
      onSaved && (await onSaved(message));
    } catch (error: any) { alert("저장 실패: " + (error?.message || error)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b bg-purple-50 rounded-t-2xl">
          <div>
            <div className="text-lg font-bold text-purple-800">✍️ 출석 사인</div>
            <div className="text-xs text-gray-600">{member?.name} · {date}{scheduleSlot?.time_slot ? ` · ${scheduleSlot.time_slot}` : ""}{scheduleSlot?.lesson_name ? ` · ${scheduleSlot.lesson_name}` : ""}</div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* ✨ v3.32.2: 회원권 잔여 + 보강필요 안내 카드 */}
          {!memberInfo.loading && (
            <div className="grid grid-cols-1 gap-3">
              {/* 회원권 잔여 */}
              <div className={`aqu-card border-2 p-3 rounded-2xl ${
                memberInfo.remain === 0 ? "bg-gradient-to-br from-rose-50 to-red-50 border-rose-300" :
                memberInfo.remain <= 2 ? "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-300" :
                "bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-300"
              }`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-lg">🎫</span>
                  <span className="text-xs font-bold text-slate-700">회원권 잔여</span>
                </div>
                {memberInfo.error ? <div className="text-sm text-rose-700">{memberInfo.error}</div> : memberInfo.activeMs ? (
                  <>
                    <div className="text-[11px] text-slate-600 font-medium mb-1 truncate flex items-center gap-1.5">
                      {memberInfo.activeMs.plan_name || "회원권"}
                      {/* ✅ v3.57.2: 기한은 지났지만 잔여 있음 (폴백 사용 중) 배지 */}
                      {memberInfo.activeMs.end_date && memberInfo.activeMs.end_date < date && (
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-300 rounded text-[9px] font-bold whitespace-nowrap">
                          ⚠️ 기한만료 {memberInfo.activeMs.end_date.slice(5)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-2xl font-extrabold ${
                        memberInfo.remain === 0 ? "text-rose-600" :
                        memberInfo.remain <= 2 ? "text-amber-600" : "text-emerald-600"
                      }`}>{memberInfo.remain}</span>
                      <span className="text-sm text-slate-500 font-medium">/ {memberInfo.total}회</span>
                    </div>
                    {memberInfo.remain === 0 && (
                      <div className="mt-1 text-[10px] font-bold text-rose-600 bg-white/70 px-2 py-0.5 rounded-full inline-block">
                        {memberInfo.reason === "recorded" ? "이미 차감된 당일 수업 · 추가 차감 없음" : "이 수업 상품의 잔여 0회 — 회원권 확인 필요"}
                      </div>
                    )}
                    {memberInfo.remain > 0 && memberInfo.remain <= 2 && (
                      <div className="mt-1 text-[10px] font-bold text-amber-700 bg-white/70 px-2 py-0.5 rounded-full inline-block">
                        ⚡ 만료 임박
                      </div>
                    )}
                    {memberInfo.message && <div className="mt-1 text-[10px] text-slate-600">{memberInfo.message}</div>}
                    {memberInfo.activeMs.end_date && (
                      <div className="mt-1 text-[10px] text-slate-500">만료일: {memberInfo.activeMs.end_date}</div>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-slate-500 italic">{memberInfo.message || "수업에 맞는 사용 회원권을 확인해주세요. 서명은 저장하고 차감은 관리자 확인 후 처리합니다."}</div>
                )}
              </div>

              <button type="button" disabled={memberInfo.loading} onClick={()=>setMembershipReload(x=>x+1)} className="text-[11px] text-slate-600 underline disabled:opacity-50">회원권 다시 조회</button>
              {/* v3.73.0: 보강 관리는 시간표 관리자 패널에서만 수행 */}
            </div>
          )}

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
              본 서명으로 <b>당일 출석이 저장되고 지정된 회원권만 차감</b>이 처리되며,<br/>
              서명 정보는 <b>출석 증빙 목적</b>으로 보관됩니다.
            </div>
          </div>

          {/* 사인 캠버스 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-semibold text-gray-700">사인 입력</div>
              <button onClick={clear} className="text-[11px] px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700">다시 그리기</button>
              {existingAttendance?.signature && (
                <button onClick={deleteSignature} disabled={saving} className="text-[11px] px-2 py-1 bg-red-100 hover:bg-red-200 rounded text-red-700 font-bold ml-1">🗑️ 사인 삭제</button>
              )}
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
