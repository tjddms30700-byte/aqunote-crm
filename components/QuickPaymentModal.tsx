"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { X, CreditCard, Loader2 } from "lucide-react";

/* ============================================================
   v3.16.1 - 인라인 결제 등록 모달
   - 시간표에서 결제 등록 시 페이지 이동 없이 이 모달만 열림
   - 저장 시 payments + memberships 자동 생성
   - 결제 완료 후 자동으로 회원권 활성화
============================================================ */

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialDate?: string;
  initialMemberId?: string;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function QuickPaymentModal({ open, onClose, onSaved, initialDate, initialMemberId }: Props) {
  const [members, setMembers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const [f, setF] = useState<any>({
    member_id: initialMemberId || "",
    plan_id: "",
    plan_name: "",
    total_sessions: 10,
    valid_days: 90,
    amount: 0,
    paid_at: initialDate || todayStr(),
    payment_methods: { card: 0, cash: 0, transfer: 0, other: 0, unpaid: 0, discount: 0 },
    memo: "",
  });

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: ms } = await supabase.from("members").select("id, name, phone, member_type").is("deleted_at", null);
      setMembers(ms || []);
      const { data: pl } = await supabase.from("plans").select("*").order("total_sessions", { ascending: true });
      setPlans(pl || []);
      setF((prev: any) => ({ ...prev, paid_at: initialDate || todayStr(), member_id: initialMemberId || prev.member_id }));
    })();
  }, [open, initialDate, initialMemberId]);

  const totalPaid = (Object.values(f.payment_methods || {}) as any[]).reduce((s: number, v: any) => s + (Number(v) || 0), 0) - (Number(f.payment_methods?.discount) || 0);

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
      total_sessions: p.total_sessions || 10,
      valid_days: p.valid_days || 90,
      amount: p.price || 0,
      payment_methods: { ...f.payment_methods, card: p.price || 0 },
    });
  }

  async function save() {
    if (!f.member_id) { alert("회원을 선택해주세요"); return; }
    if (!f.plan_name) { alert("회원권 이름을 입력하세요"); return; }
    if (!f.amount || f.amount <= 0) { alert("금액을 입력하세요"); return; }
    setSaving(true);
    try {
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;

      // 1) memberships 자동 생성 (v3.16.1: 회원권화 버튼 없이도 자동 생성)
      const startDate = f.paid_at;
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + Number(f.valid_days || 90));
      const endStr = endDate.toISOString().slice(0, 10);

      const { data: ms, error: msErr } = await supabase.from("memberships").insert({
        org_id: orgId,
        member_id: f.member_id,
        plan_name: f.plan_name,
        total_sessions: Number(f.total_sessions),
        used_sessions: 0,
        start_date: startDate,
        end_date: endStr,
        amount: Number(f.amount),
        price: Number(f.amount),
        status: "active",
      }).select().single();

      if (msErr) throw msErr;

      // 2) payments 자동 생성
      const { error: payErr } = await supabase.from("payments").insert({
        org_id: orgId,
        member_id: f.member_id,
        membership_id: ms?.id,
        plan_name: f.plan_name,
        amount: Number(f.amount),
        paid_at: f.paid_at,
        payment_methods: f.payment_methods,
        description: f.memo || f.plan_name,
        status: "completed",
      });

      if (payErr) throw payErr;

      alert(`✅ 결제 등록 완료\n\n· 회원권: ${f.plan_name} ${f.total_sessions}회 자동 생성\n· 유효기간: ${startDate} ~ ${endStr}\n· 금액: ₩${Number(f.amount).toLocaleString()}`);
      onSaved();
      onClose();
    } catch (e: any) {
      alert("저장 실패: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const selectedMember = members.find((m) => m.id === f.member_id);
  const filteredMembers = !memberSearch.trim()
    ? members.slice(0, 20)
    : members.filter((m: any) => {
        const kw = memberSearch.trim().toLowerCase();
        return (m.name || "").toLowerCase().includes(kw) || (m.phone || "").includes(kw);
      }).slice(0, 20);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-pink-50 to-rose-50 sticky top-0 z-10">
          <div className="flex items-center gap-2 font-bold text-pink-800">
            <CreditCard className="w-5 h-5" /> 결제 등록
          </div>
          <button onClick={onClose} className="p-1 hover:bg-pink-100 rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-3">
          {/* 회원 선택 */}
          <div>
            <div className="text-xs font-bold text-gray-700 mb-1">회원 *</div>
            {selectedMember ? (
              <div className="flex items-center justify-between p-2 bg-pink-50 border border-pink-200 rounded-lg">
                <span className="text-sm font-semibold text-pink-800">
                  {selectedMember.name} ({selectedMember.member_type === "child" ? "아동" : "성인"})
                  {selectedMember.phone && ` · ${selectedMember.phone}`}
                </span>
                <button onClick={() => setF({ ...f, member_id: "" })} className="text-xs text-pink-600 hover:underline">변경</button>
              </div>
            ) : (
              <>
                <input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="🔍 이름 또는 전화번호 뒷자리"
                  className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" />
                {memberSearch && (
                  <div className="mt-1 max-h-40 overflow-y-auto bg-white border border-gray-200 rounded-lg">
                    {filteredMembers.map((m: any) => (
                      <button key={m.id} onClick={() => { setF({ ...f, member_id: m.id }); setMemberSearch(""); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-pink-50 border-b border-gray-100 flex justify-between">
                        <span>{m.name}</span>
                        <span className="text-[10px] text-gray-400">{m.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 회원권 선택 */}
          <div>
            <div className="text-xs font-bold text-gray-700 mb-1">회원권 선택</div>
            <select value={f.plan_id} onChange={(e) => selectPlan(e.target.value)}
              className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">-- 회원권 선택 (또는 직접입력) --</option>
              {plans.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name} - {p.total_sessions}회 / ₩{Number(p.price || 0).toLocaleString()} / {p.valid_days}일
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-xs font-bold text-gray-700 mb-1">이름</div>
              <input value={f.plan_name} onChange={(e) => setF({ ...f, plan_name: e.target.value })}
                placeholder="10회권"
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <div className="text-xs font-bold text-gray-700 mb-1">횟수</div>
              <input type="number" value={f.total_sessions}
                onChange={(e) => setF({ ...f, total_sessions: e.target.value })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <div className="text-xs font-bold text-gray-700 mb-1">유효(일)</div>
              <input type="number" value={f.valid_days}
                onChange={(e) => setF({ ...f, valid_days: e.target.value })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-gray-700 mb-1">금액 (원) *</div>
            <input type="number" value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value, payment_methods: { ...f.payment_methods, card: Number(e.target.value) || 0 } })}
              className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm font-bold" />
          </div>

          <div>
            <div className="text-xs font-bold text-gray-700 mb-1">결제일 *</div>
            <input type="date" value={f.paid_at}
              onChange={(e) => setF({ ...f, paid_at: e.target.value })}
              className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>

          <div>
            <div className="text-xs font-bold text-gray-700 mb-1">💳 결제 수단</div>
            <div className="space-y-1.5">
              {[
                { k: "card", label: "💳 카드", color: "gray" },
                { k: "cash", label: "💵 현금", color: "green" },
                { k: "transfer", label: "🏦 계좌이체", color: "blue" },
                { k: "other", label: "📱 기타", color: "amber" },
              ].map((m) => (
                <div key={m.k} className="flex items-center gap-2">
                  <span className={`text-xs w-20 text-${m.color}-700 font-semibold`}>{m.label}</span>
                  <input type="number" value={f.payment_methods?.[m.k] || 0}
                    onChange={(e) => setF({ ...f, payment_methods: { ...f.payment_methods, [m.k]: Number(e.target.value) || 0 } })}
                    className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm text-right" />
                  <span className="text-xs text-gray-500 w-6">원</span>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-200 flex justify-between text-xs">
                <span className="text-gray-600">총액</span>
                <b className={totalPaid === Number(f.amount) ? "text-green-600" : "text-red-600"}>
                  ₩{totalPaid.toLocaleString()} / ₩{Number(f.amount).toLocaleString()}
                </b>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-gray-700 mb-1">메모 (선택)</div>
            <input value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })}
              placeholder="예: 이벤트 할인, 형제 할인"
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">취소</button>
          <button onClick={save} disabled={saving}
            className="px-5 py-2 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center gap-1">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중...</> : <>💾 저장</>}
          </button>
        </div>
      </div>
    </div>
  );
}
