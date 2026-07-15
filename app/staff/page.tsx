"use client";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
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

  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [showResignModal, setShowResignModal] = useState(false);
  const [docsStaff, setDocsStaff] = useState<any>(null);  // 문서 관리 모달 대상 직원

  const [newStaff, setNewStaff] = useState<any>({
    name: "", email: "", phone: "", role: "therapist",
    salary_type: "monthly", salary_amount: 0, address: "",
    color: "#3b82f6", hire_date: "",
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

  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterStaffId, setFilterStaffId] = useState("");

  useEffect(() => { loadAll(); checkDirector(); }, []);

  async function checkDirector() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user?.email) { setIsDirector(true); return; } // 로그인 없으면 허용
    const { data: staffRow } = await supabase.from("staff").select("role").eq("email", userData.user.email).maybeSingle();
    setIsDirector(!staffRow || staffRow.role === "director");
  }

  async function loadAll() {
    setLoading(true);
    const [s, ph, al] = await Promise.all([
      supabase.from("staff").select("*").order("created_at", { ascending: false }),
      supabase.from("payroll_history").select("*").order("pay_year", { ascending: false }).order("pay_month", { ascending: false }),
      supabase.from("attendance_logs").select("*").order("work_date", { ascending: false }),
    ]);
    setStaff(s.data || []);
    setPayrollHistory(ph.data || []);
    setAttendanceLogs(al.data || []);
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
      role: newStaff.role,
      salary_type: newStaff.salary_type,
      salary_amount: Number(newStaff.salary_amount || 0),
      address: newStaff.address || null,
      color: newStaff.color || "#3b82f6",
      hire_date: newStaff.hire_date || null,
    };
    if (editStaff?.id) {
      const { error } = await supabase.from("staff").update(payload).eq("id", editStaff.id).select();
      if (error) return alert("수정 실패: " + error.message);
    } else {
      const { error } = await supabase.from("staff").insert(payload).select();
      if (error) return alert("추가 실패: " + error.message);
    }
    setShowStaffModal(false);
    setEditStaff(null);
    setNewStaff({ name: "", email: "", phone: "", role: "therapist", salary_type: "monthly", salary_amount: 0, address: "", color: "#3b82f6", hire_date: "" });
    loadAll();
  }

  function openEditStaff(s: any) {
    setEditStaff(s);
    setNewStaff({
      name: s.name || "", email: s.email || "", phone: s.phone || "",
      role: s.role || "therapist", salary_type: s.salary_type || "monthly",
      salary_amount: s.salary_amount || 0, address: s.address || "",
      color: s.color || "#3b82f6", hire_date: s.hire_date || "",
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
    const payload = {
      org_id: orgId,
      staff_id: newAtt.staff_id, staff_name: s?.name || null,
      work_date: newAtt.work_date,
      check_in: newAtt.check_in || null,
      check_out: newAtt.check_out || null,
      work_hours: hours, overtime,
      status: newAtt.status, memo: newAtt.memo || null,
    };
    if (editAtt?.id) {
      const { error } = await supabase.from("attendance_logs").update(payload).eq("id", editAtt.id).select();
      if (error) return alert("수정 실패: " + error.message);
    } else {
      const { error } = await supabase.from("attendance_logs").insert(payload).select();
      if (error) return alert("추가 실패: " + error.message);
    }
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
    <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
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
            <Field label="이름 *"><input value={newStaff.name} onChange={e => setNewStaff({ ...newStaff, name: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="이메일"><input value={newStaff.email} onChange={e => setNewStaff({ ...newStaff, email: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
              <Field label="전화번호"><input value={newStaff.phone} onChange={e => setNewStaff({ ...newStaff, phone: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="역할">
                <select value={newStaff.role} onChange={e => setNewStaff({ ...newStaff, role: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm">
                  {ROLES.map(r => <option key={r.k} value={r.k}>{r.label}</option>)}
                </select>
              </Field>
              <Field label="입사일"><input type="date" value={newStaff.hire_date} onChange={e => setNewStaff({ ...newStaff, hire_date: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="급여 형태">
                <select value={newStaff.salary_type} onChange={e => setNewStaff({ ...newStaff, salary_type: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm">
                  <option value="monthly">월급</option>
                  <option value="hourly">시급</option>
                  <option value="daily">일급</option>
                  <option value="freelance">프리랜서</option>
                </select>
              </Field>
              <Field label="급여 금액"><input type="number" value={newStaff.salary_amount} onChange={e => setNewStaff({ ...newStaff, salary_amount: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
            </div>
            <Field label="주소"><input value={newStaff.address} onChange={e => setNewStaff({ ...newStaff, address: e.target.value })} className="w-full p-2 border rounded-lg text-sm" /></Field>
            <Field label="색상">
              <div className="flex gap-1">
                {COLOR_PALETTE.map(c => (
                  <button key={c} type="button" onClick={() => setNewStaff({ ...newStaff, color: c })}
                    style={{ background: c }}
                    className={`w-8 h-8 rounded-full ${newStaff.color === c ? "ring-2 ring-offset-2 ring-aqu-500" : ""}`} />
                ))}
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

      {/* ─── 직원 문서 관리 모달 ─── */}
      {docsStaff && (
        <StaffDocumentsModal staff={docsStaff} orgId={docsStaff.org_id} onClose={() => setDocsStaff(null)} />
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
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
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
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `staff-docs/${staff.id}/${selectedCategory}_${Date.now()}_${safeName}`;

      const { error: upErr } = await supabase.storage.from("documents").upload(filePath, file, { upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("documents").getPublicUrl(filePath);

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
    await supabase.from("staff_documents").update({ deleted_at: new Date().toISOString() }).eq("id", d.id);
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
