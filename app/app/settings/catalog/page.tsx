"use client";

// ═══════════════════════════════════════════════════════════════
// ⚙️ v3.40.0 회원권 · 이용 프로그램 통합 관리 페이지
// URL: /settings/catalog
// 상단 탭 [💳 회원권] [🎯 이용 프로그램] 으로 전환
// 디자인은 /settings/programs 스타일로 통일
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Plus, Trash2, Save, ChevronLeft, Settings, Edit3, Ticket, Target } from "lucide-react";

// ───────────────────────────────────────────────────────────────
// 공통 카테고리 정의 (회원권 · 프로그램 공용)
// ───────────────────────────────────────────────────────────────
const CATEGORY_OPTIONS = [
  { v: "aqua",   label: "🏊‍♂️ 수중재활",   color: "bg-sky-100 text-sky-800 border-sky-300" },
  { v: "ground", label: "🏋️‍♂️ 지상재활",   color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  { v: "device", label: "🧬 디바이스케어", color: "bg-purple-100 text-purple-800 border-purple-300" },
  { v: "common", label: "🌐 공통",         color: "bg-slate-100 text-slate-800 border-slate-300" },
];

// ───────────────────────────────────────────────────────────────
// 타입 정의
// ───────────────────────────────────────────────────────────────
type Plan = {
  id?: string;
  name: string;
  sessions: number;
  price: number;
  valid_days: number;
  category: string;
  description?: string;
  is_active: boolean;
  sort_order: number;
};

type Program = {
  id?: string;
  key: string;
  label: string;
  category: "aqua" | "ground" | "device" | "common";
  description?: string;
  sort_order: number;
  is_active: boolean;
};

const DEFAULT_PROGRAMS: Program[] = [
  { key: "aqua_therapy", label: "1:1 맞춤 수중재활", category: "aqua", description: "일대일 수중재활 치료", sort_order: 10, is_active: true },
  { key: "aqua_group",   label: "그룹 수중운동",     category: "aqua", description: "그룹 수중 운동",     sort_order: 20, is_active: true },
  { key: "movement",     label: "1:1 맞춤 운동재활", category: "ground", description: "지상 일대일 운동재활", sort_order: 30, is_active: true },
  { key: "posture",      label: "체형교정",           category: "ground", description: "자세·체형 교정",     sort_order: 40, is_active: true },
  { key: "device",       label: "디바이스 케어 (근막·소닉)", category: "device", description: "근막·소닉 디바이스", sort_order: 50, is_active: true },
];

const STORAGE_KEY = "aqunote_service_programs_v1";

export default function CatalogPage() {
  const [tab, setTab] = useState<"plans" | "programs">("plans");
  const [filterCat, setFilterCat] = useState<"all" | "aqua" | "ground" | "device" | "common">("all");

  // URL 쿼리 파라미터 기반 초기 탭
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const t = p.get("tab");
    if (t === "programs" || t === "plans") setTab(t);
  }, []);

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-10 min-h-screen bg-gradient-to-br from-slate-50 to-white">
      {/* 헤더 */}
      <div className="mb-6">
        <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-2">
          <ChevronLeft className="w-4 h-4" /> 설정으로 돌아가기
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-2">
          <Settings className="w-7 h-7 text-emerald-600" />
          ⚙️ 회원권 · 이용 프로그램 관리
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          결제 시 선택되는 <b>회원권</b>과 계약서 제2조에 반영되는 <b>이용 프로그램</b>을 한 곳에서 관리합니다.
        </p>
      </div>

      {/* 상단 대탭 - 회원권 / 이용 프로그램 */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-1.5 flex mb-4">
        <button onClick={() => { setTab("plans"); setFilterCat("all"); }}
          className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 ${
            tab === "plans"
              ? "bg-gradient-to-r from-aqu-500 to-blue-600 text-white shadow"
              : "text-slate-600 hover:bg-slate-50"
          }`}>
          <Ticket className="w-4 h-4" /> 💳 회원권
        </button>
        <button onClick={() => { setTab("programs"); setFilterCat("all"); }}
          className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 ${
            tab === "programs"
              ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow"
              : "text-slate-600 hover:bg-slate-50"
          }`}>
          <Target className="w-4 h-4" /> 🎯 이용 프로그램
        </button>
      </div>

      {tab === "plans"
        ? <PlansSection filterCat={filterCat} setFilterCat={setFilterCat} />
        : <ProgramsSection filterCat={filterCat} setFilterCat={setFilterCat} />}
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════
// 💳 회원권 섹션
// ═══════════════════════════════════════════════════════════════
function PlansSection({ filterCat, setFilterCat }: any) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const { data } = await supabase.from("membership_plans")
      .select("*").order("sort_order").order("price");
    setPlans((data as Plan[]) || []);
    setLoading(false);
  }

  async function addPlan() {
    const name = prompt("추가할 회원권명을 입력하세요\n예: 10회권, 주2회권");
    if (!name || !name.trim()) return;
    const catInput = prompt("카테고리 (aqua/ground/device)", "aqua");
    const cat = ["aqua","ground","device"].includes(catInput || "") ? (catInput as any) : "aqua";
    const sessStr = prompt("총 회수 (숫자)", "10");
    const priceStr = prompt("가격 (원)", "500000");
    const validStr = prompt("유효기간 (일)", "90");

    const newPlan: Plan = {
      name: name.trim(),
      category: cat,
      sessions: Number(sessStr) || 10,
      price: Number(priceStr) || 0,
      valid_days: Number(validStr) || 90,
      is_active: true,
      sort_order: (plans.length + 1) * 10,
    };

    setSaving(true);
    try {
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      const payload: any = { ...newPlan, org_id: orgId };
      const { data, error } = await supabase.from("membership_plans").insert(payload).select().single();
      if (error) { alert("추가 실패: " + error.message); return; }
      setPlans([...plans, data as Plan]);
    } finally { setSaving(false); }
  }

  function updatePlan(idx: number, patch: Partial<Plan>) {
    setPlans(plans.map((p, i) => i === idx ? { ...p, ...patch } : p));
  }

  async function savePlanDB(idx: number) {
    const p = plans[idx];
    if (!p.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("membership_plans")
        .update({
          name: p.name,
          category: p.category,
          sessions: p.sessions,
          price: p.price,
          valid_days: p.valid_days,
          description: p.description || null,
          sort_order: p.sort_order,
          is_active: p.is_active,
        })
        .eq("id", p.id);
      if (error) alert("저장 실패: " + error.message);
    } finally { setSaving(false); }
  }

  async function deletePlan(idx: number) {
    const p = plans[idx];
    if (!confirm(`"${p.name}" 회원권을 삭제하시겠습니까?\n(이미 판매된 이력은 유지됩니다)`)) return;
    if (p.id) {
      const { error } = await supabase.from("membership_plans").delete().eq("id", p.id);
      if (error) { alert("삭제 실패: " + error.message); return; }
    }
    setPlans(plans.filter((_, i) => i !== idx));
  }

  async function toggleActive(idx: number) {
    const p = plans[idx];
    setPlans(plans.map((pp, i) => i === idx ? { ...pp, is_active: !pp.is_active } : pp));
    if (p.id) {
      await supabase.from("membership_plans").update({ is_active: !p.is_active }).eq("id", p.id);
    }
  }

  async function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...plans];
    [next[idx-1], next[idx]] = [next[idx], next[idx-1]];
    next.forEach((p, i) => { p.sort_order = (i + 1) * 10; });
    setPlans(next);
    for (const it of [next[idx-1], next[idx]]) {
      if (it.id) await supabase.from("membership_plans").update({ sort_order: it.sort_order }).eq("id", it.id);
    }
  }

  const filtered = plans.filter(p => {
    if (filterCat === "all") return true;
    const c = (p.category || "aqua").toLowerCase();
    if (filterCat === "aqua") return c === "aqua" || c === "regular" || c === "trial" || c === "special";
    return c === filterCat;
  });
  const catStyle = (c: string) => CATEGORY_OPTIONS.find(x => x.v === c)?.color || "bg-slate-100 text-slate-800";
  const catLabel = (c: string) => CATEGORY_OPTIONS.find(x => x.v === c)?.label || c;

  return (
    <>
      {/* 카테고리 필터 + 추가 버튼 */}
      <div className="flex flex-wrap gap-2 items-center mb-4 bg-white rounded-2xl p-3 shadow-sm border border-slate-200">
        <button onClick={() => setFilterCat("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold ${filterCat === "all" ? "bg-slate-800 text-white shadow" : "bg-white border border-slate-200 text-slate-600"}`}>
          전체 ({plans.length})
        </button>
        {CATEGORY_OPTIONS.filter(c => c.v !== "common").map(c => {
          const cnt = plans.filter(p => (p.category || "aqua") === c.v).length;
          return (
            <button key={c.v} onClick={() => setFilterCat(c.v as any)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filterCat === c.v ? c.color + " ring-2 ring-offset-1" : "bg-white border-slate-200 text-slate-600"}`}>
              {c.label} ({cnt})
            </button>
          );
        })}

        <div className="flex-1" />

        <button onClick={addPlan} disabled={saving}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-aqu-500 to-blue-600 text-white text-sm font-bold hover:opacity-90 flex items-center gap-1 shadow disabled:opacity-50">
          <Plus className="w-4 h-4" /> 회원권 추가
        </button>
      </div>

      {/* 회원권 목록 테이블 */}
      <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-500">로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <div className="text-3xl mb-2">🎟️</div>
            등록된 회원권이 없습니다.<br/>
            <span className="text-xs">우측 상단 <b>회원권 추가</b> 버튼을 클릭하세요.</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="w-12 p-2 text-center text-xs font-semibold text-slate-600">순서</th>
                <th className="w-24 p-2 text-left text-xs font-semibold text-slate-600">카테고리</th>
                <th className="p-2 text-left text-xs font-semibold text-slate-600">회원권명</th>
                <th className="w-20 p-2 text-center text-xs font-semibold text-slate-600">회수</th>
                <th className="w-28 p-2 text-right text-xs font-semibold text-slate-600">가격</th>
                <th className="w-20 p-2 text-center text-xs font-semibold text-slate-600">유효기간</th>
                <th className="w-20 p-2 text-center text-xs font-semibold text-slate-600">활성</th>
                <th className="w-24 p-2 text-center text-xs font-semibold text-slate-600">작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const idx = plans.findIndex(pp => pp.id === p.id);
                const isEditing = editingKey === p.id;
                return (
                  <tr key={p.id || p.name} className={`border-b border-slate-100 hover:bg-slate-50/50 ${!p.is_active ? "opacity-50" : ""}`}>
                    <td className="p-2 text-center">
                      <button onClick={() => moveUp(idx)} disabled={idx === 0}
                        className="text-slate-400 hover:text-slate-700 disabled:opacity-30" title="위로">▲</button>
                    </td>
                    <td className="p-2">
                      {isEditing ? (
                        <select value={p.category || "aqua"}
                          onChange={e => updatePlan(idx, { category: e.target.value })}
                          className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs">
                          {CATEGORY_OPTIONS.filter(c => c.v !== "common").map(c => (
                            <option key={c.v} value={c.v}>{c.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${catStyle(p.category || "aqua")}`}>
                          {catLabel(p.category || "aqua")}
                        </span>
                      )}
                    </td>
                    <td className="p-2">
                      {isEditing ? (
                        <input type="text" value={p.name}
                          onChange={e => updatePlan(idx, { name: e.target.value })}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-sm" />
                      ) : (
                        <span className="font-medium text-slate-800">{p.name}</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {isEditing ? (
                        <input type="number" value={p.sessions} min={0}
                          onChange={e => updatePlan(idx, { sessions: Number(e.target.value) })}
                          className="w-16 px-1 py-1 border border-slate-200 rounded text-xs text-center" />
                      ) : (
                        <span className="text-xs">{p.sessions === 0 ? "무제한" : `${p.sessions}회`}</span>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      {isEditing ? (
                        <input type="number" value={p.price} step={1000}
                          onChange={e => updatePlan(idx, { price: Number(e.target.value) })}
                          className="w-24 px-1 py-1 border border-slate-200 rounded text-xs text-right font-semibold" />
                      ) : (
                        <span className="text-sm font-bold text-aqu-700">₩{Number(p.price || 0).toLocaleString()}</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {isEditing ? (
                        <input type="number" value={p.valid_days} min={1}
                          onChange={e => updatePlan(idx, { valid_days: Number(e.target.value) })}
                          className="w-16 px-1 py-1 border border-slate-200 rounded text-xs text-center" />
                      ) : (
                        <span className="text-xs text-orange-700">{p.valid_days}일</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      <button onClick={() => toggleActive(idx)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {p.is_active ? "✅ 활성" : "⏸ 비활성"}
                      </button>
                    </td>
                    <td className="p-2 text-center">
                      {isEditing ? (
                        <button onClick={async () => { await savePlanDB(idx); setEditingKey(null); }}
                          className="text-emerald-600 hover:text-emerald-800 mr-1" title="저장">
                          <Save className="w-4 h-4 inline" />
                        </button>
                      ) : (
                        <button onClick={() => setEditingKey(p.id || null)}
                          className="text-slate-500 hover:text-slate-800 mr-1" title="편집">
                          <Edit3 className="w-4 h-4 inline" />
                        </button>
                      )}
                      <button onClick={() => deletePlan(idx)}
                        className="text-rose-400 hover:text-rose-600" title="삭제">
                        <Trash2 className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 안내 */}
      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
        <b>💡 사용 안내</b>
        <ul className="list-disc pl-5 mt-1 space-y-0.5">
          <li>회원권은 <b>/payments</b> 결제 등록 시 드롭다운에서 선택되며, 계약서(수중/지상)의 회원권 자동 바인딩에도 사용됩니다.</li>
          <li>카테고리(수중/지상/디바이스)에 따라 회원 DB·시간표·결제 페이지의 트랙 토글에 자동 분류됩니다.</li>
          <li>비활성 회원권은 신규 결제 화면에서 숨겨지지만, 기존 판매 이력은 그대로 유지됩니다.</li>
        </ul>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// 🎯 이용 프로그램 섹션
// ═══════════════════════════════════════════════════════════════
function ProgramsSection({ filterCat, setFilterCat }: any) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [useDB, setUseDB] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("service_programs")
        .select("*")
        .order("sort_order", { ascending: true });

      if (!error && Array.isArray(data)) {
        if (data.length > 0) {
          setPrograms(data as Program[]);
          setUseDB(true);
        } else {
          const seedRows = DEFAULT_PROGRAMS.map(p => ({ ...p }));
          const { data: inserted, error: insErr } = await supabase
            .from("service_programs")
            .insert(seedRows)
            .select();
          if (!insErr && inserted) {
            setPrograms(inserted as Program[]);
            setUseDB(true);
          } else {
            setPrograms(seedRows);
            setUseDB(false);
          }
        }
      } else {
        setUseDB(false);
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          try { setPrograms(JSON.parse(stored)); }
          catch { setPrograms(DEFAULT_PROGRAMS); }
        } else {
          setPrograms(DEFAULT_PROGRAMS);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  function persistLocal(list: Program[]) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
  }

  async function addProgram() {
    const label = prompt("추가할 프로그램명을 입력하세요");
    if (!label || !label.trim()) return;
    const cat = prompt("카테고리 (aqua/ground/device/common)", "ground");
    const validCat = ["aqua","ground","device","common"].includes(cat || "") ? cat as any : "ground";

    const newProg: Program = {
      key: `custom_${Date.now()}`,
      label: label.trim(),
      category: validCat,
      description: "",
      sort_order: (programs.length + 1) * 10,
      is_active: true,
    };

    if (useDB) {
      setSaving(true);
      try {
        const { data, error } = await supabase.from("service_programs").insert(newProg).select().single();
        if (error) { alert("추가 실패: " + error.message); return; }
        setPrograms([...programs, data as Program]);
      } finally { setSaving(false); }
    } else {
      const next = [...programs, newProg];
      setPrograms(next);
      persistLocal(next);
    }
  }

  function updateProgram(idx: number, patch: Partial<Program>) {
    const next = programs.map((p, i) => i === idx ? { ...p, ...patch } : p);
    setPrograms(next);
    if (!useDB) persistLocal(next);
  }

  async function saveProgramDB(idx: number) {
    if (!useDB) { persistLocal(programs); return; }
    const p = programs[idx];
    if (!p.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("service_programs")
        .update({
          label: p.label,
          category: p.category,
          description: p.description || null,
          sort_order: p.sort_order,
          is_active: p.is_active,
        })
        .eq("id", p.id);
      if (error) alert("저장 실패: " + error.message);
    } finally { setSaving(false); }
  }

  async function deleteProgram(idx: number) {
    const p = programs[idx];
    if (!confirm(`"${p.label}" 프로그램을 삭제하시겠습니까?`)) return;
    if (useDB && p.id) {
      const { error } = await supabase.from("service_programs").delete().eq("id", p.id);
      if (error) { alert("삭제 실패: " + error.message); return; }
    }
    const next = programs.filter((_, i) => i !== idx);
    setPrograms(next);
    if (!useDB) persistLocal(next);
  }

  async function toggleActive(idx: number) {
    const p = programs[idx];
    const next = programs.map((pp, i) => i === idx ? { ...pp, is_active: !pp.is_active } : pp);
    setPrograms(next);
    if (useDB && p.id) {
      await supabase.from("service_programs").update({ is_active: !p.is_active }).eq("id", p.id);
    } else {
      persistLocal(next);
    }
  }

  async function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...programs];
    [next[idx-1], next[idx]] = [next[idx], next[idx-1]];
    next.forEach((p, i) => { p.sort_order = (i + 1) * 10; });
    setPrograms(next);
    if (useDB) {
      for (const it of [next[idx-1], next[idx]]) {
        if (it.id) await supabase.from("service_programs").update({ sort_order: it.sort_order }).eq("id", it.id);
      }
    } else {
      persistLocal(next);
    }
  }

  const filtered = programs.filter(p => filterCat === "all" ? true : p.category === filterCat);
  const catStyle = (c: string) => CATEGORY_OPTIONS.find(x => x.v === c)?.color || "bg-slate-100 text-slate-800";
  const catLabel = (c: string) => CATEGORY_OPTIONS.find(x => x.v === c)?.label || c;

  return (
    <>
      {/* 카테고리 필터 + 추가 버튼 */}
      <div className="flex flex-wrap gap-2 items-center mb-4 bg-white rounded-2xl p-3 shadow-sm border border-slate-200">
        <button onClick={() => setFilterCat("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold ${filterCat === "all" ? "bg-slate-800 text-white shadow" : "bg-white border border-slate-200 text-slate-600"}`}>
          전체 ({programs.length})
        </button>
        {CATEGORY_OPTIONS.map(c => {
          const cnt = programs.filter(p => p.category === c.v).length;
          return (
            <button key={c.v} onClick={() => setFilterCat(c.v as any)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filterCat === c.v ? c.color + " ring-2 ring-offset-1" : "bg-white border-slate-200 text-slate-600"}`}>
              {c.label} ({cnt})
            </button>
          );
        })}

        <div className="flex-1" />

        {!useDB && (
          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-semibold">브라우저 저장 모드</span>
        )}

        <button onClick={addProgram} disabled={saving}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-bold hover:opacity-90 flex items-center gap-1 shadow disabled:opacity-50">
          <Plus className="w-4 h-4" /> 프로그램 추가
        </button>
      </div>

      {/* 프로그램 목록 */}
      <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-500">로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <div className="text-3xl mb-2">📭</div>
            등록된 프로그램이 없습니다.<br/>
            <span className="text-xs">우측 상단 <b>프로그램 추가</b> 버튼을 클릭하세요.</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="w-12 p-2 text-center text-xs font-semibold text-slate-600">순서</th>
                <th className="w-24 p-2 text-left text-xs font-semibold text-slate-600">카테고리</th>
                <th className="p-2 text-left text-xs font-semibold text-slate-600">프로그램명</th>
                <th className="p-2 text-left text-xs font-semibold text-slate-600 hidden md:table-cell">설명</th>
                <th className="w-20 p-2 text-center text-xs font-semibold text-slate-600">활성</th>
                <th className="w-24 p-2 text-center text-xs font-semibold text-slate-600">작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const idx = programs.findIndex(pp => (pp.id && pp.id === p.id) || (!pp.id && pp.key === p.key));
                const isEditing = editingKey === (p.id || p.key);
                return (
                  <tr key={p.id || p.key} className={`border-b border-slate-100 hover:bg-slate-50/50 ${!p.is_active ? "opacity-50" : ""}`}>
                    <td className="p-2 text-center">
                      <button onClick={() => moveUp(idx)} disabled={idx === 0}
                        className="text-slate-400 hover:text-slate-700 disabled:opacity-30" title="위로">▲</button>
                    </td>
                    <td className="p-2">
                      {isEditing ? (
                        <select value={p.category}
                          onChange={e => updateProgram(idx, { category: e.target.value as any })}
                          className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs">
                          {CATEGORY_OPTIONS.map(c => (<option key={c.v} value={c.v}>{c.label}</option>))}
                        </select>
                      ) : (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${catStyle(p.category)}`}>{catLabel(p.category)}</span>
                      )}
                    </td>
                    <td className="p-2">
                      {isEditing ? (
                        <input type="text" value={p.label}
                          onChange={e => updateProgram(idx, { label: e.target.value })}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-sm" />
                      ) : (
                        <span className="font-medium text-slate-800">{p.label}</span>
                      )}
                    </td>
                    <td className="p-2 hidden md:table-cell">
                      {isEditing ? (
                        <input type="text" value={p.description || ""}
                          onChange={e => updateProgram(idx, { description: e.target.value })}
                          placeholder="설명 (선택)"
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs" />
                      ) : (
                        <span className="text-xs text-slate-500">{p.description || "-"}</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      <button onClick={() => toggleActive(idx)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {p.is_active ? "✅ 활성" : "⏸ 비활성"}
                      </button>
                    </td>
                    <td className="p-2 text-center">
                      {isEditing ? (
                        <button onClick={async () => { await saveProgramDB(idx); setEditingKey(null); }}
                          className="text-emerald-600 hover:text-emerald-800 mr-1" title="저장">
                          <Save className="w-4 h-4 inline" />
                        </button>
                      ) : (
                        <button onClick={() => setEditingKey(p.id || p.key)}
                          className="text-slate-500 hover:text-slate-800 mr-1" title="편집">
                          <Edit3 className="w-4 h-4 inline" />
                        </button>
                      )}
                      <button onClick={() => deleteProgram(idx)}
                        className="text-rose-400 hover:text-rose-600" title="삭제">
                        <Trash2 className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
        <b>💡 사용 안내</b>
        <ul className="list-disc pl-5 mt-1 space-y-0.5">
          <li>여기서 등록한 프로그램은 <b>수중재활 이용계약서</b>와 <b>지상재활·디바이스케어 이용계약서</b> 제2조 [이용 프로그램]에 자동 반영됩니다.</li>
          <li>카테고리별로 계약서에 표시되는 항목이 자동 필터링됩니다. (수중재활 → aqua+common / 지상재활 → ground+device+common)</li>
          <li>비활성 처리된 프로그램은 계약서에서 숨겨집니다. 삭제하지 않고도 임시 중단할 수 있습니다.</li>
        </ul>
      </div>
    </>
  );
}
