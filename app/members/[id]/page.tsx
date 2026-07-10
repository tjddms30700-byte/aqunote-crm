"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Waves, ArrowLeft, User, Phone, MapPin, Calendar, AlertCircle,
  Activity, Award, MessageCircle, Save, Plus, Star, Trash2, Edit,
  Sparkles, Send, X, Copy, Check, Trash
} from "lucide-react";

type Member = any;

const BODY_PARTS = [
  { key: "neck", label: "목", x: 100, y: 40 },
  { key: "shoulder_l", label: "어깨(좌)", x: 65, y: 65 },
  { key: "shoulder_r", label: "어깨(우)", x: 135, y: 65 },
  { key: "arm_l", label: "팔(좌)", x: 45, y: 110 },
  { key: "arm_r", label: "팔(우)", x: 155, y: 110 },
  { key: "chest", label: "가슴", x: 100, y: 100 },
  { key: "back", label: "허리", x: 100, y: 160 },
  { key: "hip", label: "고관절", x: 100, y: 200 },
  { key: "knee_l", label: "무릎(좌)", x: 80, y: 260 },
  { key: "knee_r", label: "무릎(우)", x: 120, y: 260 },
  { key: "ankle_l", label: "발목(좌)", x: 80, y: 330 },
  { key: "ankle_r", label: "발목(우)", x: 120, y: 330 },
];

const WATER_SKILLS = [
  { key: "buoyancy", label: "부력적응" },
  { key: "breathing", label: "호흡조절" },
  { key: "balance", label: "균형감각" },
  { key: "gait", label: "수중보행" },
  { key: "coordination", label: "협응력" },
  { key: "range", label: "관절가동범위" },
  { key: "strength", label: "근력" },
  { key: "endurance", label: "지구력" },
];

const ACTIVITY_LABELS = [
  "부력적응", "호흡법", "균형운동", "스트레칭", "수중보행",
  "근력강화", "관절가동", "이완운동", "감각통합", "협응훈련",
];

export default function MemberDetail() {
  const params = useParams();
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"info" | "assessment" | "bodymap" | "sessions">("info");

  const [skills, setSkills] = useState<Record<string, number>>({});
  const [painMap, setPainMap] = useState<Record<string, number>>({});
  const [sessions, setSessions] = useState<any[]>([]);
  const [newLabels, setNewLabels] = useState<string[]>([]);
  const [newMemo, setNewMemo] = useState("");
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // AI 카톡 모달
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiSession, setAiSession] = useState<any>(null);
  const [aiMessage, setAiMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const id = params?.id as string;
      const { data: m } = await supabase.from("members").select("*").eq("id", id).single();
      setMember(m);
      if (m?.extra?.water_skills) setSkills(m.extra.water_skills);
      if (m?.extra?.pain_map) setPainMap(m.extra.pain_map);
      setSessions(m?.extra?.sessions || []);
      setLoading(false);
    })();
  }, [params]);

  async function deleteMember() {
    if (!confirm(`정말 '${member.name}'님을 삭제하시겠습니까?\n(복구 가능한 soft delete입니다)`)) return;
    const { error } = await supabase.from('members').update({ deleted_at: new Date().toISOString() }).eq('id', member.id);
    if (!error) {
      alert('회원이 삭제되었습니다.');
      router.push('/members');
    } else {
      alert('삭제 실패: ' + error.message);
    }
  }

  async function saveAssessment() {
    if (!member) return;
    const newExtra = { ...(member.extra || {}), water_skills: skills, pain_map: painMap };
    const { error } = await supabase.from("members").update({ extra: newExtra }).eq("id", member.id);
    setSaveStatus(error ? "❌ 저장 실패" : "✅ 저장 완료!");
    setTimeout(() => setSaveStatus(""), 2500);
  }

  async function saveSession() {
    if (!member || newLabels.length === 0) return;
    const session = {
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().slice(0, 5),
      labels: newLabels,
      memo: newMemo,
    };
    const updatedSessions = [session, ...sessions];
    const newExtra = { ...(member.extra || {}), sessions: updatedSessions };
    const { error } = await supabase.from("members").update({ extra: newExtra }).eq("id", member.id);
    if (!error) {
      setSessions(updatedSessions);
      setNewLabels([]);
      setNewMemo("");
      setSaveStatus("✅ 세션 저장 완료!");
      setTimeout(() => setSaveStatus(""), 2500);
    }
  }

  async function deleteSession(idx: number) {
    if (!confirm(`이 세션을 삭제하시겠습니까?\n(${sessions[idx].date} · ${sessions[idx].labels?.length || 0}개 활동)`)) return;
    const updated = sessions.filter((_, i) => i !== idx);
    const newExtra = { ...(member.extra || {}), sessions: updated };
    const { error } = await supabase.from("members").update({ extra: newExtra }).eq("id", member.id);
    if (!error) {
      setSessions(updated);
      setSaveStatus("🗑️ 세션 삭제됨");
      setTimeout(() => setSaveStatus(""), 2500);
    }
  }

  async function updateSessionMemo(idx: number, memo: string) {
    const updated = sessions.map((s, i) => (i === idx ? { ...s, memo } : s));
    const newExtra = { ...(member.extra || {}), sessions: updated };
    await supabase.from("members").update({ extra: newExtra }).eq("id", member.id);
    setSessions(updated);
    setEditingIdx(null);
    setSaveStatus("✏️ 메모 수정됨");
    setTimeout(() => setSaveStatus(""), 2000);
  }

  async function generateAIMessage(session: any) {
    setAiSession(session);
    setShowAIModal(true);
    setAiLoading(true);
    setAiMessage("");
    setCopied(false);

    try {
      const res = await fetch("/api/ai-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member: {
            name: member.name,
            type: member.member_type,
            diagnosis: member.extra?.diagnosis,
            guardian: member.guardian_name,
          },
          session: {
            date: session.date,
            labels: session.labels,
            memo: session.memo,
          },
          water_skills: skills,
          pain_map: painMap,
        }),
      });
      const data = await res.json();
      setAiMessage(data.message || "생성 실패. 다시 시도해주세요.");
    } catch (e: any) {
      setAiMessage("네트워크 오류: " + e.message);
    } finally {
      setAiLoading(false);
    }
  }

  function copyMessage() {
    navigator.clipboard.writeText(aiMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleLabel(l: string) {
    setNewLabels((prev) => prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]);
  }

  function getAge(birth: string | null) {
    if (!birth) return "-";
    const b = new Date(birth);
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) age--;
    return age + "세";
  }

  if (loading) return <div className="p-10 text-center text-gray-400">불러오는 중…</div>;
  if (!member) return <div className="p-10 text-center text-red-500">회원을 찾을 수 없습니다.</div>;

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-10">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.push("/members")} className="flex items-center gap-1 text-sm text-aqu-600 hover:underline">
          <ArrowLeft className="w-4 h-4" /> 회원 목록
        </button>
        <Link href="/" className="text-sm text-gray-500 hover:text-aqu-600">홈</Link>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${
              member.member_type === "child" ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600"
            }`}>
              {member.name?.charAt(0) || "?"}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-aqu-900">{member.name}</h1>
                <span className={`px-2 py-0.5 rounded text-xs ${
                  member.member_type === "child" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                }`}>
                  {member.member_type === "child" ? "아동" : "성인"}
                </span>
                <span className="text-sm text-gray-500">{getAge(member.birth)}</span>
                <span className="text-sm text-gray-500">{member.gender === "F" ? "여" : member.gender === "M" ? "남" : ""}</span>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                {member.guardian_name && <div>👨‍👩‍👧 보호자: {member.guardian_name} ({member.guardian_relation || "보호자"})</div>}
                {member.phone && <div><Phone className="w-3.5 h-3.5 inline mr-1" />{member.phone}</div>}
                {member.address && <div><MapPin className="w-3.5 h-3.5 inline mr-1" />{member.address}</div>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saveStatus && (
              <div className="text-sm px-3 py-1.5 rounded-lg bg-aqu-50 text-aqu-700">{saveStatus}</div>
            )}
            <button onClick={deleteMember} title="회원 삭제"
              className="p-2 rounded-lg text-red-500 hover:bg-red-50 border border-red-200">
              <Trash className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { k: "info", label: "📌 기본정보" },
          { k: "assessment", label: "🩺 수중기능평가" },
          { k: "bodymap", label: "🗺️ Body Map" },
          { k: "sessions", label: "📝 세션기록" },
        ].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-4 py-2 rounded-lg text-sm ${tab === t.k ? "bg-aqu-600 text-white" : "bg-white border border-aqu-200 text-aqu-700 hover:bg-aqu-50"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-6">
        {tab === "info" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label="진단명" value={member.extra?.diagnosis || "-"} />
            <InfoRow label="생년월일" value={member.birth || "-"} />
            <InfoRow label="유입경로" value={member.source || "-"} />
            <InfoRow label="상태" value={member.status || "regular"} highlight />
            {member.member_type === "adult" && (
              <>
                <InfoRow label="통증부위" value={member.extra?.pain_area || "-"} />
                <InfoRow label="통증척도" value={String(member.extra?.pain_scale || "-")} />
                <InfoRow label="기저질환" value={member.extra?.medical_history || "-"} />
              </>
            )}
            {member.member_type === "child" && (
              <InfoRow label="특이사항" value={member.extra?.special_notes || member.memo || "-"} />
            )}
          </div>
        )}

        {tab === "assessment" && (
          <div>
            <h3 className="text-lg font-bold text-aqu-900 mb-4">🩺 수중기능평가 (0-5점)</h3>
            <div className="space-y-3 mb-4">
              {WATER_SKILLS.map((s) => (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="w-28 text-sm text-gray-700">{s.label}</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => setSkills((prev) => ({ ...prev, [s.key]: n }))}
                        className={`w-8 h-8 rounded-lg text-sm ${(skills[s.key] || 0) >= n ? "bg-aqu-500 text-white" : "bg-gray-100 text-gray-400 hover:bg-aqu-100"}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-gray-500 ml-auto">{skills[s.key] || 0}/5</span>
                </div>
              ))}
            </div>
            <button onClick={saveAssessment} className="px-4 py-2 bg-aqu-600 text-white rounded-lg text-sm hover:bg-aqu-700 flex items-center gap-1">
              <Save className="w-4 h-4" /> 평가 저장
            </button>
          </div>
        )}

        {tab === "bodymap" && (
          <div>
            <h3 className="text-lg font-bold text-aqu-900 mb-4">🗺️ Body Map - 통증 부위 (0-10)</h3>
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-shrink-0">
                <svg viewBox="0 0 200 400" className="w-48 h-96 mx-auto">
                  <ellipse cx="100" cy="45" rx="22" ry="28" fill="#f0f9ff" stroke="#0891b2" strokeWidth="1.5"/>
                  <rect x="75" y="70" width="50" height="90" rx="20" fill="#f0f9ff" stroke="#0891b2" strokeWidth="1.5"/>
                  <path d="M75 90 L45 130 L45 190" fill="none" stroke="#0891b2" strokeWidth="1.5"/>
                  <path d="M125 90 L155 130 L155 190" fill="none" stroke="#0891b2" strokeWidth="1.5"/>
                  <rect x="75" y="160" width="50" height="80" fill="#f0f9ff" stroke="#0891b2" strokeWidth="1.5"/>
                  <path d="M80 240 L75 340 L70 380" fill="none" stroke="#0891b2" strokeWidth="1.5"/>
                  <path d="M120 240 L125 340 L130 380" fill="none" stroke="#0891b2" strokeWidth="1.5"/>
                  {BODY_PARTS.map((p) => {
                    const pain = painMap[p.key] || 0;
                    const size = 6 + pain * 1.5;
                    const color = pain === 0 ? "#e5e7eb" : pain <= 3 ? "#fbbf24" : pain <= 6 ? "#fb923c" : "#dc2626";
                    return (
                      <g key={p.key}>
                        <circle cx={p.x} cy={p.y} r={size} fill={color} stroke="#fff" strokeWidth="1"
                          opacity={pain === 0 ? 0.5 : 0.85}
                          onClick={() => setPainMap((prev) => ({ ...prev, [p.key]: ((prev[p.key] || 0) + 1) % 11 }))}
                          style={{ cursor: "pointer" }} />
                        {pain > 0 && (
                          <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">{pain}</text>
                        )}
                      </g>
                    );
                  })}
                </svg>
                <p className="text-xs text-gray-500 text-center mt-2">부위 클릭하여 통증 강도(0-10) 조정</p>
              </div>
              <div className="flex-1">
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {BODY_PARTS.map((p) => {
                    const pain = painMap[p.key] || 0;
                    return (
                      <div key={p.key} className="flex items-center justify-between text-sm p-2 rounded bg-gray-50">
                        <span className="text-gray-700">{p.label}</span>
                        <span className={`font-bold ${pain === 0 ? "text-gray-400" : pain <= 3 ? "text-yellow-500" : pain <= 6 ? "text-orange-500" : "text-red-500"}`}>{pain}</span>
                      </div>
                    );
                  })}
                </div>
                <button onClick={saveAssessment} className="w-full px-4 py-2 bg-aqu-600 text-white rounded-lg text-sm hover:bg-aqu-700 flex items-center justify-center gap-1">
                  <Save className="w-4 h-4" /> Body Map 저장
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "sessions" && (
          <div>
            <h3 className="text-lg font-bold text-aqu-900 mb-4">📝 세션 기록 & 라벨링</h3>

            <div className="mb-6 p-4 bg-aqu-50 rounded-xl">
              <div className="text-sm font-medium text-aqu-900 mb-3">🆕 오늘 세션 활동 선택</div>
              <div className="flex flex-wrap gap-2 mb-3">
                {ACTIVITY_LABELS.map((l) => (
                  <button key={l} onClick={() => toggleLabel(l)}
                    className={`px-3 py-1.5 rounded-full text-xs ${newLabels.includes(l) ? "bg-aqu-500 text-white" : "bg-white text-aqu-700 border border-aqu-200 hover:bg-aqu-100"}`}>
                    {newLabels.includes(l) ? "✓ " : ""}{l}
                  </button>
                ))}
              </div>
              <textarea value={newMemo} onChange={(e) => setNewMemo(e.target.value)}
                placeholder="메모 (선택)" rows={2}
                className="w-full text-sm p-2 rounded-lg border border-aqu-200 mb-3" />
              <button onClick={saveSession} disabled={newLabels.length === 0}
                className="px-4 py-2 bg-aqu-600 text-white rounded-lg text-sm disabled:bg-gray-300 hover:bg-aqu-700 flex items-center gap-1">
                <Plus className="w-4 h-4" /> 세션 저장 ({newLabels.length}개 활동)
              </button>
            </div>

            {/* Session History with Delete & AI */}
            <div className="space-y-2">
              {sessions.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  아직 기록된 세션이 없습니다. 위에서 첫 세션을 추가해보세요!
                </div>
              ) : (
                sessions.map((s: any, i: number) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-lg text-sm hover:bg-gray-100 transition group">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-aqu-900">{s.date}</span>
                        {s.time && <span className="text-xs text-gray-500">{s.time}</span>}
                        <span className="text-xs text-gray-500">· {s.labels?.length || 0}개 활동</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => generateAIMessage(s)}
                          title="AI 상담 메시지 생성"
                          className="p-1 rounded hover:bg-aqu-100 text-aqu-600"
                        >
                          <Sparkles className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingIdx(editingIdx === i ? null : i)}
                          title="메모 편집"
                          className="p-1 rounded hover:bg-blue-100 text-blue-600"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteSession(i)}
                          title="세션 삭제"
                          className="p-1 rounded hover:bg-red-100 text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-1">
                      {s.labels?.map((l: string) => (
                        <span key={l} className="px-2 py-0.5 bg-aqu-100 text-aqu-700 rounded text-xs">{l}</span>
                      ))}
                    </div>
                    {editingIdx === i ? (
                      <div className="mt-2">
                        <textarea
                          defaultValue={s.memo || ""}
                          rows={2}
                          onBlur={(e) => updateSessionMemo(i, e.target.value)}
                          className="w-full text-xs p-2 rounded border border-aqu-200"
                          autoFocus
                          placeholder="메모 (Tab 또는 밖 클릭으로 저장)"
                        />
                      </div>
                    ) : (
                      s.memo && <div className="text-gray-600 text-xs mt-1">📝 {s.memo}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* AI 카톡 생성 Modal */}
      {showAIModal && aiSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAIModal(false)}>
          <div className="bg-white rounded-2xl p-5 md:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-aqu-900 flex items-center gap-1">
                <Sparkles className="w-5 h-5 text-aqu-500" />
                AI 상담 메시지 생성
              </h3>
              <button onClick={() => setShowAIModal(false)}>
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-3 bg-aqu-50 rounded-lg mb-4 text-sm">
              <div className="text-aqu-900 font-medium mb-1">📅 {aiSession.date} 세션 기반</div>
              <div className="flex flex-wrap gap-1">
                {aiSession.labels?.map((l: string) => (
                  <span key={l} className="px-2 py-0.5 bg-white text-aqu-700 rounded text-xs">{l}</span>
                ))}
              </div>
            </div>

            {aiLoading ? (
              <div className="text-center py-10">
                <div className="inline-block w-8 h-8 border-4 border-aqu-200 border-t-aqu-600 rounded-full animate-spin"></div>
                <p className="text-sm text-gray-500 mt-3">AI가 메시지를 작성 중입니다...</p>
              </div>
            ) : (
              <>
                <textarea
                  value={aiMessage}
                  onChange={(e) => setAiMessage(e.target.value)}
                  rows={12}
                  className="w-full p-3 rounded-lg border border-aqu-200 text-sm font-mono"
                />
                <div className="text-xs text-gray-500 mt-1 mb-3">{aiMessage.length}자 · 편집 가능</div>

                <div className="flex gap-2">
                  <button
                    onClick={copyMessage}
                    className="flex-1 py-2.5 bg-aqu-600 text-white rounded-lg text-sm font-medium hover:bg-aqu-700 flex items-center justify-center gap-1"
                  >
                    {copied ? <><Check className="w-4 h-4" /> 복사됨!</> : <><Copy className="w-4 h-4" /> 카카오톡에 붙여넣기</>}
                  </button>
                  <button
                    onClick={() => generateAIMessage(aiSession)}
                    className="px-4 py-2.5 bg-white border border-aqu-300 text-aqu-700 rounded-lg text-sm hover:bg-aqu-50"
                    title="다시 생성"
                  >
                    🔄
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-gray-500 min-w-[80px]">{label}</span>
      <span className={`text-sm ${highlight ? "font-medium text-green-600" : "text-gray-800"}`}>{value}</span>
    </div>
  );
}
