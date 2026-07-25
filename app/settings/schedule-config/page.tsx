"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import HomeButton from "@/components/HomeButton";
import { Clock, Save, ChevronLeft, Calendar as CalendarIcon, Plus, X } from "lucide-react";

/**
 * v3.19.1: 시간표 설정 페이지
 * - 지점별 운영시간, 타임 단위(분), 시작·종료 시간, 요일 운영 여부 설정
 * - branches.schedule_config JSONB에 저장
 */

const DAYS = [
  { key: "mon", label: "월" },
  { key: "tue", label: "화" },
  { key: "wed", label: "수" },
  { key: "thu", label: "목" },
  { key: "fri", label: "금" },
  { key: "sat", label: "토" },
  { key: "sun", label: "일" },
];

const SLOT_DURATIONS = [
  { v: 30, label: "30분" },
  { v: 40, label: "40분" },
  { v: 45, label: "45분" },
  { v: 50, label: "50분" },
  { v: 60, label: "60분 (1시간)" },
  { v: 90, label: "90분" },
];

const DEFAULT_CONFIG = {
  open_time: "09:00",
  close_time: "22:00",
  slot_duration: 40,
  break_between: 0,
  open_days: ["mon", "tue", "wed", "thu", "fri", "sat"],
  lunch_break: { enabled: false, start: "12:00", end: "13:00" },
  custom_slots: [] as string[], // 직접 지정한 타임 (있으면 자동 생성 대신 이걸 사용)
};

export default function ScheduleConfigPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [config, setConfig] = useState<any>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customSlotInput, setCustomSlotInput] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("branches").select("*").is("deleted_at", null).order("is_main", { ascending: false });
      setBranches(data || []);
      const active = typeof window !== "undefined" ? window.localStorage.getItem("aqu_active_branch_id") : null;
      const target = (data || []).find((b: any) => b.id === active) || (data || [])[0];
      if (target) {
        setBranchId(target.id);
        setConfig({ ...DEFAULT_CONFIG, ...(target.schedule_config || {}) });
      }
      setLoading(false);
    })();
  }, []);

  async function selectBranch(id: string) {
    const b = branches.find(x => x.id === id);
    if (!b) return;
    setBranchId(id);
    setConfig({ ...DEFAULT_CONFIG, ...(b.schedule_config || {}) });
  }

  async function save() {
    if (!branchId) return alert("지점을 선택해주세요");
    setSaving(true);
    const { error } = await supabase.from("branches").update({ schedule_config: config }).eq("id", branchId);
    if (error) {
      // schedule_config 컬럼이 없으면 안내
      if (error.message.includes("schedule_config")) {
        alert("⚠️ branches 테이블에 schedule_config 컬럼이 없습니다.\nSQL 마이그레이션(AQUNOTE_V319_CONTACT_STAFF.sql)의 최신 버전을 실행해주세요.\n\n임시로 localStorage에 저장합니다.");
        window.localStorage.setItem(`aqu_schedule_config_${branchId}`, JSON.stringify(config));
      } else {
        alert("저장 실패: " + error.message);
      }
    } else {
      alert("✅ 시간표 설정이 저장되었습니다");
    }
    setSaving(false);
  }

  function toggleDay(d: string) {
    const days = config.open_days || [];
    setConfig({ ...config, open_days: days.includes(d) ? days.filter((x: string) => x !== d) : [...days, d] });
  }

  function addCustomSlot() {
    if (!customSlotInput) return;
    const slots = config.custom_slots || [];
    if (slots.includes(customSlotInput)) return;
    setConfig({ ...config, custom_slots: [...slots, customSlotInput].sort() });
    setCustomSlotInput("");
  }

  function removeCustomSlot(slot: string) {
    setConfig({ ...config, custom_slots: (config.custom_slots || []).filter((s: string) => s !== slot) });
  }

  // 자동 생성된 타임 미리보기
  const previewSlots = (() => {
    if (config.custom_slots && config.custom_slots.length > 0) return config.custom_slots;
    const slots: string[] = [];
    const [oh, om] = (config.open_time || "09:00").split(":").map(Number);
    const [ch, cm] = (config.close_time || "22:00").split(":").map(Number);
    let cur = oh * 60 + om;
    const end = ch * 60 + cm;
    const dur = Number(config.slot_duration || 40);
    const gap = Number(config.break_between || 0);
    const lunchStart = config.lunch_break?.enabled ? (() => { const [h, m] = config.lunch_break.start.split(":").map(Number); return h * 60 + m; })() : null;
    const lunchEnd = config.lunch_break?.enabled ? (() => { const [h, m] = config.lunch_break.end.split(":").map(Number); return h * 60 + m; })() : null;
    while (cur + dur <= end && slots.length < 40) {
      if (lunchStart !== null && lunchEnd !== null && cur < lunchEnd && cur + dur > lunchStart) {
        cur = lunchEnd;
        continue;
      }
      const h = String(Math.floor(cur / 60)).padStart(2, "0");
      const m = String(cur % 60).padStart(2, "0");
      slots.push(`${h}:${m}`);
      cur += dur + gap;
    }
    return slots;
  })();

  const activeBranch = branches.find(b => b.id === branchId);

  if (loading) return <div className="p-10 text-center text-gray-400">로딩 중...</div>;

  return (
    <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-10">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <HomeButton />
          <span className="text-gray-300">/</span>
          <Link href="/settings" className="text-sm text-gray-500 hover:text-aqu-700 flex items-center gap-1">
            <ChevronLeft className="w-4 h-4" /> 설정
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl md:text-2xl font-bold text-aqu-900 flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-blue-500" /> 시간표 설정
          </h1>
        </div>
        <button onClick={save} disabled={saving}
          className="px-4 py-2 bg-gradient-to-br from-blue-500 to-cyan-500 text-white rounded-xl shadow hover:opacity-90 flex items-center gap-1.5 text-sm font-semibold disabled:opacity-40">
          <Save className="w-4 h-4" /> {saving ? "저장 중..." : "저장"}
        </button>
      </div>

      {/* 지점 선택 */}
      <div className="bg-white border border-aqu-100 rounded-2xl p-4 mb-4">
        <div className="text-xs font-bold text-aqu-800 mb-2">🏪 대상 지점</div>
        <div className="flex flex-wrap gap-2">
          {branches.map(b => (
            <button key={b.id} onClick={() => selectBranch(b.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 transition ${branchId === b.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
              {b.name}{b.is_main && " (본점)"}
            </button>
          ))}
        </div>
      </div>

      {/* 운영 시간 */}
      <div className="bg-white border border-aqu-100 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-5 h-5 text-blue-500" />
          <div className="text-base font-bold text-slate-900">⏰ 운영 시간</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-600 font-semibold block mb-1">오픈 시간</label>
            <input type="time" value={config.open_time} onChange={e => setConfig({ ...config, open_time: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
          </div>
          <div>
            <label className="text-xs text-gray-600 font-semibold block mb-1">마감 시간</label>
            <input type="time" value={config.close_time} onChange={e => setConfig({ ...config, close_time: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
          </div>
        </div>
      </div>

      {/* 수업 타임 단위 */}
      <div className="bg-white border border-aqu-100 rounded-2xl p-5 mb-4">
        <div className="text-base font-bold text-slate-900 mb-3">⏱️ 수업 타임 단위</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {SLOT_DURATIONS.map(sd => (
            <button key={sd.v} onClick={() => setConfig({ ...config, slot_duration: sd.v })}
              className={`px-3 py-2.5 rounded-lg text-sm font-semibold border-2 transition ${config.slot_duration === sd.v ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
              {sd.label}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <label className="text-xs text-gray-600 font-semibold block mb-1">타임 사이 쉬는 시간 (분)</label>
          <input type="number" min="0" step="5" value={config.break_between}
            onChange={e => setConfig({ ...config, break_between: Number(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" placeholder="0" />
          <div className="text-[10px] text-gray-500 mt-1">💡 예: 40분 수업 + 10분 정리 = 50분 간격으로 다음 타임 시작</div>
        </div>
      </div>

      {/* 운영 요일 */}
      <div className="bg-white border border-aqu-100 rounded-2xl p-5 mb-4">
        <div className="text-base font-bold text-slate-900 mb-3">📅 운영 요일</div>
        <div className="flex flex-wrap gap-2">
          {DAYS.map(d => {
            const active = (config.open_days || []).includes(d.key);
            return (
              <button key={d.key} onClick={() => toggleDay(d.key)}
                className={`w-14 h-14 rounded-xl text-lg font-bold border-2 transition ${active ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-400 border-gray-200 hover:border-blue-300"} ${d.key === "sun" ? (active ? "" : "text-red-300") : d.key === "sat" ? (active ? "" : "text-blue-300") : ""}`}>
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 점심시간 */}
      <div className="bg-white border border-aqu-100 rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-base font-bold text-slate-900">🍽️ 점심시간 제외</div>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={config.lunch_break?.enabled || false}
              onChange={e => setConfig({ ...config, lunch_break: { ...(config.lunch_break || {}), enabled: e.target.checked, start: config.lunch_break?.start || "12:00", end: config.lunch_break?.end || "13:00" } })}
              className="w-4 h-4" />
            <span className="text-sm">활성화</span>
          </label>
        </div>
        {config.lunch_break?.enabled && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 font-semibold block mb-1">시작</label>
              <input type="time" value={config.lunch_break.start}
                onChange={e => setConfig({ ...config, lunch_break: { ...config.lunch_break, start: e.target.value } })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
            </div>
            <div>
              <label className="text-xs text-gray-600 font-semibold block mb-1">종료</label>
              <input type="time" value={config.lunch_break.end}
                onChange={e => setConfig({ ...config, lunch_break: { ...config.lunch_break, end: e.target.value } })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
            </div>
          </div>
        )}
      </div>

      {/* 직접 지정 타임 (선택) */}
      <div className="bg-white border border-aqu-100 rounded-2xl p-5 mb-4">
        <div className="text-base font-bold text-slate-900 mb-1">✏️ 직접 지정 타임 (선택)</div>
        <div className="text-[11px] text-gray-500 mb-3">지정하면 자동 계산 대신 이 시간표만 사용됩니다. 비워두면 위 설정으로 자동 생성.</div>
        <div className="flex items-center gap-2 mb-2">
          <input type="time" value={customSlotInput} onChange={e => setCustomSlotInput(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
          <button onClick={addCustomSlot} className="px-3 py-2 bg-blue-500 text-white rounded-lg text-sm font-semibold flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> 추가
          </button>
        </div>
        {(config.custom_slots || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {(config.custom_slots || []).map((s: string) => (
              <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                {s}
                <button onClick={() => removeCustomSlot(s)} className="hover:bg-blue-200 rounded-full p-0.5">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 미리보기 */}
      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-2xl p-5 mb-4">
        <div className="text-base font-bold text-blue-900 mb-2">👀 미리보기 · 생성될 타임 ({previewSlots.length}개)</div>
        <div className="text-[11px] text-blue-700 mb-3">
          {config.custom_slots?.length > 0 ? "✏️ 직접 지정한 타임" : `⏱️ ${config.slot_duration}분 단위 자동 생성`}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {previewSlots.length === 0 ? (
            <div className="text-sm text-gray-400 italic">생성될 타임이 없습니다. 설정을 확인해주세요.</div>
          ) : previewSlots.map((s, i) => (
            <span key={s} className="inline-block px-2.5 py-1 bg-white border border-blue-300 rounded-lg text-xs font-semibold text-blue-800 shadow-sm">
              {i + 1}타임 · {s}
            </span>
          ))}
        </div>
      </div>

      <div className="text-[10px] text-gray-500 text-center pb-6">
        💡 저장 후 <Link href="/schedule" className="underline text-blue-600">시간표</Link>에서 반영된 결과 확인 가능
      </div>
    </main>
  );
}
