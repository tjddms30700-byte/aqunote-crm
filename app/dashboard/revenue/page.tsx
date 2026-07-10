"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  DollarSign, TrendingUp, Calendar, Home, Users,
  BarChart3, ArrowUpRight, ArrowDownRight
} from "lucide-react";

type Payment = {
  id: string;
  member_id: string;
  amount: number;
  paid_at: string | null;
  created_at: string;
  plan_name?: string;
};

type Slot = {
  id: string;
  event_type: string;
  amount: number;
  day_of_week: number;
  time_slot: string;
  member_id?: string;
  created_at: string;
};

function fmtKRW(n: number) {
  return "₩" + (n || 0).toLocaleString();
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function weekKey(d: Date) {
  const first = new Date(d.getFullYear(), 0, 1);
  const diff = Math.floor((d.getTime() - first.getTime()) / 86400000);
  const wk = Math.ceil((diff + first.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(wk).padStart(2, "0")}`;
}

export default function RevenueDashboardPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [slots, setSlots]       = useState<Slot[]>([]);
  const [members, setMembers]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [period, setPeriod]     = useState<"month" | "week">("month");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [payRes, slotRes, memRes] = await Promise.all([
        supabase.from("payments").select("*").order("created_at", { ascending: false }),
        supabase.from("schedule_slots").select("*").eq("event_type", "revenue"),
        supabase.from("members").select("id, name, member_type").is("deleted_at", null),
      ]);
      setPayments(payRes.data || []);
      setSlots(slotRes.data || []);
      setMembers(memRes.data || []);
      setLoading(false);
    })();
  }, []);

  // Combine payments + revenue slots into a unified revenue array
  const revenues = useMemo(() => {
    const paymentRevs = payments.map(p => ({
      id: p.id,
      source: "payment" as const,
      amount: p.amount || 0,
      date: p.paid_at || p.created_at,
      member_id: p.member_id,
      label: p.plan_name || "결제",
    }));
    const slotRevs = slots.map(s => ({
      id: s.id,
      source: "schedule" as const,
      amount: s.amount || 0,
      date: s.created_at,
      member_id: s.member_id,
      label: "시간표 매출",
    }));
    return [...paymentRevs, ...slotRevs].sort((a, b) => (b.date > a.date ? 1 : -1));
  }, [payments, slots]);

  // Aggregations
  const now = new Date();
  const thisMonth = monthKey(now);
  const lastMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const thisWeek  = weekKey(now);

  const totalRev     = revenues.reduce((s, r) => s + r.amount, 0);
  const monthRev     = revenues.filter(r => monthKey(new Date(r.date)) === thisMonth).reduce((s, r) => s + r.amount, 0);
  const lastMonthRev = revenues.filter(r => monthKey(new Date(r.date)) === lastMonth).reduce((s, r) => s + r.amount, 0);
  const weekRev      = revenues.filter(r => weekKey(new Date(r.date)) === thisWeek).reduce((s, r) => s + r.amount, 0);

  const growth = lastMonthRev > 0 ? ((monthRev - lastMonthRev) / lastMonthRev) * 100 : 0;

  // Group by period for chart
  const grouped = useMemo(() => {
    const map: Record<string, number> = {};
    revenues.forEach(r => {
      const d = new Date(r.date);
      const key = period === "month" ? monthKey(d) : weekKey(d);
      map[key] = (map[key] || 0) + r.amount;
    });
    return Object.entries(map)
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .slice(-12);
  }, [revenues, period]);

  const maxGroup = Math.max(...grouped.map(g => g[1]), 1);

  // Per-member payment status
  const memberStats = useMemo(() => {
    const map: Record<string, { total: number; count: number; last?: string }> = {};
    revenues.forEach(r => {
      if (!r.member_id) return;
      if (!map[r.member_id]) map[r.member_id] = { total: 0, count: 0 };
      map[r.member_id].total += r.amount;
      map[r.member_id].count += 1;
      if (!map[r.member_id].last || r.date > map[r.member_id].last!) map[r.member_id].last = r.date;
    });
    return Object.entries(map)
      .map(([mid, v]) => {
        const m = members.find(x => x.id === mid);
        return {
          id: mid,
          name: m?.name || "알 수 없음",
          type: m?.member_type,
          total: v.total,
          count: v.count,
          last: v.last,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [revenues, members]);

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2 md:gap-3">
          <Link href="/" className="text-aqu-600 hover:text-aqu-800 flex items-center gap-1 text-sm">
            <Home className="w-4 h-4" /> 홈
          </Link>
          <span className="text-gray-300">/</span>
          <Link href="/dashboard" className="text-aqu-600 hover:text-aqu-800 text-sm">대시보드</Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 md:w-7 md:h-7 text-pink-500" /> 매출 통계
          </h1>
        </div>
        <div className="flex gap-1 bg-white border border-aqu-100 rounded-lg p-1 text-xs md:text-sm">
          <button onClick={() => setPeriod("month")}
            className={`px-3 py-1.5 rounded ${period === "month" ? "bg-aqu-600 text-white" : "text-gray-600"}`}>
            월별
          </button>
          <button onClick={() => setPeriod("week")}
            className={`px-3 py-1.5 rounded ${period === "week" ? "bg-aqu-600 text-white" : "text-gray-600"}`}>
            주별
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">로딩 중...</div>
      ) : (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KPI icon={DollarSign} title="전체 매출" val={fmtKRW(totalRev)}    color="text-aqu-600" />
            <KPI icon={Calendar}   title="이번 달"  val={fmtKRW(monthRev)}    color="text-blue-600"
                 sub={<GrowthBadge pct={growth} />} />
            <KPI icon={Calendar}   title="이번 주"  val={fmtKRW(weekRev)}     color="text-purple-600" />
            <KPI icon={Users}      title="유료 회원" val={memberStats.length + "명"} color="text-pink-600" />
          </div>

          {/* Chart */}
          <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-4 md:p-6 mb-6">
            <h2 className="text-sm md:text-base font-bold text-aqu-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 md:w-5 md:h-5" />
              {period === "month" ? "월별 매출 추이" : "주별 매출 추이"} (최근 12{period === "month" ? "개월" : "주"})
            </h2>
            {grouped.length === 0 ? (
              <div className="text-center py-8 text-gray-400">데이터가 없습니다</div>
            ) : (
              <div className="space-y-2">
                {grouped.map(([key, amt]) => (
                  <div key={key} className="flex items-center gap-2 md:gap-3">
                    <div className="text-[10px] md:text-xs text-gray-500 w-16 md:w-20 shrink-0 font-mono">
                      {key.replace("-W", " W")}
                    </div>
                    <div className="flex-1 bg-gray-100 rounded-full h-6 md:h-8 relative overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-aqu-400 to-aqu-600 rounded-full transition-all"
                           style={{ width: `${(amt / maxGroup) * 100}%` }} />
                      <span className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 text-[10px] md:text-xs font-bold text-gray-800">
                        {fmtKRW(amt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Per-member payment status */}
          <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-4 md:p-6">
            <h2 className="text-sm md:text-base font-bold text-aqu-900 mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 md:w-5 md:h-5" /> 회원별 결제 현황
            </h2>
            {memberStats.length === 0 ? (
              <div className="text-center py-8 text-gray-400">결제 기록이 없습니다</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs md:text-sm">
                  <thead className="bg-aqu-50 border-b border-aqu-100">
                    <tr>
                      <th className="p-2 md:p-3 text-left font-semibold text-aqu-800">회원</th>
                      <th className="p-2 md:p-3 text-left font-semibold text-aqu-800 hidden sm:table-cell">유형</th>
                      <th className="p-2 md:p-3 text-right font-semibold text-aqu-800">누적</th>
                      <th className="p-2 md:p-3 text-center font-semibold text-aqu-800 hidden md:table-cell">건수</th>
                      <th className="p-2 md:p-3 text-left font-semibold text-aqu-800 hidden md:table-cell">최근결제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberStats.slice(0, 30).map(m => (
                      <tr key={m.id} className="border-b border-gray-100 hover:bg-aqu-50/30">
                        <td className="p-2 md:p-3">
                          <Link href={`/members/${m.id}`} className="text-aqu-700 hover:underline font-medium">
                            {m.name}
                          </Link>
                        </td>
                        <td className="p-2 md:p-3 text-gray-600 hidden sm:table-cell">
                          {m.type === "child" ? "아동" : "성인"}
                        </td>
                        <td className="p-2 md:p-3 text-right font-bold text-aqu-900">{fmtKRW(m.total)}</td>
                        <td className="p-2 md:p-3 text-center text-gray-600 hidden md:table-cell">{m.count}</td>
                        <td className="p-2 md:p-3 text-gray-500 text-[11px] hidden md:table-cell">
                          {m.last ? new Date(m.last).toLocaleDateString() : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {memberStats.length > 30 && (
                  <div className="text-center text-xs text-gray-400 mt-3">
                    상위 30명 표시 · 전체 {memberStats.length}명
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function KPI({ icon: Icon, title, val, color, sub }: any) {
  return (
    <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-aqu-100">
      <Icon className={`w-4 h-4 md:w-5 md:h-5 mb-1 ${color}`} />
      <div className="text-[10px] md:text-xs text-gray-500">{title}</div>
      <div className="text-sm md:text-xl font-bold text-aqu-900 truncate">{val}</div>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

function GrowthBadge({ pct }: { pct: number }) {
  if (!isFinite(pct) || pct === 0) return <span className="text-[10px] text-gray-400">전월 대비 -</span>;
  const positive = pct >= 0;
  return (
    <span className={`text-[10px] flex items-center gap-0.5 ${positive ? "text-green-600" : "text-red-500"}`}>
      {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(pct).toFixed(1)}% 전월대비
    </span>
  );
}
