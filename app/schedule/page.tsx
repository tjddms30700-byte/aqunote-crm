"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Calendar, Waves } from "lucide-react";

export default function SchedulePage() {
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("timeslots").select("*").order("day_of_week").order("start_time");
      setSlots(data || []);
      setLoading(false);
    })();
  }, []);

  const days = ["월", "화", "수", "목", "금", "토", "일"];
  const times = Array.from(new Set(slots.map((s) => s.start_time?.slice(0, 5)))).sort();

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <Waves className="w-8 h-8 text-aqu-600" />
          <h1 className="text-3xl font-bold text-aqu-900">📅 시간표</h1>
        </div>
        <Link href="/" className="text-sm text-aqu-600 hover:underline">← 홈으로</Link>
      </div>

      {loading ? (
        <div className="p-10 text-center text-gray-400">불러오는 중…</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-aqu-50">
                <th className="px-3 py-2 text-left">시간</th>
                {days.map((d) => (
                  <th key={d} className="px-3 py-2 text-aqu-900">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {times.map((t) => (
                <tr key={t} className="border-t border-aqu-100">
                  <td className="px-3 py-2 text-aqu-700 font-medium">{t}</td>
                  {days.map((_, i) => {
                    const slot = slots.find((s) => s.day_of_week === i + 1 && s.start_time?.startsWith(t));
                    return (
                      <td key={i} className="px-3 py-2 text-center">
                        {slot ? (
                          <span className="inline-block w-3 h-3 rounded-full bg-aqu-400"></span>
                        ) : (
                          <span className="text-gray-300">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 text-right mt-3">총 {slots.length}개 슬롯</p>
    </main>
  );
}
