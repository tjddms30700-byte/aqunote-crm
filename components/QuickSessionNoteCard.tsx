"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Save, Sparkles, Loader2 } from "lucide-react";

/* ============================================================
   v3.17.0 - 재활/수업 일지 (세션 노트) 원클릭 카드
   - 치료사/강사가 수업 직후 태블릿으로 간단히 작성
   - 추후 IEP·학부모 알림장과 연동
============================================================ */

interface Props {
  memberId: string;
  memberName: string;
  onSaved: () => void;
}

const QUICK_MOOD = [
  { v: "great", label: "🌟 매우 좋음", color: "bg-emerald-100 text-emerald-800 border-emerald-400" },
  { v: "good",  label: "😊 좋음",     color: "bg-green-100 text-green-800 border-green-400" },
  { v: "okay",  label: "😐 보통",     color: "bg-yellow-100 text-yellow-800 border-yellow-400" },
  { v: "tired", label: "😴 피곤",     color: "bg-orange-100 text-orange-800 border-orange-400" },
  { v: "poor",  label: "😢 컨디션 저조", color: "bg-red-100 text-red-800 border-red-400" },
];

const QUICK_ACHIEVEMENT = [
  { v: "goal_met",   label: "✅ 목표 달성" },
  { v: "progress",   label: "📈 진전 있음" },
  { v: "maintain",   label: "➡️ 유지" },
  { v: "regression", label: "📉 후퇴" },
];

const QUICK_TEMPLATES = [
  { key: "focus",    label: "🎯 집중 잘함",         text: "오늘 수업 내내 집중력이 좋았고 지시 수행이 원활했습니다." },
  { key: "unstable", label: "🌊 물 적응 향상",     text: "물 적응도가 이전보다 향상되어 얼굴 담그기와 잠수 시도가 자연스러워졌습니다." },
  { key: "coop",     label: "🤝 상호작용 원활",    text: "치료사와의 상호작용이 원활했으며 놀이 활동에 적극 참여했습니다." },
  { key: "reject",   label: "🚫 거부 반응 있음",   text: "일부 활동에서 거부 반응을 보였으나 대체 활동으로 유도해 진행했습니다." },
  { key: "muscle",   label: "💪 근력·유연성 개선", text: "근력 훈련 시 지지 강도가 감소했고 관절 가동범위가 이전보다 개선됨." },
];

function todayStr() { return new Date().toISOString().slice(0, 10); }
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function QuickSessionNoteCard({ memberId, memberName, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<any>({
    session_date: todayStr(),
    session_time: nowTime(),
    duration_min: 30,
    mood: "good",
    achievement: "progress",
    focus_area: "",
    activities_done: "",
    memo: "",
    parent_message: "",
    next_plan: "",
  });

  function insertTemplate(text: string) {
    setF((prev: any) => ({
      ...prev,
      memo: prev.memo ? prev.memo + "\n" + text : text,
    }));
  }

  function generateParentMessage() {
    const mood = QUICK_MOOD.find((m) => m.v === f.mood);
    const ach = QUICK_ACHIEVEMENT.find((a) => a.v === f.achievement);
    const parts: string[] = [
      `안녕하세요, ${memberName} 회원님 학부모님 😊`,
      "",
      `${f.session_date} ${f.session_time} 수업을 마쳤습니다.`,
      `오늘 컨디션: ${mood?.label || "-"}`,
      `성취: ${ach?.label || "-"}`,
    ];
    if (f.focus_area) parts.push(`\n중점 훈련: ${f.focus_area}`);
    if (f.activities_done) parts.push(`\n진행 활동: ${f.activities_done}`);
    if (f.memo) parts.push(`\n💬 오늘의 세션 소감:\n${f.memo}`);
    if (f.next_plan) parts.push(`\n📅 다음 수업 계획:\n${f.next_plan}`);
    parts.push("\n항상 관심 가져주셔서 감사합니다 🙏");
    setF((prev: any) => ({ ...prev, parent_message: parts.join("\n") }));
  }

  async function save() {
    if (!f.memo && !f.activities_done) {
      alert("세션 메모 또는 진행 활동을 하나 이상 입력해주세요");
      return;
    }
    setSaving(true);
    try {
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      const payload: any = {
        org_id: orgId,
        member_id: memberId,
        session_date: f.session_date,
        session_time: f.session_time,
        duration_min: Number(f.duration_min) || 30,
        activities: f.activities_done ? f.activities_done.split(/[,;·]/).map((s: string) => s.trim()).filter(Boolean) : [],
        tags: [f.mood, f.achievement, f.focus_area].filter(Boolean),
        memo: [
          f.focus_area && `🎯 중점: ${f.focus_area}`,
          f.memo,
          f.next_plan && `\n📅 다음 계획: ${f.next_plan}`,
          f.parent_message && `\n💌 학부모 알림장:\n${f.parent_message}`,
        ].filter(Boolean).join("\n"),
        source: "quick_note",
      };

      const { error } = await supabase.from("sessions").insert(payload);
      if (error) {
        if (error.code === "42P01" || error.code === "PGRST205" || error.message?.includes("does not exist")) {
          alert("⚠️ sessions 테이블이 없습니다.\nAQUNOTE_V315_SESSIONS_FIXED.sql을 Supabase에 먼저 실행해주세요.");
        } else {
          alert("저장 실패: " + error.message);
        }
        return;
      }

      // 성공 시 초기화
      setF({
        session_date: todayStr(),
        session_time: nowTime(),
        duration_min: 30,
        mood: "good",
        achievement: "progress",
        focus_area: "",
        activities_done: "",
        memo: "",
        parent_message: "",
        next_plan: "",
      });
      setOpen(false);
      alert("✅ 세션 노트 저장 완료");
      onSaved();
    } catch (e: any) {
      alert("저장 오류: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full mb-4 p-4 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 border-2 border-emerald-200 rounded-2xl hover:shadow-lg transition text-left group">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition">
            <span className="text-2xl">📝</span>
          </div>
          <div className="flex-1">
            <div className="font-bold text-emerald-900 text-base flex items-center gap-2">
              재활/수업 일지 원클릭 작성
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-200 text-emerald-800 rounded-full">태블릿 최적화</span>
            </div>
            <div className="text-xs text-emerald-700 mt-0.5">
              치료사/강사가 수업 직후 3초 만에 작성 · IEP·학부모 알림장 자동 연동
            </div>
          </div>
          <div className="text-emerald-600 text-2xl group-hover:translate-x-1 transition">→</div>
        </div>
      </button>
    );
  }

  return (
    <div className="mb-4 bg-gradient-to-br from-emerald-50 to-cyan-50 border-2 border-emerald-300 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-emerald-900 flex items-center gap-2">
          📝 재활/수업 일지 (세션 노트)
        </div>
        <button onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-gray-800">접기</button>
      </div>

      {/* 기본 정보 */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div>
          <div className="text-[10px] font-semibold text-emerald-800 mb-1">📅 세션 날짜</div>
          <input type="date" value={f.session_date}
            onChange={(e) => setF({ ...f, session_date: e.target.value })}
            className="w-full px-2 py-1.5 border border-emerald-200 rounded text-sm bg-white" />
        </div>
        <div>
          <div className="text-[10px] font-semibold text-emerald-800 mb-1">⏰ 시간</div>
          <input type="time" value={f.session_time}
            onChange={(e) => setF({ ...f, session_time: e.target.value })}
            className="w-full px-2 py-1.5 border border-emerald-200 rounded text-sm bg-white" />
        </div>
        <div>
          <div className="text-[10px] font-semibold text-emerald-800 mb-1">⏱ 시간(분)</div>
          <input type="number" value={f.duration_min}
            onChange={(e) => setF({ ...f, duration_min: e.target.value })}
            className="w-full px-2 py-1.5 border border-emerald-200 rounded text-sm bg-white" />
        </div>
      </div>

      {/* 컨디션 원클릭 */}
      <div className="mb-3">
        <div className="text-[10px] font-semibold text-emerald-800 mb-1">😊 오늘 컨디션 (원클릭)</div>
        <div className="flex flex-wrap gap-1">
          {QUICK_MOOD.map((m) => (
            <button key={m.v} onClick={() => setF({ ...f, mood: m.v })}
              className={`px-2 py-1 rounded-lg text-xs border-2 ${f.mood === m.v ? m.color + " font-bold" : "bg-white border-gray-200 text-gray-500"}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* 성취 원클릭 */}
      <div className="mb-3">
        <div className="text-[10px] font-semibold text-emerald-800 mb-1">📊 오늘의 성취 (원클릭)</div>
        <div className="flex flex-wrap gap-1">
          {QUICK_ACHIEVEMENT.map((a) => (
            <button key={a.v} onClick={() => setF({ ...f, achievement: a.v })}
              className={`px-2 py-1 rounded-lg text-xs border-2 ${f.achievement === a.v ? "bg-emerald-100 text-emerald-800 border-emerald-400 font-bold" : "bg-white border-gray-200 text-gray-500"}`}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* 중점 훈련 */}
      <div className="mb-3">
        <div className="text-[10px] font-semibold text-emerald-800 mb-1">🎯 오늘 중점 훈련</div>
        <input value={f.focus_area}
          onChange={(e) => setF({ ...f, focus_area: e.target.value })}
          placeholder="예: 부력 조절, 균형 잡기, 호흡 훈련"
          className="w-full px-2 py-1.5 border border-emerald-200 rounded text-sm bg-white" />
      </div>

      {/* 진행 활동 */}
      <div className="mb-3">
        <div className="text-[10px] font-semibold text-emerald-800 mb-1">🏊 진행 활동 (콤마·쉼표로 구분)</div>
        <input value={f.activities_done}
          onChange={(e) => setF({ ...f, activities_done: e.target.value })}
          placeholder="예: 수중 걷기, 부력봉 근력 훈련, 킥판 발차기"
          className="w-full px-2 py-1.5 border border-emerald-200 rounded text-sm bg-white" />
      </div>

      {/* 빠른 템플릿 */}
      <div className="mb-3">
        <div className="text-[10px] font-semibold text-emerald-800 mb-1">⚡ 빠른 템플릿 (클릭해 메모에 추가)</div>
        <div className="flex flex-wrap gap-1">
          {QUICK_TEMPLATES.map((t) => (
            <button key={t.key} onClick={() => insertTemplate(t.text)}
              className="px-2 py-1 rounded-lg text-[11px] bg-white border border-emerald-200 hover:bg-emerald-100 text-emerald-800">
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 세션 메모 */}
      <div className="mb-3">
        <div className="text-[10px] font-semibold text-emerald-800 mb-1">💬 세션 메모 (관찰 · 특이사항)</div>
        <textarea value={f.memo} rows={3}
          onChange={(e) => setF({ ...f, memo: e.target.value })}
          placeholder="오늘 회원의 특이사항, 관찰 내용을 자유롭게 기록"
          className="w-full px-2 py-1.5 border border-emerald-200 rounded text-sm bg-white resize-y" />
      </div>

      {/* 다음 계획 */}
      <div className="mb-3">
        <div className="text-[10px] font-semibold text-emerald-800 mb-1">📅 다음 수업 계획</div>
        <input value={f.next_plan}
          onChange={(e) => setF({ ...f, next_plan: e.target.value })}
          placeholder="예: 부력봉 30초 → 1분으로 확장 시도"
          className="w-full px-2 py-1.5 border border-emerald-200 rounded text-sm bg-white" />
      </div>

      {/* 학부모 알림장 자동 생성 */}
      <div className="mb-3 bg-white border-2 border-purple-200 rounded-lg p-2">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[10px] font-semibold text-purple-800">💌 학부모 알림장 (자동 생성)</div>
          <button onClick={generateParentMessage}
            className="px-2 py-1 bg-purple-500 hover:bg-purple-600 text-white rounded text-[10px] flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> 자동 생성
          </button>
        </div>
        <textarea value={f.parent_message} rows={4}
          onChange={(e) => setF({ ...f, parent_message: e.target.value })}
          placeholder="위 '자동 생성' 버튼을 누르면 학부모께 전달할 알림장 문구가 자동 생성됩니다"
          className="w-full px-2 py-1 border border-purple-100 rounded text-xs bg-purple-50" />
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm">취소</button>
        <button onClick={save} disabled={saving}
          className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-lg text-sm font-bold shadow-sm disabled:opacity-50 flex items-center gap-1">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중...</> : <><Save className="w-4 h-4" /> 세션 노트 저장</>}
        </button>
      </div>
    </div>
  );
}
