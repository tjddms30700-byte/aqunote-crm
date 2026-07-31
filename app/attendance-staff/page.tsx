"use client";
export const dynamic = "force-dynamic";

// v3.20.34: [👥 직원·근무 관리] 4탭 통합 · Toss/Flex SaaS 스타일 리디자인
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import HomeButton from "@/components/HomeButton";
import {
  Clock, Play, Square, TrendingUp, FileCheck, MessageSquare, UserCog,
  Plus, X, Check, XCircle, Pin, Trash2, Eye, Wallet,
} from "lucide-react";

function todayStr() { return new Date().toISOString().slice(0, 10); }
function nowIso() { return new Date().toISOString(); }
function fmtTime(iso?: string) { return iso ? new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "-"; }
function diffHours(a: string, b: string) { return (new Date(b).getTime() - new Date(a).getTime()) / 3600000; }

// v3.20.34: 지출 카테고리 옵션 (재무관리 expenses.category 와 1:1 매칭)
// v3.21.1: /finance CATEGORY_GROUPS와 완전 일치 – 중복 제거 + 그룹핑
const EXPENSE_CATEGORY_GROUPS: { label: string; items: string[] }[] = [
  { label: "🏠 임대·공과금",     items: ["임대료", "관리비", "공과금(수도·전기·가스)", "인터넷·통신비"] },
  { label: "💧 수영장 운영",     items: ["수영장 약품", "수영장 청소·시설관리", "수영복·수영모·수건"] },
  { label: "🛠️ 장비·소모품",    items: ["장비 구매·수리", "교구·참고서적", "사무용품·소모품", "인쇄비"] },
  { label: "👥 인건비·복리후생", items: ["복리후생(식대·회식·경조사)", "교육·연수", "상비약품"] },
  { label: "📣 홍보·마케팅",     items: ["온라인 광고(SNS·검색)", "오프라인 홍보·이벤트", "플랫폼 사용료"] },
  { label: "🚗 교통·차량",       items: ["교통비·주차비", "차량유지비·유류비"] },
  { label: "📑 세무·법무·수수료",items: ["세금(종합소득세·부가세)", "보험료", "세무·회계 수수료", "법무·자문·외부용역", "은행·카드 수수료"] },
  { label: "📦 기타",             items: ["기부금", "기타"] },
];
const EXPENSE_CATEGORIES = EXPENSE_CATEGORY_GROUPS.flatMap((g) => g.items);

const EXPENSE_TYPES = [
  { v: "reimburse", label: "경비 정산" },
  { v: "purchase_exp", label: "물품 구매" },
  { v: "outsourcing", label: "외부 서비스" },
];

const LEAVE_TYPES = [
  { v: "annual", label: "연차" },
  { v: "half_am", label: "반차(오전)" },
  { v: "half_pm", label: "반차(오후)" },
  { v: "reward", label: "포상휴가" },
  { v: "sick", label: "병가" },
  { v: "special", label: "특별휴가" },
];

const BOARD_CATS = [
  { v: "notice",     label: "📢 공지",   pill: "bg-rose-50 text-rose-700 border-rose-200" },
  { v: "general",    label: "💬 일반",   pill: "bg-sky-50 text-sky-700 border-sky-200" },
  { v: "qna",        label: "❓ Q&A",   pill: "bg-violet-50 text-violet-700 border-violet-200" },
  { v: "suggestion", label: "💡 건의",   pill: "bg-amber-50 text-amber-700 border-amber-200" },
];

type TabKey = "attendance" | "leave" | "expense" | "board";

export default function StaffAttendancePage() {
  const [staff, setStaff] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("attendance");
  const [isDirector, setIsDirector] = useState(false);

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState<any>({
    staff_id: "", leave_type: "annual", start_date: todayStr(), end_date: todayStr(), reason: "",
  });

  const [showExpModal, setShowExpModal] = useState(false);
  const [expForm, setExpForm] = useState<any>({
    staff_id: "", expense_type: "reimburse", expense_category: "사무용품·소모품",
    purchase_item: "", purchase_amount: 0, vendor: "", receipt_url: "",
    start_date: todayStr(), reason: "",
    // v3.21.0: 법인 전환 대비 – 결제 수단 필드
    payment_method: "CORPORATE_CARD",
  });

  const [showPostModal, setShowPostModal] = useState(false);
  const [postForm, setPostForm] = useState<any>({
    category: "general", title: "", content: "", author_name: "", is_pinned: false,
  });
  const [viewingPost, setViewingPost] = useState<any>(null);

  // v3.20.35: 포상휴가 부여/차감 모달
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [rewardForm, setRewardForm] = useState<any>({
    staff_id: "", action: "grant", days: 1, reason: "",
  });

  useEffect(() => {
    // v3.20.35: master/director/admin 3가지 role 모두 지원 + profile 조회 실패 시 안전 폴백
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const email = userData?.user?.email;
        if (!email) { setIsDirector(true); return; } // 로그인 안 된 경우 로컬 테스트/데모를 위해 director 허용
        const { data: prof } = await supabase.from("profiles").select("role").eq("email", email).maybeSingle();
        const role = String(prof?.role || "").toLowerCase();
        const isAdmin = ["director", "master", "admin", "manager", "owner"].includes(role);
        // ✅ profile이 없거나 role 필드가 비어있으면 사용자 직배에 해당하는 staff row의 role/is_director 확인
        if (!isAdmin) {
          const { data: sRow } = await supabase.from("staff").select("role, is_director").eq("email", email).maybeSingle();
          const sRole = String(sRow?.role || "").toLowerCase();
          if (sRow?.is_director || ["원장", "대표", "director", "master", "admin", "manager"].includes(sRole)) {
            setIsDirector(true); return;
          }
        }
        setIsDirector(isAdmin);
      } catch (e) {
        // v3.20.35: 예외 발생 시 기본값 director=true (관리 버튼 노출 보장)
        console.warn("director 권한 판별 실패, 기본 허용:", e);
        setIsDirector(true);
      }
    })();
  }, []);

  useEffect(() => { loadAll(); }, [month]);

  async function loadAll() {
    setLoading(true);
    const [sRes, lRes, vRes, eRes, pRes] = await Promise.all([
      // v3.20.36: 재직자 전용 필터 - status='resigned'/'retired'/'inactive' 제외 + is_active=false/is_resigned=true 제외
      supabase.from("staff").select("*").order("name"),
      supabase.from("attendance_logs").select("*").gte("log_date", month + "-01")
        .lte("log_date", month + "-31").order("log_date", { ascending: false }),
      supabase.from("leave_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("expenses").select("*").gte("spent_at", month + "-01")
        .lte("spent_at", month + "-31").order("spent_at", { ascending: false }),
      supabase.from("posts").select("*").order("is_pinned", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    // v3.20.36: 퇴사자 제외 – 컬럼 명칭이 어떤 것(이든) 모두 안전하게 대응
    const activeStaff = (sRes.data || []).filter((s: any) => {
      const st = String(s?.status || "").toLowerCase();
      if (["resigned", "retired", "inactive", "terminated", "quit", "leave"].includes(st)) return false;
      if (s?.is_active === false) return false;
      if (s?.is_resigned === true) return false;
      if (s?.resigned_at) return false;
      if (s?.deleted_at) return false;
      if (s?.termination_date) return false;
      return true;
    });
    setStaff(activeStaff);
    setLogs(lRes.data || []);
    setLeaves(vRes.data || []);
    setExpenses(eRes.data || []);
    setPosts(pRes.data || []);
    // 선택된 직원이 퇴사되었다면 첫 재직자로 리셋
    if (activeStaff.length > 0) {
      const stillActive = activeStaff.some((s: any) => s.id === selectedStaff);
      if (!selectedStaff || !stillActive) setSelectedStaff(activeStaff[0].id);
    } else {
      setSelectedStaff("");
    }
    setLoading(false);
  }

  async function checkIn(staffId: string) {
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const today = todayStr();
    if (logs.find(l => l.staff_id === staffId && l.log_date === today)) { alert("이미 출근 기록이 있습니다"); return; }
    await supabase.from("attendance_logs").insert({
      org_id: orgId, staff_id: staffId, log_date: today, check_in: nowIso(), status: "normal",
    });
    await loadAll();
  }
  async function checkOut(logId: string, checkInIso: string) {
    const now = nowIso();
    const work = diffHours(checkInIso, now);
    await supabase.from("attendance_logs").update({
      check_out: now, work_hours: work, overtime_hours: work > 8 ? work - 8 : 0,
    }).eq("id", logId);
    await loadAll();
  }

  // v3.20.35: 근로기준법 정확 적용 (2018 개정 반영)
  // - < 1년: 매월 개근 시 1일 (최대 11일)
  // - 만 1년~2년 미만: 1년차 월차 11일 + 2년차 연차 15일 = 총 26일 확정
  // - >= 2년: 15일 + 매 2년마다 1일 가산 (최대 25일)
  function calcAnnualLeave(staffRow: any) {
    if (!staffRow?.hire_date) return 0;
    if (staffRow.annual_leave_total !== null && staffRow.annual_leave_total !== undefined && staffRow.annual_leave_total !== "") {
      return Number(staffRow.annual_leave_total) || 0;
    }
    const hire = new Date(staffRow.hire_date);
    const now = new Date();
    if (isNaN(hire.getTime())) return 0;
    const monthsWorked = (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth());
    const yearsWorked = Math.floor(monthsWorked / 12);
    if (yearsWorked < 1) {
      // 입사 후 1년 미만: 개근월 수만큼 월차 (최대 11일)
      return Math.min(11, Math.max(0, monthsWorked));
    }
    if (yearsWorked === 1) {
      // 만 1년~2년 미만: 누적 11일 + 새 연차 15일 = 26일
      return 26;
    }
    // 2년차 이후: 15 + floor((yearsWorked-1)/2), 최대 25일
    return Math.min(25, 15 + Math.floor((yearsWorked - 1) / 2));
  }

  function countDaysBetween(v: any): number {
    if (v?.days) return Number(v.days) || 1;
    if (v?.start_date && v?.end_date) {
      const s = new Date(v.start_date); const e = new Date(v.end_date);
      return Math.max(1, Math.floor((e.getTime() - s.getTime()) / 86400000) + 1);
    }
    return 1;
  }

  const staffLogs = useMemo(() => logs?.filter?.(l => l?.staff_id === selectedStaff) || [], [logs, selectedStaff]);
  const staffLeavesApproved = useMemo(
    () => leaves?.filter?.(v => v?.staff_id === selectedStaff && v?.status === "approved") || [],
    [leaves, selectedStaff]
  );
  const usedAnnual = useMemo(() => {
    let used = 0;
    for (const v of staffLeavesApproved) {
      const t = v?.leave_type;
      if (t === "half_am" || t === "half_pm" || t === "halfday") used += 0.5;
      else if (t === "annual") used += countDaysBetween(v);
    }
    return used;
  }, [staffLeavesApproved]);
  const usedReward = useMemo(() => {
    let used = 0;
    for (const v of staffLeavesApproved) {
      if (["reward", "bonus", "special", "comp"].includes(v?.leave_type || "")) used += countDaysBetween(v);
    }
    return used;
  }, [staffLeavesApproved]);

  function leaveTagForDate(dateStr: string) {
    for (const v of staffLeavesApproved) {
      const s = v?.start_date ? new Date(v.start_date).toISOString().slice(0, 10) : null;
      const e = v?.end_date ? new Date(v.end_date).toISOString().slice(0, 10) : s;
      if (!s) continue;
      if (dateStr >= s && dateStr <= (e || s)) {
        const t = v?.leave_type;
        if (t === "half_am" || t === "half_pm" || t === "halfday")
          return { label: "🌤️ 반차", pill: "bg-amber-50 text-amber-700 border-amber-200" };
        if (t === "annual")
          return { label: "🌴 연차", pill: "bg-emerald-50 text-emerald-700 border-emerald-200" };
        if (["reward", "bonus", "special", "comp"].includes(t || ""))
          return { label: "🎁 포상휴가", pill: "bg-violet-50 text-violet-700 border-violet-200" };
      }
    }
    return null;
  }

  const stats = useMemo(() => {
    const workDays = staffLogs.filter(l => l?.check_in).length;
    const totalHours = staffLogs.reduce((s, l) => s + Number(l?.work_hours || 0), 0);
    const totalOT = staffLogs.reduce((s, l) => s + Number(l?.overtime_hours || 0), 0);
    const currentStaff = staff.find(s => s.id === selectedStaff);
    const annualTotal = calcAnnualLeave(currentStaff);
    const remaining = Math.max(0, annualTotal - usedAnnual);
    const rate = Number(currentStaff?.session_rate ?? 30000);
    const estimatedPay = workDays * (rate || 30000);
    return {
      workDays, totalHours, totalOT,
      annualTotal, annualUsed: usedAnnual, annualRemaining: remaining, rewardUsed: usedReward,
      effectiveHours: totalHours + usedAnnual * 8 + usedReward * 8,
      estimatedPay,
    };
  }, [staffLogs, staff, selectedStaff, usedAnnual, usedReward]);

  // v3.20.36: 재직자 기준 출근 집계 (퇴사자 제외)
  const activeStaffIds = new Set(staff.map((s: any) => s?.id).filter(Boolean));
  const attendedToday = logs.filter(l => l?.log_date === todayStr() && l?.check_in && activeStaffIds.has(l?.staff_id)).length;
  const totalStaff = staff.length;

  async function submitLeave() {
    if (!leaveForm.staff_id) return alert("신청자를 선택해 주세요");
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const days = Math.round((new Date(leaveForm.end_date).getTime() - new Date(leaveForm.start_date).getTime()) / 86400000) + 1;
    const isHalf = leaveForm.leave_type === "half_am" || leaveForm.leave_type === "half_pm";
    const payload: any = {
      org_id: orgId, staff_id: leaveForm.staff_id,
      category: "leave", leave_type: leaveForm.leave_type,
      start_date: leaveForm.start_date, end_date: leaveForm.end_date,
      days: isHalf ? 0.5 : days, reason: leaveForm.reason || null, status: "pending",
    };
    let tryPayload = { ...payload };
    for (let i = 0; i < 6; i++) {
      const r = await supabase.from("leave_requests").insert(tryPayload);
      if (!r.error) break;
      const m = (r.error.message || "").match(/column "([^"]+)"/i);
      if (m?.[1] && m[1] in tryPayload) { const { [m[1]]: _d, ...rest } = tryPayload; tryPayload = rest; continue; }
      alert("휴가 신청 실패: " + r.error.message); return;
    }
    setShowLeaveModal(false);
    setLeaveForm({ staff_id: "", leave_type: "annual", start_date: todayStr(), end_date: todayStr(), reason: "" });
    alert("✅ 휴가 신청이 접수되었습니다");
    await loadAll();
  }

  async function approveLeave(req: any) {
    await supabase.from("leave_requests").update({ status: "approved", approved_at: nowIso() }).eq("id", req.id);
    alert("✅ 승인 완료\n\n출퇴근·근태 탭에서 연차/휴가 뱃지가 자동 반영됩니다.");
    await loadAll();
  }
  async function rejectLeave(req: any) {
    const reason = prompt("반려 사유:");
    if (reason === null) return;
    await supabase.from("leave_requests").update({ status: "rejected", reject_reason: reason }).eq("id", req.id);
    await loadAll();
  }

  async function submitExpense() {
    if (!expForm.staff_id) return alert("신청자를 선택해 주세요");
    if (!expForm.purchase_item) return alert("품목명을 입력해 주세요");
    if (!expForm.purchase_amount || Number(expForm.purchase_amount) <= 0) return alert("금액을 입력해 주세요");
    if (!expForm.expense_category) return alert("재무 지출 카테고리를 선택해 주세요");
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const payload: any = {
      org_id: orgId, staff_id: expForm.staff_id,
      category: "expense", leave_type: expForm.expense_type,
      start_date: expForm.start_date, end_date: expForm.start_date,
      days: 0, reason: expForm.reason || null,
      purchase_item: expForm.purchase_item, purchase_amount: Number(expForm.purchase_amount),
      vendor: expForm.vendor || null, receipt_url: expForm.receipt_url || null,
      expense_category: expForm.expense_category, status: "pending",
      // v3.21.0: 결제 수단 (승인 시 expenses.payment_method로 자동 승계)
      payment_method: expForm.payment_method || "CORPORATE_CARD",
    };
    let tryPayload = { ...payload };
    for (let i = 0; i < 8; i++) {
      const r = await supabase.from("leave_requests").insert(tryPayload);
      if (!r.error) break;
      const m = (r.error.message || "").match(/column "([^"]+)"/i);
      if (m?.[1] && m[1] in tryPayload) { const { [m[1]]: _d, ...rest } = tryPayload; tryPayload = rest; continue; }
      alert("지출 결재 신청 실패: " + r.error.message); return;
    }
    setShowExpModal(false);
    setExpForm({ staff_id: "", expense_type: "reimburse", expense_category: "사무용품·소모품", purchase_item: "", purchase_amount: 0, vendor: "", receipt_url: "", start_date: todayStr(), reason: "", payment_method: "CORPORATE_CARD" });
    alert("✅ 지출 결재 신청이 접수되었습니다");
    await loadAll();
  }

  async function approveExpense(req: any) {
    try {
      await supabase.from("leave_requests").update({ status: "approved", approved_at: nowIso() }).eq("id", req.id);
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      const staffName = staff.find(s => s.id === req.staff_id)?.name || "직원";
      const expPayload: any = {
        org_id: orgId,
        category: req.expense_category || "기타",
        amount: Number(req.purchase_amount || 0),
        spent_at: req.start_date || todayStr(),
        description: `[전자결재 승인] ${staffName} - ${req.purchase_item || req.reason || ""}${req.vendor ? ` (${req.vendor})` : ""}`,
        status: "approved",
        leave_request_id: req.id,
        source: "leave_approval",
        // v3.21.0: 결제 수단 승계 (재무관리 지출 이력에 [법인카드] 태그 자동 표기)
        payment_method: req.payment_method || "CORPORATE_CARD",
      };
      let tryPayload = { ...expPayload };
      for (let i = 0; i < 6; i++) {
        const r = await supabase.from("expenses").insert(tryPayload);
        if (!r.error) break;
        const m = (r.error.message || "").match(/column "([^"]+)"/i);
        if (m?.[1] && m[1] in tryPayload) { const { [m[1]]: _d, ...rest } = tryPayload; tryPayload = rest; continue; }
        throw new Error(r.error.message);
      }
      alert(`✅ 승인 완료 및 재무 관리(운영비) 지출 항목으로 자동 등록되었습니다.\n\n• 카테고리: ${req.expense_category}\n• 금액: ${Number(req.purchase_amount).toLocaleString()}원`);
      await loadAll();
    } catch (err: any) {
      alert("승인 실패: " + err.message);
    }
  }
  async function rejectExpense(req: any) {
    const reason = prompt("반려 사유:");
    if (reason === null) return;
    await supabase.from("leave_requests").update({ status: "rejected", reject_reason: reason }).eq("id", req.id);
    await loadAll();
  }

  // v3.20.35: 포상휴가 부여/차감 – 승인 상태로 leave_requests 직접 삽입 (자동 포상휴가 사용 집계에 반영)
  async function submitReward() {
    if (!rewardForm.staff_id) return alert("대상 직원을 선택해 주세요");
    const days = Number(rewardForm.days || 0);
    if (!days || days <= 0) return alert("일수를 입력해 주세요 (0.5일 단위)");
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const finalDays = rewardForm.action === "deduct" ? -Math.abs(days) : Math.abs(days);
    const staffName = staff.find(s => s.id === rewardForm.staff_id)?.name || "직원";
    const payload: any = {
      org_id: orgId, staff_id: rewardForm.staff_id,
      category: "leave", leave_type: "reward",
      start_date: todayStr(), end_date: todayStr(),
      days: finalDays,
      reason: `[마스터 ${rewardForm.action === "deduct" ? "차감" : "부여"}] ${staffName} · ${rewardForm.reason || "사유 미기재"}`,
      status: "approved",
      approved_at: nowIso(),
    };
    // v3.21.2: 폴백 정규식 강화 (스키마 캐시·find the '...' 패턴 대응)
    let tryPayload: any = { ...payload };
    let lastErr: any = null;
    let ok = false;
    for (let i = 0; i < 12; i++) {
      const r = await supabase.from("leave_requests").insert(tryPayload);
      if (!r.error) { ok = true; break; }
      lastErr = r.error;
      const msg = String(r.error.message || "");
      const m = msg.match(/'([^']+)' column|column "([^"]+)"|column ([\w_]+) of|find the '([^']+)'/i);
      const missing = m?.[1] || m?.[2] || m?.[3] || m?.[4];
      if (missing && missing in tryPayload) { const { [missing]: _d, ...rest } = tryPayload; tryPayload = rest; continue; }
      // RLS 오류 명확화
      if (/row-level security|policy|permission denied/i.test(msg)) {
        alert(`포상휴가 저장 실패 (권한 오류)\n\nleave_requests 테이블 INSERT RLS 정책이 필요합니다.\n\n상세: ${msg}`);
        return;
      }
      // approved_at 컬럼 없는 경우 자동 제거
      if (/approved_at|schema cache/i.test(msg)) {
        if ("approved_at" in tryPayload) { delete tryPayload.approved_at; continue; }
      }
      break;
    }
    if (!ok) { alert("포상휴가 부여 실패: " + (lastErr?.message || "알 수 없는 오류")); return; }
    setShowRewardModal(false);
    setRewardForm({ staff_id: "", action: "grant", days: 1, reason: "" });
    alert(`✅ ${staffName}님 포상휴가 ${rewardForm.action === "deduct" ? "차감" : "부여"} 완료 (${finalDays > 0 ? "+" : ""}${finalDays}일)\n\n→ [포상휴가 사용] 카드에 즉시 반영됩니다.`);
    await loadAll();
  }

  async function submitPost() {
    if (!postForm.title.trim()) return alert("제목을 입력해 주세요");
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    await supabase.from("posts").insert({
      org_id: orgId, category: postForm.category, title: postForm.title,
      content: postForm.content, author_name: postForm.author_name || "익명",
      is_pinned: postForm.is_pinned,
    });
    setShowPostModal(false);
    setPostForm({ category: "general", title: "", content: "", author_name: "", is_pinned: false });
    await loadAll();
  }
  async function deletePost(id: string) {
    if (!confirm("삭제할까요?")) return;
    await supabase.from("posts").delete().eq("id", id);
    if (viewingPost?.id === id) setViewingPost(null);
    await loadAll();
  }
  async function togglePin(p: any) {
    await supabase.from("posts").update({ is_pinned: !p.is_pinned }).eq("id", p.id);
    await loadAll();
  }

  function statusPill(status: string) {
    if (status === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (status === "rejected" || status === "canceled") return "bg-rose-50 text-rose-700 border-rose-200";
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  // v3.21.0: 결제 수단 배지
  function paymentMethodBadge(pm: string | null | undefined) {
    switch (pm) {
      case "CORPORATE_CARD": return { label: "🏦 법인카드", cls: "bg-blue-50 text-blue-700 border-blue-200" };
      case "PERSONAL_CARD":  return { label: "👤 개인카드", cls: "bg-purple-50 text-purple-700 border-purple-200" };
      case "TRANSFER":       return { label: "💸 계좌이체", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
      case "CASH":           return { label: "💵 현금",     cls: "bg-amber-50 text-amber-700 border-amber-200" };
      default: return null;
    }
  }
  function statusLabel(status: string) {
    if (status === "approved") return "승인완료";
    if (status === "rejected") return "반려";
    if (status === "canceled") return "취소";
    return "승인대기";
  }

  const pendingLeaves = leaves.filter(r => r?.category === "leave" && r?.status === "pending");
  const doneLeaves = leaves.filter(r => r?.category === "leave" && r?.status !== "pending");
  const pendingExpenses = leaves.filter(r => (r?.category === "expense" || r?.category === "purchase") && r?.status === "pending");
  const doneExpenses = leaves.filter(r => (r?.category === "expense" || r?.category === "purchase") && r?.status !== "pending");

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-8 bg-slate-50 min-h-screen">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-sm">
              <UserCog className="w-5 h-5" />
            </span>
            직원 · 근무 관리
          </h1>
          <div className="text-xs text-slate-500 mt-1">출퇴근 · 실근무 · 휴가 · 지출 결재 · 사내 소통을 한 곳에서</div>
        </div>
        <HomeButton />
      </div>

      {/* v3.20.34: 알약형 세그먼트 탭 */}
      <div className="bg-slate-100 p-1.5 rounded-2xl inline-flex flex-wrap gap-1 mb-6 shadow-inner">
        {[
          { k: "attendance", label: "⏱️ 출퇴근·근태" },
          { k: "leave",      label: "🌴 휴가 신청" },
          { k: "expense",    label: "💸 지출·경비" },
          { k: "board",      label: "📢 공지사항" },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as TabKey)}
            className={`px-4 md:px-5 py-2 rounded-xl text-sm transition-all ${
              tab === t.k
                ? "bg-white shadow-sm font-bold text-blue-600"
                : "text-slate-600 hover:text-slate-800 font-medium"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "attendance" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="오늘 출근" value={`${attendedToday}/${totalStaff}명`} sub="현재 출근한 직원" color="text-blue-600" />
            <StatCard label={`총 연차 (${staff.find(s => s.id === selectedStaff)?.name || "직원"})`} value={`${stats.annualTotal}일`} sub="근로기준법 자동 계산" color="text-emerald-600" />
            <StatCard label="잔여 연차" value={`${stats.annualRemaining.toFixed(1)}일`} sub={`사용 ${stats.annualUsed.toFixed(1)}일`} color={stats.annualRemaining <= 2 ? "text-rose-600" : "text-teal-600"} />
            <StatCard label="실근무" value={`${stats.effectiveHours.toFixed(1)}h`} sub={`출근 ${stats.workDays}일 · 초과 ${stats.totalOT.toFixed(1)}h`} color="text-indigo-600" />
          </div>

          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900">📅 오늘 ({todayStr()}) 출퇴근</h2>
              <div className="text-xs text-slate-500">{attendedToday}/{totalStaff}명 출근</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {staff.map(s => {
                const log = logs.find(l => l.staff_id === s.id && l.log_date === todayStr());
                return (
                  <div key={s.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:bg-sky-50/50 transition-all">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color || "#3b82f6" }}></span>
                      <span className="font-semibold text-sm text-slate-800">{s.name}</span>
                      <span className="text-[10px] text-slate-400 px-2 py-0.5 rounded bg-slate-50">{s.role || "직원"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {log?.check_in && !log?.check_out && (
                        <>
                          <span className="text-xs text-emerald-600 font-medium">🟢 {fmtTime(log.check_in)}</span>
                          <button onClick={() => checkOut(log.id, log.check_in)}
                            className="text-xs px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg flex items-center gap-1 shadow-sm transition-all hover:-translate-y-0.5">
                            <Square className="w-3 h-3" /> 퇴근
                          </button>
                        </>
                      )}
                      {log?.check_in && log?.check_out && (
                        <span className="text-xs text-slate-500">✓ {fmtTime(log.check_in)}~{fmtTime(log.check_out)} · {Number(log.work_hours).toFixed(1)}h</span>
                      )}
                      {!log && (
                        <button onClick={() => checkIn(s.id)}
                          className="text-xs px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg flex items-center gap-1 shadow-sm transition-all hover:-translate-y-0.5">
                          <Play className="w-3 h-3" /> 출근 체크
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" /> 강사별 월간 실근무 요약
              </h2>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {staff.map(s => {
                const sLogs = logs.filter(l => l.staff_id === s.id);
                const wDays = sLogs.filter(l => l.check_in).length;
                const wHours = sLogs.reduce((sum, l) => sum + Number(l.work_hours || 0), 0);
                const wOT = sLogs.reduce((sum, l) => sum + Number(l.overtime_hours || 0), 0);
                const rate = Number(s?.session_rate ?? 30000);
                const pay = wDays * (rate || 30000);
                const isSelected = selectedStaff === s.id;
                return (
                  <button key={s.id} onClick={() => setSelectedStaff(s.id)}
                    className={`text-left p-4 rounded-xl border-2 transition-all hover:-translate-y-0.5 ${
                      isSelected ? "border-blue-500 bg-blue-50/50 shadow" : "border-slate-100 bg-white hover:bg-sky-50/50"
                    }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color || "#3b82f6" }}></span>
                      <span className="font-bold text-sm text-slate-900">{s.name}</span>
                      <span className="text-[10px] text-slate-400">{s.role || "직원"}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-slate-400">근무일수</div>
                        <div className="font-bold text-slate-800">{wDays}일</div>
                      </div>
                      <div>
                        <div className="text-slate-400">실근무시간</div>
                        <div className="font-bold text-slate-800">{wHours.toFixed(1)}h</div>
                      </div>
                      <div>
                        <div className="text-slate-400">초과근무</div>
                        <div className="font-bold text-orange-600">{wOT.toFixed(1)}h</div>
                      </div>
                      <div>
                        <div className="text-slate-400">예상 수당</div>
                        <div className="font-bold text-emerald-600">₩{pay.toLocaleString()}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-base font-bold text-slate-900">📋 일별 출퇴근 일지</h2>
              <select value={selectedStaff} onChange={e => setSelectedStaff(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm">
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {staffLogs.length === 0 && staffLeavesApproved.filter(v => (v.start_date || "").startsWith(month)).length === 0 ? (
              <div className="text-center py-10 text-sm text-slate-400">이 달 근무 기록이 없습니다</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500">
                      <th className="p-2 text-left font-medium">날짜</th>
                      <th className="p-2 text-left font-medium">출근</th>
                      <th className="p-2 text-left font-medium">퇴근</th>
                      <th className="p-2 text-right font-medium">근무</th>
                      <th className="p-2 text-right font-medium">연장</th>
                      <th className="p-2 text-center font-medium">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffLogs.map(l => {
                      const tag = leaveTagForDate(l.log_date);
                      const isToday = l.log_date === todayStr();
                      return (
                        <tr key={l.id} className="border-b border-slate-100 hover:bg-sky-50/50 transition-colors">
                          <td className="p-2 font-medium text-slate-800">
                            {l.log_date}
                            {isToday && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">TODAY</span>}
                          </td>
                          <td className="p-2 text-slate-600">{tag ? "-" : fmtTime(l.check_in)}</td>
                          <td className="p-2 text-slate-600">{tag ? "-" : fmtTime(l.check_out)}</td>
                          <td className="p-2 text-right font-semibold text-slate-800">{tag ? "-" : `${Number(l.work_hours || 0).toFixed(1)}h`}</td>
                          <td className="p-2 text-right text-orange-600">{tag ? "-" : `${Number(l.overtime_hours || 0).toFixed(1)}h`}</td>
                          <td className="p-2 text-center">
                            {tag ? (
                              <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold ${tag.pill}`}>{tag.label}</span>
                            ) : (
                              <span className="text-[11px] text-emerald-600">정상</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {staffLeavesApproved.filter(v => {
                      const s = v.start_date ? new Date(v.start_date).toISOString().slice(0, 10) : null;
                      return s && s.startsWith(month) && !staffLogs.some(l => l.log_date === s);
                    }).map(v => {
                      const d = new Date(v.start_date).toISOString().slice(0, 10);
                      const tag = leaveTagForDate(d);
                      return tag ? (
                        <tr key={`lv-${v.id}`} className="border-b border-slate-100 bg-emerald-50/30">
                          <td className="p-2 font-medium text-slate-800">{d}</td>
                          <td className="p-2 text-slate-400">-</td>
                          <td className="p-2 text-slate-400">-</td>
                          <td className="p-2 text-right text-slate-400">-</td>
                          <td className="p-2 text-right text-slate-400">-</td>
                          <td className="p-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold ${tag.pill}`}>{tag.label}</span>
                          </td>
                        </tr>
                      ) : null;
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "leave" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <div className="text-xs text-slate-500 mb-1">내 연차 현황 (직원 선택)</div>
                  <select value={selectedStaff} onChange={e => setSelectedStaff(e.target.value)}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-semibold">
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <button onClick={() => { setLeaveForm({ ...leaveForm, staff_id: selectedStaff }); setShowLeaveModal(true); }}
                  className="px-4 py-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl text-sm font-bold shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> 휴가 신청
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <MiniStat label="총 연차" value={`${stats.annualTotal}일`} color="text-emerald-600" />
                <MiniStat label="사용" value={`${stats.annualUsed.toFixed(1)}일`} color="text-amber-600" />
                <MiniStat label="잔여" value={`${stats.annualRemaining.toFixed(1)}일`} color={stats.annualRemaining <= 2 ? "text-rose-600" : "text-teal-600"} />
              </div>
            </div>
            <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl shadow-sm p-5 text-white flex flex-col justify-between">
              <div>
                <div className="text-xs opacity-90 mb-1">🎁 포상휴가 사용</div>
                <div className="text-3xl font-extrabold">{stats.rewardUsed.toFixed(1)}일</div>
                <div className="text-[10px] opacity-80 mt-1">별도 집계 · 연차와 무관</div>
              </div>
              {/* v3.20.35: 마스터 전용 포상휴가 부여 버튼 */}
              {isDirector && (
                <button onClick={() => { setRewardForm({ ...rewardForm, staff_id: selectedStaff }); setShowRewardModal(true); }}
                  className="mt-3 px-3 py-2 bg-white/20 hover:bg-white/30 border border-white/40 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all hover:-translate-y-0.5">
                  <Plus className="w-3.5 h-3.5" /> 포상휴가 부여/관리
                </button>
              )}
            </div>
          </div>

          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="text-base font-bold text-slate-900 mb-3">⏳ 승인 대기 <span className="text-xs font-normal text-slate-500 ml-1">({pendingLeaves.length}건)</span></h2>
            {pendingLeaves.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">대기중인 휴가 신청이 없습니다</div>
            ) : (
              <div className="space-y-2">
                {pendingLeaves.map(r => {
                  const s = staff.find(x => x.id === r.staff_id);
                  const type = LEAVE_TYPES.find(t => t.v === r.leave_type);
                  return (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4 border border-slate-100 rounded-xl hover:bg-sky-50/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className={`inline-block px-2.5 py-1 rounded-full border text-[11px] font-semibold ${statusPill(r.status)}`}>{statusLabel(r.status)}</span>
                        <div>
                          <div className="text-sm font-bold text-slate-800">{s?.name || "-"} · {type?.label || r.leave_type}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{r.start_date} ~ {r.end_date} · {r.days || 1}일</div>
                          {r.reason && <div className="text-xs text-slate-600 mt-1">💬 {r.reason}</div>}
                        </div>
                      </div>
                      {isDirector && (
                        <div className="flex gap-2">
                          <button onClick={() => approveLeave(r)}
                            className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm">
                            <Check className="w-3 h-3" /> 승인
                          </button>
                          <button onClick={() => rejectLeave(r)}
                            className="px-3 py-1.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> 반려
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="text-base font-bold text-slate-900 mb-3">📁 처리 완료 <span className="text-xs font-normal text-slate-500 ml-1">({doneLeaves.length}건)</span></h2>
            {doneLeaves.length === 0 ? (
              <div className="text-center py-6 text-sm text-slate-400">처리된 휴가 이력이 없습니다</div>
            ) : (
              <div className="space-y-1.5">
                {doneLeaves.slice(0, 20).map(r => {
                  const s = staff.find(x => x.id === r.staff_id);
                  const type = LEAVE_TYPES.find(t => t.v === r.leave_type);
                  return (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 border border-slate-100 rounded-lg hover:bg-sky-50/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusPill(r.status)}`}>{statusLabel(r.status)}</span>
                        <span className="text-sm font-semibold text-slate-800">{s?.name || "-"}</span>
                        <span className="text-xs text-slate-500">· {type?.label || r.leave_type} · {r.start_date}~{r.end_date}</span>
                      </div>
                      {r.reject_reason && <span className="text-xs text-rose-600">반려: {r.reject_reason}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "expense" && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500">이번달 경비 청구 · 물품구매 · 외부서비스 결재</div>
              <div className="text-sm font-semibold text-slate-800 mt-1">승인 시 <span className="text-blue-600">재무관리 [운영비]</span>에 자동 등록됩니다</div>
            </div>
            <button onClick={() => { setExpForm({ ...expForm, staff_id: selectedStaff }); setShowExpModal(true); }}
              className="px-4 py-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl text-sm font-bold shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> 지출 결재 신청
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard label="승인 대기" value={`${pendingExpenses.length}건`} sub="원장 결재 대기중" color="text-amber-600" />
            <StatCard label="이번달 승인 지출" value={`₩${expenses.filter(e => e.source === "leave_approval").reduce((s, e) => s + Number(e.amount || 0), 0).toLocaleString()}`} sub={`${expenses.filter(e => e.source === "leave_approval").length}건 자동 등록`} color="text-emerald-600" />
            <StatCard label="이번달 전체 운영비" value={`₩${expenses.reduce((s, e) => s + Number(e.amount || 0), 0).toLocaleString()}`} sub={`${expenses.length}건`} color="text-indigo-600" />
          </div>

          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="text-base font-bold text-slate-900 mb-3">⏳ 승인 대기 <span className="text-xs font-normal text-slate-500 ml-1">({pendingExpenses.length}건)</span></h2>
            {pendingExpenses.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">대기중인 지출 결재가 없습니다</div>
            ) : (
              <div className="space-y-2">
                {pendingExpenses.map(r => {
                  const s = staff.find(x => x.id === r.staff_id);
                  return (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4 border border-slate-100 rounded-xl hover:bg-sky-50/50 transition-colors">
                      <div className="flex items-start gap-3">
                        <span className={`inline-block px-2.5 py-1 rounded-full border text-[11px] font-semibold ${statusPill(r.status)}`}>{statusLabel(r.status)}</span>
                        <div>
                          <div className="text-sm font-bold text-slate-800 flex flex-wrap items-center gap-1">
                            {s?.name || "-"} · {r.purchase_item || "-"}
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{r.expense_category || "미분류"}</span>
                            {/* v3.21.0: 결제 수단 배지 */}
                            {(() => { const pm = paymentMethodBadge(r.payment_method); return pm ? <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${pm.cls}`}>{pm.label}</span> : null; })()}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {r.start_date} · <span className="font-semibold text-slate-800">₩{Number(r.purchase_amount || 0).toLocaleString()}</span>
                            {r.vendor && <> · {r.vendor}</>}
                          </div>
                          {r.reason && <div className="text-xs text-slate-600 mt-1">💬 {r.reason}</div>}
                          {r.receipt_url && <a href={r.receipt_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline mt-1 inline-block">📎 영수증 보기</a>}
                        </div>
                      </div>
                      {isDirector && (
                        <div className="flex gap-2">
                          <button onClick={() => approveExpense(r)}
                            className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm">
                            <Check className="w-3 h-3" /> 승인
                          </button>
                          <button onClick={() => rejectExpense(r)}
                            className="px-3 py-1.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> 반려
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="text-base font-bold text-slate-900 mb-3">📁 처리 완료 <span className="text-xs font-normal text-slate-500 ml-1">({doneExpenses.length}건)</span></h2>
            {doneExpenses.length === 0 ? (
              <div className="text-center py-6 text-sm text-slate-400">처리된 결재 이력이 없습니다</div>
            ) : (
              <div className="space-y-1.5">
                {doneExpenses.slice(0, 20).map(r => {
                  const s = staff.find(x => x.id === r.staff_id);
                  return (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 border border-slate-100 rounded-lg hover:bg-sky-50/50 transition-colors">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusPill(r.status)}`}>{statusLabel(r.status)}</span>
                        <span className="text-sm font-semibold text-slate-800">{s?.name || "-"}</span>
                        <span className="text-xs text-slate-500">· {r.purchase_item} · ₩{Number(r.purchase_amount || 0).toLocaleString()}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{r.expense_category || "미분류"}</span>
                        {/* v3.21.0: 완료 목록에도 결제 수단 배지 */}
                        {(() => { const pm = paymentMethodBadge(r.payment_method); return pm ? <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${pm.cls}`}>{pm.label}</span> : null; })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="text-center">
            <Link href="/finance" className="text-xs text-blue-600 hover:underline">→ 재무관리 · 자동 정산에서 지출 이력 전체 보기</Link>
          </div>
        </div>
      )}

      {tab === "board" && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500">센터 내 주요 공지 · 업무 지침 · Q&A · 건의사항</div>
              <div className="text-sm font-semibold text-slate-800 mt-1">전 직원 실시간 공유 · 별도 페이지 이동 없이 확인</div>
            </div>
            <button onClick={() => setShowPostModal(true)}
              className="px-4 py-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl text-sm font-bold shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> 새 글 작성
            </button>
          </div>

          {posts.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-12 text-center">
              <div className="text-4xl mb-3">📭</div>
              <div className="text-sm text-slate-500">아직 등록된 게시글이 없습니다</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {posts.map(p => {
                const cat = BOARD_CATS.find(c => c.v === p.category);
                return (
                  <div key={p.id}
                    className={`bg-white rounded-2xl shadow-sm border p-4 hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer ${p.is_pinned ? "border-amber-200 bg-amber-50/30" : "border-slate-100"}`}
                    onClick={() => setViewingPost(p)}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${cat?.pill || "bg-slate-50 text-slate-700 border-slate-200"}`}>
                          {cat?.label || p.category}
                        </span>
                        {p.is_pinned && <Pin className="w-3 h-3 text-amber-500" />}
                      </div>
                      {isDirector && (
                        <button onClick={(e) => { e.stopPropagation(); deletePost(p.id); }}
                          className="text-slate-300 hover:text-rose-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="text-sm font-bold text-slate-900 mb-1 line-clamp-1">{p.title}</div>
                    <div className="text-xs text-slate-600 line-clamp-2 mb-3">{p.content}</div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {(p.author_name || "익")[0]}
                        </span>
                        <span>{p.author_name || "익명"}</span>
                        <span>·</span>
                        <span>{p.created_at?.slice(0, 10)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {p.view_count || 0}</span>
                        {isDirector && (
                          <button onClick={(e) => { e.stopPropagation(); togglePin(p); }}
                            className={`hover:text-amber-500 transition-colors ${p.is_pinned ? "text-amber-500" : "text-slate-300"}`}>
                            <Pin className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showLeaveModal && (
        <ModalShell title="🌴 휴가 신청" onClose={() => setShowLeaveModal(false)}>
          <div className="space-y-3">
            <Field label="신청자 *">
              <select value={leaveForm.staff_id} onChange={e => setLeaveForm({ ...leaveForm, staff_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="">선택하세요</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="휴가 종류 *">
              <div className="grid grid-cols-3 gap-1.5">
                {LEAVE_TYPES.map(t => (
                  <button key={t.v} onClick={() => setLeaveForm({ ...leaveForm, leave_type: t.v })}
                    className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all ${leaveForm.leave_type === t.v ? "bg-blue-500 text-white border-blue-500 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="시작일">
                <input type="date" value={leaveForm.start_date} onChange={e => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </Field>
              <Field label="종료일">
                <input type="date" value={leaveForm.end_date} onChange={e => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </Field>
            </div>
            <Field label="사유">
              <textarea value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                rows={2} placeholder="예: 개인 사정"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </Field>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowLeaveModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50">취소</button>
              <button onClick={submitLeave}
                className="px-4 py-2 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-lg text-sm font-bold shadow-sm hover:shadow-md">신청하기</button>
            </div>
          </div>
        </ModalShell>
      )}

      {showExpModal && (
        <ModalShell title="💸 지출 결재 신청" onClose={() => setShowExpModal(false)}>
          <div className="space-y-3">
            <Field label="신청자 *">
              <select value={expForm.staff_id} onChange={e => setExpForm({ ...expForm, staff_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="">선택하세요</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="지출 유형 *">
              <div className="grid grid-cols-3 gap-1.5">
                {EXPENSE_TYPES.map(t => (
                  <button key={t.v} onClick={() => setExpForm({ ...expForm, expense_type: t.v })}
                    className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all ${expForm.expense_type === t.v ? "bg-blue-500 text-white border-blue-500 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="💰 재무 지출 카테고리 * (승인 시 재무관리로 자동 전달)">
              {/* v3.21.1: /finance와 동일한 그룹핑 UI 적용 */}
              <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1 p-2 border-2 border-orange-200 rounded-lg bg-orange-50/30">
                {EXPENSE_CATEGORY_GROUPS.map((g) => (
                  <div key={g.label} className="bg-white/70 rounded-lg p-2 border border-orange-100">
                    <div className="text-[10px] font-bold text-orange-700 mb-1">{g.label}</div>
                    <div className="flex flex-wrap gap-1">
                      {g.items.map((c) => (
                        <button key={c} type="button" onClick={() => setExpForm({ ...expForm, expense_category: c })}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${expForm.expense_category === c ? "bg-orange-500 text-white shadow-sm" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"}`}>
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Field>
            {/* v3.21.0: 법인 전환 대비 - 결제 수단 필드 */}
            <Field label="💳 결제 수단 * (승인 시 재무관리에 태그 자동 부여)">
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { v: "CORPORATE_CARD", label: "🏦 법인카드", color: "blue" },
                  { v: "PERSONAL_CARD",  label: "👤 개인카드", color: "purple" },
                  { v: "TRANSFER",       label: "💸 계좌이체", color: "emerald" },
                  { v: "CASH",           label: "💵 현금",     color: "amber" },
                ].map(m => (
                  <button key={m.v} onClick={() => setExpForm({ ...expForm, payment_method: m.v })}
                    className={`px-2 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${expForm.payment_method === m.v ? `bg-${m.color}-500 text-white border-${m.color}-500 shadow-sm` : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="품목명 *">
                <input type="text" value={expForm.purchase_item} onChange={e => setExpForm({ ...expForm, purchase_item: e.target.value })}
                  placeholder="예: 보드마커 20개" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </Field>
              <Field label="금액 (원) *">
                <input type="number" value={expForm.purchase_amount} onChange={e => setExpForm({ ...expForm, purchase_amount: Number(e.target.value) })}
                  step={1000} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-right font-semibold" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="구매처">
                <input type="text" value={expForm.vendor} onChange={e => setExpForm({ ...expForm, vendor: e.target.value })}
                  placeholder="예: 쿠팡" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </Field>
              <Field label="지출일">
                <input type="date" value={expForm.start_date} onChange={e => setExpForm({ ...expForm, start_date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </Field>
            </div>
            <Field label="영수증 URL / 사진">
              <input type="url" value={expForm.receipt_url} onChange={e => setExpForm({ ...expForm, receipt_url: e.target.value })}
                placeholder="https://... (jpg/png/pdf)" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </Field>
            <Field label="사유 / 상세">
              <textarea value={expForm.reason} onChange={e => setExpForm({ ...expForm, reason: e.target.value })}
                rows={2} placeholder="예: 수업용 소모품 재고 소진" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </Field>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowExpModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50">취소</button>
              <button onClick={submitExpense}
                className="px-4 py-2 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-lg text-sm font-bold shadow-sm hover:shadow-md">신청하기</button>
            </div>
          </div>
        </ModalShell>
      )}

      {showPostModal && (
        <ModalShell title="📢 새 글 작성" onClose={() => setShowPostModal(false)}>
          <div className="space-y-3">
            <Field label="분류">
              <div className="grid grid-cols-4 gap-1.5">
                {BOARD_CATS.map(c => (
                  <button key={c.v} onClick={() => setPostForm({ ...postForm, category: c.v })}
                    className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all ${postForm.category === c.v ? "bg-blue-500 text-white border-blue-500 shadow-sm" : "bg-white text-slate-600 border-slate-200"}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="제목 *">
              <input type="text" value={postForm.title} onChange={e => setPostForm({ ...postForm, title: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </Field>
            <Field label="내용">
              <textarea value={postForm.content} onChange={e => setPostForm({ ...postForm, content: e.target.value })}
                rows={6} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="작성자">
                <input type="text" value={postForm.author_name} onChange={e => setPostForm({ ...postForm, author_name: e.target.value })}
                  placeholder="이름" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </Field>
              <Field label="고정">
                <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm">
                  <input type="checkbox" checked={postForm.is_pinned} onChange={e => setPostForm({ ...postForm, is_pinned: e.target.checked })} />
                  상단 고정
                </label>
              </Field>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowPostModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50">취소</button>
              <button onClick={submitPost}
                className="px-4 py-2 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-lg text-sm font-bold shadow-sm hover:shadow-md">게시</button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* v3.20.35: 포상휴가 부여/차감 모달 (마스터 전용) */}
      {showRewardModal && (
        <ModalShell title="🎁 포상휴가 부여 / 관리" onClose={() => setShowRewardModal(false)}>
          <div className="space-y-3">
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-xs text-violet-800">
              💡 포상휴가는 연차와 별도로 집계되며, 부여/차감 즉시 [포상휴가 사용] 카드에 반영됩니다.
            </div>
            <Field label="대상 직원 *">
              <select value={rewardForm.staff_id} onChange={e => setRewardForm({ ...rewardForm, staff_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="">선택하세요</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role || "직원"})</option>)}
              </select>
            </Field>
            <Field label="처리 구분 *">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setRewardForm({ ...rewardForm, action: "grant" })}
                  className={`py-2.5 rounded-lg text-sm font-bold border-2 transition-all ${rewardForm.action === "grant" ? "bg-emerald-500 text-white border-emerald-500 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"}`}>
                  ➕ 부여
                </button>
                <button onClick={() => setRewardForm({ ...rewardForm, action: "deduct" })}
                  className={`py-2.5 rounded-lg text-sm font-bold border-2 transition-all ${rewardForm.action === "deduct" ? "bg-rose-500 text-white border-rose-500 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:border-rose-300"}`}>
                  ➖ 차감
                </button>
              </div>
            </Field>
            <Field label="일수 (0.5일 단위) *">
              <input type="number" step={0.5} min={0.5} value={rewardForm.days}
                onChange={e => setRewardForm({ ...rewardForm, days: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-right font-bold text-lg" />
            </Field>
            <Field label="사유">
              <textarea value={rewardForm.reason} onChange={e => setRewardForm({ ...rewardForm, reason: e.target.value })}
                rows={2} placeholder="예: 우수 강사 포상 / 자녀 돌잔치 축하"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </Field>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowRewardModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50">취소</button>
              <button onClick={submitReward}
                className="px-4 py-2 bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-lg text-sm font-bold shadow-sm hover:shadow-md">
                {rewardForm.action === "deduct" ? "차감 처리" : "부여하기"}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {viewingPost && (
        <ModalShell title={viewingPost.title} onClose={() => setViewingPost(null)}>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 pb-3 border-b border-slate-100">
              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-[11px] font-bold flex items-center justify-center">
                {(viewingPost.author_name || "익")[0]}
              </span>
              <span className="font-semibold text-slate-700">{viewingPost.author_name || "익명"}</span>
              <span>·</span>
              <span>{viewingPost.created_at?.slice(0, 16).replace("T", " ")}</span>
            </div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{viewingPost.content || "-"}</div>
          </div>
        </ModalShell>
      )}
    </main>
  );
}

function StatCard({ label, value, sub, color }: any) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
      <div className="text-xs text-slate-500 font-medium">{label}</div>
      <div className={`text-2xl font-extrabold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value, color }: any) {
  return (
    <div className="text-center p-3 bg-slate-50 rounded-xl">
      <div className="text-[11px] text-slate-500 font-medium">{label}</div>
      <div className={`text-xl font-extrabold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-slate-600 mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function ModalShell({ title, onClose, children }: any) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
