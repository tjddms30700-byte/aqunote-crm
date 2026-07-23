"use client";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { getActiveBranchId, useBranchWatch } from "@/lib/branchContext";
import KakaoMessageModal from "@/components/KakaoMessageModal";
import {
  BarChart3, Users, Calendar, CreditCard, MessageCircle,
  TrendingUp, TrendingDown, AlertCircle, Clock, DollarSign,
  UserCheck, UserX, Activity, Target, Sparkles
} from "lucide-react";

export default function DashboardPage() {
  const [data, setData] = useState<any>({
    members: [], payments: [], memberships: [], slots: [], attendance: [], staff: [],
  });
  const [loading, setLoading] = useState(true);
  const [msgTarget, setMsgTarget] = useState<{ member: any; membership: any } | null>(null);
  const [branch, setBranch] = useState<any>(null);

  useEffect(() => { loadAll(); }, []);
  useBranchWatch(() => { loadAll(); loadBranch(); });

  async function loadBranch() {
    const bid = getActiveBranchId();
    if (!bid) { setBranch(null); return; }
    const { data: b } = await supabase.from("branches").select("*").eq("id", bid).maybeSingle();
    setBranch(b);
  }

  useEffect(() => { loadBranch(); }, []);

  async function loadAll() {
    setLoading(true);
    const branchId = getActiveBranchId();
    const safeQ = async (baseFn: () => any, filterFn: (q: any) => any) => {
      if (!branchId) return await baseFn();
      const r = await filterFn(baseFn());
      if (r.error && (r.error.code === "42703" || r.error.message?.includes("branch_id"))) return await baseFn();
      return r;
    };
    const [m, p, ms, sl, at, st] = await Promise.all([
      safeQ(
        () => supabase.from("members").select("*").is("deleted_at", null),
        (q: any) => q.eq("branch_id", branchId).is("deleted_at", null)
      ),
      safeQ(
        () => supabase.from("payments").select("*").order("paid_at", { ascending: false }),
        (q: any) => q.eq("branch_id", branchId).order("paid_at", { ascending: false })
      ),
      supabase.from("memberships").select("*"),
      safeQ(
        () => supabase.from("schedule_slots").select("*"),
        (q: any) => q.eq("branch_id", branchId)
      ),
      supabase.from("attendance").select("*"),
      safeQ(
        () => supabase.from("staff").select("*").is("deleted_at", null),
        (q: any) => q.eq("branch_id", branchId).is("deleted_at", null)
      ),
    ]);
    setData({
      members: m.data || [],
      payments: p.data || [],
      memberships: ms.data || [],
      slots: sl.data || [],
      attendance: at.data || [],
      staff: st.data || [],
    });
    setLoading(false);
  }

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const today = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    const regularMembers = data.members.filter((m: any) => m.status === "regular").length;
    const waitingMembers = data.members.filter((m: any) => m.status === "waiting").length;
    const trialMembers = data.members.filter((m: any) => m.status === "trial_scheduled" || m.status === "trial_done").length;
    const childMembers = data.members.filter((m: any) => m.member_type === "child").length;
    const adultMembers = data.members.filter((m: any) => m.member_type === "adult").length;

    const monthlyRevenue = data.payments
      .filter((p: any) => {
        const d = new Date(p.paid_at);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      })
      .reduce((s: number, p: any) => s + (p.amount || 0), 0);

    const lastMonthRevenue = data.payments
      .filter((p: any) => {
        const d = new Date(p.paid_at);
        const lm = thisMonth === 0 ? 11 : thisMonth - 1;
        const ly = thisMonth === 0 ? thisYear - 1 : thisYear;
        return d.getMonth() === lm && d.getFullYear() === ly;
      })
      .reduce((s: number, p: any) => s + (p.amount || 0), 0);

    const revenueGrowth = lastMonthRevenue > 0
      ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(1)
      : "0";

    const newLeadsThisWeek = data.members.filter((m: any) => {
      const d = new Date(m.created_at);
      return d >= weekAgo;
    }).length;

    // 곧 결제 예정자 (잔여 2회 이하 or 만료 7일 이내)
    // ✅ v3.12: 잔여 3회 이하로 확대 + 필드명 호환 (total_sessions/sessions_total 둘 다 지원)
    const paymentDueMembers = data.memberships
      .filter((ms: any) => ms.status !== "cancelled")
      .map((ms: any) => {
        const memb = data.members.find((m: any) => m.id === ms.member_id);
        if (!memb) return null;
        const total = ms.total_sessions ?? ms.sessions_total ?? 0;
        const used  = ms.used_sessions  ?? ms.sessions_used  ?? 0;
        const remaining = Math.max(0, total - used);
        const daysToExpire = ms.end_date
          ? Math.floor((new Date(ms.end_date).getTime() - now.getTime()) / 86400000)
          : null;
        const urgent = remaining <= 3 || (daysToExpire !== null && daysToExpire <= 7 && daysToExpire >= 0);
        if (!urgent || remaining <= 0) return null;
        return { member: memb, membership: ms, remaining, daysToExpire };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.remaining - b.remaining)
      .slice(0, 12);

    // 오늘 수업
    const todaySlots = data.slots.filter((s: any) => s.event_date === today);
    const todayAttendance = data.attendance.filter((a: any) => a.date === today);
    const todayPresent = todayAttendance.filter((a: any) => a.status === "present").length;
    const todayAbsent = todayAttendance.filter((a: any) => a.status === "absent" || a.status === "sick").length;

    return {
      totalMembers: data.members.length,
      regularMembers, waitingMembers, trialMembers, childMembers, adultMembers,
      monthlyRevenue, lastMonthRevenue, revenueGrowth,
      newLeadsThisWeek, paymentDueMembers,
      todaySlots: todaySlots.length, todayPresent, todayAbsent,
      totalStaff: data.staff.length,
    };
  }, [data]);

  // 월별 매출 (최근 6개월)
  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const arr = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = `${d.getMonth() + 1}월`;
      const rev = data.payments
        .filter((p: any) => {
          const pd = new Date(p.paid_at);
          return pd.getMonth() === d.getMonth() && pd.getFullYear() === d.getFullYear();
        })
        .reduce((s: number, p: any) => s + (p.amount || 0), 0);
      arr.push({ label, rev });
    }
    const max = Math.max(...arr.map(a => a.rev), 1);
    return arr.map(a => ({ ...a, pct: (a.rev / max) * 100 }));
  }, [data.payments]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-aqu-50">로딩 중...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-aqu-50 to-white p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-aqu-600 to-cyan-600 bg-clip-text text-transparent">
            📊 통합 대시보드
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
          </p>
        </div>
        <HomeButton />
      </div>

      {/* 최상단 4개 핵심 KPI */}
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <BigKPI
          icon={<DollarSign className="w-6 h-6" />}
          label="이번 달 매출"
          value={`₩${stats.monthlyRevenue.toLocaleString()}`}
          sub={`전월 대비 ${Number(stats.revenueGrowth) >= 0 ? "▲" : "▼"} ${Math.abs(Number(stats.revenueGrowth))}%`}
          subColor={Number(stats.revenueGrowth) >= 0 ? "text-emerald-100" : "text-red-100"}
          gradient="from-emerald-500 to-teal-500"
          href="/dashboard/revenue"
        />
        <BigKPI
          icon={<Users className="w-6 h-6" />}
          label="정규 회원"
          value={`${stats.regularMembers}명`}
          sub={`전체 ${stats.totalMembers}명 · 아동 ${stats.childMembers} / 성인 ${stats.adultMembers}`}
          subColor="text-purple-100"
          gradient="from-purple-500 to-pink-500"
          href="/members"
        />
        <BigKPI
          icon={<MessageCircle className="w-6 h-6" />}
          label="대기자"
          value={`${stats.waitingMembers}명`}
          sub={`이번 주 신규 ${stats.newLeadsThisWeek}건`}
          subColor="text-amber-100"
          gradient="from-amber-500 to-orange-500"
          href="/consultations"
        />
        <BigKPI
          icon={<Calendar className="w-6 h-6" />}
          label="오늘 수업"
          value={`${stats.todaySlots}건`}
          sub={`출석 ${stats.todayPresent} · 결석 ${stats.todayAbsent}`}
          subColor="text-blue-100"
          gradient="from-blue-500 to-cyan-500"
          href="/schedule"
        />
      </div>

      {/* 2단 레이아웃 */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* 월별 매출 트렌드 */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-aqu-100 p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-aqu-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" /> 최근 6개월 매출 트렌드
            </h2>
            <Link href="/dashboard/revenue" className="text-xs text-aqu-600 hover:underline">자세히 →</Link>
          </div>
          <div className="flex items-end gap-3 h-40">
            {monthlyTrend.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center">
                <div className="text-[10px] text-gray-500 mb-1">{(m.rev / 10000).toFixed(0)}만</div>
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-emerald-400 to-teal-400 relative group cursor-pointer"
                  style={{ height: `${m.pct}%`, minHeight: m.rev > 0 ? "8px" : "2px" }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    ₩{m.rev.toLocaleString()}
                  </div>
                </div>
                <div className="text-xs text-gray-600 mt-1">{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 오늘의 요약 */}
        <div className="bg-gradient-to-br from-aqu-500 to-cyan-500 rounded-xl p-5 text-white">
          <h2 className="font-bold flex items-center gap-2 mb-3">
            <Activity className="w-5 h-5" /> 오늘의 현황
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm opacity-90">예약된 수업</span>
              <span className="text-2xl font-bold">{stats.todaySlots}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm opacity-90 flex items-center gap-1"><UserCheck className="w-4 h-4" /> 출석</span>
              <span className="text-2xl font-bold">{stats.todayPresent}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm opacity-90 flex items-center gap-1"><UserX className="w-4 h-4" /> 결석/병결</span>
              <span className="text-2xl font-bold">{stats.todayAbsent}</span>
            </div>
            <div className="pt-3 border-t border-white/20 flex justify-between items-center">
              <span className="text-sm opacity-90">근무 직원</span>
              <span className="text-xl font-bold">{stats.totalStaff}명</span>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Link href="/attendance" className="flex-1 bg-white/20 hover:bg-white/30 rounded-lg py-2 text-center text-xs font-medium">
              출결 관리
            </Link>
            <Link href="/schedule" className="flex-1 bg-white/20 hover:bg-white/30 rounded-lg py-2 text-center text-xs font-medium">
              시간표
            </Link>
          </div>
        </div>
      </div>

      {/* 곧 결제 예정자 */}
      <div className="max-w-7xl mx-auto bg-white rounded-xl border border-orange-200 p-5 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-orange-900 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            🔥 곧 결제/재등록 예정자
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{stats.paymentDueMembers.length}명</span>
          </h2>
          <Link href="/payments" className="text-xs text-orange-600 hover:underline">전체 결제 →</Link>
        </div>
        {stats.paymentDueMembers.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">🎉 곧 결제 예정자가 없습니다</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.paymentDueMembers.map((p: any) => (
              <div key={p.membership.id}
                className="border border-orange-100 rounded-lg p-3 hover:border-orange-400 hover:shadow-md transition-all bg-orange-50/30">
                <Link href={`/members/${p.member.id}`} className="block">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-aqu-900 text-sm">{p.member.name}</span>
                    <span className="text-[10px] text-gray-500">{p.member.member_type === "child" ? "🧒" : "👤"}</span>
                  </div>
                  <div className="text-xs text-gray-600 space-y-0.5">
                    <div>💧 잔여: <strong className="text-orange-600">{p.remaining}회</strong></div>
                    {p.daysToExpire !== null && p.daysToExpire >= 0 && (
                      <div>📅 만료: <strong className={p.daysToExpire <= 3 ? "text-red-600" : "text-orange-600"}>D-{p.daysToExpire}</strong></div>
                    )}
                  </div>
                  {(p.remaining <= 1 || (p.daysToExpire !== null && p.daysToExpire <= 3)) && (
                    <div className="mt-2 text-[10px] bg-red-500 text-white rounded px-2 py-0.5 inline-block">🚨 긴급</div>
                  )}
                </Link>
                {/* ✅ v3.12: 카카오 메시지 버튼 */}
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMsgTarget({ member: p.member, membership: p.membership }); }}
                  className="mt-2 w-full text-[10px] px-2 py-1 rounded bg-gradient-to-br from-yellow-400 to-amber-500 text-white font-semibold hover:opacity-90 shadow-sm"
                  title="카카오 메시지 생성">
                  💬 메시지 생성
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ✅ v3.12: 카카오 메시지 모달 */}
        {msgTarget && (
          <KakaoMessageModal
            open={true}
            onClose={() => setMsgTarget(null)}
            member={msgTarget.member}
            membership={msgTarget.membership}
            branchName={branch?.name}
            centerPhone={branch?.phone}
          />
        )}
      </div>

      {/* 회원 유입 & 구성 */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-aqu-100 p-5">
          <h3 className="text-sm font-medium text-gray-600 mb-3">👥 회원 상태 분포</h3>
          <div className="space-y-2">
            <MiniBar label="정규 회원" val={stats.regularMembers} total={stats.totalMembers} color="bg-emerald-500" />
            <MiniBar label="체험 예정/완료" val={stats.trialMembers} total={stats.totalMembers} color="bg-blue-500" />
            <MiniBar label="대기중" val={stats.waitingMembers} total={stats.totalMembers} color="bg-amber-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-aqu-100 p-5">
          <h3 className="text-sm font-medium text-gray-600 mb-3">🎯 아동 vs 성인</h3>
          <div className="flex items-center justify-around h-32">
            <PieRing label="아동" val={stats.childMembers} total={stats.totalMembers} color="#a855f7" />
            <PieRing label="성인" val={stats.adultMembers} total={stats.totalMembers} color="#0ea5e9" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-aqu-100 p-5">
          <h3 className="text-sm font-medium text-gray-600 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" /> 빠른 이동
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <QuickLink href="/members" label="회원 관리" icon="👥" />
            <QuickLink href="/consultations" label="상담 리드" icon="💬" />
            <QuickLink href="/payments" label="결제 관리" icon="💰" />
            <QuickLink href="/schedule" label="시간표" icon="📅" />
            <QuickLink href="/attendance" label="출결" icon="✅" />
            <QuickLink href="/reports" label="보고서" icon="📄" />
          </div>
        </div>
      </div>
    </div>
  );
}

function BigKPI({ icon, label, value, sub, subColor, gradient, href }: any) {
  return (
    <Link href={href} className={`bg-gradient-to-br ${gradient} rounded-xl p-5 text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all`}>
      <div className="flex justify-between items-start mb-2">
        <div className="opacity-90">{icon}</div>
      </div>
      <div className="text-xs opacity-90">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className={`text-[11px] mt-1 ${subColor}`}>{sub}</div>}
    </Link>
  );
}

function MiniBar({ label, val, total, color }: any) {
  const pct = total > 0 ? (val / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{val}명 ({pct.toFixed(0)}%)</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={color} style={{ width: `${pct}%`, height: "100%" }}></div>
      </div>
    </div>
  );
}

function PieRing({ label, val, total, color }: any) {
  const pct = total > 0 ? (val / total) * 100 : 0;
  const circ = 2 * Math.PI * 26;
  return (
    <div className="text-center">
      <svg width="90" height="90" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r="26" fill="none" stroke="#f3f4f6" strokeWidth="6" />
        <circle cx="30" cy="30" r="26" fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
          transform="rotate(-90 30 30)" strokeLinecap="round" />
        <text x="30" y="34" textAnchor="middle" fontSize="11" fill="#111" fontWeight="600">{val}</text>
      </svg>
      <div className="text-xs text-gray-600 mt-1">{label} ({pct.toFixed(0)}%)</div>
    </div>
  );
}

function QuickLink({ href, label, icon }: any) {
  return (
    <Link href={href} className="p-2 border border-gray-200 rounded-lg hover:border-aqu-400 hover:bg-aqu-50 text-center text-xs">
      <div className="text-lg">{icon}</div>
      <div className="mt-1">{label}</div>
    </Link>
  );
}
