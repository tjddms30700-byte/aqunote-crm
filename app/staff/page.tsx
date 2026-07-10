"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Waves, Plus, X, Save, Users, DollarSign } from "lucide-react";

const ROLES = [
  { k: "director", label: "👑 원장" },
  { k: "coach", label: "🏊 코치" },
  { k: "admin", label: "📋 관리자" },
];

export default function StaffPage() {
  const [staff, setStaff] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"staff" | "payroll">("staff");
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [newStaff, setNewStaff] = useState<any>({
    name: "", email: "", phone: "", role: "coach",
    salary_type: "hourly", salary_amount: 0, address: "",
  });
  const [newPay, setNewPay] = useState<any>({
    staff_id: "", pay_month: new Date().toISOString().slice(0, 7),
    base_amount: 0, bonus: 0, deduction: 0,
    paid_at: new Date().toISOString().slice(0, 10), notes: "",
  });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [s, p] = await Promise.all([
      supabase.from("staff").select("*").order("created_at", { ascending: false }),
      supabase.from("payroll").select("*, staff(name, role)").order("pay_month", { ascending: false }),
    ]);
    setStaff(s.data || []);
    setPayroll(p.data || []);
    setLoading(false);
  }

  async function addStaff() {
    if (!newStaff.name) return;
    const { data: orgs } = await supabase.from("organizations").select("id").limit(1);
    const orgId = orgs?.[0]?.id;
    await supabase.from("staff").insert({
      org_id: orgId,
      name: newStaff.name,
      email: newStaff.email,
      phone: newStaff.phone,
      role: newStaff.role,
      salary_type: newStaff.salary_type,
      salary_amount: Number(newStaff.salary_amount),
      address: newStaff.address,
    });
    setShowStaffModal(false);
    setNewStaff({ name: "", email: "", phone: "", role: "coach", salary_type: "hourly", salary_amount: 0, address: "" });
    loadAll();
  }

  async function deleteStaff(id: string) {
    if (!confirm("직원을 삭제할까요?")) return;
    await supabase.from("staff").delete().eq("id", id);
    loadAll();
  }

  async function addPayroll() {
    if (!newPay.staff_id || !newPay.base_amount) return;
    const { data: orgs } = await supabase.from("organizations").select("id").limit(1);
    const orgId = orgs?.[0]?.id;
    const net = Number(newPay.base_amount) + Number(newPay.bonus) - Number(newPay.deduction);
    await supabase.from("payroll").insert({
      org_id: orgId,
      staff_id: newPay.staff_id,
      pay_month: newPay.pay_month,
      base_amount: Number(newPay.base_amount),
      bonus: Number(newPay.bonus),
      deduction: Number(newPay.deduction),
      net_amount: net,
      paid_at: newPay.paid_at,
      notes: newPay.notes,
    });
    setShowPayrollModal(false);
    setNewPay({
      staff_id: "", pay_month: new Date().toISOString().slice(0, 7),
      base_amount: 0, bonus: 0, deduction: 0,
      paid_at: new Date().toISOString().slice(0, 10), notes: "",
    });
    loadAll();
  }

  async function deletePayroll(id: string) {
    if (!confirm("급여 이력을 삭제할까요?")) return;
    await supabase.from("payroll").delete().eq("id", id);
    loadAll();
  }

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Waves className="w-8 h-8 text-aqu-600" />
          <h1 className="text-2xl md:text-3xl font-bold text-aqu-900">🧑‍💼 직원 · 급여</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => tab === "staff" ? setShowStaffModal(true) : setShowPayrollModal(true)}
            className="px-3 py-1.5 bg-aqu-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-aqu-700">
            <Plus className="w-4 h-4" /> {tab === "staff" ? "직원 추가" : "급여 등록"}
          </button>
          <Link href="/" className="text-sm text-aqu-600 hover:underline">← 홈</Link>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab("staff")}
          className={`px-4 py-2 rounded-lg text-sm ${tab === "staff" ? "bg-aqu-600 text-white" : "bg-white border border-aqu-200"}`}>
          👥 직원 ({staff.length})
        </button>
        <button onClick={() => setTab("payroll")}
          className={`px-4 py-2 rounded-lg text-sm ${tab === "payroll" ? "bg-aqu-600 text-white" : "bg-white border border-aqu-200"}`}>
          💰 급여 이력 ({payroll.length})
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">불러오는 중…</div>
        ) : tab === "staff" ? (
          staff.length === 0 ? (
            <div className="p-10 text-center text-gray-400">아직 등록된 직원이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-aqu-50 text-aqu-900">
                  <tr>
                    <th className="text-left px-4 py-3">이름</th>
                    <th className="text-left px-4 py-3">역할</th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">이메일</th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">연락처</th>
                    <th className="text-right px-4 py-3">급여</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.id} className="border-t border-aqu-100 hover:bg-aqu-50/30">
                      <td className="px-4 py-3 font-medium">{s.name}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs bg-aqu-100 text-aqu-700">
                          {ROLES.find((r) => r.k === s.role)?.label || s.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-600">{s.email || "-"}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-600">{s.phone || "-"}</td>
                      <td className="px-4 py-3 text-right">
                        {s.salary_amount ? (
                          <>
                            <div className="font-medium">₩{s.salary_amount.toLocaleString()}</div>
                            <div className="text-xs text-gray-500">{s.salary_type === "hourly" ? "/시간" : "/월"}</div>
                          </>
                        ) : "-"}
                      </td>
                      <td className="px-2">
                        <button onClick={() => deleteStaff(s.id)} className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : payroll.length === 0 ? (
          <div className="p-10 text-center text-gray-400">아직 급여 이력이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-aqu-50 text-aqu-900">
                <tr>
                  <th className="text-left px-4 py-3">지급월</th>
                  <th className="text-left px-4 py-3">직원</th>
                  <th className="text-right px-4 py-3 hidden md:table-cell">기본급</th>
                  <th className="text-right px-4 py-3 hidden md:table-cell">보너스</th>
                  <th className="text-right px-4 py-3 hidden md:table-cell">공제</th>
                  <th className="text-right px-4 py-3">실지급</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {payroll.map((p) => (
                  <tr key={p.id} className="border-t border-aqu-100 hover:bg-aqu-50/30">
                    <td className="px-4 py-3">{p.pay_month}</td>
                    <td className="px-4 py-3 font-medium">{p.staff?.name || "-"}</td>
                    <td className="px-4 py-3 text-right hidden md:table-cell text-xs">₩{p.base_amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right hidden md:table-cell text-xs text-green-600">+₩{p.bonus.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right hidden md:table-cell text-xs text-red-500">-₩{p.deduction.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-bold text-aqu-900">₩{p.net_amount.toLocaleString()}</td>
                    <td className="px-2">
                      <button onClick={() => deletePayroll(p.id)} className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Staff Modal */}
      {showStaffModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowStaffModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-aqu-900">🧑‍💼 직원 등록</h3>
              <button onClick={() => setShowStaffModal(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-3">
              <Field label="이름 *" value={newStaff.name} onChange={(v: string) => setNewStaff({ ...newStaff, name: v })} />
              <div>
                <label className="text-xs text-gray-600">역할</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {ROLES.map((r) => (
                    <button key={r.k} onClick={() => setNewStaff({ ...newStaff, role: r.k })}
                      className={`py-2 rounded-lg text-xs ${newStaff.role === r.k ? "bg-aqu-500 text-white" : "bg-gray-100"}`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="이메일" value={newStaff.email} onChange={(v: string) => setNewStaff({ ...newStaff, email: v })} />
              <Field label="전화번호" value={newStaff.phone} onChange={(v: string) => setNewStaff({ ...newStaff, phone: v })} />
              <Field label="주소" value={newStaff.address} onChange={(v: string) => setNewStaff({ ...newStaff, address: v })} />
              <div>
                <label className="text-xs text-gray-600">급여 구분</label>
                <div className="flex gap-2 mt-1">
                  <button onClick={() => setNewStaff({ ...newStaff, salary_type: "hourly" })}
                    className={`flex-1 py-2 rounded-lg text-sm ${newStaff.salary_type === "hourly" ? "bg-aqu-500 text-white" : "bg-gray-100"}`}>시급</button>
                  <button onClick={() => setNewStaff({ ...newStaff, salary_type: "monthly" })}
                    className={`flex-1 py-2 rounded-lg text-sm ${newStaff.salary_type === "monthly" ? "bg-aqu-500 text-white" : "bg-gray-100"}`}>월급</button>
                </div>
              </div>
              <Field label="금액" type="number" value={newStaff.salary_amount} onChange={(v: string) => setNewStaff({ ...newStaff, salary_amount: v })} />
              <button onClick={addStaff} disabled={!newStaff.name}
                className="w-full py-2.5 bg-aqu-600 text-white rounded-lg text-sm font-medium hover:bg-aqu-700 disabled:bg-gray-300">
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payroll Modal */}
      {showPayrollModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowPayrollModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-aqu-900">💰 급여 지급 등록</h3>
              <button onClick={() => setShowPayrollModal(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-600">직원 *</label>
                <select value={newPay.staff_id} onChange={(e) => setNewPay({ ...newPay, staff_id: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm">
                  <option value="">-- 선택 --</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <Field label="지급월" type="month" value={newPay.pay_month} onChange={(v: string) => setNewPay({ ...newPay, pay_month: v })} />
              <Field label="기본급 *" type="number" value={newPay.base_amount} onChange={(v: string) => setNewPay({ ...newPay, base_amount: v })} />
              <Field label="보너스" type="number" value={newPay.bonus} onChange={(v: string) => setNewPay({ ...newPay, bonus: v })} />
              <Field label="공제" type="number" value={newPay.deduction} onChange={(v: string) => setNewPay({ ...newPay, deduction: v })} />
              <div className="p-3 bg-aqu-50 rounded-lg text-sm">
                실지급액: <b>₩{(Number(newPay.base_amount) + Number(newPay.bonus) - Number(newPay.deduction)).toLocaleString()}</b>
              </div>
              <Field label="지급일" type="date" value={newPay.paid_at} onChange={(v: string) => setNewPay({ ...newPay, paid_at: v })} />
              <Field label="메모" value={newPay.notes} onChange={(v: string) => setNewPay({ ...newPay, notes: v })} />
              <button onClick={addPayroll} disabled={!newPay.staff_id || !newPay.base_amount}
                className="w-full py-2.5 bg-aqu-600 text-white rounded-lg text-sm font-medium hover:bg-aqu-700 disabled:bg-gray-300">
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({ label, value, onChange, type = "text" }: any) {
  return (
    <div>
      <label className="text-xs text-gray-600">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm" />
    </div>
  );
}
