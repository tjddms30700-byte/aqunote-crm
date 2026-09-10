"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Edit2, Save, X, Calendar } from "lucide-react";

/**
 * ✅ v3.51.0: 희망 수업 시간대 — 시간표 그리드 방식으로 전면 재작성
 * - 요일(월~토) × 시간대(10개 슬롯) 표에서 칸마다 개별 체크
 * - 예: 월/화/수/목/금 18:10, 19:20 + 토 11:10, 12:20 처럼 요일별로 다르게 지정 가능
 * - 저장 포맷: wish_days=["월","화","토"], wish_time_slots=["월 18:10~19:20","토 11:10~12:20",...]
 *   (요일 접두 포맷 — 상담 매트릭스 매칭이 요일+시간을 정확히 결합해 해석)
 * - 기존 레거시 데이터(요일 공통 시간대)는 선택된 모든 요일 칸에 자동 펼쳐서 표시
 */

const DAYS_KO = ["월", "화", "수", "목", "금", "토"];
const TIME_SLOTS = [
  "10:00~11:10", "11:10~12:20", "12:20~13:30", "13:30~14:40",
  "14:40~15:50", "15:50~17:00", "17:00~18:10", "18:10~19:20",
  "19:20~20:30", "20:30~21:40",
];
// 시간 표기를 짧게 (18:10~19:20 → 18:10)
const shortTime = (slot: string) => slot.split("~")[0];
// ✅ v3.54.0: 지상재활 트랙은 30분 단위 그리드 (신청폼과 동일 포맷 "월 10:30")
const GROUND_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 9; h <= 21; h++) for (const m of [0, 30]) out.push(String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"));
  return out;
})();

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

const normSlot = (s: string) => s.replace(/\s/g, "");

/** ✅ v3.51.1: 상담폼 자유 텍스트까지 파싱해 그리드를 자동으로 채움
 *  - "월 18:10~19:20" (정규 포맷) → 해당 요일 칸에만 체크
 *  - "토요일 18:10~19:20" (요일 포함 텍스트) → 토요일 칸에만 체크
 *  - "4타임 17:00~18:10;5타임 18:10~19:20" (요일 없음) → 선택된 요일 전체 칸에 체크
 *  - 시간 패턴이 전혀 없는 텍스트(예: "오후 늦게")만 자유 텍스트 칩으로 보존
 *  → 직원이 일일이 다시 입력할 필요 없이, 기존 상담폼 정보가 그리드에 자동 반영됨
 */
function buildGrid(wishDays: string[] | null | undefined, wishTimeSlots: string[] | null | undefined, slotList: string[] = TIME_SLOTS) {
  const days = parseWishDays(wishDays);
  const times = (wishTimeSlots || []).map(String).filter(Boolean);
  const grid: Record<string, Set<string>> = {};
  const free = new Set<string>();
  const ensure = (d: string) => { if (!grid[d]) grid[d] = new Set<string>(); return grid[d]; };
  for (const d of days) ensure(d);

  const pad = (v: string) => v.padStart(2, "0");
  const rangeRe = /(\d{1,2}):(\d{2})\s*[~\-]\s*(\d{1,2}):(\d{2})/g;

  for (const t of times) {
    const parts = t.split(/[|,;]/).map(s => s.trim()).filter(Boolean);
    for (const p0 of parts) {
      const p = p0;

      // ① 이 텍스트에 포함된 요일 추출 ("토요일", "토" 등)
      const dayHits = DAYS_KO.filter(d => p.replace(/요일/g, "").includes(d));

      // ② 시간 범위(HH:MM~HH:MM) 전부 추출 → 슬롯 매핑
      const slotsFound = new Set<string>();
      let m: RegExpExecArray | null;
      rangeRe.lastIndex = 0;
      while ((m = rangeRe.exec(p)) !== null) {
        const key = `${pad(m[1])}:${m[2]}~${pad(m[3])}:${m[4]}`;
        const slot = slotList.find(ts => normSlot(ts) === normSlot(key));
        if (slot) slotsFound.add(slot);
      }
      // 단일 시각(HH:MM)만 있는 경우 → 그 시각에 시작하는 슬롯
      if (slotsFound.size === 0) {
        const singles = p.match(/\d{1,2}:\d{2}/g) || [];
        for (const s0 of singles) {
          const [h, mm] = s0.split(":");
          const key = `${pad(h)}:${mm}`;
          const slot = slotList.find(ts => ts.split("~")[0] === key);
          if (slot) slotsFound.add(slot);
        }
      }

      if (slotsFound.size > 0) {
        // 요일이 텍스트에 있으면 그 요일만 / 없으면 선택된 요일 전체에 펼침
        const targets = dayHits.length > 0 ? dayHits : days;
        if (targets.length === 0) { free.add(p0); continue; }  // 요일 정보가 아예 없으면 보존
        for (const d of targets) for (const s of slotsFound) ensure(d).add(s);
        continue;
      }

      // ③ 시간 패턴이 전혀 없는 자유 텍스트 → 칩으로 보존
      free.add(p0);
    }
  }
  return { grid, free };
}

export default function WishScheduleCard({
  memberId,
  wishDays,
  wishTimeSlots,
  serviceTrack,
  onSaved,
}: {
  memberId: string;
  wishDays: string[] | null | undefined;
  wishTimeSlots: string[] | null | undefined;
  serviceTrack?: string | null;
  onSaved?: () => void;
}) {
  const isGround = String(serviceTrack || "").toLowerCase() === "ground"; // ✅ v3.54.0
  const SLOT_LIST = isGround ? GROUND_SLOTS : TIME_SLOTS;
  const initial = buildGrid(wishDays, wishTimeSlots, SLOT_LIST);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // 편집용 상태
  const [grid, setGrid] = useState<Record<string, Set<string>>>(() => {
    const g: Record<string, Set<string>> = {};
    for (const [d, set] of Object.entries(initial.grid)) g[d] = new Set(set);
    return g;
  });
  const [freeTimes, setFreeTimes] = useState<string[]>(Array.from(initial.free));
  const [freeInput, setFreeInput] = useState("");

  const selectedCount = (g: Record<string, Set<string>>) =>
    Object.values(g).reduce((acc, s) => acc + (s?.size || 0), 0);

  function toggleCell(day: string, slot: string) {
    setGrid(prev => {
      const next: Record<string, Set<string>> = {};
      for (const [d, set] of Object.entries(prev)) next[d] = new Set(set);
      if (!next[day]) next[day] = new Set();
      if (next[day].has(slot)) next[day].delete(slot);
      else next[day].add(slot);
      return next;
    });
  }

  function toggleDayAll(day: string) {
    setGrid(prev => {
      const next: Record<string, Set<string>> = {};
      for (const [d, set] of Object.entries(prev)) next[d] = new Set(set);
      const cur = next[day] || new Set();
      next[day] = cur.size === SLOT_LIST.length ? new Set() : new Set(SLOT_LIST);
      return next;
    });
  }

  function addFreeTime() {
    const v = freeInput.trim();
    if (v && !freeTimes.includes(v)) setFreeTimes([...freeTimes, v]);
    setFreeInput("");
  }

  async function save() {
    setSaving(true);
    // 그리드 → wish_days + 요일 접두 wish_time_slots
    const outDays: string[] = [];
    const outSlots: string[] = [];
    for (const d of DAYS_KO) {
      const set = grid[d];
      if (set && set.size > 0) {
        outDays.push(d);
        for (const s of SLOT_LIST) if (set.has(s)) outSlots.push(`${d} ${s}`);
      }
    }
    const { error } = await supabase.from("members")
      .update({ wish_days: outDays, wish_time_slots: [...outSlots, ...freeTimes] })
      .eq("id", memberId);
    setSaving(false);
    if (error) {
      alert("저장 실패: " + error.message);
      return;
    }
    setEditing(false);
    if (onSaved) onSaved();
  }

  function cancelEdit() {
    const re = buildGrid(wishDays, wishTimeSlots, SLOT_LIST);
    const g: Record<string, Set<string>> = {};
    for (const [d, set] of Object.entries(re.grid)) g[d] = new Set(set);
    setGrid(g);
    setFreeTimes(Array.from(re.free));
    setEditing(false);
  }

  const viewGrid = initial.grid;
  const viewFree = Array.from(initial.free);
  const viewCount = selectedCount(viewGrid as any);

  return (
    <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-2xl p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold text-blue-900 flex items-center gap-1.5">
          <Calendar className="w-4 h-4" /> 희망 수업 시간대
          <span className="text-xs text-blue-600 font-normal">(요일별로 시간대 개별 선택{isGround ? " · 지상 30분 단위" : ""})</span>
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
            <button onClick={cancelEdit}
              className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 flex items-center gap-1">
              <X className="w-3 h-3" /> 취소
            </button>
          </div>
        )}
      </div>

      {/* ✅ v3.51.0: 시간표 그리드 (보기/편집 공용) */}
      {(viewCount > 0 || editing) ? (
        <div className="bg-white rounded-xl border border-blue-100 overflow-x-auto">
          <table className="w-full text-[11px] border-separate" style={{ borderSpacing: "2px" }}>
            <thead>
              <tr>
                <th className="p-1 w-14 text-slate-400 font-semibold">시간</th>
                {DAYS_KO.map(d => {
                  const active = editing
                    ? (grid[d]?.size || 0) > 0
                    : (viewGrid[d]?.size || 0) > 0;
                  return (
                    <th key={d}
                      onClick={() => editing && toggleDayAll(d)}
                      className={`p-1 rounded-md font-bold ${active ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"} ${editing ? "cursor-pointer hover:opacity-80" : ""}`}
                      title={editing ? "클릭하면 이 요일 전체 선택/해제" : undefined}>
                      {d}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {SLOT_LIST.map(slot => (
                <tr key={slot}>
                  <td className="p-1 text-center font-mono text-slate-500 whitespace-nowrap">{shortTime(slot)}</td>
                  {DAYS_KO.map(d => {
                    const on = editing ? !!grid[d]?.has(slot) : !!viewGrid[d]?.has(slot);
                    return (
                      <td key={d}
                        onClick={() => editing && toggleCell(d, slot)}
                        className={`p-1 rounded-md text-center transition-colors ${
                          on
                            ? "bg-cyan-400 text-white font-bold shadow-sm"
                            : editing
                              ? "bg-slate-50 text-slate-300 cursor-pointer hover:bg-cyan-100 hover:text-cyan-500"
                              : "bg-slate-50 text-slate-300"
                        }`}>
                        {on ? "✓" : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-xs text-gray-500 text-center py-3 bg-white/50 rounded-lg">
          아직 희망 시간대가 없습니다 — [수정]을 눌러 요일별로 시간을 선택하세요
        </div>
      )}

      {/* 자유 텍스트 (상담폼 원본 등) 보존 표시 */}
      {(viewFree.length > 0 || editing) && (
        <div className="mt-2">
          <div className="text-[10px] font-semibold text-blue-700 mb-1">✏️ 기타 희망 사항 (자유 텍스트)</div>
          <div className="flex flex-wrap gap-1">
            {(editing ? freeTimes : viewFree).map((t, i) => (
              <span key={i} className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-[11px] flex items-center gap-1">
                {t}
                {editing && (
                  <button onClick={() => setFreeTimes(freeTimes.filter(x => x !== t))}
                    className="text-amber-400 hover:text-amber-700">✕</button>
                )}
              </span>
            ))}
            {editing && (
              <span className="flex items-center gap-1">
                <input
                  type="text"
                  value={freeInput}
                  onChange={e => setFreeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addFreeTime(); }}
                  placeholder='예: "오후 늦게"'
                  className="px-2 py-0.5 text-[11px] border border-gray-200 rounded-full w-28 focus:outline-none focus:border-cyan-400"
                />
                <button onClick={addFreeTime}
                  className="text-[11px] px-2 py-0.5 bg-cyan-100 text-cyan-700 rounded-full font-bold">+</button>
              </span>
            )}
          </div>
        </div>
      )}

      {editing && (
        <div className="text-[10px] text-blue-500 mt-2">
          💡 칸을 클릭해서 요일별로 원하는 시간대를 개별 선택하세요 · 요일 글자를 누르면 그 요일 전체 선택/해제
        </div>
      )}
    </div>
  );
}
