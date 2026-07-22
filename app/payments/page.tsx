"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
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
  const [refundModal, setRefundModal] = useState<any>(null);  // 환불 모달 대상 회원권

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
    // v3.8: 여러 수단 분할 결제
    pay_card: 0,
    pay_cash: 0,
    pay_transfer: 0,
    pay_other: 0,
    pay_other_label: "",
    unpaid: 0,
    discount: 0,
  });

  useEffect(() => { loadAll(); }, []);

  // URL 쿼리 파라미터 또는 sessionStorage 플래그로 등록 모달 자동 오픈
  useEffect(() => {
    if (typeof window === "undefined") return;
    let shouldOpen = false;
    let targetDate = todayStr();

    const params = new URLSearchParams(window.location.search);
    if (params.get("open") === "1") {
      shouldOpen = true;
      targetDate = params.get("date") || todayStr();
    }
    try {
      const raw = sessionStorage.getItem("aqunote_open_payment");
      if (raw) {
        const flag = JSON.parse(raw);
        // 60초 이내 플래그만 유효
        if (flag?.open && flag.ts && Date.now() - flag.ts < 60000) {
          shouldOpen = true;
          targetDate = flag.date || targetDate;
        }
        sessionStorage.removeItem("aqunote_open_payment");
      }
    } catch {}

    if (shouldOpen) {
      setF((prev: any) => ({ ...prev, paid_at: targetDate }));
      setShowModal(true);
      window.history.replaceState({}, "", "/payments");
    }
  }, []);

  async function loadAll() {
    setLoading(true);
    const [p, m, mem, pl] = await Promise.all([
      // 이중 조인 실패에 대비해 fallback 해봄
      (async () => {
        const first = await supabase.from("payments").select("*, members(name, member_type), memberships(plan_name, total_sessions, used_sessions, adjustment, end_date)").order("paid_at", { ascending: false });
        if (first.error) {
          // 조인 실패 → memberships 조인 제거하고 재시도
          console.warn("payments 조인 실패, fallback", first.error);
          return await supabase.from("payments").select("*, members(name, member_type)").order("created_at", { ascending: false });
        }
        return first;
      })(),
      // memberships 조회 — order 실패 시 no-order로 fallback
      (async () => {
        const r1 = await supabase.from("memberships").select("*, members(name, member_type)").order("created_at", { ascending: false });
        if (r1.error) {
          console.warn("memberships 조회 fallback:", r1.error);
          return await supabase.from("memberships").select("*, members(name, member_type)");
        }
        return r1;
      })(),
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

      // 1) memberships에 회원권 자동 생성 (모든 결제 → 무조건 회원권 레코드 생성)
      const endDate = new Date(f.paid_at);
      endDate.setDate(endDate.getDate() + Number(f.valid_days || 90));
      // sessions가 0/음수이면 최소 1회권으로 생성
      const safeSessions = Math.max(1, Number(f.sessions) || 1);
      const msPayload: any = {
        org_id: orgId,
        member_id: f.member_id,
        plan_name: f.plan_name,
        total_sessions: safeSessions,
        used_sessions: 0,
        start_date: f.paid_at,
        end_date: endDate.toISOString().slice(0, 10),
        price: Number(f.amount),
        status: "active",
      };
      let newMembership: any = null;
      let msLastErr: any = null;
      for (let attempt = 0; attempt < 15; attempt++) {
        const { data, error } = await supabase.from("memberships").insert(msPayload).select().single();
        if (!error) { newMembership = data; msLastErr = null; break; }
        msLastErr = error;
        const m = error.message.match(/'([^']+)' column|column "([^"]+)"/);
        const missing = m?.[1] || m?.[2];
        if (missing && missing in msPayload) { delete msPayload[missing]; continue; }
        break;
      }
      if (!newMembership) throw new Error((msLastErr?.message || "알 수 없는 오류") + "\n\n💡 AQUNOTE_V37_FIX8.sql을 Supabase에 실행해 주세요.");

      // 2) payments에 결제 이력 추가 (여러 수단 분할 포함)
      const payload: any = {
        org_id: orgId,
        member_id: f.member_id,
        membership_id: newMembership?.id,
        amount: Number(f.amount),
        gross_amount: Number(f.amount),
        method: f.method,
        paid_at: f.paid_at,
        paid_time: f.paid_time || null,
        description: f.plan_name,
        memo: f.memo || null,
        // v3.8: 여러 수단 분할
        pay_card: Number(f.pay_card || 0),
        pay_cash: Number(f.pay_cash || 0),
        pay_transfer: Number(f.pay_transfer || 0),
        pay_other: Number(f.pay_other || 0),
        pay_other_label: f.pay_other_label || null,
        unpaid_amount: Number(f.unpaid || 0),
        discount_amount: Number(f.discount || 0),
      };
      if (f.method === "card" || (f.pay_card && Number(f.pay_card) > 0)) {
        payload.approval_no = f.approval_no || null;
        payload.card_number = f.card_number ? toMaskedDisplay(f.card_number) : null;
        payload.card_issuer = f.card_issuer || null;
        payload.installment = Number(f.installment || 0);
      }
      if (f.method === "cash" || (f.pay_cash && Number(f.pay_cash) > 0)) {
        payload.receipt_no = f.receipt_no || null;
      }

      // v3.8: 방어적 insert - 없는 컬럼 자동 제거 후 재시도
      let payLastErr: any = null;
      for (let i = 0; i < 15; i++) {
        const { error: pErr } = await supabase.from("payments").insert(payload);
        if (!pErr) { payLastErr = null; break; }
        payLastErr = pErr;
        const m = pErr.message.match(/'([^']+)' column|column "([^"]+)"/);
        const missing = m?.[1] || m?.[2];
        if (missing && missing in payload) { delete payload[missing]; continue; }
        break;
      }
      if (payLastErr) throw new Error(payLastErr.message + "\n\n💡 AQUNOTE_V38_INIT.sql 을 실행해 payments에 분할 컬럼을 추가해 주세요.");

      setShowModal(false);
      await loadAll();
      alert(`✅ 결제 등록 완료\n\n· 회원권: ${f.plan_name} ${safeSessions}회 자동 생성\n· 유효기간: ${f.paid_at} ~ ${endDate.toISOString().slice(0, 10)}\n· 금액: ₩${Number(f.amount).toLocaleString()}`);
    } catch (err: any) {
      alert("저장 실패: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  // 환불 모달 열기 (자동 계산)
  function openRefundModal(membership: any) {
    setRefundModal(membership);
  }

  // 결제를 회원권으로 변환 (회원권이 생성되지 않은 결제)
  async function openCreateMembershipModal(payment: any) {
    // 회원권 명 입력
    const planName = prompt("회원권 이름을 입력하세요", payment.description || payment.lesson_name || "10회권");
    if (!planName) return;

    const sessStr = prompt(`총 회차를 입력하세요 (숫자만)\n\n예: 10회권이면 10, 30회권이면 30`, "10");
    if (!sessStr) return;
    const sessions = parseInt(sessStr);
    if (!sessions || sessions < 1) { alert("올바른 회차를 입력하세요"); return; }

    const validStr = prompt("유효기간을 일 단위로 입력하세요", "90");
    if (!validStr) return;
    const validDays = parseInt(validStr) || 90;

    // 사용 회차 (이미 수업 진행 중이면 미리 차감)
    const usedStr = prompt(`이미 사용한 회차가 있다면 입력하세요 (없으면 0)`, "0");
    const usedSessions = parseInt(usedStr || "0") || 0;

    try {
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      const paidAt = payment.paid_at || new Date().toISOString().slice(0, 10);
      const endDate = new Date(paidAt);
      endDate.setDate(endDate.getDate() + validDays);

      const msPayload: any = {
        org_id: orgId,
        member_id: payment.member_id,
        plan_name: planName,
        total_sessions: sessions,
        used_sessions: usedSessions,
        start_date: paidAt,
        end_date: endDate.toISOString().slice(0, 10),
        price: payment.amount,
        status: "active",
      };
      // 스키마에 없는 컬럼 자동 제거 및 대체 컬럼명 시도
      let newMs: any = null;
      let lastErr: any = null;
      for (let attempt = 0; attempt < 15; attempt++) {
        const { data, error } = await supabase.from("memberships").insert(msPayload).select().single();
        if (!error) { newMs = data; lastErr = null; break; }
        lastErr = error;
        const m = error.message.match(/'([^']+)' column|column "([^"]+)"/);
        const missing = m?.[1] || m?.[2];
        if (missing && missing in msPayload) { delete msPayload[missing]; continue; }
        // end_date/start_date 대체 컬럼명 시도
        if (/end_date/.test(error.message) && msPayload.end_date) {
          msPayload.expires_at = msPayload.end_date; delete msPayload.end_date; continue;
        }
        if (/start_date/.test(error.message) && msPayload.start_date) {
          msPayload.begin_date = msPayload.start_date; delete msPayload.start_date; continue;
        }
        break;
      }
      if (!newMs) {
        alert("회원권 생성 실패: " + (lastErr?.message || "알 수 없는 오류") +
          "\n\n💡 AQUNOTE_V37_FIX8.sql 을 Supabase에 실행해 주세요.");
        return;
      }

      // 결제에 membership_id 연결
      await supabase.from("payments").update({ membership_id: newMs.id }).eq("id", payment.id);

      alert(`✅ 회원권이 생성되었습니다\n\n· ${planName} ${sessions}회\n· 사용 ${usedSessions}회 / 잔여 ${sessions - usedSessions}회\n· 유효기간: ${paidAt} ~ ${endDate.toISOString().slice(0, 10)}`);
      loadAll();
    } catch (err: any) {
      alert("회원권 생성 실패: " + err.message);
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

  // 결제 취소 되돌리기 (cancelled → active)
  async function restorePayment(id: string) {
    const pay = payments.find(p => p.id === id);
    if (!pay || pay.status !== "cancelled") return;
    if (!confirm(`이 취소된 결제를 되돌리시겠습니까?\n\n· 금액: ₩${(pay.amount || 0).toLocaleString()}\n· 날짜: ${pay.paid_at}\n\n✅ 결제와 연결된 회원권도 다시 활성화됩니다`)) return;
    // 연결 회원권 복원
    if (pay.membership_id) {
      await supabase.from("memberships").update({
        status: "active", cancelled_at: null, cancelled_reason: null,
      }).eq("id", pay.membership_id);
    }
    const { error } = await supabase.from("payments").update({
      status: "active", cancelled_at: null, cancelled_reason: null,
    }).eq("id", id);
    if (error) { alert("되돌리기 실패: " + error.message); return; }
    alert("✅ 결제가 되돌려졌습니다");
    loadAll();
  }

  // 하드 삭제 (완전 제거 - 돌이킬 수 없음)
  async function hardDeletePayment(id: string) {
    const pay = payments.find(p => p.id === id);
    if (!pay) return;
    if (!confirm(`⚠️ 결제 이력을 이력에서 완전히 삭제합니다.\n\n· 금액: ₩${(pay.amount || 0).toLocaleString()}\n· 날짜: ${pay.paid_at}\n· 상품: ${pay.description || "상품 없음"}\n\n❗ 이 작업은 되돌릴 수 없습니다.\n❗ 연결된 회원권도 함께 삭제됩니다.\n\n계속하시겠습니까?`)) return;
    // 연결 회원권도 하드 삭제
    if (pay.membership_id) {
      try { await supabase.from("schedule_slots").update({ membership_id: null }).eq("membership_id", pay.membership_id); } catch {}
      await supabase.from("memberships").delete().eq("id", pay.membership_id);
    }
    // 결제 연결된 refunds/session_adjustments 도 정리
    try { await supabase.from("refunds").delete().eq("payment_id", id); } catch {}
    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    alert("🗑️ 이력이 완전히 삭제되었습니다");
    loadAll();
  }

  async function deletePayment(id: string) {
    const pay = payments.find(p => p.id === id);
    if (!pay) return;
    if (pay.status === "cancelled") {
      // 이미 취소된 결제는 하드 삭제 함수로 위임
      await hardDeletePayment(id);
      return;
    }

    let msg = `이 결제를 취소하시겠습니까?\n\n· 금액: ₩${(pay.amount || 0).toLocaleString()}\n· 날짜: ${pay.paid_at}`;
    if (pay.memberships) {
      msg += `\n\n연결 회원권: ${pay.memberships.plan_name} (${pay.memberships.total_sessions}회, 사용 ${pay.memberships.used_sessions}회)\n→ 회원권도 함께 취소됩니다`;
    }
    msg += `\n\n💡 이력은 삭제되지 않고 “취소” 상태로 남습니다.`;
    if (!confirm(msg)) return;

    const reason = prompt("취소 사유를 입력해 주세요 (선택)", "고객 요청·재결제");
    if (reason === null) return;
    const now = new Date().toISOString();

    // 회원권 취소
    if (pay.membership_id) {
      await supabase.from("memberships").update({
        status: "cancelled", cancelled_at: now, cancelled_reason: reason || "결제 취소",
      }).eq("id", pay.membership_id);
      try { await supabase.from("schedule_slots").update({ membership_id: null }).eq("membership_id", pay.membership_id); } catch {}
    }

    const { error } = await supabase.from("payments").update({
      status: "cancelled", cancelled_at: now, cancelled_reason: reason || "결제 취소",
    }).eq("id", id);
    if (error) { alert("상태 변경 실패: " + error.message + "\n\n💡 AQUNOTE_V37_FIX6.sql을 실행해 주세요."); return; }
    alert("✅ 결제가 취소되었습니다 (이력 보존)");
    loadAll();
  }

  // 유효 결제만 매출에 포함 (취소된 것 제외)
  const totalRevenue = payments.filter(p => p.status !== "cancelled").reduce((sum, p) => sum + (p.amount || 0), 0);
  const thisMonthRevenue = payments
    .filter((p) => p.status !== "cancelled" && (p.paid_at || "").startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  // 활성 회원권: 취소되지 않고, end_date가 없거나 미래인 것 (end_date null이어도 확인 가능)
  const activeMemberships = memberships.filter((m) => m.status !== "cancelled" && (!m.end_date || new Date(m.end_date) > new Date())).length;

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
                  const isCancelled = m.status === "cancelled";
                  return (
                    <tr key={m.id} className={`border-b border-gray-100 ${isCancelled ? "bg-gray-50 opacity-60" : expired ? "opacity-50" : ""} hover:bg-aqu-50/30`}>
                      <td className="p-2 md:p-3">
                        <Link href={`/members/${m.member_id}`} className="text-aqu-700 hover:underline font-medium">
                          {m.members?.name || "-"}
                        </Link>
                        {isCancelled && (
                          <div className="mt-1 inline-block px-1.5 py-0.5 bg-red-500 text-white text-[9px] rounded font-bold">❌ 취소됨</div>
                        )}
                      </td>
                      <td className="p-2 md:p-3">
                        <div className={isCancelled ? "text-gray-500 line-through" : ""}>{m.plan_name}</div>
                        {isCancelled && m.cancelled_reason && (
                          <div className="text-[10px] text-red-600 mt-0.5">{m.cancelled_reason}</div>
                        )}
                      </td>
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
                      <td className="p-2 md:p-3 text-right font-medium">
                        <div className={isCancelled ? "line-through text-gray-400" : ""}>₩{(m.price || 0).toLocaleString()}</div>
                        {m.refund_status && m.refund_status !== "none" && (
                          <div className="text-[10px] text-orange-600 mt-0.5">
                            환불 {m.refund_status === "partial" ? "부분" : "전액"}
                          </div>
                        )}
                      </td>
                      <td className="p-2 md:p-3">
                        <div className="flex items-center gap-1 justify-end">
                          {!isCancelled && m.refund_status !== "full" && (
                            <button onClick={() => openRefundModal(m)}
                              className="px-2 py-1 text-[10px] bg-orange-50 text-orange-700 hover:bg-orange-100 rounded font-semibold"
                              title="부분/전액 환불">
                              💵 환불
                            </button>
                          )}
                          <button onClick={() => deleteMembership(m.id)}
                            className="p-1.5 text-red-400 hover:bg-red-50 rounded">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
                {payments.map(p => {
                  const isCancelled = p.status === "cancelled";
                  return (
                  <tr key={p.id} className={`border-b border-gray-100 ${isCancelled ? "bg-gray-50 opacity-70" : "hover:bg-aqu-50/30"}`}>
                    <td className="p-2 md:p-3 text-gray-600 text-[11px] whitespace-nowrap">
                      {p.paid_at}
                      {p.paid_time && <div className="text-gray-400">{p.paid_time}</div>}
                      {isCancelled && (
                        <div className="mt-1 inline-block px-1.5 py-0.5 bg-red-500 text-white text-[9px] rounded font-bold">❌ 취소됨</div>
                      )}
                      {p.replaced_by && (
                        <div className="mt-1 inline-block px-1.5 py-0.5 bg-blue-500 text-white text-[9px] rounded font-bold">🔄 재결제됨</div>
                      )}
                      {p.replaces && !isCancelled && (
                        <div className="mt-1 inline-block px-1.5 py-0.5 bg-green-500 text-white text-[9px] rounded font-bold">🆕 재결제</div>
                      )}
                    </td>
                    <td className="p-2 md:p-3">
                      <Link href={`/members/${p.member_id}`} className={`hover:underline font-medium ${isCancelled ? "text-gray-500" : "text-aqu-700"}`}>
                        {p.members?.name || "-"}
                      </Link>
                    </td>
                    <td className="p-2 md:p-3">
                      <div className={`font-semibold ${isCancelled ? "text-gray-500 line-through" : "text-slate-800"}`}>{p.memberships?.plan_name || p.description || "-"}</div>
                      {isCancelled && p.cancelled_reason && (
                        <div className="text-[10px] text-red-600 mt-0.5">취소사유: {p.cancelled_reason}</div>
                      )}
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
                    <td className={`p-2 md:p-3 text-right font-bold ${isCancelled ? "text-gray-400 line-through" : "text-aqu-900"}`}>
                      ₩{(p.amount || 0).toLocaleString()}
                      {p.refunded_amount > 0 && (
                        <div className="text-[10px] text-orange-600 font-normal">-₩{p.refunded_amount.toLocaleString()} 환불</div>
                      )}
                    </td>
                    <td className="p-2 md:p-3">
                      <div className="flex items-center gap-1 justify-end">
                        {!isCancelled && !p.membership_id && (
                          <button onClick={() => openCreateMembershipModal(p)}
                            className="px-2 py-1 text-[10px] bg-purple-50 text-purple-700 hover:bg-purple-100 rounded font-semibold"
                            title="이 결제를 회원권으로 등록">
                            🎫 회원권화
                          </button>
                        )}
                        {!isCancelled && p.membership_id && p.memberships?.status !== "cancelled" && (
                          <button onClick={() => {
                            const m = memberships.find(x => x.id === p.membership_id);
                            if (m) openRefundModal(m);
                            else alert("회원권 정보를 찾을 수 없습니다");
                          }}
                            className="px-2 py-1 text-[10px] bg-orange-50 text-orange-700 hover:bg-orange-100 rounded font-semibold"
                            title="부분/전액 환불">
                            💵 환불
                          </button>
                        )}
                      {isCancelled ? (
                        <>
                          <button onClick={() => restorePayment(p.id)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded border border-green-200"
                            title="취소를 되돌려 다시 활성화">
                            ↩직 되돌리기
                          </button>
                          <button onClick={() => hardDeletePayment(p.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded border border-red-200"
                            title="이력에서 완전 제거 (되돌릴 수 없음)">
                            🗑️ 완전삭제
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => deletePayment(p.id)}
                            className="p-1.5 text-orange-600 hover:bg-orange-50 rounded"
                            title="이력은 남기고 '취소' 상태로 변경 (되돌릴 수 있음)">
                            ❌ 취소
                          </button>
                          <button onClick={() => hardDeletePayment(p.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                            title="이력에서 완전 제거 (되돌릴 수 없음)">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      </div>
                    </td>
                  </tr>
                );})}
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
              <PaymentMemberSearch members={members} value={f.member_id}
                onChange={(id: string) => setF({ ...f, member_id: id })} />
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

            {/* v3.8: 여러 수단 분할 결제 */}
            <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700">💰 결제 수단 (여러 개 분할 가능)</label>
                <div className="text-[10px] text-gray-500">총액: ₩{Number(f.amount || 0).toLocaleString()}</div>
              </div>
              <div className="space-y-1.5">
                <SplitPayRow label="💳 카드" val={f.pay_card} onC={v => setF({ ...f, pay_card: v })} totalAmount={Number(f.amount||0)} f={f} />
                <SplitPayRow label="💵 현금" val={f.pay_cash} onC={v => setF({ ...f, pay_cash: v })} totalAmount={Number(f.amount||0)} f={f} />
                <SplitPayRow label="🏦 계좌이체" val={f.pay_transfer} onC={v => setF({ ...f, pay_transfer: v })} totalAmount={Number(f.amount||0)} f={f} />
                <SplitPayRow label="📋 기타" val={f.pay_other} onC={v => setF({ ...f, pay_other: v })} totalAmount={Number(f.amount||0)} f={f}
                  extra={
                    <input type="text" value={f.pay_other_label || ""} onChange={e => setF({ ...f, pay_other_label: e.target.value })}
                      placeholder="기타 명칭" className="w-24 px-2 py-1 text-xs border border-gray-200 rounded" />
                  } />
                <SplitPayRow label="⚠️ 미수" val={f.unpaid} onC={v => setF({ ...f, unpaid: v })} totalAmount={Number(f.amount||0)} f={f} isUnpaid />
                <SplitPayRow label="🎁 할인" val={f.discount} onC={v => setF({ ...f, discount: v })} totalAmount={Number(f.amount||0)} f={f} isDiscount />
              </div>
              {(() => {
                const totalPaid = Number(f.pay_card||0) + Number(f.pay_cash||0) + Number(f.pay_transfer||0) + Number(f.pay_other||0) + Number(f.unpaid||0) + Number(f.discount||0);
                const target = Number(f.amount||0);
                const diff = target - totalPaid;
                return (
                  <div className={`mt-3 p-2 rounded-lg flex items-center justify-between text-sm ${diff === 0 ? "bg-green-50 text-green-700" : diff > 0 ? "bg-yellow-50 text-yellow-700" : "bg-red-50 text-red-700"}`}>
                    <span className="font-semibold">{diff === 0 ? "✅ 결제 완료" : diff > 0 ? `⚠️ 남은 금액: ₩${diff.toLocaleString()}` : `⚠️ 초과 금액: ₩${Math.abs(diff).toLocaleString()}`}</span>
                    <button type="button"
                      onClick={() => {
                        // 남은 금액을 가장 큰 금액의 수단에 자동 채우기
                        if (diff > 0) {
                          setF({ ...f, pay_card: (Number(f.pay_card)||0) + diff });
                        }
                      }}
                      className="text-xs px-2 py-1 bg-white border border-current rounded font-semibold">
                      카드로 나머지 채우기
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* 하위 호환을 위해 method 필드 유지 (남은 것 중 가장 큰 수단) */}
            {(() => {
              const paidByMethod = { card: Number(f.pay_card||0), cash: Number(f.pay_cash||0), transfer: Number(f.pay_transfer||0), other: Number(f.pay_other||0) };
              const primary = Object.entries(paidByMethod).sort(([,a],[,b]) => b - a)[0][0];
              if (f.method !== primary && primary && paidByMethod[primary as keyof typeof paidByMethod] > 0) {
                setTimeout(() => setF((prev: any) => ({ ...prev, method: primary })), 0);
              }
              return null;
            })()}

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

      {/* ─── 환불 처리 모달 ─── */}
      {refundModal && (
        <RefundModal
          membership={refundModal}
          payments={payments}
          onClose={() => setRefundModal(null)}
          onDone={() => { setRefundModal(null); loadAll(); }}
        />
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

// ═══════════════════════════════════════════════════════════════
// 💵 환불 처리 모달 (부분/전액 환불)
// ═══════════════════════════════════════════════════════════════
function RefundModal({ membership, payments, onClose, onDone }: any) {
  // 이 회원권과 연결된 결제 찾기
  const linkedPayment = useMemo(() => {
    return payments.find((p: any) => p.membership_id === membership.id && p.status !== "cancelled");
  }, [payments, membership.id]);

  const totalPrice   = membership.price || linkedPayment?.amount || 0;
  const totalSess    = (membership.total_sessions || 0) + (membership.adjustment || 0);
  const usedSess     = membership.used_sessions || 0;
  const remainingSess = Math.max(0, totalSess - usedSess);
  const alreadyRefunded = linkedPayment?.refunded_amount || 0;

  // 자동 계산: 잔여 회차 비율만큼 환불액 제안
  const perSession = totalSess > 0 ? Math.floor(totalPrice / totalSess) : 0;
  const suggestedRefund = Math.max(0, perSession * remainingSess - alreadyRefunded);

  const [mode, setMode] = useState<"partial" | "full">("partial");
  const [refundAmount, setRefundAmount] = useState<number>(suggestedRefund);
  const [refundMethod, setRefundMethod] = useState<string>("transfer");
  const [reason, setReason] = useState<string>("");
  const [terminate, setTerminate] = useState<boolean>(true);  // 회원권 종결 여부
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === "full") {
      setRefundAmount(Math.max(0, totalPrice - alreadyRefunded));
      setTerminate(true);
    } else {
      setRefundAmount(suggestedRefund);
    }
  }, [mode, totalPrice, alreadyRefunded, suggestedRefund]);

  async function processRefund() {
    if (!refundAmount || refundAmount <= 0) { alert("환불액을 입력하세요"); return; }
    const maxRefundable = totalPrice - alreadyRefunded;
    if (refundAmount > maxRefundable) {
      alert(`환불 가능한 최대 금액은 ₩${maxRefundable.toLocaleString()}입니다 (이미 환불: ₩${alreadyRefunded.toLocaleString()})`);
      return;
    }

    if (!confirm(`환불을 진행하시겠습니까?\n\n· 회원: ${membership.members?.name}\n· 회원권: ${membership.plan_name}\n· 환불액: ₩${refundAmount.toLocaleString()}\n· 환불 방법: ${refundMethod === "transfer" ? "계좌이체" : refundMethod === "card" ? "카드취소" : "현금"}\n${terminate ? "\n⚠️ 회원권이 종결됩니다 (더 이상 사용 불가)" : ""}`)) return;

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;

      // 1) refunds 로그 저장
      const { error: refErr } = await supabase.from("refunds").insert({
        org_id: orgId,
        payment_id: linkedPayment?.id || null,
        membership_id: membership.id,
        member_id: membership.member_id,
        refund_amount: refundAmount,
        refund_method: refundMethod,
        used_sessions: usedSess,
        remaining_sessions: remainingSess,
        reason: reason || null,
        refunded_at: new Date().toISOString().slice(0, 10),
      });
      if (refErr) throw refErr;

      // 2) payments의 refunded_amount 누적
      if (linkedPayment) {
        const newRefunded = alreadyRefunded + refundAmount;
        const isFullRefund = newRefunded >= totalPrice;
        await supabase.from("payments").update({
          refunded_amount: newRefunded,
          refund_note: reason || null,
          // 전액 환불이면 결제도 cancelled로 (매출 통계에서 완전 제외)
          ...(isFullRefund ? { status: "cancelled", cancelled_at: now, cancelled_reason: `환불 완료: ${reason || "고객 요청"}` } : {}),
        }).eq("id", linkedPayment.id);
      }

      // 3) memberships 상태 업데이트
      const newRefundedTotal = alreadyRefunded + refundAmount;
      const isFull = newRefundedTotal >= totalPrice;
      const membershipUpdate: any = {
        refund_status: isFull ? "full" : "partial",
        updated_at: now,
      };
      if (terminate || isFull) {
        membershipUpdate.status = "cancelled";
        membershipUpdate.terminated_at = now;
        membershipUpdate.cancelled_at = now;
        membershipUpdate.cancelled_reason = `환불 종결: ${reason || "고객 요청"}`;
        // 종결 시점의 잔여 회차만큼 회원권 유효기간을 오늘까지로
        membershipUpdate.end_date = new Date().toISOString().slice(0, 10);
      }
      await supabase.from("memberships").update(membershipUpdate).eq("id", membership.id);

      // 4) slot 링크 해제 (종결 시)
      if (terminate || isFull) {
        try { await supabase.from("schedule_slots").update({ membership_id: null }).eq("membership_id", membership.id); } catch {}
      }

      alert(`✅ 환불 처리 완료\n\n· 환불액: ₩${refundAmount.toLocaleString()}\n· 방법: ${refundMethod === "transfer" ? "계좌이체" : refundMethod === "card" ? "카드취소" : "현금"}${terminate || isFull ? "\n· 회원권 종결됨" : ""}`);
      onDone();
    } catch (err: any) {
      alert("환불 처리 실패: " + err.message + "\n\n💡 AQUNOTE_V37_FIX7.sql을 Supabase에 실행해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-yellow-50 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow">
              <span className="text-2xl">💵</span>
            </div>
            <div>
              <div className="font-bold text-slate-900">환불 처리</div>
              <div className="text-xs text-gray-500">{membership.members?.name} · {membership.plan_name}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        {/* 현재 상태 */}
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 bg-blue-50 rounded-lg">
              <div className="text-[10px] text-gray-500">결제액</div>
              <div className="font-bold text-blue-700 text-sm">₩{totalPrice.toLocaleString()}</div>
            </div>
            <div className="p-2.5 bg-green-50 rounded-lg">
              <div className="text-[10px] text-gray-500">사용 회차</div>
              <div className="font-bold text-green-700 text-sm">{usedSess}회</div>
            </div>
            <div className="p-2.5 bg-orange-50 rounded-lg">
              <div className="text-[10px] text-gray-500">잔여 회차</div>
              <div className="font-bold text-orange-700 text-sm">{remainingSess}회</div>
            </div>
          </div>
          {alreadyRefunded > 0 && (
            <div className="p-2.5 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
              ⚠️ 이미 환불된 금액: ₩{alreadyRefunded.toLocaleString()}
            </div>
          )}
          <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-700">
            💡 회차당 단가: <b>₩{perSession.toLocaleString()}</b> ({totalPrice.toLocaleString()} ÷ {totalSess}회)
            <br/>💡 계약상 잔여 가치: <b>₩{(perSession * remainingSess).toLocaleString()}</b> ({remainingSess}회 × 회차 단가)
          </div>

          {/* 환불 방식 */}
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-2">환불 방식 <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setMode("partial")}
                className={`py-3 rounded-xl border-2 text-sm font-medium ${mode === "partial" ? "bg-orange-500 border-orange-500 text-white shadow" : "border-orange-200 text-orange-700 hover:bg-orange-50"}`}>
                💰 부분 환불
                <div className="text-[10px] mt-1 opacity-90">{remainingSess}회분만 환불</div>
              </button>
              <button type="button" onClick={() => setMode("full")}
                className={`py-3 rounded-xl border-2 text-sm font-medium ${mode === "full" ? "bg-red-500 border-red-500 text-white shadow" : "border-red-200 text-red-700 hover:bg-red-50"}`}>
                💸 전액 환불
                <div className="text-[10px] mt-1 opacity-90">결제액 전체 환불</div>
              </button>
            </div>
          </div>

          {/* 환불액 (수정 가능) */}
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">환불 금액 (원) <span className="text-red-500">*</span></label>
            <input type="number" value={refundAmount || ""} onChange={e => setRefundAmount(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2.5 border-2 border-orange-200 rounded-lg text-lg font-bold text-orange-700 focus:border-orange-400 focus:outline-none" />
            <div className="text-[10px] text-gray-500 mt-1">
              계약상 잔여가치는 ₩{(perSession * remainingSess).toLocaleString()}이지만, 협상에 따라 자유롭게 조정 가능
            </div>
          </div>

          {/* 환불 방법 */}
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">환불 처리 방법 <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setRefundMethod("transfer")}
                className={`py-2 rounded-lg border text-xs font-medium ${refundMethod === "transfer" ? "bg-blue-500 border-blue-500 text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
                🏦 계좌이체
              </button>
              <button type="button" onClick={() => setRefundMethod("card")}
                className={`py-2 rounded-lg border text-xs font-medium ${refundMethod === "card" ? "bg-purple-500 border-purple-500 text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
                💳 카드취소
              </button>
              <button type="button" onClick={() => setRefundMethod("cash")}
                className={`py-2 rounded-lg border text-xs font-medium ${refundMethod === "cash" ? "bg-green-500 border-green-500 text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
                💵 현금
              </button>
            </div>
          </div>

          {/* 환불 사유 */}
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">환불 사유</label>
            <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="예: 이사·건강 문제 등"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>

          {/* 회원권 종결 옵션 */}
          <label className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer ${terminate ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
            <input type="checkbox" checked={terminate} onChange={e => setTerminate(e.target.checked)}
              disabled={mode === "full"} className="mt-0.5" />
            <div className="flex-1 text-xs">
              <div className="font-semibold text-slate-800">회원권 종결 처리</div>
              <div className="text-gray-600 mt-0.5">
                {terminate
                  ? "⚠️ 회원권이 더 이상 사용되지 않으며, 시간표에서도 자동 차감되지 않습니다."
                  : "부분 환불만 하고 남은 회차는 계속 사용할 수 있게 유지"}
                {mode === "full" && <div className="text-red-600 mt-1">전액 환불 시 자동 종결됩니다</div>}
              </div>
            </div>
          </label>
        </div>

        {/* 하단 액션 */}
        <div className="px-5 py-3 border-t border-gray-100 bg-white flex gap-2 sticky bottom-0">
          <button onClick={onClose} className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">취소</button>
          <button onClick={processRefund} disabled={saving || !refundAmount}
            className="flex-1 px-4 py-2.5 bg-gradient-to-br from-orange-500 to-red-500 text-white rounded-lg text-sm font-bold shadow hover:opacity-90 disabled:opacity-40">
            {saving ? "처리 중..." : `💵 ₩${refundAmount.toLocaleString()} 환불 처리`}
          </button>
        </div>
      </div>
    </div>
  );
}

// v3.8: 여러 결제 수단 분할 입력 헬퍼
function SplitPayRow({ label, val, onC, totalAmount, f, extra, isUnpaid, isDiscount }: any) {
  const numVal = Number(val || 0);
  return (
    <div className="flex items-center gap-2">
      <div className={`w-20 text-xs font-medium ${isUnpaid ? "text-red-600" : isDiscount ? "text-purple-600" : "text-slate-700"}`}>{label}</div>
      <input type="number" min={0} value={numVal || ""} onChange={e => onC(parseInt(e.target.value) || 0)}
        placeholder="0"
        className={`flex-1 px-2 py-1.5 border rounded text-sm text-right font-mono ${numVal > 0 ? "border-current bg-white" : "border-gray-200 bg-white"}`} />
      <span className="text-xs text-gray-400 w-4">원</span>
      {extra}
      {totalAmount > 0 && (
        <button type="button" onClick={() => onC(totalAmount)}
          className="text-[10px] px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 rounded font-semibold whitespace-nowrap"
          title="전액 입력">전액</button>
      )}
      <button type="button" onClick={() => onC(0)}
        className="text-[10px] px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 rounded"
        title="초기화">×</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 💳 결제 등록 - 회원 검색 (돋보기 + 이름/전화번호 뒷자리 검색)
// ═══════════════════════════════════════════════════════════════
function PaymentMemberSearch({ members, value, onChange }: any) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = members.find((m: any) => m.id === value);

  // "강선옥 (9802) · 성인" 형식
  function formatSelected(m: any) {
    if (!m) return "";
    const tail = (m.phone || "").replace(/\D/g, "").slice(-4);
    const typeLabel = m.member_type === "child" ? "아동" : "성인";
    return `${m.name}${tail ? ` (${tail})` : ""} · ${typeLabel}`;
  }

  const filtered = (members || []).filter((m: any) => {
    if (!query) return true;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const name = (m.name || "").toLowerCase();
    const phoneDigits = (m.phone || "").replace(/\D/g, "");
    const qDigits = q.replace(/\D/g, "");
    return name.includes(q) || (qDigits && phoneDigits.includes(qDigits));
  });

  const displayValue = query || (selected ? formatSelected(selected) : "");

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input type="text"
            value={displayValue}
            onFocus={(e) => {
              setOpen(true);
              if (selected && !query) e.currentTarget.select();
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              if (selected) onChange("");
            }}
            placeholder="🔍 이름 또는 전화번호 뒷자리 (예: 3206)"
            className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none"
          />
          {(selected || query) && (
            <button type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(""); setQuery(""); setOpen(true);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 text-lg leading-none">×</button>
          )}
        </div>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => { setOpen(false); setQuery(""); }}></div>
          <div className="absolute z-40 top-full left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-400">
                검색 결과 없음<br />
                <span className="text-[10px]">이름 또는 전화번호 뒷자리(예: 3206)로 검색하세요</span>
              </div>
            ) : (
              filtered.slice(0, 80).map((m: any) => {
                const phoneDigits = (m.phone || "").replace(/\D/g, "");
                const tail = phoneDigits.slice(-4);
                const isChild = m.member_type === "child";
                return (
                  <button key={m.id} type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { onChange(m.id); setQuery(""); setOpen(false); }}
                    className={`w-full text-left px-3 py-2.5 text-sm hover:bg-aqu-50 flex items-center gap-2 border-b border-gray-50 ${value === m.id ? "bg-aqu-50" : ""}`}>
                    <span className="text-lg">{isChild ? "🧒" : "👤"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 truncate flex items-center gap-1.5 flex-wrap">
                        <span>{m.name}</span>
                        {tail && (
                          <span className="text-[11px] font-mono px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded">
                            ({tail})
                          </span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${isChild ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                          {isChild ? "아동" : "성인"}
                        </span>
                      </div>
                      {m.phone && (
                        <div className="text-[10px] text-gray-400 font-mono mt-0.5">{m.phone}</div>
                      )}
                    </div>
                    {m.status && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{m.status}</span>
                    )}
                  </button>
                );
              })
            )}
            {filtered.length > 80 && (
              <div className="p-2 text-[10px] text-gray-400 text-center border-t">
                +{filtered.length - 80}명 더 있음. 검색을 좁혀보세요.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
