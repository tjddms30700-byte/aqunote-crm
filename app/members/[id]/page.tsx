"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import {
  Waves, ArrowLeft, User, Phone, MapPin, Calendar, AlertCircle,
  Activity, Award, MessageCircle, Save, Plus, Star, Trash2, Edit,
  Sparkles, Send, X, Copy, Check, Trash, FileText, Upload, Download, Eye, ExternalLink, RefreshCw
} from "lucide-react";

const DOC_CATEGORIES = [
  { value: "receipt",   label: "🧾 영수증" },
  { value: "contract",  label: "📝 계약서" },
  { value: "diagnosis", label: "🏥 진단서" },
  { value: "photo",     label: "📷 사진" },
  { value: "other",     label: "📎 기타" },
];
function docLabel(c: string) { return DOC_CATEGORIES.find(x => x.value === c)?.label || c; }

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

const STATUS_OPTIONS = [
  { key: "waiting", label: "⏳ 대기중", bgColor: "bg-yellow-100", textColor: "text-yellow-700" },
  { key: "trial_scheduled", label: "📅 체험예정", bgColor: "bg-blue-100", textColor: "text-blue-700" },
  { key: "trial_done", label: "✅ 체험완료", bgColor: "bg-purple-100", textColor: "text-purple-700" },
  { key: "regular", label: "🎯 정규등록", bgColor: "bg-green-100", textColor: "text-green-700" },
  { key: "paused", label: "⏸️ 보류", bgColor: "bg-gray-100", textColor: "text-gray-700" },
  { key: "ended", label: "🛑 대기종료", bgColor: "bg-red-100", textColor: "text-red-700" },
];

function getStatusLabel(status: string | null) {
  return STATUS_OPTIONS.find((s) => s.key === status)?.label || status || "regular";
}

const ACTIVITY_LABEL_CATEGORIES = [
  { key: "aquatic",      label: "🌊 수중재활",  color: "bg-cyan-500",     lightColor: "bg-cyan-50 border-cyan-200 text-cyan-700" },
  { key: "physical",     label: "💪 물리치료",  color: "bg-blue-500",     lightColor: "bg-blue-50 border-blue-200 text-blue-700" },
  { key: "occupational", label: "✋ 작업치료",    color: "bg-emerald-500",  lightColor: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  { key: "sensory",      label: "🎈 감각통합",   color: "bg-purple-500",   lightColor: "bg-purple-50 border-purple-200 text-purple-700" },
  { key: "rehab",        label: "🏥 재활기법",     color: "bg-orange-500",   lightColor: "bg-orange-50 border-orange-200 text-orange-700" },
  { key: "general",      label: "📌 기타",          color: "bg-gray-500",     lightColor: "bg-gray-50 border-gray-200 text-gray-700" },
];
function catColor(cat: string) { return ACTIVITY_LABEL_CATEGORIES.find(c => c.key === cat)?.lightColor || "bg-gray-50"; }

export default function MemberDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"info" | "assessment" | "bodymap" | "sessions" | "documents">("info");

  // Documents state
  const [docs, setDocs] = useState<any[]>([]);
  const [docCat, setDocCat] = useState("receipt");
  const [docDesc, setDocDesc] = useState("");
  const [docUploading, setDocUploading] = useState(false);

  async function loadDocs() {
    if (!id) return;
    const { data } = await supabase.from("documents").select("*")
      .eq("member_id", id).order("created_at", { ascending: false });
    setDocs(data || []);
  }
  useEffect(() => { if (tab === "documents") loadDocs(); }, [tab, id]);

  async function uploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setDocUploading(true);
    try {
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_가-힣]/g, "_");
      const filePath = `${id}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(filePath, file);
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("documents").insert({
        org_id: orgId, member_id: id, category: docCat,
        filename: file.name, file_path: filePath, file_size: file.size,
        mime_type: file.type, description: docDesc || null,
      });
      if (dbErr) throw dbErr;
      setDocDesc("");
      (e.target as HTMLInputElement).value = "";
      await loadDocs();
      alert("✅ 업로드 완료");
    } catch (err: any) {
      alert("업로드 실패: " + err.message);
    } finally {
      setDocUploading(false);
    }
  }

  async function downloadDoc(d: any) {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 60);
    if (error) return alert("실패: " + error.message);
    window.open(data.signedUrl, "_blank");
  }

  // Preview state
  const [preview, setPreview] = useState<{url: string, doc: any} | null>(null);

  async function previewDoc(d: any) {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 300);
    if (error) return alert("미리보기 실패: " + error.message);
    setPreview({ url: data.signedUrl, doc: d });
  }

  function isImage(mime?: string) { return mime?.startsWith("image/"); }
  function isPDF(mime?: string)   { return mime === "application/pdf"; }

  async function deleteDoc(d: any) {
    if (!confirm(`"${d.filename}" 삭제?`)) return;
    await supabase.storage.from("documents").remove([d.file_path]);
    await supabase.from("documents").delete().eq("id", d.id);
    await loadDocs();
  }

  const [skills, setSkills] = useState<Record<string, number>>({});
  const [painMap, setPainMap] = useState<Record<string, number>>({});
  const [sensationMap, setSensationMap] = useState<Record<string, string>>({});
  // sensation: 'sensitive' (과민/예민), 'dull' (둔감), 'numb' (저림)
  const [bodySelectedPart, setBodySelectedPart] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [newLabels, setNewLabels] = useState<string[]>([]);
  const [newMemo, setNewMemo] = useState("");
  const [labelLib, setLabelLib] = useState<any[]>([]);   // 전체 라벨 (공용 + 개인)
  const [customLabel, setCustomLabel] = useState("");
  const [customCat, setCustomCat] = useState("aquatic");

  async function loadLabels() {
    // 공용 라벨 + 이 회원 전용 라벨
    const { data } = await supabase.from("label_library")
      .select("*")
      .or(`member_id.is.null,member_id.eq.${id}`)
      .order("category").order("name");
    setLabelLib(data || []);
  }

  async function addCustomLabel() {
    if (!customLabel.trim()) return;
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    await supabase.from("label_library").insert({
      org_id: orgId, member_id: id, name: customLabel.trim(), category: customCat,
    });
    setCustomLabel("");
    await loadLabels();
  }

  async function deletePersonalLabel(labelId: string) {
    await supabase.from("label_library").delete().eq("id", labelId);
    await loadLabels();
  }
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [memberMemo, setMemberMemo] = useState<string>("");

  // 확장 기본정보
  const [extInfo, setExtInfo] = useState<any>({
    current_status: "", main_symptom: "", medication: "",
    treatment_history: "", expected_change: "", special_notes: "",
  });
  const [savingExt, setSavingExt] = useState(false);
  const [extSaveStatus, setExtSaveStatus] = useState("");

  async function saveExtInfo() {
    setSavingExt(true);
    // 1차: 컬럼 직접 저장 시도
    const { error } = await supabase.from("members").update({
      current_status: extInfo.current_status || null,
      main_symptom: extInfo.main_symptom || null,
      medication: extInfo.medication || null,
      treatment_history: extInfo.treatment_history || null,
      expected_change: extInfo.expected_change || null,
      special_notes: extInfo.special_notes || null,
    }).eq("id", id);

    if (error) {
      console.error("저장 실패 상세:", error);
      // 컬럼이 없는 경우 → extra JSONB로 fallback
      const isMissingCol = error.message?.includes("column") || error.code === "PGRST204" || error.code === "42703";
      if (isMissingCol) {
        const { data: cur } = await supabase.from("members").select("extra").eq("id", id).single();
        const newExtra = {
          ...(cur?.extra || {}),
          current_status: extInfo.current_status || null,
          main_symptom: extInfo.main_symptom || null,
          medication: extInfo.medication || null,
          treatment_history: extInfo.treatment_history || null,
          expected_change: extInfo.expected_change || null,
          special_notes: extInfo.special_notes || null,
        };
        const { error: e2 } = await supabase.from("members").update({ extra: newExtra }).eq("id", id);
        setSavingExt(false);
        setExtSaveStatus(e2 ? `❌ 저장 실패: ${e2.message}` : "✅ 저장 완료 (임시 저장)");
      } else {
        setSavingExt(false);
        setExtSaveStatus(`❌ 저장 실패: ${error.message}`);
      }
    } else {
      setSavingExt(false);
      setExtSaveStatus("✅ 저장 완료");
    }
    setTimeout(() => setExtSaveStatus(""), 4000);
  }

  // AI 회원 메모 자동 정리
  const [aiMemoLoading, setAiMemoLoading] = useState(false);
  const [aiMemo, setAiMemo] = useState("");
  async function generateAiMemo() {
    setAiMemoLoading(true);
    try {
      const res = await fetch("/api/ai-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member,
          ext: extInfo,
          skills, painMap, sensationMap,
        }),
      });
      const j = await res.json();
      if (j?.summary) {
        setAiMemo(j.summary);
        // DB 저장
        await supabase.from("members").update({
          ai_summary: j.summary,
          ai_summary_at: new Date().toISOString(),
        }).eq("id", id).then(({ error }) => {
          if (error) {
            // 컬럼 없으면 extra에
            supabase.from("members").select("extra").eq("id", id).single().then(({ data }) => {
              supabase.from("members").update({
                extra: { ...(data?.extra || {}), ai_summary: j.summary, ai_summary_at: new Date().toISOString() },
              }).eq("id", id);
            });
          }
        });
      }
    } catch (e) {
      alert("AI 정리 실패: " + (e as any).message);
    }
    setAiMemoLoading(false);
  }

  function calcAge(birth: string): number {
    if (!birth) return 0;
    const b = new Date(birth);
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    return age;
  }

  // AI 카톡 모달
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiSession, setAiSession] = useState<any>(null);
  const [aiMessage, setAiMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: m } = await supabase.from("members").select("*").eq("id", id).single();
      setMember(m);
      if (m?.extra?.water_skills) setSkills(m.extra.water_skills);
      if (m?.extra?.pain_map) setPainMap(m.extra.pain_map);
      if (m?.extra?.sensation_map) setSensationMap(m.extra.sensation_map);
      // 확장 기본정보 로드
      setExtInfo({
        current_status: m?.current_status || "",
        main_symptom: m?.main_symptom || "",
        medication: m?.medication || "",
        treatment_history: m?.treatment_history || "",
        expected_change: m?.expected_change || "",
        special_notes: m?.special_notes || m?.extra?.special_notes || "",
      });
      // 라벨 로드
      await loadLabels();
      setSessions(m?.extra?.sessions || []);
      setMemberMemo(m?.memo || "");
      setLoading(false);
    })();
  }, [params]);

  async function saveMemberMemo() {
    const { error } = await supabase.from("members").update({ memo: memberMemo }).eq("id", member.id);
    setSaveStatus(error ? "❌ 메모 저장 실패" : "✅ 메모 저장됨");
    setTimeout(() => setSaveStatus(""), 2500);
    if (!error) setMember({ ...member, memo: memberMemo });
  }

  async function updateMemberStatus(newStatus: string) {
    const { error } = await supabase.from("members").update({ status: newStatus }).eq("id", member.id);
    if (!error) {
      setMember({ ...member, status: newStatus });
      setSaveStatus("✅ 상태 변경됨");
      setTimeout(() => setSaveStatus(""), 2500);
    }
  }

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
    const newExtra = { ...(member.extra || {}), water_skills: skills, pain_map: painMap, sensation_map: sensationMap };
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
        <HomeButton />
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
          { k: "documents", label: "📄 문서" },
        ].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-4 py-2 rounded-lg text-sm ${tab === t.k ? "bg-aqu-600 text-white" : "bg-white border border-aqu-200 text-aqu-700 hover:bg-aqu-50"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-6">
        {tab === "info" && (
          <div className="space-y-6">
            {/* 기본 정보 (읽기 전용) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoRow label="진단명" value={member.extra?.diagnosis || "-"} />
              <InfoRow label="생년월일" value={member.birth ? `${member.birth} (만 ${calcAge(member.birth)}세)` : "-"} />
              <InfoRow label="연락처" value={member.phone || member.guardian_phone || "-"} />
              <InfoRow label="유입경로" value={member.source || "-"} />
              <InfoRow label="상태" value={getStatusLabel(member.status)} highlight />
              {member.member_type === "child" && member.guardian_name && (
                <InfoRow label="보호자" value={`${member.guardian_name} (${member.guardian_relation || ""})`} />
              )}
            </div>

            {/* 확장 정보 - 편집 가능 */}
            <div className="border-t border-aqu-100 pt-4">
              <h4 className="text-sm font-bold text-aqu-900 mb-3">📋 상세 정보</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <EditableField label="🚑 현재 상태" fieldKey="current_status"
                  value={extInfo.current_status} onChange={(v) => setExtInfo({...extInfo, current_status: v})}
                  placeholder="예: 걸음이 늘어났으나 계단 오르내림이 불안정함" />
                <EditableField label="⚠️ 주 증상" fieldKey="main_symptom"
                  value={extInfo.main_symptom} onChange={(v) => setExtInfo({...extInfo, main_symptom: v})}
                  placeholder="예: 오른쪽 다리 근력 약화, 균형 잡기 어려움" />
                <EditableField label="💊 복용 약" fieldKey="medication"
                  value={extInfo.medication} onChange={(v) => setExtInfo({...extInfo, medication: v})}
                  placeholder="예: 항경련제(케프라), 학복약물" />
                <EditableField label="🏥 치료 이력" fieldKey="treatment_history"
                  value={extInfo.treatment_history} onChange={(v) => setExtInfo({...extInfo, treatment_history: v})}
                  placeholder="예: OO병원 물리치료 6개월, 감각통합치료 1년" />
                <EditableField label="🌟 기대하는 변화" fieldKey="expected_change"
                  value={extInfo.expected_change} onChange={(v) => setExtInfo({...extInfo, expected_change: v})}
                  placeholder="예: 물에 적응 · 자신감 향상 · 근력 강화" fullWidth />
                <EditableField label="📌 특이사항" fieldKey="special_notes"
                  value={extInfo.special_notes} onChange={(v) => setExtInfo({...extInfo, special_notes: v})}
                  placeholder="예: 물에 대한 공포, 안지방지업 필요" fullWidth />
              </div>
              <button onClick={saveExtInfo} disabled={savingExt}
                className="mt-3 px-4 py-2 bg-aqu-600 hover:bg-aqu-700 text-white rounded-lg text-sm flex items-center gap-1 disabled:opacity-50">
                <Save className="w-4 h-4" /> {savingExt ? "저장 중..." : "상세 정보 저장"}
              </button>
              {extSaveStatus && <span className="ml-2 text-xs text-aqu-600">{extSaveStatus}</span>}
            </div>

            {/* 회원 메모 섹션 */}
            <div className="border-t border-aqu-100 pt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-aqu-900 flex items-center gap-1">
                  📝 회원 메모
                </label>
                <span className="text-xs text-gray-400">{(memberMemo || "").length}자</span>
              </div>
              <textarea
                value={memberMemo}
                onChange={(e) => setMemberMemo(e.target.value)}
                rows={5}
                placeholder="이 회원에 대한 자유 메모를 남기세요.

예시:
- 매주 화요일 15시 정기 방문
- 물을 무서워하니 천천히 진행
- 조부모님이 데려오심 (대기실 있음)
- 특정 코치 선호"
                className="w-full p-3 rounded-lg border border-aqu-200 text-sm bg-yellow-50/30"
              />
              <button onClick={saveMemberMemo}
                className="mt-2 px-4 py-2 bg-aqu-600 text-white rounded-lg text-sm hover:bg-aqu-700 flex items-center gap-1">
                <Save className="w-4 h-4" /> 메모 저장
              </button>
            </div>

            {/* AI 종합 정리 섹션 */}
            <div className="border-t border-aqu-100 pt-4 mt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-purple-900 flex items-center gap-1">
                  🤖 AI 종합 정리 <span className="text-xs text-gray-500">(기본정보 + 상세정보 + 평가 통합)</span>
                </label>
                <button
                  onClick={generateAiMemo}
                  disabled={aiMemoLoading}
                  className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs rounded-lg hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 flex items-center gap-1"
                >
                  {aiMemoLoading ? "⏳ 분석 중..." : "✨ AI 정리 생성"}
                </button>
              </div>
              {(aiMemo || member?.ai_summary || member?.extra?.ai_summary) && (
                <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-lg">
                  <div className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
                    {aiMemo || member?.ai_summary || member?.extra?.ai_summary}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => navigator.clipboard.writeText(aiMemo || member?.ai_summary || member?.extra?.ai_summary || "")}
                      className="px-3 py-1 bg-white border border-purple-200 text-purple-700 text-xs rounded hover:bg-purple-50"
                    >
                      📋 복사
                    </button>
                  </div>
                </div>
              )}
              {!aiMemo && !member?.ai_summary && !member?.extra?.ai_summary && (
                <p className="text-xs text-gray-500 p-3 bg-gray-50 rounded-lg">
                  💡 상세 정보를 저장한 뒤 “AI 정리 생성” 버튼을 눌러주세요. 회원의 기본정보 · 상세정보 · 평가 · 통증/감각 데이터를 종합해 프로필과 프로그램 방향을 자동으로 정리해줍니다.
                </p>
              )}
            </div>

            {/* 상태 변경 */}
            <div className="border-t border-aqu-100 pt-4">
              <label className="text-sm font-medium text-aqu-900 mb-2 block">🎯 회원 상태 변경</label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((s) => (
                  <button key={s.key} onClick={() => updateMemberStatus(s.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs ${
                      (member.status || "regular") === s.key
                        ? `${s.bgColor} ${s.textColor} border-2 border-current font-medium`
                        : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-aqu-900">🗺️ Body Map - 통증 + 감각 지도</h3>
              <button onClick={() => {
                if (confirm("모든 통증/감각 정보를 초기화합니다 (저장 전입니다)")) {
                  setPainMap({}); setSensationMap({}); setBodySelectedPart(null);
                }
              }}
              className="text-xs px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded hover:bg-red-100 flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> 전체 리셋
              </button>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
              {/* SVG 인체 */}
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
                    const sens = sensationMap[p.key];
                    const isSelected = bodySelectedPart === p.key;
                    const size = 8 + pain * 1.3;
                    const color = pain === 0
                      ? (sens === "sensitive" ? "#a78bfa" : sens === "dull" ? "#94a3b8" : sens === "numb" ? "#64748b" : "#e5e7eb")
                      : pain <= 3 ? "#fbbf24" : pain <= 6 ? "#fb923c" : "#dc2626";
                    return (
                      <g key={p.key}>
                        {isSelected && (
                          <circle cx={p.x} cy={p.y} r={size + 4} fill="none" stroke="#0ea5e9" strokeWidth="2" strokeDasharray="3 2" />
                        )}
                        <circle cx={p.x} cy={p.y} r={size} fill={color} stroke="#fff" strokeWidth="1.5"
                          opacity={pain === 0 && !sens ? 0.4 : 0.9}
                          onClick={() => setBodySelectedPart(p.key)}
                          style={{ cursor: "pointer" }} />
                        {pain > 0 && (
                          <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">{pain}</text>
                        )}
                        {pain === 0 && sens && (
                          <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">
                            {sens === "sensitive" ? "⭐" : sens === "dull" ? "○" : "∅"}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
                <p className="text-xs text-gray-500 text-center mt-2">부위 클릭하여 선택 → 오른쪽에서 조정</p>

                {/* 범례 */}
                <div className="mt-3 p-2 bg-gray-50 rounded text-[10px] space-y-1">
                  <div className="font-medium text-gray-700 mb-1">범례</div>
                  <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-300"></span> 통증 없음</div>
                  <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-400"></span> 경미 (1-3)</div>
                  <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-400"></span> 중등 (4-6)</div>
                  <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-600"></span> 심함 (7-10)</div>
                  <div className="pt-1 border-t border-gray-200 mt-1"></div>
                  <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-purple-400"></span> ⭐ 예민/과민</div>
                  <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-slate-400"></span> ○ 둔감</div>
                  <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-slate-600"></span> ∅ 저림</div>
                </div>
              </div>

              {/* 종 모든 조정 패널 */}
              <div className="flex-1">
                {/* 선택된 부위 상세 조정 */}
                {bodySelectedPart && (
                  <div className="mb-4 p-4 bg-gradient-to-br from-aqu-50 to-blue-50 border-2 border-aqu-300 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold text-aqu-900">
                        📍 {BODY_PARTS.find(p => p.key === bodySelectedPart)?.label}
                      </h4>
                      <button onClick={() => setBodySelectedPart(null)}
                        className="text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* 통증 강도 */}
                    <div className="mb-3">
                      <label className="text-xs font-semibold text-gray-700 mb-1 block">통증 강도 (0-10)</label>
                      <div className="flex items-center gap-2">
                        <input type="range" min="0" max="10"
                          value={painMap[bodySelectedPart] || 0}
                          onChange={e => setPainMap(prev => ({ ...prev, [bodySelectedPart]: parseInt(e.target.value) }))}
                          className="flex-1 accent-aqu-600" />
                        <span className={`w-10 text-center font-bold text-lg ${
                          (painMap[bodySelectedPart] || 0) === 0 ? "text-gray-400" :
                          (painMap[bodySelectedPart] || 0) <= 3 ? "text-yellow-500" :
                          (painMap[bodySelectedPart] || 0) <= 6 ? "text-orange-500" : "text-red-500"
                        }`}>{painMap[bodySelectedPart] || 0}</span>
                      </div>
                    </div>

                    {/* 감각 */}
                    <div className="mb-3">
                      <label className="text-xs font-semibold text-gray-700 mb-1 block">감각 (선택)</label>
                      <div className="grid grid-cols-4 gap-1">
                        {[
                          { v: "", label: "정상", color: "bg-white border-gray-300 text-gray-600" },
                          { v: "sensitive", label: "⭐ 예민", color: "bg-purple-100 border-purple-400 text-purple-800" },
                          { v: "dull", label: "○ 둔감", color: "bg-slate-100 border-slate-400 text-slate-700" },
                          { v: "numb", label: "∅ 저림", color: "bg-slate-200 border-slate-500 text-slate-800" },
                        ].map(s => (
                          <button key={s.v} type="button"
                            onClick={() => setSensationMap(prev => {
                              const nx = { ...prev };
                              if (s.v) nx[bodySelectedPart] = s.v;
                              else delete nx[bodySelectedPart];
                              return nx;
                            })}
                            className={`py-1.5 text-xs rounded border-2 ${
                              (sensationMap[bodySelectedPart] || "") === s.v
                                ? s.color + " font-bold shadow-sm"
                                : "bg-white border-gray-200 text-gray-400 hover:bg-gray-50"
                            }`}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 이 부위만 리셋 */}
                    <button onClick={() => {
                      setPainMap(prev => { const n = {...prev}; delete n[bodySelectedPart]; return n; });
                      setSensationMap(prev => { const n = {...prev}; delete n[bodySelectedPart]; return n; });
                    }}
                    className="w-full text-xs px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded hover:bg-red-50 flex items-center justify-center gap-1">
                      <RefreshCw className="w-3 h-3" /> 이 부위만 리셋
                    </button>
                  </div>
                )}

                {/* 요약 리스트 */}
                <div className="grid grid-cols-2 gap-2 mb-4 max-h-[280px] overflow-y-auto">
                  {BODY_PARTS.map((p) => {
                    const pain = painMap[p.key] || 0;
                    const sens = sensationMap[p.key];
                    const hasData = pain > 0 || sens;
                    return (
                      <button key={p.key} type="button"
                        onClick={() => setBodySelectedPart(p.key)}
                        className={`text-left flex items-center justify-between text-sm p-2 rounded transition ${
                          bodySelectedPart === p.key ? "bg-aqu-100 border-2 border-aqu-500" : hasData ? "bg-yellow-50 border border-yellow-200" : "bg-gray-50 hover:bg-gray-100"
                        }`}>
                        <span className="text-gray-700 text-xs">{p.label}</span>
                        <span className="flex items-center gap-1">
                          {pain > 0 && (
                            <span className={`font-bold text-xs ${pain <= 3 ? "text-yellow-600" : pain <= 6 ? "text-orange-500" : "text-red-500"}`}>{pain}</span>
                          )}
                          {sens === "sensitive" && <span className="text-[10px] text-purple-600">⭐</span>}
                          {sens === "dull" && <span className="text-[10px] text-slate-500">○</span>}
                          {sens === "numb" && <span className="text-[10px] text-slate-700">∅</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* 버튼 */}
                <div className="flex gap-2">
                  <button onClick={() => {
                    // 저장 직전 되돌리기 (서버에서 재로드)
                    if (confirm("저장 전 상태로 되돌릴까요?")) {
                      setPainMap(member?.extra?.pain_map || {});
                      setSensationMap(member?.extra?.sensation_map || {});
                      setBodySelectedPart(null);
                    }
                  }}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-1">
                    <RefreshCw className="w-4 h-4" /> 되돌리기
                  </button>
                  <button onClick={saveAssessment} className="flex-1 px-4 py-2 bg-aqu-600 text-white rounded-lg text-sm hover:bg-aqu-700 flex items-center justify-center gap-1">
                    <Save className="w-4 h-4" /> Body Map 저장
                  </button>
                </div>
                {saveStatus && (
                  <div className="mt-2 text-center text-sm font-medium text-aqu-700">{saveStatus}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "sessions" && (
          <div>
            <h3 className="text-lg font-bold text-aqu-900 mb-4">📝 세션 기록 & 라벨링</h3>

            <div className="mb-6 p-4 bg-aqu-50 rounded-xl">
              <div className="text-sm font-medium text-aqu-900 mb-3">🆕 오늘 세션 활동 선택</div>

              {/* 카테고리별 라벨 */}
              <div className="space-y-3 mb-3">
                {ACTIVITY_LABEL_CATEGORIES.map(cat => {
                  const catLabels = labelLib.filter(l => l.category === cat.key);
                  if (catLabels.length === 0) return null;
                  return (
                    <div key={cat.key}>
                      <div className="text-xs font-semibold text-gray-700 mb-1.5">{cat.label}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {catLabels.map((l: any) => (
                          <button key={l.id}
                            onClick={() => toggleLabel(l.name)}
                            className={`px-2.5 py-1 rounded-full text-[11px] border transition ${
                              newLabels.includes(l.name)
                                ? cat.color + " text-white border-transparent font-medium"
                                : "bg-white " + cat.lightColor + " hover:opacity-80"
                            } ${l.member_id ? "ring-1 ring-yellow-400" : ""}`}
                            title={l.member_id ? "이 회원 전용" : "공용 라벨"}>
                            {newLabels.includes(l.name) ? "✓ " : ""}{l.name}
                            {l.member_id && (
                              <span onClick={(e) => { e.stopPropagation(); deletePersonalLabel(l.id); }}
                                    className="ml-1 opacity-60 hover:opacity-100">×</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 개인 라벨 추가 */}
              <div className="mb-3 p-2 bg-white rounded-lg border border-yellow-200">
                <div className="text-xs font-semibold text-yellow-800 mb-1.5">➕ 이 회원 전용 라벨 추가</div>
                <div className="flex gap-1">
                  <select value={customCat} onChange={e => setCustomCat(e.target.value)}
                    className="px-2 py-1 border border-gray-200 rounded text-xs">
                    {ACTIVITY_LABEL_CATEGORIES.map(c => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                  <input type="text" value={customLabel} onChange={e => setCustomLabel(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addCustomLabel()}
                    placeholder="예: 개인 특화 활동"
                    className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs" />
                  <button onClick={addCustomLabel}
                    className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded text-xs font-medium">
                    추가
                  </button>
                </div>
                <div className="text-[10px] text-gray-500 mt-1">💡 이 라벨은 <b>이 회원에게만</b> 보입니다 (다른 회원과 섞이지 않음)</div>
              </div>

              <textarea value={newMemo} onChange={(e) => setNewMemo(e.target.value)}
                placeholder="세션 메모 (선택) - 관찰 내용, 특이사항 등"
                rows={3}
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

        {tab === "documents" && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-aqu-900 flex items-center gap-2">
              <FileText className="w-5 h-5" /> {member?.name} 님의 문서
            </h3>

            {/* Upload */}
            <div className="bg-aqu-50/50 border border-aqu-100 rounded-xl p-4">
              <div className="flex flex-wrap gap-2 mb-3">
                <select value={docCat} onChange={e => setDocCat(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
                  {DOC_CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <input type="text" value={docDesc} onChange={e => setDocDesc(e.target.value)}
                  placeholder="설명 (선택)"
                  className="flex-1 min-w-[150px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
              </div>
              <input type="file" onChange={uploadDoc} disabled={docUploading}
                className="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-aqu-600 file:text-white file:hover:bg-aqu-700 file:cursor-pointer disabled:opacity-50" />
              {docUploading && <div className="mt-2 text-xs text-aqu-600">📤 업로드 진행 중...</div>}
              <p className="text-[11px] text-gray-500 mt-2">영수증, 계약서, 진단서 등 파일을 이 회원에 자동연결됩니다.</p>
            </div>

            {/* Doc list */}
            {docs.length === 0 ? (
              <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                업로드된 문서가 없습니다
              </div>
            ) : (
              <div className="space-y-2">
                {docs.map(d => (
                  <div key={d.id} className="flex items-center gap-3 p-3 bg-white border border-aqu-100 rounded-lg hover:shadow-sm transition">
                    <span className="px-2 py-1 rounded-md bg-aqu-100 text-aqu-800 text-xs whitespace-nowrap">
                      {docLabel(d.category)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 text-sm truncate">{d.filename}</div>
                      {d.description && <div className="text-xs text-gray-500 truncate">{d.description}</div>}
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(d.created_at).toLocaleDateString()} · {d.file_size ? (d.file_size < 1024*1024 ? (d.file_size/1024).toFixed(1)+"KB" : (d.file_size/1024/1024).toFixed(1)+"MB") : "-"}
                      </div>
                    </div>
                    <button onClick={() => previewDoc(d)} className="p-2 text-purple-600 hover:bg-purple-50 rounded" title="미리보기">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => downloadDoc(d)} className="p-2 text-aqu-600 hover:bg-aqu-50 rounded" title="다운로드">
                      <Download className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteDoc(d)} className="p-2 text-red-500 hover:bg-red-50 rounded" title="삭제">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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

      {/* Document Preview Modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-2 md:p-6" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 md:p-4 border-b border-gray-100">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-5 h-5 text-aqu-600 shrink-0" />
                <span className="font-medium text-gray-800 truncate text-sm md:text-base">{preview.doc.filename}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a href={preview.url} target="_blank" rel="noreferrer"
                   className="p-2 text-aqu-600 hover:bg-aqu-50 rounded" title="새 탭에서 열기">
                  <ExternalLink className="w-4 h-4" />
                </a>
                <a href={preview.url} download={preview.doc.filename}
                   className="p-2 text-aqu-600 hover:bg-aqu-50 rounded" title="다운로드">
                  <Download className="w-4 h-4" />
                </a>
                <button onClick={() => setPreview(null)} className="p-2 text-gray-400 hover:bg-gray-100 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-gray-50 flex items-center justify-center p-4">
              {isImage(preview.doc.mime_type) ? (
                <img src={preview.url} alt={preview.doc.filename} className="max-w-full max-h-[75vh] object-contain rounded" />
              ) : isPDF(preview.doc.mime_type) ? (
                <iframe src={preview.url} className="w-full h-[75vh] rounded border" title={preview.doc.filename} />
              ) : (
                <div className="text-center py-10">
                  <FileText className="w-16 h-16 mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-600 mb-1">이 파일 형식은 미리보기를 지원하지 않습니다</p>
                  <p className="text-xs text-gray-400 mb-4">{preview.doc.mime_type || "unknown"}</p>
                  <a href={preview.url} download={preview.doc.filename}
                     className="inline-flex items-center gap-2 px-4 py-2 bg-aqu-600 text-white rounded-lg hover:bg-aqu-700">
                    <Download className="w-4 h-4" /> 다운로드
                  </a>
                </div>
              )}
            </div>
            {preview.doc.description && (
              <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-600">
                📝 {preview.doc.description}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function EditableField({ label, fieldKey, value, onChange, placeholder, fullWidth }: any) {
  return (
    <div className={fullWidth ? "md:col-span-2" : ""}>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <textarea value={value || ""}
        onChange={e => onChange(e.target.value)}
        rows={fullWidth ? 2 : 2}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none resize-none" />
    </div>
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
