"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { supabase } from "@/lib/supabase";
import { Clock, TrendingUp, Calendar, Printer, Download, User } from "lucide-react";

/**
 * v3.20.15: 직원별 월간 실근무시간 통계 대시보드
 * - 월별 총 근무일수 / 실근무시간 / 초과근무 자동 집계
 * - 강사별 · 일자별 히트맵
 * - CSV / 프린트 지원
 */

function monthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtH(n: number) { return `${(n || 0).toFixed(1)}h`; }

export default function AttendanceStatsPage() {
  const [month, setMonth] = useState(monthStr(new Date()));
  const [staff, setStaff] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<string>("");

  useEffect(() => { loadAll(); }, [month]);

  async function loadAll() {
    setLoading(true);
    const from = month + "-01";
    const to   = month + "-31";
    // ✅ v3.20.15: work_date / log_date 양쪽 조회
    const sRes = await supabase.from("staff").select("id, name, role, color, is_resigned").order("name");
    let logsData: any[] = [];
    for (const col of ["work_date", "log_date"]) {
      const r = await supabase.from("attendance_logs").select("*").gte(col, from).lte(col, to);
      if (!r.error) { logsData = r.data || []; break; }
    }
    setStaff(sRes.data || []);
    setLogs((logsData || []).map((r: any) => ({
      ...r,
      work_date: r.work_date || r.log_date,
    })));
    setLoading(false);
  }

  // 강사별 통계
  const staffStats = useMemo(() => {
    const activeStaff = staff.filter((s: any) => !s.is_resigned);
    return activeStaff.map((s: any) => {
      const myLogs = logs.filter((l: any) => l.staff_id === s.id);
      const workDays = new Set(myLogs.map((l: any) => l.work_date).filter(Boolean)).size;
      const totalHours = myLogs.reduce((sum, l) => sum + Number(l.work_hours || 0), 0);
      const overtime = myLogs.reduce((sum, l) => sum + Number(l.overtime_hours || l.overtime || 0), 0);
      const avg = workDays > 0 ? totalHours / workDays : 0;
      return { ...s, workDays, totalHours, overtime, avg };
    }).sort((a, b) => b.totalHours - a.totalHours);
  }, [staff, logs]);

  const totals = useMemo(() => ({
    totalStaff: staffStats.length,
    totalDays: staffStats.reduce((a, s) => a + s.workDays, 0),
    totalHours: staffStats.reduce((a, s) => a + s.totalHours, 0),
    totalOT: staffStats.reduce((a, s) => a + s.overtime, 0),
  }), [staffStats]);

  // 일자별 히트맵 (선택 강사)
  const dailyMap = useMemo(() => {
    if (!selectedStaff) return [];
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const map: any[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${month}-${String(d).padStart(2, "0")}`;
      const log = logs.find((l: any) => l.staff_id === selectedStaff && l.work_date === dateStr);
      map.push({ date: dateStr, day: d, dow: new Date(dateStr).getDay(), log });
    }
    return map;
  }, [selectedStaff, month, logs]);

  function exportCsv() {
    const bom = "\uFEFF";
    const header = ["강사명", "역할", "근무일수", "실근무시간(h)", "초과근무(h)", "일평균(h)"].join(",");
    const rows = staffStats.map(s => [
      s.name, s.role || "-", s.workDays, s.totalHours.toFixed(1), s.overtime.toFixed(1), s.avg.toFixed(1)
    ].join(","));
    const csv = bom + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `실근무통계_${month}.csv`;
    a.click();
  }

  return (
    <main className="max-w-6xl mx-auto px-3 md:px-6 py-6 md:py-10">
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 md:w-7 md:h-7 text-emerald-500" />
          📊 실근무시간 통계
        </h1>
        <div className="flex items-center gap-2">
          <Link href="/attendance-staff" className="text-xs px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">← 출퇴근 기록</Link>
          <HomeButton />
        </div>
      </div>

      {/* 필터 */}
      <div className="no-print flex flex-wrap items-center gap-2 mb-4">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        <button onClick={() => setMonth(monthStr(new Date()))}
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">이번 달</button>
        <div className="flex-1" />
        <button onClick={() => window.print()}
          className="text-xs px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-1">
          <Printer className="w-3.5 h-3.5" /> 프린트
        </button>
        <button onClick={exportCsv}
          className="text-xs px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 flex items-center gap-1">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPI label="재직 직원" val={totals.totalStaff + "명"} color="text-blue-700" bg="bg-blue-50" />
        <KPI label="총 근무일수" val={totals.totalDays + "일"} color="text-emerald-700" bg="bg-emerald-50" />
        <KPI label="총 실근무시간" val={fmtH(totals.totalHours)} color="text-purple-700" bg="bg-purple-50" />
        <KPI label="총 초과근무" val={fmtH(totals.totalOT)} color="text-orange-700" bg="bg-orange-50" />
      </div>

      {/* 인쇄용 헤더 */}
      <div className="hidden print:block text-center mb-4">
        <h2 className="text-lg font-bold">위례아쿠수중운동센터 · 직원 실근무시간 통계</h2>
        <div className="text-xs text-gray-600">{month} · 발행일 {new Date().toISOString().slice(0, 10)}</div>
        <hr className="my-2 border-black" />
      </div>

      {/* 강사별 통계 표 */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-5">
        <div className="px-4 py-2 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50">
          <div className="text-sm font-bold text-slate-900">👥 강사별 근무 통계 ({month})</div>
        </div>
        {loading ? (
          <div className="p-10 text-center text-gray-400">로딩 중...</div>
        ) : staffStats.length === 0 ? (
          <div className="p-10 text-center text-gray-400">재직 중인 직원이 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">강사</th>
                <th className="px-3 py-2 text-center">역할</th>
                <th className="px-3 py-2 text-center">근무일수</th>
                <th className="px-3 py-2 text-right">실근무</th>
                <th className="px-3 py-2 text-right">초과근무</th>
                <th className="px-3 py-2 text-right">일평균</th>
                <th className="no-print px-3 py-2 text-center">일자별</th>
              </tr>
            </thead>
            <tbody>
              {staffStats.map(s => (
                <tr key={s.id} className="border-b border-gray-100 hover:bg-aqu-50/30">
                  <td className="px-3 py-2 font-medium">
                    <span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ background: s.color || "#94a3b8" }} />
                    {s.name}
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-gray-600">{s.role || "-"}</td>
                  <td className="px-3 py-2 text-center font-semibold text-emerald-700">{s.workDays}일</td>
                  <td className="px-3 py-2 text-right font-semibold text-purple-700">{fmtH(s.totalHours)}</td>
                  <td className="px-3 py-2 text-right text-orange-600">{s.overtime > 0 ? fmtH(s.overtime) : "-"}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmtH(s.avg)}</td>
                  <td className="no-print px-3 py-2 text-center">
                    <button onClick={() => setSelectedStaff(selectedStaff === s.id ? "" : s.id)}
                      className={`text-xs px-2 py-1 rounded ${selectedStaff === s.id ? "bg-aqu-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                      {selectedStaff === s.id ? "닫기" : "펼치기"}
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td className="px-3 py-2" colSpan={2}>합계</td>
                <td className="px-3 py-2 text-center text-emerald-800">{totals.totalDays}일</td>
                <td className="px-3 py-2 text-right text-purple-800">{fmtH(totals.totalHours)}</td>
                <td className="px-3 py-2 text-right text-orange-700">{fmtH(totals.totalOT)}</td>
                <td className="px-3 py-2 text-right text-gray-700">
                  {fmtH(totals.totalDays > 0 ? totals.totalHours / totals.totalDays : 0)}
                </td>
                <td className="no-print"></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* 선택 강사 일자별 히트맵 */}
      {selectedStaff && (
        <div className="no-print bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            {staff.find(s => s.id === selectedStaff)?.name} · 일자별 근무시간
          </div>
          <div className="grid grid-cols-7 gap-1 text-xs">
            {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
              <div key={d} className={`p-1 text-center font-bold ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-600"}`}>{d}</div>
            ))}
            {(() => {
              const first = dailyMap[0];
              if (!first) return null;
              const pad = first.dow;
              return Array(pad).fill(null).map((_, i) => <div key={`pad-${i}`} />);
            })()}
            {dailyMap.map(d => {
              const hours = d.log ? Number(d.log.work_hours || 0) : 0;
              const intensity = Math.min(1, hours / 9);
              const bg = d.log ? `rgba(52, 211, 153, ${0.15 + intensity * 0.7})` : "#f8fafc";
              return (
                <div key={d.date}
                  className="aspect-square p-1 border border-gray-100 rounded text-center flex flex-col justify-center"
                  style={{ background: bg }}
                  title={d.log ? `${d.date} · ${fmtH(hours)}` : `${d.date} · 근무 없음`}>
                  <div className={`text-[10px] font-bold ${d.dow === 0 ? "text-red-500" : d.dow === 6 ? "text-blue-500" : "text-gray-700"}`}>{d.day}</div>
                  {d.log && <div className="text-[9px] text-gray-700">{fmtH(hours)}</div>}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-3 text-[11px] text-gray-500">
            <span>🟢 근무일</span>
            <span>⬜ 미근무</span>
            <span>· 진하기 = 근무시간</span>
          </div>
        </div>
      )}
    </main>
  );
}

function KPI({ label, val, color, bg }: any) {
  return (
    <div className={`p-3 rounded-xl border border-gray-100 text-center ${bg || "bg-white"}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold mt-1 ${color || "text-gray-900"}`}>{val}</div>
    </div>
  );
}
