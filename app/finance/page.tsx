"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { Waves, Plus, X, Save, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import DirectorOnly from "@/components/DirectorOnly";

const CATEGORIES = ["임대료", "수도광열", "소모품", "장비", "홍보", "세금·보험", "잡비"];

export default function FinancePageWrapper() {
  return <DirectorOnly><FinancePage /></DirectorOnly>;
}

function FinancePage() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any[]>([]);
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
  });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    // ✅ v3.20.6: schedule_slots + staff 추가 조회 (인건비 자동 산출용)
    const [e, p, pr, ss, st] = await Promise.all([
      supabase.from("expenses").select("*").order("spent_at", { ascending: false }),
      supabase.from("payments").select("*"),
      supabase.from("payroll").select("*, staff(name)"),
      supabase.from("schedule_slots").select("id, staff_id, event_type, event_date, status"),
      supabase.from("staff").select("id, name, salary_type, salary_amount, session_rate, is_resigned"),
    ]);
    setExpenses(e.data || []);
    setPayments(p.data || []);
    setPayroll(pr.data || []);
    setScheduleSlots(ss.data || []);
    setStaffList(st.data || []);
    setLoading(false);
  }

  async function addExpense() {
    if (!newExpense.amount) return;
    const { data: orgs } = await supabase.from("organizations").select("id").limit(1);
    const orgId = orgs?.[0]?.id;
    await supabase.from("expenses").insert({
      org_id: orgId,
      category: newExpense.category,
      amount: Number(newExpense.amount),
      spent_at: newExpense.spent_at,
      description: newExpense.description,
    });
    setShowModal(false);
    setNewExpense({ category: "임대료", amount: 0, spent_at: new Date().toISOString().slice(0, 10), description: "" });
    loadAll();
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

  const revenue = monthPayments.reduce((s, p) => s + Math.max(0, (p.amount || 0) - (p.refunded_amount || 0)), 0);
  const totalExpense = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const paidPayroll = monthPayroll.reduce((s, p) => s + (p.net_amount || 0), 0);

  // ✅ v3.20.6: 인건비 자동 계산 (완료된 수업·체험·보강 × 강사 회당 단가)
  const staffMap: Record<string, any> = {};
  staffList.forEach(s => { staffMap[s.id] = s; });

  const autoPayrollByStaff: Record<string, { name: string, done: number, unit: number, amount: number, monthlyAmount: number }> = {};
  const monthSlots = scheduleSlots.filter(s =>
    s.staff_id && s.event_date?.startsWith(selectedMonth) &&
    ["lesson", "trial", "makeup"].includes(s.event_type) &&
    ["done", "completed", "present"].includes(s.status)
  );
  monthSlots.forEach(s => {
    const st = staffMap[s.staff_id];
    if (!st || st.is_resigned) return;
    if (!autoPayrollByStaff[s.staff_id]) {
      const unit = st.salary_type === "session" ? (st.salary_amount || 0) : (st.session_rate || 30000);
      const monthlyAmount = st.salary_type === "monthly" ? (st.salary_amount || 0) : 0;
      autoPayrollByStaff[s.staff_id] = { name: st.name, done: 0, unit, amount: 0, monthlyAmount };
    }
    autoPayrollByStaff[s.staff_id].done += 1;
  });
  Object.values(autoPayrollByStaff).forEach(row => { row.amount = row.done * row.unit; });

  // 월급제 강사(이번 달 수업 유무와 무관하게 고정 지급) 추가 반영
  staffList.forEach(st => {
    if (st.is_resigned || st.salary_type !== "monthly") return;
    if (!autoPayrollByStaff[st.id]) {
      autoPayrollByStaff[st.id] = { name: st.name, done: 0, unit: 0, amount: 0, monthlyAmount: st.salary_amount || 0 };
    }
  });

  const totalAutoSession = Object.values(autoPayrollByStaff).reduce((sum, r) => sum + r.amount, 0);
  const totalAutoMonthly = Object.values(autoPayrollByStaff).reduce((sum, r) => sum + r.monthlyAmount, 0);
  const totalAutoPayroll = totalAutoSession + totalAutoMonthly;

  // 이미 지급된 인건비가 있으면 그것을, 없으면 자동계산 금액 사용
  const totalPayroll = paidPayroll > 0 ? paidPayroll : totalAutoPayroll;
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

      {/* Month selector + Add expense */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
          className="px-3 py-2 rounded-lg border border-aqu-200 text-sm" />
        <button onClick={() => setShowModal(true)}
          className="px-3 py-1.5 bg-aqu-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-aqu-700">
          <Plus className="w-4 h-4" /> 지출 등록
        </button>
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div className="p-4 bg-white rounded-2xl shadow-md border border-green-200">
          <TrendingUp className="w-6 h-6 text-green-500 mb-1" />
          <div className="text-xs text-gray-500">수입</div>
          <div className="text-lg md:text-xl font-bold text-green-600">₩{revenue.toLocaleString()}</div>
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
            {paidPayroll === 0 && totalAutoPayroll > 0 && (
              <span className="text-[9px] px-1 py-0.5 bg-amber-100 text-amber-700 rounded font-semibold">자동산출</span>
            )}
          </div>
          <div className="text-lg md:text-xl font-bold text-orange-600">₩{totalPayroll.toLocaleString()}</div>
          {paidPayroll === 0 && totalAutoPayroll > 0 && (
            <div className="text-[10px] text-amber-600 mt-1">
              수업 {monthSlots.length}회 × 단가 + 월급 {Object.values(autoPayrollByStaff).filter(r => r.monthlyAmount > 0).length}명
            </div>
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

      {/* ✅ v3.20.6: 인건비 자동 산출 상세 */}
      {Object.keys(autoPayrollByStaff).length > 0 && (
        <div className="bg-white rounded-2xl shadow-md border border-orange-100 overflow-hidden mb-4">
          <div className="p-4 border-b border-orange-100 flex items-center justify-between bg-gradient-to-r from-orange-50 to-amber-50">
            <h3 className="font-bold text-orange-900 flex items-center gap-1.5">
              👨‍⚕️ 인건비 자동 산출 ({selectedMonth})
              <span className="text-[10px] px-2 py-0.5 bg-white border border-orange-300 text-orange-700 rounded-full">
                수업 {monthSlots.length}회 · 강사 {Object.keys(autoPayrollByStaff).length}명
              </span>
            </h3>
            <Link href="/staff" className="text-xs text-orange-600 hover:underline">직원 관리 →</Link>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-orange-50/60 text-orange-900">
              <tr>
                <th className="text-left px-4 py-2 text-xs">강사</th>
                <th className="text-right px-4 py-2 text-xs">수업 완료</th>
                <th className="text-right px-4 py-2 text-xs">회당 단가</th>
                <th className="text-right px-4 py-2 text-xs">세션 수당</th>
                <th className="text-right px-4 py-2 text-xs">월급</th>
                <th className="text-right px-4 py-2 text-xs">예상 합계</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(autoPayrollByStaff).sort((a: any, b: any) => (b.amount + b.monthlyAmount) - (a.amount + a.monthlyAmount)).map((row: any, i: number) => (
                <tr key={i} className="border-t border-orange-100 hover:bg-orange-50/30">
                  <td className="px-4 py-2 font-medium text-slate-800">{row.name}</td>
                  <td className="px-4 py-2 text-right text-xs text-gray-600">{row.done}회</td>
                  <td className="px-4 py-2 text-right text-xs text-gray-600">₩{row.unit.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-xs text-orange-700">₩{row.amount.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-xs text-blue-700">{row.monthlyAmount > 0 ? `₩${row.monthlyAmount.toLocaleString()}` : "-"}</td>
                  <td className="px-4 py-2 text-right font-bold text-orange-800">₩{(row.amount + row.monthlyAmount).toLocaleString()}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-orange-300 bg-orange-50 font-bold">
                <td className="px-4 py-2 text-orange-900">합계</td>
                <td className="px-4 py-2 text-right text-xs text-orange-900">{monthSlots.length}회</td>
                <td className="px-4 py-2 text-right"></td>
                <td className="px-4 py-2 text-right text-orange-800">₩{totalAutoSession.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-blue-800">₩{totalAutoMonthly.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-orange-900">₩{totalAutoPayroll.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
          {paidPayroll > 0 && (
            <div className="p-3 bg-blue-50 border-t border-blue-200 text-[11px] text-blue-800">
              💡 <b>payroll 테이블에 이번달 지급 기록이 있어</b>, KPI는 실지급액(₩{paidPayroll.toLocaleString()})을 사용합니다. 이 표는 수업 데이터 기반 예상 상세입니다.
            </div>
          )}
        </div>
      )}

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
                <th className="text-left px-4 py-3 hidden md:table-cell">내역</th>
                <th className="text-right px-4 py-3">금액</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {monthExpenses.map((e) => (
                <tr key={e.id} className="border-t border-aqu-100 hover:bg-aqu-50/30">
                  <td className="px-4 py-3 text-xs">{e.spent_at}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-aqu-100 text-aqu-700 rounded text-xs">{e.category}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-600">{e.description || "-"}</td>
                  <td className="px-4 py-3 text-right font-medium text-red-600">₩{e.amount.toLocaleString()}</td>
                  <td className="px-2">
                    <button onClick={() => deleteExpense(e.id)} className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-6 text-sm">
        <Link href="/staff" className="text-aqu-600 hover:underline">→ 급여 관리로 이동</Link>
      </div>

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
