"use client";
import { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Edit2, Save, X, Calendar, Clock } from "lucide-react";

/**
 * 희망 요일/시간대 표시 + 수정 카드
 * - 상담폼 원본에서 자동 파싱된 요일/시간 표시
 * - 매칭 가능한 시간표 슬롯 자동 계산 (예: "월 14:40~15:50 · 목 14:40~15:50")
 * - 인라인 수정 기능
 */

const DAYS_KO = ["월", "화", "수", "목", "금", "토"];
const TIME_SLOTS = [
  "10:00~11:10", "11:10~12:20", "12:20~13:30", "13:30~14:40",
  "14:40~15:50", "15:50~17:00", "17:00~18:10", "18:10~19:20",
  "19:20~20:30", "20:30~21:40",
];

function parseWishDays(raw: string[] | null | undefined): string[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const out = new Set<string>();
  for (const s of arr) {
    if (!s) continue;
    const parts = String(s).split(/[;,|/\s]+/).map(x => x.trim().replace("요일", ""));
    for (const p of parts) {
      if (DAYS_KO.includes(p)) out.add(p);
    }
  }
  return Array.from(out);
}

// 시간 문자열 → 매칭되는 시간표 슬롯 배열
function calcMatchedSlots(wishTimes: string[], wishDays: string[]): { day: string; slot: string }[] {
  const matched: { day: string; slot: string }[] = [];
  const days = wishDays.length > 0 ? wishDays : DAYS_KO;

  for (const day of days) {
    for (const slot of TIME_SLOTS) {
      const cellStartHour = parseInt(slot.slice(0, 2), 10);
      let hit = false;

      if (wishTimes.length === 0) {
        // 요일만 지정된 경우 → 전체 시간대 매칭
        hit = true;
      } else {
        for (const raw of wishTimes) {
          const parts = String(raw).split(/[|,;]/).map(p => p.trim()).filter(Boolean);
          for (const p of parts) {
            if (p.includes(slot.slice(0, 5))) { hit = true; break; }
            const range = p.match(/(\d{1,2})\s*[~\-]\s*(\d{1,2})/);
            if (range) {
              const s = parseInt(range[1], 10);
              const e = parseInt(range[2], 10);
              if (cellStartHour >= s && cellStartHour < e) { hit = true; break; }
            }
            if (p.includes("오전") && cellStartHour < 12) { hit = true; break; }
            if (p.includes("점심") && cellStartHour >= 12 && cellStartHour < 14) { hit = true; break; }
            if (p.includes("오후") && cellStartHour >= 12 && cellStartHour < 17) { hit = true; break; }
            if (p.includes("저녁") && cellStartHour >= 17) { hit = true; break; }
            if (p.includes("밤") && cellStartHour >= 19) { hit = true; break; }
          }
          if (hit) break;
        }
      }
      if (hit) matched.push({ day, slot });
    }
  }
  return matched;
}

export default function WishScheduleCard({
  memberId,
  wishDays,
  wishTimeSlots,
  onSaved,
}: {
  memberId: string;
  wishDays: string[] | null | undefined;
  wishTimeSlots: string[] | null | undefined;
  onSaved?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState<string[]>(parseWishDays(wishDays));
  const [times, setTimes] = useState<string[]>(
    Array.isArray(wishTimeSlots) ? wishTimeSlots.map(String) : []
  );

  const matchedSlots = useMemo(
    () => calcMatchedSlots(times, parseWishDays(wishDays)),
    [wishDays, wishTimeSlots]
  );

  function toggleDay(d: string) {
    setDays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]));
  }

  function toggleTime(t: string) {
    setTimes(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]));
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("members")
      .update({ wish_days: days, wish_time_slots: times })
      .eq("id", memberId);
    setSaving(false);
    if (error) {
      alert("저장 실패: " + error.message);
      return;
    }
    setEditing(false);
    if (onSaved) onSaved();
  }

  const displayDays = parseWishDays(wishDays);
  const displayTimes = Array.isArray(wishTimeSlots) ? wishTimeSlots.map(String) : [];

  return (
    <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-2xl p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold text-blue-900 flex items-center gap-1.5">
          <Calendar className="w-4 h-4" /> 희망 수업 시간대
          <span className="text-xs text-blue-600 font-normal">(자동 매칭 계산)</span>
        </h3>
        {!editing ? (
          <button onClick={() => setEditing(true)}
            className="text-xs px-2.5 py-1 bg-white text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 flex items-center gap-1">
            <Edit2 className="w-3 h-3" /> 수정
          </button>
        ) : (
          <div className="flex gap-1">
            <button onClick={save} disabled={saving}
              className="text-xs px-2.5 py-1 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1">
              <Save className="w-3 h-3" /> {saving ? "저장중..." : "저장"}
            </button>
            <button onClick={() => {
              setEditing(false);
              setDays(parseWishDays(wishDays));
              setTimes(Array.isArray(wishTimeSlots) ? wishTimeSlots.map(String) : []);
            }} className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 flex items-center gap-1">
              <X className="w-3 h-3" /> 취소
            </button>
          </div>
        )}
      </div>

      {!editing ? (
        <>
          {/* 원본 값 표시 */}
          <div className="bg-white/70 rounded-lg p-2.5 mb-2 text-xs">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-blue-700 font-semibold min-w-[60px]">📆 요일:</span>
              {displayDays.length > 0 ? (
                displayDays.map(d => (
                  <span key={d} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">{d}</span>
                ))
              ) : <span className="text-gray-400">미지정</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-blue-700 font-semibold min-w-[60px]">🕐 시간:</span>
              {displayTimes.length > 0 ? (
                displayTimes.map((t, i) => (
                  <span key={i} className="px-2 py-0.5 bg-cyan-100 text-cyan-700 rounded-full font-medium">{t}</span>
                ))
              ) : <span className="text-gray-400">미지정</span>}
            </div>
          </div>

          {/* 자동 매칭 결과 */}
          {matchedSlots.length > 0 ? (
            <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-lg p-2.5">
              <div className="text-xs text-orange-800 font-semibold mb-1.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> ⭐ 매칭 가능 시간표 슬롯 ({matchedSlots.length}칸)
              </div>
              <div className="flex flex-wrap gap-1">
                {matchedSlots.slice(0, 30).map((m, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 bg-white border border-orange-200 text-orange-800 rounded font-mono">
                    {m.day} {m.slot}
                  </span>
                ))}
                {matchedSlots.length > 30 && (
                  <span className="text-[11px] text-orange-600 self-center">+{matchedSlots.length - 30}칸</span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500 text-center py-2 bg-white/50 rounded-lg">
              희망 요일·시간을 입력하면 매칭 가능한 시간표 슬롯이 자동 계산됩니다
            </div>
          )}
        </>
      ) : (
        // 편집 모드
        <div className="space-y-3">
          <div>
            <div className="text-xs font-semibold text-blue-800 mb-1.5">📆 희망 요일 (다중 선택)</div>
            <div className="flex flex-wrap gap-1.5">
              {DAYS_KO.map(d => (
                <button key={d} onClick={() => toggleDay(d)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    days.includes(d)
                      ? "bg-blue-500 text-white border-blue-500 font-semibold"
                      : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                  }`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-blue-800 mb-1.5">🕐 희망 시간대 (다중 선택 · 시간표 슬롯 그대로)</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
              {TIME_SLOTS.map(t => (
                <button key={t} onClick={() => toggleTime(t)}
                  className={`px-2 py-1.5 text-[11px] rounded-lg border transition-colors ${
                    times.includes(t)
                      ? "bg-cyan-500 text-white border-cyan-500 font-semibold"
                      : "bg-white text-gray-600 border-gray-200 hover:border-cyan-300"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-blue-800 mb-1.5">✏️ 추가 텍스트 입력 (선택)</div>
            <input
              type="text"
              placeholder='예: "오후 14~17", "저녁 17~20", "월요일 14:40"'
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val && !times.includes(val)) {
                    setTimes([...times, val]);
                    (e.target as HTMLInputElement).value = "";
                  }
                }
              }}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-cyan-400"
            />
            <div className="text-[10px] text-gray-500 mt-1">
              Enter로 추가 · 상담폼 원본 자유형식(예: "오후 14~17")도 그대로 매칭 가능
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
