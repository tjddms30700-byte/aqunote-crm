"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Ticket, Home, Plus, Edit, Trash2, X, Save, Star, Power
} from "lucide-react";

const CATEGORIES = [
  { value: "trial",   label: "🎯 체험",   color: "bg-purple-100 text-purple-700" },
  { value: "regular", label: "📅 정기",   color: "bg-blue-100 text-blue-700" },
  { value: "special", label: "✨ 특별",   color: "bg-pink-100 text-pink-700" },
];

function catLabel(c: string) { return CATEGORIES.find(x => x.value === c)?.label || c; }
function catColor(c: string) { return CATEGORIES.find(x => x.value === c)?.color || "bg-gray-100"; }

type Plan = {
  id: string;
  name: string;
  sessions: number;
  price: number;
  valid_days: number;
  category: string;
  description: string;
  is_active: boolean;
  sort_order: number;
};

export default function PlansPage() {
  const [plans, setPlans]   = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState<Partial<Plan> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadPlans(); }, []);

  async function loadPlans() {
    setLoading(true);
    const { data } = await supabase.from("membership_plans")
      .select("*").order("sort_order").order("price");
    setPlans((data as Plan[]) || []);
    setLoading(false);
  }

  function openNew() {
    setModal({
      name: "", sessions: 10, price: 500000, valid_days: 90,
      category: "regular", description: "", is_active: true, sort_order: (plans.length + 1) * 10,
    });
  }

  function openEdit(p: Plan) {
    setModal({ ...p });
  }

  async function savePlan() {
    if (!modal?.name || modal.price == null || modal.sessions == null) {
      alert("이름·횟수·금액은 필수입니다");
      return;
    }
    setSaving(true);
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const payload: any = {
      name: modal.name,
      sessions: Number(modal.sessions),
      price: Number(modal.price),
      valid_days: Number(modal.valid_days || 60),
      category: modal.category || "regular",
      description: modal.description || null,
      is_active: modal.is_active !== false,
      sort_order: Number(modal.sort_order || 0),
    };
    if (!modal.id) payload.org_id = orgId;

    const { error } = modal.id
      ? await supabase.from("membership_plans").update(payload).eq("id", modal.id)
      : await supabase.from("membership_plans").insert(payload);

    if (error) alert("저장 실패: " + error.message);
    else {
      setModal(null);
      await loadPlans();
    }
    setSaving(false);
  }

  async function deletePlan(id: string) {
    if (!confirm("이 회원권을 삭제하시겠습니까?\n(이미 판매된 회원권 이력은 유지됩니다)")) return;
    const { error } = await supabase.from("membership_plans").delete().eq("id", id);
    if (error) alert("삭제 실패: " + error.message);
    else await loadPlans();
  }

  async function toggleActive(p: Plan) {
    await supabase.from("membership_plans")
      .update({ is_active: !p.is_active }).eq("id", p.id);
    await loadPlans();
  }

  return (
    <main className="max-w-6xl mx-auto px-3 md:px-6 py-6 md:py-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2 md:gap-3">
          <Link href="/" className="text-aqu-600 hover:text-aqu-800 flex items-center gap-1 text-sm">
            <Home className="w-4 h-4" /> 홈
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
            <Ticket className="w-6 h-6 md:w-7 md:h-7 text-purple-500" /> 회원권 관리
          </h1>
        </div>
        <button onClick={openNew}
          className="bg-aqu-600 hover:bg-aqu-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 shadow-sm">
          <Plus className="w-4 h-4" /> 회원권 만들기
        </button>
      </div>

      <div className="bg-aqu-50/50 border border-aqu-100 rounded-xl p-3 mb-4 text-xs md:text-sm text-aqu-800">
        💡 <b>회원권</b>은 결제 등록 시 선택 가능한 상품입니다. 이름·횟수·금액·유효기간을 자유롭게 설정하세요.
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">로딩 중...</div>
      ) : plans.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-aqu-100">
          <Ticket className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>회원권이 없습니다. "회원권 만들기"로 추가하세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {plans.map(p => (
            <div key={p.id}
              className={`bg-white rounded-2xl shadow-md border p-4 md:p-5 flex flex-col ${p.is_active ? "border-aqu-100" : "border-gray-200 opacity-60"}`}>
              <div className="flex items-start justify-between mb-2">
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${catColor(p.category)}`}>
                  {catLabel(p.category)}
                </span>
                {!p.is_active && (
                  <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded">비활성</span>
                )}
              </div>
              <h3 className="text-lg md:text-xl font-bold text-aqu-900 mb-1">{p.name}</h3>
              <div className="text-2xl md:text-3xl font-bold text-aqu-700 mb-2">
                ₩{p.price.toLocaleString()}
              </div>
              <div className="flex flex-wrap gap-1 text-xs mb-3">
                <span className="px-2 py-0.5 bg-aqu-50 text-aqu-700 rounded">
                  {p.sessions === 0 ? "무제한" : `${p.sessions}회`}
                </span>
                <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded">
                  {p.valid_days}일 유효
                </span>
                {p.sessions > 0 && p.price > 0 && (
                  <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded">
                    회당 ₩{Math.round(p.price / p.sessions).toLocaleString()}
                  </span>
                )}
              </div>
              {p.description && (
                <p className="text-xs text-gray-500 mb-3 flex-1">{p.description}</p>
              )}
              <div className="flex items-center gap-1 mt-auto pt-2 border-t border-gray-100">
                <button onClick={() => openEdit(p)}
                  className="flex-1 py-1.5 text-xs text-aqu-600 hover:bg-aqu-50 rounded flex items-center justify-center gap-1">
                  <Edit className="w-3.5 h-3.5" /> 수정
                </button>
                <button onClick={() => toggleActive(p)}
                  className="flex-1 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded flex items-center justify-center gap-1">
                  <Power className="w-3.5 h-3.5" /> {p.is_active ? "비활성" : "활성"}
                </button>
                <button onClick={() => deletePlan(p.id)}
                  className="py-1.5 px-2 text-xs text-red-500 hover:bg-red-50 rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit/New Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !saving && setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 md:p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-aqu-900">
                {modal.id ? "회원권 수정" : "새 회원권"}
              </h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <Field label="회원권 이름 *">
                <input type="text" value={modal.name || ""}
                  onChange={e => setModal({ ...modal, name: e.target.value })}
                  placeholder="예: 10회권, 주 2회 무제한권"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="총 횟수 * (0=무제한)">
                  <input type="number" value={modal.sessions ?? ""}
                    onChange={e => setModal({ ...modal, sessions: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
                </Field>
                <Field label="유효기간 (일)">
                  <input type="number" value={modal.valid_days ?? 60}
                    onChange={e => setModal({ ...modal, valid_days: parseInt(e.target.value) || 60 })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
                </Field>
              </div>

              <Field label="금액 (원) *">
                <input type="number" value={modal.price ?? ""}
                  onChange={e => setModal({ ...modal, price: parseInt(e.target.value) || 0 })}
                  placeholder="550000"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
                {modal.price && modal.sessions && modal.sessions > 0 && (
                  <div className="text-[11px] text-gray-500 mt-1">
                    회당 ₩{Math.round((modal.price || 0) / modal.sessions).toLocaleString()}
                  </div>
                )}
              </Field>

              <Field label="카테고리">
                <select value={modal.category || "regular"}
                  onChange={e => setModal({ ...modal, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="설명 (선택)">
                <textarea value={modal.description || ""}
                  onChange={e => setModal({ ...modal, description: e.target.value })}
                  rows={2}
                  placeholder="예: 주 2회 이용 권장, 이월 불가"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none resize-none" />
              </Field>

              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" checked={modal.is_active !== false} id="active"
                  onChange={e => setModal({ ...modal, is_active: e.target.checked })}
                  className="w-4 h-4" />
                <label htmlFor="active" className="text-sm text-gray-700">활성화 (결제 등록 시 노출)</label>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setModal(null)} disabled={saving}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                취소
              </button>
              <button onClick={savePlan} disabled={saving}
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

function Field({ label, children }: any) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
