"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import HomeButton from "@/components/HomeButton";
import {
  AlertTriangle, Plus, X, Save, Sparkles, Clock, Timer,
  Trash2, User, ChevronDown, ChevronRight, BarChart3, Loader2, Zap
} from "lucide-react";

const SEVERITY = {
  low:    { label: "낮음",  color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  medium: { label: "중간",  color: "bg-orange-100 text-orange-700 border-orange-300" },
  high:   { label: "높음",  color: "bg-red-100 text-red-700 border-red-300" },
  crisis: { label: "위기",  color: "bg-red-600 text-white border-red-800" },
};

const METHODS = [
  { v: "frequency", label: "빈도 (횟수)",       icon: "🔢" },
  { v: "duration",  label: "지속시간",           icon: "⏱️" },
  { v: "abc",       label: "ABC 관찰",           icon: "🧭" },
  { v: "latency",   label: "반응간 시간(잠재기)", icon: "⏳" },
];

export default function BehaviorPage() {
  const [members, setMembers]   = useState<any[]>([]);
  const [behaviors, setBehaviors] = useState<any[]>([]);
  const [records, setRecords]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selectedMember, setSelectedMember] = useState<string>("");

  const [showBehModal, setShowBehModal] = useState(false);
  const [showRecModal, setShowRecModal] = useState<any>(null);
  const [showAI, setShowAI] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [behForm, setBehForm] = useState<any>({
    name: "", operational_definition: "", severity: "medium",
    measurement_method: "frequency", intervention_plan: "",
  });
  const [recForm, setRecForm] = useState<any>({
    method: "frequency", frequency: 1, duration_seconds: 0, latency_seconds: 0,
    antecedent: "", behavior_desc: "", consequence: "",
    intervention_applied: "", effectiveness: 3, note: "",
  });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [mRes, bRes, rRes] = await Promise.all([
      supabase.from("members").select("id, name, member_type, status").is("deleted_at", null).eq("status", "regular").order("name"),
      supabase.from("problem_behaviors").select("*").order("created_at", { ascending: false }),
      supabase.from("behavior_records").select("*").order("record_date", { ascending: false }),
    ]);
    setMembers(mRes.data || []);
    setBehaviors(bRes.data || []);
    setRecords(rRes.data || []);
    if (!selectedMember && mRes.data && mRes.data.length > 0) setSelectedMember(mRes.data[0].id);
    setLoading(false);
  }

  const memberBehaviors = useMemo(() =>
    behaviors.filter(b => b.member_id === selectedMember),
  [behaviors, selectedMember]);

  function recordsFor(behId: string) {
    return records.filter(r => r.behavior_id === behId);
  }

  async function saveBehavior() {
    if (!behForm.name || !selectedMember) return;
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const payload: any = {
      org_id: orgId, member_id: selectedMember,
      name: behForm.name,
      operational_definition: behForm.operational_definition || null,
      severity: behForm.severity,
      measurement_method: behForm.measurement_method,
      intervention_plan: behForm.intervention_plan || null,
    };
    if (behForm.id) {
      await supabase.from("problem_behaviors").update(payload).eq("id", behForm.id);
    } else {
      await supabase.from("problem_behaviors").insert(payload);
    }
    setShowBehModal(false);
    setBehForm({ name: "", operational_definition: "", severity: "medium", measurement_method: "frequency", intervention_plan: "" });
    await loadAll();
  }

  async function deleteBehavior(id: string) {
    if (!confirm("이 행동과 모든 기록을 삭제할까요?")) return;
    await supabase.from("problem_behaviors").delete().eq("id", id);
    await loadAll();
  }

  async function saveRecord() {
    if (!showRecModal) return;
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const payload: any = {
      org_id: orgId,
      behavior_id: showRecModal.beh.id,
      member_id: selectedMember,
      method: recForm.method,
      antecedent: recForm.antecedent || null,
      behavior_desc: recForm.behavior_desc || null,
      consequence: recForm.consequence || null,
      intervention_applied: recForm.intervention_applied || null,
      effectiveness: recForm.effectiveness,
      note: recForm.note || null,
    };
    if (recForm.method === "frequency") payload.frequency = recForm.frequency;
    if (recForm.method === "duration")  payload.duration_seconds = recForm.duration_seconds;
    if (recForm.method === "latency")   payload.latency_seconds = recForm.latency_seconds;
    if (recForm.method === "abc")       payload.frequency = 1;

    await supabase.from("behavior_records").insert(payload);
    setShowRecModal(null);
    setRecForm({ method: "frequency", frequency: 1, duration_seconds: 0, latency_seconds: 0,
      antecedent: "", behavior_desc: "", consequence: "", intervention_applied: "", effectiveness: 3, note: "" });
    await loadAll();
  }

  async function requestAI(behId: string) {
    setShowAI(true); setAiLoading(true); setAiResult("");
    const beh = behaviors.find(b => b.id === behId);
    const recs = recordsFor(behId);
    const member = members.find(m => m.id === selectedMember);
    const res = await fetch("/api/analyze", {
      method: "POST",
      body: JSON.stringify({ type: "behavior", member, behavior: beh, records: recs }),
    });
    const data = await res.json();
    setAiResult(data.analysis || "AI 분석 실패");
    setAiLoading(false);
  }

  // 통계: 지난 7일 vs 이전 7일 빈도 비교
  function trendFor(behId: string) {
    const recs = recordsFor(behId);
    const now = new Date();
    const d7 = new Date(now); d7.setDate(now.getDate() - 7);
    const d14 = new Date(now); d14.setDate(now.getDate() - 14);
    const last7 = recs.filter(r => new Date(r.record_date) >= d7).reduce((s,r) => s + (r.frequency||1), 0);
    const prev7 = recs.filter(r => new Date(r.record_date) >= d14 && new Date(r.record_date) < d7).reduce((s,r) => s + (r.frequency||1), 0);
    const diff = last7 - prev7;
    return { last7, prev7, diff };
  }

  const selectedMemberName = members.find(m => m.id === selectedMember)?.name;

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 md:w-7 md:h-7 text-red-500" /> 행동 중재
        </h1>
        <HomeButton />
      </div>

      {/* Member selector */}
      <div className="mb-4 bg-white rounded-xl border border-aqu-100 p-3 flex flex-wrap items-center gap-3">
        <User className="w-4 h-4 text-aqu-600" />
        <select value={selectedMember} onChange={e => setSelectedMember(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm flex-1 max-w-xs">
          <option value="">-- 회원 선택 --</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.name} ({m.member_type === "child" ? "아동" : "성인"})</option>
          ))}
        </select>
        {selectedMemberName && (
          <button onClick={() => setShowBehModal(true)}
            className="ml-auto bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> 문제행동 등록
          </button>
        )}
      </div>

      {selectedMember && (
        <>
          {loading ? (
            <div className="text-center py-10 text-gray-500">로딩 중...</div>
          ) : memberBehaviors.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 text-center py-16 text-gray-400">
              <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="mb-3">등록된 문제행동이 없습니다</p>
              <button onClick={() => setShowBehModal(true)}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm inline-flex items-center gap-1">
                <Plus className="w-4 h-4" /> 첫 문제행동 등록
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {memberBehaviors.map(b => {
                const sev = SEVERITY[b.severity as keyof typeof SEVERITY];
                const recs = recordsFor(b.id);
                const trend = trendFor(b.id);
                const isExp = expanded === b.id;
                return (
                  <div key={b.id} className="bg-white rounded-2xl shadow-sm border border-aqu-100 overflow-hidden">
                    <div className="p-4 cursor-pointer hover:bg-aqu-50/30" onClick={() => setExpanded(isExp ? null : b.id)}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            {isExp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            <span className={`text-[10px] px-2 py-0.5 rounded border ${sev.color}`}>{sev.label}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                              {METHODS.find(m => m.v === b.measurement_method)?.icon} {METHODS.find(m => m.v === b.measurement_method)?.label}
                            </span>
                            {b.status === "resolved" && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-700">✓ 해결</span>
                            )}
                          </div>
                          <div className="font-bold text-aqu-900">{b.name}</div>
                          {b.operational_definition && (
                            <div className="text-xs text-gray-600 mt-1">📝 {b.operational_definition}</div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <button onClick={e => { e.stopPropagation(); setShowRecModal({ beh: b }); setRecForm({ ...recForm, method: b.measurement_method || "frequency" }); }}
                            className="text-[10px] px-2 py-1 bg-aqu-600 hover:bg-aqu-700 text-white rounded flex items-center gap-1">
                            <Plus className="w-3 h-3" /> 기록
                          </button>
                          <button onClick={e => { e.stopPropagation(); requestAI(b.id); }}
                            className="text-[10px] px-2 py-1 bg-purple-500 hover:bg-purple-600 text-white rounded flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> AI
                          </button>
                        </div>
                      </div>

                      {/* Trend + count */}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                          최근 7일: <b>{trend.last7}회</b>
                        </span>
                        <span className={`px-2 py-0.5 rounded ${trend.diff <= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                          {trend.diff === 0 ? "변화 없음" : trend.diff > 0 ? `↑ ${trend.diff}회 증가` : `↓ ${Math.abs(trend.diff)}회 감소 🎉`}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-gray-50 text-gray-700">
                          전체 기록 <b>{recs.length}건</b>
                        </span>
                      </div>
                    </div>

                    {isExp && (
                      <div className="border-t border-gray-100 p-4 bg-gray-50/50 space-y-3">
                        {b.intervention_plan && (
                          <div className="text-xs bg-purple-50 border border-purple-200 rounded p-2">
                            <b>중재 계획:</b> {b.intervention_plan}
                          </div>
                        )}

                        {/* 빈도 시각화 (지난 30일) */}
                        {recs.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                              <BarChart3 className="w-3.5 h-3.5" /> 지난 30일 발생 추이
                            </div>
                            <FrequencyChart records={recs} method={b.measurement_method} />
                          </div>
                        )}

                        {/* 최근 기록 */}
                        {recs.slice(0, 5).map(r => (
                          <div key={r.id} className="text-xs bg-white border border-gray-200 rounded p-2 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-gray-500">{r.record_date}</span>
                              <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px]">
                                {METHODS.find(m => m.v === r.method)?.icon} {METHODS.find(m => m.v === r.method)?.label}
                              </span>
                              {r.method === "frequency" && <span className="font-bold">{r.frequency}회</span>}
                              {r.method === "duration"  && <span className="font-bold">{r.duration_seconds}초</span>}
                              {r.method === "latency"   && <span className="font-bold">{r.latency_seconds}초</span>}
                              {r.effectiveness && (
                                <span className="text-yellow-500">
                                  {"⭐".repeat(r.effectiveness)}
                                </span>
                              )}
                            </div>
                            {r.method === "abc" && (
                              <div className="pl-2 space-y-0.5 text-[11px]">
                                {r.antecedent && <div>🔵 <b>A:</b> {r.antecedent}</div>}
                                {r.behavior_desc && <div>🔴 <b>B:</b> {r.behavior_desc}</div>}
                                {r.consequence && <div>🟢 <b>C:</b> {r.consequence}</div>}
                              </div>
                            )}
                            {r.intervention_applied && (
                              <div className="text-[11px] text-purple-700">💡 중재: {r.intervention_applied}</div>
                            )}
                            {r.note && <div className="text-[11px] text-gray-500 italic">"{r.note}"</div>}
                          </div>
                        ))}

                        <div className="flex gap-2">
                          <button onClick={() => deleteBehavior(b.id)}
                            className="text-[10px] px-2 py-1 border border-red-200 text-red-500 rounded hover:bg-red-50 flex items-center gap-1">
                            <Trash2 className="w-3 h-3" /> 행동 삭제
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Behavior Modal */}
      {showBehModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3" onClick={() => setShowBehModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[95vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-aqu-900">🚨 문제행동 등록</h2>
              <button onClick={() => setShowBehModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">행동명 *</label>
                <input type="text" value={behForm.name} onChange={e => setBehForm({ ...behForm, name: e.target.value })}
                  placeholder="예: 자해 · 공격행동 · 이석행동"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">조작적 정의 (관찰 가능한 형태)</label>
                <textarea value={behForm.operational_definition}
                  onChange={e => setBehForm({ ...behForm, operational_definition: e.target.value })}
                  rows={2}
                  placeholder="예: 자기 손등을 이빨로 무는 행동 (피부 자국이 남을 정도)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">심각도</label>
                <div className="grid grid-cols-4 gap-1">
                  {Object.entries(SEVERITY).map(([k, s]) => (
                    <button key={k} onClick={() => setBehForm({ ...behForm, severity: k })}
                      className={`py-1.5 rounded text-xs border ${behForm.severity === k ? s.color + " font-bold" : "bg-white border-gray-200"}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">주 측정 방법</label>
                <div className="grid grid-cols-2 gap-1">
                  {METHODS.map(m => (
                    <button key={m.v} onClick={() => setBehForm({ ...behForm, measurement_method: m.v })}
                      className={`py-1.5 rounded text-xs border ${behForm.measurement_method === m.v ? "bg-aqu-500 text-white font-bold" : "bg-white border-gray-200"}`}>
                      {m.icon} {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">중재 계획</label>
                <textarea value={behForm.intervention_plan}
                  onChange={e => setBehForm({ ...behForm, intervention_plan: e.target.value })}
                  rows={2}
                  placeholder="예: 대체행동 강화 (손 흔들기), 선행사건 통제, 정적 강화"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowBehModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">취소</button>
              <button onClick={saveBehavior} disabled={!behForm.name}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm disabled:opacity-50 flex items-center justify-center gap-1">
                <Save className="w-4 h-4" /> 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Modal */}
      {showRecModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3" onClick={() => setShowRecModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[95vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-aqu-900">📊 행동 기록</h2>
              <button onClick={() => setShowRecModal(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="text-xs text-gray-600 mb-3 p-2 bg-red-50 rounded">🚨 {showRecModal.beh.name}</div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">측정 방법</label>
                <div className="grid grid-cols-2 gap-1">
                  {METHODS.map(m => (
                    <button key={m.v} onClick={() => setRecForm({ ...recForm, method: m.v })}
                      className={`py-1.5 rounded text-xs border ${recForm.method === m.v ? "bg-aqu-500 text-white font-bold" : "bg-white border-gray-200"}`}>
                      {m.icon} {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {recForm.method === "frequency" && (
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">발생 횟수</label>
                  <input type="number" value={recForm.frequency} min={0}
                    onChange={e => setRecForm({ ...recForm, frequency: parseInt(e.target.value)||0 })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              )}
              {recForm.method === "duration" && (
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">지속 시간 (초)</label>
                  <input type="number" value={recForm.duration_seconds} min={0}
                    onChange={e => setRecForm({ ...recForm, duration_seconds: parseInt(e.target.value)||0 })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              )}
              {recForm.method === "latency" && (
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">반응간 시간 (초)</label>
                  <input type="number" value={recForm.latency_seconds} min={0}
                    onChange={e => setRecForm({ ...recForm, latency_seconds: parseInt(e.target.value)||0 })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              )}
              {recForm.method === "abc" && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-blue-600 mb-1 block">🔵 A - 선행사건 (Antecedent)</label>
                    <textarea value={recForm.antecedent} onChange={e => setRecForm({ ...recForm, antecedent: e.target.value })}
                      rows={2} placeholder="어떤 상황에서 시작되었나?"
                      className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm resize-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-red-600 mb-1 block">🔴 B - 행동 (Behavior)</label>
                    <textarea value={recForm.behavior_desc} onChange={e => setRecForm({ ...recForm, behavior_desc: e.target.value })}
                      rows={2} placeholder="정확히 어떤 행동을 했나?"
                      className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm resize-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-green-600 mb-1 block">🟢 C - 후속결과 (Consequence)</label>
                    <textarea value={recForm.consequence} onChange={e => setRecForm({ ...recForm, consequence: e.target.value })}
                      rows={2} placeholder="행동 후 무엇을 얻었나? 어떻게 대응했나?"
                      className="w-full px-3 py-2 border border-green-200 rounded-lg text-sm resize-none" />
                  </div>
                </>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">적용한 중재</label>
                <textarea value={recForm.intervention_applied}
                  onChange={e => setRecForm({ ...recForm, intervention_applied: e.target.value })}
                  rows={2} placeholder="예: 대체행동 유도, 무시 후 재지시"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">중재 효과 (1-5)</label>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setRecForm({ ...recForm, effectiveness: n })}
                      className={`flex-1 py-2 rounded ${recForm.effectiveness >= n ? "bg-yellow-400" : "bg-gray-100"}`}>
                      ⭐
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">추가 메모</label>
                <textarea value={recForm.note} onChange={e => setRecForm({ ...recForm, note: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowRecModal(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">취소</button>
              <button onClick={saveRecord}
                className="flex-1 px-4 py-2 bg-aqu-600 hover:bg-aqu-700 text-white rounded-lg text-sm flex items-center justify-center gap-1">
                <Save className="w-4 h-4" /> 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Analysis */}
      {showAI && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3" onClick={() => setShowAI(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-aqu-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" /> AI 행동중재 분석
              </h2>
              <button onClick={() => setShowAI(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {aiLoading ? (
              <div className="text-center py-10 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-purple-500" />
                패턴 분석 중...
              </div>
            ) : (
              <div className="whitespace-pre-wrap text-sm text-gray-800 bg-gradient-to-br from-purple-50 to-red-50 rounded-xl p-4 border border-purple-200">
                {aiResult}
              </div>
            )}
            <button onClick={() => { navigator.clipboard.writeText(aiResult); alert("복사됨"); }}
              className="mt-3 w-full py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
              📋 복사
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

/* 30일 발생 추이 미니 차트 */
function FrequencyChart({ records, method }: any) {
  // 최근 30일
  const today = new Date();
  const days: { date: string, val: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayRecs = records.filter((r: any) => r.record_date === dateStr);
    let val = 0;
    if (method === "duration") val = dayRecs.reduce((s: number, r: any) => s + (r.duration_seconds || 0), 0);
    else val = dayRecs.reduce((s: number, r: any) => s + (r.frequency || 1), 0);
    days.push({ date: dateStr, val });
  }
  const max = Math.max(...days.map(d => d.val), 1);

  return (
    <div className="bg-white border border-gray-200 rounded p-2">
      <div className="flex items-end gap-0.5 h-20">
        {days.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end" title={`${d.date}: ${d.val}${method === "duration" ? "초" : "회"}`}>
            <div className={`w-full rounded-t ${d.val > 0 ? "bg-red-400" : "bg-gray-100"}`}
              style={{ height: `${Math.max(3, (d.val / max) * 100)}%` }}></div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1 text-[9px] text-gray-500">
        <span>{days[0].date}</span>
        <span>오늘</span>
      </div>
    </div>
  );
}
