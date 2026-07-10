"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Waves, Plus, X, Save, CreditCard, Calendar, DollarSign } from "lucide-react";

type Payment = {
  id: string;
  member_id: string;
  amount: number;
  method: string;
  paid_at: string;
  description: string;
  members?: { name: string; member_type: string };
};

type Membership = {
  id: string;
  member_id: string;
  plan_name: string;
  total_sessions: number;
  used_sessions: number;
  remaining: number;
  start_date: string;
  end_date: string;
  members?: { name: string; member_type: string };
};

const PLANS = [
  { name: "체험 1회권", sessions: 1, price: 70000 },
  { name: "10회권", sessions: 10, price: 550000 },
  { name: "20회권", sessions: 20, price: 1000000 },
  { name: "30회권", sessions: 30, price: 1350000 },
  { name: "월 정기권", sessions: 8, price: 400000 },
];

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"memberships" | "payments">("memberships");
  const [showModal, setShowModal] = useState(false);
  const [newPayment, setNewPayment] = useState<any>({
    member_id: "",
    plan_name: "10회권",
    amount: 550000,
    method: "card",
    paid_at: new Date().toISOString().slice(0, 10),
    description: "",
  });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [p, m, mem] = await Promise.all([
      supabase.from("payments").select("*, members(name, member_type)").order("paid_at", { ascending: false }),
      supabase.from("memberships").select("*, members(name, member_type)").order("end_date", { ascending: false }),
      supabase.from("members").select("id, name, member_type").is("deleted_at", null).order("name"),
    ]);
    setPayments((p.data as Payment[]) || []);
    setMemberships((m.data as Membership[]) || []);
    setMembers(mem.data || []);
    setLoading(false);
  }

  function selectPlan(planName: string) {
    const plan = PLANS.find((p) => p.name === planName);
    if (plan) setNewPayment({ ...newPayment, plan_name: planName, amount: plan.price });
  }

  async function addPayment() {
    if (!newPayment.member_id || !newPayment.amount) return;
    const { data: orgs } = await supabase.from("organizations").select("id").limit(1);
    const orgId = orgs?.[0]?.id;
    const plan = PLANS.find((p) => p.name === newPayment.plan_name);
    const sessions = plan?.sessions || 10;

    // 1) memberships에 회원권 추가
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + (sessions === 1 ? 30 : sessions * 15));
    const { data: newMembership } = await supabase.from("memberships").insert({
      org_id: orgId,
      member_id: newPayment.member_id,
      plan_name: newPayment.plan_name,
      total_sessions: sessions,
      used_sessions: 0,
      start_date: newPayment.paid_at,
      end_date: endDate.toISOString().slice(0, 10),
      price: newPayment.amount,
    }).select().single();

    // 2) payments에 결제 이력 추가
    await supabase.from("payments").insert({
      org_id: orgId,
      member_id: newPayment.member_id,
      membership_id: newMembership?.id,
      amount: newPayment.amount,
      method: newPayment.method,
      paid_at: newPayment.paid_at,
      description: newPayment.description || newPayment.plan_name,
    });

    setShowModal(false);
    setNewPayment({
      member_id: "",
      plan_name: "10회권",
      amount: 550000,
      method: "card",
      paid_at: new Date().toISOString().slice(0, 10),
      description: "",
    });
    loadAll();
  }

  async function deleteMembership(id: string) {
    if (!confirm("회원권을 삭제할까요?")) return;
    await supabase.from("memberships").delete().eq("id", id);
    loadAll();
  }

  async function deletePayment(id: string) {
    if (!confirm("결제 이력을 삭제할까요?")) return;
    await supabase.from("payments").delete().eq("id", id);
    loadAll();
  }

  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const thisMonthRevenue = payments
    .filter((p) => p.paid_at.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Waves className="w-8 h-8 text-aqu-600" />
          <h1 className="text-2xl md:text-3xl font-bold text-aqu-900">💳 결제 · 회원권</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowModal(true)}
            className="px-3 py-1.5 bg-aqu-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-aqu-700">
            <Plus className="w-4 h-4" /> 결제 등록
          </button>
          <Link href="/" className="text-sm text-aqu-600 hover:underline">← 홈</Link>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3 md:gap-4 mb-6">
        <div className="p-4 bg-white rounded-2xl shadow-md border border-aqu-100">
          <div className="text-xs text-gray-500">누적 매출</div>
          <div className="text-xl md:text-2xl font-bold text-aqu-900">₩{totalRevenue.toLocaleString()}</div>
        </div>
        <div className="p-4 bg-white rounded-2xl shadow-md border border-aqu-100">
          <div className="text-xs text-gray-500">이번달 매출</div>
          <div className="text-xl md:text-2xl font-bold text-green-600">₩{thisMonthRevenue.toLocaleString()}</div>
        </div>
        <div className="p-4 bg-white rounded-2xl shadow-md border border-aqu-100">
          <div className="text-xs text-gray-500">활성 회원권</div>
          <div className="text-xl md:text-2xl font-bold text-purple-600">
            {memberships.filter((m) => new Date(m.end_date) > new Date()).length}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab("memberships")}
          className={`px-4 py-2 rounded-lg text-sm ${tab === "memberships" ? "bg-aqu-600 text-white" : "bg-white border border-aqu-200"}`}>
          🎟️ 회원권 ({memberships.length})
        </button>
        <button onClick={() => setTab("payments")}
          className={`px-4 py-2 rounded-lg text-sm ${tab === "payments" ? "bg-aqu-600 text-white" : "bg-white border border-aqu-200"}`}>
          💵 결제 이력 ({payments.length})
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">불러오는 중…</div>
        ) : tab === "memberships" ? (
          memberships.length === 0 ? (
            <div className="p-10 text-center text-gray-400">아직 회원권이 없습니다. 결제 등록 버튼을 눌러 시작하세요!</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-aqu-50 text-aqu-900">
                  <tr>
                    <th className="text-left px-4 py-3">회원</th>
                    <th className="text-left px-4 py-3">회원권</th>
                    <th className="text-right px-4 py-3">진행</th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">시작일</th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">만료일</th>
                    <th className="text-center px-4 py-3">상태</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {memberships.map((m) => {
                    const expired = new Date(m.end_date) < new Date();
                    const remaining = m.total_sessions - m.used_sessions;
                    return (
                      <tr key={m.id} className="border-t border-aqu-100 hover:bg-aqu-50/30">
                        <td className="px-4 py-3 font-medium">{m.members?.name || "-"}</td>
                        <td className="px-4 py-3">{m.plan_name}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-aqu-700 font-medium">{m.used_sessions}</span>
                          <span className="text-gray-400"> / {m.total_sessions}</span>
                          <div className="text-xs text-gray-500">잔여 {remaining}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 hidden md:table-cell">{m.start_date}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 hidden md:table-cell">{m.end_date}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs ${expired ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                            {expired ? "만료" : "활성"}
                          </span>
                        </td>
                        <td className="px-2">
                          <button onClick={() => deleteMembership(m.id)} className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : payments.length === 0 ? (
          <div className="p-10 text-center text-gray-400">아직 결제 이력이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-aqu-50 text-aqu-900">
                <tr>
                  <th className="text-left px-4 py-3">일자</th>
                  <th className="text-left px-4 py-3">회원</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">내역</th>
                  <th className="text-right px-4 py-3">금액</th>
                  <th className="text-center px-4 py-3">방법</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-aqu-100 hover:bg-aqu-50/30">
                    <td className="px-4 py-3 text-xs">{p.paid_at}</td>
                    <td className="px-4 py-3 font-medium">{p.members?.name || "-"}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-600 text-xs">{p.description || "-"}</td>
                    <td className="px-4 py-3 text-right font-bold text-aqu-900">₩{p.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        p.method === "card" ? "bg-blue-100 text-blue-700"
                        : p.method === "cash" ? "bg-yellow-100 text-yellow-700"
                        : "bg-gray-100 text-gray-700"
                      }`}>
                        {p.method === "card" ? "카드" : p.method === "cash" ? "현금" : "이체"}
                      </span>
                    </td>
                    <td className="px-2">
                      <button onClick={() => deletePayment(p.id)} className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-aqu-900">💳 결제 등록</h3>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-600">회원 *</label>
                <select value={newPayment.member_id} onChange={(e) => setNewPayment({ ...newPayment, member_id: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm">
                  <option value="">-- 선택 --</option>
                  {members.map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.member_type === "child" ? "아동" : "성인"})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">회원권 종류</label>
                <select value={newPayment.plan_name} onChange={(e) => selectPlan(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm">
                  {PLANS.map((p) => (
                    <option key={p.name} value={p.name}>{p.name} ({p.sessions}회 · ₩{p.price.toLocaleString()})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">금액</label>
                <input type="number" value={newPayment.amount}
                  onChange={(e) => setNewPayment({ ...newPayment, amount: Number(e.target.value) })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-600">결제 방법</label>
                <div className="flex gap-2 mt-1">
                  {[
                    { k: "card", label: "카드" },
                    { k: "cash", label: "현금" },
                    { k: "transfer", label: "이체" },
                  ].map((m) => (
                    <button key={m.k} onClick={() => setNewPayment({ ...newPayment, method: m.k })}
                      className={`flex-1 py-2 rounded-lg text-sm ${newPayment.method === m.k ? "bg-aqu-500 text-white" : "bg-gray-100"}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600">결제일</label>
                <input type="date" value={newPayment.paid_at}
                  onChange={(e) => setNewPayment({ ...newPayment, paid_at: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-600">메모 (선택)</label>
                <input value={newPayment.description}
                  onChange={(e) => setNewPayment({ ...newPayment, description: e.target.value })}
                  placeholder="예: 2회차 재등록"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm" />
              </div>
              <button onClick={addPayment} disabled={!newPayment.member_id}
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
