"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import HomeButton from "@/components/HomeButton";
import { Clock, Play, Square, User, Calendar, TrendingUp } from "lucide-react";

function todayStr() { return new Date().toISOString().slice(0,10); }
function nowIso() { return new Date().toISOString(); }
function fmtTime(iso?: string) { return iso ? new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "-"; }
function diffHours(a: string, b: string) { return (new Date(b).getTime() - new Date(a).getTime()) / 3600000; }

export default function StaffAttendancePage() {
  const [staff, setStaff] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7));
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, [month]);

  async function loadAll() {
    setLoading(true);
    const [sRes, lRes] = await Promise.all([
      supabase.from("staff").select("*").order("name"),
      supabase.from("attendance_logs").select("*").gte("log_date", month + "-01")
        .lte("log_date", month + "-31").order("log_date", { ascending: false }),
    ]);
    setStaff(sRes.data || []);
    setLogs(lRes.data || []);
    if (!selectedStaff && sRes.data && sRes.data.length > 0) setSelectedStaff(sRes.data[0].id);
    setLoading(false);
  }

  async function checkIn(staffId: string) {
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const today = todayStr();
    const existing = logs.find(l => l.staff_id === staffId && l.log_date === today);
    if (existing) {
      alert("이미 출근 기록이 있습니다");
      return;
    }
    await supabase.from("attendance_logs").insert({
      org_id: orgId, staff_id: staffId, log_date: today,
      check_in: nowIso(), status: "normal",
    });
    await loadAll();
  }

  async function checkOut(logId: string, checkInIso: string) {
    const now = nowIso();
    const work = diffHours(checkInIso, now);
    await supabase.from("attendance_logs").update({
      check_out: now, work_hours: work,
      overtime_hours: work > 8 ? work - 8 : 0,
    }).eq("id", logId);
    await loadAll();
  }

  const staffLogs = useMemo(() => logs.filter(l => l.staff_id === selectedStaff), [logs, selectedStaff]);
  const todayLog = staffLogs.find(l => l.log_date === todayStr());

  const stats = useMemo(() => {
    const workDays = staffLogs.filter(l => l.check_in).length;
    const totalHours = staffLogs.reduce((s, l) => s + Number(l.work_hours || 0), 0);
    const totalOT = staffLogs.reduce((s, l) => s + Number(l.overtime_hours || 0), 0);
    return { workDays, totalHours, totalOT };
  }, [staffLogs]);

  return (
    <main className="max-w-6xl mx-auto px-3 md:px-6 py-6 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
          <Clock className="w-6 h-6 md:w-7 md:h-7 text-blue-500" /> 직원 출퇴근
        </h1>
        <HomeButton />
      </div>

      {/* 오늘 출퇴근 (전체 직원) */}
      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-4 md:p-5 mb-6">
        <h2 className="text-base font-bold text-aqu-900 mb-3">📅 오늘 ({todayStr()}) 출퇴근</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {staff.map(s => {
            const log = logs.find(l => l.staff_id === s.id && l.log_date === todayStr());
            return (
              <div key={s.id} className="flex items-center justify-between p-2 border border-gray-100 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color || "#3b82f6" }}></span>
                  <span className="font-medium text-sm">{s.name}</span>
                  <span className="text-[10px] text-gray-500">({s.role})</span>
                </div>
                <div className="flex items-center gap-2">
                  {log?.check_in && !log?.check_out && (
                    <>
                      <span className="text-xs text-green-600">🟢 출근 {fmtTime(log.check_in)}</span>
                      <button onClick={() => checkOut(log.id, log.check_in)}
                        className="text-xs px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded flex items-center gap-1">
                        <Square className="w-3 h-3" /> 퇴근
                      </button>
                    </>
                  )}
                  {log?.check_in && log?.check_out && (
                    <span className="text-xs text-gray-600">✓ {fmtTime(log.check_in)} ~ {fmtTime(log.check_out)} · {Number(log.work_hours).toFixed(1)}h</span>
                  )}
                  {!log && (
                    <button onClick={() => checkIn(s.id)}
                      className="text-xs px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded flex items-center gap-1">
                      <Play className="w-3 h-3" /> 출근 체크
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 월별 통계 */}
      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-base font-bold text-aqu-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> 개인별 근태 통계
          </h2>
          <div className="flex gap-2">
            <select value={selectedStaff} onChange={e => setSelectedStaff(e.target.value)}
              className="px-2 py-1 border border-gray-200 rounded text-sm">
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="px-2 py-1 border border-gray-200 rounded text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <KPI label="근무일수" val={stats.workDays + "일"} color="text-aqu-700" />
          <KPI label="근무시간 합계" val={stats.totalHours.toFixed(1) + "h"} color="text-blue-600" />
          <KPI label="연장근무" val={stats.totalOT.toFixed(1) + "h"} color="text-orange-600" />
        </div>

        {/* 일별 로그 */}
        <div className="border-t pt-3">
          {staffLogs.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-400">이 달 근무 기록이 없습니다</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-2 text-left">날짜</th>
                  <th className="p-2 text-left">출근</th>
                  <th className="p-2 text-left">퇴근</th>
                  <th className="p-2 text-right">근무</th>
                  <th className="p-2 text-right">연장</th>
                </tr>
              </thead>
              <tbody>
                {staffLogs.map(l => (
                  <tr key={l.id} className="border-b">
                    <td className="p-2">{l.log_date}</td>
                    <td className="p-2">{fmtTime(l.check_in)}</td>
                    <td className="p-2">{fmtTime(l.check_out)}</td>
                    <td className="p-2 text-right font-bold">{Number(l.work_hours || 0).toFixed(1)}h</td>
                    <td className="p-2 text-right text-orange-600">{Number(l.overtime_hours || 0).toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="mt-4 text-center">
        <Link href="/leave" className="text-sm text-aqu-600 hover:underline">→ 휴가 신청하기</Link>
      </div>
    </main>
  );
}

function KPI({ label, val, color }: any) {
  return (
    <div className="p-3 bg-gray-50 rounded-xl text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{val}</div>
    </div>
  );
}
