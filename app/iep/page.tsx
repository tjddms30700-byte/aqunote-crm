"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import HomeButton from "@/components/HomeButton";
import MemberSearch from "@/components/MemberSearch";
import {
  Target, Plus, X, Save, Sparkles, TrendingUp, User,
  Trash2, Edit, Check, ChevronDown, ChevronRight, BarChart3, Loader2
} from "lucide-react";

const STATUS = {
  in_progress:  { label: "진행 중",  color: "bg-blue-100 text-blue-700 border-blue-300" },
  achieved:     { label: "달성 완료", color: "bg-green-100 text-green-700 border-green-300" },
  paused:       { label: "일시중단", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  discontinued: { label: "중단",    color: "bg-gray-100 text-gray-600 border-gray-300" },
};

const PROMPT_LEVELS = [
  { v: "independent", label: "독립수행",   color: "bg-green-500" },
  { v: "gestural",    label: "몸짓촉구",   color: "bg-yellow-500" },
  { v: "verbal",      label: "언어촉구",   color: "bg-orange-500" },
  { v: "physical",    label: "신체촉구",   color: "bg-red-500" },
];

export default function IEPPage() {
  const [members, setMembers]     = useState<any[]>([]);
  const [domains, setDomains]     = useState<any[]>([]);
  const [curriculum, setCurriculum] = useState<any[]>([]);
  const [goals, setGoals]         = useState<any[]>([]);
  const [progress, setProgress]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);

  const [selectedMember, setSelectedMember] = useState<string>("");
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);

  // Modal states
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState<{ goalId: string, goalTitle: string } | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const [goalForm, setGoalForm] = useState<any>({
    domain_code: "gross_motor",
    goal_type: "short",
    title: "",
    description: "",
    target_criteria: "80% 이상 성공률 · 3회 연속 달성",
    teaching_method: "",
    curriculum_id: "",
    target_date: new Date(Date.now() + 90*86400000).toISOString().slice(0,10),
    status: "in_progress",
    progress_percent: 0,
  });

  const [recordForm, setRecordForm] = useState<any>({
    trials_total: 5, trials_success: 0, rating: 3,
    prompt_level: "verbal", note: "",
  });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [mRes, dRes, cRes, gRes, pRes] = await Promise.all([
      supabase.from("members").select("id, name, member_type, status").is("deleted_at", null).eq("status", "regular").order("name"),
      supabase.from("developmental_domains").select("*").order("sort_order"),
      supabase.from("curriculum_items").select("*").order("domain_code").order("level"),
      supabase.from("iep_goals").select("*").order("created_at", { ascending: false }),
      supabase.from("iep_progress_records").select("*").order("record_date", { ascending: false }),
    ]);
    setMembers(mRes.data || []);
    setDomains(dRes.data || []);
    setCurriculum(cRes.data || []);
    setGoals(gRes.data || []);
    setProgress(pRes.data || []);
    if (!selectedMember && mRes.data && mRes.data.length > 0) {
      setSelectedMember(mRes.data[0].id);
    }
    setLoading(false);
  }

  const memberGoals = useMemo(() =>
    goals.filter(g => g.member_id === selectedMember),
  [goals, selectedMember]);

  const goalsByDomain = useMemo(() => {
    const map: Record<string, any[]> = {};
    memberGoals.forEach(g => {
      if (!map[g.domain_code]) map[g.domain_code] = [];
      map[g.domain_code].push(g);
    });
    return map;
  }, [memberGoals]);

  function progressForGoal(goalId: string) {
    return progress.filter(p => p.goal_id === goalId).slice(0, 20);
  }

  async function saveGoal() {
    if (!goalForm.title || !selectedMember) return;
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const payload: any = {
      org_id: orgId,
      member_id: selectedMember,
      domain_code: goalForm.domain_code,
      goal_type: goalForm.goal_type,
      title: goalForm.title,
      description: goalForm.description || null,
      target_criteria: goalForm.target_criteria || null,
      teaching_method: goalForm.teaching_method || null,
      curriculum_id: goalForm.curriculum_id || null,
      target_date: goalForm.target_date || null,
      status: goalForm.status,
      progress_percent: goalForm.progress_percent || 0,
    };
    if (goalForm.id) {
      await supabase.from("iep_goals").update(payload).eq("id", goalForm.id);
    } else {
      await supabase.from("iep_goals").insert(payload);
    }
    setShowGoalModal(false);
    await loadAll();
  }

  async function deleteGoal(id: string) {
    if (!confirm("이 목표를 삭제할까요?\n(진도 기록도 함께 삭제됩니다)")) return;
    await supabase.from("iep_goals").delete().eq("id", id);
    await loadAll();
  }

  async function updateGoalStatus(id: string, status: string) {
    await supabase.from("iep_goals").update({
      status,
      progress_percent: status === "achieved" ? 100 : undefined
    }).eq("id", id);
    await loadAll();
  }

  async function saveRecord() {
    if (!showRecordModal) return;
    const rate = recordForm.trials_total > 0
      ? (recordForm.trials_success / recordForm.trials_total) * 100
      : 0;
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    await supabase.from("iep_progress_records").insert({
      org_id: orgId,
      goal_id: showRecordModal.goalId,
      member_id: selectedMember,
      trials_total: recordForm.trials_total,
      trials_success: recordForm.trials_success,
      success_rate: rate,
      rating: recordForm.rating,
      prompt_level: recordForm.prompt_level,
      note: recordForm.note || null,
    });
    // 목표의 progress_percent도 최근 5회 평균으로 자동 업데이트
    const recentRecords = progress.filter(p => p.goal_id === showRecordModal.goalId).slice(0, 4);
    const avgRate = (recentRecords.reduce((s, r) => s + Number(r.success_rate || 0), 0) + rate) / (recentRecords.length + 1);
    await supabase.from("iep_goals").update({
      progress_percent: Math.round(avgRate)
    }).eq("id", showRecordModal.goalId);

    setShowRecordModal(null);
    setRecordForm({ trials_total: 5, trials_success: 0, rating: 3, prompt_level: "verbal", note: "" });
    await loadAll();
  }

  async function requestAIAnalysis(goalId: string) {
    setAiLoading(true); setShowAIModal(true); setAiResult("");
    const goal = goals.find(g => g.id === goalId);
    const records = progressForGoal(goalId);
    const member = members.find(m => m.id === selectedMember);
    const res = await fetch("/api/analyze", {
      method: "POST",
      body: JSON.stringify({ type: "iep_goal", member, goal, records }),
    });
    const data = await res.json();
    setAiResult(data.analysis || "AI 분석 실패");
    setAiLoading(false);
  }

  function selectCurriculum(cid: string) {
    const c = curriculum.find(x => x.id === cid);
    if (!c) return;
    setGoalForm({
      ...goalForm,
      curriculum_id: cid,
      domain_code: c.domain_code,
      title: c.goal,
      description: c.description || "",
      teaching_method: c.teaching_method || "",
    });
  }

  const domainCurriculum = curriculum.filter(c => c.domain_code === goalForm.domain_code);

  const selectedMemberName = members.find(m => m.id === selectedMember)?.name;

  // 통계
  const stats = useMemo(() => {
    const active = memberGoals.filter(g => g.status === "in_progress").length;
    const achieved = memberGoals.filter(g => g.status === "achieved").length;
    const total = memberGoals.length;
    const avgProgress = total > 0
      ? Math.round(memberGoals.reduce((s, g) => s + (g.progress_percent || 0), 0) / total)
      : 0;
    return { active, achieved, total, avgProgress };
  }, [memberGoals]);

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
          <Target className="w-6 h-6 md:w-7 md:h-7 text-purple-500" /> IEP 목표 관리
        </h1>
        <HomeButton />
      </div>

      {/* Member selector */}
      <div className="mb-4 bg-white rounded-xl border border-aqu-100 p-3 flex flex-wrap items-center gap-3">
        <User className="w-4 h-4 text-aqu-600" />
        <div className="flex-1 max-w-xs">
          <MemberSearch members={members} value={selectedMember} onChange={setSelectedMember} />
        </div>
        {selectedMemberName && (
          <>
            <Link href={`/members/${selectedMember}`} className="text-xs text-aqu-600 hover:underline">
              → {selectedMemberName} 회원 상세
            </Link>
            <button onClick={() => {
              setGoalForm({
                domain_code: "gross_motor", goal_type: "short", title: "",
                description: "", target_criteria: "80% 이상 성공률 · 3회 연속 달성",
                teaching_method: "", curriculum_id: "",
                target_date: new Date(Date.now() + 90*86400000).toISOString().slice(0,10),
                status: "in_progress", progress_percent: 0,
              });
              setShowGoalModal(true);
            }}
              className="ml-auto bg-aqu-600 hover:bg-aqu-700 text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> 목표 추가
            </button>
          </>
        )}
      </div>

      {selectedMember && (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4">
            <KPI label="전체 목표"   val={stats.total + "개"}   color="text-aqu-700" />
            <KPI label="진행 중"    val={stats.active + "개"}   color="text-blue-600" />
            <KPI label="✓ 달성 완료" val={stats.achieved + "개"} color="text-green-600" />
            <KPI label="평균 진도"  val={stats.avgProgress + "%"} color="text-purple-600" />
          </div>

          {loading ? (
            <div className="text-center py-10 text-gray-500">로딩 중...</div>
          ) : memberGoals.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 text-center py-16 text-gray-400">
              <Target className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="mb-3">아직 설정된 목표가 없습니다</p>
              <button onClick={() => setShowGoalModal(true)}
                className="bg-aqu-600 hover:bg-aqu-700 text-white px-4 py-2 rounded-lg text-sm inline-flex items-center gap-1">
                <Plus className="w-4 h-4" /> 첫 목표 만들기
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {domains.filter(d => goalsByDomain[d.code]).map(d => (
                <div key={d.code} className="bg-white rounded-2xl shadow-sm border border-aqu-100 overflow-hidden">
                  <div className="bg-gradient-to-r from-aqu-50 to-blue-50 px-4 py-2.5 border-b border-aqu-100 flex items-center gap-2">
                    <span className="text-xl">{d.icon}</span>
                    <span className="font-bold text-aqu-900">{d.name}</span>
                    <span className="text-xs text-gray-500">· {goalsByDomain[d.code].length}개 목표</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {goalsByDomain[d.code].map(g => {
                      const st = STATUS[g.status as keyof typeof STATUS] || STATUS.in_progress;
                      const records = progressForGoal(g.id);
                      const isExpanded = expandedGoal === g.id;
                      return (
                        <div key={g.id} className="p-3 md:p-4 hover:bg-aqu-50/30 transition">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className={`text-[10px] px-2 py-0.5 rounded border ${st.color}`}>{st.label}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded ${g.goal_type === "long" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                                  {g.goal_type === "long" ? "장기" : "단기"}
                                </span>
                                {g.target_date && (
                                  <span className="text-[10px] text-gray-500">🎯 {g.target_date}까지</span>
                                )}
                              </div>
                              <div className="font-medium text-aqu-900 text-sm md:text-base cursor-pointer"
                                onClick={() => setExpandedGoal(isExpanded ? null : g.id)}>
                                {isExpanded ? <ChevronDown className="w-3 h-3 inline mr-1" /> : <ChevronRight className="w-3 h-3 inline mr-1" />}
                                {g.title}
                              </div>
                              {g.description && (
                                <div className="text-xs text-gray-600 mt-0.5 pl-4">{g.description}</div>
                              )}
                              {/* Progress bar */}
                              <div className="mt-2 flex items-center gap-2 pl-4">
                                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${
                                    g.progress_percent >= 80 ? "bg-green-500" :
                                    g.progress_percent >= 50 ? "bg-yellow-500" : "bg-orange-400"
                                  }`} style={{ width: `${g.progress_percent || 0}%` }} />
                                </div>
                                <span className="text-xs font-bold text-gray-700 w-10">{g.progress_percent || 0}%</span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <button onClick={() => setShowRecordModal({ goalId: g.id, goalTitle: g.title })}
                                className="text-[10px] px-2 py-1 bg-aqu-600 hover:bg-aqu-700 text-white rounded flex items-center gap-1">
                                <Plus className="w-3 h-3" /> 기록
                              </button>
                              <button onClick={() => requestAIAnalysis(g.id)}
                                className="text-[10px] px-2 py-1 bg-purple-500 hover:bg-purple-600 text-white rounded flex items-center gap-1">
                                <Sparkles className="w-3 h-3" /> AI
                              </button>
                            </div>
                          </div>

                          {/* Expanded: 최근 기록 */}
                          {isExpanded && (
                            <div className="mt-3 pl-4 space-y-2">
                              {g.target_criteria && (
                                <div className="text-xs bg-blue-50 border border-blue-200 rounded p-2">
                                  <b>성취 기준:</b> {g.target_criteria}
                                </div>
                              )}
                              {g.teaching_method && (
                                <div className="text-xs bg-emerald-50 border border-emerald-200 rounded p-2">
                                  <b>교육 방법:</b> {g.teaching_method}
                                </div>
                              )}

                              {records.length > 0 && (
                                <div>
                                  <div className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                                    <BarChart3 className="w-3.5 h-3.5" /> 최근 진도 ({records.length}회)
                                  </div>
                                  {/* Success rate 미니 차트 */}
                                  <div className="flex items-end gap-0.5 h-16 bg-gray-50 rounded p-1 mb-2">
                                    {records.slice(0, 15).reverse().map((r, i) => (
                                      <div key={i} className="flex-1 flex flex-col justify-end" title={`${r.record_date}: ${r.success_rate}%`}>
                                        <div className={`w-full rounded-t ${
                                          Number(r.success_rate) >= 80 ? "bg-green-500" :
                                          Number(r.success_rate) >= 50 ? "bg-yellow-500" : "bg-orange-400"
                                        }`} style={{ height: `${Math.max(3, Number(r.success_rate))}%` }}></div>
                                      </div>
                                    ))}
                                  </div>
                                  {/* 기록 리스트 */}
                                  <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {records.slice(0, 5).map(r => (
                                      <div key={r.id} className="text-[11px] flex items-center gap-2 bg-white border border-gray-100 rounded px-2 py-1">
                                        <span className="text-gray-500">{r.record_date}</span>
                                        <span className="font-bold">{r.trials_success}/{r.trials_total}</span>
                                        <span className="text-gray-700">({Number(r.success_rate).toFixed(0)}%)</span>
                                        {r.prompt_level && (
                                          <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100">
                                            {PROMPT_LEVELS.find(p => p.v === r.prompt_level)?.label}
                                          </span>
                                        )}
                                        {r.note && <span className="text-gray-500 italic truncate flex-1">{r.note}</span>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* 상태 변경 & 삭제 */}
                              <div className="flex flex-wrap gap-1 pt-2">
                                {Object.entries(STATUS).map(([key, s]) => (
                                  <button key={key} onClick={() => updateGoalStatus(g.id, key)}
                                    className={`text-[10px] px-2 py-1 rounded border ${g.status === key ? s.color + " font-bold" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                                    {s.label}
                                  </button>
                                ))}
                                <button onClick={() => deleteGoal(g.id)}
                                  className="text-[10px] px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50 ml-auto">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Goal Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3"
          onClick={() => setShowGoalModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 max-h-[95vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-aqu-900">🎯 새 IEP 목표</h2>
              <button onClick={() => setShowGoalModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="space-y-3">
              {/* 영역 */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">발달 영역</label>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-1">
                  {domains.map(d => (
                    <button key={d.code} onClick={() => setGoalForm({ ...goalForm, domain_code: d.code, curriculum_id: "" })}
                      className={`py-2 rounded-lg text-[11px] border ${goalForm.domain_code === d.code ? "bg-aqu-500 text-white border-aqu-600 font-bold" : "bg-white border-gray-200 hover:bg-gray-50"}`}>
                      {d.icon} {d.name.replace(/^[^ ]+ /, "")}
                    </button>
                  ))}
                </div>
              </div>

              {/* 유형 */}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">목표 유형</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setGoalForm({ ...goalForm, goal_type: "long" })}
                    className={`py-2 rounded-lg border text-sm ${goalForm.goal_type === "long" ? "bg-purple-100 border-purple-500 text-purple-800 font-bold" : "bg-white border-gray-200"}`}>
                    📅 장기 (6~12개월)
                  </button>
                  <button onClick={() => setGoalForm({ ...goalForm, goal_type: "short" })}
                    className={`py-2 rounded-lg border text-sm ${goalForm.goal_type === "short" ? "bg-blue-100 border-blue-500 text-blue-800 font-bold" : "bg-white border-gray-200"}`}>
                    ⚡ 단기 (1~3개월)
                  </button>
                </div>
              </div>

              {/* 커리큘럼 선택 */}
              {domainCurriculum.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">커리큘럼 템플릿 선택 (선택)</label>
                  <select value={goalForm.curriculum_id} onChange={e => selectCurriculum(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
                    <option value="">-- 직접 입력 --</option>
                    {domainCurriculum.map(c => (
                      <option key={c.id} value={c.id}>
                        [{c.level === "basic" ? "기초" : c.level === "intermediate" ? "중급" : "심화"}] {c.goal} ({c.age_range})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">목표 (SMART) *</label>
                <input type="text" value={goalForm.title} onChange={e => setGoalForm({ ...goalForm, title: e.target.value })}
                  placeholder="예: 한 발로 5초 서기"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">성취 기준</label>
                <input type="text" value={goalForm.target_criteria} onChange={e => setGoalForm({ ...goalForm, target_criteria: e.target.value })}
                  placeholder="예: 3회 연속 성공, 80% 이상 정반응"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">교육 방법</label>
                <textarea value={goalForm.teaching_method} onChange={e => setGoalForm({ ...goalForm, teaching_method: e.target.value })}
                  rows={2} placeholder="예: 벽 잡고 시작 → 손 놓기 → 눈 감기 순서로 단계적 진행"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none resize-none" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">상세 설명 (선택)</label>
                <textarea value={goalForm.description} onChange={e => setGoalForm({ ...goalForm, description: e.target.value })}
                  rows={2} placeholder="배경, 이유 등 자유 기재"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none resize-none" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">목표 종료일</label>
                <input type="date" value={goalForm.target_date} onChange={e => setGoalForm({ ...goalForm, target_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowGoalModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">취소</button>
              <button onClick={saveGoal} disabled={!goalForm.title}
                className="flex-1 px-4 py-2 bg-aqu-600 hover:bg-aqu-700 text-white rounded-lg text-sm disabled:opacity-50 flex items-center justify-center gap-1">
                <Save className="w-4 h-4" /> 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Modal */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3"
          onClick={() => setShowRecordModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-aqu-900">📊 진도 기록</h2>
              <button onClick={() => setShowRecordModal(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="text-xs text-gray-600 mb-3 p-2 bg-aqu-50 rounded">🎯 {showRecordModal.goalTitle}</div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">시도 총 횟수</label>
                  <input type="number" value={recordForm.trials_total} min={0}
                    onChange={e => setRecordForm({ ...recordForm, trials_total: parseInt(e.target.value)||0 })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">성공 횟수</label>
                  <input type="number" value={recordForm.trials_success} min={0} max={recordForm.trials_total}
                    onChange={e => setRecordForm({ ...recordForm, trials_success: parseInt(e.target.value)||0 })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              <div className="text-center py-2 bg-gradient-to-r from-aqu-50 to-blue-50 rounded-lg">
                <div className="text-xs text-gray-600">정반응률</div>
                <div className="text-2xl font-bold text-aqu-700">
                  {recordForm.trials_total > 0
                    ? ((recordForm.trials_success / recordForm.trials_total) * 100).toFixed(0)
                    : 0}%
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">촉구 수준</label>
                <div className="grid grid-cols-4 gap-1">
                  {PROMPT_LEVELS.map(p => (
                    <button key={p.v} onClick={() => setRecordForm({ ...recordForm, prompt_level: p.v })}
                      className={`py-1.5 rounded text-[10px] border ${recordForm.prompt_level === p.v ? p.color + " text-white font-bold border-transparent" : "bg-white border-gray-200"}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">평점 (1-5)</label>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setRecordForm({ ...recordForm, rating: n })}
                      className={`flex-1 py-2 rounded text-sm ${recordForm.rating >= n ? "bg-yellow-400 text-white font-bold" : "bg-gray-100"}`}>
                      ⭐
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">관찰 메모</label>
                <textarea value={recordForm.note} onChange={e => setRecordForm({ ...recordForm, note: e.target.value })}
                  rows={2} placeholder="아이의 반응, 특이사항 등"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowRecordModal(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">취소</button>
              <button onClick={saveRecord}
                className="flex-1 px-4 py-2 bg-aqu-600 hover:bg-aqu-700 text-white rounded-lg text-sm flex items-center justify-center gap-1">
                <Save className="w-4 h-4" /> 기록 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3"
          onClick={() => setShowAIModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-aqu-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" /> AI 목표 분석
              </h2>
              <button onClick={() => setShowAIModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {aiLoading ? (
              <div className="text-center py-10 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-aqu-500" />
                분석 중...
              </div>
            ) : (
              <div className="whitespace-pre-wrap text-sm text-gray-800 bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-4 border border-purple-200">
                {aiResult}
              </div>
            )}
            <button onClick={() => {
                navigator.clipboard.writeText(aiResult);
                alert("복사되었습니다");
              }}
              className="mt-3 w-full py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
              📋 복사
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function KPI({ label, val, color }: any) {
  return (
    <div className="bg-white p-2 md:p-3 rounded-xl shadow-sm border border-aqu-100 text-center">
      <div className="text-[10px] md:text-xs text-gray-500">{label}</div>
      <div className={`text-base md:text-xl font-bold ${color}`}>{val}</div>
    </div>
  );
}
