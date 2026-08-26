"use client";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useBranchContext, ALL_BRANCHES } from "@/lib/branchContext";  // ✅ v3.49.0: 센터장 지점 격리
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import StaffCertIssueModal from "@/components/StaffCertIssueModal";
import {
  Waves, Plus, X, Save, Users, DollarSign, Clock, UserMinus,
  Edit2, Trash2, Calendar, TrendingUp, AlertTriangle, Check,
  FolderOpen, Upload, FileText, Download, Paperclip
} from "lucide-react";

const STAFF_DOC_CATEGORIES = [
  { k: "contract",    label: "📝 근로계약서",       color: "bg-blue-50 text-blue-700" },
  { k: "id_card",     label: "🪪 신분증",           color: "bg-yellow-50 text-yellow-700" },
  { k: "bank",        label: "🏦 통장사본",         color: "bg-green-50 text-green-700" },
  { k: "certificate", label: "🎓 이수증/수료증",    color: "bg-purple-50 text-purple-700" },
  { k: "license",     label: "🆔 자격증/면허증",    color: "bg-red-50 text-red-700" },
  { k: "photo",       label: "📷 본인사진",         color: "bg-pink-50 text-pink-700" },
  { k: "resume",      label: "📄 이력서",           color: "bg-teal-50 text-teal-700" },
  { k: "other",       label: "📎 기타",             color: "bg-gray-50 text-gray-700" },
];
function docCategoryLabel(k: string) { return STAFF_DOC_CATEGORIES.find(x => x.k === k)?.label || k; }
function docCategoryColor(k: string) { return STAFF_DOC_CATEGORIES.find(x => x.k === k)?.color || "bg-gray-50 text-gray-700"; }

const ROLES = [
  { k: "director",  label: "👑 원장" },
  { k: "therapist", label: "🩺 치료사" },
  { k: "admin",     label: "📋 관리자" },
];
function roleLabel(r: string) { return ROLES.find(x => x.k === r)?.label || r; }

const COLOR_PALETTE = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEARS = [2024, 2025, 2026];

export default function StaffPage() {
  const [staff, setStaff] = useState<any[]>([]);
  const [payrollHistory, setPayrollHistory] = useState<any[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "resigned" | "payroll" | "attendance">("active");
  const [isDirector, setIsDirector] = useState(false);  // 원장만 수정 가능
  // ✅ v3.49.0: 센터장 권한 — 직원 관리 접근 허용 + 소속 지점만 표시
  const { isMaster, isCenterManager, canManageBranch, ownBranchId, activeBranchId } = useBranchContext();
  // 직원 관리 접근 가능 = 대표 또는 센터장 (기존 isDirector 로직과 병행)
  const canManageStaff = isDirector || canManageBranch;

  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [showResignModal, setShowResignModal] = useState(false);
  const [docsStaff, setDocsStaff] = useState<any>(null);  // 문서 관리 모달 대상 직원
  const [certStaff, setCertStaff] = useState<any>(null);  // v3.43.0: 재직·경력증명서 발급 대상

  const [newStaff, setNewStaff] = useState<any>({
    name: "", email: "", phone: "", role: "therapist",
    salary_type: "monthly", salary_amount: 0, address: "",
    color: "#3b82f6", hire_date: "",
    // ✅ v3.19.0: 강사별 회당 단가 · 인센티브율
    session_rate: 30000, incentive_rate: 0,
    // ✅ v3.43.0: 서류 발급용 필드
    birth: "", position: "", department: "", resident_number: "", job_description: "",
  });
  const [editStaff, setEditStaff] = useState<any>(null);
  const [resignStaff, setResignStaff] = useState<any>(null);

  const [newPay, setNewPay] = useState<any>({
    staff_id: "",
    pay_year: new Date().getFullYear(),
    pay_month: new Date().getMonth() + 1,
    base_salary: 0, incentive: 0, bonus: 0, deduction: 0,
    paid_date: new Date().toISOString().slice(0, 10),
    paid_method: "transfer",
    memo: "",
  });
  const [editPay, setEditPay] = useState<any>(null);

  const [newAtt, setNewAtt] = useState<any>({
    staff_id: "", work_date: new Date().toISOString().slice(0, 10),
    check_in: "09:00", check_out: "18:00",
    status: "normal", memo: "",
  });
  const [editAtt, setEditAtt] = useState<any>(null);

  // ✅ v3.26.10: hydration mismatch 방지
  const [filterYear, setFilterYear] = useState<number>(0);
  const [filterMonth, setFilterMonth] = useState<number>(0);
  useEffect(() => {
    const now = new Date();
    setFilterYear(now.getFullYear());
    setFilterMonth(now.getMonth() + 1);
  }, []);
  const [filterStaffId, setFilterStaffId] = useState("");

  // ✅ v3.18.0: 강사별 세션 자동 계산용 state (상단에 선언)
  const [slots, setSlots] = useState<any[]>([]);
  // v3.21.2: 이번달 attendance 이력 (강사별 자동 수당 계산용)
  const [monthAttendance, setMonthAttendance] = useState<any[]>([]);
  // v3.21.5: 회원 담당강사 역매핑용 - members.staff_id 로 attendance 귀속 직원 판별
  const [membersLite, setMembersLite] = useState<any[]>([]);
  // v3.21.6: 상담·매칭 페이지에서 지정한 고정 셀도 예약으로 인식 (주간 반복 수업 파이프라인)
  const [slotMatrix, setSlotMatrix] = useState<any[]>([]);
  // ✅ v3.26.10: hydration mismatch 방지
  const [slotsMonth, setSlotsMonth] = useState<string>("");
  useEffect(() => { setSlotsMonth(new Date().toISOString().slice(0, 7)); }, []);

  useEffect(() => { loadAll(); }, [slotsMonth]);
  useEffect(() => { checkDirector(); }, []);

  async function checkDirector() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user?.email) { setIsDirector(true); return; } // 로그인 없으면 허용
    const { data: staffRow } = await supabase.from("staff").select("role").eq("email", userData.user.email).maybeSingle();
    // ✅ v3.49.0: 대표(director) 또는 센터장(manager) 모두 직원 관리 권한 보유
    const role = String(staffRow?.role || "").toLowerCase();
    setIsDirector(!staffRow || role === "director" || role === "manager");
  }

  async function loadAll() {
    setLoading(true);
    // ✅ v3.20.14: attendance_logs 정렬 컴럼 자동 폴백 (work_date → log_date → created_at)
    async function loadAttendanceLogs() {
      for (const col of ["work_date", "log_date", "created_at"]) {
        const r = await supabase.from("attendance_logs").select("*").order(col, { ascending: false });
        if (!r.error) return r.data || [];
      }
      const r2 = await supabase.from("attendance_logs").select("*");
      return r2.data || [];
    }
    // v3.21.4: attendance 조회 – attend_date/date/attendance_date/session_date 자동 자동 폴백
    async function loadMonthAttendance() {
      for (const col of ["attend_date", "date", "attendance_date", "session_date", "check_date"]) {
        const r = await supabase.from("attendance")
          .select("*")
          .gte(col, slotsMonth + "-01")
          .lte(col, slotsMonth + "-31");
        if (!r.error) {
          // _date 필드 통일
          return { data: (r.data || []).map((a: any) => ({ ...a, _date: a[col] || a.attend_date || a.date || a.attendance_date || a.session_date || a.check_date })), error: null };
        }
      }
      return { data: [], error: null };
    }

    // v3.21.5: members(id, staff_id) 로드 – attendance → staff 역매핑용
    async function loadMembersLite() {
      const attempts = [
        "id, staff_id, name",
        "id, staff_id",
        "id, name",
      ];
      for (const cols of attempts) {
        const r = await supabase.from("members").select(cols).is("deleted_at", null);
        if (!r.error) return r;
      }
      return { data: [], error: null } as any;
    }

    // v3.21.6: slot_matrix에서 담당강사 지정된 고정 셀도 로드 → 모든 예약으로 인식
    async function loadSlotMatrix() {
      const r = await supabase.from("slot_matrix").select("id, day_of_week, time_slot, status, staff_id, member_id, fixed_name");
      return r.error ? { data: [] } : r;
    }

    const [s, ph, al, sl, att, mm, mtx] = await Promise.all([
      // ✅ v3.49.0: 센터장은 소속 지점 직원만 조회 (대표는 전체 또는 보고 있는 지점)
      (() => {
        let q = supabase.from("staff").select("*").order("created_at", { ascending: false });
        if (isCenterManager && ownBranchId) {
          q = q.eq("branch_id", ownBranchId);  // 센터장: 소속 지점 100% 격리
        } else if (isMaster && activeBranchId && activeBranchId !== ALL_BRANCHES) {
          q = q.eq("branch_id", activeBranchId);  // 대표가 특정 지점 보는 중이면 해당 지점만
        }
        return q;
      })(),
      supabase.from("payroll_history").select("*").order("pay_year", { ascending: false }).order("pay_month", { ascending: false }),
      loadAttendanceLogs(),
      supabase.from("schedule_slots").select("id, staff_id, status, event_date, event_type, member_id")
        .gte("event_date", slotsMonth + "-01")
        .lte("event_date", slotsMonth + "-31")
        .is("deleted_at", null),
      loadMonthAttendance(),
      loadMembersLite(),
      loadSlotMatrix(),
    ]);
    setStaff(s.data || []);
    setSlotMatrix(((mtx as any).data || []) as any[]);
    setMembersLite(((mm as any).data || []) as any[]);
    setPayrollHistory(ph.data || []);
    // ✅ v3.20.14: work_date 또는 log_date 중 있는 것을 사용 (유연 표시)
    setAttendanceLogs((al || []).map((r: any) => ({
      ...r,
      work_date: r.work_date || r.log_date,
      log_date: r.log_date || r.work_date,
      memo: r.memo || r.note,
    })));
    setSlots(sl.data || []);
    // v3.21.4: attendance 상태 저장 (강사 자동 수당 계산에 사용) – _date 통일
    setMonthAttendance((att.data || []) as any[]);
    setLoading(false);
  }

  // ─── 직원 추가/수정 ───
  async function saveStaff() {
    if (!newStaff.name) return alert("이름 필수");
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const payload: any = {
      org_id: orgId,
      name: newStaff.name,
      email: newStaff.email || null,
phone: newStaff.phone || null,
      // ✅ v3.43.0: 서류 발급 필드
      birth: newStaff.birth || null,
      position: newStaff.position || null,
      department: newStaff.department || null,
      resident_number: newStaff.resident_number || null,
      job_description: newStaff.job_description || null,
      role: newStaff.role,
      // ✅ v3.49.0: 센터장이 등록하는 직원은 소속 지점으로 자동 고정 (대표는 현재 보고 있는 지점)
      branch_id: (isMaster
        ? (activeBranchId && activeBranchId !== ALL_BRANCHES ? activeBranchId : ownBranchId)
        : ownBranchId) || null,
      salary_type: newStaff.salary_type,
      salary_amount: Number(newStaff.salary_amount || 0),
      address: newStaff.address || null,
      color: newStaff.color || "#3b82f6",
      hire_date: newStaff.hire_date || null,
      // ✅ v3.20.12: 0 값 저장 허용 (Number.isFinite로 명시적 검증)
      session_rate: Number.isFinite(Number(newStaff.session_rate)) ? Number(newStaff.session_rate) : 30000,
      incentive_rate: Number.isFinite(Number(newStaff.incentive_rate)) ? Number(newStaff.incentive_rate) : 0,
    };
    if (editStaff?.id) {
      const { data, error } = await supabase.from("staff").update(payload).eq("id", editStaff.id).select();
      if (error) return alert("수정 실패: " + error.message + "\n\n💡 RLS 정책 확인 필요: AQUNOTE_V32010_STAFF_RLS.sql 실행");
      // ✅ v3.20.12: 저장 후 DB 실제 값 재검증
      const saved = data?.[0];
      if (saved) {
        alert(`✅ 저장 완료\n\n• 회당단가: ₩${Number(saved.session_rate ?? 0).toLocaleString()}\n• 인센티브율: ${saved.incentive_rate ?? 0}%`);
      }
    } else {
      const { error } = await supabase.from("staff").insert(payload).select();
      if (error) return alert("추가 실패: " + error.message);
    }
    setShowStaffModal(false);
    setEditStaff(null);
    setNewStaff({ name: "", email: "", phone: "", role: "therapist", salary_type: "monthly", salary_amount: 0, address: "", color: "#3b82f6", hire_date: "", session_rate: 30000, incentive_rate: 0, birth: "", position: "", department: "", resident_number: "", job_description: "" });
    loadAll();
  }

  function openEditStaff(s: any) {
    setEditStaff(s);
    setNewStaff({
name: s.name || "", email: s.email || "", phone: s.phone || "",
      birth: s.birth || "", position: s.position || "", department: s.department || "",
      resident_number: s.resident_number || "", job_description: s.job_description || "",
      role: s.role || "therapist", salary_type: s.salary_type || "monthly",
      salary_amount: s.salary_amount || 0, address: s.address || "",
      color: s.color || "#3b82f6", hire_date: s.hire_date || "",
      // ✅ v3.19.0: 강사별 회당 단가 · 인센티브율 로드
      session_rate: s.session_rate ?? 30000,
      incentive_rate: s.incentive_rate ?? 0,
    });
    setShowStaffModal(true);
  }

  // ─── 퇴사 처리 ───
  function openResign(s: any) {
    setResignStaff(s);
    setShowResignModal(true);
  }
  async function confirmResign(resignDate: string, reason: string) {
    if (!resignStaff) return;
    const { error } = await supabase.from("staff").update({
      is_resigned: true,
      resign_date: resignDate,
      resign_reason: reason,
    }).eq("id", resignStaff.id).select();
    if (error) return alert("퇴사 처리 실패: " + error.message);
    setShowResignModal(false);
    setResignStaff(null);
    loadAll();
  }
  async function reinstate(s: any) {
    const msg = `${s.name} 님의 퇴사를 취소하시겠습니까?\n\n• 재직 목록으로 이동됩니다\n• 시간표 등 모든 기능에 다시 선택될 수 있게 됩니다\n• 기존 급여/출퇴근 기록은 그대로 유지됩니다`;
    if (!confirm(msg)) return;
    const { error } = await supabase.from("staff")
      .update({ is_resigned: false, resign_date: null, resign_reason: null })
      .eq("id", s.id);
    if (error) return alert("퇴사취소 실패: " + error.message);
    alert(`✅ ${s.name} 님이 재직 상태로 복원되었습니다`);
    loadAll();
  }
  async function deleteStaff(s: any) {
    if (!isDirector) return alert("원장만 삭제할 수 있습니다");
    if (!confirm(`${s.name} 님을 완전 삭제하시겠습니까? (급여이력은 백업됨)`)) return;
    await supabase.from("staff").delete().eq("id", s.id);
    loadAll();
  }

  // ─── 급여 이력 ───
  async function savePayroll() {
    if (!newPay.staff_id) return alert("직원을 선택하세요");
    const s = staff.find((x: any) => x.id === newPay.staff_id);
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const net = (Number(newPay.base_salary) || 0) + (Number(newPay.incentive) || 0) + (Number(newPay.bonus) || 0) - (Number(newPay.deduction) || 0);
    const payload = {
      org_id: orgId,
      staff_id: newPay.staff_id,
      staff_name: s?.name || null,
      pay_year: Number(newPay.pay_year),
      pay_month: Number(newPay.pay_month),
      base_salary: Number(newPay.base_salary) || 0,
      incentive: Number(newPay.incentive) || 0,
      bonus: Number(newPay.bonus) || 0,
      deduction: Number(newPay.deduction) || 0,
      net_pay: net,
      paid_date: newPay.paid_date || null,
      paid_method: newPay.paid_method,
      memo: newPay.memo || null,
    };
    if (editPay?.id) {
      const { error } = await supabase.from("payroll_history").update(payload).eq("id", editPay.id).select();
      if (error) return alert("수정 실패: " + error.message);
    } else {
      const { error } = await supabase.from("payroll_history").insert(payload).select();
      if (error) return alert("추가 실패: " + error.message);
    }
    setShowPayrollModal(false);
    setEditPay(null);
    setNewPay({ staff_id: "", pay_year: new Date().getFullYear(), pay_month: new Date().getMonth()+1, base_salary: 0, incentive: 0, bonus: 0, deduction: 0, paid_date: new Date().toISOString().slice(0, 10), paid_method: "transfer", memo: "" });
    loadAll();
  }

  function openEditPay(p: any) {
    if (!isDirector) return alert("원장만 수정할 수 있습니다");
    setEditPay(p);
    setNewPay({
      staff_id: p.staff_id, pay_year: p.pay_year, pay_month: p.pay_month,
      base_salary: p.base_salary || 0, incentive: p.incentive || 0,
      bonus: p.bonus || 0, deduction: p.deduction || 0,
      paid_date: p.paid_date || "", paid_method: p.paid_method || "transfer",
      memo: p.memo || "",
    });
    setShowPayrollModal(true);
  }

  async function deletePay(id: string) {
    if (!isDirector) return alert("원장만 삭제할 수 있습니다");
    if (!confirm("이 급여 이력을 삭제하시겠습니까?")) return;
    await supabase.from("payroll_history").delete().eq("id", id);
    loadAll();
  }

  // ─── 출퇴근 기록 ───
  async function saveAttendance() {
    if (!newAtt.staff_id || !newAtt.work_date) return alert("직원·날짜 필수");
    const s = staff.find((x: any) => x.id === newAtt.staff_id);
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    // 근무시간 계산
    let hours = 0, overtime = 0;
    if (newAtt.check_in && newAtt.check_out) {
      const [h1, m1] = newAtt.check_in.split(":").map(Number);
      const [h2, m2] = newAtt.check_out.split(":").map(Number);
      const total = (h2 * 60 + m2) - (h1 * 60 + m1);
      hours = Math.max(0, total / 60);
      if (hours > 8) overtime = hours - 8;
    }
    // ✅ v3.20.14: check_in/check_out을 TIMESTAMPTZ로 변환 (시간 문자열 → ISO)
    const toIso = (t: string) => t ? new Date(`${newAtt.work_date}T${t}:00+09:00`).toISOString() : null;

    // ✅ v3.20.14: work_date + log_date 둘 다 넣어 컴럼별 호환 보장
    const basePayload: any = {
      org_id: orgId,
      staff_id: newAtt.staff_id, staff_name: s?.name || null,
      work_date: newAtt.work_date,
      log_date: newAtt.work_date,
      check_in: toIso(newAtt.check_in),
      check_out: toIso(newAtt.check_out),
      work_hours: hours, overtime,
      overtime_hours: overtime,
      status: newAtt.status, memo: newAtt.memo || null, note: newAtt.memo || null,
    };

    // ✅ v3.20.14: 없는 컴럼은 자동 제거 후 재시도 (최대 6회)
    async function upsertWithFallback(op: "insert" | "update") {
      const payload: any = { ...basePayload };
      for (let i = 0; i < 6; i++) {
        const q = supabase.from("attendance_logs");
        const { data, error } = op === "update"
          ? await q.update(payload).eq("id", editAtt.id).select()
          : await q.insert(payload).select();
        if (!error) return { data, error: null };
        const missing = /column "([^"]+)" of relation "attendance_logs" does not exist/i.exec(error.message || "");
        if (missing?.[1] && missing[1] in payload) {
          delete payload[missing[1]];
          continue;
        }
        // work_date 교벘돈 log_date가 모두 NOT NULL이면 다음 순회에서 자동 해결
        return { data: null, error };
      }
      return { data: null, error: new Error("컴럼 폴백 초과") };
    }

    const res = editAtt?.id ? await upsertWithFallback("update") : await upsertWithFallback("insert");
    if (res.error) return alert(`❌ ${editAtt?.id ? "수정" : "추가"} 실패: ${res.error.message}\n\n💡 attendance_logs 테이블 RLS를 확인하세요. SQL에서 아래를 실행하면 해결됩니다:\n\nALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS "all_access" ON attendance_logs;\nCREATE POLICY "all_access" ON attendance_logs USING (true) WITH CHECK (true);`);
    setShowAttendanceModal(false);
    setEditAtt(null);
    setNewAtt({ staff_id: "", work_date: new Date().toISOString().slice(0, 10), check_in: "09:00", check_out: "18:00", status: "normal", memo: "" });
    loadAll();
  }

  function openEditAtt(a: any) {
    if (!isDirector) return alert("원장만 수정할 수 있습니다");
    setEditAtt(a);
    setNewAtt({
      staff_id: a.staff_id, work_date: a.work_date,
      check_in: a.check_in || "09:00", check_out: a.check_out || "18:00",
      status: a.status || "normal", memo: a.memo || "",
    });
    setShowAttendanceModal(true);
  }

  async function deleteAtt(id: string) {
    if (!isDirector) return alert("원장만 삭제할 수 있습니다");
    if (!confirm("이 출퇴근 기록을 삭제하시겠습니까?")) return;
    await supabase.from("attendance_logs").delete().eq("id", id);
    loadAll();
  }

  // ─── 필터링 ───
  const activeStaff = staff.filter((s: any) => !s.is_resigned);
  const resignedStaff = staff.filter((s: any) => s.is_resigned);

  const filteredPayroll = payrollHistory.filter((p: any) =>
    (!filterStaffId || p.staff_id === filterStaffId)
    && p.pay_year === filterYear
  );
  const totalPayrollThisFilter = filteredPayroll.reduce((sum, p) => sum + (p.net_pay || 0), 0);

  const filteredAtt = attendanceLogs.filter((a: any) => {
    if (filterStaffId && a.staff_id !== filterStaffId) return false;
    if (!a.work_date) return false;
    const d = new Date(a.work_date);
    return d.getFullYear() === filterYear && d.getMonth() + 1 === filterMonth;
  });

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10 bg-gradient-to-br from-sky-50 via-white to-cyan-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Users className="w-8 h-8 text-aqu-600" />
          <h1 className="text-2xl md:text-3xl font-bold text-aqu-900">직원 관리</h1>
          {!isDirector && (
            <span className="ml-2 text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">읽기 전용</span>
          )}
        </div>
        <HomeButton />
      </div>

      {/* 상단 KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KPI icon="👥" label="재직 직원" val={activeStaff.length} color="from-emerald-400 to-teal-500" />
        <KPI icon="👋" label="퇴사자" val={resignedStaff.length} color="from-gray-400 to-slate-500" />
        <KPI icon="💰" label={`${filterYear}년 급여 지급`} val={`${payrollHistory.filter(p => p.pay_year === filterYear).length}건`} color="from-pink-400 to-rose-500" />
        <KPI icon="⏰" label="이번 달 근태" val={`${attendanceLogs.filter(a => a.work_date?.startsWith(`${filterYear}-${String(filterMonth).padStart(2,"0")}`)).length}건`} color="from-blue-400 to-cyan-500" />
      </div>

      {/* ✅ v3.18.0: 강사별 수업 · 수당 자동 계산 */}
      <div className="bg-white border border-aqu-100 rounded-2xl p-4 mb-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="text-sm font-bold text-aqu-900">📊 강사별 자동 수당 계산</div>
            <span className="text-[10px] text-gray-500">시간표·출결 연동 자동 집계</span>
          </div>
          <input type="month" value={slotsMonth} onChange={e => setSlotsMonth(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-200 rounded-lg" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-aqu-50 text-aqu-800">
                <th className="px-2 py-2 text-left">강사</th>
                <th className="px-2 py-2 text-center">예약</th>
                <th className="px-2 py-2 text-center">완료</th>
                <th className="px-2 py-2 text-center">노쇼</th>
                <th className="px-2 py-2 text-center">병결</th>
                <th className="px-2 py-2 text-right">회당단가</th>
                <th className="px-2 py-2 text-right">자동 수당</th>
              </tr>
            </thead>
            <tbody>
              {activeStaff.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-4 text-gray-400">재직 직원이 없습니다</td></tr>
              ) : activeStaff.map((s: any) => {
                // v3.21.6: 강사별 통계 4중 매핑 – (1) slot.staff_id (2) attendance.slot_id (3) member.staff_id (4) slot_matrix 고정 예약
                // 담당 회원 id 집합 (member.staff_id + slot_matrix.staff_id 통합)
                const memberSetFromDirect = (membersLite || []).filter((mm: any) => mm.staff_id === s.id).map((mm: any) => mm.id);
                const memberSetFromMatrix = (slotMatrix || []).filter((c: any) => c.staff_id === s.id && c.member_id).map((c: any) => c.member_id);
                const myMemberIds = new Set([...memberSetFromDirect, ...memberSetFromMatrix]);

                // v3.21.6: slot_matrix의 고정 예약을 해당 월의 실제 수업일로 확장 (주간 반복 예약)
                // day_of_week (1=월, 2=화 ... 6=토) → 해당 월의 모든 해당 요일 수업일 생성
                const myMatrixCells = (slotMatrix || []).filter((c: any) => c.staff_id === s.id && c.status === "fixed" && c.member_id);
                const virtualSlotsFromMatrix: any[] = [];
                if (myMatrixCells.length > 0 && slotsMonth) {
                  const [yr, mo] = slotsMonth.split("-").map(Number);
                  const daysInMonth = new Date(yr, mo, 0).getDate();
                  for (let d = 1; d <= daysInMonth; d++) {
                    const dt = new Date(yr, mo - 1, d);
                    const dow = dt.getDay() === 0 ? 7 : dt.getDay(); // JS: 0=일 → 7로 통일
                    if (dow > 6) continue; // 일요일 제외
                    const dateStr = `${yr}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                    myMatrixCells.filter((c: any) => c.day_of_week === dow).forEach((c: any) => {
                      virtualSlotsFromMatrix.push({
                        id: `matrix_${c.id}_${dateStr}`,
                        staff_id: s.id,
                        member_id: c.member_id,
                        event_date: dateStr,
                        event_type: "lesson",
                        status: "scheduled",
                        __virtual: true,
                      });
                    });
                  }
                }

                // 1) schedule_slots – 직접 staff_id 배정 또는 member.staff_id 역매핑으로 이 강사에 귀속
                // v3.21.7: staff_id가 null인 slot도 담당회원 기준으로 강사 귀속 + event_type 마이너스 필터
                const realSlots = slots.filter((sl: any) => {
                  const et = (sl.event_type || "").toLowerCase();
                  if (et === "revenue" || et === "other") return false;
                  // (a) 직접 staff_id 배정된 것
                  if (sl.staff_id === s.id) return true;
                  // (b) staff_id 없는 slot: 회원의 담당강사가 이 사람이면 이 강사에 귀속
                  if (!sl.staff_id && sl.member_id && myMemberIds.has(sl.member_id)) return true;
                  return false;
                });
                // 실제 schedule_slots와 중복되는 가상 예약은 제거 (같은 member+date이면 실제를 우선)
                const realKey = new Set(realSlots.map((sl: any) => `${sl.member_id}__${sl.event_date}`));
                const dedupedVirtual = virtualSlotsFromMatrix.filter((v: any) => !realKey.has(`${v.member_id}__${v.event_date}`));
                const mySlots = [...realSlots, ...dedupedVirtual];
                const mySlotIds = new Set(mySlots.map((sl: any) => sl.id).filter(Boolean));
                const slotByMemberDate = new Map<string, any>();
                mySlots.forEach((sl: any) => {
                  if (sl.member_id && sl.event_date) slotByMemberDate.set(`${sl.member_id}__${sl.event_date}`, sl);
                });
                // 2) attendance 필터링 – slot_id 매칭 OR 담당회원 매칭 OR member+date로 slot 매핑
                const myAtt = (monthAttendance || []).filter((a: any) => {
                  if (a.slot_id && mySlotIds.has(a.slot_id)) return true;
                  const aDate = a._date || a.attend_date || a.date;
                  if (a.member_id && aDate && slotByMemberDate.has(`${a.member_id}__${aDate}`)) return true;
                  // v3.21.5: 담당 회원 attendance 는 slot 없어도 이 강사 귀속
                  if (a.member_id && myMemberIds.has(a.member_id)) return true;
                  return false;
                });
                // 통합 고유 이벤트 키 생성 (중복 카운트 방지)
                const eventKey = (source: "slot" | "att", ref: any): string => {
                  if (source === "slot") return `slot_${ref.id}`;
                  const aDate = ref._date || ref.attend_date || ref.date;
                  const sl = ref.slot_id ? mySlots.find((x: any) => x.id === ref.slot_id) : slotByMemberDate.get(`${ref.member_id}__${aDate}`);
                  if (sl?.id) return `slot_${sl.id}`;
                  return `att_${ref.member_id}_${aDate}`;
                };
                // 예약(total) = slot + attendance 통합 고유 이벤트 수
                const allKeys = new Set<string>();
                mySlots.forEach((sl: any) => allKeys.add(eventKey("slot", sl)));
                myAtt.forEach((a: any) => allKeys.add(eventKey("att", a)));
                const total = allKeys.size;

                // status 별 카운트 – slot.status와 attendance.status 중 하나라도 매칭되면 카운트
                const eventStatusMap = new Map<string, string>();
                mySlots.forEach((sl: any) => {
                  const k = eventKey("slot", sl);
                  eventStatusMap.set(k, (sl.status || "").toLowerCase());
                });
                myAtt.forEach((a: any) => {
                  const k = eventKey("att", a);
                  const st = (a.status || "").toLowerCase();
                  const prev = eventStatusMap.get(k);
                  // done/noshow가 우선 (실제 발생 상태가 예약보다 우선)
                  const priority = ["done", "completed", "present", "noshow", "absent", "sick", "personal"];
                  if (!prev || (priority.indexOf(st) >= 0 && priority.indexOf(prev) < 0)) {
                    eventStatusMap.set(k, st);
                  } else if (priority.indexOf(st) >= 0 && priority.indexOf(prev) >= 0 && priority.indexOf(st) < priority.indexOf(prev)) {
                    eventStatusMap.set(k, st);
                  }
                });
                const countBy = (predicate: (status: string) => boolean) => {
                  let n = 0;
                  eventStatusMap.forEach((st) => { if (predicate(st)) n++; });
                  return n;
                };
                const done   = countBy((st) => ["done", "completed", "present"].includes(st));
                const noshow = countBy((st) => ["noshow", "absent"].includes(st));
                const sick   = countBy((st) => ["sick", "personal"].includes(st));
                // ✅ v3.19.0: 세션당 단가 우선순위
                // 1) session_rate 직접 설정값이 있으면 그 값
                // 2) salary_type='session'이면 salary_amount
                // 3) 생서 둘 다 없으면 0 (설정 안함으로 표시)
                const unit = (s.session_rate !== null && s.session_rate !== undefined) ? Number(s.session_rate)
                  : (s.salary_type === "session" ? Number(s.salary_amount || 0) : 0);
                const auto = done * unit;
                const color = s.color || "#3b82f6";
                return (
                  <tr key={s.id} className="border-t border-gray-100 hover:bg-aqu-50/30">
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="font-semibold text-slate-800">{s.name}</span>
                        <span className="text-[10px] text-gray-500">({s.role || "직원"})</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center text-slate-600">{total}</td>
                    <td className="px-2 py-2 text-center text-emerald-700 font-semibold">{done}</td>
                    <td className="px-2 py-2 text-center text-red-600">{noshow}</td>
                    <td className="px-2 py-2 text-center text-orange-600">{sick}</td>
                    <td className="px-2 py-2 text-right text-gray-500">
                      {unit > 0 ? `₩${unit.toLocaleString()}` : <span className="text-orange-500 text-[10px]">⚠️ 미설정</span>}
                    </td>
                    <td className="px-2 py-2 text-right font-bold text-aqu-800">₩{auto.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
            {activeStaff.length > 0 && (
              <tfoot>
                <tr className="bg-aqu-50 font-bold">
                  <td colSpan={2} className="px-2 py-2 text-aqu-800">합계</td>
                  <td className="px-2 py-2 text-center text-emerald-700">
                    {(() => {
                      // v3.21.5: 합계 - 3중 매핑 통일 (slot.staff_id + attendance.slot_id + member.staff_id 역매핑)
                      let total = 0;
                      activeStaff.forEach((s: any) => {
                        const myMemberIds = new Set((membersLite || []).filter((mm: any) => mm.staff_id === s.id).map((mm: any) => mm.id));
                        // v3.21.7: staff_id null slot도 담당회원 기준으로 관리
                        const mySlots = slots.filter((sl: any) => {
                          const et = (sl.event_type || "").toLowerCase();
                          if (et === "revenue" || et === "other") return false;
                          if (sl.staff_id === s.id) return true;
                          if (!sl.staff_id && sl.member_id && myMemberIds.has(sl.member_id)) return true;
                          return false;
                        });
                        const mySlotIds = new Set(mySlots.map((sl: any) => sl.id).filter(Boolean));
                        const slotByMD = new Map<string, any>();
                        mySlots.forEach((sl: any) => { if (sl.member_id && sl.event_date) slotByMD.set(`${sl.member_id}__${sl.event_date}`, sl); });
                        const eventStatus = new Map<string, string>();
                        mySlots.forEach((sl: any) => { eventStatus.set(`slot_${sl.id}`, (sl.status||"").toLowerCase()); });
                        (monthAttendance || []).forEach((a: any) => {
                          const aDate = a._date || a.attend_date || a.date;
                          const belongs = (a.slot_id && mySlotIds.has(a.slot_id))
                            || (a.member_id && aDate && slotByMD.has(`${a.member_id}__${aDate}`))
                            || (a.member_id && myMemberIds.has(a.member_id));
                          if (!belongs) return;
                          const sl = a.slot_id ? mySlots.find((x: any) => x.id === a.slot_id) : slotByMD.get(`${a.member_id}__${aDate}`);
                          const key = sl?.id ? `slot_${sl.id}` : `att_${a.member_id}_${aDate}`;
                          const st = (a.status || "").toLowerCase();
                          const prev = eventStatus.get(key);
                          const priority = ["done","completed","present","noshow","absent","sick","personal"];
                          if (!prev || (priority.indexOf(st) >= 0 && (priority.indexOf(prev) < 0 || priority.indexOf(st) < priority.indexOf(prev)))) {
                            eventStatus.set(key, st);
                          }
                        });
                        eventStatus.forEach((st) => { if (["done","completed","present"].includes(st)) total++; });
                      });
                      return total;
                    })()}
                  </td>
                  <td colSpan={3}></td>
                  <td className="px-2 py-2 text-right text-aqu-900">
                    ₩{(() => {
                      let sum = 0;
                      activeStaff.forEach((s: any) => {
                        const myMemberIds = new Set((membersLite || []).filter((mm: any) => mm.staff_id === s.id).map((mm: any) => mm.id));
                        const mySlots = slots.filter((sl: any) => {
                          const et = (sl.event_type || "").toLowerCase();
                          if (et === "revenue" || et === "other") return false;
                          if (sl.staff_id === s.id) return true;
                          if (!sl.staff_id && sl.member_id && myMemberIds.has(sl.member_id)) return true;
                          return false;
                        });
                        const mySlotIds = new Set(mySlots.map((sl: any) => sl.id).filter(Boolean));
                        const slotByMD = new Map<string, any>();
                        mySlots.forEach((sl: any) => { if (sl.member_id && sl.event_date) slotByMD.set(`${sl.member_id}__${sl.event_date}`, sl); });
                        const eventStatus = new Map<string, string>();
                        mySlots.forEach((sl: any) => { eventStatus.set(`slot_${sl.id}`, (sl.status||"").toLowerCase()); });
                        (monthAttendance || []).forEach((a: any) => {
                          const aDate = a._date || a.attend_date || a.date;
                          const belongs = (a.slot_id && mySlotIds.has(a.slot_id))
                            || (a.member_id && aDate && slotByMD.has(`${a.member_id}__${aDate}`))
                            || (a.member_id && myMemberIds.has(a.member_id));
                          if (!belongs) return;
                          const sl = a.slot_id ? mySlots.find((x: any) => x.id === a.slot_id) : slotByMD.get(`${a.member_id}__${aDate}`);
                          const key = sl?.id ? `slot_${sl.id}` : `att_${a.member_id}_${aDate}`;
                          const st = (a.status || "").toLowerCase();
                          const prev = eventStatus.get(key);
                          const priority = ["done","completed","present","noshow","absent","sick","personal"];
                          if (!prev || (priority.indexOf(st) >= 0 && (priority.indexOf(prev) < 0 || priority.indexOf(st) < priority.indexOf(prev)))) {
                            eventStatus.set(key, st);
                          }
                        });
                        let done = 0;
                        eventStatus.forEach((st) => { if (["done","completed","present"].includes(st)) done++; });
                        const unit = (s.session_rate !== null && s.session_rate !== undefined) ? Number(s.session_rate)
                          : (s.salary_type === "session" ? Number(s.salary_amount || 0) : 0);
                        sum += done * unit;
                      });
                      return sum.toLocaleString();
                    })()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="text-[10px] text-gray-500 mt-2">
          💡 자동 수당 = 완료 수업 수 × 회당 단가 · 강사 편집하여 <b>회당 단가 · 인센티브율</b>을 맞게 설정해주세요 · 미설정 강사는 ⚠️ 표시
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-4 border-b border-gray-200 overflow-x-auto">
        <TabBtn active={tab === "active"} onClick={() => setTab("active")}>👥 재직 ({activeStaff.length})</TabBtn>
        <TabBtn active={tab === "resigned"} onClick={() => setTab("resigned")}>👋 퇴사자 ({resignedStaff.length})</TabBtn>
        <TabBtn active={tab === "payroll"} onClick={() => setTab("payroll")}>💰 급여 이력</TabBtn>
        <TabBtn active={tab === "attendance"} onClick={() => setTab("attendance")}>⏰ 출퇴근 기록</TabBtn>
      </div>

      {/* ─── 재직 직원 목록 ─── */}
      {tab === "active" && (
        <div>
          <div className="mb-4 flex justify-end">
            <button onClick={() => { setEditStaff(null); setShowStaffModal(true); }}
              className="px-4 py-2 bg-aqu-600 text-white rounded-lg text-sm hover:bg-aqu-700 flex items-center gap-1">
              <Plus className="w-4 h-4" /> 직원 추가
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeStaff.map((s: any) => (
              <div key={s.id} className="bg-white rounded-xl border border-aqu-100 p-4 hover:shadow-md transition-shadow"
                style={{ borderLeftColor: s.color, borderLeftWidth: 4 }}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-bold text-aqu-900">{s.name}</div>
                    <div className="text-xs text-gray-500">{roleLabel(s.role)}</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setCertStaff(s)} className="p-1 text-gray-400 hover:text-emerald-600" title="📄 재직·경력증명서 발급">
                      <FileText className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDocsStaff(s)} className="p-1 text-gray-400 hover:text-purple-600" title="문서 관리">
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => openEditStaff(s)} className="p-1 text-gray-400 hover:text-aqu-600">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {isDirector && (
                      <button onClick={() => openResign(s)} className="p-1 text-gray-400 hover:text-orange-600" title="퇴사 처리">
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-xs text-gray-600 space-y-0.5">
                  {s.email && <div>📧 {s.email}</div>}
                  {s.phone && <div>📞 {s.phone}</div>}
                  {s.hire_date && <div>📅 입사: {s.hire_date}</div>}
                  <div>
                    💰 {s.salary_type === "hourly" ? "시급" : s.salary_type === "monthly" ? "월급" : s.salary_type === "daily" ? "일급" : "프리랜서"}: ₩{(s.salary_amount || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── 퇴사자 ─── */}
      {tab === "resigned" && (
        <div>
          {resignedStaff.length === 0 ? (
            <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-100">
              👋 퇴사자가 없습니다
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {resignedStaff.map((s: any) => (
                <div key={s.id} className="bg-gray-50 rounded-xl border border-gray-200 p-4 opacity-90">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-bold text-gray-700">{s.name}</div>
                      <div className="text-xs text-gray-500">{roleLabel(s.role)}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* 문서관리는 퇴사자도 열웅 (보관목적) */}
                      <button onClick={() => setCertStaff(s)} className="p-1 text-gray-400 hover:text-blue-600" title="📋 경력증명서 발급">
                        <FileText className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDocsStaff(s)} className="p-1 text-gray-400 hover:text-purple-600" title="문서 보관">
                        <FolderOpen className="w-3.5 h-3.5" />
                      </button>
                      {isDirector && (
                        <>
                          <button onClick={() => reinstate(s)} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-semibold" title="퇴사 취소 · 재입사">
                            🔄 퇴사취소
                          </button>
                          <button onClick={() => deleteStaff(s)} className="p-1 text-gray-400 hover:text-red-500" title="완전 삭제">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 space-y-0.5">
                    {s.hire_date && <div>📅 입사: {s.hire_date}</div>}
                    <div className="text-orange-600">🚪 퇴사: {s.resign_date || "-"}</div>
                    {s.resign_reason && <div>📝 사유: {s.resign_reason}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── 급여 이력 ─── */}
      {tab === "payroll" && (
        <div>
          <div className="mb-4 flex flex-wrap gap-2 items-center">
            <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
              {YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select value={filterStaffId} onChange={e => setFilterStaffId(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">전체 직원</option>
              {staff.map((s: any) => <option key={s.id} value={s.id}>{s.name}{s.is_resigned ? " (퇴사)" : ""}</option>)}
            </select>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-gray-600">
                {filterYear}년 총 지급: <b className="text-pink-600">₩{totalPayrollThisFilter.toLocaleString()}</b>
              </span>
              <button onClick={() => { setEditPay(null); setShowPayrollModal(true); }}
                className="px-4 py-2 bg-pink-500 text-white rounded-lg text-sm hover:bg-pink-600 flex items-center gap-1">
                <Plus className="w-4 h-4" /> 급여 등록
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-aqu-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-aqu-50 border-b border-aqu-100">
                <tr>
                  <th className="p-3 text-left">직원</th>
                  <th className="p-3 text-left">지급월</th>
                  <th className="p-3 text-right">기본급</th>
                  <th className="p-3 text-right">인센티브</th>
                  <th className="p-3 text-right">보너스</th>
                  <th className="p-3 text-right">공제</th>
                  <th className="p-3 text-right">실지급</th>
                  <th className="p-3 text-left">지급일</th>
                  <th className="p-3 text-center">액션</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayroll.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-gray-400">기록 없음</td></tr>
                ) : filteredPayroll.map((p: any) => {
                  const s = staff.find((x: any) => x.id === p.staff_id);
                  return (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-aqu-50/30">
                      <td className="p-3 font-medium">{s?.name || p.staff_name || "삭제된 직원"}</td>
                      <td className="p-3">{p.pay_year}년 {p.pay_month}월</td>
                      <td className="p-3 text-right">₩{(p.base_salary || 0).toLocaleString()}</td>
                      <td className="p-3 text-right text-blue-600">₩{(p.incentive || 0).toLocaleString()}</td>
                      <td className="p-3 text-right text-emerald-600">₩{(p.bonus || 0).toLocaleString()}</td>
                      <td className="p-3 text-right text-red-600">-₩{(p.deduction || 0).toLocaleString()}</td>
                      <td className="p-3 text-right font-bold text-pink-600">₩{(p.net_pay || 0).toLocaleString()}</td>
                      <td className="p-3 text-xs text-gray-500">{p.paid_date || "-"}</td>
                      <td className="p-3 text-center">
                        {isDirector && (
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => openEditPay(p)} className="p-1 text-gray-400 hover:text-aqu-600">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deletePay(p.id)} className="p-1 text-gray-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── 출퇴근 기록 ─── */}
      {tab === "attendance" && (
        <div>
          <div className="mb-4 flex flex-wrap gap-2 items-center">
            <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
              {YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
              {MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
            </select>
            <select value={filterStaffId} onChange={e => setFilterStaffId(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">전체 직원</option>
              {staff.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button onClick={() => { setEditAtt(null); setShowAttendanceModal(true); }}
              className="ml-auto px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 flex items-center gap-1">
              <Plus className="w-4 h-4" /> 출퇴근 등록
            </button>
          </div>

          <div className="bg-white rounded-xl border border-aqu-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-aqu-50 border-b border-aqu-100">
                <tr>
                  <th className="p-3 text-left">날짜</th>
                  <th className="p-3 text-left">직원</th>
                  <th className="p-3 text-left">출근</th>
                  <th className="p-3 text-left">퇴근</th>
                  <th className="p-3 text-right">근무</th>
                  <th className="p-3 text-right">초과</th>
                  <th className="p-3 text-left">상태</th>
                  <th className="p-3 text-center">액션</th>
                </tr>
              </thead>
              <tbody>
                {filteredAtt.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">기록 없음</td></tr>
                ) : filteredAtt.map((a: any) => {
                  const s = staff.find((x: any) => x.id === a.staff_id);
                  return (
                    <tr key={a.id} className="border-b border-gray-100 hover:bg-aqu-50/30">
                      <td className="p-3">{a.work_date}</td>
                      <td className="p-3 font-medium">{s?.name || a.staff_name || "-"}</td>
                      <td className="p-3">{a.check_in || "-"}</td>
                      <td className="p-3">{a.check_out || "-"}</td>
                      <td className="p-3 text-right">{(a.work_hours || 0).toFixed(1)}h</td>
                      <td className="p-3 text-right text-orange-600">{a.overtime > 0 ? `+${a.overtime.toFixed(1)}h` : "-"}</td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          a.status === "normal" ? "bg-emerald-100 text-emerald-700" :
                          a.status === "late" ? "bg-yellow-100 text-yellow-700" :
                          a.status === "absent" ? "bg-red-100 text-red-700" :
                          a.status === "vacation" ? "bg-blue-100 text-blue-700" :
                          "bg-gray-100 text-gray-700"
                        }`}>
                          {a.status === "normal" ? "정상" : a.status === "late" ? "지각" : a.status === "early_leave" ? "조퇴" : a.status === "absent" ? "결근" : a.status === "vacation" ? "휴가" : a.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {isDirector && (
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => openEditAtt(a)} className="p-1 text-gray-400 hover:text-aqu-600">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteAtt(a.id)} className="p-1 text-gray-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═════ 직원 추가/수정 모달 ═════ */}
      {showStaffModal && (
        <Modal title={editStaff ? "직원 수정" : "직원 추가"} onClose={() => { setShowStaffModal(false); setEditStaff(null); }}>
          <div className="space-y-3">
            {/* ✅ v3.43.1: 최상단 기본 정보 카드 - 이름 · 생년월일 · 전화 · 입사일 · 주소 통합 */}
            <div className="bg-sky-50/60 border border-sky-200 rounded-xl p-3 space-y-2">
              <div className="text-xs font-bold text-sky-800 mb-1 flex items-center gap-1">👤 기본 정보</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="이름 *"><input value={newStaff.name} onChange={e => setNewStaff({ ...newStaff, name: e.target.value })} placeholder="홍길동" className="w-full p-2 border rounded-lg text-sm" /></Field>
                <Field label="생년월일 *"><input type="date" value={newStaff.birth} onChange={e => setNewStaff({ ...newStaff, birth: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="전화번호 *"><input value={newStaff.phone} onChange={e => setNewStaff({ ...newStaff, phone: e.target.value })} placeholder="010-1234-5678" className="w-full p-2 border rounded-lg text-sm" /></Field>
                <Field label="입사일 *"><input type="date" value={newStaff.hire_date} onChange={e => setNewStaff({ ...newStaff, hire_date: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
              </div>
              <Field label="주소 *"><input value={newStaff.address} onChange={e => setNewStaff({ ...newStaff, address: e.target.value })} placeholder="하남시 위례대로 190, 위례효성해링턴타워..." className="w-full p-2 border rounded-lg text-sm" /></Field>
              <div className="text-[10px] text-sky-700">💡 * 표시 필드는 재직·경력증명서 발급에 필수입니다.</div>
            </div>

            {/* 추가 정보 (역할·이메일 등) */}
            <div className="grid grid-cols-2 gap-2">
              <Field label="이메일"><input value={newStaff.email} onChange={e => setNewStaff({ ...newStaff, email: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
              <Field label="역할">
                <select value={newStaff.role} onChange={e => setNewStaff({ ...newStaff, role: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm">
                  {ROLES.map(r => <option key={r.k} value={r.k}>{r.label}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="급여 형태">
                <select value={newStaff.salary_type} onChange={e => setNewStaff({ ...newStaff, salary_type: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm">
                  <option value="monthly">월급</option>
                  <option value="hourly">시급</option>
                  <option value="daily">일급</option>
                  <option value="session">세션당 (회당지급)</option>
                  <option value="freelance">프리랜서</option>
                </select>
              </Field>
              <Field label="급여 금액 (원)"><input type="number" value={newStaff.salary_amount} onChange={e => setNewStaff({ ...newStaff, salary_amount: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
            </div>

            {/* ✅ v3.19.0: 강사별 회당 단가 · 인센티브율 설정 */}
            <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-3">
              <div className="text-xs font-bold text-indigo-800 mb-2 flex items-center gap-1">💰 수업 수당 설정</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="회당 단가 (수업 완료 시 지급액)">
                  <div className="flex items-center gap-1">
                    <input type="number" step="1000" value={newStaff.session_rate} onChange={e => setNewStaff({ ...newStaff, session_rate: e.target.value })}
                      className="w-full p-2 border rounded-lg text-sm" placeholder="30000" />
                    <span className="text-xs text-gray-500">원</span>
                  </div>
                </Field>
                <Field label="인센티브율 (%) – 선택">
                  <div className="flex items-center gap-1">
                    <input type="number" step="0.5" value={newStaff.incentive_rate} onChange={e => setNewStaff({ ...newStaff, incentive_rate: e.target.value })}
                      className="w-full p-2 border rounded-lg text-sm" placeholder="0" />
                    <span className="text-xs text-gray-500">%</span>
                  </div>
                </Field>
              </div>
              <div className="text-[10px] text-indigo-700 mt-2">
                💡 자동 수당 = 완료 수업 수 × 회당 단가 · 인센티브율은 월말 정산 시 별도 가산
              </div>
            </div>
            {/* ✅ v3.43.1: 서류 발급용 추가 정보 (기본정보는 상단 카드에서 관리) */}
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 space-y-2">
              <div className="text-xs font-bold text-emerald-800 mb-1 flex items-center gap-1">📄 서류 발급용 추가 정보</div>
              <Field label="주민등록번호 (뒷자리 자동 마스킹)">
                <input value={newStaff.resident_number} onChange={e => {
                  let v = e.target.value.replace(/[^0-9-]/g, "");
                  if (v.length === 6 && !v.includes("-")) v += "-";
                  if (v.length > 8) {
                    const front = v.slice(0, 7);
                    v = front + "******";
                  }
                  setNewStaff({ ...newStaff, resident_number: v });
                }} placeholder="900101-1******" className="w-full p-2 border rounded-lg text-sm" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="직위 (예: 수석 강사)"><input value={newStaff.position} onChange={e => setNewStaff({ ...newStaff, position: e.target.value })} placeholder="수석 강사" className="w-full p-2 border rounded-lg text-sm" /></Field>
                <Field label="소속 부서 (예: 수중재활팀)"><input value={newStaff.department} onChange={e => setNewStaff({ ...newStaff, department: e.target.value })} placeholder="수중재활팀" className="w-full p-2 border rounded-lg text-sm" /></Field>
              </div>
              <Field label="담당업무 (경력증명서 자동 채움)"><textarea value={newStaff.job_description} onChange={e => setNewStaff({ ...newStaff, job_description: e.target.value })} placeholder="예: 수중재활 프로그램 진행 및 회원 관리, 신규 회원 상담 및 프로그램 배정" rows={2} className="w-full p-2 border rounded-lg text-sm resize-none" /></Field>
              <div className="text-[10px] text-emerald-700">💡 이 정보는 서류 발급 시 자동으로 채워지며, 발급 시점에 수정도 가능합니다.</div>
            </div>
{/* ✅ v3.43.1: 주소는 상단 기본정보 카드로 이동 */}
            {/* v3.21.4: 색상 피커 UX 강화 – 프리셋 10색 + 커스텀 색상 인푻 */}
            <Field label="색상 (시간표·통계에 사용)">
              <div className="space-y-2">
                <div className="grid grid-cols-10 gap-1.5">
                  {COLOR_PALETTE.map(c => (
                    <button key={c} type="button" onClick={() => setNewStaff({ ...newStaff, color: c })}
                      style={{ background: c }}
                      title={c}
                      className={`w-8 h-8 rounded-full transition-all hover:scale-110 ${newStaff.color === c ? "ring-2 ring-offset-2 ring-aqu-500 scale-110 shadow-lg" : "ring-1 ring-slate-200"}`} />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-slate-600">커스텀:</label>
                  <input type="color" value={newStaff.color || "#3b82f6"}
                    onChange={e => setNewStaff({ ...newStaff, color: e.target.value })}
                    className="w-10 h-8 rounded border border-slate-200 cursor-pointer" />
                  <span className="text-[10px] text-slate-500 font-mono">{newStaff.color || "#3b82f6"}</span>
                </div>
              </div>
            </Field>
            <div className="flex gap-2 pt-3">
              <button onClick={saveStaff} className="flex-1 py-2 bg-aqu-600 text-white rounded-lg text-sm hover:bg-aqu-700">
                <Save className="w-4 h-4 inline mr-1" /> 저장
              </button>
              <button onClick={() => { setShowStaffModal(false); setEditStaff(null); }} className="px-4 py-2 border rounded-lg text-sm">취소</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ═════ 퇴사 처리 모달 ═════ */}
      {showResignModal && resignStaff && (
        <ResignModal
          staff={resignStaff}
          onClose={() => { setShowResignModal(false); setResignStaff(null); }}
          onConfirm={confirmResign}
        />
      )}

      {/* ═════ 급여 등록 모달 ═════ */}
      {showPayrollModal && (
        <Modal title={editPay ? "급여 수정" : "급여 등록"} onClose={() => { setShowPayrollModal(false); setEditPay(null); }}>
          <div className="space-y-3">
            <Field label="직원 *">
              <select value={newPay.staff_id} onChange={e => setNewPay({ ...newPay, staff_id: e.target.value })}
                className="w-full p-2 border rounded-lg text-sm">
                <option value="">-- 선택 --</option>
                {staff.map((s: any) => <option key={s.id} value={s.id}>{s.name} {s.is_resigned && "(퇴사)"}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="지급 연도">
                <select value={newPay.pay_year} onChange={e => setNewPay({ ...newPay, pay_year: Number(e.target.value) })}
                  className="w-full p-2 border rounded-lg text-sm">
                  {YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
                </select>
              </Field>
              <Field label="지급 월">
                <select value={newPay.pay_month} onChange={e => setNewPay({ ...newPay, pay_month: Number(e.target.value) })}
                  className="w-full p-2 border rounded-lg text-sm">
                  {MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="기본급"><input type="number" value={newPay.base_salary} onChange={e => setNewPay({ ...newPay, base_salary: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
              <Field label="인센티브"><input type="number" value={newPay.incentive} onChange={e => setNewPay({ ...newPay, incentive: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
              <Field label="보너스"><input type="number" value={newPay.bonus} onChange={e => setNewPay({ ...newPay, bonus: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
              <Field label="공제 (세금·4대보험)"><input type="number" value={newPay.deduction} onChange={e => setNewPay({ ...newPay, deduction: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
            </div>
            <div className="p-3 bg-pink-50 rounded-lg text-sm">
              <b>실지급액</b>: <span className="text-pink-700 font-bold">
                ₩{((Number(newPay.base_salary) || 0) + (Number(newPay.incentive) || 0) + (Number(newPay.bonus) || 0) - (Number(newPay.deduction) || 0)).toLocaleString()}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="실제 지급일"><input type="date" value={newPay.paid_date} onChange={e => setNewPay({ ...newPay, paid_date: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
              <Field label="지급 방식">
                <select value={newPay.paid_method} onChange={e => setNewPay({ ...newPay, paid_method: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm">
                  <option value="transfer">계좌이체</option>
                  <option value="cash">현금</option>
                  <option value="other">기타</option>
                </select>
              </Field>
            </div>
            <Field label="메모"><textarea value={newPay.memo} onChange={e => setNewPay({ ...newPay, memo: e.target.value })} rows={2} className="w-full p-2 border rounded-lg text-sm" /></Field>
            <div className="flex gap-2 pt-3">
              <button onClick={savePayroll} className="flex-1 py-2 bg-pink-500 text-white rounded-lg text-sm hover:bg-pink-600">
                <Save className="w-4 h-4 inline mr-1" /> 저장
              </button>
              <button onClick={() => { setShowPayrollModal(false); setEditPay(null); }} className="px-4 py-2 border rounded-lg text-sm">취소</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ═════ 출퇴근 등록 모달 ═════ */}
      {showAttendanceModal && (
        <Modal title={editAtt ? "출퇴근 수정" : "출퇴근 등록"} onClose={() => { setShowAttendanceModal(false); setEditAtt(null); }}>
          <div className="space-y-3">
            <Field label="직원 *">
              <select value={newAtt.staff_id} onChange={e => setNewAtt({ ...newAtt, staff_id: e.target.value })}
                className="w-full p-2 border rounded-lg text-sm">
                <option value="">-- 선택 --</option>
                {staff.map((s: any) => <option key={s.id} value={s.id}>{s.name} {s.is_resigned && "(퇴사)"}</option>)}
              </select>
            </Field>
            <Field label="근무일 *"><input type="date" value={newAtt.work_date} onChange={e => setNewAtt({ ...newAtt, work_date: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="출근"><input type="time" value={newAtt.check_in} onChange={e => setNewAtt({ ...newAtt, check_in: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
              <Field label="퇴근"><input type="time" value={newAtt.check_out} onChange={e => setNewAtt({ ...newAtt, check_out: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
            </div>
            <Field label="상태">
              <select value={newAtt.status} onChange={e => setNewAtt({ ...newAtt, status: e.target.value })}
                className="w-full p-2 border rounded-lg text-sm">
                <option value="normal">정상</option>
                <option value="late">지각</option>
                <option value="early_leave">조퇴</option>
                <option value="absent">결근</option>
                <option value="vacation">휴가</option>
              </select>
            </Field>
            <Field label="메모"><input value={newAtt.memo} onChange={e => setNewAtt({ ...newAtt, memo: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
            <div className="flex gap-2 pt-3">
              <button onClick={saveAttendance} className="flex-1 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">
                <Save className="w-4 h-4 inline mr-1" /> 저장
              </button>
              <button onClick={() => { setShowAttendanceModal(false); setEditAtt(null); }} className="px-4 py-2 border rounded-lg text-sm">취소</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── 직원 문서 관리 모달 (파일 업로드) ─── */}
      {docsStaff && (
        <StaffDocumentsModal staff={docsStaff} orgId={docsStaff.org_id} onClose={() => setDocsStaff(null)} />
      )}

      {/* ─── v3.43.0: 재직·경력증명서 자동 발급 모달 ─── */}
      {certStaff && (
        <StaffCertIssueModal staff={certStaff} onClose={() => setCertStaff(null)} />
      )}
    </main>
  );
}

function KPI({ icon, label, val, color }: any) {
  return (
    <div className={`bg-gradient-to-br ${color} rounded-xl p-4 text-white shadow-sm`}>
      <div className="text-xs opacity-90">{icon} {label}</div>
      <div className="text-2xl font-bold mt-1">{val}</div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: any) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
        active ? "text-aqu-700 border-b-2 border-aqu-500 -mb-px" : "text-gray-500 hover:text-aqu-600"
      }`}>{children}</button>
  );
}

function Field({ label, children }: any) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white">
          <h3 className="font-bold text-aqu-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ResignModal({ staff, onClose, onConfirm }: any) {
  // ✅ v3.26.10: hydration mismatch 방지
  const [date, setDate] = useState<string>("");
  useEffect(() => { setDate(new Date().toISOString().slice(0, 10)); }, []);
  const [reason, setReason] = useState("");
  return (
    <Modal title={`${staff.name} 님 퇴사 처리`} onClose={onClose}>
      <div className="space-y-3">
        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
          ⚠️ 퇴사 처리 시 재직 목록에서 사라지고 퇴사자 탭으로 이동합니다. (삭제 아님, 급여이력은 보존)
        </div>
        <Field label="퇴사일"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border rounded-lg text-sm" /></Field>
        <Field label="퇴사 사유"><textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} className="w-full p-2 border rounded-lg text-sm" placeholder="예: 개인사유, 이직, 계약만료 등" /></Field>
        <div className="flex gap-2 pt-3">
          <button onClick={() => onConfirm(date, reason)}
            className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600">
            퇴사 처리
          </button>
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">취소</button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// 📁 직원 문서 관리 모달
// ═══════════════════════════════════════════════════════════════
function StaffDocumentsModal({ staff, orgId, onClose }: any) {
  const [docs, setDocs] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("contract");
  const [docTitle, setDocTitle] = useState<string>("");
  const [docMemo, setDocMemo] = useState<string>("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDocs(); }, [staff.id]);

  async function loadDocs() {
    setLoading(true);
    const { data } = await supabase.from("staff_documents")
      .select("*")
      .eq("staff_id", staff.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setDocs(data || []);
    setLoading(false);
  }

  async function uploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { alert("20MB 이하만 업로드 가능합니다"); return; }

    setUploading(true);
    try {
      // v3.20.30: 공용 유틸리티 사용 - sanitize + 재시도 + 명확한 오류 메시지
      const { uploadToStorage } = await import("@/lib/storageUpload");
      const { filePath, publicUrl } = await uploadToStorage(
        "documents",
        `staff-docs/${staff.id}/${selectedCategory}`,
        file,
      );
      const pub = { publicUrl: publicUrl || "" };

      const { error: dbErr } = await supabase.from("staff_documents").insert({
        staff_id: staff.id,
        org_id: orgId,
        category: selectedCategory,
        title: docTitle.trim() || file.name,
        file_url: pub.publicUrl,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        memo: docMemo.trim() || null,
      });
      if (dbErr) throw dbErr;

      alert("✅ 업로드 완료");
      setDocTitle(""); setDocMemo("");
      loadDocs();
    } catch (err: any) {
      alert("업로드 실패: " + err.message);
    } finally {
      setUploading(false);
      (e.target as HTMLInputElement).value = "";
    }
  }

  async function deleteDoc(d: any) {
    if (!confirm(`"${d.title || d.file_name}" 문서를 삭제할까요?`)) return;
    if (d.file_path) {
      try { await supabase.storage.from("documents").remove([d.file_path]); } catch {}
    }
    // ✅ v3.25.0: Hard Delete
    await supabase.from("staff_documents").delete().eq("id", d.id);
    loadDocs();
  }

  const filteredDocs = filterCat === "all" ? docs : docs.filter(d => d.category === filterCat);
  const catCounts = STAFF_DOC_CATEGORIES.map(c => ({ ...c, count: docs.filter(d => d.category === c.k).length }));

  function humanSize(bytes: number) {
    if (!bytes) return "-";
    if (bytes < 1024) return bytes + "B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "KB";
    return (bytes / 1024 / 1024).toFixed(1) + "MB";
  }
  function isImage(m: string) { return m?.startsWith("image/"); }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-purple-50 to-blue-50">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow">
              <FolderOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="font-bold text-slate-900">{staff.name} 님의 문서 관리</div>
              <div className="text-xs text-gray-500">총 {docs.length}개 저장됨</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        {/* 업로드 영역 */}
        <div className="p-5 border-b border-gray-100 bg-slate-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-600 block mb-1">문서 종류 <span className="text-red-500">*</span></label>
              <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                {STAFF_DOC_CATEGORIES.map(c => (
                  <option key={c.k} value={c.k}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">문서 제목 (선택)</label>
              <input value={docTitle} onChange={e => setDocTitle(e.target.value)}
                placeholder="예: 2024 근로계약서"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600 block mb-1">메모 (선택)</label>
              <input value={docMemo} onChange={e => setDocMemo(e.target.value)}
                placeholder="추가 설명"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-br from-purple-600 to-blue-600 text-white rounded-xl shadow font-semibold hover:opacity-90 cursor-pointer">
            <Upload className="w-4 h-4" />
            {uploading ? "업로드 중..." : "파일 선택 (20MB 이하 · PDF/이미지/DOC/HWP)"}
            <input type="file" accept="image/*,application/pdf,.doc,.docx,.hwp" onChange={uploadDoc} disabled={uploading} className="hidden" />
          </label>
        </div>

        {/* 필터 */}
        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap gap-2">
          <button onClick={() => setFilterCat("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filterCat === "all" ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            전체 ({docs.length})
          </button>
          {catCounts.map(c => (
            <button key={c.k} onClick={() => setFilterCat(c.k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filterCat === c.k ? "bg-slate-800 text-white" : c.color + " hover:opacity-80"}`}>
              {c.label} ({c.count})
            </button>
          ))}
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">로딩 중...</div>
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Paperclip className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <div className="text-sm">업로드된 문서가 없습니다</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredDocs.map(d => (
                <div key={d.id} className="flex gap-3 p-3 border border-gray-200 rounded-xl hover:border-purple-300 hover:shadow-sm transition bg-white">
                  <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 flex items-center justify-center">
                    {isImage(d.mime_type) ? (
                      <img src={d.file_url} alt="" className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <FileText className="w-7 h-7 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${docCategoryColor(d.category)} font-semibold`}>
                          {docCategoryLabel(d.category)}
                        </span>
                        <div className="font-bold text-sm text-slate-900 mt-1 truncate">{d.title || d.file_name}</div>
                      </div>
                      <div className="flex gap-1">
                        <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg" title="열기">
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button onClick={() => deleteDoc(d)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="삭제">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      {humanSize(d.file_size)} · {new Date(d.created_at).toLocaleDateString("ko-KR")}
                    </div>
                    {d.memo && <div className="text-xs text-gray-600 mt-1 line-clamp-1">{d.memo}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
