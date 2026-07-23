"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import WishScheduleCard from "@/components/WishScheduleCard";
import {
  Waves, ArrowLeft, User, Phone, MapPin, Calendar, AlertCircle,
  Activity, Award, MessageCircle, Save, Plus, Star, Trash2, Edit,
  Sparkles, Send, X, Copy, Check, Trash, FileText, Upload, Download, Eye, ExternalLink, RefreshCw,
  Stethoscope, TrendingUp, Target as TargetIcon, BookOpen
} from "lucide-react";
import { computeAquaGrade, LEVEL_INFO, type AssessmentInput } from "@/lib/aqua-grading";

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
  { key: "new", label: "🆕 신규", bgColor: "bg-pink-100", textColor: "text-pink-700" },
  { key: "waiting", label: "⏳ 대기중", bgColor: "bg-yellow-100", textColor: "text-yellow-700" },
  { key: "trial_scheduled", label: "📅 체험예정", bgColor: "bg-blue-100", textColor: "text-blue-700" },
  { key: "trial_done", label: "✅ 체험완료", bgColor: "bg-purple-100", textColor: "text-purple-700" },
  { key: "regular", label: "🎯 정규등록", bgColor: "bg-green-100", textColor: "text-green-700" },
  { key: "paused", label: "⏸️ 보류", bgColor: "bg-gray-100", textColor: "text-gray-700" },
  { key: "closed", label: "🏳️ 종결", bgColor: "bg-slate-200", textColor: "text-slate-700" },
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
  const [tab, setTab] = useState<"info" | "chart" | "history" | "assessment" | "bodymap" | "sessions" | "documents">("info");

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
    // 1차: 컬럼 직접 저장 시도 + .select()로 실제 반환 rows 검증
    const { data: updatedRows, error } = await supabase.from("members").update({
      current_status: extInfo.current_status || null,
      main_symptom: extInfo.main_symptom || null,
      medication: extInfo.medication || null,
      treatment_history: extInfo.treatment_history || null,
      expected_change: extInfo.expected_change || null,
      special_notes: extInfo.special_notes || null,
    }).eq("id", id).select();

    // ❌ CASE 1: 에러 발생 (컬럼 없음 등)
    if (error) {
      console.error("저장 실패 상세:", error);
      const isMissingCol = error.message?.includes("column") || error.code === "PGRST204" || error.code === "42703";
      if (isMissingCol) {
        // 컬럼이 없는 경우 → extra JSONB로 fallback
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
        const { data: ed, error: e2 } = await supabase.from("members").update({ extra: newExtra }).eq("id", id).select();
        setSavingExt(false);
        if (e2) {
          setExtSaveStatus(`❌ 저장 실패: ${e2.message}`);
        } else if (!ed || ed.length === 0) {
          setExtSaveStatus("❌ RLS 정책으로 저장 차단됨! 관리자에게 AQUNOTE_FIX_RLS_UPDATE.sql 실행 요청");
        } else {
          setExtSaveStatus("✅ 저장 완료 (임시 저장)");
        }
      } else {
        setSavingExt(false);
        setExtSaveStatus(`❌ 저장 실패: ${error.message}`);
      }
      setTimeout(() => setExtSaveStatus(""), 8000);
      return;
    }

    // ❌ CASE 2: 에러는 없지만 0 rows updated → RLS 차단이 유력한 원인
    if (!updatedRows || updatedRows.length === 0) {
      setSavingExt(false);
      setExtSaveStatus("❌ 저장 되지 않음! Supabase RLS 정책이 UPDATE를 막고 있습니다. AQUNOTE_FIX_RLS_UPDATE.sql 실행 필요");
      setTimeout(() => setExtSaveStatus(""), 10000);
      return;
    }

    // ✅ 성공
    setSavingExt(false);
    setExtSaveStatus("✅ 저장 완료");
    // 로드된 member state도 갱신
    setMember({ ...member, ...updatedRows[0] });
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
      // ✅ v3.12.3: 확장 기본정보 로드 + 상담폼 자동 보완
      //   컬럼/extra 값이 비어있으면 extra.consult_form에서 자동으로 보완적 표시
      const baseExtInfo = {
        current_status: m?.current_status || m?.extra?.current_status || "",
        main_symptom: m?.main_symptom || m?.extra?.main_symptom || "",
        medication: m?.medication || m?.extra?.medication || "",
        treatment_history: m?.treatment_history || m?.extra?.treatment_history || "",
        expected_change: m?.expected_change || m?.extra?.expected_change || "",
        special_notes: m?.special_notes || m?.extra?.special_notes || "",
      };
      if (m?.extra?.consult_form) {
        try {
          const { mapConsultFormToMemberInfo, mergeMappedInfo } = await import("@/lib/consultFormMapper");
          const mapped = mapConsultFormToMemberInfo(m.extra.consult_form, m.member_type);
          const merged = mergeMappedInfo(baseExtInfo, mapped, "fill_empty");
          setExtInfo(merged);
        } catch (e) {
          console.warn("상담폼 자동 보완 실패:", e);
          setExtInfo(baseExtInfo);
        }
      } else {
        setExtInfo(baseExtInfo);
      }
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

  // ✨ 기본 정보 수정 (유형/이름/연락처 등)
  const [editingBasic, setEditingBasic] = useState(false);
  const [basicForm, setBasicForm] = useState<any>({});
  function openBasicEdit() {
    setBasicForm({
      name: member.name || "",
      member_type: member.member_type || "adult",
      phone: member.phone || "",
      birth: member.birth || "",
      gender: member.gender || "",
      guardian_name: member.guardian_name || "",
      guardian_relation: member.guardian_relation || "",
      address: member.address || "",
      source: member.source || "",
      diagnosis: member.extra?.diagnosis || "",
    });
    setEditingBasic(true);
  }
  async function saveBasicEdit() {
    const { diagnosis, ...rest } = basicForm;
    const payload: any = { ...rest };
    if (payload.member_type === "adult") {
      // 성인으로 변경 시 보호자 필드 비움
      payload.guardian_name = null;
      payload.guardian_relation = null;
    }
    // ✅ 빈 문자열 → null 변환 (PostgreSQL date/text 타입 에러 방지)
    //   특히 birth(date), phone, guardian_name, guardian_relation, address, gender, source 등
    const NULLABLE_FIELDS = ["birth", "phone", "gender", "guardian_name", "guardian_relation", "address", "source"];
    for (const k of NULLABLE_FIELDS) {
      if (payload[k] === "" || payload[k] === undefined) payload[k] = null;
    }
    // 이름은 필수 - 비어있으면 저장 거부
    if (!payload.name || !payload.name.trim()) {
      alert("이름은 필수입니다");
      return;
    }
    // 진단명은 extra JSONB에 저장 (기존 키 보존)
    payload.extra = { ...(member.extra || {}), diagnosis: diagnosis || null };
    const { error } = await supabase.from("members").update(payload).eq("id", member.id);
    if (error) return alert("수정 실패: " + error.message);
    setMember({ ...member, ...payload });
    setEditingBasic(false);
    setSaveStatus("✅ 기본정보 수정됨");
    setTimeout(() => setSaveStatus(""), 2500);
  }

  async function deleteMember() {
    if (!confirm(`⚠️ '${member.name}'님을 완전 삭제하시겠습니까?\n\n다음 데이터가 영구 삭제됩니다:\n· 회원 기본/상세정보\n· 시간표 예약/수업 기록\n· 출결 기록\n· 회원권/결제 내역\n· 상담차트/IEP/행동기록\n· 고정시간표 배정\n\n복구할 수 없습니다. 계속하시겠습니까?`)) return;
    if (!confirm(`마지막 확인: '${member.name}'님 완전 삭제 진행?`)) return;

    const memberId = member.id;
    const errors: string[] = [];

    // ✅ v3.13.7: 연관 데이터 전체 하드 삭제 (삭제된 회원이 다른 페이지에 남지 않도록)
    // 1) 시간표 예약/수업 (member_id 참조)
    const r1 = await supabase.from("schedule_slots").delete().eq("member_id", memberId);
    if (r1.error) errors.push("시간표: " + r1.error.message);

    // 2) 고정시간표 배정 (slot_matrix.member_id 참조 → OPEN으로 복원)
    const r2 = await supabase.from("slot_matrix").update({
      status: "open", fixed_name: null, member_id: null,
    }).eq("member_id", memberId);
    if (r2.error && r2.error.code !== "42703") errors.push("고정시간표: " + r2.error.message);

    // 3) 출결 기록
    const r3 = await supabase.from("attendance").delete().eq("member_id", memberId);
    if (r3.error) errors.push("출결: " + r3.error.message);

    // 4) 결제 내역
    const r4 = await supabase.from("payments").delete().eq("member_id", memberId);
    if (r4.error) errors.push("결제: " + r4.error.message);

    // 5) 회원권
    const r5 = await supabase.from("memberships").delete().eq("member_id", memberId);
    if (r5.error) errors.push("회원권: " + r5.error.message);

    // 6) 상담차트 / IEP / 행동기록 / 문서 등 (있는 경우에만 시도 - 테이블/컴럼 없으면 조용히 스킵)
    for (const tbl of ["consultation_charts", "iep_goals", "behavior_records", "documents", "leads_inbox"]) {
      try {
        const r = await supabase.from(tbl).delete().eq("member_id", memberId);
        // 테이블 없음(42P01) / 컴럼 없음(42703) / schema cache miss(PGRST205) / not found 모두 무시
        if (r.error) {
          const code = r.error.code || "";
          const msg = (r.error.message || "").toLowerCase();
          const ignoreCodes = ["42P01", "42703", "PGRST205", "PGRST204", "PGRST202"];
          const ignoreMsgs = ["could not find the table", "could not find the", "schema cache", "does not exist", "not found"];
          const shouldIgnore = ignoreCodes.includes(code) || ignoreMsgs.some(m => msg.includes(m));
          if (!shouldIgnore) errors.push(tbl + ": " + r.error.message);
        }
      } catch (e: any) {
        // 네트워크 에러 등도 조용히 스킵
      }
    }

    // 7) 마지막으로 members 자체 완전 삭제
    const rFinal = await supabase.from("members").delete().eq("id", memberId);
    if (rFinal.error) {
      alert("삭제 실패: " + rFinal.error.message + (errors.length > 0 ? "\n\n연관 데이터 삭제 에러:\n" + errors.join("\n") : ""));
      return;
    }

    if (errors.length > 0) {
      alert(`⚠️ '${member.name}'님은 삭제되었으나 일부 연관 데이터 삭제에 실패:\n${errors.join("\n")}`);
    } else {
      alert(`✅ '${member.name}'님이 완전 삭제되었습니다.\n(모든 연관 데이터 동시 삭제)`);
    }
    router.push('/members');
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
                <span className="text-sm text-gray-500">{["F","female","여","여자"].includes(member.gender) ? "여" : ["M","male","남","남자"].includes(member.gender) ? "남" : ""}</span>
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
          { k: "consult_form", label: "📋 상담폼" },
          { k: "chart", label: "📝 상담차트" },
          { k: "history", label: "💰 결제·회원권·출석" },
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
            {/* 기본 정보 - 회원유형/이름/연락처 수정 가능 */}
            <div className="bg-aqu-50/30 border border-aqu-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-aqu-900">📌 기본 정보</h4>
                {!editingBasic ? (
                  <button onClick={openBasicEdit}
                    className="text-xs px-3 py-1.5 bg-aqu-600 text-white rounded-lg hover:bg-aqu-700">✏️ 수정</button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setEditingBasic(false)}
                      className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg">취소</button>
                    <button onClick={saveBasicEdit}
                      className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700">💾 저장</button>
                  </div>
                )}
              </div>
              {!editingBasic ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InfoRow label="이름" value={member.name || "-"} />
                    <InfoRow label="유형" value={member.member_type === "child" ? "🧒 아동" : "👤 성인"} />
                    <InfoRow label="진단명" value={member.extra?.diagnosis || "-"} />
                    <InfoRow label="생년월일" value={member.birth ? `${member.birth} (만 ${calcAge(member.birth)}세)` : "-"} />
                    <InfoRow label="연락처" value={member.phone || member.guardian_phone || "-"} />
                    <InfoRow label="성별" value={["F","female","여","여자"].includes(member.gender) ? "여" : ["M","male","남","남자"].includes(member.gender) ? "남" : (member.gender || "-")} />
                    <InfoRow label="주소" value={member.address || "-"} />
                    <InfoRow label="유입경로" value={member.source || "-"} />
                    <InfoRow label="상태" value={getStatusLabel(member.status)} highlight />
                    {member.member_type === "child" && member.guardian_name && (
                      <InfoRow label="보호자" value={`${member.guardian_name} (${member.guardian_relation || ""})`} />
                    )}
                  </div>

                  {/* ✅ v3.13.3: 희망 시간대 자동 계산 + 수정 */}
                  <div className="mt-4">
                    <WishScheduleCard
                      memberId={member.id}
                      wishDays={member.wish_days}
                      wishTimeSlots={member.wish_time_slots}
                      onSaved={async () => {
                        const { data } = await supabase.from("members").select("*").eq("id", member.id).single();
                        if (data) setMember(data as any);
                      }}
                    />
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">이름 *</label>
                    <input type="text" value={basicForm.name}
                      onChange={e => setBasicForm({ ...basicForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">회원 유형 * (성인 ↔ 아동 변경 가능)</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setBasicForm({ ...basicForm, member_type: "adult" })}
                        className={`py-2 rounded-lg text-sm border-2 ${basicForm.member_type === "adult" ? "bg-purple-100 border-purple-500 text-purple-700 font-bold" : "bg-white border-gray-200 text-gray-500"}`}>
                        👤 성인
                      </button>
                      <button type="button" onClick={() => setBasicForm({ ...basicForm, member_type: "child" })}
                        className={`py-2 rounded-lg text-sm border-2 ${basicForm.member_type === "child" ? "bg-blue-100 border-blue-500 text-blue-700 font-bold" : "bg-white border-gray-200 text-gray-500"}`}>
                        🧒 아동
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">연락처</label>
                    <input type="tel" value={basicForm.phone}
                      onChange={e => setBasicForm({ ...basicForm, phone: e.target.value })}
                      placeholder="010-1234-5678"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">생년월일</label>
                    <input type="date" value={basicForm.birth}
                      onChange={e => setBasicForm({ ...basicForm, birth: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">성별</label>
                    <select value={basicForm.gender}
                      onChange={e => setBasicForm({ ...basicForm, gender: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                      <option value="">선택</option>
                      <option value="남">남자</option>
                      <option value="여">여자</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">유입경로</label>
                    <input type="text" value={basicForm.source}
                      onChange={e => setBasicForm({ ...basicForm, source: e.target.value })}
                      placeholder="검색/지인/광고"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-gray-600 block mb-1">🩺 진단명</label>
                    <input type="text" value={basicForm.diagnosis || ""}
                      onChange={e => setBasicForm({ ...basicForm, diagnosis: e.target.value })}
                      placeholder="예: 뇌병변, 자폐스펙트럼, 다운증후군, 요추 추간판 탈출증 등"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  {basicForm.member_type === "child" && (
                    <>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">보호자 이름</label>
                        <input type="text" value={basicForm.guardian_name}
                          onChange={e => setBasicForm({ ...basicForm, guardian_name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">관계</label>
                        <input type="text" value={basicForm.guardian_relation}
                          onChange={e => setBasicForm({ ...basicForm, guardian_relation: e.target.value })}
                          placeholder="부/모"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                    </>
                  )}
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-gray-600 block mb-1">주소</label>
                    <input type="text" value={basicForm.address}
                      onChange={e => setBasicForm({ ...basicForm, address: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                </div>
              )}
            </div>

            {/* 확장 정보 - 편집 가능 */}
            <div className="border-t border-aqu-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-aqu-900">📋 상세 정보</h4>
                {/* ✅ v3.12.3: 상담폼에서 자동 채우기 버튼 */}
                {member?.extra?.consult_form && (
                  <button
                    type="button"
                    onClick={async () => {
                      const mode = confirm(
                        "상담폼 데이터로 상세 정보를 자동 채움니다.\n\n✅ 확인: 비어있는 칸만 채우기 (기존 값 보존)\n❌ 취소: 작업 중단"
                      );
                      if (!mode) return;
                      try {
                        const { mapConsultFormToMemberInfo, mergeMappedInfo } = await import("@/lib/consultFormMapper");
                        const mapped = mapConsultFormToMemberInfo(member.extra.consult_form, member.member_type);
                        const merged = mergeMappedInfo(extInfo, mapped, "fill_empty");
                        setExtInfo(merged);
                        // 진단명도 extra에 보완 (기존이 비어있을 때만)
                        if (mapped.diagnosis && !member?.extra?.diagnosis) {
                          const newExtra = { ...(member.extra || {}), diagnosis: mapped.diagnosis };
                          await supabase.from("members").update({ extra: newExtra }).eq("id", member.id);
                          setMember({ ...member, extra: newExtra });
                        }
                        alert("✅ 상담폼 데이터가 상세 정보 칸에 채워졌습니다.\n검토 후 [상세 정보 저장] 버튼을 눌러 저장해주세요.");
                      } catch (e: any) {
                        alert("자동 채우기 실패: " + (e?.message || e));
                      }
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 text-white font-semibold hover:opacity-90 shadow-sm flex items-center gap-1"
                    title="상담폼(네이버폼/구글폼)에서 수집한 데이터로 자동 채움">
                    🔄 상담폼에서 자동 채우기
                  </button>
                )}
              </div>
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

        {tab === "chart" && (
          <ConsultationChartPanel memberId={id as string} member={member} />
        )}

        {tab === "history" && (
          <MemberHistoryPanel memberId={id as string} />
        )}

        {tab === "assessment" && (
          <AquaAssessmentPanel memberId={id as string} skills={skills} setSkills={setSkills} onSaveBasic={saveAssessment} />
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

// ═══════════════════════════════════════════════════════════════
// 🩺 수중기능평가 패널 (특허 기반 4등급 자동 산정)
// ═══════════════════════════════════════════════════════════════
function AquaAssessmentPanel({ memberId, skills, setSkills, onSaveBasic }: any) {
  const [subtab, setSubtab] = useState<"basic" | "pro" | "history" | "content">("pro");
  const [assess, setAssess] = useState<any>({});
  const [history, setHistory] = useState<any[]>([]);
  const [contentLib, setContentLib] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // 최근 평가 불러오기
    (async () => {
      const { data } = await supabase.from("aqua_assessments")
        .select("*")
        .eq("member_id", memberId)
        .order("assessed_at", { ascending: false })
        .limit(20);
      if (data && data.length > 0) {
        setAssess(data[0]);
        setHistory(data);
      }
    })();
    // 콘텐츠 라이브러리
    (async () => {
      const { data } = await supabase.from("aqua_content_library")
        .select("*").eq("is_active", true).order("level").order("code");
      setContentLib(data || []);
    })();
  }, [memberId]);

  const grade = computeAquaGrade(assess as AssessmentInput);
  const levelInfo = LEVEL_INFO[grade.level];
  const recommendedContents = contentLib.filter(c => c.level === grade.level);

  async function saveProAssessment() {
    setSaving(true);
    const payload = {
      ...assess,
      member_id: memberId,
      assessed_at: assess.assessed_at || new Date().toISOString().split("T")[0],
      computed_level: grade.level,
      level_confidence: grade.confidence,
      level_rationale: grade.rationale.join("\n"),
      recommended_content: recommendedContents.map(c => ({ code: c.code, title: c.title })),
      updated_at: new Date().toISOString(),
    };
    delete payload.id; delete payload.created_at;

    let error;
    if (assess.id) {
      ({ error } = await supabase.from("aqua_assessments").update(payload).eq("id", assess.id));
    } else {
      const { data: memberData } = await supabase.from("members").select("org_id").eq("id", memberId).single();
      const { data, error: e } = await supabase.from("aqua_assessments").insert({ ...payload, org_id: memberData?.org_id }).select().single();
      if (data) setAssess(data);
      error = e;
    }
    setSaving(false);
    if (error) { alert("저장 실패: " + error.message); return; }
    alert(`✅ 저장 완료! 자동 산정 등급: ${levelInfo.label} (${grade.confidence})`);
    // 히스토리 갱신
    const { data } = await supabase.from("aqua_assessments").select("*").eq("member_id", memberId).order("assessed_at", { ascending: false });
    if (data) setHistory(data);
  }

  return (
    <div>
      {/* 서브탭 */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[
          { k: "pro",     label: "🩺 전문 평가",    icon: Stethoscope },
          { k: "basic",   label: "🌊 기본 8항목",   icon: Waves },
          { k: "content", label: "📚 콘텐츠 추천",  icon: BookOpen },
          { k: "history", label: "📈 평가 이력",    icon: TrendingUp },
        ].map(t => (
          <button key={t.k} onClick={() => setSubtab(t.k as any)}
            className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 ${
              subtab === t.k ? "bg-aqu-600 text-white shadow" : "bg-white border border-aqu-200 text-aqu-700 hover:bg-aqu-50"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── [1] 전문 평가 ── */}
      {subtab === "pro" && (
        <div className="space-y-5">
          {/* 등급 결과 카드 */}
          <div className={`rounded-2xl p-5 border-2 ${levelInfo.ring} ${levelInfo.bg}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${levelInfo.color} flex items-center justify-center shadow-lg`}>
                  <span className="text-2xl font-black text-white">{grade.level}</span>
                </div>
                <div>
                  <div className={`text-lg font-bold ${levelInfo.text}`}>{levelInfo.label} · {levelInfo.subtitle}</div>
                  <div className="text-xs text-gray-500 mt-0.5">자동 산정 · 신뢰도 <b>{grade.confidence}</b> · 점수 <b>{grade.score.toFixed(1)}/100</b></div>
                </div>
              </div>
              <button onClick={saveProAssessment} disabled={saving}
                className="px-4 py-2.5 bg-gradient-to-br from-aqu-600 to-aqu-700 text-white rounded-xl shadow font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                <Save className="w-4 h-4" /> {saving ? "저장 중..." : "평가 저장"}
              </button>
            </div>
            <div className={`text-sm ${levelInfo.text} mt-2`}>{levelInfo.description}</div>
            {grade.rationale.length > 0 && (
              <details className="mt-3 text-xs text-gray-600">
                <summary className="cursor-pointer font-semibold hover:text-aqu-700">📋 산정 근거 보기</summary>
                <ul className="mt-2 space-y-0.5 pl-4 list-disc">
                  {grade.rationale.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </details>
            )}
          </div>

          {/* 평가일 */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-gray-700">평가일</label>
            <input type="date" value={assess.assessed_at || new Date().toISOString().split("T")[0]}
              onChange={e => setAssess({ ...assess, assessed_at: e.target.value })}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
          </div>

          {/* 관절가동범위 */}
          <SectionCard title="🦴 관절 가동범위 (ROM, 각도°)" color="border-blue-200">
            <NumField label="어깨 굴곡"     max={180} v={assess.rom_shoulder_flexion}   onC={v => setAssess({ ...assess, rom_shoulder_flexion: v })} />
            <NumField label="어깨 외전"     max={180} v={assess.rom_shoulder_abduction} onC={v => setAssess({ ...assess, rom_shoulder_abduction: v })} />
            <NumField label="고관절 굴곡"   max={120} v={assess.rom_hip_flexion}        onC={v => setAssess({ ...assess, rom_hip_flexion: v })} />
            <NumField label="무릎 굴곡"     max={135} v={assess.rom_knee_flexion}       onC={v => setAssess({ ...assess, rom_knee_flexion: v })} />
            <NumField label="발목 배측굴곡" max={20}  v={assess.rom_ankle_dorsiflexion} onC={v => setAssess({ ...assess, rom_ankle_dorsiflexion: v })} />
          </SectionCard>

          {/* 근력 MMT */}
          <SectionCard title="💪 근력 (MMT 0-5)" color="border-red-200">
            <ScaleField label="상지 근력" max={5} v={assess.mmt_upper_limb} onC={v => setAssess({ ...assess, mmt_upper_limb: v })} />
            <ScaleField label="하지 근력" max={5} v={assess.mmt_lower_limb} onC={v => setAssess({ ...assess, mmt_lower_limb: v })} />
            <ScaleField label="체간 근력" max={5} v={assess.mmt_trunk}      onC={v => setAssess({ ...assess, mmt_trunk: v })} />
            <ScaleField label="악력"      max={5} v={assess.mmt_grip}       onC={v => setAssess({ ...assess, mmt_grip: v })} />
          </SectionCard>

          {/* 균형 */}
          <SectionCard title="⚖️ 균형 (Berg 0-4)" color="border-yellow-200">
            <ScaleField label="정적 균형"    max={4} v={assess.balance_static}    onC={v => setAssess({ ...assess, balance_static: v })} />
            <ScaleField label="동적 균형"    max={4} v={assess.balance_dynamic}   onC={v => setAssess({ ...assess, balance_dynamic: v })} />
            <ScaleField label="반응성 균형"  max={4} v={assess.balance_reactive}  onC={v => setAssess({ ...assess, balance_reactive: v })} />
          </SectionCard>

          {/* 통증 & 감각 */}
          <SectionCard title="🌡 통증 & 감각" color="border-orange-200">
            <ScaleField label="통증 (VAS)" max={10} v={assess.pain_score} onC={v => setAssess({ ...assess, pain_score: v })} />
            <div className="col-span-2">
              <label className="text-xs text-gray-600 block mb-1">통증 부위</label>
              <input value={assess.pain_area || ""} onChange={e => setAssess({ ...assess, pain_area: e.target.value })}
                placeholder="예: 우측 어깨, 요추" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <ScaleField label="촉각"       max={4} v={assess.sensory_touch}          onC={v => setAssess({ ...assess, sensory_touch: v })} />
            <ScaleField label="온도감각"   max={4} v={assess.sensory_temperature}    onC={v => setAssess({ ...assess, sensory_temperature: v })} />
            <ScaleField label="고유감각"   max={4} v={assess.sensory_proprioception} onC={v => setAssess({ ...assess, sensory_proprioception: v })} />
            <label className="flex items-center gap-2 col-span-full">
              <input type="checkbox" checked={!!assess.sensory_hypersensitive}
                onChange={e => setAssess({ ...assess, sensory_hypersensitive: e.target.checked })} />
              <span className="text-sm">🚨 감각 과민 있음 (등급 하향 요인)</span>
            </label>
          </SectionCard>

          {/* 수중 기본 기능 */}
          <SectionCard title="🌊 수중 기본 기능 (0-5)" color="border-cyan-200">
            <ScaleField label="부력 적응"  max={5} v={assess.buoyancy_adaptation} onC={v => setAssess({ ...assess, buoyancy_adaptation: v })} />
            <ScaleField label="호흡 조절"  max={5} v={assess.breath_control}      onC={v => setAssess({ ...assess, breath_control: v })} />
            <ScaleField label="신체 조절"  max={5} v={assess.body_control}        onC={v => setAssess({ ...assess, body_control: v })} />
            <ScaleField label="수중 보행"  max={5} v={assess.aquatic_gait}        onC={v => setAssess({ ...assess, aquatic_gait: v })} />
            <ScaleField label="협응력"     max={5} v={assess.coordination}        onC={v => setAssess({ ...assess, coordination: v })} />
            <ScaleField label="지구력"     max={5} v={assess.endurance}           onC={v => setAssess({ ...assess, endurance: v })} />
          </SectionCard>

          {/* 인지 / 행동 */}
          <SectionCard title="🧠 인지 · 행동 (0-4)" color="border-purple-200">
            <ScaleField label="주의력"     max={4} v={assess.cognition_attention}    onC={v => setAssess({ ...assess, cognition_attention: v })} />
            <ScaleField label="지시 수행"  max={4} v={assess.cognition_instruction}  onC={v => setAssess({ ...assess, cognition_instruction: v })} />
            <ScaleField label="순응도"     max={4} v={assess.behavior_compliance}    onC={v => setAssess({ ...assess, behavior_compliance: v })} />
          </SectionCard>

          {/* 종합 메모 */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">📝 종합 소견</label>
            <textarea rows={3} value={assess.overall_notes || ""}
              onChange={e => setAssess({ ...assess, overall_notes: e.target.value })}
              placeholder="특이사항, 재평가 시점, 치료 방향성 등"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>

          <button onClick={saveProAssessment} disabled={saving}
            className="w-full px-5 py-3 bg-gradient-to-br from-aqu-600 to-aqu-700 text-white rounded-xl shadow font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
            <Save className="w-5 h-5" /> {saving ? "저장 중..." : `전문 평가 저장 (${levelInfo.label} 자동 산정)`}
          </button>
        </div>
      )}

      {/* ── [2] 기본 8항목 (기존) ── */}
      {subtab === "basic" && (
        <div>
          <h3 className="text-lg font-bold text-aqu-900 mb-4">🌊 기본 수중 기능 (0-5점)</h3>
          <div className="space-y-3 mb-4">
            {WATER_SKILLS.map((s: any) => (
              <div key={s.key} className="flex items-center gap-3">
                <span className="w-28 text-sm text-gray-700">{s.label}</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setSkills((prev: any) => ({ ...prev, [s.key]: n }))}
                      className={`w-8 h-8 rounded-lg text-sm ${(skills[s.key] || 0) >= n ? "bg-aqu-500 text-white" : "bg-gray-100 text-gray-400 hover:bg-aqu-100"}`}>
                      {n}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-gray-500 ml-auto">{skills[s.key] || 0}/5</span>
              </div>
            ))}
          </div>
          <button onClick={onSaveBasic} className="px-4 py-2 bg-aqu-600 text-white rounded-lg text-sm hover:bg-aqu-700 flex items-center gap-1">
            <Save className="w-4 h-4" /> 평가 저장
          </button>
        </div>
      )}

      {/* ── [3] 콘텐츠 추천 ── */}
      {subtab === "content" && (
        <div>
          <div className={`p-4 rounded-xl mb-4 ${levelInfo.bg}`}>
            <div className={`text-sm font-bold ${levelInfo.text}`}>
              📚 현재 회원 등급 <span className="text-lg">{levelInfo.label}</span> 맞춤 콘텐츠 {recommendedContents.length}개
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recommendedContents.map(c => (
              <div key={c.id} className="p-4 border border-gray-200 rounded-xl hover:border-aqu-300 hover:shadow-sm transition bg-white">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{c.code}</span>
                    <div className="font-bold text-slate-900 mt-1">{c.title}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${levelInfo.bg} ${levelInfo.text} font-semibold`}>{c.category}</span>
                </div>
                <div className="text-xs text-gray-600 mb-2">{c.description}</div>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">⏱ {c.duration_min}분</span>
                  <span className="px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded">💪 {c.intensity}</span>
                  {c.equipment && c.equipment !== "없음" && <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded">🛠 {c.equipment}</span>}
                  {c.target_area && <span className="px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded">🎯 {c.target_area}</span>}
                </div>
              </div>
            ))}
            {recommendedContents.length === 0 && (
              <div className="col-span-full text-sm text-gray-400 text-center py-8">
                이 등급에 등록된 콘텐츠가 없습니다
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── [4] 평가 이력 ── */}
      {subtab === "history" && (
        <div>
          {history.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">아직 저장된 평가가 없습니다</div>
          ) : (
            <div className="space-y-2">
              {history.map(h => {
                const li = LEVEL_INFO[h.computed_level as 1|2|3|4] || LEVEL_INFO[2];
                return (
                  <div key={h.id} className="flex items-center gap-4 p-3 border border-gray-100 rounded-xl hover:border-aqu-200 transition cursor-pointer"
                    onClick={() => setAssess(h)}>
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${li.color} flex items-center justify-center shadow`}>
                      <span className="text-white font-black">{h.computed_level || "?"}</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-slate-900">{h.assessed_at}</div>
                      <div className="text-xs text-gray-500">{li.subtitle} · 신뢰도 {h.level_confidence || "-"}</div>
                    </div>
                    <div className="text-xs text-aqu-700">불러오기 →</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionCard({ title, color, children }: any) {
  return (
    <div className={`border ${color} rounded-xl p-4`}>
      <h4 className="font-bold text-sm text-slate-800 mb-3">{title}</h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

function NumField({ label, max, v, onC }: any) {
  return (
    <div>
      <label className="text-xs text-gray-600 block mb-1">{label} <span className="text-gray-400">(0-{max})</span></label>
      <input type="number" min={0} max={max} value={v ?? ""}
        onChange={e => onC(e.target.value === "" ? null : Math.min(max, Math.max(0, Number(e.target.value))))}
        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm" />
    </div>
  );
}

function ScaleField({ label, max, v, onC }: any) {
  return (
    <div>
      <label className="text-xs text-gray-600 block mb-1">{label} <span className="text-gray-400">(0-{max})</span></label>
      <div className="flex gap-1">
        {Array.from({ length: max + 1 }, (_, i) => i).map(n => (
          <button key={n} type="button" onClick={() => onC(n)}
            className={`flex-1 h-7 rounded text-xs font-bold transition ${
              (v ?? -1) === n ? "bg-aqu-600 text-white shadow" : "bg-gray-100 text-gray-500 hover:bg-aqu-100"
            }`}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 💰 회원 결제·회원권·출석 통합 이력 패널
// ═══════════════════════════════════════════════════════════════
function MemberHistoryPanel({ memberId }: { memberId: string }) {
  const [payments, setPayments] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, [memberId]);

  async function loadAll() {
    setLoading(true);
    const [p, ms, at, sl, rf] = await Promise.all([
      supabase.from("payments").select("*").eq("member_id", memberId).order("paid_at", { ascending: false }),
      // memberships 조회 — order 실패 시 no-order로 fallback
      (async () => {
        const r1 = await supabase.from("memberships").select("*").eq("member_id", memberId).order("start_date", { ascending: false });
        if (r1.error) {
          console.warn("memberships 조회 fallback:", r1.error);
          return await supabase.from("memberships").select("*").eq("member_id", memberId);
        }
        return r1;
      })(),
      supabase.from("attendance").select("*").eq("member_id", memberId),
      supabase.from("schedule_slots").select("*").eq("member_id", memberId).is("deleted_at", null).order("event_date", { ascending: false }),
      supabase.from("refunds").select("*").eq("member_id", memberId).order("refunded_at", { ascending: false }),
    ]);
    setPayments(p.data || []);
    setMemberships(ms.data || []);
    setAttendance(at.data || []);
    setSlots(sl.data || []);
    setRefunds(rf.data || []);
    setLoading(false);
  }

  // 통계 계산
  const totalPaid = payments.filter(p => p.status !== "cancelled").reduce((s, p) => s + (p.amount || 0), 0);
  const totalRefunded = payments.reduce((s, p) => s + (p.refunded_amount || 0), 0);
  const netPaid = totalPaid - totalRefunded;

  const activeMemberships = memberships.filter(m => m.status !== "cancelled");
  const totalSessions = activeMemberships.reduce((s, m) => s + (m.total_sessions || 0) + (m.adjustment || 0), 0);
  const usedSessions = activeMemberships.reduce((s, m) => s + (m.used_sessions || 0), 0);
  const remainingSessions = totalSessions - usedSessions;

  const doneSlots = slots.filter(s => ["done", "completed"].includes((s.status || "").toLowerCase())).length;
  const noshowSlots = slots.filter(s => (s.status || "").toLowerCase() === "noshow").length;
  const sickSlots = slots.filter(s => (s.status || "").toLowerCase() === "sick").length;
  const cancelSlots = slots.filter(s => ["cancel", "cancelled"].includes((s.status || "").toLowerCase())).length;
  const carryoverSlots = slots.filter(s => (s.status || "").toLowerCase() === "carryover").length;

  if (loading) return <div className="text-center py-10 text-gray-400">로딩 중...</div>;

  return (
    <div className="space-y-5">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon="💰" label="누적 결제" val={`₩${netPaid.toLocaleString()}`}
          sub={totalRefunded > 0 ? `환불 ₩${totalRefunded.toLocaleString()}` : ""} color="from-blue-500 to-cyan-500" />
        <StatCard icon="🎫" label="회원권 잔여" val={`${remainingSessions}회`}
          sub={`총 ${totalSessions}회 · 사용 ${usedSessions}회`} color="from-purple-500 to-pink-500" />
        <StatCard icon="✅" label="완료 수업" val={`${doneSlots}회`}
          sub={`노쇼 ${noshowSlots}회 · 병결 ${sickSlots}회`} color="from-green-500 to-emerald-500" />
        <StatCard icon="📅" label="예약 이력" val={`${slots.length}건`}
          sub={`취소 ${cancelSlots} · 이월 ${carryoverSlots}`} color="from-orange-500 to-red-500" />
      </div>

      {/* 회원권 목록 */}
      <div>
        <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-1">🎫 회원권 이력 ({memberships.length}건)</h4>
        {memberships.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm bg-gray-50 rounded-xl">등록된 회원권이 없습니다</div>
        ) : (
          <div className="space-y-2">
            {memberships.map(m => {
              const remaining = (m.total_sessions || 0) + (m.adjustment || 0) - (m.used_sessions || 0);
              const isCancelled = m.status === "cancelled";
              const isExpired = m.end_date && new Date(m.end_date) < new Date();
              return (
                <div key={m.id} className={`p-3 border rounded-xl ${isCancelled ? "bg-gray-50 border-gray-200 opacity-70" : isExpired ? "bg-yellow-50 border-yellow-200" : "bg-purple-50 border-purple-200"}`}>
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <div className={`font-bold ${isCancelled ? "text-gray-500 line-through" : "text-slate-900"}`}>{m.plan_name}</div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {m.start_date} ~ {m.end_date} · ₩{(m.price || 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {isCancelled && <span className="text-[10px] px-2 py-0.5 bg-red-500 text-white rounded font-bold">❌ 종결</span>}
                      {!isCancelled && isExpired && <span className="text-[10px] px-2 py-0.5 bg-yellow-500 text-white rounded font-bold">⏰ 만료</span>}
                      {!isCancelled && !isExpired && <span className="text-[10px] px-2 py-0.5 bg-green-500 text-white rounded font-bold">✓ 활성</span>}
                      <div className={`text-lg font-black ${remaining <= 2 ? "text-red-500" : "text-purple-700"}`}>
                        {remaining}/{(m.total_sessions || 0) + (m.adjustment || 0)}
                      </div>
                    </div>
                  </div>
                  {(m.refund_status && m.refund_status !== "none") && (
                    <div className="text-[10px] text-orange-600 mt-1 pt-1 border-t border-gray-200">
                      💵 {m.refund_status === "partial" ? "부분 환불됨" : "전액 환불됨"}
                      {m.cancelled_reason && ` · ${m.cancelled_reason}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 결제 이력 */}
      <div>
        <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-1">💳 결제 이력 ({payments.length}건)</h4>
        {payments.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm bg-gray-50 rounded-xl">결제 이력이 없습니다</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="p-2 text-left">일시</th>
                  <th className="p-2 text-left">상품</th>
                  <th className="p-2 text-center">수단</th>
                  <th className="p-2 text-right">금액</th>
                  <th className="p-2 text-center">상태</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => {
                  const isCancelled = p.status === "cancelled";
                  return (
                    <tr key={p.id} className={`border-b ${isCancelled ? "opacity-60" : ""}`}>
                      <td className="p-2 text-gray-600">
                        {p.paid_at}
                        {p.paid_time && <div className="text-[10px] text-gray-400">{p.paid_time}</div>}
                      </td>
                      <td className="p-2">
                        <div className={isCancelled ? "line-through text-gray-500" : ""}>{p.description || p.lesson_name || "-"}</div>
                        {p.cancelled_reason && <div className="text-[10px] text-red-600">취소: {p.cancelled_reason}</div>}
                      </td>
                      <td className="p-2 text-center">
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]">
                          {p.method === "card" ? "💳" : p.method === "cash" ? "💵" : p.method === "transfer" ? "🏦" : "📝"}
                        </span>
                      </td>
                      <td className={`p-2 text-right font-bold ${isCancelled ? "text-gray-400 line-through" : "text-slate-900"}`}>
                        ₩{(p.amount || 0).toLocaleString()}
                        {p.refunded_amount > 0 && (
                          <div className="text-[10px] text-orange-600 font-normal">-₩{p.refunded_amount.toLocaleString()}</div>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {isCancelled ? (
                          <span className="text-[10px] px-1.5 py-0.5 bg-red-500 text-white rounded">취소</span>
                        ) : p.refunded_amount > 0 ? (
                          <span className="text-[10px] px-1.5 py-0.5 bg-orange-500 text-white rounded">부분환불</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 bg-green-500 text-white rounded">정상</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 환불 이력 */}
      {refunds.length > 0 && (
        <div>
          <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-1">💵 환불 이력 ({refunds.length}건)</h4>
          <div className="space-y-1.5">
            {refunds.map(r => (
              <div key={r.id} className="flex items-center justify-between p-2.5 bg-orange-50 border border-orange-100 rounded-lg text-xs">
                <div>
                  <div className="font-semibold text-orange-800">₩{r.refund_amount.toLocaleString()}</div>
                  <div className="text-[10px] text-gray-600">
                    {r.refunded_at} · {r.refund_method === "transfer" ? "🏦 계좌이체" : r.refund_method === "card" ? "💳 카드취소" : "💵 현금"}
                    {r.used_sessions !== null && ` · 사용 ${r.used_sessions}회 시점`}
                  </div>
                </div>
                {r.reason && <div className="text-[10px] text-gray-500 max-w-[50%] text-right">{r.reason}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 출석·수업 이력 */}
      <div>
        <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-1">📅 수업·출결 이력 ({slots.length}건)</h4>
        {slots.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm bg-gray-50 rounded-xl">수업 이력이 없습니다</div>
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-1">
            {slots.map(s => {
              const st = (s.status || "").toLowerCase();
              const isDone = ["done", "completed"].includes(st);
              const isNoshow = st === "noshow";
              const isSick = st === "sick";
              const isCancel = ["cancel", "cancelled"].includes(st);
              const isCarry = st === "carryover";
              const label = isDone ? "✅ 완료" : isNoshow ? "🚩 노쇼" : isSick ? "🤒 병결" :
                            isCancel ? "❌ 취소" : isCarry ? "📅 이월" : "🔵 예약";
              const bg = isDone ? "bg-green-50 border-green-200" :
                        isNoshow ? "bg-red-50 border-red-200" :
                        isSick ? "bg-orange-50 border-orange-200" :
                        isCancel ? "bg-gray-50 border-gray-200" :
                        isCarry ? "bg-purple-50 border-purple-200" : "bg-blue-50 border-blue-200";
              const chargesSession = isDone || isNoshow;
              return (
                <div key={s.id} className={`flex items-center gap-2 p-2 border rounded-lg text-xs ${bg}`}>
                  <div className="w-20 text-gray-700 font-mono text-[11px]">{s.event_date}</div>
                  <div className="w-14 text-gray-500 text-[11px]">{s.time_slot || "-"}</div>
                  <div className="flex-1 text-slate-700">{s.lesson_name || (s.event_type === "trial" ? "🌟 체험" : "수업")}</div>
                  <div className="text-[11px] font-semibold">{label}</div>
                  {chargesSession && <span className="text-[9px] px-1.5 py-0.5 bg-red-500 text-white rounded font-bold">-1회</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, val, sub, color }: any) {
  return (
    <div className={`p-3 rounded-xl bg-gradient-to-br ${color} text-white shadow-sm`}>
      <div className="text-xs opacity-90">{icon} {label}</div>
      <div className="text-lg md:text-xl font-black mt-1">{val}</div>
      {sub && <div className="text-[10px] opacity-80 mt-0.5">{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 📝 상담차트 패널 (아동/성인 자동 판별)
// ═══════════════════════════════════════════════════════════════
function ConsultationChartPanel({ memberId, member }: { memberId: string; member: any }) {
  const [chart, setChart] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<any>({});

  useEffect(() => { loadChart(); }, [memberId]);

  async function loadChart() {
    setLoading(true);
    const { data } = await supabase.from("consultation_charts")
      .select("*")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setChart(data);
      setF(data);
    } else {
      // 아직 차트가 없으면 새로 생성 준비 (아직 저장 X)
      setChart(null);
      setF({
        member_id: memberId,
        chart_type: member?.member_type === "child" ? "child" : "adult",
        member_name: member?.name || "",
        phone: member?.phone || "",
        source: member?.source || "",
        consult_date: new Date().toISOString().slice(0, 10),
        consult_method: "온라인",
        wish_days: member?.wish_days || [],
        wish_time_slots: member?.wish_time_slots || [],
        attention_level: "일반",
        status: "draft",
      });
    }
    setLoading(false);
  }

  async function saveChart() {
    setSaving(true);
    try {
      const payload = { ...f, updated_at: new Date().toISOString() };
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      if (orgId) payload.org_id = orgId;

      if (chart?.id) {
        const { error } = await supabase.from("consultation_charts").update(payload).eq("id", chart.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("consultation_charts").insert(payload).select().single();
        if (error) throw error;
        setChart(data);
      }
      await loadChart();
      alert("✅ 상담차트가 저장되었습니다");
    } catch (err: any) {
      alert("저장 실패: " + err.message + "\n\n💡 AQUNOTE_V39_RESET_AND_CHART.sql을 Supabase에 실행해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  // 프린트 기능 - 상담차트를 별도 윈도우에서 프린트 미리보기 오픈
  function printChart() {
    const isChildLocal = f.chart_type === "child";
    const attnColor = f.attention_level === "고주의" ? "#dc2626" : f.attention_level === "주의" ? "#ea580c" : "#16a34a";
    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>상담차트 - ${f.member_name || ""}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; margin: 0; padding: 20px; color: #1e293b; }
  h1 { font-size: 20px; text-align: center; border-bottom: 3px double #333; padding-bottom: 10px; margin-bottom: 20px; }
  h2 { font-size: 14px; background: #f1f5f9; padding: 6px 10px; margin: 15px 0 8px; border-left: 4px solid #6366f1; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 12px; }
  th, td { border: 1px solid #94a3b8; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #f8fafc; font-weight: 600; width: 15%; white-space: nowrap; }
  .full { width: 100%; }
  .attn { display: inline-block; padding: 2px 10px; border-radius: 4px; color: white; font-weight: bold; background: ${attnColor}; }
  .memo-box { border: 1px solid #94a3b8; min-height: 60px; padding: 8px; margin-bottom: 8px; white-space: pre-wrap; font-size: 12px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .footer { margin-top: 30px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  @media print {
    body { padding: 15mm; }
    .no-print { display: none !important; }
    @page { size: A4; margin: 15mm; }
  }
  .toolbar { text-align: center; margin-bottom: 15px; }
  .toolbar button { padding: 8px 20px; margin: 0 4px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
  .btn-print { background: #6366f1; color: white; }
  .btn-close { background: #e2e8f0; color: #334155; }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <button class="btn-print" onclick="window.print()">🖨️ 인쇄</button>
    <button class="btn-close" onclick="window.close()">❌ 닫기</button>
  </div>

  <h1>상담차트 (${isChildLocal ? "아동" : "성인"})</h1>

  <table>
    <tr><th>성명</th><td>${f.member_name || "-"}</td><th>성별</th><td>${f.gender || "-"}</td></tr>
    ${isChildLocal ? `<tr><th>보호자명</th><td>${f.guardian_name || "-"}</td><th>관계</th><td>${f.guardian_relation || "-"}</td></tr>` : ""}
    <tr><th>생년월일</th><td>${f.birth_date || "-"}</td><th>연락처</th><td>${f.phone || "-"}</td></tr>
    <tr><th>주소</th><td colspan="3">${f.address || "-"}</td></tr>
    <tr><th>유입경로</th><td>${f.source || "-"}</td><th>상담일</th><td>${f.consult_date || "-"}</td></tr>
    <tr><th>상담방법</th><td>${f.consult_method || "-"}</td><th>상담자</th><td>${f.counselor || "-"}</td></tr>
    <tr><th>${isChildLocal ? "이용기관/학교" : "이용기관"}</th><td colspan="3">${f.institution || "-"}</td></tr>
    <tr><th>현재 진행중 치료</th><td colspan="3">${f.current_therapy || "-"}</td></tr>
    <tr><th>희망요일</th><td>${(f.wish_days || []).join(", ") || "-"}</td><th>희망시간</th><td>${(f.wish_time_slots || []).join(", ") || "-"}</td></tr>
  </table>

  <h2>■ 1. 의학적 정보 및 주의사항</h2>
  <table>
    <tr><th>진단명</th><td>${f.diagnosis || "-"}</td></tr>
    <tr><th>주 증상</th><td>${f.main_symptoms || "-"}</td></tr>
    ${isChildLocal ? `
      <tr><th>특이행동/기피</th><td>${f.special_behavior || "-"}</td></tr>
      <tr><th>신체스펙</th><td>${f.physical_spec || "-"}</td></tr>
    ` : `
      <tr><th>수술력</th><td>${f.surgery_history || "-"}</td></tr>
      <tr><th>복용약</th><td>${f.medication || "-"}</td></tr>
      <tr><th>통증 여부</th><td>${f.pain_status || "-"}</td></tr>
    `}
    <tr><th>주의도 등급</th><td><span class="attn">${f.attention_level || "일반"}</span></td></tr>
  </table>

  <h2>■ 2. AQU BODY MAP 평가</h2>
  <div class="memo-box">${(f.body_map_notes || "").replace(/</g, "&lt;") || "(메모 없음)"}</div>

  <h2>■ 4. 감각 및 정서 반응</h2>
  <table>
    <tr><th>물 반응</th><td>${f.water_reaction || "-"}</td><th>정서</th><td>${f.emotion_status || "-"}</td></tr>
  </table>

  <h2>■ 5. 본인 (보호자) 니즈</h2>
  <table>
    <tr><th>피하고 싶은 상황</th><td>${f.avoid_situations || "-"}</td></tr>
    <tr><th>기대하는 변화</th><td>${f.expected_change || "-"}</td></tr>
    <tr><th>수중에서 기대 효과</th><td>${f.water_expected_effect || "-"}</td></tr>
    <tr><th>권장 빈도</th><td>${f.recommended_frequency || "-"}</td></tr>
  </table>

  <h2>■ 6. 상담 결론</h2>
  <div class="memo-box">${(f.conclusion || "").replace(/</g, "&lt;") || "(결론 메모 없음)"}</div>
  <table>
    <tr><th>체험 예정일</th><td>${f.trial_scheduled_date || "-"}</td><th>체험 확정</th><td>${f.trial_confirmed ? "✅ 확정" : "⏳ 미확정"}</td></tr>
    <tr><th>메모</th><td colspan="3">${(f.memo || "-").replace(/</g, "&lt;")}</td></tr>
  </table>

  <div class="footer">
    <span>인쇄일자: ${new Date().toLocaleString("ko-KR")}</span>
    <span>AQUNOTE 상담차트</span>
  </div>

  <script>
    // 자동으로 프린트 대화상자 열기 (사용자 선택적)
    // window.onload = () => window.print();
  </script>
</body>
</html>`;
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) { alert("팝업이 차단되었습니다. 팝업 허용을 확인해 주세요."); return; }
    win.document.write(html);
    win.document.close();
  }

  if (loading) return <div className="text-center py-8 text-gray-400">로딩 중...</div>;

  const isChild = f.chart_type === "child";

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-4 border border-purple-100">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-purple-900">
            📝 상담차트 ({isChild ? "아동" : "성인"})
          </h3>
          <div className="flex gap-2">
            <select value={f.chart_type} onChange={e => setF({ ...f, chart_type: e.target.value })}
              className="px-3 py-1.5 border border-purple-200 rounded-lg text-sm bg-white">
              <option value="adult">👤 성인 차트</option>
              <option value="child">🧒 아동 차트</option>
            </select>
            <button onClick={printChart}
              className="px-4 py-1.5 bg-white border border-purple-300 text-purple-700 rounded-lg text-sm hover:bg-purple-50">
              🖨️ 프린트
            </button>
            <button onClick={saveChart} disabled={saving}
              className="px-4 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
              {saving ? "저장중..." : "💾 저장"}
            </button>
          </div>
        </div>
        {!chart && <div className="text-xs text-purple-700">아직 저장된 차트가 없습니다. 정보를 입력하고 저장하세요.</div>}
      </div>

      {/* 기본 정보 */}
      <Section title="📋 기본 정보">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <ChartField label="성명" value={f.member_name} onChange={v => setF({ ...f, member_name: v })} />
          <ChartField label="성별" value={f.gender} onChange={v => setF({ ...f, gender: v })} />
          <ChartField label="생년월일" type="date" value={f.birth_date} onChange={v => setF({ ...f, birth_date: v })} />
          {isChild && (
            <>
              <ChartField label="보호자명" value={f.guardian_name} onChange={v => setF({ ...f, guardian_name: v })} />
              <ChartField label="관계" value={f.guardian_relation} onChange={v => setF({ ...f, guardian_relation: v })} placeholder="부/모 등" />
            </>
          )}
          {!isChild && (
            <ChartField label="관계" value={f.guardian_relation || "본인"} onChange={v => setF({ ...f, guardian_relation: v })} />
          )}
          <ChartField label="연락처" value={f.phone} onChange={v => setF({ ...f, phone: v })} />
          <ChartField label="주소" value={f.address} onChange={v => setF({ ...f, address: v })} className="col-span-2 md:col-span-3" />
          <ChartField label="유입경로" value={f.source} onChange={v => setF({ ...f, source: v })} placeholder="검색/지인/광고" />
          <ChartField label="상담일" type="date" value={f.consult_date} onChange={v => setF({ ...f, consult_date: v })} />
          <ChartField label="상담방법" value={f.consult_method} onChange={v => setF({ ...f, consult_method: v })} placeholder="온라인/직접상담" />
          <ChartField label="상담자" value={f.counselor} onChange={v => setF({ ...f, counselor: v })} />
          <ChartField label={isChild ? "이용기관/학교" : "이용기관"} value={f.institution} onChange={v => setF({ ...f, institution: v })} />
          <ChartField label="현재 진행 중 치료" value={f.current_therapy} onChange={v => setF({ ...f, current_therapy: v })} className="col-span-2" />
          <ChartField label="희망요일" value={(f.wish_days || []).join(", ")} onChange={v => setF({ ...f, wish_days: v.split(",").map((s: string) => s.trim()).filter(Boolean) })} placeholder="월,수,금" />
          <ChartField label="희망시간" value={(f.wish_time_slots || []).join(", ")} onChange={v => setF({ ...f, wish_time_slots: v.split(",").map((s: string) => s.trim()).filter(Boolean) })} placeholder="13:30~14:40" />
        </div>
      </Section>

      {/* 1. 의학적 정보 */}
      <Section title="🩺 1. 의학적 정보 및 주의사항">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ChartTextarea label="진단명" value={f.diagnosis} onChange={v => setF({ ...f, diagnosis: v })} />
          <ChartTextarea label="주 증상" value={f.main_symptoms} onChange={v => setF({ ...f, main_symptoms: v })} />
          {isChild ? (
            <>
              <ChartTextarea label="특이행동/기피" value={f.special_behavior} onChange={v => setF({ ...f, special_behavior: v })} />
              <ChartField label="신체스펙" value={f.physical_spec} onChange={v => setF({ ...f, physical_spec: v })} placeholder="예: 95cm / 12kg" />
            </>
          ) : (
            <>
              <ChartTextarea label="수술력" value={f.surgery_history} onChange={v => setF({ ...f, surgery_history: v })} />
              <ChartField label="복용약" value={f.medication} onChange={v => setF({ ...f, medication: v })} />
              <ChartField label="통증 여부" value={f.pain_status} onChange={v => setF({ ...f, pain_status: v })} className="col-span-2" />
            </>
          )}
          <div className="col-span-2">
            <label className="text-xs font-semibold text-gray-600 block mb-1">주의도 등급</label>
            <div className="flex gap-2">
              {["일반", "주의", "고주의"].map(lv => (
                <button key={lv} onClick={() => setF({ ...f, attention_level: lv })}
                  className={`px-4 py-2 rounded-lg text-sm border ${f.attention_level === lv ? (lv === "고주의" ? "bg-red-500 text-white border-red-500" : lv === "주의" ? "bg-orange-400 text-white border-orange-400" : "bg-green-500 text-white border-green-500") : "bg-white border-gray-200 text-gray-500"}`}>
                  {lv === "고주의" && "🔴 "}
                  {lv === "주의" && "🟠 "}
                  {lv === "일반" && "🟢 "}
                  {lv}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* 2. AQU BODY MAP 메모 */}
      <Section title="🗺️ 2. AQU BODY MAP 평가">
        <ChartTextarea label="주요 문제 / 특이사항" value={f.body_map_notes} onChange={v => setF({ ...f, body_map_notes: v })} rows={5} />
      </Section>

      {/* 4. 감각 및 정서 반응 */}
      <Section title="💧 4. 감각 및 정서 반응">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">물 반응</label>
            <select value={f.water_reaction || ""} onChange={e => setF({ ...f, water_reaction: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">선택</option>
              <option value="매우 긍정">매우 긍정</option>
              <option value="보통">보통</option>
              <option value="긴장">긴장</option>
              <option value="거부">거부</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">정서</label>
            <select value={f.emotion_status || ""} onChange={e => setF({ ...f, emotion_status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">선택</option>
              <option value="안정">안정</option>
              <option value="약간 긴장">약간 긴장</option>
              <option value="회피">회피</option>
            </select>
          </div>
        </div>
      </Section>

      {/* 5. 니즈 */}
      <Section title="🎯 5. 본인·보호자 니즈">
        <div className="space-y-2">
          <ChartTextarea label="피하고 싶은 상황" value={f.avoid_situations} onChange={v => setF({ ...f, avoid_situations: v })} />
          <ChartTextarea label="기대하는 변화" value={f.expected_change} onChange={v => setF({ ...f, expected_change: v })} />
          <ChartTextarea label="수중에서 기대 효과" value={f.water_expected_effect} onChange={v => setF({ ...f, water_expected_effect: v })} />
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">권장 빈도</label>
            <div className="flex gap-2">
              {["주1회", "주2회", "주3회"].map(fr => (
                <button key={fr} onClick={() => setF({ ...f, recommended_frequency: fr })}
                  className={`px-4 py-2 rounded-lg text-sm border ${f.recommended_frequency === fr ? "bg-purple-500 text-white border-purple-500" : "bg-white border-gray-200 text-gray-500"}`}>
                  {fr}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* 6. 상담 결론 */}
      <Section title="✅ 6. 상담 결론">
        <div className="space-y-3">
          <ChartTextarea label="종합 결론" value={f.conclusion} onChange={v => setF({ ...f, conclusion: v })} rows={4} />
          <div className="grid grid-cols-2 gap-3">
            <ChartField label="체험 예정일" type="date" value={f.trial_scheduled_date} onChange={v => setF({ ...f, trial_scheduled_date: v })} />
            <div className="flex items-end">
              <label className="flex items-center gap-2 py-2 cursor-pointer">
                <input type="checkbox" checked={!!f.trial_confirmed}
                  onChange={e => setF({ ...f, trial_confirmed: e.target.checked })}
                  className="w-4 h-4 accent-emerald-600" />
                <span className="text-sm">체험 확정</span>
              </label>
            </div>
          </div>
          <ChartTextarea label="메모" value={f.memo} onChange={v => setF({ ...f, memo: v })} />
        </div>
      </Section>

      {/* 저장 하단 */}
      <div className="flex justify-end sticky bottom-4 gap-2">
        <button onClick={printChart}
          className="px-5 py-3 bg-white border-2 border-purple-500 text-purple-700 rounded-xl font-bold shadow-lg hover:bg-purple-50">
          🖨️ 프린트
        </button>
        <button onClick={saveChart} disabled={saving}
          className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-bold shadow-lg disabled:opacity-50">
          {saving ? "저장중..." : "💾 상담차트 저장"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: any) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <h4 className="text-sm font-bold text-slate-800 mb-3">{title}</h4>
      {children}
    </div>
  );
}

function ChartField({ label, value, onChange, type = "text", placeholder, className }: any) {
  return (
    <div className={className}>
      <label className="text-xs font-semibold text-gray-600 block mb-1">{label}</label>
      <input type={type} value={value || ""} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none" />
    </div>
  );
}

function ChartTextarea({ label, value, onChange, rows = 2 }: any) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600 block mb-1">{label}</label>
      <textarea value={value || ""} onChange={e => onChange(e.target.value)}
        rows={rows}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none resize-none" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 📋 네이버폼/구글폼 상담 접수 데이터 표시 패널
// ═══════════════════════════════════════════════════════════════
function ConsultFormPanel({ member }: { member: any }) {
  const form = member?.extra?.consult_form;

  if (!form) {
    return (
      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-8 text-center">
        <div className="text-5xl mb-3">📋</div>
        <div className="text-lg font-bold text-slate-700 mb-2">상담폼 데이터가 없습니다</div>
        <div className="text-sm text-gray-500 mb-4">
          이 회원은 네이버폼/구글폼으로 접수된 이력이 없거나<br />
          전화상담 등 다른 경로로 등록되었습니다.
        </div>
        <div className="text-xs text-gray-400">
          💡 새로운 상담폼 데이터를 추가하려면 관리자에게 문의하세요
        </div>
      </div>
    );
  }

  const isChild = form.member_type === "child";
  const isAdult = form.member_type === "adult";
  const isMixed = form.source === "naver_form_v1";

  // Row 렌더 함수 (컴포넌트 아님 - 안전한 순수 함수)
  const renderRow = (label: string, value: any, icon?: string) => {
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return null;
    const display = Array.isArray(value) ? value.join(" · ") : String(value);
    return (
      <div key={label} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-2.5 border-b border-gray-100 last:border-b-0">
        <div className="sm:w-40 shrink-0 text-xs font-semibold text-slate-600 flex items-center gap-1">
          {icon ? <span>{icon}</span> : null}
          <span>{label}</span>
        </div>
        <div className="flex-1 text-sm text-slate-900 whitespace-pre-wrap">{display}</div>
      </div>
    );
  };

  const colorMap: Record<string, string> = {
    blue: "from-blue-50 to-indigo-50 border-blue-100",
    purple: "from-purple-50 to-fuchsia-50 border-purple-100",
    emerald: "from-emerald-50 to-teal-50 border-emerald-100",
    amber: "from-amber-50 to-orange-50 border-amber-100",
    rose: "from-rose-50 to-pink-50 border-rose-100",
  };

  const renderSection = (title: string, rows: any[], color: string = "blue") => {
    const validRows = rows.filter(r => r !== null && r !== undefined);
    if (validRows.length === 0) return null;
    return (
      <div key={title} className={`bg-gradient-to-br ${colorMap[color] || colorMap.blue} border rounded-2xl p-4 mb-4`}>
        <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-1.5">{title}</h3>
        <div className="bg-white/70 rounded-xl px-3 py-1">
          {validRows}
        </div>
      </div>
    );
  };

  const sourceLabel =
    form.source === "naver_form_v1" ? "네이버폼(이전)" :
    form.source === "naver_form_child" ? "네이버폼(아동)" :
    form.source === "naver_form_adult" ? "네이버폼(성인)" : "상담폼";

  const genderLabel = form.gender === "male" ? "남" : form.gender === "female" ? "여" : form.gender;

  return (
    <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-5 md:p-7">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-gray-100">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            📋 상담폼 접수 정보
            <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
              {sourceLabel}
            </span>
          </h2>
          {form.submitted_at ? (
            <div className="text-xs text-gray-500 mt-1">
              📅 접수일: {String(form.submitted_at)}
            </div>
          ) : null}
        </div>
        <button onClick={() => window.print()}
          className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold">
          🖨 인쇄
        </button>
      </div>

      {/* 공통 기본 정보 */}
      {renderSection("👤 기본 정보", [
        renderRow("이름", form.name, "🏷"),
        renderRow("성별", genderLabel, "⚧"),
        renderRow("생년월일", form.birth, "🎂"),
        renderRow("연락처", form.phone, "📞"),
        renderRow("주소", form.address, "📍"),
      ], "blue")}

      {/* 아동 전용 */}
      {isChild ? renderSection("🧒 아동 상세", [
        renderRow("키/체중", form.height_weight, "📏"),
        renderRow("내원 사유", form.visit_reason, "🩺"),
        renderRow("현재 기관", form.current_institution, "🏫"),
        renderRow("형제 자매", form.siblings, "👨‍👩‍👧‍👦"),
        renderRow("보호자 정보", form.guardian_info, "👨‍👩‍👧"),
      ], "purple") : null}

      {isChild ? renderSection("🎨 성향 및 특이사항", [
        renderRow("좋아하는 것", form.likes, "❤️"),
        renderRow("싫어하는 것", form.dislikes, "💔"),
        renderRow("물 반응", form.water_experience, "💧"),
        renderRow("알레르기", form.allergy, "🌿"),
        renderRow("특이사항", form.special_notes, "📝"),
        renderRow("요청사항", form.requests, "🙋"),
        renderRow("기대 목표", form.expected_goal, "🎯"),
      ], "emerald") : null}

      {/* 성인 전용 */}
      {isAdult ? renderSection("🩺 통증 정보", [
        renderRow("통증 부위", form.pain_area, "🎯"),
        renderRow("통증 척도", form.pain_scale ? `${form.pain_scale}/10` : null, "📊"),
        renderRow("시작 시기", form.pain_start, "⏱"),
        renderRow("악화 요인", form.worsening_factor, "⚠️"),
      ], "rose") : null}

      {isAdult ? renderSection("💊 병력 및 치료", [
        renderRow("진단명", form.diagnosis, "📋"),
        renderRow("기저질환", form.medical_history, "🏥"),
        renderRow("수술력", form.surgery_history, "⚕️"),
        renderRow("복용 약물", form.medication, "💊"),
        renderRow("알레르기", form.allergy, "🌿"),
        renderRow("주의사항", form.caution, "⚠️"),
        renderRow("요청사항", form.requests, "🙋"),
      ], "amber") : null}

      {/* form1 (이전 통합 폼) */}
      {isMixed ? renderSection("🩺 진단 · 치료 정보", [
        renderRow("진단명", form.diagnosis, "📋"),
        renderRow("현재 불편한 점", form.main_symptom, "🩺"),
        renderRow("원하는 치료", form.wish_treatment, "💊"),
        renderRow("치료 목표", form.expected_change, "🎯"),
        renderRow("기타 주의사항", form.special_notes, "📝"),
      ], "amber") : null}

      {/* 희망 수업 시간 */}
      {Array.isArray(form.wish_time_slots) && form.wish_time_slots.length > 0 ? (
        <div className={`bg-gradient-to-br ${colorMap.blue} border rounded-2xl p-4 mb-4`}>
          <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-1.5">📅 희망 수업 시간대</h3>
          <div className="bg-white/70 rounded-xl px-3 py-2">
            <div className="flex flex-wrap gap-2">
              {form.wish_time_slots.map((slot: string, i: number) => (
                <span key={i} className="text-xs px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full font-semibold">
                  {String(slot)}
                </span>
              ))}
            </div>
            {form.saturday_option ? (
              <div className="mt-2 pt-2 border-t border-blue-100 text-xs text-slate-600">
                <span className="font-semibold">📆 토요일 선택: </span>
                <span>{String(form.saturday_option)}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 원본 JSON (개발자용, 접힘) */}
      <details className="mt-6">
        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
          🔧 원본 데이터 (JSON) 보기
        </summary>
        <pre className="mt-2 p-3 bg-slate-50 rounded-lg text-[10px] text-slate-600 overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(form, null, 2)}
        </pre>
      </details>
    </div>
  );
}
