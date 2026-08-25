// ═══════════════════════════════════════════════════════════════
// ✅ v3.46.0 (2026-08-22): 리포트 성장 종합보고서 + 취소 필터 근본 수정
//   ⭐ 진짜 근본 원인: v3.40.3 방어 필터가 status='cancel' 슬롯을 UI에서 완전 제외
//   - 방어 필터 수정: 개별 cancel 슬롯은 UI 유지, 취소된 회원권 소속만 배제
//   - 리포트 탭 4→2 통폐합 (월간/연간 성장보고서)
//   - 6축 레이더 + LOCF 시계열 + 활동량 스택바 + AI 자동 코멘트
//   - A4 PDF 출력 (파일명: {회원명}_성장보고서_YYYY-MM.pdf)
// ✅ v3.45.8 (2026-08-22): 취소 UI 완전 정정 - "빈 카드처럼 보이던 문제" 해결
//   - QuickActionSheet 취소 버튼: "차감 없음" → "− 1회 차감" 표시
//   - 취소 시 확인창 추가 (실수 방지)
//   - 취소 슬롯 시각화: 빨간 배지 + 취소선 (선명하게 남음)
//   - 안내 문구: "취소=병결/이월과 동일" (잘못됨) → "취소=노쇼 (차감)" (정확)
// ✅ v3.45.7 (2026-08-22): "취소" = "노쇼" 동일 개념으로 통합
//   - COUNTS_AS_USED 에 "cancel" 추가 → 취소 시 회차 차감 유지
//   - 완료 → 취소 전환 시 회차 복원되지 않음 (노쇼와 동일)
//   - 라벨: "취소" → "취소(노쇼)" 로 명확화
// ═══════════════════════════════════════════════════════════════

"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import MemberSearch from "@/components/MemberSearch";
import SignatureAttendanceModal from "@/components/SignatureAttendanceModal";
import { supabase } from "@/lib/supabase";
import { getActiveBranchId, useBranchWatch } from "@/lib/branchContext";
import {
  Calendar, Plus, X, Home, ChevronLeft, ChevronRight, ChevronDown,
  Clock, User, DollarSign, Trash2, Check, XCircle,
  AlertCircle, Ban, Repeat, ArrowLeftRight, Grid3x3, LayoutGrid,
  Move, FileText
} from "lucide-react";

/* ═════ 상수 ═════ */
const DAYS_KR = ["일", "월", "화", "수", "목", "금", "토"];
const DAYS_WEEK = ["월", "화", "수", "목", "금", "토"];
const TIMES = [
  "10:00", "11:00", "13:00", "14:00", "15:00",
  "16:00", "17:00", "18:00", "19:00", "20:00"
];

// ✅ v3.40.5 hotfix: 결제 취소 여부 다중 시그널 통합 판별 헬퍼
//   파일 최상단(모든 컴포넌트/함수보다 먼저)에 배치해 참조 순서 문제 원천 차단
//   status / cancelled_at / is_cancelled / refund_status / refunded_amount /
//   연결된 memberships.status 를 모두 확인해 어느 한 조건이라도 true 면 취소로 간주
function isPaymentCancelled(p: any, memberships?: any[]): boolean {
  if (!p) return false;
  const st = String(p.status || "").toLowerCase().trim();
  if (["cancelled", "canceled", "refunded", "void", "cancel"].includes(st)) return true;
  if (p.cancelled_at) return true;
  if (p.is_cancelled === true) return true;
  if (String(p.refund_status || "").toLowerCase() === "full") return true;
  const amt = Number(p.amount || 0);
  const ref = Number(p.refunded_amount || 0);
  if (amt > 0 && ref >= amt) return true;
  if (p.membership_id && Array.isArray(memberships)) {
    const ms = memberships.find((m: any) => m?.id === p.membership_id);
    if (ms && String(ms.status || "").toLowerCase() === "cancelled") return true;
  }
  return false;
}

// ✅ v3.20.0: 7가지 상태 · 수업하지 않은 상태(병결/취소/노쇼/이월/개인사정)은 모두 회색 계열
const STATUS_OPTIONS = [
  { value: "scheduled", label: "예약",     color: "bg-blue-100 text-blue-800 border-blue-300",  dot: "bg-blue-500",   textColor: "text-blue-700" },
  { value: "done",      label: "완료",     color: "bg-green-100 text-green-800 border-green-300", dot: "bg-green-500",  textColor: "text-green-700" },
  { value: "sick",      label: "병결",     color: "bg-gray-100 text-gray-500 border-gray-300",   dot: "bg-gray-400",   textColor: "text-gray-500" },
  { value: "personal",  label: "개인사정", color: "bg-gray-100 text-gray-500 border-gray-300",   dot: "bg-gray-400",   textColor: "text-gray-500" },
  { value: "cancel",    label: "🚫 취소(노쇼)", color: "bg-red-50 text-red-700 border-red-300 line-through decoration-red-500", dot: "bg-red-500",    textColor: "text-red-700" },  // ✅ v3.45.8: 취소=노쇼, 취소 슬롯 명확하게 빨간색+취소선으로 표시
  { value: "noshow",    label: "노쇼",     color: "bg-gray-100 text-gray-500 border-gray-300",   dot: "bg-gray-400",   textColor: "text-gray-500" },
  { value: "carryover", label: "이월",     color: "bg-gray-100 text-gray-500 border-gray-300",   dot: "bg-gray-400",   textColor: "text-gray-500" },
];
// 구버전 호환: completed / cancelled 등을 통일 이름으로 매핑
const STATUS_ALIAS: Record<string, string> = {
  completed: "done",
  complete: "done",
  attended: "done",
  present: "done",
  cancelled: "cancel",
  canceled: "cancel",
  absent: "cancel",
  no_show: "noshow",
  "no-show": "noshow",
};
function normStatus(s: string | null | undefined): string {
  if (!s) return "scheduled";
  const k = String(s).toLowerCase().trim();
  return STATUS_ALIAS[k] || k;
}
function statusMeta(s: string) {
  const n = normStatus(s);
  return STATUS_OPTIONS.find(x => x.value === n) || STATUS_OPTIONS[0];
}

// 이벤트 유형 라벨
const EVENT_TYPE_LABEL: Record<string, string> = {
  lesson: "📚 수업",
  trial: "🌟 체험수업",
  revenue: "💰 매출 등록",
  staff_work: "👥 직원 근무",
  staff_off: "🏖️ 직원 휴무",
  other: "📌 기타",
};
function eventTypeLabel(t: string) { return EVENT_TYPE_LABEL[t] || t || "-"; }

// 회원권 1회 차감 대상 상태
const COUNTS_AS_USED = new Set(["done", "noshow", "cancel"]);   // ✅ v3.45.7: 완료 / 노쇼 / 취소 모두 차감 (취소 = 노쇼 개념)
// 병결 / 이월 / 예약은 차감하지 않음

/* ═════ 유틸 ═════ */
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function todayStr() { return ymd(new Date()); }
function uuid() {
  // Simple UUID v4 generator (browser has crypto.randomUUID but fall back for safety)
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) return (crypto as any).randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// 월 그리드용 6주 × 7일 배열 생성
function monthGrid(year: number, month0: number) {
  const first = new Date(year, month0, 1);
  const firstWeekday = first.getDay();
  const start = new Date(year, month0, 1 - firstWeekday);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return cells;
}

/* ═════ 메인 컴포넌트 ═════ */
export default function SchedulePage() {
  const [view, setView] = useState<"month" | "week" | "day">("month");
  // ✅ v3.38.0: 수중/지상 시간표 토글 (aqua = 수중재활, ground = 지상재활)
  const [trackTab, setTrackTab] = useState<"aqua" | "ground">("aqua");
  // ✅ v3.38.0: 지상재활 수업 완료 후 다음 예약 팝업
  const [nextBookingPopup, setNextBookingPopup] = useState<{ member_id: string; member_name: string; last_staff_id?: string; last_time?: string } | null>(null);
  // ✅ v3.26.9: hydration mismatch 방지 - 초기값 0 / 빈문자열, 마운트 후 useEffect에서 설정
  const [year, setYear]     = useState<number>(0);
  const [month0, setMonth0] = useState<number>(0);
  const [selectedDate, setSelectedDate] = useState<string>("");
  useEffect(() => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth0(now.getMonth());
    setSelectedDate(todayStr());
  }, []);

  const [slots, setSlots]     = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [staff, setStaff]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [modal, setModal] = useState<{date: string, time?: string, editing?: any} | null>(null);
  const [f, setF]         = useState<any>({});
  const [saving, setSaving] = useState(false);

  // Drag & drop
  const [dragging, setDragging] = useState<any | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  // Quick action sheet (예약 클릭 시)
  const [quickAction, setQuickAction] = useState<any | null>(null);
  // ✅ v3.29.0: +더보기 모달 (당일 전체 회원 리스트)
  const [dayListModal, setDayListModal] = useState<{ date: string; slots: any[] } | null>(null);
  // ✅ v3.29.0: 보강 선택 모드 - 상단 보강 배지 클릭 시 설정
  const [makeupSelectMode, setMakeupSelectMode] = useState<{ member_id: string; makeup_ticket_id?: string; member_name?: string } | null>(null);
  // ✅ v3.20.1: 사인 출결 모달
  const [signatureSlot, setSignatureSlot] = useState<any | null>(null);
  // ✅ v3.20.11: 매출 상세 팝오버 (셔 설정 날짜별)
  const [revenueDetailDate, setRevenueDetailDate] = useState<string | null>(null);
  const [actionSheet, setActionSheet] = useState<{ date: string; time?: string } | null>(null);
  // ✅ v3.17.1: 더블클릭 시 onClick 지연 취소용 ref
  const clickTimerRef = useRef<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  // ✅ v3.20.9: 시간표 셀에 회원권 자동 표시를 위해 memberships 로드
  const [memberships, setMemberships] = useState<any[]>([]);
  // ✅ v3.16.1: 인라인 결제 등록 모달
  // v3.21.3: paymentModal state 제거 – /payments 리다이렉트로 대체
  // ✅ v3.20.7: 지점 시간표 설정 - 설정 페이지와 동일한 기본값 (interval 70=1시간 10분, duration 40)
  const [scheduleConfig, setScheduleConfig] = useState<any>({
    open_time: "10:00", close_time: "22:00", slot_interval: 70, slot_duration: 40,
    lunch_break: { enabled: false, start: "12:00", end: "13:00" },
    custom_slots: [] as string[],
  });
  const [scheduleConfigLoaded, setScheduleConfigLoaded] = useState(false);

  // ✅ v3.28.3: 초기 로드 + 연/월 변경 시 자동 재조회 (year/month0이 설정된 이후에만)
  useEffect(() => { loadScheduleConfig(); }, []);
  useEffect(() => {
    if (year > 0) loadAll();
  }, [year, month0]);

  // ✅ v3.20.4: 시간표 설정 저장 시 즉시 재로드 + 지점 전환 이벤트 수신
  useEffect(() => {
    const onConfigChanged = (e: any) => {
      const activeBid = getActiveBranchId();
      if (!e?.detail?.branchId || e.detail.branchId === activeBid) {
        loadScheduleConfig();
      }
    };
    window.addEventListener("aqu:schedule_config_changed", onConfigChanged);
    return () => window.removeEventListener("aqu:schedule_config_changed", onConfigChanged);
  }, []);

  // ✅ v3.20.6: 지점별 schedule_config 로드 (setScheduleConfig 함수 형태 → 최신 state 기준으로 병합)
  async function loadScheduleConfig() {
    const branchId = getActiveBranchId();
    if (!branchId) { setScheduleConfigLoaded(true); return; }
    const { data } = await supabase.from("branches").select("schedule_config").eq("id", branchId).maybeSingle();
    let loaded: any = null;
    if (data?.schedule_config && typeof data.schedule_config === "object") {
      loaded = data.schedule_config;
    } else if (typeof window !== "undefined") {
      const local = window.localStorage.getItem(`aqu_schedule_config_${branchId}`);
      if (local) { try { loaded = JSON.parse(local); } catch {} }
    }
    if (loaded) {
      setScheduleConfig((prev: any) => ({ ...prev, ...loaded }));
    }
    setScheduleConfigLoaded(true);
  }

  // 지점 시간표 설정을 기반으로 생성된 타임 옵션
  const timeSlotOptions = useMemo(() => {
    if (scheduleConfig.custom_slots && scheduleConfig.custom_slots.length > 0) return scheduleConfig.custom_slots;
    const out: string[] = [];
    const [oh, om] = (scheduleConfig.open_time || "10:00").split(":").map(Number);
    const [ch, cm] = (scheduleConfig.close_time || "22:00").split(":").map(Number);
    let cur = oh * 60 + om;
    const end = ch * 60 + cm;
    const interval = Number(scheduleConfig.slot_interval || 10);
    const dur = Number(scheduleConfig.slot_duration || 40);
    const lb = scheduleConfig.lunch_break;
    const ls = lb?.enabled ? (() => { const [h, m] = lb.start.split(":").map(Number); return h * 60 + m; })() : null;
    const le = lb?.enabled ? (() => { const [h, m] = lb.end.split(":").map(Number); return h * 60 + m; })() : null;
    while (cur + dur <= end && out.length < 200) {
      const inLunch = ls !== null && le !== null && cur < le && cur + dur > ls;
      if (!inLunch) {
        const h = String(Math.floor(cur / 60)).padStart(2, "0");
        const m = String(cur % 60).padStart(2, "0");
        out.push(`${h}:${m}`);
      }
      cur += interval;
    }
    return out;
  }, [scheduleConfig]);

  const [plans, setPlans] = useState<any[]>([]);

  async function loadAll() {
    setLoading(true);
    const branchId = getActiveBranchId();
    console.log(`[v3.34.2] loadAll 시작 - branch_id=${branchId || "(없음)"} (build: v3.34.2 · SQL deleted_at 안전가드 + 대시보드 라이트모드 + 근무직원 퇴사자 제외)`);
    // ✅ branch_id 필터 (컴럼 미존재 시 폴백)
    const safeBranchQuery = async (baseFn: () => any, filterFn: (q: any) => any) => {
      if (!branchId) return await baseFn();
      const r = await filterFn(baseFn());
      if (r.error && (r.error.code === "42703" || r.error.message?.includes("branch_id"))) {
        return await baseFn();
      }
      return r;
    };
    // ✨ v3.32.2: 2025-00-01 400 오류 근본 차단 - month0는 0기반(0~11), SQL/ISO는 1기반(01~12)
    const startY = year || new Date().getFullYear();
    const startM0 = (typeof month0 === "number" && month0 >= 0 && month0 <= 11) ? month0 : new Date().getMonth();
    // 매월 1일 ~ 다음달 마지막일 (2개월 범위 - 이월/보강 파이프라인 고려)
    const rangeStart = `${startY}-${String(startM0 + 1).padStart(2, "0")}-01`; // 핵심: +1 반드시 적용
    const endD = new Date(startY, startM0 + 2, 0); // 다음달 마지막일
    const rangeEnd = `${endD.getFullYear()}-${String(endD.getMonth()+1).padStart(2,"0")}-${String(endD.getDate()).padStart(2,"0")}`;
    // 안전 가드: rangeStart/End 유효성 검증
    if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(rangeStart) || !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(rangeEnd)) {
      console.error(`[v3.34.2] ❌ 잘못된 날짜 범위 감지! rangeStart=${rangeStart}, rangeEnd=${rangeEnd}, year=${year}, month0=${month0}`);
      setLoading(false);
      return;
    }
    console.log(`[v3.34.2] fetch range: ${rangeStart} ~ ${rangeEnd} (year=${startY}, month0=${startM0})`);

    const fetchSchedule = async () => {
      const attempts = [
        // 1) 날짜 범위 + branch_id 필터
        () => branchId
          ? supabase.from("schedule_slots").select("*").or(`branch_id.eq.${branchId},branch_id.is.null`).gte("event_date", rangeStart).lte("event_date", rangeEnd).order("event_date").order("time_slot").range(0, 99999)
          : supabase.from("schedule_slots").select("*").gte("event_date", rangeStart).lte("event_date", rangeEnd).order("event_date").order("time_slot").range(0, 99999),
        // 2) branch_id 없이 날짜 범위만
        () => supabase.from("schedule_slots").select("*").gte("event_date", rangeStart).lte("event_date", rangeEnd).order("event_date").order("time_slot").range(0, 99999),
        // 3) 날짜 범위만 (정렬 없이)
        () => supabase.from("schedule_slots").select("*").gte("event_date", rangeStart).lte("event_date", rangeEnd).range(0, 99999),
        // 4) 최종 fallback: 전체 (과거 히스토리 수식 모드)
        () => supabase.from("schedule_slots").select("*").order("event_date", { ascending: false }).range(0, 99999),
      ];
      for (let i = 0; i < attempts.length; i++) {
        try {
          const r = await attempts[i]();
          if (!r.error) {
            console.log(`[v3.28.3] fetchSchedule attempt ${i+1} 성공: ${r.data?.length || 0}건`);
            return r;
          }
          console.warn(`[v3.28.3] attempt ${i+1} 실패:`, r.error.message);
        } catch (e) { console.warn(`[v3.28.3] attempt ${i+1} exception:`, e); }
      }
      return { data: [], error: null };
    };
    const [sRes, mRes, stRes, pRes, aRes, plRes, msRes] = await Promise.all([
      fetchSchedule(),
      safeBranchQuery(
        () => supabase.from("members").select("id, name, member_type, status, phone").is("deleted_at", null).order("name"),
        (q: any) => q.eq("branch_id", branchId).order("name")
      ),
      safeBranchQuery(
        () => supabase.from("staff").select("id, name, role, color, is_resigned, resign_date").order("name"),
        (q: any) => q.eq("branch_id", branchId).order("name")
      ),
      safeBranchQuery(
        () => supabase.from("payments").select("*").order("paid_at", { ascending: false }),
        (q: any) => q.eq("branch_id", branchId).order("paid_at", { ascending: false })
      ),
      supabase.from("attendance").select("*"),
      supabase.from("membership_plans").select("*"),
      // ✅ v3.20.9: memberships 자동 로드 → 시간표 셀에 회원권 이름 + 잔여/총회수 자동 표시
      supabase.from("memberships").select("id, member_id, plan_name, total_sessions, used_sessions, adjustment, end_date, status"),
    ]);
    // ✅ v3.29.2: State 실시간 sync 강화 - 로그 + 단순 배열 교체 + 버전 마커
    let rawSlots = Array.isArray(sRes?.data) ? sRes.data : [];
    console.log(`[v3.37.0] schedule_slots 로드 완료: ${rawSlots.length}건`);

    // ✅ v3.46.0: 방어 필터 수정 - 개별 status='cancel' 은 UI에 표시 (취소=노쇼 개념)
    //   기존 v3.40.3 필터: 취소 슬롯을 화면에서 완전 제외 → 사용자가 "삭제된 것"으로 오인
    //   변경: 취소된 회원권 소속 슬롯만 배제 (결제 취소된 미래 예약 방어)
    //   개별 status='cancel' 슬롯은 취소선 배지로 UI에 남김 (v3.45.7 취소=노쇼 정책)
    const cancelledMembershipIds = new Set(
      ((msRes as any)?.data || [])
        .filter((m: any) => (m?.status || "").toLowerCase() === "cancelled")
        .map((m: any) => m.id)
    );
    const beforeCount = rawSlots.length;
    rawSlots = rawSlots.filter((slot: any) => {
      // ✅ v3.46.0: 개별 status='cancel' 은 표시 유지 (취소선 배지로 노쇼 이력 보존)
      // 취소된 회원권과 연결된 슬롯은 배제 (결제 취소된 미래 예약 방어)
      if (slot?.membership_id && cancelledMembershipIds.has(slot.membership_id)) return false;
      return true;
    });
    const filteredOut = beforeCount - rawSlots.length;
    if (filteredOut > 0) {
      console.log(`[v3.40.3] 취소 회원권/슬롯 방어 필터: ${filteredOut}건 제외 (표시=${rawSlots.length}건)`);
    }

      // 🚨 v3.37.1: 반복예약 자동 인스턴스 생성 로직 완전 비활성화
      // 이유: v3.37.0에서 사용자가 삭제한 슬롯을 매번 로드마다 다시 생성하는 부작용 발생
      // 반복예약은 등록 시점에 4주치 개별 INSERT되므로 자동 생성 불필요
      console.log(`[v3.37.1] 반복예약 자동 생성 로직 비활성 - 기존 DB 슬롯만 사용`);
      console.log(`[v3.37.0] schedule_slots 로드 완료: ${rawSlots.length}건`);
    if (rawSlots.length > 0 && rawSlots[0]) {
      console.log(`[v3.28.2] 샘플 row keys:`, Object.keys(rawSlots[0]));
    }
    // ✅ v3.28.2: 클라이언트 측 branch_id 2차 필터링 제거 → 서버에서 이미 필터 완료
    setSlots(rawSlots);
    setMembers(mRes.data || []);
    // v3.21.2: 시간표·상담 매칭에서 퇴사자 자동 배제
    const activeStaff = (stRes.data || []).filter((s: any) => {
      const status = String(s.status || "").toLowerCase();
      if (["resigned", "retired", "inactive", "terminated", "quit", "leave"].includes(status)) return false;
      if (s.is_active === false) return false;
      if (s.is_resigned === true) return false;
      if (s.resign_date) return false;
      return true;
    });
    setStaff(activeStaff);
    setPayments(pRes.data || []);
    setAttendance(aRes.data || []);
    setPlans(plRes.data || []);
    setMemberships(msRes.data || []);
    setLoading(false);
  }

  // ✅ 지점 전환 이벤트 감지
  useBranchWatch(() => loadAll());

  // 예약 클릭 시 액션 시트 열기
  function openQuickAction(slot: any) {
    setQuickAction(slot);
  }

  // 출결 상태 변경 (5가지: done/noshow/sick/carryover/cancel)
  async function setAttendanceStatus(slot: any, status: "done" | "noshow" | "sick" | "personal" | "carryover" | "cancel" | "scheduled") {
    if (!slot.member_id || !slot.event_date) {
      alert("회원/날짜 정보가 없는 예약입니다.");
      return;
    }
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;

    // ✅ v3.20.1: scheduled로 되돌릴 때는 기존 attendance 레코드 삭제
    if (status === "scheduled") {
      const existing = attendance.find((a: any) => a.member_id === slot.member_id && (a.date === slot.event_date || a.attendance_date === slot.event_date || a.session_date === slot.event_date));
      if (existing) {
        // ✅ v3.25.0: Hard Delete
        const _attDel = await supabase.from("attendance").delete().eq("id", existing.id);
        if (_attDel.error && _attDel.error.code === "42703") { await supabase.from("attendance").delete().eq("id", existing.id); }
      }
    }
    // attendance 기록은 done/cancel이 명확한 경우에만 저장 (선택적 보조 로그)
    if (status === "done" || status === "noshow" || status === "sick" || status === "personal") {
      // 컬럼명 자동 감지 (date / attendance_date / session_date)
      const dateCol = attendance[0]?.date !== undefined ? "date"
        : attendance[0]?.attendance_date !== undefined ? "attendance_date"
        : attendance[0]?.session_date !== undefined ? "session_date"
        : "date";
      const attStatus = status === "done" ? "present" : status === "noshow" ? "absent" : status === "sick" ? "sick" : "personal";
      // ✅ v3.24.4: 중복 삽입 원천 차단 - slot_id 우선, 없으면 member_id + 날짜 + time_slot 조합으로 매칭
      const slotDateStr = typeof slot.event_date === "string" ? slot.event_date.substring(0, 10) : new Date(slot.event_date).toISOString().substring(0, 10);
      const existing = attendance.find((a: any) => {
        if (a.deleted_at) return false;
        if (a.slot_id && a.slot_id === slot.id) return true;
        if (a.member_id !== slot.member_id) return false;
        const aDate = a.attend_date || a.date || a.attendance_date || a.session_date;
        if (!aDate) return false;
        const aDateStr = typeof aDate === "string" ? aDate.substring(0, 10) : new Date(aDate).toISOString().substring(0, 10);
        if (aDateStr !== slotDateStr) return false;
        // time_slot이 있으면 일치해야 중복으로 간주 (연타임 구분)
        if (slot.time_slot && a.time_slot && a.time_slot !== slot.time_slot) return false;
        return true;
      });
      if (existing) {
        await supabase.from("attendance").update({ status: attStatus, slot_id: slot.id }).eq("id", existing.id);
      } else {
        // ✅ v3.24.4: DB에서 다시 한 번 실시간 중복 체크 (attendance state가 오래된 경우 대비)
        for (const dateCheck of ["attend_date", "date", "attendance_date", "session_date"]) {
          try {
            const dupCheck = await supabase.from("attendance")
              .select("id").eq("member_id", slot.member_id).eq(dateCheck, slotDateStr)
              .is("deleted_at", null).limit(1);
            if (!dupCheck.error && dupCheck.data && dupCheck.data.length > 0) {
              // 이미 DB에 있으면 삽입 안하고 업데이트
              await supabase.from("attendance").update({ status: attStatus, slot_id: slot.id }).eq("id", dupCheck.data[0].id);
              return;
            }
          } catch {}
        }
        const payload: any = { org_id: orgId, member_id: slot.member_id, status: attStatus, slot_id: slot.id };
        if (slot.time_slot) payload.time_slot = slot.time_slot;
        payload[dateCol] = slot.event_date;
        let { error } = await supabase.from("attendance").insert(payload);
        if (error && /Could not find the '(date|attendance_date|session_date)' column/.test(error.message)) {
          for (const alt of ["date", "attendance_date", "session_date"]) {
            const p: any = { org_id: orgId, member_id: slot.member_id, status: attStatus, slot_id: slot.id };
            if (slot.time_slot) p.time_slot = slot.time_slot;
            p[alt] = slot.event_date;
            const res = await supabase.from("attendance").insert(p);
            if (!res.error) break;
          }
        }
      }
    }

    // schedule_slots의 status 동기화 (대이렉트 값 저장)
    const prevStatus = normStatus(slot.status);
    await supabase.from("schedule_slots").update({ status }).eq("id", slot.id);

    // 회원권 자동 차감/복원 로직
    //  - 이전이 차감대상(done/noshow) 아니고 이번이 차감대상 → used_sessions++
    //  - 이전이 차감대상였는데 이번이 차감대상 아닐 → used_sessions-- (복원)
    let sessionMsg = "";
    try {
      if (slot.member_id) {
        let target: any = null;
        if (slot.membership_id) {
          const { data } = await supabase.from("memberships").select("*").eq("id", slot.membership_id).maybeSingle();
          target = data;
        }
        if (!target) {
          // ✅ v3.48.0: FIFO - 잔여>0인 가장 오래된 회원권부터 차감 (음수 차감 원천 차단)
          const today = new Date().toISOString().slice(0, 10);
          const { data } = await supabase.from("memberships")
            .select("*")
            .eq("member_id", slot.member_id)
            .neq("status", "cancelled")
            .order("start_date", { ascending: true })
            .order("created_at", { ascending: true });
          target = (data || []).find((m: any) =>
            (!m.start_date || m.start_date <= today) && (!m.end_date || m.end_date >= today) &&
            ((m.total_sessions || 0) + (m.adjustment || 0) - (m.used_sessions || 0)) > 0
          ) || null;
        }

        if (target) {
          const wasUsed = COUNTS_AS_USED.has(prevStatus);
          const isUsed = COUNTS_AS_USED.has(status);
          // ✅ v3.12: 노쇼 정책 분기 (차감/이월/환불)
          const noshowPolicy = target.noshow_policy || "deduct";

          if (status === "noshow") {
            // 노쇼 적용 정책
            if (noshowPolicy === "carryover") {
              // 이월: used_sessions는 차감하지 않고 carryover_count +1
              if (!wasUsed) {
                await supabase.from("memberships").update({
                  carryover_count: (target.carryover_count || 0) + 1,
                  updated_at: new Date().toISOString(),
                }).eq("id", target.id);
                try {
                  await supabase.from("schedule_slots").update({
                    membership_id: target.id,
                    noshow_action: "carried_over",
                    noshow_processed_at: new Date().toISOString(),
                  }).eq("id", slot.id);
                } catch {}
                sessionMsg = " (회원권 1회 이월)";
              }
            } else if (noshowPolicy === "refund") {
              // 환불: 차감하지 않음 (수동 환불 필요 — 안내만)
              if (!wasUsed) {
                try {
                  await supabase.from("schedule_slots").update({
                    membership_id: target.id,
                    noshow_action: "refunded",
                    noshow_processed_at: new Date().toISOString(),
                  }).eq("id", slot.id);
                } catch {}
                sessionMsg = " (환불 대상 — 결제 페이지에서 수동 환불 필요)";
              }
            } else {
              // 기본: 차감
              if (!wasUsed) {
                await supabase.from("memberships").update({
                  used_sessions: (target.used_sessions || 0) + 1,
                  updated_at: new Date().toISOString(),
                }).eq("id", target.id);
                try {
                  await supabase.from("schedule_slots").update({
                    membership_id: target.id,
                    noshow_action: "deducted",
                    noshow_processed_at: new Date().toISOString(),
                  }).eq("id", slot.id);
                } catch {
                  await supabase.from("schedule_slots").update({ membership_id: target.id }).eq("id", slot.id);
                }
                sessionMsg = " (회원권 1회 차감)";
              }
            }
          } else if (!wasUsed && isUsed) {
            // 일반 완료: 차감
            await supabase.from("memberships").update({
              used_sessions: (target.used_sessions || 0) + 1,
              updated_at: new Date().toISOString(),
            }).eq("id", target.id);
            await supabase.from("schedule_slots").update({ membership_id: target.id }).eq("id", slot.id);
            sessionMsg = " (회원권 1회 차감)";
          } else if (wasUsed && !isUsed) {
            // 복원
            const prevAction = slot.noshow_action;
            if (prevAction === "carried_over") {
              // 이월 취소: carryover_count -1
              await supabase.from("memberships").update({
                carryover_count: Math.max(0, (target.carryover_count || 0) - 1),
                updated_at: new Date().toISOString(),
              }).eq("id", target.id);
              sessionMsg = " (이월 취소)";
            } else {
              // 일반 복원
              const used = Math.max(0, (target.used_sessions || 0) - 1);
              await supabase.from("memberships").update({
                used_sessions: used,
                updated_at: new Date().toISOString(),
              }).eq("id", target.id);
              sessionMsg = " (회원권 1회 복원)";
            }
            // noshow_action 정리
            try {
              await supabase.from("schedule_slots").update({ noshow_action: null }).eq("id", slot.id);
            } catch {}
          }
        }
      }
    } catch (e) { console.warn("회원권 자동 차감 실패:", e); }

    // ✅ v3.37.0: 시간표에서 병결/개인사정 처리 시 makeup_history 자동 생성
    let makeupMsg = "";
    try {
      const isMakeupSlot = slot.event_type === "makeup" || slot.is_makeup_reservation === true;

      if ((status === "sick" || status === "personal") && !isMakeupSlot) {
        // 이미 있는지 체크 (중복 방지)
        const { data: existing } = await supabase.from("makeup_history")
          .select("id, status")
          .eq("original_slot_id", slot.id)
          .is("deleted_at", null)
          .maybeSingle();

        if (!existing) {
          const absenceDate = typeof slot.event_date === "string" ? slot.event_date.substring(0, 10)
            : new Date(slot.event_date).toISOString().substring(0, 10);
          const deadline = new Date(new Date(absenceDate + "T00:00:00").getTime() + 30 * 86400000).toISOString().slice(0, 10);

          const { error: mhErr } = await supabase.from("makeup_history").insert({
            org_id: orgId,
            member_id: slot.member_id,
            original_slot_id: slot.id,
            absence_date: absenceDate,
            absence_type: status,
            notification_time: "before_10am", // 시간표 등록은 기본 사전 통보로 간주
            is_eligible: true,
            makeup_deadline: deadline,
            status: "pending",
          });
          if (!mhErr) {
            makeupMsg = `\n\n🎯 보강 이력 자동 생성 (만료: ${deadline})`;
            console.log(`[v3.37.0] ✅ 보강 이력 자동 생성: slot=${slot.id.slice(0,8)} member=${slot.member_id.slice(0,8)} 만료=${deadline}`);
          } else {
            console.warn("[v3.37.0] 보강 이력 자동 생성 실패:", mhErr.message);
          }
        }
      }

      // ✅ v3.37.0: 보강 슬롯 상태를 done으로 변경 시 → 원본 makeup_history 자동 완료 처리
      if (status === "done" && isMakeupSlot && slot.original_absence_slot_id) {
        const { error: cErr } = await supabase.from("makeup_history")
          .update({ status: "completed", makeup_completed_at: new Date().toISOString(), makeup_slot_id: slot.id })
          .eq("original_slot_id", slot.original_absence_slot_id);
        if (!cErr) {
          makeupMsg = "\n\n✅ 원본 결석의 보강 완료 처리됨";
          console.log(`[v3.37.0] ✅ 보강 완료 자동 처리: makeup_slot=${slot.id.slice(0,8)}`);
        }
      }

      // ✅ v3.37.0: scheduled로 되돌릴 때 → 방금 생성된 보강 이력도 삭제
      if (status === "scheduled") {
        const { data: existingMh } = await supabase.from("makeup_history")
          .select("id, status")
          .eq("original_slot_id", slot.id)
          .in("status", ["pending", "reserved"])
          .is("deleted_at", null);
        if (existingMh && existingMh.length > 0) {
          await supabase.from("makeup_history")
            .update({ deleted_at: new Date().toISOString() })
            .in("id", existingMh.map((r: any) => r.id));
          makeupMsg = "\n\n🔄 대응 보강 이력도 취소됨";
          console.log(`[v3.37.0] 🔄 보강 이력 취소: ${existingMh.length}건`);
        }
      }
    } catch (e) { console.warn("[v3.37.0] makeup_history 자동 처리 실패:", e); }

    // ✅ v3.38.0: 지상재활 수업 완료 시 다음 예약 팝업 자동 렌더링
    let groundBookingMsg = "";
    try {
      const isGroundTrack = (slot.track || "aqua") === "ground";
      if (isGroundTrack && status === "done" && slot.member_id) {
        // 다음 예약 팝업 예약 정보 설정
        const memberInfo = members.find((m: any) => m.id === slot.member_id);
        setNextBookingPopup({
          member_id: slot.member_id,
          member_name: memberInfo?.name || "(회원)",
          last_staff_id: slot.staff_id,
          last_time: slot.time_slot,
        });
        groundBookingMsg = "\n\n🏋️‍♂️ 지상재활 완료 - 다음 예약 팝업 자동 렌더링";
      }
    } catch (e) { console.warn("[v3.38.0] 지상재활 다음 예약 팝업 실패:", e); }

    await loadAll();
    // ✅ v3.20.1: QuickActionSheet 자동 닫기 + 화면 즉시 갱신
    setQuickAction(null);
    const labels: Record<string, string> = {
      done: "✅ 완료", noshow: "🚩 노쇼", sick: "🤒 병결",
      personal: "📝 개인사정", carryover: "📅 이월", cancel: "🚫 취소(노쇼·차감유지)",
      scheduled: "🔄 예약으로 되돌림",
    };
    alert((labels[status] || status) + sessionMsg + makeupMsg + groundBookingMsg);
  }

  // 결제 추가 (회원권 자동 생성 포함)
  async function addPaymentFromSlot(slot: any, payment: any) {
    if (!slot.member_id) { alert("회원 정보가 없습니다."); return; }
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;

    // 결제 일시는 예약 날짜 기준으로 저장
    const paidAt = slot.event_date || new Date().toISOString().split("T")[0];

    // 1) 회원권 자동 생성 (회차/기간 정보가 있을 때)
    let membershipId: string | null = null;
    let planName = payment.lesson_name || payment.plan_name || "수업";
    let totalSessions = Number(payment.sessions) || 0;
    let validDays = Number(payment.valid_days) || 90;

    // 명시적 plan_id가 있으면 membership_plans에서 정보 보강
    if (payment.plan_id) {
      try {
        const { data: planData } = await supabase.from("membership_plans").select("*").eq("id", payment.plan_id).maybeSingle();
        if (planData) {
          planName = planData.name;
          totalSessions = planData.sessions || totalSessions;
          validDays = planData.valid_days || validDays;
        }
      } catch {}
    }

    // 회원권 자동 생성 (모든 결제에 대해 무조건 생성, 캴험/직접입력도 1회권으로)
    let membershipCreateError: string | null = null;
    const safeSessions = Math.max(1, totalSessions || 1);
    {
      const endDate = new Date(paidAt);
      endDate.setDate(endDate.getDate() + validDays);
      const msPayload: any = {
        org_id: orgId,
        member_id: slot.member_id,
        plan_name: planName,
        total_sessions: safeSessions,
        used_sessions: 0,
        start_date: paidAt,
        end_date: endDate.toISOString().slice(0, 10),
        price: payment.amount,
        status: "active",
      };
      // v3.21.2: memberships 컬럼명 자동 매핑 (amount ↔ price ↔ total_price)
      let lastMsErr: any = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        const { data, error } = await supabase.from("memberships").insert(msPayload).select().single();
        if (!error) { membershipId = data?.id || null; lastMsErr = null; break; }
        lastMsErr = error;
        const msg = String(error.message || "");
        const m = msg.match(/'([^']+)' column|column "([^"]+)"|column ([\w_]+) of|find the '([^']+)'/);
        const missing = m?.[1] || m?.[2] || m?.[3] || m?.[4];
        // 캐시 미발견 컬럼 = 데이터 값을 다른 이름으로 적재 시도
        if (missing === "amount" && "price" in msPayload) { msPayload.amount = msPayload.price; delete msPayload.price; continue; }
        if (missing === "price" && "amount" in msPayload) { msPayload.price = msPayload.amount; delete msPayload.amount; continue; }
        if (missing === "total_price" && ("price" in msPayload || "amount" in msPayload)) { msPayload.total_price = msPayload.price ?? msPayload.amount; delete msPayload.price; delete msPayload.amount; continue; }
        if (missing && missing in msPayload) { delete msPayload[missing]; continue; }
        // 메시지에 amount/price가 보이면 미식별 컬럼도 자동 제거
        if (/schema cache/i.test(msg)) {
          if ("price" in msPayload) { delete msPayload.price; continue; }
          if ("amount" in msPayload) { delete msPayload.amount; continue; }
        }
        console.warn("membership insert 실패:", error);
        break;
      }
      if (!membershipId && lastMsErr) membershipCreateError = lastMsErr.message;
    }

    // 재결제 자동 연결: 같은 slot에 취소된 결제가 있으면 replaces 필드에 기록
    let replacesId: string | null = null;
    try {
      const { data: prevCancelled } = await supabase.from("payments")
        .select("id")
        .eq("slot_id", slot.id)
        .eq("status", "cancelled")
        .is("replaced_by", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (prevCancelled && prevCancelled.length > 0) replacesId = prevCancelled[0].id;
    } catch {}

    // 2) 결제 로그 저장 (스키마 불일치 컬럼 자동 제거)
    const paymentPayload: any = {
      org_id: orgId,
      member_id: slot.member_id,
      membership_id: membershipId,
      amount: payment.amount,
      method: payment.method,
      lesson_name: planName,
      description: planName,
      plan_id: payment.plan_id || null,
      card_number: payment.card_number || null,
      approval_no: payment.approval_no || null,
      paid_time: payment.paid_time || null,
      paid_at: paidAt,
      event_date: slot.event_date,
      slot_id: slot.id,
      status: "active",
      replaces: replacesId,
    };
    // 반복적으로 시도 → 없는 컬럼 자동 제거
    let lastErr: any = null;
    let ok = false;
    for (let attempt = 0; attempt < 15; attempt++) {
      const { error } = await supabase.from("payments").insert(paymentPayload).select();
      if (!error) { ok = true; break; }
      lastErr = error;
      const m = error.message.match(/'([^']+)' column|column "([^"]+)"/);
      const missing = m?.[1] || m?.[2];
      if (missing && missing in paymentPayload) { delete paymentPayload[missing]; continue; }
      break;
    }
    if (!ok) return alert("결제 등록 실패: " + (lastErr?.message || "알수 없는 오류") + "\n\n💡 AQUNOTE_V37_FIX5.sql + FIX6.sql을 Supabase에 실행해 주세요.");

    // 재결제 링크: 이전 취소 결제에 replaced_by 기록
    if (replacesId) {
      try {
        // 새 삽입된 결제 ID 가져오기
        const { data: newPay } = await supabase.from("payments")
          .select("id").eq("slot_id", slot.id).eq("status", "active")
          .order("created_at", { ascending: false }).limit(1);
        if (newPay && newPay.length > 0) {
          await supabase.from("payments").update({ replaced_by: newPay[0].id }).eq("id", replacesId);
        }
      } catch {}
    }

    // 3) 예약 slot에 membership_id 연결 (이후 자동 차감용)
    if (membershipId) {
      try {
        await supabase.from("schedule_slots").update({ membership_id: membershipId }).eq("id", slot.id);
      } catch {}
    }

    await loadAll();
    if (membershipCreateError) {
      alert(`⚠️ 결제는 저장됐지만 회원권 자동 생성에 실패했습니다.\n\n오류: ${membershipCreateError}\n\n💡 AQUNOTE_V37_FIX8.sql 을 Supabase SQL Editor에서 실행해 주세요.\n   실행후 이 결제를 삭제·재등록하면 회원권이 자동 생성됩니다.`);
    } else {
      alert(`✅ 결제 등록 + 회원권 ${safeSessions}회 자동 생성되었습니다`);
    }
  }

  // 결제 취소 (이력 보존 → status='cancelled')
  async function deletePayment(id: string) {
    const { data: pay } = await supabase.from("payments").select("*, memberships(id, plan_name, total_sessions, used_sessions, status)").eq("id", id).maybeSingle();
    if (!pay) { alert("결제 정보를 찾을 수 없습니다"); return; }

    if (pay.status === "cancelled") { alert("이미 취소된 결제입니다"); return; }

    let msg = `이 결제를 취소하시겠습니까?\n\n· 금액: ₩${(pay.amount || 0).toLocaleString()}\n· 날짜: ${pay.paid_at}\n· 결제수단: ${pay.method}`;
    if (pay.memberships?.id) {
      msg += `\n\n연결 회원권: ${pay.memberships.plan_name} (${pay.memberships.total_sessions}회, 사용 ${pay.memberships.used_sessions}회)\n→ 회원권도 함께 취소됩니다 (이력 보존)`;
    }
    msg += `\n\n💡 이력은 삭제되지 않고 “취소” 상태로 남습니다.\n   재결제 시 새 결제와 자동 연결됩니다.`;
    if (!confirm(msg)) return;

    const reason = prompt("취소 사유를 입력해 주세요 (선택)", "고객 요청·재결제");
    if (reason === null) return; // 취소

    const now = new Date().toISOString();

    // 1) 회원권을 cancelled로 변경 (삭제 아님 - 이력 보존)
    if (pay.memberships?.id) {
      const { error: msErr } = await supabase.from("memberships").update({
        status: "cancelled",
        cancelled_at: now,
        cancelled_reason: reason || "결제 취소",
        updated_at: now,
      }).eq("id", pay.memberships.id);
      if (msErr) { alert("회원권 상태 변경 실패: " + msErr.message); return; }
      // slot의 membership_id 링크는 재결제에서 갱신되도록 임시 해제
      try { await supabase.from("schedule_slots").update({ membership_id: null }).eq("membership_id", pay.memberships.id); } catch {}
    }

    // 2) 결제를 cancelled로 변경
    const { error } = await supabase.from("payments").update({
      status: "cancelled",
      cancelled_at: now,
      cancelled_reason: reason || "결제 취소",
    }).eq("id", id);
    if (error) { alert("결제 취소 실패: " + error.message + "\n\n💡 AQUNOTE_V37_FIX6.sql 을 Supabase에 실행해 주세요."); return; }

    await loadAll();
    alert("✅ 결제가 취소되었습니다 (이력 보존됨)");
  }

  function prevMonth() {
    if (month0 === 0) { setYear(year - 1); setMonth0(11); }
    else setMonth0(month0 - 1);
  }
  function nextMonth() {
    if (month0 === 11) { setYear(year + 1); setMonth0(0); }
    else setMonth0(month0 + 1);
  }
  function goToday() {
    const d = new Date();
    setYear(d.getFullYear()); setMonth0(d.getMonth());
    setSelectedDate(todayStr());
  }

  const slotsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    // ✅ v3.38.0: 트랙 필터 적용 - 수중/지상 분리 렌더링
    const trackFilteredSlots = slots.filter((s: any) => {
      if (!s) return false;
      const slotTrack = s.track || "aqua"; // 기본값 수중재활
      return slotTrack === trackTab;
    });
    console.log(`[v3.38.0] slotsByDate 매핑 시작: 전체=${slots.length}, ${trackTab}트랙=${trackFilteredSlots.length}`);
    let skipped = 0;
    trackFilteredSlots.forEach((s: any) => {
      if (!s || !s.event_date) { skipped++; return; }
      // ✅ v3.28.2: KST/UTC 타임존 안전 매핑 - Date 객체 경유 안함
      let key: string;
      if (typeof s.event_date === "string") {
        // "2024-08-10" 또는 "2024-08-10T00:00:00+00:00" 모두 substring(0,10)으로 안전하게 추출
        key = s.event_date.substring(0, 10);
      } else {
        // Date 객체인 경우 - toISOString은 UTC로 바꾸므로 하루 오차 가능
        // 로컬 시간 기준 YYYY-MM-DD 로 변환
        try {
          const d = new Date(s.event_date);
          key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
        } catch { skipped++; return; }
      }
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => (a.time_slot || "").localeCompare(b.time_slot || ""));
    });
    const keys = Object.keys(map).sort();
    console.log(`[v3.38.0] slotsByDate 매핑 완료: 총 ${keys.length}개 날짜, 스킵 ${skipped}건 (트랙: ${trackTab})`);
    return map;
  }, [slots, trackTab]);

  const monthCells = useMemo(() => monthGrid(year, month0), [year, month0]);

  /* 이번 달 상태별 통계 */
  // ✅ v3.38.2: 트랙 필터 적용 - 수중/지상 KPI + 매출 완전 분리
  const monthStats = useMemo(() => {
    const prefix = `${year}-${String(month0+1).padStart(2,"0")}`;
    // ✅ v3.24.0: event_date 정규화 후 매칭
    // ✅ v3.38.2: trackTab 기준 슬롯 필터링
    const monthSlots = slots.filter(s => {
      const ed = s.event_date;
      if (!ed) return false;
      const key = typeof ed === "string" ? ed.substring(0, 10) : new Date(ed).toISOString().substring(0, 10);
      if (!key.startsWith(prefix)) return false;
      const slotTrack = s.track || "aqua";
      return slotTrack === trackTab;
    });
    const byStatus: Record<string, number> = {};
    STATUS_OPTIONS.forEach(o => byStatus[o.value] = 0);
    monthSlots.forEach(s => {
      const st = s.status || "scheduled";
      byStatus[st] = (byStatus[st] || 0) + 1;
    });
    const total = monthSlots.length;
    // v3.23.3: 월 매출 = payments 테이블 기준 (할인·환불 차감된 실매출)
    // ✅ v3.38.2: 매출도 트랙별 분리 (payments.category 또는 membership.category 기준)
    const monthPayments = (payments || []).filter((p: any) => {
      if (!(p.paid_at || "").startsWith(prefix)) return false;
      // ✅ v3.40.5: 다중 취소 시그널 통합 판별 (파일 최상단 헬퍼 사용)
      if (isPaymentCancelled(p, memberships)) return false;
      const payCat = (p.category || p.track || "aqua").toLowerCase();
      return payCat === trackTab;
    });
    const revenue = monthPayments.reduce((sum: number, p: any) => sum + Math.max(0, (p.amount || 0) - (p.discount_amount || 0) - (p.refunded_amount || 0)), 0);
    console.log(`[v3.38.2] monthStats(${trackTab}): 총=${total}, 매출=${revenue}`);
    return { total, byStatus, revenue };
  }, [slots, payments, year, month0, trackTab]);

  /* 모달 열기 - 항상 액션 시트 우선 (time이 있어도 3가지 선택지 제공) */
  function openDateActionSheet(date: string, time?: string) {
    // v3.23.0: 보강 예약 모드가 활성화되어 있으면 상세 모달로 이동 (시간·강사 지정 팔야용)
    if (makeupMode) {
      const targetTime = time || (timeSlotOptions && timeSlotOptions[0]) || "10:00";
      setMakeupDetailModal({
        absent: makeupMode,
        date,
        time: targetTime,
        staff_id: (members.find((mm: any) => mm.id === makeupMode.member_id) as any)?.staff_id || null,
      });
      return;
    }
    setActionSheet({ date, time });
  }

  function openRevenueModalFromDate(date: string) {
    // v3.21.3: 결제 등록 UI 완전 일원화 – /payments 매출분석 페이지의 동일 모달로 이동
    // 기존 QuickPaymentModal의 간이 UI 및 payment_methods 컬럼 오류 이슈 근원 해소
    setActionSheet(null);
    try {
      sessionStorage.setItem("aqunote_open_payment", JSON.stringify({ open: true, date, ts: Date.now() }));
    } catch {}
    window.location.href = `/payments?open=1&date=${encodeURIComponent(date)}`;
  }

  function openStaffScheduleFromDate(date: string) {
    // 직원 일정 = event_type='staff_work'
    // ✅ v3.20.5: 지점 설정의 최소 시작 시간 사용 (하드코딩 09:00 제거)
    const firstSlot = (timeSlotOptions && timeSlotOptions.length > 0)
      ? timeSlotOptions[0]
      : (scheduleConfig.open_time || "10:00");
    setF({
      event_date: date,
      time_slot: firstSlot,
      event_type: "staff_work",
      member_id: "",
      staff_id: "",
      lesson_name: "",
      status: "scheduled",
      note: "",
      amount: 0,
      recurring_enabled: false,
      recurring_weeks: 4,
    });
    setModal({ date });
    setActionSheet(null);
  }

  function nowTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }

  function openNewModal(date: string, time?: string) {
    // ✅ v3.20.5: 시간 미지정 시 지점 설정의 첫 번째 슬롯 사용
    const defaultSlot = time || (timeSlotOptions && timeSlotOptions.length > 0
      ? timeSlotOptions[0]
      : (scheduleConfig.open_time || "10:00"));
    setF({
      event_date: date,
      time_slot: defaultSlot,
      event_type: "lesson",
      member_id: "",
      staff_id: "",
      lesson_name: "",
      status: "scheduled",
      note: "",
      amount: 0,
      // 반복예약 관련
      recurring_enabled: false,
      recurring_weeks: 4,
    });
    setModal({ date, time });
  }

  function openEditModal(slot: any) {
    setF({
      id: slot.id,
      event_date: slot.event_date,
      time_slot: slot.time_slot || "10:00",
      event_type: slot.event_type || "lesson",
      member_id: slot.member_id || "",
      staff_id: slot.staff_id || "",
      lesson_name: slot.lesson_name || "",
      status: slot.status || "scheduled",
      note: slot.note || "",
      amount: slot.amount || 0,
      recurring_id: slot.recurring_id,
      recurring_enabled: false,
      recurring_weeks: 0,
    });
    setModal({ date: slot.event_date, time: slot.time_slot, editing: slot });
  }

  async function saveSlot() {
    if (!f.event_date) { alert("날짜가 필요합니다"); return; }
    setSaving(true);

    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const buildDow = (dateStr: string) => {
      const d = new Date(dateStr);
      return d.getDay() === 0 ? 7 : d.getDay();
    };

    // 직원 근무/휴무는 상태 구분 없이 자동으로 'scheduled'로 저장 (사유만 note에 기록)
    const effectiveStatus = (f.event_type === "staff_work" || f.event_type === "staff_off")
      ? "scheduled" : f.status;
    const basePayload: any = {
      time_slot: f.time_slot,
      event_type: f.event_type,
      status: effectiveStatus,
      lesson_name: f.lesson_name || null,
      note: f.note || null,
    };
    if (orgId) basePayload.org_id = orgId;
    if (f.member_id) basePayload.member_id = f.member_id;
    // v3.23.0: staff_id 미지정 시 회원의 요일별 담당 강사 (members.staff_by_day) 자동 매핑
    let resolvedStaffId = f.staff_id;
    if (!resolvedStaffId && f.member_id && f.event_date) {
      const targetMember = members.find((mm: any) => mm.id === f.member_id);
      const byDay = (targetMember as any)?.staff_by_day;
      if (byDay) {
        const jsDow = new Date(f.event_date).getDay(); // 0=일 ~ 6=토
        const isoDow = jsDow === 0 ? 7 : jsDow;         // 1=월 ~ 7=일
        resolvedStaffId = byDay[String(isoDow)] || byDay[String(jsDow)] || (targetMember as any)?.staff_id || null;
      } else {
        resolvedStaffId = (targetMember as any)?.staff_id || null;
      }
    }
    if (resolvedStaffId) basePayload.staff_id = resolvedStaffId;
    if (f.event_type === "revenue") basePayload.amount = Number(f.amount || 0);
    // ✅ v3.16.0: 회원권 ID 저장 (출석 시 자동 차감용)
    if (f.membership_id) basePayload.membership_id = f.membership_id;
    // ✅ 현재 지점 자동 태깅
    const _activeBranch = getActiveBranchId();
    if (_activeBranch) basePayload.branch_id = _activeBranch;

    // ✅ v3.16.0: 상태가 'done'(수업완료)이면 회원권에서 1회 자동 차감
    async function autoDeductMembership() {
      if (!f.membership_id || effectiveStatus !== "done") return;
      try {
        const { data: ms } = await supabase
          .from("memberships")
          .select("id, used_sessions, total_sessions")
          .eq("id", f.membership_id)
          .maybeSingle();
        if (ms) {
          const remain = (ms.total_sessions || 0) - (ms.used_sessions || 0);
          if (remain <= 0) {
            alert("⚠️ 회원권 잔여 횟수가 없습니다 (차감 스킵)");
            return;
          }
          await supabase.from("memberships")
            .update({ used_sessions: (ms.used_sessions || 0) + 1 })
            .eq("id", f.membership_id);
        }
      } catch (e) {
        console.warn("회원권 자동차감 실패", e);
      }
    }

    // ✅ v3.28.1: safeInsert 강화 - RLS/타입 오류 명확히 표시, 삽입 결과 검증까지
    async function safeInsert(payload: any): Promise<any> {
      let cur: any = { ...payload };
      let lastErr: any = null;
      // deleted_at 제거 (v3.28 Hard Delete 이후 불필요)
      if ("deleted_at" in cur) delete cur.deleted_at;
      // null/undefined 값 제거 (타입 에러 방지)
      Object.keys(cur).forEach(k => { if (cur[k] === undefined) delete cur[k]; });

      for (let i = 0; i < 20; i++) {
        const r = await supabase.from("schedule_slots").insert(cur).select();
        if (!r.error && r.data && r.data.length > 0) {
          console.log("✅ v3.28.1 schedule_slots 삽입 성공:", r.data[0]?.id);
          return null;
        }
        if (r.error) {
          lastErr = r.error;
          console.warn(`[v3.28.1] insert 시도 ${i+1} 실패:`, r.error.message, r.error.code);
          // RLS 오류면 즉시 중단 (무한루프 방지)
          if (r.error.code === "42501" || r.error.message?.includes("row-level security")) {
            return r.error;
          }
          const m = /'([^']+)' column|column "([^"]+)"|Could not find the '([^']+)'|column ([\w_]+) of/i.exec(r.error.message || "");
          const missing = m?.[1] || m?.[2] || m?.[3] || m?.[4];
          if (missing && missing in cur) {
            const { [missing]: _drop, ...rest } = cur;
            cur = { ...rest };
            continue;
          }
        }
        break;
      }
      return lastErr;
    }
    async function safeUpdate(payload: any, id: string): Promise<any> {
      let cur: any = { ...payload };
      let lastErr: any = null;
      for (let i = 0; i < 15; i++) {
        const r = await supabase.from("schedule_slots").update(cur).eq("id", id);
        if (!r.error) return null;
        lastErr = r.error;
        const m = /'([^']+)' column|column "([^"]+)"|Could not find the '([^']+)'|column ([\w_]+) of/i.exec(r.error.message || "");
        const missing = m?.[1] || m?.[2] || m?.[3] || m?.[4];
        if (missing && missing in cur) {
          const { [missing]: _drop, ...rest } = cur;
          cur = { ...rest };
          continue;
        }
        break;
      }
      return lastErr;
    }

    try {
      if (f.id) {
        // 수정 - v3.23.3: safeUpdate 사용
        const payload = {
          ...basePayload,
          event_date: f.event_date,
          day_of_week: buildDow(f.event_date),
        };
        // ✅ v3.16.0: 이전 상태 확인 (done으로 바뀌는 경우에만 차감)
        const { data: prev } = await supabase.from("schedule_slots")
          .select("status, membership_id").eq("id", f.id).maybeSingle();
        const err = await safeUpdate(payload, f.id);
        if (err) throw err;
        if (prev && prev.status !== "done" && effectiveStatus === "done") await autoDeductMembership();
      } else if (f.recurring_enabled && f.recurring_weeks > 1) {
        // v3.23.3: 반복예약도 개별 INSERT + 폴백 (하나라도 실패해도 나머지 저장)
        const recurringId = uuid();
        const startDate = new Date(f.event_date);
        let successCount = 0;
        let failCount = 0;
        let lastError: any = null;
        for (let i = 0; i < f.recurring_weeks; i++) {
          const d = new Date(startDate);
          d.setDate(startDate.getDate() + i * 7);
          const dateStr = ymd(d);
          const row = {
            ...basePayload,
            event_date: dateStr,
            day_of_week: buildDow(dateStr),
            recurring_id: recurringId,
            recurring_weeks: f.recurring_weeks,
          };
          const err = await safeInsert(row);
          if (err) { failCount++; lastError = err; }
          else successCount++;
        }
        if (successCount === 0 && lastError) throw lastError;
        if (failCount > 0 && lastError) {
          alert(`⚠️ 부분 저장: 성공 ${successCount}건, 실패 ${failCount}건\n\n에러: ${lastError.message}`);
        }
      } else {
        // 단일 등록 - v3.23.3: safeInsert 사용
        const payload = {
          ...basePayload,
          event_date: f.event_date,
          day_of_week: buildDow(f.event_date),
        };
        const err = await safeInsert(payload);
        if (err) throw err;
        // ✅ v3.16.0: 처음부터 done으로 등록되는 경우에도 차감
        if (effectiveStatus === "done") await autoDeductMembership();
      }
      setModal(null);
      await loadAll();
    } catch (err: any) {
      alert("저장 실패: " + err.message + "\n\n💡 필수 필드가 누락되었거나 DB 컴럼이 없을 수 있습니다.");
    } finally {
      setSaving(false);
    }
  }

  // ✅ v3.20.4: mode - 'single' | 'series_all' | 'series_after'
  async function deleteSlot(id: string, opts?: { mode?: "single" | "series_all" | "series_after", series?: boolean, recurring_id?: string, from_date?: string, hard?: boolean }) {
    const recurringId = opts?.recurring_id;
    // 하위 호환: series=true → series_all
    const mode: "single" | "series_all" | "series_after" =
      opts?.mode || (opts?.series ? "series_all" : "single");
    // ✅ v3.28.4: 모든 삭제를 HARD DELETE로 전환 + 마스터 권한 체크
    const isHardDelete = true;

    // ✅ v3.28.4: 마스터 권한 체크 (permission.ts 연동)
    try {
      const { isMasterAccount } = await import("@/lib/permission");
      const master = await isMasterAccount();
      if (!master) {
        alert("⚠️ 완전 삭제 권한이 없습니다.\n\n마스터(대표) 계정으로만 삭제할 수 있습니다.\n담당자에게 문의하세요.");
        return;
      }
    } catch (e) {
      console.warn("[v3.28.4] permission 체크 실패 (개발 모드):", e);
    }

    // ✅ v3.24.3: 시간표 삭제 시 연동된 attendance도 함께 소프트 삭제 (출결장 동기화 강화)
    // slot_id 매칭 실패 대비 - member_id + event_date + time_slot 3중 매칭 병행
    const softDeleteAttendance = async (slotIds: string[], slotsInfo: any[] = []) => {
      if (!slotIds || slotIds.length === 0) return;
      const nowIso = new Date().toISOString();

      // 1) slot_id 기반 삭제 (기본)
      try {
        const r = await supabase.from("attendance")
          .update({ deleted_at: nowIso })
          .in("slot_id", slotIds);
        if (r.error) {
          await supabase.from("attendance").delete().in("slot_id", slotIds);
        }
      } catch {
        try { await supabase.from("attendance").delete().in("slot_id", slotIds); } catch {}
      }

      // 2) slot_id가 NULL이거나 매칭 실패한 attendance는 member_id + 날짜 + time_slot으로 재삭제
      for (const s of slotsInfo) {
        if (!s.member_id || !s.event_date) continue;
        const dateStr = typeof s.event_date === "string" ? s.event_date.substring(0, 10) : new Date(s.event_date).toISOString().substring(0, 10);
        for (const dateCol of ["attend_date", "date", "attendance_date", "session_date"]) {
          try {
            let q = supabase.from("attendance")
              .update({ deleted_at: nowIso })
              .eq("member_id", s.member_id)
              .eq(dateCol, dateStr)
              .is("deleted_at", null);
            if (s.time_slot) q = q.eq("time_slot", s.time_slot);
            const r = await q;
            if (!r.error) break;
          } catch {}
        }
      }
    };

    if (mode === "series_all" && recurringId) {
      // ✅ v3.25.0: 완전 삭제 강화 경고 팝업
      if (!confirm("🚫 정말로 반복 시리즈 전체를 완전 삭제하시겠습니까? (복구 불가)\n\n⚠️ DB에서 반복 시리즈 전체 레코드 + 연결된 출결 기록이 완전 삭제됩니다.\n🔄 출석 체크가 되어 있던 건은 회원권 장여가 자동 복원됩니다.")) return;
      // ✅ v3.24.3: 삭제할 slot 상세 정보 (member_id, event_date, time_slot) 함께 조회
      const { data: targetSlots } = await supabase.from("schedule_slots")
        .select("id, member_id, event_date, time_slot").eq("recurring_id", recurringId);
      const slotIds = (targetSlots || []).map((s: any) => s.id);
      // ✅ v3.25.0: HARD DELETE - attendance 다중 매칭 삭제 후 schedule_slots 완전 삭제
      if (slotIds.length > 0) {
        await supabase.from("attendance").delete().in("slot_id", slotIds);
      }
      for (const s of (targetSlots || [])) {
        if (!s.member_id || !s.event_date) continue;
        const ds = typeof s.event_date === "string" ? s.event_date.substring(0,10) : new Date(s.event_date).toISOString().substring(0,10);
        for (const dc of ["attend_date","date","attendance_date","session_date"]) {
          try {
            let q = supabase.from("attendance").delete().eq("member_id", s.member_id).eq(dc, ds);
            if (s.time_slot) q = q.eq("time_slot", s.time_slot);
            const r = await q; if (!r.error) break;
          } catch {}
        }
      }
      await supabase.from("schedule_slots").delete().eq("recurring_id", recurringId);
    } else if (mode === "series_after" && recurringId && opts?.from_date) {
      // ✅ v3.25.0: 완전 삭제 강화 경고 팝업
      if (!confirm(`🚫 정말로 ${opts.from_date} 이후 반복 예약을 완전 삭제하시겠습니까? (복구 불가)\n\n⚠️ DB에서 레코드 완전 DELETE\n• 이전 수업은 그대로 유지\n📝 연결된 출결 기록도 완전 삭제`)) return;
      // ✅ v3.24.3: 삭제할 slot 상세 정보 함께 조회
      const { data: targetSlots } = await supabase.from("schedule_slots")
        .select("id, member_id, event_date, time_slot").eq("recurring_id", recurringId).gte("event_date", opts.from_date);
      const slotIds = (targetSlots || []).map((s: any) => s.id);
      // ✅ v3.25.0: HARD DELETE
      if (slotIds.length > 0) {
        await supabase.from("attendance").delete().in("slot_id", slotIds);
      }
      for (const s of (targetSlots || [])) {
        if (!s.member_id || !s.event_date) continue;
        const ds = typeof s.event_date === "string" ? s.event_date.substring(0,10) : new Date(s.event_date).toISOString().substring(0,10);
        for (const dc of ["attend_date","date","attendance_date","session_date"]) {
          try {
            let q = supabase.from("attendance").delete().eq("member_id", s.member_id).eq(dc, ds);
            if (s.time_slot) q = q.eq("time_slot", s.time_slot);
            const r = await q; if (!r.error) break;
          } catch {}
        }
      }
      await supabase.from("schedule_slots").delete()
        .eq("recurring_id", recurringId)
        .gte("event_date", opts.from_date);
    } else {
      // ✅ v3.29.2: 완전 삭제 강화 경고 팝업 + 결과 검증 + State 즉시 동기화
      if (!confirm("🚫 정말로 완전 삭제하시겠습니까? (복구 불가)\n\n⚠️ DB에서 이 일정과 연결된 모든 출결 기록이 완전히 삭제됩니다.\n🔄 출석 체크가 되어 있었다면 회원권 장여가 자동 복원됩니다.")) return;

      console.log("[v3.29.2] deleteSlot single 시작:", id);

      // 1) 삭제 전 slot 상세 정보 조회
      const { data: slotInfo, error: infoErr } = await supabase.from("schedule_slots")
        .select("id, member_id, event_date, time_slot").eq("id", id).maybeSingle();
      if (infoErr) console.warn("[v3.29.2] slotInfo 조회 오류:", infoErr);
      console.log("[v3.29.2] slotInfo:", slotInfo);

      // 2) 연결된 attendance HARD DELETE (slot_id 기반)
      const attR1 = await supabase.from("attendance").delete().eq("slot_id", id);
      console.log("[v3.29.2] attendance slot_id 삭제 결과:", attR1.error?.message || "OK");

      // 3) slot_id 누락된 attendance는 member_id + date + time_slot 3중 매칭으로도 삭제
      if (slotInfo?.member_id && slotInfo?.event_date) {
        const dateStr = typeof slotInfo.event_date === "string" ? slotInfo.event_date.substring(0, 10) : new Date(slotInfo.event_date).toISOString().substring(0, 10);
        for (const dateCol of ["attend_date", "date", "attendance_date", "session_date"]) {
          try {
            let q = supabase.from("attendance").delete()
              .eq("member_id", slotInfo.member_id).eq(dateCol, dateStr);
            if (slotInfo.time_slot) q = q.eq("time_slot", slotInfo.time_slot);
            const r = await q;
            if (!r.error) { console.log("[v3.29.2] attendance fallback 삭제 성공 (" + dateCol + ")"); break; }
          } catch {}
        }
      }

      // 4) schedule_slots HARD DELETE + 결과 검증 (v3.29.2 핵심)
      const delR = await supabase.from("schedule_slots").delete().eq("id", id).select();
      console.log("[v3.29.2] schedule_slots 삭제 결과:", { deleted: delR.data?.length || 0, error: delR.error?.message });

      if (delR.error) {
        alert("❌ 삭제 실패: " + delR.error.message + "\n\nRLS 정책 잠김 가능성. AQUNOTE_V3292_CLEANUP.sql 실행 요청.");
        return;
      }
      if (!delR.data || delR.data.length === 0) {
        alert("⚠️ 0건 삭제됨. RLS DELETE 권한 확인 필요.\nID: " + id);
        return;
      }

      // 5) State 즉시 동기화 (loadAll 이전에 먼저 UI에서 제거)
      setSlots(prev => (prev || []).filter((s: any) => s && s.id !== id));
      console.log("[v3.29.2] ✅ UI State 즉시 제거 완료");
    }
    await loadAll();
    console.log("[v3.29.2] ✅ deleteSlot 완료 + loadAll 재조회 끝");
  }

  /* ─── v3.29.2: 상태 변경 통합 로직 (드롭다운 즉시 적용) ─── */
  async function quickStatus(slot: any, newStatus: string) {
    console.log("[v3.29.2] quickStatus 호출:", { slotId: slot?.id, member_id: slot?.member_id, newStatus });
    if (!slot?.id) { alert("❌ 유효하지 않은 슬롯입니다."); return; }

    // 1) schedule_slots 상태 UPDATE (즉시 반영을 위해 select() 붙임)
    const upR = await supabase.from("schedule_slots")
      .update({ status: newStatus })
      .eq("id", slot.id).select();
    if (upR.error) {
      console.error("[v3.29.2] status UPDATE 실패:", upR.error);
      alert("❌ 상태 변경 실패: " + upR.error.message);
      return;
    }
    console.log("[v3.29.2] ✅ status UPDATE 성공:", upR.data);

    // 2) UI State 즉시 동기화
    setSlots(prev => (prev || []).map((s: any) => s && s.id === slot.id ? { ...s, status: newStatus } : s));

    // 3) 상태별 부가 로직 (회원권/보강권 자동 처리)
    try {
      // 병결/개인사정 → 보강권 +1 자동 생성 (DB 트리거 create_makeup_on_status가 있으면 중복 방지)
      if ((newStatus === "sick" || newStatus === "personal") && slot.member_id) {
        const checkR = await supabase.from("makeup_tickets")
          .select("id").eq("member_id", slot.member_id).eq("source_slot_id", slot.id).maybeSingle();
        if (!checkR.data) {
          const insR = await supabase.from("makeup_tickets").insert({
            member_id: slot.member_id,
            source_slot_id: slot.id,
            reason: newStatus,
            created_at: new Date().toISOString(),
            status: "available",
          });
          console.log("[v3.29.2] 보강권 생성:", insR.error?.message || "OK");
        }
      }
      // 이월(carryover) → 회원권 만료일 +30일 연장
      if (newStatus === "carryover" && slot.member_id) {
        const mem = memberships.filter((m: any) => m.member_id === slot.member_id)
          .sort((a: any, b: any) => new Date(b.end_date || 0).getTime() - new Date(a.end_date || 0).getTime())[0];
        if (mem?.id && mem?.end_date) {
          const newEnd = new Date(mem.end_date);
          newEnd.setDate(newEnd.getDate() + 30);
          const r = await supabase.from("memberships").update({ end_date: newEnd.toISOString().slice(0, 10) }).eq("id", mem.id);
          console.log("[v3.29.2] 회원권 +30일 연장:", r.error?.message || "OK");
        }
      }
    } catch (e) {
      console.warn("[v3.29.2] 상태별 부가 로직 예외(데이터는 저장됨):", e);
    }

    await loadAll();
  }

  /* 드래그앤드롭 이월 */
  function handleDragStart(slot: any, e: React.DragEvent) {
    // ✅ v3.36.0: 보강 예약 슬롯은 드래그 이동 금지 (약관 제5조 4항)
    if (slot?.is_makeup_reservation === true || slot?.lock_drag === true) {
      e.preventDefault();
      alert("⛔ 보강 예약 슬롯은 이동할 수 없습니다.\n\n약관 제5조 4항: 보강으로 지정된 날짜는 재변경이 불가능하며,\n당일 결석/병결 발생 시 추가 보강 없이 즉시 차감 처리됩니다.");
      return;
    }
    setDragging(slot);
    e.dataTransfer.effectAllowed = "move";
    // Chrome 요구사항
    e.dataTransfer.setData("text/plain", slot.id);
  }
  function handleDragOver(dateStr: string, e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverDate !== dateStr) setDragOverDate(dateStr);
  }
  async function handleDrop(newDate: string, e: React.DragEvent) {
    e.preventDefault();
    if (!dragging) { setDragOverDate(null); return; }
    if (dragging.event_date === newDate) { setDragging(null); setDragOverDate(null); return; }

    const d = new Date(newDate);
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    const oldDate = dragging.event_date;
    setDragging(null);
    setDragOverDate(null);

    const { error } = await supabase.from("schedule_slots").update({
      event_date: newDate,
      day_of_week: dow,
      status: "carryover", // 자동으로 이월 상태 부여
      note: (dragging.note ? dragging.note + " · " : "") + `[${oldDate}→${newDate} 이월]`,
    }).eq("id", dragging.id);
    if (error) alert("이동 실패: " + error.message);
    else await loadAll();
  }

  function memberName(id: string) {
    return members.find(m => m.id === id)?.name || "";
  }
  function staffName(id: string) {
    return staff.find(s => s.id === id)?.name || "";
  }

  // ✅ v3.20.9: 회원의 활성 회원권 조회 (잔여·총회수 자동)
  function activeMembership(memberId: string, slotMembershipId?: string) {
    // slot에 명시적으로 연결된 회원권이 있으면 그것 우선
    if (slotMembershipId) {
      const m = memberships.find((x: any) => x.id === slotMembershipId);
      if (m) return m;
    }
    // 그 외엔 해당 회원의 활성 회원권 (가장 최근 만료일 후)
    return memberships
      .filter((x: any) => x.member_id === memberId && x.status !== "cancelled" && x.status !== "refunded")
      .sort((a: any, b: any) => (b.end_date || "").localeCompare(a.end_date || ""))[0];
  }

  // 회원권 포맷팅: "STANDARD (28/30)" 형태
  function formatMembership(ms: any) {
    if (!ms) return "";
    const total = Number(ms.total_sessions || 0) + Number(ms.adjustment || 0);
    const used = Number(ms.used_sessions || 0);
    const remaining = Math.max(0, total - used);
    return `${ms.plan_name || "회원권"} (${remaining}/${total})`;
  }

  // v3.21.7: 보강 필요 회원 - FK 기반 자동 매칭 (보강 예약 등록 시 즉시 자동 제거)
  // ✅ v3.38.2: 지상재활은 보강 없이 즉시 차감이므로 트랙 필터 적용 (수중 슬롯만 보강 관리)
  const makeupNeededList = useMemo(() => {
    // ✅ v3.38.2: 지상 탭에서는 보강 대상 없음 (지상은 결석즐 즉시 차감)
    if (trackTab === "ground") {
      console.log(`[v3.38.2] 지상 트랙 - 보강 필요 회원 목록 비활성화 (결석즐 즉시 차감 정책)`);
      return [];
    }
    // 1) 이미 보강 예약된 결석건 ID 집합 (schedule_slots 또는 attendance에서 makeup_for_id/is_makeup)
    const makeupCoveredKeys = new Set<string>(); // "memberId__date" 형태
    const makeupCoveredIds = new Set<string>();  // 원본 결석건 id
    // ✅ v3.38.2: 수중 슬롯만 기준으로 보강 매칭
    const aquaSlots = slots.filter((sl: any) => (sl?.track || "aqua") === "aqua");
    aquaSlots.forEach((sl: any) => {
      const et = (sl.event_type || "").toLowerCase();
      if (et === "makeup" || sl.is_makeup) {
        if (sl.makeup_for_id) makeupCoveredIds.add(sl.makeup_for_id);
        // 회원별 보강 예약만 있으면 가장 오래된 병결 자동 매칭 (FK 없는 유저 대응)
        if (sl.member_id) makeupCoveredKeys.add(`_member_${sl.member_id}`);
      }
    });
    attendance.forEach((a: any) => {
      if (a.is_makeup || a.makeup_for_id) {
        if (a.makeup_for_id) makeupCoveredIds.add(a.makeup_for_id);
        if (a.member_id) makeupCoveredKeys.add(`_member_${a.member_id}`);
      }
    });

    // 2) 병결/개인사정 결석건 수집 - v3.23.0: makeup_waived/carryover 제외
    // ✅ v3.38.2: 수중 슬롯만 설산
    const absentList: any[] = [];
    aquaSlots.forEach((sl: any) => {
      const st = (sl.status || "").toLowerCase();
      // v3.23.0: 이월(carryover) 상태이거나 makeup_waived=true 면 제외
      if (sl.makeup_waived === true) return;
      if (st === "sick" || st === "personal") {
        if (sl.member_id && sl.event_date) {
          absentList.push({
            id: sl.id,
            member_id: sl.member_id,
            date: sl.event_date,
            status: st,
            source: "slot",
            slot_id: sl.id,
            staff_id: sl.staff_id,
          });
        }
      }
    });
    attendance.forEach((a: any) => {
      const st = (a.status || "").toLowerCase();
      // v3.23.0: is_makeup_waived=true 면 제외
      if (a.is_makeup_waived === true) return;
      if (st === "sick" || st === "personal") {
        const dt = a.attend_date || a.date || a.attendance_date || a.session_date;
        if (a.member_id && dt) {
          absentList.push({
            id: a.id,
            member_id: a.member_id,
            date: dt,
            status: st,
            source: "attendance",
            slot_id: a.slot_id,
          });
        }
      }
    });

    // 3) 회원+날짜 중복 제거 (slot과 attendance에 같은 건이 있으면 slot 우선)
    const grouped = new Map<string, any>();
    absentList.forEach((rec: any) => {
      const key = `${rec.member_id}__${rec.date}`;
      const existing = grouped.get(key);
      if (!existing || (rec.source === "slot" && existing.source === "attendance")) {
        grouped.set(key, rec);
      }
    });

    // 4) 보강 예약된 결석건은 제외
    const arr = Array.from(grouped.values()).map((rec: any) => {
      const m = members.find((mm: any) => mm.id === rec.member_id);
      const isCovered = makeupCoveredIds.has(rec.id) || makeupCoveredKeys.has(`_member_${rec.member_id}`);
      return { ...rec, member_name: m?.name || "알 수 없음", phone: m?.phone, isCovered };
    }).filter((r: any) => !r.isCovered);

    // 5) 날짜 내림차순 정렬
    arr.sort((a: any, b: any) => (b.date || "").localeCompare(a.date || ""));
    console.log(`[v3.38.2] 보강 필요 회원 (수중 만): ${arr.length}건`);
    return arr;
  }, [slots, attendance, members, trackTab]);

  // v3.21.7: 보강 예약 모드 state - 카드에서 클릭 시 예약 모달에 자동 회원/날짜 프리필
  const [makeupMode, setMakeupMode] = useState<any | null>(null);
  // v3.23.0: 보강 상세 예약 모달 (시간·강사 지정)
  const [makeupDetailModal, setMakeupDetailModal] = useState<any | null>(null);

  // v3.21.7: 보강 예약 생성 (원본 결석건과 FK 매칭해 상단 알림에서 즉시 자동 제거)
  async function createMakeupForAbsent(absent: any, targetDate: string, targetTime: string) {
    try {
      const orgRow = await supabase.from("organizations").select("id").limit(1).maybeSingle();
      const orgId = orgRow.data?.id;
      const m: any = members.find((mm: any) => mm.id === absent.member_id);
      // v3.23.0: 강사 override 반영 (모달에서 지정한 강사 우선) → 없으면 요일별 담당강사 → 회원 staff_id
      let resolvedStaffId = absent._override_staff_id || null;
      if (!resolvedStaffId && m?.staff_by_day && targetDate) {
        const jsDow = new Date(targetDate).getDay();
        const isoDow = jsDow === 0 ? 7 : jsDow;
        resolvedStaffId = m.staff_by_day[String(isoDow)] || m.staff_by_day[String(jsDow)] || m.staff_id || null;
      }
      if (!resolvedStaffId) resolvedStaffId = m?.staff_id || null;
      const payload: any = {
        org_id: orgId,
        event_date: targetDate,
        time_slot: targetTime, // v3.23.0: event_time → time_slot 통일 (다른 예약과 동일 컬럼 사용)
        event_time: targetTime, // 레거시 허용 - 폴백으로 둘 다
        member_id: absent.member_id,
        staff_id: resolvedStaffId,
        event_type: "makeup",
        status: "scheduled",
        title: `보강 (${absent.date} ${absent.status === "sick" ? "병결" : "개인사정"})`,
        is_makeup: true,
        makeup_for_id: absent.id,
      };
      // v3.23.0: branch_id 자동 태깅
      const _bid = getActiveBranchId();
      if (_bid) payload.branch_id = _bid;
      let payloadTry: any = { ...payload };
      for (let i = 0; i < 6; i++) {
        const r = await supabase.from("schedule_slots").insert(payloadTry);
        if (!r.error) break;
        const mm = /'([^']+)' column|column "([^"]+)"/.exec(r.error.message || "");
        const missing = mm?.[1] || mm?.[2];
        if (missing && missing in payloadTry) {
          const { [missing]: _drop, ...rest } = payloadTry;
          payloadTry = { ...rest };
          continue;
        }
        alert("보강 등록 실패: " + r.error.message); return;
      }
      // 원본 결석건에도 makeup_for_id 역참조 (attendance에 가능하면)
      if (absent.source === "attendance" && absent.id) {
        try {
          await supabase.from("attendance").update({ is_makeup_covered: true }).eq("id", absent.id);
        } catch { /* 컴럼 없으면 무시 */ }
      }
      await loadAll();
      alert(`✅ 보강 예약 완료\n\n• 회원: ${absent.member_name || ""}\n• 보강일: ${targetDate} ${targetTime}\n• 원본 결석: ${absent.date}\n\n상단 보강필요 목록에서 자동 제거됩니다`);
    } catch (e: any) {
      alert("보강 등록 실패: " + e.message);
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-4 md:py-8 bg-gradient-to-br from-sky-50 via-white to-cyan-50 min-h-screen">
      {/* ✨ v3.32.0: 보강 필요 회원 - 보강완료(날짜/시간 기록) + 이월(보강안함) 재설계 */}
      {makeupNeededList.length > 0 && (
        <div className="mb-4 aqu-card bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50 border-2 border-orange-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-orange-800 font-bold text-sm">
              <span className="text-lg">🔔</span>
              보강 필요 회원
              <span className="px-2.5 py-0.5 bg-orange-500 text-white text-[11px] rounded-full font-bold shadow-sm">{makeupNeededList.length}건</span>
            </div>
            <span className="text-[10px] text-orange-600 font-medium bg-white/60 px-2 py-1 rounded-full">완료·이월 처리 시 자동 제거</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {makeupNeededList.slice(0, 30).map((r: any, i: number) => {
              const isSick = r.status === "sick";
              return (
                <div key={`${r.member_id}_${r.date}_${i}`}
                  className="flex items-center gap-2 bg-white border border-orange-100 rounded-xl px-3 py-2.5 hover:border-orange-300 hover:shadow-md transition-all">
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${isSick ? "bg-rose-100 text-rose-700" : "bg-violet-100 text-violet-700"}`}>
                    {isSick ? "🤒 병결" : "📝 개인사정"}
                  </span>
                  <button onClick={() => { window.location.href = `/members/${r.member_id}`; }}
                    className="text-sm font-bold text-slate-800 hover:text-aqu-700 hover:underline">
                    {r.member_name}
                  </button>
                  <span className="text-xs text-gray-500 flex-1">결석일: <b className="text-slate-700">{r.date}</b></span>

                  {/* ✅ v3.32.0: 보강완료 - 날짜/시간 입력 팔이 */}
                  <button
                    onClick={async () => {
                      const today = new Date().toISOString().slice(0, 10);
                      const dateStr = prompt(`✅ 보강완료 처리\n\n• 회원: ${r.member_name}\n• 원본 결석: ${r.date}\n\n보강한 날짜를 입력하세요 (YYYY-MM-DD):`, today);
                      if (!dateStr) return;
                      const timeStr = prompt(`⏰ 보강 시간을 입력하세요 (HH:MM 형식, 예: 14:00):`, "10:00");
                      if (!timeStr) return;
                      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(timeStr)) {
                        alert("❌ 날짜/시간 형식이 올바르지 않습니다.");
                        return;
                      }
                      try {
                        // 원본 결석건에 보강완료 정보 기록
                        if (r.source === "slot" && r.slot_id) {
                          let patchTry: any = {
                            makeup_completed: true,
                            makeup_completed_at: dateStr,
                            makeup_time: timeStr,
                            makeup_waived: true,
                            note: `[✅ 보강완료 ${dateStr} ${timeStr}]`
                          };
                          for (let i = 0; i < 6; i++) {
                            const { error } = await supabase.from("schedule_slots").update(patchTry).eq("id", r.slot_id);
                            if (!error) break;
                            const m = /'([^']+)' column|column "([^"]+)"/.exec(error.message || "");
                            const missing = m?.[1] || m?.[2];
                            if (missing && missing in patchTry) { const { [missing]: _d, ...rest } = patchTry; patchTry = rest; continue; }
                            break;
                          }
                        } else if (r.source === "attendance" && r.id) {
                          let patchTry: any = {
                            makeup_completed: true,
                            makeup_completed_at: dateStr,
                            makeup_time: timeStr,
                            is_makeup_waived: true
                          };
                          for (let i = 0; i < 6; i++) {
                            const { error } = await supabase.from("attendance").update(patchTry).eq("id", r.id);
                            if (!error) break;
                            const m = /'([^']+)' column|column "([^"]+)"/.exec(error.message || "");
                            const missing = m?.[1] || m?.[2];
                            if (missing && missing in patchTry) { const { [missing]: _d, ...rest } = patchTry; patchTry = rest; continue; }
                            break;
                          }
                        }
                        await loadAll();
                        alert(`✅ 보강완료 처리 완료\n\n• ${r.member_name}\n• 원본 결석: ${r.date}\n• 보강 실시: ${dateStr} ${timeStr}\n\n상단 목록에서 자동 제거됩니다.`);
                      } catch (e: any) {
                        alert("보강완료 처리 실패: " + e.message);
                      }
                    }}
                    className="text-[11px] px-3 py-1.5 rounded-full font-bold border-2 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 border-emerald-300 hover:from-emerald-100 hover:to-teal-100 hover:shadow flex items-center gap-1 transition-all"
                    title="보강한 날짜/시간을 기록">
                    ✅ 보강완료
                  </button>

                  {/* 🗑️ v3.32.0: 이월 (보강 안함 = 이월 처리) */}
                  <button
                    onClick={async () => {
                      if (!confirm(`📅 이월 처리\n\n이 ${isSick ? "병결" : "개인사정"}을 보강 없이 이월하시겠습니까?\n\n• ${r.member_name}\n• 결석일: ${r.date}\n• 회원권 만료일이 +30일 자동 연장됩니다\n• 상단 보강 필요 목록에서 즉시 제거됩니다`)) return;
                      try {
                        if (r.source === "slot" && r.slot_id) {
                          let patchTry: any = { status: "carryover", makeup_waived: true, note: `[📅 이월 ${new Date().toISOString().slice(0,10)}]` };
                          for (let i = 0; i < 4; i++) {
                            const { error } = await supabase.from("schedule_slots").update(patchTry).eq("id", r.slot_id);
                            if (!error) break;
                            const m = /'([^']+)' column|column "([^"]+)"/.exec(error.message || "");
                            const missing = m?.[1] || m?.[2];
                            if (missing && missing in patchTry) { const { [missing]: _d, ...rest } = patchTry; patchTry = rest; continue; }
                            break;
                          }
                        } else if (r.source === "attendance" && r.id) {
                          let patchTry: any = { is_makeup_waived: true, status: "carryover" };
                          for (let i = 0; i < 4; i++) {
                            const { error } = await supabase.from("attendance").update(patchTry).eq("id", r.id);
                            if (!error) break;
                            const m = /'([^']+)' column|column "([^"]+)"/.exec(error.message || "");
                            const missing = m?.[1] || m?.[2];
                            if (missing && missing in patchTry) { const { [missing]: _d, ...rest } = patchTry; patchTry = rest; continue; }
                            break;
                          }
                        }
                        await loadAll();
                        alert(`📅 이월 처리 완료 • ${r.member_name} • ${r.date}\n(회원권 만료일 +30일 연장)`);
                      } catch (e: any) {
                        alert("이월 처리 실패: " + e.message);
                      }
                    }}
                    className="text-[11px] px-3 py-1.5 rounded-full font-bold border-2 bg-gradient-to-r from-slate-50 to-gray-50 text-slate-600 border-slate-300 hover:from-slate-100 hover:to-gray-100 hover:shadow flex items-center gap-1 transition-all"
                    title="보강 없이 이월 처리 (회원권 만료일 +30일 자동 연장)">
                    📅 이월
                  </button>
                </div>
              );
            })}
            {makeupNeededList.length > 30 && (
              <div className="text-[11px] text-orange-600 text-center py-1.5 bg-white/50 rounded-lg">+{makeupNeededList.length - 30}건 더 있음</div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <HomeButton />
          <span className="text-gray-300">/</span>
          <h1 className="text-xl md:text-2xl font-bold text-aqu-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-green-500" /> 시간표
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* ✅ v3.38.0: 수중/지상 시간표 토글 */}
          <div className="flex bg-white border border-slate-200 rounded-lg p-1 text-xs shadow-sm">
            <button onClick={() => setTrackTab("aqua")}
              className={`px-3 py-1.5 rounded flex items-center gap-1 font-semibold transition ${trackTab === "aqua" ? "bg-sky-500 text-white" : "text-slate-600"}`}>
              🏊‍♂️ 수중 시간표
            </button>
            <button onClick={() => setTrackTab("ground")}
              className={`px-3 py-1.5 rounded flex items-center gap-1 font-semibold transition ${trackTab === "ground" ? "bg-emerald-500 text-white" : "text-slate-600"}`}>
              🏋️‍♂️ 지상 시간표
            </button>
          </div>
          <div className="flex bg-white border border-aqu-100 rounded-lg p-1 text-xs">
            <button onClick={() => setView("month")}
              className={`px-3 py-1.5 rounded flex items-center gap-1 ${view === "month" ? "bg-aqu-600 text-white" : "text-gray-600"}`}>
              <LayoutGrid className="w-3.5 h-3.5" /> 월간
            </button>
            <button onClick={() => setView("week")}
              className={`px-3 py-1.5 rounded flex items-center gap-1 ${view === "week" ? "bg-aqu-600 text-white" : "text-gray-600"}`}>
              <Grid3x3 className="w-3.5 h-3.5" /> 주간
            </button>
            <button onClick={() => setView("day")}
              className={`px-3 py-1.5 rounded flex items-center gap-1 ${view === "day" ? "bg-aqu-600 text-white" : "text-gray-600"}`}>
              <Clock className="w-3.5 h-3.5" /> 일간
            </button>
          </div>
          <button onClick={() => openNewModal(selectedDate)}
            className="bg-aqu-600 hover:bg-aqu-700 text-white px-3 py-1.5 rounded-lg text-xs md:text-sm flex items-center gap-1">
            <Plus className="w-4 h-4" /> 예약
          </button>
        </div>
      </div>

      {/* ✅ v3.20.10: 통합 탭바 – 시간표에서도 회원DB·출결장·사인이력 바로 이동 */}
      <div className="flex items-center gap-2 mb-4 border-b border-gray-200 pb-2 flex-wrap">
        <Link href="/members"
          className="px-3 py-1.5 rounded-lg text-xs md:text-sm font-semibold bg-white border border-aqu-200 text-aqu-700 hover:bg-aqu-50 flex items-center gap-1">
          👥 회원 DB
        </Link>
        <Link href="/attendance"
          className="px-3 py-1.5 rounded-lg text-xs md:text-sm font-semibold bg-white border border-teal-200 text-teal-700 hover:bg-teal-50 flex items-center gap-1">
          ✅ 출결장
        </Link>
        <Link href="/attendance/signatures"
          className="px-3 py-1.5 rounded-lg text-xs md:text-sm font-semibold bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 flex items-center gap-1">
          ✍️ 사인 이력
        </Link>
        <Link href="/schedule"
          className="px-3 py-1.5 rounded-lg text-xs md:text-sm font-semibold bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-sm flex items-center gap-1">
          🗓️ 시간표
        </Link>
      </div>

      {/* 상단 네비 */}
      <div className="flex items-center justify-between mb-3 bg-white rounded-xl border border-aqu-100 p-2 md:p-3">
        <button onClick={prevMonth} className="p-2 hover:bg-aqu-50 rounded-lg">
          <ChevronLeft className="w-5 h-5 text-aqu-700" />
        </button>
        <div className="flex items-center gap-3">
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="text-sm md:text-base font-bold text-aqu-900 border-none focus:outline-none cursor-pointer bg-transparent">
            {Array.from({length: 10}).map((_, i) => {
              const y = new Date().getFullYear() - 3 + i;
              return <option key={y} value={y}>{y}년</option>;
            })}
          </select>
          <select value={month0} onChange={e => setMonth0(parseInt(e.target.value))}
            className="text-sm md:text-base font-bold text-aqu-900 border-none focus:outline-none cursor-pointer bg-transparent">
            {Array.from({length: 12}).map((_, i) => (
              <option key={i} value={i}>{i+1}월</option>
            ))}
          </select>
          <button onClick={goToday}
            className="text-xs px-2 py-1 bg-aqu-50 border border-aqu-200 rounded text-aqu-700 hover:bg-aqu-100">
            오늘
          </button>
        </div>
        <button onClick={nextMonth} className="p-2 hover:bg-aqu-50 rounded-lg">
          <ChevronRight className="w-5 h-5 text-aqu-700" />
        </button>
      </div>

      {/* ✨ v3.32.1: 상단 KPI - 8개 카드 한 줄 정렬 (총일정+7가지 상태) */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5 md:gap-2 mb-3 text-xs">
        <MonthKPI label="총 일정" val={monthStats.total + ""} color="text-aqu-700" />
        {STATUS_OPTIONS.map(s => (
          <MonthKPI key={s.value} label={s.label} val={(monthStats.byStatus[s.value]||0) + ""} color={s.textColor} />
        ))}
      </div>

      {/* 드래그 안내 */}
      {view === "month" && (
        <div className="mb-2 text-[11px] text-gray-500 flex items-center gap-1">
          <Move className="w-3 h-3" /> 예약을 다른 날짜로 <b className="text-aqu-700">드래그</b>하면 자동으로 <b className="text-purple-600">이월</b> 처리됩니다
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-500">로딩 중...</div>
      ) : view === "month" ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3">
          {/* ═══ ✨ v3.32.0: 월간 캘린더 aqu-card 전환 ═══ */}
          <div className="aqu-card bg-white shadow-md border border-aqu-100 overflow-hidden rounded-2xl">
            <div className="grid grid-cols-7 border-b border-aqu-100 bg-gradient-to-r from-sky-50 via-cyan-50 to-blue-50">
              {DAYS_KR.map((d, i) => (
                <div key={d} className={`p-2.5 text-center text-xs md:text-sm font-bold tracking-wide ${i===0 ? "text-rose-500" : i===6 ? "text-sky-500" : "text-slate-700"}`}>
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {monthCells.map((cell, idx) => {
                const cellStr = ymd(cell);
                const isOtherMonth = cell.getMonth() !== month0;
                const isToday = cellStr === todayStr();
                const isSelected = cellStr === selectedDate;
                const isDragOver = dragOverDate === cellStr;
                const daySlots = slotsByDate[cellStr] || [];
                const dow = cell.getDay();
                // v3.23.3: 일 매출 = payments 테이블 기준 (할인·환불 완전 차감)
                // ✅ v3.38.2: trackTab 적용 - 수중/지상 매출 분리
                const dayPaymentsSum = payments
                  .filter((p: any) => {
                    if (p.paid_at !== cellStr) return false;
                    // ✅ v3.40.4: 다중 취소 시그널 통합 판별 (연은진 체험1회권 등 배제)
                    if (isPaymentCancelled(p, memberships)) return false;
                    const payCat = (p.category || p.track || "aqua").toLowerCase();
                    return payCat === trackTab;
                  })
                  .reduce((sum: number, p: any) => sum + Math.max(0, (p.amount || 0) - (p.discount_amount || 0) - (p.refunded_amount || 0)), 0);
                const dayRevenue = dayPaymentsSum; // 캘린더 표시용 통일 (할인 반영 실매출)

                return (
                  <div key={idx}
                    onClick={() => {
                      setSelectedDate(cellStr);
                      if (isOtherMonth) return;
                      // ✅ v3.19.0: 한번클릭 = 액션시트 (새일정/결제/직원), 더블클릭 = 새일정 바로
                      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
                      clickTimerRef.current = setTimeout(() => {
                        setActionSheet({ date: cellStr });
                        clickTimerRef.current = null;
                      }, 250);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      // onClick 예약된 액션시트를 취소하고 바로 새 일정 모달 오픈
                      if (clickTimerRef.current) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null; }
                      if (!isOtherMonth) { setActionSheet(null); openNewModal(cellStr); }
                    }}
                    title="클릭: 새일정/결제/직원 선택 · 더블클릭: 바로 새 일정 등록"
                    onDragOver={(e) => handleDragOver(cellStr, e)}
                    onDragLeave={() => dragOverDate === cellStr && setDragOverDate(null)}
                    onDrop={(e) => handleDrop(cellStr, e)}
                    className={`min-h-[80px] md:min-h-[115px] border-r border-b border-slate-100 p-1.5 md:p-2 cursor-pointer transition-all rounded-lg
                      ${isOtherMonth ? "bg-slate-50/40 text-gray-400" : "bg-white hover:bg-gradient-to-br hover:from-sky-50/40 hover:to-cyan-50/40"}
                      ${isSelected ? "ring-2 ring-aqu-400 ring-inset shadow-inner bg-aqu-50/20" : ""}
                      ${isToday && !isSelected ? "bg-gradient-to-br from-amber-50/60 to-yellow-50/40" : ""}
                      ${isDragOver ? "bg-violet-100 ring-2 ring-violet-500 ring-inset" : ""}
                    `}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-xs md:text-sm font-semibold ${
                        isToday ? "bg-aqu-600 text-white rounded-full w-5 h-5 md:w-6 md:h-6 flex items-center justify-center" :
                        dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : ""
                      }`}>
                        {cell.getDate()}
                      </span>
                      {/* ✅ v3.20.11: 결제금액 클릭 → 매출 상세 팝오버 (셔 설정 데이터) */}
                      {dayPaymentsSum > 0 ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (clickTimerRef.current) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null; }
                            setRevenueDetailDate(cellStr);
                          }}
                          className="text-[9px] md:text-[10px] font-bold text-pink-600 hover:text-pink-800 hover:underline flex items-center gap-0.5"
                          title={`오늘 결제 합계 ₩${dayPaymentsSum.toLocaleString()} – 상세 보기`}>
                          {dayPaymentsSum.toLocaleString()}
                          <ChevronDown className="w-2.5 h-2.5" />
                        </button>
                      ) : daySlots.length > 0 ? (
                        <span className="text-[9px] md:text-[10px] text-gray-500 font-medium">
                          {daySlots.length}
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-0.5 overflow-hidden">
                      {daySlots.slice(0, 3).map(s => {
                        const meta = statusMeta(s.status || "scheduled");
                        const staffP = staff.find((st: any) => st.id === s.staff_id);
                        // ✅ v3.20.1: 수업하지 않은 상태(병결/취소/노쇼/이월/개인사정)는 강사 색상 무시하고 회색 강제
                        const grayStates = ["sick", "cancel", "noshow", "carryover", "personal"];
                        const isGrayState = grayStates.includes(normStatus(s.status));
                        // 직원 근무·휴무는 검정 계열
                        const isStaffEvent = s.event_type === "staff_work" || s.event_type === "staff_off";
                        const staffTint = isGrayState ? {
                          backgroundColor: "#f3f4f6", // gray-100
                          borderLeftColor: "#9ca3af",  // gray-400
                          borderLeftWidth: 4,
                          color: "#6b7280", // gray-500
                        } : isStaffEvent ? {
                          backgroundColor: "#1f2937", // gray-800
                          borderLeftColor: "#111827",
                          borderLeftWidth: 4,
                          color: "#f9fafb",
                        } : staffP?.color ? {
                          backgroundColor: staffP.color + "22",
                          borderLeftColor: staffP.color,
                          borderLeftWidth: 4,
                          color: "#1e293b"
                        } : {};
                        // ✅ v3.20.9: 셀에 회원권명 + 잔여/총회수 + 강사 자동 표시
                        const memNameStr = memberName(s.member_id);
                        const memberMs = s.member_id ? activeMembership(s.member_id, s.membership_id) : null;
                        const msLabel = formatMembership(memberMs) || s.lesson_name || "";
                        // 출석 전/후 색상 차이: scheduled는 연한 색, 완료(done)은 진한 색
                        const isDone = s.status === "done" || s.status === "completed" || s.status === "present";
                        const isScheduled = !s.status || s.status === "scheduled";
                        // 출석전(scheduled)에는 opacity 0.7로 연하게, 출석후(done)에는 opacity 1 + 진한 강조
                        const attendanceOpacity = isDone ? 1 : (isScheduled ? 0.72 : 1);
                        return (
                          <div key={s.id}
                            draggable
                            onDragStart={(e) => handleDragStart(s, e)}
                            onClick={(e) => { e.stopPropagation(); openQuickAction(s); }}
                            style={{ ...staffTint, opacity: attendanceOpacity }}
                            className={`text-[9px] md:text-[10px] px-1 py-0.5 rounded border ${(isGrayState || isStaffEvent || staffP?.color) ? "" : meta.color} hover:shadow-sm cursor-move flex flex-col gap-0 ${isDone ? "ring-1 ring-green-400" : ""}`}
                            title={`${s.time_slot} ${memNameStr || s.lesson_name || s.note || ""}${msLabel ? " · " + msLabel : ""}${staffP ? " · " + staffP.name : ""} · ${meta.label || ""}`}>
                            {/* 상단: 시간 + 회원명 */}
                            <div className="flex items-center gap-0.5 truncate">
                              <span className="font-mono opacity-70">{s.time_slot?.slice(0,5)}</span>
                              <span className="truncate font-semibold">
                                {(() => {
                                  if (memNameStr) return memNameStr;
                                  if (s.lesson_name) return s.lesson_name;
                                  if (s.event_type === "revenue") return "💰" + ((s.amount || 0) / 1000) + "k";
                                  if (s.event_type === "staff_work") return `👥 ${staffP?.name || "직원"}${s.note ? " · " + s.note : " 근무"}`;
                                  if (s.event_type === "staff_off") return `🏖️ ${staffP?.name || "직원"}${s.note ? " · " + s.note : " 휴무"}`;
                                  if (s.event_type === "trial") return `🌟 체험`;
                                  if (s.note) return s.note;
                                  return s.event_type === "other" ? "📌 기타" : "일정";
                                })()}
                              </span>
                              {s.recurring_id && <Repeat className="w-2.5 h-2.5 opacity-60" />}
                              {isDone && <span className="ml-auto text-green-700 font-bold text-[9px]">✓</span>}
                            </div>
                            {/* 하단: 회원권 · 강사 (회원 예약일 때만) */}
                            {memNameStr && msLabel && (
                              <div className="text-[8px] md:text-[9px] opacity-80 truncate">{msLabel}</div>
                            )}
                            {memNameStr && staffP && (
                              <div className="text-[8px] md:text-[9px] opacity-70 truncate">{staffP.name}</div>
                            )}
                          </div>
                        );
                      })}
                      {daySlots.length > 3 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDayListModal({ date: cellStr, slots: daySlots });
                          }}
                          className="text-[9px] md:text-[10px] text-teal-600 font-semibold pl-1 hover:text-teal-800 hover:underline text-left"
                        >
                          +{daySlots.length - 3}명 더보기
                        </button>
                      )}
                      {/* v3.23.5: 셀 우상단 dayPaymentsSum과 중복되던 하단 매출 표시 제거 */}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ═══ 오른쪽 사이드바 ═══ */}
          <aside className="space-y-3">
            {/* 미니 달력 */}
            <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-3">
              <div className="flex items-center justify-between mb-2">
                <button onClick={prevMonth} className="p-1 hover:bg-aqu-50 rounded">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-sm font-bold text-aqu-900">{year}년 {month0+1}월</div>
                <button onClick={nextMonth} className="p-1 hover:bg-aqu-50 rounded">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-[10px]">
                {DAYS_KR.map((d, i) => (
                  <div key={d} className={`text-center py-1 font-medium ${i===0 ? "text-red-400" : i===6 ? "text-blue-400" : "text-gray-500"}`}>
                    {d}
                  </div>
                ))}
                {monthCells.map((c, i) => {
                  const cs = ymd(c);
                  const has = (slotsByDate[cs] || []).length > 0;
                  const isSel = cs === selectedDate;
                  const isT = cs === todayStr();
                  const isOther = c.getMonth() !== month0;
                  return (
                    <button key={i} onClick={() => setSelectedDate(cs)}
                      className={`aspect-square text-center rounded flex flex-col items-center justify-center relative transition
                        ${isSel ? "bg-aqu-600 text-white font-bold" :
                          isT ? "bg-aqu-100 text-aqu-900 font-bold" :
                          isOther ? "text-gray-300" : "text-gray-700 hover:bg-aqu-50"}
                      `}>
                      <span>{c.getDate()}</span>
                      {has && !isSel && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-aqu-500"></span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 선택 날짜 상세 */}
            <SelectedDayPanel
              date={selectedDate}
              slots={slotsByDate[selectedDate] || []}
              members={members}
              staff={staff}
              staffName={staffName}
              onAdd={() => openNewModal(selectedDate)}
              onEdit={openEditModal}
              onQuickStatus={quickStatus}
              onDelete={deleteSlot}
            />
          </aside>
        </div>
      ) : view === "week" ? (
        <WeekView
          slots={slots}
          members={members}
          staff={staff}
          onCellClick={(date, time) => openDateActionSheet(date, time)}
          onCellDoubleClick={(date, time) => openNewModal(date, time)}
          onEdit={openEditModal}
          memberName={memberName}
          timeSlotOptions={timeSlotOptions}
        />
      ) : (
        <DayView
          date={selectedDate}
          setDate={setSelectedDate}
          slots={slots}
          members={members}
          staff={staff}
          onCellClick={(date, time) => openDateActionSheet(date, time)}
          onCellDoubleClick={(date, time) => openNewModal(date, time)}
          onEdit={openEditModal}
          memberName={memberName}
          timeSlotOptions={timeSlotOptions}
        />
      )}

      {/* ═══ 하단 상태별 통계 요약 ═══ */}
      <StatsSummary stats={monthStats} year={year} month0={month0} />

      {/* ═══ 날짜 액션 시트 ═══ */}
      {actionSheet && (
        <DateActionSheet
          date={actionSheet.date}
          time={actionSheet.time}
          onReservation={() => { openNewModal(actionSheet.date, actionSheet.time); setActionSheet(null); }}
          onRevenue={() => openRevenueModalFromDate(actionSheet.date)}
          onStaffSchedule={() => openStaffScheduleFromDate(actionSheet.date)}
          onClose={() => setActionSheet(null)}
        />
      )}

      {/* ═══ 등록/수정 모달 ═══ */}
      {modal && (
        <SlotModal
          f={f} setF={setF}
          modal={modal}
          members={members} staff={staff} plans={plans}
          timeSlotOptions={timeSlotOptions}
          onClose={() => setModal(null)}
          onSave={saveSlot}
          onDelete={f.id ? (opts?: any) => { deleteSlot(f.id, opts); setModal(null); } : undefined}
          saving={saving}
        />
      )}

      {/* v3.21.3: 시간표 결제 등록 → /payments 페이지로 리다이렉트 처리되므로 QuickPaymentModal 사용 중단 */}

      {/* ═══ 예약 클릭 시 빠른 액션 시트 ═══ */}
      {quickAction && (
        <QuickActionSheet
          slot={quickAction}
          members={members}
          staff={staff}
          plans={plans}
          payments={payments.filter((p: any) => p.slot_id === quickAction.id || (p.member_id === quickAction.member_id && p.event_date === quickAction.event_date))}
          attendance={attendance.find((a: any) => a.member_id === quickAction.member_id && a.date === quickAction.event_date)}
          onClose={() => setQuickAction(null)}
          onEdit={() => { openEditModal(quickAction); setQuickAction(null); }}
          onAttendance={(status: any) => setAttendanceStatus(quickAction, status)}
          onAddPayment={(payment: any) => addPaymentFromSlot(quickAction, payment)}
          onSignAttendance={() => { setSignatureSlot(quickAction); setQuickAction(null); }}
          onDeletePayment={deletePayment}
        />
      )}

      {/* ✅ v3.20.1: 사인 출결 모달 */}
      {signatureSlot && (
        <SignatureAttendanceModal
          slot={signatureSlot}
          member={members.find((m: any) => m.id === signatureSlot.member_id)}
          date={signatureSlot.event_date}
          onClose={() => setSignatureSlot(null)}
          onSaved={async () => { setSignatureSlot(null); await loadAll(); }}
        />
      )}

      {/* ✅ v3.29.0: +더보기 모달 - 당일 전체 회원 리스트 */}
      {dayListModal && (
        <DayListModal
          date={dayListModal.date}
          slots={dayListModal.slots}
          members={members}
          staff={staff}
          memberships={memberships}
          onClose={() => setDayListModal(null)}
          onQuickStatus={async (slot: any, status: string) => {
            const statusMap: Record<string, string> = { present: "done", absent: "noshow", sick: "sick", personal: "personal", cancel: "cancel" };
            await supabase.from("schedule_slots").update({ status: statusMap[status] || status }).eq("id", slot.id);
            await loadAll();
            // 모달도 갱신
            const refreshedSlots = slots.filter((s: any) => {
              const ed = typeof s.event_date === "string" ? s.event_date.substring(0,10) : new Date(s.event_date).toISOString().substring(0,10);
              return ed === dayListModal.date;
            });
            setDayListModal({ date: dayListModal.date, slots: refreshedSlots });
          }}
          onDelete={async (slot: any) => { await deleteSlot(slot.id, { mode: "single" }); setDayListModal(null); }}
          onAddNew={() => { setDayListModal(null); setModal({ date: dayListModal.date }); }}
        />
      )}

      {/* v3.23.0: 보강 상세 예약 모달 (시간·강사 지정) */}
      {makeupDetailModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setMakeupDetailModal(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold">📅 보강 예약</h2>
                <p className="text-xs opacity-90 mt-0.5">시간·담당강사 지정 후 등록</p>
              </div>
              <button onClick={() => setMakeupDetailModal(null)} className="text-white/80 hover:text-white text-2xl leading-none">✕</button>
            </div>
            <div className="p-5 space-y-4">
              {/* 회원 정보 */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <div className="text-xs text-orange-700 mb-1">회원</div>
                <div className="font-bold text-slate-800">{makeupDetailModal.absent.member_name}</div>
                <div className="text-xs text-gray-600 mt-1">
                  원본 결석: <b>{makeupDetailModal.absent.date}</b> ({makeupDetailModal.absent.status === "sick" ? "🤒 병결" : "📝 개인사정"})
                </div>
              </div>

              {/* 보강일 */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">보강일</label>
                <input type="date" value={makeupDetailModal.date}
                  onChange={(e) => setMakeupDetailModal({ ...makeupDetailModal, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:outline-none" />
              </div>

              {/* 시/분 선택 */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">시간</label>
                <div className="flex gap-2">
                  <select value={(makeupDetailModal.time || "10:00").split(":")[0]}
                    onChange={(e) => {
                      const min = (makeupDetailModal.time || "10:00").split(":")[1] || "00";
                      setMakeupDetailModal({ ...makeupDetailModal, time: `${e.target.value}:${min}` });
                    }}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:outline-none">
                    {Array.from({ length: 15 }, (_, i) => 8 + i).map(h => (
                      <option key={h} value={String(h).padStart(2, "0")}>{String(h).padStart(2, "0")}시</option>
                    ))}
                  </select>
                  <select value={(makeupDetailModal.time || "10:00").split(":")[1] || "00"}
                    onChange={(e) => {
                      const hr = (makeupDetailModal.time || "10:00").split(":")[0] || "10";
                      setMakeupDetailModal({ ...makeupDetailModal, time: `${hr}:${e.target.value}` });
                    }}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:outline-none">
                    {["00", "10", "20", "30", "40", "50"].map(mn => (
                      <option key={mn} value={mn}>{mn}분</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 담당 강사 */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">담당 강사</label>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setMakeupDetailModal({ ...makeupDetailModal, staff_id: null })}
                    className={`text-[11px] px-2.5 py-1.5 rounded-lg border-2 font-semibold ${!makeupDetailModal.staff_id ? "bg-gray-500 text-white border-gray-500" : "bg-white text-gray-600 border-gray-200"}`}>
                    미지정
                  </button>
                  {staff.filter((s: any) => !s.is_resigned).map((s: any) => {
                    const isSel = makeupDetailModal.staff_id === s.id;
                    const color = s.color || "#3b82f6";
                    return (
                      <button key={s.id} onClick={() => setMakeupDetailModal({ ...makeupDetailModal, staff_id: s.id })}
                        style={isSel ? { backgroundColor: color, borderColor: color, color: "#fff" } : { borderColor: color, color: color }}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg border-2 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isSel ? "#fff" : color }} />
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="border-t px-5 py-3 flex justify-end gap-2">
              <button onClick={() => setMakeupDetailModal(null)}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">취소</button>
              <button onClick={async () => {
                const abs = { ...makeupDetailModal.absent };
                // 스태프 override
                if (makeupDetailModal.staff_id) abs._override_staff_id = makeupDetailModal.staff_id;
                await createMakeupForAbsent(abs, makeupDetailModal.date, makeupDetailModal.time);
                setMakeupDetailModal(null);
                setMakeupMode(null);
              }}
                className="px-4 py-2 text-sm bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:opacity-90 font-bold">
                📅 보강 등록
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ v3.20.11: 매출 상세 팝오버 */}
      {/* ✅ v3.38.2: trackTab 전달 - 수중/지상 매출 분리 */}
      {revenueDetailDate && (
        <RevenueDetailPopover
          date={revenueDetailDate}
          payments={payments}
          members={members}
          staff={staff}
          memberships={memberships}
          track={trackTab}
          onClose={() => setRevenueDetailDate(null)}
        />
      )}

      {/* ✅ v3.38.0: 지상재활 수업 완료 후 다음 예약 팝업 */}
      {nextBookingPopup && (
        <NextGroundBookingModal
          info={nextBookingPopup}
          staff={staff}
          memberships={memberships}
          onClose={() => setNextBookingPopup(null)}
          onSaved={async () => { setNextBookingPopup(null); await loadAll(); }}
        />
      )}
    </main>
  );
}

/* ═══ v3.20.11: 매출 상세 팝오버 (셔 설정 이미지와 동일 레이아웃) ═══ */
// ✅ v3.38.2: track prop 추가 - 수중/지상 매출 분리
function RevenueDetailPopover({ date, payments, members, staff, memberships, onClose, track = "aqua" }: any) {
  // ✅ v3.40.4: paid_at 정규화 (타임존/문자열 형식 차이 방어)
  //   "2026-08-06" 또는 "2026-08-06T00:00:00+00:00" 모두 substring(0,10) 로 통일
  const normDate = (d: any) => {
    if (!d) return "";
    if (typeof d === "string") return d.substring(0, 10);
    try {
      const dt = new Date(d);
      return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
    } catch { return ""; }
  };

  // ✅ v3.40.4: 다중 취소 시그널 통합 판별
  //   - status = 'cancelled' | 'canceled' | 'refunded' | 'void' (대소문자 무관)
  //   - cancelled_at IS NOT NULL
  //   - refund_status = 'full'
  //   - is_cancelled = true
  //   - 연결 회원권 memberships.status = 'cancelled' (전액 취소로 간주)
  //   - refunded_amount >= amount (전액 환불로 간주)
  const isFullyCancelled = (p: any): boolean => {
    const st = String(p?.status || "").toLowerCase().trim();
    if (["cancelled", "canceled", "refunded", "void", "cancel"].includes(st)) return true;
    if (p?.cancelled_at) return true;
    if (p?.is_cancelled === true) return true;
    if (String(p?.refund_status || "").toLowerCase() === "full") return true;
    const amt = Number(p?.amount || 0);
    const ref = Number(p?.refunded_amount || 0);
    if (amt > 0 && ref >= amt) return true;
    // 연결 회원권이 취소된 경우도 취소로 간주 (v3.40.3 슬롯 정리와 정합)
    if (p?.membership_id) {
      const ms = (memberships || []).find((m: any) => m.id === p.membership_id);
      if (ms && String(ms.status || "").toLowerCase() === "cancelled") return true;
    }
    return false;
  };

  const dayPayments = (payments || []).filter((p: any) => {
    if (normDate(p.paid_at) !== normDate(date)) return false;
    const payCat = (p.category || p.track || "aqua").toLowerCase();
    return payCat === track;
  });
  const active   = dayPayments.filter((p: any) => !isFullyCancelled(p));
  const refunded = dayPayments.filter((p: any) => isFullyCancelled(p) || Number(p.refunded_amount || 0) > 0);

  // v3.40.4: 디버깅용 콘솔 로그
  if (dayPayments.length !== active.length) {
    console.log(`[v3.40.4] 매출 상세(${date}): 전체=${dayPayments.length}, 활성=${active.length}, 취소/환불=${refunded.length}`);
  }

  // v3.23.3: 실제 매출 = amount - discount_amount - refunded_amount (할인 차감)
  const netAmt = (p: any) => Math.max(0, (p.amount || 0) - (p.discount_amount || 0) - (p.refunded_amount || 0));
  const totalIncome = active.reduce((s: number, p: any) => s + netAmt(p), 0);
  const totalRefund = refunded.reduce((s: number, p: any) => s + Number(p.refunded_amount || p.amount || 0), 0);
  const totalDiscount = active.reduce((s: number, p: any) => s + Number(p.discount_amount || 0), 0);

  // v3.23.3: 결제방식별도 할인 비율 반영 (amount 대비 net 비율만큼 차감)
  const netRatio = (p: any) => {
    const gross = Number(p.amount || 0);
    if (gross <= 0) return 0;
    return netAmt(p) / gross;
  };
  const cardTotal = active.reduce((s: number, p: any) => s + Number(p.pay_card || (p.method === "card" ? p.amount : 0) || 0) * netRatio(p), 0);
  const cashTotal = active.reduce((s: number, p: any) => s + Number(p.pay_cash || (p.method === "cash" ? p.amount : 0) || 0) * netRatio(p), 0);
  const transferTotal = active.reduce((s: number, p: any) => s + Number(p.pay_transfer || (p.method === "transfer" ? p.amount : 0) || 0) * netRatio(p), 0);

  // 회원권 유형별 매출 (할인 반영)
  const msTypeTotals: Record<string, number> = {};
  active.forEach((p: any) => {
    const ms = (memberships || []).find((m: any) => m.id === p.membership_id);
    const key = ms?.plan_name?.includes("정액") ? "정액권" : (ms?.total_sessions ? "횟수권" : (p.description || "기타"));
    msTypeTotals[key] = (msTypeTotals[key] || 0) + netAmt(p);
  });

  function timeFmt(t: string | null | undefined) {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const ampm = h < 12 ? "오전" : "오후";
    const h12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
    return `${ampm} ${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="modal-panel relative bg-white shadow-2xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col" style={{ borderRadius: "20px" }} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-amber-100 flex items-center justify-between bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50">
          <div>
            <div className="text-[11px] text-amber-600 font-semibold bg-white/70 px-2 py-0.5 rounded-full inline-block mb-1">{date}</div>
            <div className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span className="text-2xl">💰</span> 매출 상세
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/80 rounded-full transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-gradient-to-br from-slate-50/40 via-white to-amber-50/30">
          {dayPayments.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">해당 일 결제 내역이 없습니다</div>
          ) : (
            <div className="space-y-2">
              {refunded.map((p: any) => {
                const mem = members.find((m: any) => m.id === p.member_id);
                const staffP = p.staff_id ? staff.find((s: any) => s.id === p.staff_id) : null;
                const refundAmt = Number(p.refunded_amount || p.amount || 0);
                return (
                  <div key={p.id + "-refund"} className="p-2 border-b border-gray-100 flex items-start justify-between">
                    <div>
                      <div className="text-xs text-red-600 font-semibold">예약금환불</div>
                      <div className="text-[11px] text-gray-500">{timeFmt(p.paid_time)}</div>
                      {mem && <div className="text-[11px] text-gray-700">{mem.name}</div>}
                    </div>
                    <div className="text-red-600 font-semibold text-sm">-{refundAmt.toLocaleString()}</div>
                  </div>
                );
              })}
              {active.map((p: any) => {
                const mem = members.find((m: any) => m.id === p.member_id);
                const staffP = p.staff_id ? staff.find((s: any) => s.id === p.staff_id) : null;
                const ms = memberships.find((m: any) => m.id === p.membership_id);
                const label = ms?.plan_name || p.description || "결제";
                // v3.23.3: 실제 매출 = amount - discount - refunded
                const net = Math.max(0, (p.amount || 0) - (p.discount_amount || 0) - (p.refunded_amount || 0));
                const discountAmt = Number(p.discount_amount || 0);
                return (
                  <div key={p.id} className="p-2 border-b border-gray-100 flex items-start justify-between hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{label}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {timeFmt(p.paid_time)}{mem ? ` · ${mem.name}` : ""}
                      </div>
                      {staffP && <div className="text-[11px] text-gray-500">{staffP.name}</div>}
                      {discountAmt > 0 && (
                        <div className="text-[10px] text-emerald-600 mt-0.5">🎁 할인 -₩{discountAmt.toLocaleString()}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-semibold ${net === 0 ? "text-gray-400" : "text-slate-900"}`}>
                        {net.toLocaleString()}
                      </div>
                      {discountAmt > 0 && (
                        <div className="text-[10px] text-gray-400 line-through">{(p.amount || 0).toLocaleString()}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ✨ v3.32.0: 하단 요약 - modal-panel 파스텔 마감 */}
        <div className="border-t border-amber-100 bg-gradient-to-r from-amber-50/60 via-yellow-50/50 to-orange-50/40 px-5 py-4 space-y-1.5 text-sm">
          <div className="flex items-center justify-between font-bold text-slate-900 text-base pb-1.5 border-b border-amber-100">
            <span className="flex items-center gap-1.5"><span className="text-lg">💵</span> 수입합계</span>
            <span className="text-emerald-600">₩{totalIncome.toLocaleString()}</span>
          </div>
          {cardTotal > 0 && (
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>카드</span>
              <span>{cardTotal.toLocaleString()}</span>
            </div>
          )}
          {cashTotal > 0 && (
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>현금</span>
              <span>{cashTotal.toLocaleString()}</span>
            </div>
          )}
          {transferTotal > 0 && (
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>계좌</span>
              <span>{transferTotal.toLocaleString()}</span>
            </div>
          )}
          {Object.keys(msTypeTotals).length > 0 && (
            <div className="pt-2 mt-2 border-t border-dashed border-gray-300 space-y-0.5">
              {Object.entries(msTypeTotals).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>{k}</span>
                  <span>{v.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
          {totalRefund > 0 && (
            <div className="flex items-center justify-between text-[11px] text-red-500 pt-1">
              <span>환불 합계</span>
              <span>-{totalRefund.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═════ 선택 날짜 상세 패널 (회원 이름 → 링크) ═════ */
function SelectedDayPanel({ date, slots, members, staff, staffName, onAdd, onEdit, onQuickStatus, onDelete }: any) {
  const d = new Date(date);
  const dayLabel = `${d.getMonth()+1}월 ${d.getDate()}일 (${DAYS_KR[d.getDay()]})`;
  const memberMap = useMemo(() => {
    const m: Record<string, any> = {};
    members.forEach((mem: any) => m[mem.id] = mem);
    return m;
  }, [members]);
  // ✅ v3.13.5: 강사별 칼러 매핑
  const staffMap = useMemo(() => {
    const m: Record<string, any> = {};
    (staff || []).forEach((st: any) => { m[st.id] = st; });
    return m;
  }, [staff]);

  return (
    <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-aqu-900 text-sm">{dayLabel}</h3>
        <button onClick={onAdd}
          className="text-xs bg-aqu-600 hover:bg-aqu-700 text-white px-2 py-1 rounded flex items-center gap-1">
          <Plus className="w-3 h-3" /> 추가
        </button>
      </div>

      {slots.length === 0 ? (
        <div className="text-center py-6 text-xs text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
          예약이 없습니다<br/>클릭하여 추가하세요
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
          {slots.map((s: any) => {
            const meta = statusMeta(s.status || "scheduled");
            const mem = memberMap[s.member_id];
            const staffP = staffMap[s.staff_id];
            // ✅ v3.20.1: 완료 안 된 상태는 회색, 직원 이벤트는 검정
            const grayStates2 = ["sick", "cancel", "noshow", "carryover", "personal"];
            const isGray2 = grayStates2.includes(normStatus(s.status));
            const isStaffEv2 = s.event_type === "staff_work" || s.event_type === "staff_off";
            const staffColor = staffP?.color;
            const overrideStyle = isGray2 ? {
              backgroundColor: "#f3f4f6",
              borderLeftColor: "#9ca3af",
              borderLeftWidth: 4,
              color: "#6b7280",
            } : isStaffEv2 ? {
              backgroundColor: "#1f2937",
              borderLeftColor: "#111827",
              borderLeftWidth: 4,
              color: "#f9fafb",
            } : staffColor ? {
              backgroundColor: staffColor + "22",
              borderLeftColor: staffColor,
              borderLeftWidth: 4,
            } : {};
            return (
              <div key={s.id}
                style={overrideStyle}
                className={`border rounded-lg p-2 ${(isGray2 || isStaffEv2 || staffColor) ? "" : meta.color + " border-opacity-50"}`}>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-mono text-xs font-bold">{s.time_slot?.slice(0,5)}</span>
                  <div className="flex items-center gap-1">
                    {s.recurring_id && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-white/60 flex items-center gap-0.5" title="반복 예약">
                        <Repeat className="w-2.5 h-2.5" /> 반복
                      </span>
                    )}
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium">{meta.label}</span>
                  </div>
                </div>
                <div className="text-xs">
                  {mem && (
                    <Link href={`/members/${mem.id}`}
                      className="font-medium flex items-center gap-1 hover:underline decoration-dotted">
                      <User className="w-3 h-3" /> {mem.name}
                      <span className="text-[9px] opacity-70 ml-0.5">
                        ({mem.member_type === "child" ? "아동" : "성인"})
                      </span>
                    </Link>
                  )}
                  {staffName(s.staff_id) && (
                    <div className="text-[10px] opacity-80">👤 {staffName(s.staff_id)}</div>
                  )}
                  {s.lesson_name && (
                    <div className="text-[10px] opacity-80">📚 {s.lesson_name}</div>
                  )}
                  {s.amount > 0 && (
                    <div className="text-[10px] font-bold">💰 ₩{s.amount.toLocaleString()}</div>
                  )}
                  {s.note && (
                    <div className="text-[10px] opacity-70 italic mt-0.5">💬 {s.note}</div>
                  )}
                </div>

                {/* ✨ v3.32.1: 중복 버튼 완전 제거 - 단일 드롭다운 + 삭제 1개만 유지 */}
                <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-white/60">
                  <select
                    value={s.status || "scheduled"}
                    onChange={(e) => onQuickStatus(s, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 text-[10px] font-bold px-2 py-1 rounded-full border border-white/70 bg-white/80 hover:bg-white cursor-pointer outline-none text-slate-700"
                    title="상태 변경"
                  >
                    <option value="scheduled">🕒 예약</option>
                    <option value="done">✅ 완료</option>
                    <option value="sick">🤒 병결</option>
                    <option value="personal">📝 개인사정</option>
                    <option value="cancel">❌ 취소</option>
                    <option value="noshow">🚩 노쇼</option>
                    <option value="carryover">📅 이월</option>
                  </select>
                  <button onClick={() => onEdit(s)}
                    className="text-[10px] px-2 py-1 rounded-full bg-white/70 hover:bg-white text-slate-600 border border-white/70"
                    title="편집">
                    ✎
                  </button>
                  <button onClick={() => onDelete(s.id, { hard: true })}
                    className="text-[10px] px-2 py-1 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200"
                    title="완전 삭제 (복구불가)">
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═════ 하단 상태별 통계 요약 ═════ */
function StatsSummary({ stats, year, month0 }: any) {
  const total = stats.total || 0;
  const done = stats.byStatus.done || 0;
  const scheduled = stats.byStatus.scheduled || 0;
  const sick = stats.byStatus.sick || 0;
  const cancel = stats.byStatus.cancel || 0;
  const noshow = stats.byStatus.noshow || 0;
  const carryover = stats.byStatus.carryover || 0;

  const doneRate     = total > 0 ? Math.round((done / total) * 100)     : 0;
  const attendedRate = total > 0 ? Math.round(((done + carryover) / total) * 100) : 0;
  const missedRate   = total > 0 ? Math.round(((sick + cancel + noshow) / total) * 100) : 0;

  return (
    <div className="mt-4 bg-white rounded-2xl shadow-md border border-aqu-100 p-4 md:p-5">
      <h2 className="text-sm md:text-base font-bold text-aqu-900 mb-3 flex items-center gap-2">
        📊 {year}년 {month0+1}월 상태별 요약
        {total === 0 && <span className="text-xs text-gray-400 font-normal">(데이터 없음)</span>}
      </h2>

      {total > 0 && (
        <>
          {/* 프로그레스 바 */}
          <div className="mb-4">
            <div className="flex w-full h-4 rounded-full overflow-hidden border border-gray-200">
              {STATUS_OPTIONS.map(s => {
                const cnt = stats.byStatus[s.value] || 0;
                const pct = (cnt / total) * 100;
                if (pct === 0) return null;
                return (
                  <div key={s.value}
                    className={s.dot}
                    style={{ width: pct + "%" }}
                    title={`${s.label}: ${cnt}건 (${Math.round(pct)}%)`} />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 mt-2 text-[10px] md:text-xs">
              {STATUS_OPTIONS.map(s => {
                const cnt = stats.byStatus[s.value] || 0;
                if (cnt === 0) return null;
                const pct = Math.round((cnt / total) * 100);
                return (
                  <div key={s.value} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${s.dot}`}></span>
                    <span className="text-gray-700 font-medium">{s.label}</span>
                    <span className="text-gray-500">{cnt}건 · {pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 요약 지표 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <BigStat label="✓ 완료율"    val={doneRate + "%"}     sub={`${done}/${total}건`} color="text-green-600 bg-green-50" />
            <BigStat label="📅 예약 중"  val={scheduled + "건"}   sub={`전체의 ${total > 0 ? Math.round((scheduled/total)*100) : 0}%`} color="text-blue-600 bg-blue-50" />
            <BigStat label="⚠️ 결석/취소" val={(sick+cancel+noshow) + "건"} sub={`병결 ${sick} · 취소 ${cancel} · 노쇼 ${noshow}`} color="text-red-600 bg-red-50" />
            <BigStat label="↻ 이월"      val={carryover + "건"}   sub={carryover > 0 ? `${Math.round((carryover/total)*100)}% 이월` : "이월 없음"} color="text-purple-600 bg-purple-50" />
          </div>

          {/* 매출 */}
          {stats.revenue > 0 && (
            <div className="mt-3 p-3 bg-gradient-to-r from-pink-50 to-rose-50 rounded-xl border border-pink-100 flex items-center justify-between">
              <span className="text-sm font-medium text-pink-800 flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> 이번 달 시간표 등록 매출
              </span>
              <span className="text-lg md:text-xl font-bold text-pink-700">
                ₩{stats.revenue.toLocaleString()}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BigStat({ label, val, sub, color }: any) {
  return (
    <div className={`p-3 rounded-xl ${color}`}>
      <div className="text-[10px] md:text-xs font-medium opacity-80">{label}</div>
      <div className="text-lg md:text-xl font-bold">{val}</div>
      <div className="text-[10px] opacity-70 mt-0.5">{sub}</div>
    </div>
  );
}

/* ═════ 주간 뷰 ═════ */
function WeekView({ slots, members, staff, onCellClick, onCellDoubleClick, onEdit, memberName, timeSlotOptions }: any) {
  // ✅ v3.20.18: 지점 정책의 timeSlotOptions 사용 (fallback: TIMES)
  const times = (timeSlotOptions && timeSlotOptions.length > 0) ? timeSlotOptions : TIMES;
  const staffMap = useMemo(() => {
    const m: Record<string, any> = {};
    (staff || []).forEach((s: any) => m[s.id] = s);
    return m;
  }, [staff]);
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const dow = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    return monday;
  });
  const weekDates = Array.from({length: 6}).map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  function shiftWeek(delta: number) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + delta * 7);
    setWeekStart(d);
  }
  function slotsAt(date: string, time: string) {
    // ✅ v3.25.1: event_date가 timestamp 형식(2026-08-04T00:00:00+00:00)이어도 매칭되도록 정규화
    return slots.filter((s: any) => {
      if (!s.event_date) return false;
      const ed = typeof s.event_date === "string"
        ? s.event_date.substring(0, 10)
        : new Date(s.event_date).toISOString().substring(0, 10);
      return ed === date && s.time_slot === time;
    });
  }

  function goToDate(dateStr: string) {
    const target = new Date(dateStr);
    const dow = target.getDay();
    const monday = new Date(target);
    monday.setDate(target.getDate() - (dow === 0 ? 6 : dow - 1));
    setWeekStart(monday);
  }

  return (
    <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
      <div className="flex items-center justify-between p-2 md:p-3 border-b border-aqu-100 bg-aqu-50 flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => shiftWeek(-1)} className="p-1.5 hover:bg-white rounded" title="이전 주">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => shiftWeek(1)} className="p-1.5 hover:bg-white rounded" title="다음 주">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              const now = new Date();
              const dow = now.getDay();
              const monday = new Date(now);
              monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
              setWeekStart(monday);
            }}
            className="px-2 py-1 text-xs bg-aqu-100 hover:bg-aqu-200 text-aqu-700 rounded">
            이번 주
          </button>
        </div>
        <div className="text-xs md:text-sm font-bold text-aqu-800">
          {ymd(weekDates[0])} ~ {ymd(weekDates[5])}
        </div>
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-aqu-700">날짜 선택:</label>
          <input type="date" value={ymd(weekStart)}
            onChange={e => e.target.value && goToDate(e.target.value)}
            className="px-2 py-1 text-xs border border-aqu-200 rounded focus:ring-2 focus:ring-aqu-400" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs md:text-sm">
          <thead>
            <tr className="border-b border-aqu-100">
              <th className="p-2 text-left w-14 md:w-20 bg-aqu-50">시간</th>
              {weekDates.map((d, i) => (
                <th key={i} className={`p-2 text-center min-w-[100px] bg-aqu-50 ${i===5 ? "text-blue-600" : "text-aqu-800"}`}>
                  <div className="text-[10px] md:text-xs">{DAYS_WEEK[i]}</div>
                  <div className="text-xs md:text-sm font-bold">{d.getMonth()+1}/{d.getDate()}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {times.map((time: string) => (
              <tr key={time} className="border-b border-gray-100">
                <td className="p-2 font-medium text-gray-700 bg-gray-50 text-xs">{time}</td>
                {weekDates.map((d, di) => {
                  const dateStr = ymd(d);
                  const cellSlots = slotsAt(dateStr, time);
                  return (
                    <td key={di} className="p-1 align-top border-l border-gray-100">
                      <div className="space-y-1">
                        {cellSlots.map((s: any) => {
                          const meta = statusMeta(s.status || "scheduled");
                          const mem = members.find((mm: any) => mm.id === s.member_id);
                          const staffP = staffMap[s.staff_id];
                          // ✅ v3.20.2: 수업 안한 상태(병결/노쇼/이월/개인사정/취소) → 오로지 강제 회색
                          const isGrayStatus = ["sick", "noshow", "cancel", "carryover", "personal"].includes(s.status);
                          const isStaffEvent = s.event_type === "staff_work" || s.event_type === "staff_off";
                          const borderColor = (isGrayStatus || isStaffEvent) ? undefined : (staffP?.color || undefined);
                          const forcedStyle = isGrayStatus
                            ? { backgroundColor: "#f3f4f6", borderLeftColor: "#9ca3af", borderLeftWidth: 4, color: "#4b5563" }
                            : isStaffEvent
                              ? { backgroundColor: "#1f2937", borderLeftColor: "#111827", borderLeftWidth: 4, color: "#f9fafb" }
                              : borderColor ? { backgroundColor: borderColor + "22", borderLeftColor: borderColor, borderLeftWidth: 4, color: "#1e293b" }
                              : {};
                          return (
                            <div key={s.id}
                              onClick={() => onEdit(s)}
                              style={forcedStyle}
                              className={`text-[10px] p-1 rounded border ${(isGrayStatus || isStaffEvent || borderColor) ? "" : meta.color} cursor-pointer hover:shadow-sm`}>
                              <div className="font-medium truncate">
                                {mem?.name || s.lesson_name || (
                                  s.event_type === "staff_work" ? `👥 ${staffP?.name || "직원"}${s.note ? " · " + s.note : ""}` :
                                  s.event_type === "staff_off" ? `🏖️ ${staffP?.name || "직원"}${s.note ? " · " + s.note : " 휴무"}` :
                                  s.event_type === "revenue" ? `💰 ₩${(s.amount || 0).toLocaleString()}` :
                                  s.event_type === "trial" ? "🌟 체험" :
                                  s.note || "일정"
                                )}
                              </div>
                              {staffP && (
                                <div className="text-[9px] opacity-90 flex items-center gap-0.5">
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: staffP.color }}></span>
                                  {staffP.name}
                                </div>
                              )}
                              {s.status && s.status !== "scheduled" && (
                                <div className="text-[9px] opacity-70">{meta.label}</div>
                              )}
                            </div>
                          );
                        })}
                        <button
                          onClick={() => onCellClick(dateStr, time)}
                          onDoubleClick={() => onCellDoubleClick && onCellDoubleClick(dateStr, time)}
                          title="클릭: 유형 선택 · 더블클릭: 바로 새 일정"
                          className="w-full text-gray-400 hover:text-aqu-600 hover:bg-aqu-50 rounded border border-dashed border-gray-200 py-0.5">
                          <Plus className="w-3 h-3 inline" />
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═════ 일간 뷰 (강사별 컬럼) ═════ */
function DayView({ date, setDate, slots, members, staff, onCellClick, onCellDoubleClick, onEdit, memberName, timeSlotOptions }: any) {
  // ✅ v3.20.18: 지점 정책의 timeSlotOptions 사용 (fallback: TIMES)
  const times = (timeSlotOptions && timeSlotOptions.length > 0) ? timeSlotOptions : TIMES;
  const dayDate = new Date(date);
  // 해당 날짜에 재직 중인 직원만 표시 (퇴사일 이후엔 숨김)
  const workingStaff = (staff || []).filter((s: any) => {
    if (s.is_resigned && s.resign_date && s.resign_date < date) return false;
    return true;
  });
  const activeStaff = workingStaff.length > 0 ? workingStaff : [{ id: null, name: "미배정", color: "#94a3b8", role: "" }];

  function shift(delta: number) {
    const d = new Date(dayDate);
    d.setDate(dayDate.getDate() + delta);
    setDate(ymd(d));
  }

  function slotsAtStaff(staffId: string | null, time: string) {
    // ✅ v3.25.1: 일간 뷰 event_date 정규화
    return slots.filter((s: any) => {
      if (!s.event_date) return false;
      const ed = typeof s.event_date === "string"
        ? s.event_date.substring(0, 10)
        : new Date(s.event_date).toISOString().substring(0, 10);
      return ed === date &&
        s.time_slot === time &&
        (staffId ? s.staff_id === staffId : !s.staff_id);
    });
  }

  // ✅ v3.25.1: 일간 뷰 daySlots event_date 정규화
  const daySlots = slots.filter((s: any) => {
    if (!s.event_date) return false;
    const ed = typeof s.event_date === "string"
      ? s.event_date.substring(0, 10)
      : new Date(s.event_date).toISOString().substring(0, 10);
    return ed === date;
  });
  const total = daySlots.length;

  return (
    <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-3 border-b border-aqu-100 bg-aqu-50">
        <button onClick={() => shift(-1)} className="p-1.5 hover:bg-white rounded">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-sm md:text-base font-bold text-aqu-800">
          {date} ({DAYS_KR[dayDate.getDay()]}) · 총 {total}건
        </div>
        <button onClick={() => shift(1)} className="p-1.5 hover:bg-white rounded">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 강사별 컬럼 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-aqu-100">
              <th className="p-2 text-left w-14 md:w-20 bg-aqu-50">시간</th>
              {activeStaff.map((st: any) => (
                <th key={st.id || "unassigned"}
                    className="p-2 text-center min-w-[120px] bg-aqu-50"
                    style={{ borderTop: `4px solid ${st.color || "#94a3b8"}` }}>
                  <div className="flex items-center justify-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color || "#94a3b8" }}></span>
                    <span className="font-bold text-aqu-800">{st.name}</span>
                  </div>
                  {st.role && <div className="text-[9px] text-gray-500">{st.role}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {times.map((time: string) => (
              <tr key={time} className="border-b border-gray-100">
                <td className="p-2 font-medium text-gray-700 bg-gray-50 text-xs">{time}</td>
                {activeStaff.map((st: any) => {
                  const cellSlots = slotsAtStaff(st.id, time);
                  return (
                    <td key={st.id || "un"} className="p-1 align-top border-l border-gray-100 min-w-[120px]">
                      <div className="space-y-1">
                        {cellSlots.map((s: any) => {
                          const meta = statusMeta(s.status || "scheduled");
                          const mem = members.find((m: any) => m.id === s.member_id);
                          // ✅ v3.20.2: 일간 뷰도 수업 안한 상태는 회색 강제
                          const isGrayStatus = ["sick", "noshow", "cancel", "carryover", "personal"].includes(s.status);
                          const isStaffEvent = s.event_type === "staff_work" || s.event_type === "staff_off";
                          const forcedStyle = isGrayStatus
                            ? { borderLeft: "4px solid #9ca3af", backgroundColor: "#f3f4f6", color: "#4b5563" }
                            : isStaffEvent
                              ? { borderLeft: "4px solid #111827", backgroundColor: "#1f2937", color: "#f9fafb" }
                              : { borderLeft: `4px solid ${st.color || "#94a3b8"}`, backgroundColor: (st.color || "#94a3b8") + "22", color: "#1e293b" };
                          return (
                            <div key={s.id}
                              onClick={() => onEdit(s)}
                              style={forcedStyle}
                              className={`text-[10px] p-1.5 rounded cursor-pointer hover:shadow-sm`}>
                              <div className="font-medium truncate">
                                {mem?.name || s.lesson_name || (
                                  s.event_type === "staff_work" ? `👥 ${st.name}${s.note ? " · " + s.note : " 근무"}` :
                                  s.event_type === "staff_off" ? `🏖️ ${st.name}${s.note ? " · " + s.note : " 휴무"}` :
                                  s.event_type === "revenue" ? `💰 ₩${(s.amount || 0).toLocaleString()}` :
                                  s.event_type === "trial" ? "🌟 체험" :
                                  s.note || "일정"
                                )}
                              </div>
                              {s.lesson_name && mem && (
                                <div className="text-[9px] opacity-70 truncate">{s.lesson_name}</div>
                              )}
                              {s.status && s.status !== "scheduled" && (
                                <div className="text-[9px] font-bold">{meta.label}</div>
                              )}
                            </div>
                          );
                        })}
                        <button
                          onClick={() => onCellClick(date, time)}
                          onDoubleClick={() => onCellDoubleClick && onCellDoubleClick(date, time)}
                          title="클릭: 유형 선택 · 더블클릭: 바로 새 일정"
                          className="w-full text-gray-400 hover:text-aqu-600 hover:bg-aqu-50 rounded border border-dashed border-gray-200 py-0.5">
                          <Plus className="w-3 h-3 inline" />
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="p-3 border-t border-aqu-100 bg-aqu-50/50">
        <div className="text-[10px] text-gray-600 mb-1">강사 색상 범례</div>
        <div className="flex flex-wrap gap-2">
          {activeStaff.map((st: any) => (
            <div key={st.id || "un"} className="flex items-center gap-1 text-[10px]">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: st.color || "#94a3b8" }}></span>
              <span>{st.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═════ 등록/수정 모달 (반복예약 옵션 포함) ═════ */
function SlotModal({ f, setF, modal, members, staff, plans, timeSlotOptions, onClose, onSave, onDelete, saving }: any) {
  const isEditing = !!f.id;
  const isRecurring = !!f.recurring_id;
  // 예약 날짜 기준 재직 중인 직원만 노출 (퇴사일 이후엔 선택 불가)
  const targetDate = f.event_date || modal?.date || new Date().toISOString().split("T")[0];
  const availableStaff = (staff || []).filter((s: any) => {
    if (!s.is_resigned) return true;
    if (s.resign_date && s.resign_date >= targetDate) return true; // 퇴사일 당일까지는 선택 가능
    // 현재 수정 중인 예약에 이미 해당 직원이 배정되어 있으면 표시
    if (f.staff_id === s.id) return true;
    return false;
  });

  // ✅ v3.16.0: 선택한 회원의 보유 회원권 자동 로드
  const [memberMemberships, setMemberMemberships] = useState<any[]>([]);
  const [loadingMs, setLoadingMs] = useState(false);
  useEffect(() => {
    if (!f.member_id) { setMemberMemberships([]); return; }
    setLoadingMs(true);
    (async () => {
      // ✅ v3.16.1: price/amount 모두 조회 + status 없는 경우도 포함
      const { data } = await supabase
        .from("memberships")
        .select("id, plan_name, total_sessions, used_sessions, start_date, end_date, status, amount, price")
        .eq("member_id", f.member_id)
        .order("created_at", { ascending: false });
      // ✅ v3.16.1: 제외 조건을 명시적으로 반전 (status가 null이거나 다른 값이어도 포함)
      const active = (data || []).filter((m: any) => {
        if (m.status === "cancelled" || m.status === "refunded" || m.status === "expired") return false;
        return true;
      });
      setMemberMemberships(active);
      setLoadingMs(false);
    })();
  }, [f.member_id]);

  const selectedMs = memberMemberships.find((m: any) => m.id === f.membership_id);
  const selectedMember = (members || []).find((m: any) => m.id === f.member_id);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>

        {/* ✅ v3.16.0: 헤더 (색상 대조 강화) */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-aqu-50 to-blue-50 rounded-t-2xl sticky top-0 z-10">
          <h2 className="text-lg font-bold text-aqu-900 flex items-center gap-2">
            📅 {isEditing ? "일정 수정" : "새 일정"}
            {isRecurring && (
              <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded flex items-center gap-1">
                <Repeat className="w-3 h-3" /> 반복 시리즈
              </span>
            )}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* ═══ 섹션 1: 기본 정보 (v3.20.6 재디자인) ═══ */}
          <div className="bg-gradient-to-br from-aqu-50/40 to-blue-50/40 border border-aqu-100 rounded-xl p-4">
            <div className="text-xs font-bold text-aqu-800 mb-3 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> 기본 정보
            </div>
            {/* 날짜 */}
            <Field label="날짜 *">
              <input type="date" value={f.event_date}
                onChange={e => setF({ ...f, event_date: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none bg-white" />
            </Field>

            {/* 시간 – 카드 형태로 별도 박스 */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-gray-600">⏰ 시간 *</label>
                <span className="text-[10px] text-aqu-600 bg-white px-2 py-0.5 rounded-full border border-aqu-200">
                  {timeSlotOptions?.length || 0}개 타임 등록됨
                </span>
              </div>
              {timeSlotOptions && timeSlotOptions.length > 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-2.5 space-y-2">
                  {/* 프리셋 버튼 그리드 */}
                  <div className="grid grid-cols-4 gap-1">
                    {timeSlotOptions.map((t: string) => {
                      const isActive = f.time_slot?.slice(0, 5) === t;
                      return (
                        <button key={t} type="button"
                          onClick={() => setF({ ...f, time_slot: t })}
                          className={`py-1.5 rounded-lg text-xs font-semibold transition ${isActive ? "bg-aqu-600 text-white shadow-sm" : "bg-gray-50 text-gray-700 hover:bg-aqu-100 border border-gray-200"}`}>
                          {t}
                        </button>
                      );
                    })}
                  </div>
                  {/* 구분선 */}
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span>또는 직접 입력</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                  {/* 직접 입력 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-gray-500">🔧</span>
                    <input type="time" value={f.time_slot?.slice(0, 5) || ""}
                      onChange={e => setF({ ...f, time_slot: e.target.value })}
                      title="운영시간 외 수동 입력"
                      className="flex-1 px-3 py-2 border border-orange-200 bg-orange-50 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:outline-none" />
                    <span className="text-[10px] text-orange-600 whitespace-nowrap">운영시간 외 OK</span>
                  </div>
                  {!timeSlotOptions.includes(f.time_slot?.slice(0, 5)) && f.time_slot && (
                    <div className="text-[10px] text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-2 py-1.5">
                      ⚠️ 지점 운영시간 외 사용자 지정 시간: <b>{f.time_slot?.slice(0, 5)}</b>
                    </div>
                  )}
                </div>
              ) : (
                <input type="time" value={f.time_slot}
                  onChange={e => setF({ ...f, time_slot: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none bg-white" />
              )}
            </div>
            <div className="mt-2">
              <Field label="유형">
                <select value={f.event_type} onChange={e => setF({ ...f, event_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none bg-white">
                  {/* ✅ v3.20.3: 직원 근무·휴무 옵션 복원 (회원 수업↔직원 일정 통합 등록) */}
                  <optgroup label="📚 회원 수업">
                    <option value="lesson">🏊 수업</option>
                    <option value="trial">🎯 체험</option>
                    <option value="makeup">🔄 보강</option>
                  </optgroup>
                  <optgroup label="👥 직원 일정">
                    <option value="staff_work">👤 직원 근무</option>
                    <option value="staff_off">🏖️ 직원 휴무</option>
                  </optgroup>
                  <optgroup label="📌 기타">
                    <option value="other">📌 기타</option>
                  </optgroup>
                </select>
              </Field>
            </div>
          </div>

          {/* ═══ 섹션 2: 회원 · 강사 (수업·체험·보강·매출) ═══ */}
          {(f.event_type === "lesson" || f.event_type === "trial" || f.event_type === "makeup" || f.event_type === "revenue") && (
            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3">
              <div className="text-xs font-bold text-blue-700 mb-2">👤 회원 · 강사</div>
              <div className="space-y-2">
                <Field label="회원">
                  <MemberSearch
                    members={members}
                    value={f.member_id}
                    onChange={(id: string) => setF({ ...f, member_id: id, membership_id: null, lesson_name: "" })}
                  />
                </Field>
                {selectedMember && (
                  <div className="text-[11px] text-blue-800 bg-white rounded px-2 py-1 border border-blue-200">
                    ✓ {selectedMember.name} ({selectedMember.member_type === "child" ? "아동" : "성인"})
                    {selectedMember.phone && ` · ${selectedMember.phone}`}
                  </div>
                )}
                <Field label={`담당 강사 (${availableStaff.length}명)`}>
                  {/* ✅ v3.17.1: 드롭다운 → 프로필 태그 버튼으로 변경 (강사 색상 반영) */}
                  {availableStaff.length === 0 ? (
                    <div className="text-xs text-red-500 py-2">⚠️ 해당 날짜에 재직 강사가 없습니다</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setF({ ...f, staff_id: "" })}
                        className={`px-2.5 py-1.5 rounded-full text-xs font-medium border-2 transition ${f.staff_id === "" ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"}`}
                      >
                        — 미지정
                      </button>
                      {availableStaff.map((s: any) => {
                        const isSel = f.staff_id === s.id;
                        const color = s.color || "#3b82f6";
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setF({ ...f, staff_id: s.id })}
                            title={`${s.name} · ${s.role || "직원"}${s.is_resigned && s.resign_date ? ` ⚠️ ${s.resign_date} 퇴사예정` : ""}`}
                            style={isSel ? { backgroundColor: color, borderColor: color, color: "#fff" } : { borderColor: color, color: color }}
                            className="px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition hover:shadow-md flex items-center gap-1.5"
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: isSel ? "#fff" : color }}
                            />
                            {s.name}
                            <span className="text-[10px] opacity-80">({s.role || "직원"})</span>
                            {s.is_resigned && s.resign_date && (
                              <span className="text-[9px] ml-0.5">⚠️</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Field>
              </div>
            </div>
          )}

          {/* ═══ 섹션 3: ✅ v3.16.0 회원 보유 회원권 자동 표시 ═══ */}
          {(f.event_type === "lesson" || f.event_type === "trial" || f.event_type === "makeup") && f.member_id && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold text-emerald-700">🎫 보유 회원권</div>
                <span className="text-[10px] text-emerald-600">출석 시 자동 차감</span>
              </div>
              {loadingMs ? (
                <div className="text-xs text-emerald-600">회원권 불러오는 중...</div>
              ) : memberMemberships.length === 0 ? (
                <div className="text-xs text-emerald-800 bg-white rounded p-2 border border-emerald-200">
                  ⚠️ 보유 회원권이 없습니다. <a href="/payments" className="underline font-bold">결제 등록</a>으로 이동하세요.
                </div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  <label className="flex items-center gap-2 p-2 bg-white rounded-lg border-2 border-gray-200 cursor-pointer hover:bg-gray-50">
                    <input type="radio" name="ms" checked={!f.membership_id} onChange={() => setF({ ...f, membership_id: null })} />
                    <span className="text-xs text-gray-600">회원권 없이 진행 (차감 안함)</span>
                  </label>
                  {memberMemberships.map((m: any) => {
                    const remaining = (m.total_sessions || 0) - (m.used_sessions || 0);
                    const low = remaining <= 3;
                    const isActive = f.membership_id === m.id;
                    return (
                      <label key={m.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border-2 cursor-pointer transition ${isActive ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200" : "border-gray-200 bg-white hover:border-emerald-300"}`}>
                        <input type="radio" name="ms" checked={isActive}
                          onChange={() => setF({ ...f, membership_id: m.id, lesson_name: m.plan_name || f.lesson_name })} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-gray-800">{m.plan_name || "회원권"}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${low ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                              {remaining}/{m.total_sessions}회 남음
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            {m.start_date && `${m.start_date}`}{m.end_date && ` ~ ${m.end_date}`}
                            {m.amount ? ` · ₩${Number(m.amount).toLocaleString()}` : ""}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              {selectedMs && (
                <div className="mt-2 p-2 bg-white rounded border border-emerald-300 text-[11px] text-emerald-800">
                  💡 이 예약을 <b>완료</b> 상태로 저장하면 <b>{selectedMs.plan_name}</b>에서 1회 자동 차감됩니다.
                </div>
              )}
            </div>
          )}

          {/* ═══ 섹션 4: 수업명 (보강·기타 포함) ═══ */}
          {!f.membership_id && (["lesson", "trial", "makeup", "revenue", "other"].includes(f.event_type)) && (
            <Field label={f.event_type === "makeup" ? "보강 수업명" : (f.event_type === "other" ? "일정 명칭" : "수업명 (직접 입력)")}>
              <PlanPicker plans={plans} value={f.lesson_name} onChange={(name: string) => setF({ ...f, lesson_name: name })} />
            </Field>
          )}

          {f.event_type === "revenue" && (
            <Field label="금액 (원)">
              <input type="number" value={f.amount}
                onChange={e => setF({ ...f, amount: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
            </Field>
          )}

          {(f.event_type === "staff_work" || f.event_type === "staff_off") ? (
            <Field label={f.event_type === "staff_work" ? "📝 근무 사유 / 내용" : "📝 휴무 사유"}>
              <textarea value={f.note || ""}
                onChange={e => setF({ ...f, note: e.target.value })}
                rows={3}
                placeholder={f.event_type === "staff_work" ? "예: 오전조 근무, 회의 참석, 교육 등" : "예: 연차, 병가, 경조사 등"}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none resize-none" />
              <div className="text-[10px] text-gray-500 mt-1">ℹ️ 직원 근무/휴무는 상태 구분 없이 사유만 기록됩니다</div>
            </Field>
          ) : (
          <Field label="상태">
            <div className="grid grid-cols-3 gap-1">
              {STATUS_OPTIONS.map(st => (
                <button key={st.value} type="button"
                  onClick={() => setF({ ...f, status: st.value })}
                  className={`py-2 px-2 rounded-lg border text-xs ${f.status === st.value ? st.color + " font-bold shadow-sm" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                  {st.label}
                </button>
              ))}
            </div>
          </Field>
          )}

          {!(f.event_type === "staff_work" || f.event_type === "staff_off") && (
            <Field label="메모">
              <input type="text" value={f.note}
                onChange={e => setF({ ...f, note: e.target.value })}
                placeholder="예: 컨디션 나빠 30분 조기 종료"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
            </Field>
          )}

          {/* 반복 예약 옵션 (새 예약일 때만) */}
          {!isEditing && (
            <div className="p-3 bg-purple-50/50 border border-purple-100 rounded-xl">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={f.recurring_enabled}
                  onChange={e => setF({ ...f, recurring_enabled: e.target.checked })}
                  className="w-4 h-4 accent-purple-600" />
                <span className="text-sm font-medium text-purple-900 flex items-center gap-1">
                  <Repeat className="w-4 h-4" /> 매주 반복 예약
                </span>
              </label>
              {f.recurring_enabled && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-purple-800">이번 주부터</span>
                  <select value={f.recurring_weeks}
                    onChange={e => setF({ ...f, recurring_weeks: parseInt(e.target.value) })}
                    className="px-2 py-1 border border-purple-200 rounded text-sm bg-white focus:ring-2 focus:ring-purple-400 focus:outline-none">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <option key={n} value={n}>{n}주 동안</option>
                    ))}
                  </select>
                  <span className="text-xs text-purple-800">매주 같은 시간</span>
                </div>
              )}
              {f.recurring_enabled && f.event_date && (
                <div className="text-[11px] text-purple-700 mt-2">
                  📅 {f.event_date} ({DAYS_KR[new Date(f.event_date).getDay()]})요일 {f.time_slot}에 <b>{f.recurring_weeks}회</b> 자동 등록됩니다
                </div>
              )}
            </div>
          )}
        </div>

        {/* ✅ v3.20.16: 삭제 버튼 3종 통일 디자인 (동일 크기·글꼴·패딩) */}
        <div className="flex flex-wrap items-center gap-2 mt-5">
          {onDelete && (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => onDelete({ mode: "single" })}
                className="px-3 py-2 border border-red-200 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 flex items-center gap-1"
                title="이 일정만 삭제">
                <Trash2 className="w-3.5 h-3.5" /> 이 일정
              </button>
              {isRecurring && (
                <>
                  <button onClick={() => onDelete({ mode: "series_after", recurring_id: f.recurring_id, from_date: f.event_date })}
                    className="px-3 py-2 border border-orange-200 bg-orange-50 text-orange-700 rounded-lg text-xs font-semibold hover:bg-orange-100 flex items-center gap-1"
                    title="이 날짜 이후(포함) 반복 삭제">
                    <Trash2 className="w-3.5 h-3.5" /> 이후 삭제
                  </button>
                  <button onClick={() => onDelete({ mode: "series_all", recurring_id: f.recurring_id })}
                    className="px-3 py-2 border border-red-300 bg-red-100 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-200 flex items-center gap-1"
                    title="반복 시리즈 전체 삭제">
                    <Trash2 className="w-3.5 h-3.5" /> 전체 삭제
                  </button>
                </>
              )}
            </div>
          )}
          <button onClick={onClose} disabled={saving}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            취소
          </button>
          <button onClick={onSave} disabled={saving}
            className="flex-1 px-4 py-2 bg-aqu-600 text-white rounded-lg text-sm hover:bg-aqu-700 disabled:opacity-50">
            {saving ? "저장 중..." : (f.recurring_enabled ? `${f.recurring_weeks}주 등록` : "저장")}
          </button>
        </div>
      </div>
    </div>
  );
}

function MonthKPI({ label, val, color }: any) {
  return (
    <div className="kpi-card bg-white px-1.5 py-2 rounded-xl border border-aqu-100 text-center hover:shadow-sm transition-shadow">
      <div className="text-[10px] text-gray-500 truncate leading-tight">{label}</div>
      <div className={`text-base md:text-lg font-extrabold leading-tight ${color}`}>{val}</div>
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

// 예약 셀 클릭 시 떨어지는 빠른 액션 시트 (출결 + 결제 + 수정)
function QuickActionSheet({ slot, members, staff, plans, payments, attendance, onClose, onEdit, onAttendance, onAddPayment, onDeletePayment, onSignAttendance }: any) {
  const member = members.find((m: any) => m.id === slot.member_id);
  const staffP = staff.find((s: any) => s.id === slot.staff_id);
  const [tab, setTab] = useState<"info" | "attend" | "payment">("info");

  // 새 결제 폼
  const [payPlanId, setPayPlanId] = useState("");
  const [payLesson, setPayLesson] = useState(slot.lesson_name || "");
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState("card");
  const [payTime, setPayTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [payCardNo, setPayCardNo] = useState("");
  const [payApprovalNo, setPayApprovalNo] = useState("");

  function handlePlanChange(planId: string) {
    setPayPlanId(planId);
    const p = plans?.find((x: any) => x.id === planId);
    if (p) {
      setPayLesson(p.name);
      setPayAmount(p.price || 0);
    }
  }

  function maskCardNo(v: string) {
    // 입력 중에는 그대로 보여주고, 저장 시에만 마스킹
    return v.replace(/[^\d-]/g, "");
  }
  function finalMaskedCardNo() {
    const digits = payCardNo.replace(/\D/g, "");
    if (digits.length < 8) return payCardNo || null;
    if (digits.length >= 12) {
      return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-****-${digits.slice(-4)}`;
    }
    return payCardNo;
  }

  // 예약의 status를 기준으로 하되, attendance가 있으면 보조적으로 표시
  const currentSlotStatus = normStatus(slot.status);
  const currentSlotMeta = statusMeta(currentSlotStatus);
  const currentAttStatus = attendance?.status;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-aqu-50 to-cyan-50">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs text-gray-500">{slot.event_date} · {slot.time_slot}</div>
              <div className="text-lg font-bold text-aqu-900 mt-0.5 flex items-center gap-2">
                {member ? (
                  <>
                    {member.member_type === "child" ? "🧒" : "👤"} {member.name}
                    <a href={`/members/${member.id}`} className="text-xs text-aqu-600 hover:underline">👁️ 상세</a>
                  </>
                ) : (
                  <span className="text-gray-500">회원 미지정</span>
                )}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {slot.lesson_name && `📐 ${slot.lesson_name}`}
                {staffP && ` · 👨‍⚕️ ${staffP.name}`}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-gray-100">
          <button onClick={() => setTab("info")}
            className={`flex-1 py-3 text-sm font-medium ${tab === "info" ? "text-aqu-700 border-b-2 border-aqu-500 bg-aqu-50/50" : "text-gray-500"}`}>
            ℹ️ 예약정보
          </button>
          <button onClick={() => setTab("attend")}
            className={`flex-1 py-3 text-sm font-medium ${tab === "attend" ? "text-purple-700 border-b-2 border-purple-500 bg-purple-50/50" : "text-gray-500"}`}>
            ✅ 출결 {currentSlotStatus !== "scheduled" && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${currentSlotMeta.color}`}>
                {currentSlotMeta.label}
              </span>
            )}
          </button>
          <button onClick={() => setTab("payment")}
            className={`flex-1 py-3 text-sm font-medium ${tab === "payment" ? "text-pink-700 border-b-2 border-pink-500 bg-pink-50/50" : "text-gray-500"}`}>
            💰 결제 {payments.length > 0 && (() => {
              const activeCount = payments.filter((p: any) => p.status !== "cancelled").length;
              const cancelCount = payments.length - activeCount;
              return (
                <>
                  {activeCount > 0 && <span className="ml-1 px-1.5 bg-pink-100 text-pink-700 text-[10px] rounded-full">{activeCount}</span>}
                  {cancelCount > 0 && <span className="ml-1 px-1.5 bg-gray-200 text-gray-500 text-[10px] rounded-full line-through">{cancelCount}</span>}
                </>
              );
            })()}
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "info" && (
            <div className="space-y-3">
              <InfoLine label="날짜" value={slot.event_date} />
              <InfoLine label="시간" value={slot.time_slot} />
              <InfoLine label="유형" value={eventTypeLabel(slot.event_type)} />
              <div className="flex items-start gap-3">
                <span className="text-xs text-gray-500 min-w-[60px] pt-1">상태</span>
                <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${currentSlotMeta.color}`}>
                  {currentSlotMeta.label}
                </span>
              </div>
              {slot.lesson_name && <InfoLine label="수업명" value={slot.lesson_name} />}
              {slot.amount > 0 && <InfoLine label="금액" value={`₩${slot.amount.toLocaleString()}`} />}
              {slot.note && <InfoLine label="메모" value={slot.note} />}
              {slot.recurring_id && (
                <div className="p-2 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-800">
                  ♻️ 반복 예약의 일부입니다
                </div>
              )}
              <button onClick={onEdit}
                className="w-full py-2.5 bg-aqu-500 hover:bg-aqu-600 text-white text-sm font-medium rounded-lg mt-4">
                ✏️ 예약 수정/삭제
              </button>
            </div>
          )}

          {tab === "attend" && (
            <div className="space-y-3">
              <div className="text-xs text-gray-600">
                <b>{slot.event_date}</b> 상태를 선택하세요.
                <span className="ml-1 text-gray-500">완료/노쇼만 회원권 1회 차감</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => onAttendance("done")}
                  className={`py-4 rounded-xl border-2 font-medium text-sm ${currentSlotStatus === "done" ? "bg-green-500 border-green-500 text-white shadow-md" : "border-green-200 text-green-700 hover:bg-green-50"}`}>
                  ✅<br/>완료
                  <div className="text-[9px] mt-1 opacity-80">− 1회 차감</div>
                </button>
                <button onClick={() => onAttendance("noshow")}
                  className={`py-4 rounded-xl border-2 font-medium text-sm ${currentSlotStatus === "noshow" ? "bg-red-500 border-red-500 text-white shadow-md" : "border-red-200 text-red-700 hover:bg-red-50"}`}>
                  🚩<br/>노쇼
                  <div className="text-[9px] mt-1 opacity-80">− 1회 차감</div>
                </button>
                <button onClick={() => onAttendance("sick")}
                  className={`py-4 rounded-xl border-2 font-medium text-sm ${currentSlotStatus === "sick" ? "bg-orange-500 border-orange-500 text-white shadow-md" : "border-orange-200 text-orange-700 hover:bg-orange-50"}`}>
                  🤒<br/>병결
                  <div className="text-[9px] mt-1 opacity-80">차감 없음</div>
                </button>
                <button onClick={() => onAttendance("carryover")}
                  className={`py-4 rounded-xl border-2 font-medium text-sm ${currentSlotStatus === "carryover" ? "bg-purple-500 border-purple-500 text-white shadow-md" : "border-purple-200 text-purple-700 hover:bg-purple-50"}`}>
                  📅<br/>이월
                  <div className="text-[9px] mt-1 opacity-80">차감 없음</div>
                </button>
                <button onClick={() => {
                    if (!confirm("🚫 이 예약을 '취소(노쇼)' 처리합니다.\n\n⚠️ 회원권 1회가 차감되며, 스케줄은 삭제되지 않고 회색으로 남습니다.\n\n계속하시겠습니까?")) return;
                    onAttendance("cancel");
                  }}
                  className={`py-4 rounded-xl border-2 font-medium text-sm ${currentSlotStatus === "cancel" ? "bg-gray-600 border-gray-600 text-white shadow-md" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
                  🚫<br/>취소(노쇼)
                  <div className="text-[9px] mt-1 opacity-80">− 1회 차감</div>
                </button>
                <button onClick={() => onAttendance("scheduled" as any)}
                  className={`py-4 rounded-xl border-2 font-medium text-sm ${currentSlotStatus === "scheduled" ? "bg-blue-500 border-blue-500 text-white shadow-md" : "border-blue-200 text-blue-700 hover:bg-blue-50"}`}>
                  🔵<br/>예약으로
                  <div className="text-[9px] mt-1 opacity-80">초기화</div>
                </button>
              </div>

              {/* ✅ v3.20.1: 사인 출결 (SignaturePad 재사용) */}
              {member && (
                <button onClick={() => onSignAttendance && onSignAttendance()}
                  className="w-full py-3 mt-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-md">
                  ✍️ 사인 출결 (보호자·본인 서명)
                </button>
              )}

              <div className="text-[11px] text-gray-500 mt-2 p-3 bg-gray-50 rounded-lg leading-relaxed">
                💡 <b className="text-green-700">완료</b>·<b className="text-red-700">노쇼</b>·<b className="text-gray-700">취소</b>는 회원권 <b>1회 차감</b> (오지 않은 것으로 처리).<br/>
                <b className="text-orange-700">병결</b>·<b className="text-purple-700">이월</b>은 차감 없음 (다음 기회로 넘김).<br/>
                <span className="text-blue-700">✅ 취소 처리 시 스케줄은 삭제되지 않고 회색으로 남습니다 (v3.45.8)</span>
              </div>
            </div>
          )}

          {tab === "payment" && (
            <div className="space-y-4">
              {/* 등록된 결제 목록 */}
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-2">등록된 결제 내역</div>
                {payments.length === 0 ? (
                  <div className="text-xs text-gray-400 py-3 text-center bg-gray-50 rounded-lg">아직 결제 내역이 없습니다</div>
                ) : (
                  <div className="space-y-2">
                    {payments.map((p: any) => {
                      const isCancelled = p.status === "cancelled";
                      const isReplaced = !!p.replaced_by;
                      return (
                      <div key={p.id} className={`p-3 border rounded-lg ${isCancelled ? "bg-gray-100 border-gray-300 opacity-70" : "bg-pink-50 border-pink-100"}`}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            {isCancelled && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-red-500 text-white rounded font-bold">❌ 취소됨</span>
                            )}
                            {isReplaced && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-blue-500 text-white rounded font-bold">🔄 재결제됨</span>
                            )}
                            {p.replaces && !isCancelled && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-green-500 text-white rounded font-bold">🆕 재결제</span>
                            )}
                            <div className={`text-sm font-bold ${isCancelled ? "text-gray-500 line-through" : "text-pink-900"}`}>
                              ₩{(p.amount || 0).toLocaleString()}
                            </div>
                          </div>
                          {!isCancelled && (
                            <button onClick={() => onDeletePayment(p.id)}
                              className="text-xs text-red-500 hover:text-red-700">취소</button>
                          )}
                        </div>
                        <div className={`text-[10px] space-y-0.5 ${isCancelled ? "text-gray-500" : "text-gray-700"}`}>
                          <div>
                            <span className="font-medium">
                              {p.method === "card" ? "💳 카드" :
                               p.method === "cash" ? "💵 현금" :
                               p.method === "transfer" ? "🏦 계좌이체" : "📝 기타"}
                            </span>
                            {p.paid_time && ` · ${p.paid_time}`}
                          </div>
                          {p.lesson_name && <div>📚 {p.lesson_name}</div>}
                          {p.card_number && <div className="font-mono">💳 {p.card_number}</div>}
                          {p.approval_no && <div>승인: {p.approval_no}</div>}
                          <div className="text-gray-400">{new Date(p.paid_at).toLocaleDateString("ko-KR")}</div>
                          {isCancelled && p.cancelled_reason && (
                            <div className="mt-1 pt-1 border-t border-gray-300 text-red-600">
                              ❌ 취소사유: {p.cancelled_reason}
                              {p.cancelled_at && <span className="text-gray-400 ml-1">({new Date(p.cancelled_at).toLocaleDateString("ko-KR")})</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );})}
                  </div>
                )}
              </div>

              {/* 새 결제 등록 */}
              <div className="border-t border-gray-100 pt-4">
                <div className="text-xs font-semibold text-gray-600 mb-2">💰 새 결제 등록</div>
                <div className="space-y-2">
                  {/* 회원권 드롭다운 */}
                  {plans && plans.length > 0 && (
                    <div>
                      <label className="text-[10px] text-gray-500">회원권 선택</label>
                      <select value={payPlanId} onChange={e => handlePlanChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                        <option value="">-- 직접 입력 --</option>
                        {plans.map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.sessions > 0 ? `(${p.sessions}회)` : ""} ‧ ₩{(p.price || 0).toLocaleString()}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] text-gray-500">프로그램명</label>
                    <input type="text" value={payLesson} onChange={e => setPayLesson(e.target.value)}
                      placeholder="예: 수중프로그램 10회권"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500">금액 (원)</label>
                      <input type="number" value={payAmount || ""} onChange={e => setPayAmount(parseInt(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500">결제 시간</label>
                      <input type="time" value={payTime} onChange={e => setPayTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-500">결제 수단</label>
                    <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                      <option value="card">💳 카드</option>
                      <option value="cash">💵 현금</option>
                      <option value="transfer">🏦 계좌이체</option>
                      <option value="other">📝 기타</option>
                    </select>
                  </div>

                  {payMethod === "card" && (
                    <div className="space-y-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                      <div>
                        <label className="text-[10px] text-blue-700">카드 번호 (자동 마스킹)</label>
                        <input type="text" value={payCardNo} onChange={e => setPayCardNo(maskCardNo(e.target.value))}
                          placeholder="1234-5678-9012-3456"
                          maxLength={19}
                          className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white" />
                        {payCardNo.replace(/\D/g, "").length >= 12 && (
                          <div className="text-[10px] text-blue-600 mt-1">저장 시: <span className="font-mono">{finalMaskedCardNo()}</span></div>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] text-blue-700">승인번호</label>
                        <input type="text" value={payApprovalNo} onChange={e => setPayApprovalNo(e.target.value)}
                          placeholder="예: 12345678"
                          className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white" />
                      </div>
                    </div>
                  )}

                  <button onClick={() => {
                    if (!payAmount) { alert("금액을 입력하세요"); return; }
                    // 선택된 회원권의 sessions/valid_days를 함께 전송 (회원권 자동 생성용)
                    const selPlan = plans?.find((x: any) => x.id === payPlanId);
                    onAddPayment({
                      plan_id: payPlanId || null,
                      lesson_name: payLesson,
                      plan_name: selPlan?.name || payLesson,
                      sessions: selPlan?.sessions || 0,
                      valid_days: selPlan?.valid_days || 90,
                      amount: payAmount,
                      method: payMethod,
                      paid_time: payTime,
                      card_number: payMethod === "card" ? finalMaskedCardNo() : null,
                      approval_no: payMethod === "card" ? (payApprovalNo || null) : null,
                    });
                    setPayAmount(0); setPayLesson(""); setPayCardNo(""); setPayApprovalNo(""); setPayPlanId("");
                  }}
                    className="w-full py-2.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white text-sm font-medium rounded-lg hover:from-pink-600 hover:to-rose-600">
                    ➕ 결제 등록
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoLine({ label, value }: any) {
  return (
    <div className="flex">
      <span className="w-20 text-xs text-gray-500">{label}</span>
      <span className="flex-1 text-sm text-gray-800">{value}</span>
    </div>
  );
}

// 회원 검색 가능한 드롭다운 (이름 타이핑으로 필터링)
function MemberSearchSelect({ members, value, onChange }: any) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  // ✅ 전체 회원 표시 (종결/대기종료 포함) - 지난 회원도 결제/재등록 가능하도록
  const filtered = members
    .filter((m: any) => !query
                       || (m.name || "").toLowerCase().includes(query.toLowerCase())
                       || ((m.phone || "").replace(/\D/g, "").includes(query.replace(/\D/g, "")) && query.replace(/\D/g, "").length > 0));

  const selected = members.find((m: any) => m.id === value);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          type="text"
          value={selected ? `${selected.name}${selected.phone ? ` (${selected.phone.replace(/\D/g,"").slice(-4)})` : ""} · ${selected.member_type === "child" ? "아동" : "성인"}` : query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (selected) onChange(""); }}
          onFocus={(e) => { setOpen(true); e.currentTarget.select(); }}
          placeholder="🔍 이름 또는 전화번호 뒷자리 (예: 3206)"
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none"
        />
        {value && (
          <button type="button" onClick={() => { onChange(""); setQuery(""); }}
            className="px-2 text-gray-400 hover:text-red-500 text-sm">×</button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-gray-500 text-center">검색 결과 없음</div>
          ) : (
            filtered.slice(0, 50).map((m: any) => {
              const statusMap: any = {
                regular: { icon: "🎯", color: "text-green-600", label: "정규" },
                waiting: { icon: "⏳", color: "text-yellow-600", label: "대기" },
                trial_scheduled: { icon: "📅", color: "text-blue-600", label: "체험예정" },
                trial_done: { icon: "✅", color: "text-purple-600", label: "체험완료" },
                paused: { icon: "⏸️", color: "text-gray-500", label: "일시정지" },
                closed: { icon: "🔴", color: "text-red-500", label: "종결" },
                ended: { icon: "⚫", color: "text-gray-400", label: "대기종료" },
              };
              const st = statusMap[m.status] || statusMap.regular;
              const phoneTail = (m.phone || "").replace(/\D/g, "").slice(-4);
              return (
                <button key={m.id} type="button"
                  onClick={() => { onChange(m.id); setQuery(""); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-aqu-50 flex items-center gap-2 ${value === m.id ? "bg-aqu-50" : ""} ${["closed","ended"].includes(m.status) ? "opacity-60" : ""}`}>
                  <span className={st.color}>{st.icon}</span>
                  <span className="font-medium">{m.name}</span>
                  {phoneTail && <span className="text-xs text-amber-600 font-mono bg-amber-50 px-1.5 py-0.5 rounded">({phoneTail})</span>}
                  <span className="text-xs text-gray-400">
                    {m.member_type === "child" ? "🧒 아동" : "👤 성인"}
                  </span>
                  <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${st.color} bg-gray-50`}>{st.label}</span>
                </button>
              );
            })
          )}
          {filtered.length > 50 && (
            <div className="p-2 text-[10px] text-gray-400 text-center border-t">+{filtered.length - 50}명 더 있음. 검색을 좁혀보세요.</div>
          )}
        </div>
      )}

      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}></div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 📅 날짜 클릭 시 나오는 액션 시트 (예약등록 / 매출등록 / 직원일정등록)
// ═══════════════════════════════════════════════════════════════
function DateActionSheet({ date, time, onReservation, onRevenue, onStaffSchedule, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-aqu-50 to-blue-50">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500">선택한 날짜</div>
              <div className="text-lg font-bold text-slate-900">{date}{time ? ` · ${time}` : ""}</div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/50 rounded-lg">
              <span className="text-xl">✕</span>
            </button>
          </div>
        </div>
        <div className="p-4 space-y-2">
          <button onClick={onReservation}
            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-blue-200 hover:bg-blue-50 hover:border-blue-400 transition">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-xl shadow">
              📅
            </div>
            <div className="flex-1 text-left">
              <div className="font-bold text-slate-900">새 일정 등록</div>
              <div className="text-xs text-gray-500">회원 수업 · 체험 · 보강 · 기타</div>
            </div>
            <span className="text-gray-400">→</span>
          </button>

          <button onClick={onRevenue}
            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-pink-200 hover:bg-pink-50 hover:border-pink-400 transition">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-white text-xl shadow">
              💰
            </div>
            <div className="flex-1 text-left">
              <div className="font-bold text-slate-900">결제 등록</div>
              <div className="text-xs text-gray-500">결제 · 회원권 · 제품 판매</div>
            </div>
            <span className="text-gray-400">→</span>
          </button>

          <button onClick={onStaffSchedule}
            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-purple-200 hover:bg-purple-50 hover:border-purple-400 transition">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white text-xl shadow">
              👥
            </div>
            <div className="flex-1 text-left">
              <div className="font-bold text-slate-900">직원 일정 등록</div>
              <div className="text-xs text-gray-500">근무 · 휴무 · 회의</div>
            </div>
            <span className="text-gray-400">→</span>
          </button>

          <div className="text-[11px] text-gray-500 text-center pt-1">
            💡 <b>더블클릭</b>은 이 팝업 없이 바로 새 일정 모달을 엽니다
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 🎫 회원권 선택 - 정액권/횟수권 자동 판별
// ═══════════════════════════════════════════════════════════════
function PlanPicker({ plans, value, onChange }: any) {
  // plan_type 자동 판별:
  //  1) plans에 plan_type이 있으면 사용
  //  2) 없으면 이름에 "월/기간/무제한" 있으면 amount, "회" 있으면 session
  //  3) sessions > 0 → session, sessions === 0 → amount (기본 규칙)
  function detectType(p: any): "session" | "amount" {
    if (p?.plan_type === "amount" || p?.plan_type === "session") return p.plan_type;
    const name = (p?.name || "").toLowerCase();
    if (/월|기간|무제한|정액/.test(name)) return "amount";
    if (/회|횟수/.test(name)) return "session";
    return (p?.sessions || 0) > 0 ? "session" : "amount";
  }

  const [tab, setTab] = useState<"session" | "amount" | "custom">("session");
  const [customInput, setCustomInput] = useState("");

  const availablePlans = (plans || []).filter((p: any) => p.is_active !== false);
  const sessionPlans = availablePlans.filter((p: any) => detectType(p) === "session");
  const amountPlans = availablePlans.filter((p: any) => detectType(p) === "amount");

  // 현재 선택된 회원권의 타입을 감지해 탭 자동 전환
  useEffect(() => {
    if (!value) return;
    const found = availablePlans.find((p: any) => p.name === value);
    if (found) {
      const t = detectType(found);
      setTab(t);
    } else if (value === "__custom__" || (value && !availablePlans.find((p: any) => p.name === value))) {
      setTab("custom");
      if (value !== "__custom__") setCustomInput(value);
    }
  }, [value, plans]);

  const isChosen = (p: any) => value === p.name;

  if (!plans || plans.length === 0) {
    return (
      <div>
        <input type="text" value={value || ""} onChange={e => onChange(e.target.value)}
          placeholder="예: 수중프로그램 30회권, 월 4회권"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
        <div className="text-[10px] text-gray-500 mt-1">
          💡 회원권은 <a href="/settings/catalog?tab=plans" className="text-aqu-600 underline">회원권 관리 페이지</a>에서 추가하세요
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* 탭 - 정액권/횟수권/직접입력 */}
      <div className="flex gap-1 border-b border-gray-100">
        <button type="button" onClick={() => setTab("session")}
          className={`flex-1 px-3 py-2 text-xs font-semibold border-b-2 transition ${tab === "session" ? "border-indigo-500 text-indigo-700 bg-indigo-50/50" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
          🎫 횟수권 ({sessionPlans.length})
        </button>
        <button type="button" onClick={() => setTab("amount")}
          className={`flex-1 px-3 py-2 text-xs font-semibold border-b-2 transition ${tab === "amount" ? "border-purple-500 text-purple-700 bg-purple-50/50" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
          🗓️ 정액권 ({amountPlans.length})
        </button>
        <button type="button" onClick={() => setTab("custom")}
          className={`flex-1 px-3 py-2 text-xs font-semibold border-b-2 transition ${tab === "custom" ? "border-gray-500 text-gray-700 bg-gray-50" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
          📝 직접 입력
        </button>
      </div>

      {/* 횟수권 그리드 */}
      {tab === "session" && (
        <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto">
          {sessionPlans.length === 0 ? (
            <div className="col-span-2 p-4 text-center text-xs text-gray-400 bg-gray-50 rounded-lg">
              등록된 횟수권이 없습니다<br/>
              <a href="/settings/catalog?tab=plans" className="text-indigo-600 underline text-[11px] mt-1 inline-block">회원권 관리에서 추가</a>
            </div>
          ) : (
            sessionPlans.map((p: any) => (
              <button key={p.id} type="button"
                onClick={() => onChange(p.name)}
                className={`text-left p-2 rounded-lg border-2 transition ${isChosen(p) ? "border-indigo-500 bg-indigo-50 shadow-sm" : "border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30"}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-xs font-bold ${isChosen(p) ? "text-indigo-800" : "text-slate-800"}`}>{p.name}</span>
                  {isChosen(p) && <span className="text-indigo-600 text-xs">✓</span>}
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-mono font-bold">
                    {p.sessions || 1}회
                  </span>
                  <span className="text-gray-600">₩{(p.price || 0).toLocaleString()}</span>
                  {p.valid_days && <span className="text-gray-400">· {p.valid_days}일</span>}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* 정액권 그리드 */}
      {tab === "amount" && (
        <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto">
          {amountPlans.length === 0 ? (
            <div className="col-span-2 p-4 text-center text-xs text-gray-400 bg-gray-50 rounded-lg">
              등록된 정액권이 없습니다<br/>
              <a href="/settings/catalog?tab=plans" className="text-purple-600 underline text-[11px] mt-1 inline-block">회원권 관리에서 추가</a>
            </div>
          ) : (
            amountPlans.map((p: any) => (
              <button key={p.id} type="button"
                onClick={() => onChange(p.name)}
                className={`text-left p-2 rounded-lg border-2 transition ${isChosen(p) ? "border-purple-500 bg-purple-50 shadow-sm" : "border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50/30"}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-xs font-bold ${isChosen(p) ? "text-purple-800" : "text-slate-800"}`}>{p.name}</span>
                  {isChosen(p) && <span className="text-purple-600 text-xs">✓</span>}
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-mono font-bold">
                    {p.valid_days ? `${p.valid_days}일` : "무제한"}
                  </span>
                  <span className="text-gray-600">₩{(p.price || 0).toLocaleString()}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* 직접 입력 */}
      {tab === "custom" && (
        <div>
          <input type="text"
            value={customInput || (value && !availablePlans.find((p: any) => p.name === value) ? value : "")}
            onChange={e => { setCustomInput(e.target.value); onChange(e.target.value); }}
            placeholder="예: 체험, 개인지도, 그룹레슨 A"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
          <div className="text-[10px] text-gray-500 mt-1">
            💡 목록에 없는 특별 회원권은 여기에 입력하세요
          </div>
        </div>
      )}

      {/* 선택 확인 배지 */}
      {value && value !== "__custom__" && (
        <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs">
          <span className="text-emerald-600 font-bold">✓ 선택됨:</span>
          <span className="text-emerald-800 font-semibold">{value}</span>
          {(() => {
            const p = availablePlans.find((x: any) => x.name === value);
            if (!p) return <span className="text-gray-500">(직접 입력)</span>;
            const t = detectType(p);
            return (
              <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold ${t === "session" ? "bg-indigo-100 text-indigo-700" : "bg-purple-100 text-purple-700"}`}>
                {t === "session" ? `🎫 횟수권 ${p.sessions}회` : `🗓️ 정액권 ${p.valid_days || "?"}일`}
              </span>
            );
          })()}
          <button type="button" onClick={() => onChange("")}
            className="text-gray-400 hover:text-red-500 text-sm leading-none">×</button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * ✅ v3.29.0: DayListModal - 달력 셀 +더보기 클릭 시 표시
 * 당일 전체 수강 회원 리스트 + 원클릭 상태 변경 + 완전 삭제
 * ═══════════════════════════════════════════════════════════ */
function DayListModal({ date, slots, members, staff, memberships, onClose, onQuickStatus, onDelete, onAddNew }: any) {
  const memberMap = new Map((members || []).map((m: any) => [m.id, m]));
  const staffMap = new Map((staff || []).map((s: any) => [s.id, s]));
  const msMap = new Map<string, any>();
  (memberships || []).forEach((ms: any) => {
    const list = msMap.get(ms.member_id) || [];
    list.push(ms);
    msMap.set(ms.member_id, list);
  });

  // 시간순 정렬
  const sortedSlots = [...(slots || [])].sort((a: any, b: any) =>
    (a.time_slot || "").localeCompare(b.time_slot || "")
  );

  const dateObj = new Date(date + "T00:00:00");
  const dayLabel = `${dateObj.getFullYear()}년 ${dateObj.getMonth()+1}월 ${dateObj.getDate()}일`;

  // ✅ v3.29.1: 7개 통합 상태 파스텔 배지 (드롭다운에 그대로 적용)
  const statusMeta: Record<string, { label: string; cls: string; icon: string }> = {
    scheduled:{ label: "예약",     cls: "bg-indigo-100 text-indigo-700 border-indigo-300",     icon: "🕒" },
    present:  { label: "출석",     cls: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: "🟢" },
    done:     { label: "완료",     cls: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: "🟢" },
    sick:     { label: "병결",     cls: "bg-amber-100 text-amber-700 border-amber-300",        icon: "🟡" },
    personal: { label: "개인사정", cls: "bg-orange-100 text-orange-700 border-orange-300",   icon: "🟠" },
    carryover:{ label: "이월",     cls: "bg-blue-100 text-blue-700 border-blue-300",           icon: "🔵" },
    noshow:   { label: "노쇼",     cls: "bg-rose-100 text-rose-700 border-rose-300",           icon: "🔴" },
    absent:   { label: "결석",     cls: "bg-rose-100 text-rose-700 border-rose-300",           icon: "🔴" },
    cancel:   { label: "예약취소", cls: "bg-slate-200 text-slate-700 border-slate-400",      icon: "⚪" },
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 - 파스텔 그라디언트 */}
        <div className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">{dayLabel} 전체 수강 회원</h2>
            <p className="text-xs opacity-90 mt-0.5">총 {sortedSlots.length}건 · 시간순 정렬</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={(e) => { e.stopPropagation(); onAddNew && onAddNew(); }}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold flex items-center gap-1">
              + 이 날짜에 일정 추가
            </button>
            <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none px-2">×</button>
          </div>
        </div>
        {/* ✨ v3.32.1: 리스트 - 단일 가로줄(1 Line) time-slot-card + 중복 뱃지 제거 */}
        <div className="flex-1 overflow-y-auto p-4 bg-gradient-to-br from-slate-50 via-white to-sky-50/40">
          {sortedSlots.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-2">📅</div>
              <p className="text-sm">등록된 일정이 없습니다.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sortedSlots.map((s: any) => {
                const mem: any = memberMap.get(s.member_id) || {};
                const stf: any = staffMap.get(s.staff_id) || {};
                const st = statusMeta[s.status] || statusMeta.scheduled;
                const memMs = (msMap.get(s.member_id) || [])[0];
                const remain = memMs ? Math.max(0, (memMs.total_sessions||0) - (memMs.used_sessions||0)) : null;

                return (
                  <div key={s.id} className="time-slot-card aqu-card bg-white border border-slate-200 shadow-sm px-3 py-2.5 hover:shadow-md hover:border-aqu-300 transition-all"
                    style={{ borderRadius: "14px" }}>
                    {/* ✨ 단 1줄 가로 배치: [시간] | [회원명 + 뱃지] | [드롭다운] | [🗑️] */}
                    <div className="flex items-center gap-3">
                      {/* 시간 배지 */}
                      <div className="flex-shrink-0 bg-gradient-to-br from-teal-50 to-cyan-100 border border-teal-200 rounded-lg px-3 py-1.5 text-center min-w-[70px]">
                        <div className="text-base font-bold text-teal-700 tracking-tight leading-tight">{s.time_slot || "-"}</div>
                        <div className="text-[8px] text-teal-500 font-medium leading-none">TIME</div>
                      </div>

                      {/* 회원명 + 수강권 뱃지 (상태 중복 제거) */}
                      <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm truncate">{mem.name || "(회원없음)"}</span>
                        {mem.member_type === "child" && <span className="text-[10px] bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded-full font-semibold">아동</span>}
                        {memMs && (
                          <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-bold">
                            {memMs.plan_name || "회원권"} {remain}/{memMs.total_sessions||0}
                          </span>
                        )}
                        {stf.name && (
                          <span className="text-[10px] text-slate-500 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stf.color || "#94a3b8" }} />
                            {stf.name}
                          </span>
                        )}
                      </div>

                      {/* 상태 드롭다운 (단일화) */}
                      <select
                        value={s.status || "scheduled"}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { e.stopPropagation(); onQuickStatus(s, e.target.value); }}
                        className={`flex-shrink-0 px-2.5 py-1.5 text-xs font-bold rounded-full border-2 cursor-pointer outline-none ${st.cls}`}
                        style={{ minWidth: "115px" }}
                      >
                        <option value="scheduled">🕒 예약</option>
                        <option value="present">🟢 출석</option>
                        <option value="sick">🟡 병결</option>
                        <option value="personal">🟠 개인사정</option>
                        <option value="carryover">🔵 이월</option>
                        <option value="noshow">🔴 노쇼</option>
                        <option value="cancel">⚪ 예약취소</option>
                      </select>

                      {/* 삭제 */}
                      <button onClick={(e) => { e.stopPropagation(); onDelete(s); }}
                        className="flex-shrink-0 p-2 text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-full border-2 border-rose-200 transition-colors"
                        title="완전 삭제 (마스터 권한)">
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {/* 푸터 */}
        <div className="px-6 py-3 border-t border-slate-200 bg-white flex justify-between items-center text-xs text-slate-500">
          <span>💡 상태 버튼은 시간표 · 출결장 · 회원권과 즉시 동기화됩니다.</span>
          <button onClick={onClose} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-semibold">닫기</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 🏋️‍♂️ v3.38.0 지상재활 다음 예약 팝업
// - 수업 완료 클릭 즉시 자동 렌더링
// - 현장에서 회원과 상의한 다음 방문 일시를 즉시 등록
// ═══════════════════════════════════════════════════════════════
function NextGroundBookingModal({ info, staff, memberships, onClose, onSaved }: any) {
  const [nextDate, setNextDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [nextTime, setNextTime] = useState(info?.last_time || "14:00");
  const [staffId, setStaffId] = useState<string>(info?.last_staff_id || "");
  const [saving, setSaving] = useState(false);

  // 회원의 지상재활 회원권 조회
  const memberMs = (memberships || []).filter((m: any) =>
    m.member_id === info.member_id &&
    (m.category === "ground" || m.category === "device") &&
    new Date(m.end_date || "2099-12-31") >= new Date()
  );

  async function save() {
    if (!nextDate || !nextTime) return alert("날짜와 시간을 선택해주세요");
    setSaving(true);
    try {
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      const d = new Date(nextDate);
      const dow = d.getDay() === 0 ? 7 : d.getDay();
      const payload: any = {
        org_id: orgId,
        member_id: info.member_id,
        staff_id: staffId || null,
        event_date: nextDate,
        time_slot: nextTime,
        duration_min: 60,
        status: "scheduled",
        event_type: "lesson",
        day_of_week: dow,
        track: "ground",  // 🏋️‍♂️ 지상재활 트랙
        membership_id: memberMs[0]?.id || null,
      };
      let attempt = payload;
      for (let i = 0; i < 10; i++) {
        const { error } = await supabase.from("schedule_slots").insert(attempt);
        if (!error) {
          alert(`✅ 다음 예약 등록 완료\n\n📅 ${nextDate} ${nextTime}\n👤 ${info.member_name}`);
          onSaved();
          return;
        }
        const m = error.message.match(/Could not find the '([^']+)' column/);
        if (m && m[1] && attempt[m[1]] !== undefined) {
          const { [m[1]]: _drop, ...rest } = attempt;
          attempt = rest;
          continue;
        }
        alert("등록 실패: " + error.message);
        break;
      }
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <div className="text-3xl">🏋️‍♂️</div>
          <div>
            <h3 className="text-lg font-bold text-emerald-900">지상재활 다음 예약</h3>
            <p className="text-xs text-slate-500">현장에서 회원과 상의한 일시를 등록하세요</p>
          </div>
        </div>

        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 mb-4">
          <div className="text-sm font-bold text-emerald-900">👤 {info.member_name}</div>
          {memberMs[0] && (
            <div className="text-xs text-emerald-700 mt-1">
              💳 잔여 회차: {(memberMs[0].total_sessions || 0) - (memberMs[0].used_sessions || 0)}회 / {memberMs[0].total_sessions || 0}회
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs font-semibold text-slate-700">📅 다음 방문 날짜</label>
            <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">⏰ 시간</label>
            <input type="time" value={nextTime} onChange={e => setNextTime(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs font-semibold text-slate-700 mb-1 block">🧑‍⚕️ 담당 강사</label>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setStaffId("")}
              className={`text-xs px-3 py-1.5 rounded-lg border-2 font-semibold ${!staffId ? "bg-slate-500 text-white border-slate-500" : "bg-white text-slate-600 border-slate-200"}`}>
              미지정
            </button>
            {(staff || []).map((s: any) => (
              <button key={s.id} onClick={() => setStaffId(s.id)}
                className={`text-xs px-3 py-1.5 rounded-lg border-2 font-semibold ${staffId === s.id ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-600 border-slate-200"}`}>
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900 mb-4">
          💡 <b>지상재활 안내</b>: 결석 시 보강 없이 회차가 즉시 차감됩니다 (병결/개인사정 무관).
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm">
            나중에
          </button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
            {saving ? "등록 중..." : "🏋️‍♂️ 다음 예약 등록"}
          </button>
        </div>
      </div>
    </div>
  );
}
