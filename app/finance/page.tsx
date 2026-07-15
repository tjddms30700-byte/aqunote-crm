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
    const [e, p, pr] = await Promise.all([
      supabase.from("expenses").select("*").order("spent_at", { ascending: false }),
      supabase.from("payments").select("*"),
      supabase.from("payroll").select("*, staff(name)"),
    ]);
    setExpenses(e.data || []);
    setPayments(p.data || []);
    setPayroll(pr.data || []);
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
  const totalPayroll = monthPayroll.reduce((s, p) => s + p.net_amount, 0);
  const profit = revenue - totalExpense - totalPayroll;

  // 카테고리별 지출
  const byCategory: Record<string, number> = {};
  monthExpenses.forEach((e) => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Waves className="w-8 h-8 text-aqu-600" />
          <h1 className="text-2xl md:text-3xl font-bold text-aqu-900">💰 재무 관리</h1>
        </div>
        <HomeButton />
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
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
          <div className="text-xs text-gray-500">인건비</div>
          <div className="text-lg md:text-xl font-bold text-orange-600">₩{totalPayroll.toLocaleString()}</div>
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
