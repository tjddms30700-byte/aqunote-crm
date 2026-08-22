"use client";

/**
 * ═══════════════════════════════════════════════════════════════
 * 🎯 v3.44.0 IEP 목표 라이브러리 브라우저
 * ═══════════════════════════════════════════════════════════════
 * - 4영역 필터 (물리치료/감각통합/수중재활/행동중재)
 * - 총 50개 임상 표준 목표
 * - 원클릭으로 회원에게 등록
 * ═══════════════════════════════════════════════════════════════
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Target, Filter, Plus, Check } from "lucide-react";

type GoalLibItem = {
  id: string;
  area: string;
  area_label: string;
  code: string;
  short_goal: string;
  long_goal: string | null;
  suggested_activities: string[] | null;
  measurement: string | null;
  duration_weeks: number;
  sort_order: number;
};

interface Props {
  memberId: string;
  memberName: string;
  onRegistered?: () => void;
}

const AREAS = [
  { key: "all",       label: "🌐 전체",           bg: "bg-slate-100", text: "text-slate-700",  activeBg: "bg-slate-700", activeText: "text-white" },
  { key: "physical",  label: "🦴 물리치료/운동",   bg: "bg-blue-50",   text: "text-blue-700",   activeBg: "bg-blue-600",  activeText: "text-white" },
  { key: "sensory",   label: "🧠 감각통합",        bg: "bg-purple-50", text: "text-purple-700", activeBg: "bg-purple-600",activeText: "text-white" },
  { key: "aqua",      label: "🌊 수중재활(홀티윅)",bg: "bg-cyan-50",   text: "text-cyan-700",   activeBg: "bg-cyan-600",  activeText: "text-white" },
  { key: "behavior",  label: "🎯 행동중재",        bg: "bg-rose-50",   text: "text-rose-700",   activeBg: "bg-rose-600",  activeText: "text-white" },
];

export default function IepGoalLibraryBrowser({ memberId, memberName, onRegistered }: Props) {
  const [lib, setLib] = useState<GoalLibItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [registered, setRegistered] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("iep_goal_library")
        .select("*")
        .eq("is_active", true)
        .order("area")
        .order("sort_order");
      setLib(data || []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return lib;
    return lib.filter(g => g.area === filter);
  }, [lib, filter]);

  const countByArea = useMemo(() => {
    const c: Record<string, number> = { all: lib.length };
    lib.forEach(g => { c[g.area] = (c[g.area] || 0) + 1; });
    return c;
  }, [lib]);

  async function registerGoal(item: GoalLibItem, isLong: boolean) {
    setSaving(item.id + (isLong ? "-L" : "-S"));
    try {
      const orgRes = await supabase.from("organizations").select("id").limit(1).single();
      const orgId = orgRes.data?.id;
      const domainMap: Record<string, string> = {
        physical: "gross_motor",
        sensory:  "sensory",
        aqua:     "gross_motor",
        behavior: "cognitive",
      };
      const domainCode = domainMap[item.area] || "gross_motor";
      const targetDate = new Date(Date.now() + item.duration_weeks * 7 * 86400000).toISOString().slice(0, 10);
      const goalText = isLong ? (item.long_goal || item.short_goal) : item.short_goal;

      const { error } = await supabase.from("iep_goals").insert({
        org_id: orgId,
        member_id: memberId,
        domain_code: domainCode,
        goal_type: isLong ? "long" : "short",
        title: goalText,
        description: `[라이브러리 ${item.code}] ${item.area_label} · 측정: ${item.measurement || "-"} · 목표기간 ${item.duration_weeks}주`,
        target_date: targetDate,
        status: "in_progress",
        library_code: item.code,
      });
      if (error) {
        // library_code 컬럼 없는 스키마 대응 (재시도)
        await supabase.from("iep_goals").insert({
          org_id: orgId,
          member_id: memberId,
          domain_code: domainCode,
          goal_type: isLong ? "long" : "short",
          title: goalText,
          description: `[라이브러리 ${item.code}] ${item.area_label} · 측정: ${item.measurement || "-"}`,
          target_date: targetDate,
          status: "in_progress",
        });
      }
      setRegistered(prev => new Set(prev).add(item.id + (isLong ? "-L" : "-S")));
      onRegistered?.();
    } finally {
      setSaving("");
    }
  }

  if (loading) return <div className="p-4 text-center text-slate-400 text-sm">라이브러리 로딩 중…</div>;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <Target className="w-4 h-4 text-cyan-600" />
          📚 IEP 목표 라이브러리 <span className="text-xs text-slate-500">(총 {lib.length}개)</span>
        </h3>
      </div>

      {/* 영역 필터 */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {AREAS.map(a => {
          const active = filter === a.key;
          const cnt = countByArea[a.key] || 0;
          return (
            <button key={a.key} onClick={() => setFilter(a.key)}
              className={`px-2.5 py-1.5 rounded-full text-xs font-semibold transition ${
                active ? `${a.activeBg} ${a.activeText} shadow` : `${a.bg} ${a.text} hover:opacity-80`
              }`}>
              {a.label} <span className="ml-1 text-[10px] opacity-70">{cnt}</span>
            </button>
          );
        })}
      </div>

      {/* 목표 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[500px] overflow-y-auto">
        {filtered.map(g => {
          const areaCfg = AREAS.find(a => a.key === g.area) || AREAS[0];
          const shortReg = registered.has(g.id + "-S");
          const longReg  = registered.has(g.id + "-L");
          return (
            <div key={g.id} className="p-3 border border-slate-200 rounded-xl hover:border-cyan-300 hover:shadow-sm transition bg-white">
              <div className="flex items-start justify-between mb-1.5">
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${areaCfg.bg} ${areaCfg.text} font-bold`}>{g.code}</span>
                <span className="text-[10px] text-slate-500">🕒 {g.duration_weeks}주</span>
              </div>
              <div className="text-sm font-bold text-slate-800 mb-1 leading-snug">{g.short_goal}</div>
              {g.long_goal && (
                <div className="text-[11px] text-slate-500 mb-1.5 leading-relaxed">
                  <b>장기:</b> {g.long_goal}
                </div>
              )}
              {g.measurement && (
                <div className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded mb-1.5 inline-block">
                  📊 {g.measurement}
                </div>
              )}
              {Array.isArray(g.suggested_activities) && g.suggested_activities.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {g.suggested_activities.slice(0, 4).map((a, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">#{a}</span>
                  ))}
                </div>
              )}

              {/* 등록 버튼 */}
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                <button
                  disabled={shortReg || saving === g.id + "-S"}
                  onClick={() => registerGoal(g, false)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                    shortReg
                      ? "bg-emerald-100 text-emerald-700 cursor-not-allowed"
                      : "bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200"
                  }`}>
                  {shortReg ? <><Check className="w-3 h-3" /> 등록됨</> : <><Plus className="w-3 h-3" /> 단기 목표</>}
                </button>
                <button
                  disabled={longReg || !g.long_goal || saving === g.id + "-L"}
                  onClick={() => registerGoal(g, true)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                    longReg
                      ? "bg-emerald-100 text-emerald-700 cursor-not-allowed"
                      : !g.long_goal
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200"
                  }`}>
                  {longReg ? <><Check className="w-3 h-3" /> 등록됨</> : <><Plus className="w-3 h-3" /> 장기 목표</>}
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-8 text-sm text-slate-400">
            선택한 영역에 등록된 목표가 없습니다
          </div>
        )}
      </div>
    </div>
  );
}
