"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import HomeButton from "@/components/HomeButton";
import { Clock, Play, Square, User, Calendar, TrendingUp, FileCheck, MessageSquare, UserCog } from "lucide-react";

function todayStr() { return new Date().toISOString().slice(0,10); }
function nowIso() { return new Date().toISOString(); }
function fmtTime(iso?: string) { return iso ? new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "-"; }
function diffHours(a: string, b: string) { return (new Date(b).getTime() - new Date(a).getTime()) / 3600000; }

export default function StaffAttendancePage() {
  const [staff, setStaff] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7));
  // v3.20.31: 4개 Sub-Tab 통합 (출퇴근 / 실근무통계 / 휴가·결재 / 사내게시판)
  const [subTab, setSubTab] = useState<"attendance" | "stats" | "leave" | "board">("attendance");
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, [month]);

  async function loadAll() {
    setLoading(true);
    const [sRes, lRes, vRes] = await Promise.all([
      supabase.from("staff").select("*").order("name"),
      supabase.from("attendance_logs").select("*").gte("log_date", month + "-01")
        .lte("log_date", month + "-31").order("log_date", { ascending: false }),
      // v3.20.24: 승인된 휴가 내역을 모두 가져와 자동 계산
      supabase.from("leave_requests").select("*").in("status", ["approved"]),
    ]);
    setStaff(sRes.data || []);
    setLogs(lRes.data || []);
    setLeaves(vRes.data || []);
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

  // v3.20.24: 근로기준법 기반 발생연차 계산 (해당 직원 기준)
  function calcAnnualLeave(staffRow: any): { total: number; issued: number; carry: number } {
    if (!staffRow?.hire_date) return { total: 0, issued: 0, carry: 0 };
    // 수동 입력된 값이 있으면 사용
    if (staffRow.annual_leave_total !== null && staffRow.annual_leave_total !== undefined) {
      return { total: Number(staffRow.annual_leave_total) || 0, issued: Number(staffRow.annual_leave_total) || 0, carry: 0 };
    }
    const hire = new Date(staffRow.hire_date);
    const now = new Date();
    if (isNaN(hire.getTime())) return { total: 0, issued: 0, carry: 0 };
    const monthsWorked = (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth());
    const yearsWorked = Math.floor(monthsWorked / 12);
    let total = 0;
    if (yearsWorked < 1) {
      // 1년 미만: 1개월 개근 시 1개 (최대 11개)
      total = Math.min(11, Math.max(0, monthsWorked));
    } else {
      // 1년 이상: 15개 + 2년 마다 1개 추가 (최대 25개)
      total = Math.min(25, 15 + Math.floor((yearsWorked - 1) / 2));
    }
    return { total, issued: total, carry: 0 };
  }

  // v3.20.30: 승인 휴가 통합 강화 - 연차/반차/포상휴가/특별휴가 전수 집계
  const ANNUAL_TYPES = ["annual", "half_am", "half_pm", "halfday"];
  const REWARD_TYPES = ["reward", "bonus", "special", "comp"];
  const staffLeaves = useMemo(() =>
    leaves?.filter?.(v => v?.staff_id === selectedStaff && ANNUAL_TYPES.includes(v?.leave_type || "")) || [],
  [leaves, selectedStaff]);
  const staffRewardLeaves = useMemo(() =>
    leaves?.filter?.(v => v?.staff_id === selectedStaff && REWARD_TYPES.includes(v?.leave_type || "")) || [],
  [leaves, selectedStaff]);

  function countDaysBetween(v: any): number {
    if (v?.days) return Number(v.days) || 1;
    if (v?.start_date && v?.end_date) {
      const s = new Date(v.start_date); const e = new Date(v.end_date);
      const days = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
      return Math.max(1, days);
    }
    return 1;
  }

  const usedAnnual = useMemo(() => {
    let used = 0;
    for (const v of staffLeaves) {
      const type = v?.leave_type;
      const half = (v?.half_period && String(v.half_period).toLowerCase() !== "full") ? 0.5 : null;
      if (type === "half_am" || type === "half_pm" || type === "halfday") {
        used += 0.5;
      } else if (type === "annual") {
        used += half !== null ? half : countDaysBetween(v);
      }
    }
    return used;
  }, [staffLeaves]);

  const usedReward = useMemo(() => {
    let used = 0;
    for (const v of staffRewardLeaves) used += countDaysBetween(v);
    return used;
  }, [staffRewardLeaves]);

  // v3.20.30: 해당 날짜가 연차/반차/포상휴가인지 판별 (Nullish 안전 강화)
  function leaveTagForDate(dateStr: string): { label: string; delta: number; color: string } | null {
    const allLeaves = [...staffLeaves, ...staffRewardLeaves];
    for (const v of allLeaves) {
      const s = v?.start_date ? new Date(v.start_date).toISOString().slice(0, 10) : null;
      const e = v?.end_date ? new Date(v.end_date).toISOString().slice(0, 10) : s;
      if (!s) continue;
      if (dateStr >= s && dateStr <= (e || s)) {
        const t = v?.leave_type;
        if (t === "half_am" || t === "half_pm" || t === "halfday") {
          return { label: "🌤️ 반차 사용", delta: -0.5, color: "bg-amber-100 text-amber-700 border-amber-300" };
        }
        if (t === "annual") {
          const half = (v?.half_period && String(v.half_period).toLowerCase() !== "full") ? true : false;
          return half
            ? { label: "🌤️ 반차 사용", delta: -0.5, color: "bg-amber-100 text-amber-700 border-amber-300" }
            : { label: "🌴 연차 사용", delta: -1, color: "bg-emerald-100 text-emerald-700 border-emerald-300" };
        }
        if (REWARD_TYPES.includes(t || "")) {
          return { label: "🎁 포상휴가", delta: 0, color: "bg-purple-100 text-purple-700 border-purple-300" };
        }
      }
    }
    return null;
  }

  // v3.20.30: 승인 휴가를 실근무 통계에 실시간 자동 반영
  const stats = useMemo(() => {
    const workDays = staffLogs?.filter?.(l => l?.check_in).length || 0;
    const totalHours = staffLogs?.reduce?.((s, l) => s + Number(l?.work_hours || 0), 0) || 0;
    const totalOT = staffLogs?.reduce?.((s, l) => s + Number(l?.overtime_hours || 0), 0) || 0;
    const currentStaff = staff?.find?.((s: any) => s?.id === selectedStaff);
    const annual = calcAnnualLeave(currentStaff);
    const remaining = Math.max(0, annual.total - usedAnnual);
    // 실근무일수 = 출근 기록에 승인된 연차/반차 환산일수 더함으로서 누락 없이 반영
    const workDaysWithLeave = workDays + usedAnnual + usedReward;
    // 실근무시간 = 실제 근무시간 + 연차 사용일 × 8 (기본 8시간)
    const effectiveHours = totalHours + usedAnnual * 8 + usedReward * 8;
    return {
      workDays, totalHours, totalOT,
      workDaysWithLeave, effectiveHours,
      annualTotal: annual.total, annualUsed: usedAnnual, annualRemaining: remaining,
      rewardUsed: usedReward,
    };
  }, [staffLogs, staff, selectedStaff, usedAnnual, usedReward]);

  return (
    <main className="max-w-6xl mx-auto px-3 md:px-6 py-6 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
          <UserCog className="w-6 h-6 md:w-7 md:h-7 text-blue-500" /> 직원 · 근무 관리
        </h1>
        <HomeButton />
      </div>

      {/* v3.20.31: 4개 Sub-Tab 통합 - 한 화면에서 전환 */}
      <div className="flex flex-wrap gap-1 mb-5 bg-white rounded-2xl shadow border border-aqu-100 p-1">
        <button onClick={() => setSubTab("attendance")}
          className={`flex-1 min-w-[140px] px-3 py-2.5 rounded-lg text-sm font-bold transition flex items-center justify-center gap-1.5 ${subTab==="attendance" ? "bg-gradient-to-r from-aqu-500 to-blue-600 text-white shadow" : "text-gray-600 hover:bg-gray-50"}`}>
          <Clock className="w-4 h-4" /> ⏱️ 출퇴근 / 근태
        </button>
        <button onClick={() => setSubTab("stats")}
          className={`flex-1 min-w-[140px] px-3 py-2.5 rounded-lg text-sm font-bold transition flex items-center justify-center gap-1.5 ${subTab==="stats" ? "bg-gradient-to-r from-aqu-500 to-blue-600 text-white shadow" : "text-gray-600 hover:bg-gray-50"}`}>
          <TrendingUp className="w-4 h-4" /> 📊 실근무 통계
        </button>
        <Link href="/leave"
          onClick={() => setSubTab("leave")}
          className={`flex-1 min-w-[140px] px-3 py-2.5 rounded-lg text-sm font-bold transition flex items-center justify-center gap-1.5 text-gray-600 hover:bg-gray-50`}>
          <FileCheck className="w-4 h-4" /> 🌴 휴가 / 전자결재
        </Link>
        <Link href="/board"
          onClick={() => setSubTab("board")}
          className={`flex-1 min-w-[140px] px-3 py-2.5 rounded-lg text-sm font-bold transition flex items-center justify-center gap-1.5 text-gray-600 hover:bg-gray-50`}>
          <MessageSquare className="w-4 h-4" /> 📢 사내 게시판
        </Link>
      </div>

      {/* v3.20.31: Tab 1 - ⏱️ 출퇴근 / 근태 현황 */}
      {subTab === "attendance" && (<>
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

      </>)}

      {/* v3.20.31: Tab 2 - 📊 실근무 통계 (개인별 근태 + 연차) */}
      {(subTab === "attendance" || subTab === "stats") && (<>
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

        {/* v3.20.30: 실근무일수/실근무시간은 승인 휴가 반영 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <KPI label="출근일수" val={(stats?.workDays ?? 0) + "일"} color="text-aqu-700" />
          <KPI label="실근무일수 (휴가포함)" val={(stats?.workDaysWithLeave ?? 0).toFixed(1) + "일"} color="text-indigo-700" />
          <KPI label="근무시간 합계" val={(stats?.totalHours ?? 0).toFixed(1) + "h"} color="text-blue-600" />
          <KPI label="연장근무" val={(stats?.totalOT ?? 0).toFixed(1) + "h"} color="text-orange-600" />
        </div>
        {/* v3.20.30: 휴가 통합 KPI (연차 + 포상휴가) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KPI label="🌴 총 연차" val={(stats?.annualTotal ?? 0) + "일"} color="text-emerald-700" />
          <KPI label="사용 연차" val={(stats?.annualUsed ?? 0).toFixed(1) + "일"} color="text-amber-700" />
          <KPI label="잔여 연차" val={(stats?.annualRemaining ?? 0).toFixed(1) + "일"} color={(stats?.annualRemaining ?? 0) <= 2 ? "text-red-600" : "text-teal-700"} />
          <KPI label="🎁 포상휴가 사용" val={(stats?.rewardUsed ?? 0).toFixed(1) + "일"} color="text-purple-700" />
        </div>
        <div className="text-[10px] text-gray-500 mb-3">
          💡 입사일({(staff.find((s: any) => s.id === selectedStaff)?.hire_date) || "미설정"}) 기준 근로기준법 자동 계산 · 1년 미만은 개근 월당 1개, 1년 이상은 15개 + 2년마다 1개 추가 (최대 25개)
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
                {staffLogs.map(l => {
                  const tag = leaveTagForDate(l.log_date);
                  return (
                    <tr key={l.id} className="border-b">
                      <td className="p-2">{l.log_date}</td>
                      <td className="p-2">{tag ? "-" : fmtTime(l.check_in)}</td>
                      <td className="p-2">{tag ? "-" : fmtTime(l.check_out)}</td>
                      <td className="p-2 text-right font-bold" colSpan={tag ? 2 : 1}>
                        {tag ? (
                          <span className={`inline-block px-2 py-1 rounded border text-xs font-bold ${tag.color}`}>
                            {tag.label} ({tag.delta}d)
                          </span>
                        ) : (
                          <>{Number(l.work_hours || 0).toFixed(1)}h</>
                        )}
                      </td>
                      {!tag && <td className="p-2 text-right text-orange-600">{Number(l.overtime_hours || 0).toFixed(1)}h</td>}
                    </tr>
                  );
                })}
                {/* v3.20.24: 수업이 없지만 연차만 사용한 날짜 자동 추가 */}
                {staffLeaves.filter(v => {
                  const s = v.start_date ? new Date(v.start_date).toISOString().slice(0, 10) : null;
                  if (!s) return false;
                  return s.startsWith(month) && !staffLogs.some(l => l.log_date === s);
                }).map(v => {
                  const dateStr = new Date(v.start_date).toISOString().slice(0, 10);
                  const tag = leaveTagForDate(dateStr);
                  if (!tag) return null;
                  return (
                    <tr key={`leave-${v.id}`} className="border-b bg-emerald-50/30">
                      <td className="p-2">{dateStr}</td>
                      <td className="p-2" colSpan={4}>
                        <span className={`inline-block px-2 py-1 rounded border text-xs font-bold ${tag.color}`}>
                          {tag.label} ({tag.delta}d)
                        </span>
                        {v.reason && <span className="text-[11px] text-gray-500 ml-2">· {v.reason}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="mt-4 text-center">
        <Link href="/leave" className="text-sm text-aqu-600 hover:underline">→ 휴가 신청하기</Link>
      </div>
      </>)}

      {/* v3.20.31: Tab 3, 4 - 휴가결재 / 사내게시판은 별도 페이지로 이동 */}
      {(subTab === "leave" || subTab === "board") && (
        <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-6 text-center">
          <div className="text-4xl mb-3">{subTab === "leave" ? "🌴" : "📢"}</div>
          <div className="text-base font-bold text-aqu-900 mb-2">
            {subTab === "leave" ? "휴가 / 전자결재" : "사내 게시판"}
          </div>
          <div className="text-sm text-gray-600 mb-4">
            {subTab === "leave"
              ? "휴가 신청 · 승인 / 대기 목록을 관리합니다. 승인 완료 시 이 페이지의 출퇴근·실근무 통계에 자동 반영됩니다."
              : "공지사항 · Q&A · 건의사항을 숬서합니다."}
          </div>
          <Link href={subTab === "leave" ? "/leave" : "/board"}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-aqu-500 to-blue-600 text-white rounded-lg text-sm font-bold hover:opacity-90 shadow">
            → {subTab === "leave" ? "휴가·결재 페이지로 이동" : "사내 게시판으로 이동"}
          </Link>
        </div>
      )}
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
