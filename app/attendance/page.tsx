"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  ClipboardCheck, Home, Calendar, Check, X as XIcon,
  Clock, LogOut as EarlyLeave, RefreshCw, Users, TrendingUp
} from "lucide-react";

const STATUS_OPTIONS = [
  { value: "present",     label: "출석",  color: "bg-green-100 text-green-700 border-green-300",   icon: "✓" },
  { value: "absent",      label: "결석",  color: "bg-red-100 text-red-700 border-red-300",         icon: "✗" },
  { value: "late",        label: "지각",  color: "bg-yellow-100 text-yellow-700 border-yellow-300", icon: "⏰" },
  { value: "early_leave", label: "조퇴",  color: "bg-orange-100 text-orange-700 border-orange-300", icon: "⇤" },
  { value: "makeup",      label: "보강",  color: "bg-blue-100 text-blue-700 border-blue-300",       icon: "↻" },
];

function statusLabel(s: string) { return STATUS_OPTIONS.find(x => x.value === s)?.label || s; }
function statusColor(s: string) { return STATUS_OPTIONS.find(x => x.value === s)?.color || "bg-gray-100"; }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function AttendancePage() {
  const [members, setMembers]   = useState<any[]>([]);
  const [records, setRecords]   = useState<any[]>([]);
  const [date, setDate]         = useState(todayStr());
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState<string | null>(null);
  const [filter, setFilter]     = useState<"all" | "child" | "adult">("all");

  useEffect(() => { loadAll(); }, [date]);

  async function loadAll() {
    setLoading(true);
    const [mRes, aRes] = await Promise.all([
      supabase.from("members").select("id, name, member_type").is("deleted_at", null).order("name"),
      supabase.from("attendance").select("*").order("attend_date", { ascending: false }).limit(500),
    ]);
    setMembers(mRes.data || []);
    setRecords(aRes.data || []);
    setLoading(false);
  }

  async function markAttendance(memberId: string, status: string) {
    setSaving(memberId);
    const existing = records.find(r => r.member_id === memberId && r.attend_date === date);
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;

    if (existing) {
      const { error } = await supabase.from("attendance")
        .update({ status }).eq("id", existing.id);
      if (error) alert("실패: " + error.message);
    } else {
      const { error } = await supabase.from("attendance").insert({
        org_id: orgId, member_id: memberId, attend_date: date, status,
      });
      if (error) alert("실패: " + error.message);
    }
    await loadAll();
    setSaving(null);
  }

  async function clearAttendance(memberId: string) {
    const existing = records.find(r => r.member_id === memberId && r.attend_date === date);
    if (!existing) return;
    await supabase.from("attendance").delete().eq("id", existing.id);
    await loadAll();
  }

  const filteredMembers = members.filter(m => filter === "all" ? true : m.member_type === filter);

  // Today's stats
  const todayRecs = records.filter(r => r.attend_date === date);
  const stat = {
    total:   filteredMembers.length,
    present: todayRecs.filter(r => r.status === "present").length,
    absent:  todayRecs.filter(r => r.status === "absent").length,
    late:    todayRecs.filter(r => r.status === "late").length,
    early:   todayRecs.filter(r => r.status === "early_leave").length,
    makeup:  todayRecs.filter(r => r.status === "makeup").length,
  };

  // Per-member stats (last 30 days)
  const memberStats = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return filteredMembers.map(m => {
      const recs = records.filter(r => r.member_id === m.id && new Date(r.attend_date) >= cutoff);
      const present = recs.filter(r => r.status === "present").length;
      const absent  = recs.filter(r => r.status === "absent").length;
      const late    = recs.filter(r => r.status === "late").length;
      const total   = recs.length;
      const rate    = total > 0 ? Math.round((present / total) * 100) : 0;
      return { ...m, total, present, absent, late, rate };
    });
  }, [filteredMembers, records]);

  function todayStatus(memberId: string) {
    return records.find(r => r.member_id === memberId && r.attend_date === date)?.status;
  }

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2 md:gap-3">
          <Link href="/" className="text-aqu-600 hover:text-aqu-800 flex items-center gap-1 text-sm">
            <Home className="w-4 h-4" /> 홈
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 md:w-7 md:h-7 text-teal-500" /> 출결 관리
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
          <button onClick={() => setDate(todayStr())}
            className="px-3 py-2 bg-aqu-50 border border-aqu-200 text-aqu-700 rounded-lg text-xs md:text-sm hover:bg-aqu-100">
            오늘
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3 mb-6">
        <KPI title="전체" val={stat.total + "명"} color="text-aqu-700" />
        <KPI title="✓ 출석" val={stat.present + "명"} color="text-green-600" />
        <KPI title="✗ 결석" val={stat.absent + "명"} color="text-red-600" />
        <KPI title="⏰ 지각" val={stat.late + "명"}    color="text-yellow-600" />
        <KPI title="⇤ 조퇴" val={stat.early + "명"}   color="text-orange-600" />
        <KPI title="↻ 보강" val={stat.makeup + "명"}  color="text-blue-600" />
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4 text-xs md:text-sm">
        {[
          { k: "all",   label: "전체" },
          { k: "child", label: "아동" },
          { k: "adult", label: "성인" },
        ].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k as any)}
            className={`px-3 py-1.5 rounded-lg ${filter === f.k ? "bg-aqu-600 text-white" : "bg-white border border-aqu-200 text-aqu-700"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Attendance Grid */}
      {loading ? (
        <div className="text-center py-10 text-gray-500">로딩 중...</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
          {/* Mobile card view */}
          <div className="md:hidden divide-y divide-gray-100">
            {memberStats.map(m => {
              const cur = todayStatus(m.id);
              return (
                <div key={m.id} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <Link href={`/members/${m.id}`} className="font-medium text-aqu-800 hover:underline">{m.name}</Link>
                      <span className="ml-2 text-[10px] text-gray-500">
                        {m.member_type === "child" ? "아동" : "성인"} · 30일 출석률 {m.rate}%
                      </span>
                    </div>
                    {cur && (
                      <span className={`text-[10px] px-2 py-0.5 rounded border ${statusColor(cur)}`}>
                        {statusLabel(cur)}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {STATUS_OPTIONS.map(s => (
                      <button key={s.value} onClick={() => markAttendance(m.id, s.value)}
                        disabled={saving === m.id}
                        className={`text-[10px] py-1.5 rounded border transition ${cur === s.value ? s.color + " font-bold" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                        {s.icon} {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <table className="w-full text-sm hidden md:table">
            <thead className="bg-aqu-50 border-b border-aqu-100">
              <tr>
                <th className="p-3 text-left font-semibold text-aqu-800">회원</th>
                <th className="p-3 text-left font-semibold text-aqu-800">유형</th>
                <th className="p-3 text-center font-semibold text-aqu-800" colSpan={5}>{date} 출결</th>
                <th className="p-3 text-center font-semibold text-aqu-800">30일 출석률</th>
                <th className="p-3 text-center font-semibold text-aqu-800">지우기</th>
              </tr>
            </thead>
            <tbody>
              {memberStats.map(m => {
                const cur = todayStatus(m.id);
                return (
                  <tr key={m.id} className="border-b border-gray-100 hover:bg-aqu-50/30">
                    <td className="p-3">
                      <Link href={`/members/${m.id}`} className="text-aqu-700 hover:underline font-medium">
                        {m.name}
                      </Link>
                    </td>
                    <td className="p-3 text-gray-600">{m.member_type === "child" ? "아동" : "성인"}</td>
                    {STATUS_OPTIONS.map(s => (
                      <td key={s.value} className="p-1 text-center">
                        <button onClick={() => markAttendance(m.id, s.value)}
                          disabled={saving === m.id}
                          className={`text-xs px-2 py-1 rounded border transition ${cur === s.value ? s.color + " font-bold shadow-sm" : "bg-white border-gray-200 text-gray-400 hover:bg-gray-50"}`}>
                          {s.icon} {s.label}
                        </button>
                      </td>
                    ))}
                    <td className="p-3 text-center">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div className={`h-full rounded-full ${m.rate >= 80 ? "bg-green-500" : m.rate >= 50 ? "bg-yellow-500" : "bg-red-400"}`}
                               style={{ width: `${m.rate}%` }} />
                        </div>
                        <span className="text-xs font-bold text-gray-700 w-8">{m.rate}%</span>
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {m.present}/{m.total}회
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      {cur && (
                        <button onClick={() => clearAttendance(m.id)} className="text-xs text-red-400 hover:text-red-600">
                          <RefreshCw className="w-3 h-3 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function KPI({ title, val, color }: any) {
  return (
    <div className="bg-white p-2 md:p-3 rounded-xl shadow-sm border border-aqu-100 text-center">
      <div className="text-[10px] md:text-xs text-gray-500">{title}</div>
      <div className={`text-base md:text-xl font-bold ${color}`}>{val}</div>
    </div>
  );
}
