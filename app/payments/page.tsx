"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import {
  Waves, Plus, X, Save, CreditCard, Calendar, DollarSign, Home,
  Banknote, Building2, HelpCircle, Ticket, Clock, Hash, Trash2, Receipt
} from "lucide-react";

const METHODS = [
  { value: "cash",     label: "현금",   icon: Banknote,    color: "bg-green-100 text-green-700 border-green-300" },
  { value: "card",     label: "카드",   icon: CreditCard,  color: "bg-blue-100 text-blue-700 border-blue-300" },
  { value: "transfer", label: "계좌이체", icon: Building2, color: "bg-purple-100 text-purple-700 border-purple-300" },
  { value: "other",    label: "기타",   icon: HelpCircle,  color: "bg-gray-100 text-gray-700 border-gray-300" },
];
function methodLabel(m: string) { return METHODS.find(x => x.value === m)?.label || m; }
function methodColor(m: string) { return METHODS.find(x => x.value === m)?.color || "bg-gray-100"; }

const CARD_ISSUERS = ["신한", "삼성", "현대", "국민", "롯데", "하나", "비씨", "농협", "우리", "카카오뱅크", "토스", "기타"];

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// Format card number as 0000-0000-****-**** (first 4 + second 4 visible, last 8 masked)
function maskCardInput(v: string) {
  const digits = v.replace(/\D/g, "").slice(0, 16);
  const parts = [];
  for (let i = 0; i < digits.length; i += 4) parts.push(digits.slice(i, i + 4));
  return parts.join("-");
}
function toMaskedDisplay(raw: string) {
  // raw looks like '5432-1234-5678-9012' → '5432-1234-****-****'
  const parts = raw.split("-");
  if (parts.length < 2) return raw;
  const out = parts.map((p, i) => (i < 2 ? p : "*".repeat(p.length)));
  return out.join("-");
}

export default function PaymentsPage() {
  const [payments, setPayments]     = useState<any[]>([]);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [members, setMembers]       = useState<any[]>([]);
  const [plans, setPlans]           = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<"memberships" | "payments">("memberships");
  const [showModal, setShowModal]   = useState(false);
  const [saving, setSaving]         = useState(false);

  const [f, setF] = useState<any>({
    member_id: "",
    plan_id: "",
    plan_name: "",
    sessions: 10,
    valid_days: 90,
    amount: 0,
    method: "card",
    paid_at: todayStr(),
    paid_time: nowTime(),
    approval_no: "",
    card_number: "",
    card_issuer: "",
    installment: 0,
    receipt_no: "",
    memo: "",
  });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [p, m, mem, pl] = await Promise.all([
      supabase.from("payments").select("*, members(name, member_type), memberships(plan_name, total_sessions, used_sessions, adjustment, end_date)").order("paid_at", { ascending: false }),
      supabase.from("memberships").select("*, members(name, member_type)").order("end_date", { ascending: false }),
      supabase.from("members").select("id, name, member_type").is("deleted_at", null).order("name"),
      supabase.from("membership_plans").select("*").eq("is_active", true).order("sort_order"),
    ]);
    setPayments(p.data || []);
    setMemberships(m.data || []);
    setMembers(mem.data || []);
    setPlans(pl.data || []);
    setLoading(false);
  }

  function openModal() {
    setF({
      member_id: "",
      plan_id: "",
      plan_name: "",
      sessions: 10,
      valid_days: 90,
      amount: 0,
      method: "card",
      paid_at: todayStr(),
      paid_time: nowTime(),
      approval_no: "",
      card_number: "",
      card_issuer: "",
      installment: 0,
      receipt_no: "",
      memo: "",
    });
    setShowModal(true);
  }

  function selectPlan(planId: string) {
    const p = plans.find((x: any) => x.id === planId);
    if (!p) {
      setF({ ...f, plan_id: "", plan_name: "" });
      return;
    }
    setF({
      ...f,
      plan_id: p.id,
      plan_name: p.name,
      sessions: p.sessions,
      valid_days: p.valid_days,
      amount: p.price,
    });
  }

  async function savePayment() {
    if (!f.member_id) { alert("회원을 선택하세요"); return; }
    if (!f.plan_name) { alert("회원권을 선택하거나 이름을 입력하세요"); return; }
    if (!f.amount)    { alert("금액을 입력하세요"); return; }

    setSaving(true);
    try {
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;

      // 1) memberships에 회원권 추가
      const endDate = new Date(f.paid_at);
      endDate.setDate(endDate.getDate() + Number(f.valid_days || 60));
      const { data: newMembership, error: mErr } = await supabase.from("memberships").insert({
        org_id: orgId,
        member_id: f.member_id,
        plan_name: f.plan_name,
        total_sessions: Number(f.sessions),
        used_sessions: 0,
        start_date: f.paid_at,
        end_date: endDate.toISOString().slice(0, 10),
        price: Number(f.amount),
      }).select().single();
      if (mErr) throw mErr;

      // 2) payments에 결제 이력 추가 (결제수단 상세 포함)
      const payload: any = {
        org_id: orgId,
        member_id: f.member_id,
        membership_id: newMembership?.id,
        amount: Number(f.amount),
        method: f.method,
        paid_at: f.paid_at,
        paid_time: f.paid_time || null,
        description: f.plan_name,
        memo: f.memo || null,
      };
      if (f.method === "card") {
        payload.approval_no = f.approval_no || null;
        payload.card_number = f.card_number ? toMaskedDisplay(f.card_number) : null;
        payload.card_issuer = f.card_issuer || null;
        payload.installment = Number(f.installment || 0);
      }
      if (f.method === "cash") {
        payload.receipt_no = f.receipt_no || null;
      }

      const { error: pErr } = await supabase.from("payments").insert(payload);
      if (pErr) throw pErr;

      setShowModal(false);
      await loadAll();
      alert("✅ 결제 등록 완료");
    } catch (err: any) {
      alert("저장 실패: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteMembership(id: string) {
    if (!confirm("회원권을 삭제할까요?")) return;
    await supabase.from("memberships").delete().eq("id", id);
    loadAll();
  }

  // 회원권 회차 조정 (+/-)
  async function adjustSessions(m: any, delta: number) {
    const reason = prompt(
      `${m.members?.name || "회원"} 님의 "${m.plan_name}" ${delta > 0 ? "회차 추가" : "회차 차감"} 사유를 입력해 주세요 (선택)`,
      delta > 0 ? "이벤트 / 서비스" : "노쇼"
    );
    if (reason === null) return; // 취소

    const newAdjustment = (m.adjustment || 0) + delta;
    const { error } = await supabase.from("memberships").update({
      adjustment: newAdjustment,
      updated_at: new Date().toISOString(),
    }).eq("id", m.id);
    if (error) { alert("조정 실패: " + error.message + "\n\n💡 memberships 테이블에 adjustment 컬럼이 필요합니다. AQUNOTE_V37_FIX5.sql 실행 요량."); return; }

    // 조정 로그 저장
    try {
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      await supabase.from("session_adjustments").insert({
        org_id: orgId,
        membership_id: m.id,
        member_id: m.member_id,
        delta,
        reason: reason || null,
      });
    } catch {}
    loadAll();
  }

  async function deletePayment(id: string) {
    if (!confirm("결제 이력을 삭제할까요?")) return;
    await supabase.from("payments").delete().eq("id", id);
    loadAll();
  }

  const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const thisMonthRevenue = payments
    .filter((p) => (p.paid_at || "").startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const activeMemberships = memberships.filter((m) => m.end_date && new Date(m.end_date) > new Date()).length;

  return (
    <main className="max-w-6xl mx-auto px-3 md:px-6 py-6 md:py-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2 md:gap-3">
          <HomeButton />
          <span className="text-gray-300">/</span>
          <h1 className="text-xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 md:w-7 md:h-7 text-pink-500" /> 결제 · 회원권
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/plans"
            className="px-3 py-2 bg-white border border-aqu-200 text-aqu-700 rounded-lg text-xs md:text-sm hover:bg-aqu-50 flex items-center gap-1">
            <Ticket className="w-4 h-4" /> 회원권 관리
          </Link>
          <button onClick={openModal}
            className="px-3 py-2 bg-aqu-600 hover:bg-aqu-700 text-white rounded-lg text-xs md:text-sm flex items-center gap-1">
            <Plus className="w-4 h-4" /> 결제 등록
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-6">
        <KPI label="누적 매출" val={"₩" + totalRevenue.toLocaleString()} color="text-aqu-900" />
        <KPI label="이번달 매출" val={"₩" + thisMonthRevenue.toLocaleString()} color="text-green-600" />
        <KPI label="활성 회원권" val={activeMemberships + "건"} color="text-purple-600" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 text-xs md:text-sm">
        <button onClick={() => setTab("memberships")}
          className={`px-3 md:px-4 py-2 rounded-lg ${tab === "memberships" ? "bg-aqu-600 text-white" : "bg-white border border-aqu-200 text-aqu-700"}`}>
          🎟️ 회원권 ({memberships.length})
        </button>
        <button onClick={() => setTab("payments")}
          className={`px-3 md:px-4 py-2 rounded-lg ${tab === "payments" ? "bg-aqu-600 text-white" : "bg-white border border-aqu-200 text-aqu-700"}`}>
          💵 결제 이력 ({payments.length})
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
        {loading ? (
          <div className="text-center py-10 text-gray-500">로딩 중...</div>
        ) : tab === "memberships" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs md:text-sm">
              <thead className="bg-aqu-50 border-b border-aqu-100">
                <tr>
                  <th className="p-2 md:p-3 text-left font-semibold text-aqu-800">회원</th>
                  <th className="p-2 md:p-3 text-left font-semibold text-aqu-800">회원권</th>
                  <th className="p-2 md:p-3 text-center font-semibold text-aqu-800">잔여</th>
                  <th className="p-2 md:p-3 text-left font-semibold text-aqu-800 hidden md:table-cell">기간</th>
                  <th className="p-2 md:p-3 text-right font-semibold text-aqu-800">금액</th>
                  <th className="p-2 md:p-3"></th>
                </tr>
              </thead>
              <tbody>
                {memberships.map(m => {
                  const remaining = (m.total_sessions || 0) - (m.used_sessions || 0);
                  const expired = m.end_date && new Date(m.end_date) < new Date();
                  return (
                    <tr key={m.id} className={`border-b border-gray-100 ${expired ? "opacity-50" : ""} hover:bg-aqu-50/30`}>
                      <td className="p-2 md:p-3">
                        <Link href={`/members/${m.member_id}`} className="text-aqu-700 hover:underline font-medium">
                          {m.members?.name || "-"}
                        </Link>
                      </td>
                      <td className="p-2 md:p-3">{m.plan_name}</td>
                      <td className="p-2 md:p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => adjustSessions(m, -1)}
                            className="w-6 h-6 rounded bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center font-bold"
                            title="회차 차감">−</button>
                          <span className={`font-bold min-w-[70px] ${(remaining + (m.adjustment || 0)) <= 2 ? "text-red-500" : "text-aqu-700"}`}>
                            {remaining + (m.adjustment || 0)}/{(m.total_sessions || 0) + (m.adjustment || 0)}
                            {(m.adjustment || 0) !== 0 && (
                              <span className={`ml-1 text-[10px] ${(m.adjustment || 0) > 0 ? "text-green-600" : "text-orange-600"}`}>
                                ({(m.adjustment || 0) > 0 ? "+" : ""}{m.adjustment})
                              </span>
                            )}
                          </span>
                          <button onClick={() => adjustSessions(m, +1)}
                            className="w-6 h-6 rounded bg-green-50 text-green-600 hover:bg-green-100 flex items-center justify-center font-bold"
                            title="회차 추가">+</button>
                        </div>
                      </td>
                      <td className="p-2 md:p-3 hidden md:table-cell text-gray-500 text-[11px]">
                        {m.start_date} ~ {m.end_date}
                      </td>
                      <td className="p-2 md:p-3 text-right font-medium">₩{(m.price || 0).toLocaleString()}</td>
                      <td className="p-2 md:p-3">
                        <button onClick={() => deleteMembership(m.id)}
                          className="p-1.5 text-red-400 hover:bg-red-50 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs md:text-sm">
              <thead className="bg-aqu-50 border-b border-aqu-100">
                <tr>
                  <th className="p-2 md:p-3 text-left font-semibold text-aqu-800">일시</th>
                  <th className="p-2 md:p-3 text-left font-semibold text-aqu-800">회원</th>
                  <th className="p-2 md:p-3 text-left font-semibold text-aqu-800">회원권</th>
                  <th className="p-2 md:p-3 text-left font-semibold text-aqu-800">수단</th>
                  <th className="p-2 md:p-3 text-left font-semibold text-aqu-800 hidden md:table-cell">상세</th>
                  <th className="p-2 md:p-3 text-right font-semibold text-aqu-800">금액</th>
                  <th className="p-2 md:p-3"></th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-aqu-50/30">
                    <td className="p-2 md:p-3 text-gray-600 text-[11px] whitespace-nowrap">
                      {p.paid_at}
                      {p.paid_time && <div className="text-gray-400">{p.paid_time}</div>}
                    </td>
                    <td className="p-2 md:p-3">
                      <Link href={`/members/${p.member_id}`} className="text-aqu-700 hover:underline font-medium">
                        {p.members?.name || "-"}
                      </Link>
                    </td>
                    <td className="p-2 md:p-3">
                      <div className="font-semibold text-slate-800">{p.memberships?.plan_name || p.description || "-"}</div>
                      {p.memberships && (
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          {p.memberships.total_sessions}회권
                          {typeof p.memberships.used_sessions === "number" && (
                            <span className="ml-1 text-green-600">
                              (잔여 {Math.max(0, (p.memberships.total_sessions || 0) + (p.memberships.adjustment || 0) - (p.memberships.used_sessions || 0))}회)
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-2 md:p-3">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] border ${methodColor(p.method || "cash")}`}>
                        {methodLabel(p.method || "cash")}
                      </span>
                    </td>
                    <td className="p-2 md:p-3 hidden md:table-cell text-[11px] text-gray-500">
                      {p.method === "card" && (
                        <div>
                          {p.card_issuer && <span className="mr-1 font-medium text-gray-700">{p.card_issuer}</span>}
                          {p.card_number && <div className="font-mono">{p.card_number}</div>}
                          {p.approval_no && <div>승인 {p.approval_no}</div>}
                          {p.installment > 0 && <div>{p.installment}개월 할부</div>}
                        </div>
                      )}
                      {p.method === "cash" && p.receipt_no && <div>영수증 {p.receipt_no}</div>}
                      {p.memo && <div className="text-gray-400">{p.memo}</div>}
                    </td>
                    <td className="p-2 md:p-3 text-right font-bold text-aqu-900">
                      ₩{(p.amount || 0).toLocaleString()}
                    </td>
                    <td className="p-2 md:p-3">
                      <button onClick={() => deletePayment(p.id)}
                        className="p-1.5 text-red-400 hover:bg-red-50 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ Modal ═══ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3"
          onClick={() => !saving && setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 md:p-6 max-h-[95vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-aqu-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5" /> 결제 등록
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Member */}
            <Field label="회원 *">
              <select value={f.member_id} onChange={e => setF({ ...f, member_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
                <option value="">-- 회원 선택 --</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.member_type === "child" ? "아동" : "성인"})
                  </option>
                ))}
              </select>
            </Field>

            {/* Plan */}
            <Field label="회원권 선택">
              <select value={f.plan_id} onChange={e => selectPlan(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
                <option value="">-- 회원권 선택 (또는 직접입력) --</option>
                {plans.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.sessions === 0 ? "무제한" : p.sessions + "회"} · ₩{p.price.toLocaleString()}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-gray-500 mt-1">
                <Link href="/plans" className="text-aqu-600 hover:underline">회원권 관리</Link>에서 새 상품 추가 가능
              </div>
            </Field>

            <div className="grid grid-cols-3 gap-2">
              <Field label="이름">
                <input type="text" value={f.plan_name} onChange={e => setF({ ...f, plan_name: e.target.value })}
                  placeholder="10회권"
                  className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
              </Field>
              <Field label="횟수">
                <input type="number" value={f.sessions} onChange={e => setF({ ...f, sessions: parseInt(e.target.value) || 0 })}
                  className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
              </Field>
              <Field label="유효(일)">
                <input type="number" value={f.valid_days} onChange={e => setF({ ...f, valid_days: parseInt(e.target.value) || 60 })}
                  className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
              </Field>
            </div>

            <Field label="금액 (원) *">
              <input type="number" value={f.amount} onChange={e => setF({ ...f, amount: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="결제일 *">
                <input type="date" value={f.paid_at} onChange={e => setF({ ...f, paid_at: e.target.value })}
                  className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
              </Field>
              <Field label="결제시간">
                <input type="time" value={f.paid_time} onChange={e => setF({ ...f, paid_time: e.target.value })}
                  className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
              </Field>
            </div>

            {/* Payment method */}
            <div className="mt-3">
              <label className="block text-xs font-semibold text-gray-600 mb-1">결제 수단 *</label>
              <div className="grid grid-cols-4 gap-2">
                {METHODS.map(m => (
                  <button key={m.value} type="button" onClick={() => setF({ ...f, method: m.value })}
                    className={`py-2 px-1 rounded-lg border text-xs md:text-sm flex flex-col items-center gap-1 transition ${f.method === m.value ? m.color + " font-bold shadow-sm" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                    <m.icon className="w-4 h-4" />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* CARD-specific fields */}
            {f.method === "card" && (
              <div className="mt-3 p-3 bg-blue-50/50 border border-blue-100 rounded-xl space-y-2">
                <div className="text-xs font-bold text-blue-800 mb-1">💳 카드 결제 정보</div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="카드사">
                    <select value={f.card_issuer} onChange={e => setF({ ...f, card_issuer: e.target.value })}
                      className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
                      <option value="">-- 선택 --</option>
                      {CARD_ISSUERS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="할부">
                    <select value={f.installment} onChange={e => setF({ ...f, installment: parseInt(e.target.value) })}
                      className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
                      <option value={0}>일시불</option>
                      <option value={2}>2개월</option>
                      <option value={3}>3개월</option>
                      <option value={6}>6개월</option>
                      <option value={12}>12개월</option>
                    </select>
                  </Field>
                </div>
                <Field label="카드번호 (16자리)">
                  <input type="text" value={f.card_number}
                    onChange={e => setF({ ...f, card_number: maskCardInput(e.target.value) })}
                    placeholder="0000-0000-0000-0000"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
                  {f.card_number && (
                    <div className="text-[11px] text-gray-500 mt-1">
                      저장 시 마스킹: <span className="font-mono font-medium">{toMaskedDisplay(f.card_number)}</span>
                    </div>
                  )}
                </Field>
                <Field label="승인번호">
                  <input type="text" value={f.approval_no}
                    onChange={e => setF({ ...f, approval_no: e.target.value })}
                    placeholder="예: 12345678"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
                </Field>
              </div>
            )}

            {/* CASH-specific */}
            {f.method === "cash" && (
              <div className="mt-3 p-3 bg-green-50/50 border border-green-100 rounded-xl">
                <Field label="현금영수증 번호 (선택)">
                  <input type="text" value={f.receipt_no}
                    onChange={e => setF({ ...f, receipt_no: e.target.value })}
                    placeholder="예: 발급번호 또는 휴대폰번호"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
                </Field>
              </div>
            )}

            {/* Memo */}
            <Field label="메모 (선택)">
              <input type="text" value={f.memo} onChange={e => setF({ ...f, memo: e.target.value })}
                placeholder="예: 이벤트 할인, 형제 할인"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
            </Field>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)} disabled={saving}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                취소
              </button>
              <button onClick={savePayment} disabled={saving}
                className="flex-1 px-4 py-2 bg-aqu-600 text-white rounded-lg text-sm hover:bg-aqu-700 disabled:opacity-50 flex items-center justify-center gap-1">
                <Save className="w-4 h-4" /> {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function KPI({ label, val, color }: any) {
  return (
    <div className="bg-white p-3 md:p-4 rounded-2xl shadow-md border border-aqu-100">
      <div className="text-[10px] md:text-xs text-gray-500">{label}</div>
      <div className={`text-base md:text-2xl font-bold ${color}`}>{val}</div>
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <div className="mt-2">
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
