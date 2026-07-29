"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { Waves, Plus, X, Save, TrendingUp, TrendingDown, DollarSign, Download } from "lucide-react";
import JSZip from "jszip";
import DirectorOnly from "@/components/DirectorOnly";

// ✅ v3.20.19: 수입 카테고리 (지원금·대출·기타)
const INCOME_CATEGORIES = [
  "정부 지원금",
  "지자체 지원금",
  "바우처 정산금",
  "대출금 수령",
  "이자 수익",
  "환급금",
  "세금 환급",
  "기부금 수령",
  "임대 수입",
  "기타 수입",
];

// ✅ v3.20.11: 지출 카테고리 추가 (마케팅, 식비, 교육비, 차량유지비, 복리후생, 법무비용, 경조사 등)
const CATEGORIES = [
  // 공과금
  "임대료", "관리비", "수도료", "전기료", "가스료", "난방비",
  "인터넷·통신비",
  // 수영장 특화
  "수영장 약품", "수영장 청소",
  "수영복·수영모", "상비약품", "참고서적·교구",
  // 장비 / 홍보 / 마케팅
  "장비 구매", "장비 수리", "마케팅",
  "오프라인 홍보", "SNS·온라인 광고",
  "이벤트·이벤트 경품",
  // 직원 / 복리후생
  "교육·연수", "교육비", "복리후생",
  "식대·회식", "식비", "경조사비",
  // 교통 / 차량
  "교통비", "주차비", "차량유지비", "유류비",
  // 세무 / 수수료 / 법무
  "세금", "종합소득세", "보험",
  "은행수수료·카드수수료",
  "세무·회계 수수료", "세무비", "법무비용",
  "외부용역", "자문비",
  // 기타
  "소모품", "사무용품", "인쇄비", "플랫폼 사용료",
  "기부금", "기타"
];

export default function FinancePageWrapper() {
  return <DirectorOnly><FinancePage /></DirectorOnly>;
}

function FinancePage() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any[]>([]);
  // ✅ v3.20.19: 수입(지원금·대출·기타)
  const [incomes, setIncomes] = useState<any[]>([]);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [newIncome, setNewIncome] = useState<any>({
    category: "정부 지원금",
    source: "",
    amount: 0,
    received_at: new Date().toISOString().slice(0, 10),
    description: "",
    is_loan: false,
    repayment_due: "",
    interest_rate: 0,
  });
  // ✅ v3.20.6: 인건비 자동 계산을 위한 schedule_slots + staff
  const [scheduleSlots, setScheduleSlots] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [newExpense, setNewExpense] = useState<any>({
    category: "임대료",
    amount: 0,
    spent_at: new Date().toISOString().slice(0, 10),
    description: "",
    payment_method: "CORPORATE_CARD", // v3.21.0: 법인 전환 대비 - 결제 수단
  });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    // ✅ v3.20.10: payroll 테이블 이름 자동 폴백 (payroll / payroll_history / staff_salaries)
    async function loadPayroll(): Promise<any[]> {
      // 직원 관리 페이지가 사용하는 payroll_history 테이블 우선 시도
      for (const tableName of ["payroll_history", "payroll", "staff_salaries"]) {
        const r1 = await supabase.from(tableName).select("*, staff(name)");
        if (!r1.error && r1.data) return r1.data.map((x: any) => normalizePayroll(x, tableName));
        // join 실패 시 조인 없이 재시도
        const r2 = await supabase.from(tableName).select("*");
        if (!r2.error && r2.data) return r2.data.map((x: any) => normalizePayroll(x, tableName));
      }
      return [];
    }
    // ✅ v3.20.11: 테이블별 컬럼명 정규화 + net_amount 자동 계산
    function normalizePayroll(row: any, tableName: string): any {
      const norm = { ...row };
      // payroll_history: pay_year + pay_month 분리 → "2026-07" 형식
      if (row.pay_year != null && row.pay_month != null) {
        norm.pay_month = `${row.pay_year}-${String(row.pay_month).padStart(2, "0")}`;
      } else if (row.pay_month != null && typeof row.pay_month === "number") {
        // pay_month만 있고 숫자이면 현재 연도 사용
        norm.pay_month = `${new Date().getFullYear()}-${String(row.pay_month).padStart(2, "0")}`;
      }
      // paid_amount이 있으면 net_amount 으로 사용
      if (row.paid_amount != null && (norm.net_amount == null || norm.net_amount === 0)) {
        norm.net_amount = Number(row.paid_amount);
      }
      if (row.total != null && norm.net_amount == null) norm.net_amount = Number(row.total);
      // ✅ net_amount가 여전히 없거나 0이면 자동 계산 (기본급 + 인센티브 + 보너스 − 공제)
      if (!norm.net_amount || norm.net_amount === 0) {
        const base = Number(row.base_salary || 0);
        const inc  = Number(row.incentive || 0);
        const bon  = Number(row.bonus || 0);
        const ded  = Number(row.deduction || 0);
        const calc = base + inc + bon - ded;
        if (calc > 0) norm.net_amount = calc;
      }
      return norm;
    }
    // ✅ v3.20.19: incomes 테이블 자동 폴백 (테이블 없으면 빈 배열)
    async function loadIncomes(): Promise<any[]> {
      const r = await supabase.from("incomes").select("*").order("received_at", { ascending: false });
      return r.error ? [] : (r.data || []);
    }
    const [e, p, pr, ss, st, inc] = await Promise.all([
      supabase.from("expenses").select("*").order("spent_at", { ascending: false }),
      supabase.from("payments").select("*"),
      loadPayroll(),
      supabase.from("schedule_slots").select("id, staff_id, event_type, event_date, status"),
      supabase.from("staff").select("id, name, salary_type, salary_amount, session_rate, is_resigned"),
      loadIncomes(),
    ]);
    setExpenses(e.data || []);
    setPayments(p.data || []);
    setPayroll(pr || []);
    setScheduleSlots(ss.data || []);
    setStaffList(st.data || []);
    setIncomes(inc || []);
    setLoading(false);
  }

  // ✅ v3.20.19: 수입 등록/삭제
  async function addIncome() {
    if (!newIncome.amount || Number(newIncome.amount) <= 0) return alert("금액을 입력해 주세요");
    const { data: orgs } = await supabase.from("organizations").select("id").limit(1);
    const orgId = orgs?.[0]?.id;
    const payload: any = {
      org_id: orgId,
      category: newIncome.category,
      source: newIncome.source || null,
      amount: Number(newIncome.amount),
      received_at: newIncome.received_at,
      description: newIncome.description || null,
      is_loan: newIncome.category === "대출금 수령" || !!newIncome.is_loan,
      repayment_due: newIncome.repayment_due || null,
      interest_rate: Number(newIncome.interest_rate) || 0,
    };
    // 자동 컴럼 폴백
    for (let i = 0; i < 6; i++) {
      const { error } = await supabase.from("incomes").insert(payload);
      if (!error) break;
      if (error.code === "42P01") {
        return alert("❌ incomes 테이블이 없습니다.\n\n💡 AQUNOTE_V32019_INCOMES.sql을 Supabase에서 먼저 실행해 주세요.");
      }
      const m = (error.message || "").match(/column "([^"]+)"/i);
      if (m?.[1] && m[1] in payload) { delete payload[m[1]]; continue; }
      return alert("수입 등록 실패: " + error.message);
    }
    setShowIncomeModal(false);
    setNewIncome({
      category: "정부 지원금", source: "", amount: 0,
      received_at: new Date().toISOString().slice(0, 10),
      description: "", is_loan: false, repayment_due: "", interest_rate: 0,
    });
    loadAll();
  }

  async function deleteIncome(id: string) {
    if (!confirm("수입 이력을 삭제할까요?")) return;
    await supabase.from("incomes").delete().eq("id", id);
    loadAll();
  }

  async function addExpense() {
    // v3.20.31: 지출등록 버그 근본 해결 - 필수값 검증 + 오류 안내 + 즉시 반영
    try {
      const amt = Number(newExpense?.amount || 0);
      if (!amt || amt <= 0) { alert("지출 금액을 입력해 주세요 (0원 불가)"); return; }
      if (!newExpense?.category) { alert("지출 카테고리를 선택해 주세요"); return; }
      if (!newExpense?.spent_at) { alert("지출일자를 선택해 주세요"); return; }

      const { data: orgs, error: orgErr } = await supabase.from("organizations").select("id").limit(1);
      if (orgErr) throw new Error("조직 정보 조회 실패: " + orgErr.message);
      const orgId = orgs?.[0]?.id;
      if (!orgId) { alert("조직(organizations) 정보가 없습니다. 설정 페이지에서 먼저 생성해 주세요."); return; }

      const payload: any = {
        org_id: orgId,
        category: newExpense.category,
        amount: amt,
        spent_at: newExpense.spent_at,
        description: newExpense.description || null,
        payment_method: newExpense.payment_method || "CORPORATE_CARD", // v3.21.0: 결제 수단
      };

      // v3.20.31: 지출 삽입 - 누락 컬럼 자동 폴백 (최대 5회)
      let tryPayload = { ...payload };
      let insertErr: any = null;
      let inserted: any = null;
      for (let i = 0; i < 5; i++) {
        const r = await supabase.from("expenses").insert(tryPayload).select().single();
        insertErr = r.error;
        inserted = r.data;
        if (!insertErr) break;
        const msg = String(insertErr.message || "");
        // RLS 이슈 명확화
        if (/row-level security|policy|permission denied/i.test(msg)) {
          throw new Error(`권한 오류(RLS): expenses 테이블 INSERT 정책을 추가해 주세요.\n\n상세: ${msg}`);
        }
        const m = /'([^']+)' column|column "([^"]+)"/.exec(msg);
        const missing = m?.[1] || m?.[2];
        if (missing && missing in tryPayload) {
          const { [missing]: _drop, ...rest } = tryPayload;
          tryPayload = { ...rest };
          continue;
        }
        // amount/spent_at이 아닌 관련 컬럼이 누락된 경우 대로(center_expenses 호환)
        if (/relation.*expenses.*does not exist/i.test(msg)) {
          const r2 = await supabase.from("center_expenses").insert(tryPayload).select().single();
          insertErr = r2.error;
          inserted = r2.data;
          if (!insertErr) break;
        }
        throw new Error(msg);
      }
      if (insertErr) throw insertErr;

      // v3.20.31: 즉시 UI 반영 - 상단 카드와 이력 목록 둥 자동 갱신
      if (inserted) {
        setExpenses((prev) => [inserted, ...prev]);
      }
      setShowModal(false);
      setNewExpense({ category: "임대료", amount: 0, spent_at: new Date().toISOString().slice(0, 10), description: "", payment_method: "CORPORATE_CARD" });
      alert(`✅ 지출이 등록되었습니다 (${amt.toLocaleString()}원)`);
      await loadAll();
    } catch (err: any) {
      alert("지출 등록 실패: " + (err?.message || err));
      console.error("addExpense error:", err);
    }
  }

  // v3.21.0: 세무사 제출용 월간 정산 패키지 ZIP 다운로드
  async function downloadMonthlyPackage() {
    try {
      const zip = new JSZip();
      const monthLabel = selectedMonth;
      const BOM = "\uFEFF"; // Excel 한글 CSV 인코딩 보증

      // 1) 수입 CSV
      const incomeRows = [["날짜", "카테고리", "지급기관", "금액", "메모"]];
      monthIncomes.forEach((i: any) => incomeRows.push([i.received_at || "", i.category || "", i.source || "", String(i.amount || 0), i.description || ""]));
      monthPayments.forEach((p: any) => incomeRows.push([p.paid_at || "", "회원 결제", p.member_name || "", String(p.amount || 0), p.method || ""]));
      zip.file(`01_수입_${monthLabel}.csv`, BOM + incomeRows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"));

      // 2) 지출 CSV (결제 수단 포함)
      const pmMap: any = { CORPORATE_CARD: "법인카드", PERSONAL_CARD: "개인카드", TRANSFER: "계좌이체", CASH: "현금" };
      const expRows = [["날짜", "카테고리", "결제수단", "금액", "메모"]];
      monthExpenses.forEach((e: any) => expRows.push([e.spent_at || "", e.category || "", pmMap[e.payment_method] || "—", String(e.amount || 0), e.description || ""]));
      zip.file(`02_지출_${monthLabel}.csv`, BOM + expRows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"));

      // 3) 급여 CSV
      const payRows = [["직원명", "지급월", "기본급", "수당", "공제", "실지급"]];
      monthPayroll.forEach((p: any) => payRows.push([p.staff_name || p.name || "", p.pay_month || "", String(p.base_salary || 0), String(p.bonus || 0), String(p.deduction || 0), String(p.net_pay || p.amount || 0)]));
      zip.file(`03_급여_${monthLabel}.csv`, BOM + payRows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"));

      // 4) 요약 리포트 (텍스트)
      const totalIncome = monthIncomes.reduce((s: number, i: any) => s + Number(i.amount || 0), 0) + monthPayments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      const totalExpense = monthExpenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
      const totalPayroll = monthPayroll.reduce((s: number, p: any) => s + Number(p.net_pay || p.amount || 0), 0);
      const corpCardExp = monthExpenses.filter((e: any) => e.payment_method === "CORPORATE_CARD").reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
      const summary = [
        `■ ${monthLabel} 세무사 제출용 월간 정산 요약서`,
        `생성일: ${new Date().toISOString().slice(0, 10)}`,
        `센터: 위례아쿠수중운동센터`,
        `────────────────────────────────────────`,
        `총 수입:   ₩${totalIncome.toLocaleString()}`,
        `총 지출:   ₩${totalExpense.toLocaleString()}`,
        `  └ 법인카드: ₩${corpCardExp.toLocaleString()}`,
        `총 급여:   ₩${totalPayroll.toLocaleString()}`,
        `순이익:     ₩${(totalIncome - totalExpense - totalPayroll).toLocaleString()}`,
        `────────────────────────────────────────`,
        `포함 파일: 01_수입.csv / 02_지출.csv / 03_급여.csv`,
      ].join("\n");
      zip.file(`00_요약_${monthLabel}.txt`, BOM + summary);

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `세무사제출_${monthLabel}_위례아쿠수중운동센터.zip`;
      a.click();
      URL.revokeObjectURL(url);
      alert(`✅ ${monthLabel} 정산 패키지가 다운로드되었습니다.`);
    } catch (err: any) {
      alert("정산 패키지 생성 실패: " + (err?.message || err));
      console.error("downloadMonthlyPackage error:", err);
    }
  }

  async function deleteExpense(id: string) {
    if (!confirm("지출 이력을 삭제할까요?")) return;
    await supabase.from("expenses").delete().eq("id", id);
    loadAll();
  }

  // 월별 필터 (취소 결제 제외, 부분 환불액 차감)
  const monthPayments = payments.filter((p) => p.status !== "cancelled" && p.paid_at?.startsWith(selectedMonth));
  const monthExpenses = expenses.filter((e) => e.spent_at?.startsWith(selectedMonth));
  const monthPayroll = payroll.filter((p) => p.pay_month === selectedMonth);
  // ✅ v3.20.19: 이번달 수입(지원금·대출·기타)
  const monthIncomes = incomes.filter((i: any) => i.received_at?.startsWith(selectedMonth));

  // 결제 매출
  const paymentRevenue = monthPayments.reduce((s, p) => s + Math.max(0, (p.amount || 0) - (p.refunded_amount || 0)), 0);
  // 기타 수입 (지원금·대출 등)
  const otherIncome = monthIncomes.reduce((s, i: any) => s + Number(i.amount || 0), 0);
  // 총 수입 = 결제 매출 + 기타 수입
  const revenue = paymentRevenue + otherIncome;
  const totalExpense = monthExpenses.reduce((s, e) => s + e.amount, 0);

  // ✅ v3.20.8: 인건비 = payroll(세무사 입력 지급 이력) 기준으로만 계산
  // - 기본급(base_salary) + 인센티브(incentive) + 보너스(bonus) - 공제(deduction) = 실지급(net_amount)
  // - payroll 테이블 컴럼명이 달라도 통시 프로젠시발리 보기 위해 명시 변환
  const staffMap: Record<string, any> = {};
  staffList.forEach(s => { staffMap[s.id] = s; });

  // 강사별 지급 상세 (payroll 기반)
  const paidByStaff: Record<string, {
    name: string, base: number, incentive: number, bonus: number, deduction: number, net: number, paid_date: string | null
  }> = {};
  monthPayroll.forEach((p: any) => {
    const st = staffMap[p.staff_id];
    const name = p.staff?.name || st?.name || "미지정";
    if (!paidByStaff[p.staff_id]) {
      paidByStaff[p.staff_id] = { name, base: 0, incentive: 0, bonus: 0, deduction: 0, net: 0, paid_date: null };
    }
    const row = paidByStaff[p.staff_id];
    row.base      += Number(p.base_salary || 0);
    row.incentive += Number(p.incentive   || 0);
    row.bonus     += Number(p.bonus       || 0);
    row.deduction += Number(p.deduction   || 0);
    row.net       += Number(p.net_amount  || 0);
    if (p.paid_date && (!row.paid_date || row.paid_date < p.paid_date)) row.paid_date = p.paid_date;
  });

  const paidPayroll   = monthPayroll.reduce((s, p) => s + (p.net_amount || 0), 0);
  const totalBase      = Object.values(paidByStaff).reduce((s, r) => s + r.base, 0);
  const totalIncentive = Object.values(paidByStaff).reduce((s, r) => s + r.incentive, 0);
  const totalBonus     = Object.values(paidByStaff).reduce((s, r) => s + r.bonus, 0);
  const totalDeduction = Object.values(paidByStaff).reduce((s, r) => s + r.deduction, 0);

  // ✅ v3.20.8: 인건비는 payroll에 입력된 것만 계산 (수업 수 프리뷰 제거)
  const totalPayroll = paidPayroll;
  const profit = revenue - totalExpense - totalPayroll;

  // 카테고리별 지출
  const byCategory: Record<string, number> = {};
  monthExpenses.forEach((e) => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Waves className="w-8 h-8 text-aqu-600" />
          <h1 className="text-2xl md:text-3xl font-bold text-aqu-900">💰 재무 관리 · 자동 정산</h1>
        </div>
        <HomeButton />
      </div>

      {/* ✅ v3.18.0: 정기 결제 · 강사 수당 바로가기 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
        <Link href="/renewals" className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-lg p-3 hover:shadow-md hover:border-blue-400 transition group">
          <div className="text-[10px] text-blue-600 font-semibold">🔄 정기 결제</div>
          <div className="text-xs md:text-sm font-bold text-slate-800 mt-1">자동갱신 · 만료임박</div>
          <div className="text-[10px] text-gray-500 mt-0.5 group-hover:text-blue-600">→</div>
        </Link>
        <Link href="/staff" className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-3 hover:shadow-md hover:border-indigo-400 transition group">
          <div className="text-[10px] text-indigo-600 font-semibold">👨‍⚕️ 강사 수당</div>
          <div className="text-xs md:text-sm font-bold text-slate-800 mt-1">자동 계산 · 지급 내역</div>
          <div className="text-[10px] text-gray-500 mt-0.5 group-hover:text-indigo-600">→</div>
        </Link>
        <Link href="/dashboard/revenue" className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-3 hover:shadow-md hover:border-emerald-400 transition group">
          <div className="text-[10px] text-emerald-600 font-semibold">📈 매출 통계</div>
          <div className="text-xs md:text-sm font-bold text-slate-800 mt-1">수익 · 상세 보기</div>
          <div className="text-[10px] text-gray-500 mt-0.5 group-hover:text-emerald-600">→</div>
        </Link>
      </div>

      {/* Month selector + Add income/expense */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
          className="px-3 py-2 rounded-lg border border-aqu-200 text-sm" />
        <div className="flex flex-wrap gap-2">
          {/* v3.21.0: 세무사 제출용 월간 정산 패키지 ZIP 다운로드 */}
          <button onClick={downloadMonthlyPackage}
            className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-slate-900 shadow-sm">
            <Download className="w-4 h-4" /> 📥 세무사 제출용 월간 정산 패키지(ZIP)
          </button>
          {/* ✅ v3.20.19: 수입(지원금·대출·기타) 등록 */}
          <button onClick={() => setShowIncomeModal(true)}
            className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-emerald-700">
            <TrendingUp className="w-4 h-4" /> 수입 등록
          </button>
          <button onClick={() => setShowModal(true)}
            className="px-3 py-1.5 bg-aqu-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-aqu-700">
            <Plus className="w-4 h-4" /> 지출 등록
          </button>
        </div>
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div className="p-4 bg-white rounded-2xl shadow-md border border-green-200">
          <TrendingUp className="w-6 h-6 text-green-500 mb-1" />
          <div className="text-xs text-gray-500 flex items-center gap-1">
            총 수입
            <span className="text-[9px] px-1 py-0.5 bg-emerald-100 text-emerald-700 rounded font-semibold">자동집계</span>
          </div>
          <div className="text-lg md:text-xl font-bold text-green-600">₩{revenue.toLocaleString()}</div>
          <div className="text-[10px] text-gray-500 mt-1">
            결제 ₩{paymentRevenue.toLocaleString()}
            {otherIncome > 0 && <> · 기타 ₩{otherIncome.toLocaleString()}</>}
          </div>
        </div>
        <div className="p-4 bg-white rounded-2xl shadow-md border border-red-200">
          <TrendingDown className="w-6 h-6 text-red-500 mb-1" />
          <div className="text-xs text-gray-500">운영비</div>
          <div className="text-lg md:text-xl font-bold text-red-600">₩{totalExpense.toLocaleString()}</div>
        </div>
        <div className="p-4 bg-white rounded-2xl shadow-md border border-orange-200">
          <TrendingDown className="w-6 h-6 text-orange-500 mb-1" />
          <div className="text-xs text-gray-500 flex items-center gap-1">
            인건비
            <span className="text-[9px] px-1 py-0.5 bg-blue-100 text-blue-700 rounded font-semibold">급여이력 기반</span>
          </div>
          <div className="text-lg md:text-xl font-bold text-orange-600">₩{totalPayroll.toLocaleString()}</div>
          {monthPayroll.length > 0 ? (
            <div className="text-[10px] text-gray-500 mt-1">
              직원 {Object.keys(paidByStaff).length}명 · 인센티브 ₩{totalIncentive.toLocaleString()}
            </div>
          ) : (
            <div className="text-[10px] text-gray-400 mt-1">급여 지급 이력 없음</div>
          )}
        </div>
        <div className={`p-4 bg-white rounded-2xl shadow-md border ${profit >= 0 ? "border-aqu-200" : "border-red-300"}`}>
          <DollarSign className={`w-6 h-6 ${profit >= 0 ? "text-aqu-500" : "text-red-500"} mb-1`} />
          <div className="text-xs text-gray-500">순이익</div>
          <div className={`text-lg md:text-xl font-bold ${profit >= 0 ? "text-aqu-700" : "text-red-600"}`}>
            ₩{profit.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      {Object.keys(byCategory).length > 0 && (
        <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-4 mb-6">
          <h3 className="font-bold text-aqu-900 mb-3">📊 카테고리별 지출</h3>
          <div className="space-y-2">
            {Object.entries(byCategory).sort(([, a], [, b]) => (b as number) - (a as number)).map(([cat, amt]) => (
              <div key={cat} className="flex items-center gap-2">
                <span className="w-20 text-sm text-gray-700">{cat}</span>
                <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full bg-aqu-400 flex items-center justify-end pr-2 text-xs text-white font-medium"
                    style={{ width: `${Math.min(100, (amt / totalExpense) * 100)}%` }}>
                    {((amt / totalExpense) * 100).toFixed(0)}%
                  </div>
                </div>
                <span className="w-24 text-right text-sm font-medium">₩{(amt as number).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ✅ v3.20.8: 인건비 = payroll(세무사 입력 지급 이력) 기반으로만 계산 */}
      {monthPayroll.length > 0 ? (
        <div className="bg-white rounded-2xl shadow-md border border-orange-100 overflow-hidden mb-4">
          <div className="p-4 border-b border-orange-100 flex items-center justify-between bg-gradient-to-r from-orange-50 to-amber-50">
            <h3 className="font-bold text-orange-900 flex items-center gap-1.5">
              👨‍⚕️ 급여 지급 내역 ({selectedMonth})
              <span className="text-[10px] px-2 py-0.5 bg-white border border-orange-300 text-orange-700 rounded-full">
                직원 {Object.keys(paidByStaff).length}명 · 지급 {monthPayroll.length}건
              </span>
            </h3>
            <Link href="/staff" className="text-xs text-orange-600 hover:underline">직원 관리 →</Link>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-orange-50/60 text-orange-900">
              <tr>
                <th className="text-left px-4 py-2 text-xs">직원</th>
                <th className="text-right px-4 py-2 text-xs">기본급</th>
                <th className="text-right px-4 py-2 text-xs">인센티브</th>
                <th className="text-right px-4 py-2 text-xs">보너스</th>
                <th className="text-right px-4 py-2 text-xs">공제</th>
                <th className="text-right px-4 py-2 text-xs">실지급</th>
                <th className="text-right px-4 py-2 text-xs">지급일</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(paidByStaff).sort((a: any, b: any) => b.net - a.net).map((row: any, i: number) => (
                <tr key={i} className="border-t border-orange-100 hover:bg-orange-50/30">
                  <td className="px-4 py-2 font-medium text-slate-800">{row.name}</td>
                  <td className="px-4 py-2 text-right text-xs text-gray-700">₩{row.base.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-xs text-emerald-700">{row.incentive > 0 ? `₩${row.incentive.toLocaleString()}` : "-"}</td>
                  <td className="px-4 py-2 text-right text-xs text-blue-700">{row.bonus > 0 ? `₩${row.bonus.toLocaleString()}` : "-"}</td>
                  <td className="px-4 py-2 text-right text-xs text-red-600">{row.deduction > 0 ? `-₩${row.deduction.toLocaleString()}` : "-"}</td>
                  <td className="px-4 py-2 text-right font-bold text-orange-800">₩{row.net.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-[10px] text-gray-500">{row.paid_date || "-"}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-orange-300 bg-orange-50 font-bold">
                <td className="px-4 py-2 text-orange-900">합계</td>
                <td className="px-4 py-2 text-right text-gray-800">₩{totalBase.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-emerald-800">₩{totalIncentive.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-blue-800">₩{totalBonus.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-red-700">-₩{totalDeduction.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-orange-900">₩{totalPayroll.toLocaleString()}</td>
                <td className="px-4 py-2"></td>
              </tr>
            </tbody>
          </table>
          <div className="p-3 bg-blue-50 border-t border-blue-200 text-[11px] text-blue-800">
            💡 <b>세무사가 입력한 급여 지급 이력(payroll)을 기준으로 자동 집계</b>합니다. 인센티브·보너스·공제 모두 자동으로 반영되어 순이익이 계산됩니다.
          </div>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-800 text-sm">
            <DollarSign className="w-4 h-4" />
            <span><b>{selectedMonth}</b> 급여 지급 이력이 아직 없습니다. 세무사 입력 후 자동으로 반영됩니다.</span>
          </div>
          <Link href="/staff?tab=payroll" className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold">
            + 급여 등록
          </Link>
        </div>
      )}

      {/* ✅ v3.20.19: 이번달 수입 이력 (지원금·대출·기타) */}
      <div className="bg-white rounded-2xl shadow-md border border-emerald-100 overflow-hidden mb-4">
        <div className="p-4 border-b border-emerald-100 flex items-center justify-between bg-emerald-50/40">
          <h3 className="font-bold text-emerald-900">💰 이번달 수입 이력 ({monthIncomes.length}건) · ₩{otherIncome.toLocaleString()}</h3>
          <button onClick={() => setShowIncomeModal(true)}
            className="text-xs px-2 py-1 bg-emerald-500 text-white rounded hover:bg-emerald-600 flex items-center gap-1">
            <Plus className="w-3 h-3" /> 수입 추가
          </button>
        </div>
        {loading ? (
          <div className="p-6 text-center text-gray-400 text-xs">불러오는 중…</div>
        ) : monthIncomes.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-xs">이번달 수입 이력이 없습니다. 지원금·대출·기타 수입을 등록하세요.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-emerald-50 text-emerald-900">
              <tr>
                <th className="text-left px-4 py-2 text-xs">수령일</th>
                <th className="text-left px-4 py-2 text-xs">카테고리</th>
                <th className="text-left px-4 py-2 text-xs hidden md:table-cell">지급기관</th>
                <th className="text-left px-4 py-2 text-xs hidden md:table-cell">내역</th>
                <th className="text-right px-4 py-2 text-xs">금액</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {monthIncomes.map((i: any) => (
                <tr key={i.id} className="border-t border-emerald-50 hover:bg-emerald-50/20">
                  <td className="px-4 py-2 text-xs">{i.received_at}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">{i.category}</span>
                    {i.is_loan && <span className="ml-1 text-[9px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-bold">대출</span>}
                  </td>
                  <td className="px-4 py-2 hidden md:table-cell text-xs text-gray-700">{i.source || "-"}</td>
                  <td className="px-4 py-2 hidden md:table-cell text-xs text-gray-600">
                    {i.description || "-"}
                    {i.is_loan && i.repayment_due && (
                      <div className="text-[10px] text-orange-600 mt-0.5">⏰ 상환예정: {i.repayment_due}{i.interest_rate ? ` · 이자 ${i.interest_rate}%` : ""}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-emerald-700">+₩{Number(i.amount).toLocaleString()}</td>
                  <td className="px-2">
                    <button onClick={() => deleteIncome(i.id)} className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent expenses */}
      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
        <div className="p-4 border-b border-aqu-100">
          <h3 className="font-bold text-aqu-900">🧾 이번달 지출 이력 ({monthExpenses.length}건)</h3>
        </div>
        {loading ? (
          <div className="p-10 text-center text-gray-400">불러오는 중…</div>
        ) : monthExpenses.length === 0 ? (
          <div className="p-10 text-center text-gray-400">이번달 지출이 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-aqu-50 text-aqu-900">
              <tr>
                <th className="text-left px-4 py-3">일자</th>
                <th className="text-left px-4 py-3">카테고리</th>
                <th className="text-left px-4 py-3">결제수단</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">내역</th>
                <th className="text-right px-4 py-3">금액</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {monthExpenses.map((e) => {
                // v3.21.0: 결제 수단 배지 매핑
                const pmMap: any = {
                  CORPORATE_CARD: { label: "🏦 법인카드", cls: "bg-blue-50 text-blue-700 border-blue-200" },
                  PERSONAL_CARD:  { label: "👤 개인카드", cls: "bg-purple-50 text-purple-700 border-purple-200" },
                  TRANSFER:       { label: "💸 계좌이체", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                  CASH:           { label: "💵 현금", cls: "bg-amber-50 text-amber-700 border-amber-200" },
                };
                const pm = pmMap[e.payment_method] || { label: "—", cls: "bg-slate-50 text-slate-500 border-slate-200" };
                return (
                  <tr key={e.id} className="border-t border-aqu-100 hover:bg-aqu-50/30">
                    <td className="px-4 py-3 text-xs">{e.spent_at}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-aqu-100 text-aqu-700 rounded text-xs">{e.category}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] border font-semibold ${pm.cls}`}>{pm.label}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-600">{e.description || "-"}</td>
                    <td className="px-4 py-3 text-right font-medium text-red-600">₩{e.amount.toLocaleString()}</td>
                    <td className="px-2">
                      <button onClick={() => deleteExpense(e.id)} className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-6 text-sm">
        <Link href="/staff" className="text-aqu-600 hover:underline">→ 급여 관리로 이동</Link>
      </div>

      {/* ✅ v3.20.19: 수입 등록 모달 */}
      {showIncomeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowIncomeModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-emerald-800">💰 수입 등록</h3>
              <button onClick={() => setShowIncomeModal(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">카테고리 *</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {INCOME_CATEGORIES.map((c) => (
                    <button key={c} onClick={() => setNewIncome({ ...newIncome, category: c, is_loan: c === "대출금 수령" })}
                      className={`px-3 py-1.5 rounded-full text-xs ${newIncome.category === c ? "bg-emerald-500 text-white" : "bg-gray-100"}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">지급기관 / 지급처</label>
                <input value={newIncome.source}
                  onChange={(e) => setNewIncome({ ...newIncome, source: e.target.value })}
                  placeholder="예: 하남시청, 국민은행, 가족 등"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-gray-600">금액 (원) *</label>
                  <input type="number" value={newIncome.amount} step={10000}
                    onChange={(e) => setNewIncome({ ...newIncome, amount: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-right" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">수령일</label>
                  <input type="date" value={newIncome.received_at}
                    onChange={(e) => setNewIncome({ ...newIncome, received_at: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">내역 / 메모</label>
                <input value={newIncome.description}
                  onChange={(e) => setNewIncome({ ...newIncome, description: e.target.value })}
                  placeholder="예: 소상공인 임대료 지원, 창업자금 대출"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              </div>

              {/* 대출 선택 시 상환일·이자율 */}
              {(newIncome.category === "대출금 수령" || newIncome.is_loan) && (
                <div className="border-2 border-orange-100 bg-orange-50/40 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-bold text-orange-800">🏦 대출 정보</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-600">상환 예정일</label>
                      <input type="date" value={newIncome.repayment_due}
                        onChange={(e) => setNewIncome({ ...newIncome, repayment_due: e.target.value })}
                        className="w-full mt-1 px-2 py-1.5 rounded border border-gray-200 text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-600">이자율 (%)</label>
                      <input type="number" value={newIncome.interest_rate} step={0.1}
                        onChange={(e) => setNewIncome({ ...newIncome, interest_rate: e.target.value })}
                        className="w-full mt-1 px-2 py-1.5 rounded border border-gray-200 text-sm text-right" />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowIncomeModal(false)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={addIncome}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-1">
                <Save className="w-4 h-4" /> 수입 등록
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-aqu-900">📤 지출 등록</h3>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-600">카테고리</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {CATEGORIES.map((c) => (
                    <button key={c} onClick={() => setNewExpense({ ...newExpense, category: c })}
                      className={`px-3 py-1.5 rounded-full text-xs ${newExpense.category === c ? "bg-aqu-500 text-white" : "bg-gray-100"}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600">금액 *</label>
                <input type="number" value={newExpense.amount}
                  onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm" placeholder="500000" />
              </div>
              <div>
                <label className="text-xs text-gray-600">지출일</label>
                <input type="date" value={newExpense.spent_at}
                  onChange={(e) => setNewExpense({ ...newExpense, spent_at: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm" />
              </div>
              {/* v3.21.0: 법인 전환 대비 - 결제 수단 선택 */}
              <div>
                <label className="text-xs text-gray-600 font-semibold">💳 결제 수단 *</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {[
                    { v: "CORPORATE_CARD", label: "🏦 법인카드", cls: "bg-blue-500" },
                    { v: "PERSONAL_CARD",  label: "👤 개인카드·현금영수증", cls: "bg-purple-500" },
                    { v: "TRANSFER",       label: "💸 계좌이체", cls: "bg-emerald-500" },
                    { v: "CASH",           label: "💵 현금", cls: "bg-amber-500" },
                  ].map((pm) => (
                    <button key={pm.v} type="button" onClick={() => setNewExpense({ ...newExpense, payment_method: pm.v })}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold ${newExpense.payment_method === pm.v ? `${pm.cls} text-white` : "bg-gray-100 text-gray-700"}`}>
                      {pm.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600">메모</label>
                <input value={newExpense.description}
                  onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm"
                  placeholder="예: 7월 임대료" />
              </div>
              <button onClick={addExpense} disabled={!newExpense.amount}
                className="w-full py-2.5 bg-aqu-600 text-white rounded-lg text-sm font-medium hover:bg-aqu-700 disabled:bg-gray-300 flex items-center justify-center gap-1">
                <Save className="w-4 h-4" /> 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
