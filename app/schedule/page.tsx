"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { supabase } from "@/lib/supabase";
import { getActiveBranchId, useBranchWatch } from "@/lib/branchContext";

// ✅ 버그 없는 월별 날짜 범위 계산 (2026-08-32 같은 잘못된 날짜 방지)
function getMonthDateRange(year: number, month0: number): { start: string; end: string } {
  const first = new Date(year, month0, 1);
  const last = new Date(year, month0 + 1, 0); // 다음달 0일 = 이번달 마지막 실제 날짜

  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  return { start: fmt(first), end: fmt(last) };
}

// 42셀 캘린더 그리드
function monthGrid(year: number, month0: number) {
  const first = new Date(year, month0, 1);
  const firstWeekday = first.getDay();
  const start = new Date(year, month0, 1 - firstWeekday);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return cells;
}

const fmtDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function SchedulePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const branchId = useBranchWatch();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { start, end } = getMonthDateRange(year, month0);
      console.log(`[Schedule v3.24.0] ${year}-${month0 + 1} 조회: ${start} ~ ${end}`);

      let query = supabase
        .from("schedule_slots")
        .select("*")
        .gte("event_date", start)
        .lte("event_date", end)  // ✅ lt(32일) 대신 lte(31일)
        .is("deleted_at", null)
        .order("event_date", { ascending: true })
        .order("time_slot", { ascending: true });

      if (branchId) {
        query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
      }

      const { data, error: qErr } = await query;

      if (qErr) {
        console.error("[Schedule] 조회 오류:", qErr);
        // branch_id 필터 실패시 fallback
        const retry = await supabase
          .from("schedule_slots")
          .select("*")
          .gte("event_date", start)
          .lte("event_date", end)
          .is("deleted_at", null)
          .order("event_date");
        setSlots(retry.data || []);
      } else {
        console.log(`[Schedule] ${data?.length || 0}건 로드 완료`);
        setSlots(data || []);
      }
    } catch (e: any) {
      console.error("[Schedule] 예외:", e);
      setError(e.message);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [year, month0, branchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const byDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const s of slots) {
      const raw = s.event_date;
      if (!raw) continue;
      const key = typeof raw === "string" ? raw.substring(0, 10) : new Date(raw).toISOString().substring(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    return map;
  }, [slots]);

  const cells = useMemo(() => monthGrid(year, month0), [year, month0]);

  function prevMonth() {
    if (month0 === 0) { setYear(year - 1); setMonth0(11); }
    else setMonth0(month0 - 1);
  }
  function nextMonth() {
    if (month0 === 11) { setYear(year + 1); setMonth0(0); }
    else setMonth0(month0 + 1);
  }
  function today() {
    const n = new Date();
    setYear(n.getFullYear());
    setMonth0(n.getMonth());
  }

  const totalCount = slots.length;
  const scheduledCount = slots.filter((s) => s.status === "scheduled").length;
  const doneCount = slots.filter((s) => s.status === "done").length;
  const sickCount = slots.filter((s) => s.status === "sick").length;
  const personalCount = slots.filter((s) => s.status === "personal").length;
  const cancelCount = slots.filter((s) => s.status === "cancel").length;

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <HomeButton />

      <div className="flex flex-wrap items-center gap-2 my-4">
        <h1 className="text-2xl font-bold">📅 시간표</h1>
        <button onClick={prevMonth} className="px-3 py-1 bg-gray-200 rounded">◀</button>
        <span className="text-xl font-semibold">{year}년 {month0 + 1}월</span>
        <button onClick={nextMonth} className="px-3 py-1 bg-gray-200 rounded">▶</button>
        <button onClick={today} className="px-3 py-1 bg-cyan-500 text-white rounded">오늘</button>
        <button onClick={loadData} className="px-3 py-1 bg-green-500 text-white rounded">🔄 새로고침</button>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
        <div className="bg-blue-50 p-3 rounded"><div className="text-sm">총 일정</div><div className="text-2xl font-bold">{totalCount}</div></div>
        <div className="bg-green-50 p-3 rounded"><div className="text-sm">예약</div><div className="text-2xl font-bold">{scheduledCount}</div></div>
        <div className="bg-gray-50 p-3 rounded"><div className="text-sm">완료</div><div className="text-2xl font-bold">{doneCount}</div></div>
        <div className="bg-orange-50 p-3 rounded"><div className="text-sm">병결</div><div className="text-2xl font-bold">{sickCount}</div></div>
        <div className="bg-pink-50 p-3 rounded"><div className="text-sm">개인사정</div><div className="text-2xl font-bold">{personalCount}</div></div>
        <div className="bg-red-50 p-3 rounded"><div className="text-sm">취소</div><div className="text-2xl font-bold">{cancelCount}</div></div>
      </div>

      {loading && <div className="p-4 text-center">로딩 중...</div>}
      {error && <div className="p-4 bg-red-50 text-red-700 rounded">에러: {error}</div>}

      <div className="grid grid-cols-7 gap-1">
        {["일","월","화","수","목","금","토"].map((d) => (
          <div key={d} className="text-center font-bold py-2 bg-gray-100">{d}</div>
        ))}
        {cells.map((d, i) => {
          const key = fmtDate(d);
          const items = byDate[key] || [];
          const isCurrentMonth = d.getMonth() === month0;
          const isToday = fmtDate(d) === fmtDate(new Date());
          return (
            <div key={i} className={`min-h-[100px] border p-1 ${isCurrentMonth ? "bg-white" : "bg-gray-50 text-gray-400"} ${isToday ? "ring-2 ring-cyan-500" : ""}`}>
              <div className="font-semibold text-sm">{d.getDate()}</div>
              {items.slice(0, 3).map((it: any, idx: number) => (
                <div key={idx} className="text-xs bg-cyan-100 rounded px-1 my-0.5 truncate" title={`${it.time_slot || ""} ${it.lesson_name || ""}`}>
                  {it.time_slot || ""} {it.lesson_name || it.title || "수업"}
                </div>
              ))}
              {items.length > 3 && (<div className="text-xs text-gray-500">+{items.length - 3}건</div>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
