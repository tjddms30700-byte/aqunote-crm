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

    // 곧 결제 예정자 (잔여 3회 이하 or 만료 7일 이내)
    // ✅ v3.66.1: ① 체험/대기/종결/비활성 회원 제외 — 정규 등록 진행중만 표시
    //             ② 회원별 잔여 최대 회원권 기준 — 오늘 재결제로 새 회원권이 생긴 회원의 옛날 소진 회원권은 숨김
    const activeMemberships = (data.memberships || []).filter((ms: any) => ms.status !== "cancelled" && !ms.deleted_at);
    const isOngoingMember = (m: any) => {
      const s = `${m?.status || ""} ${m?.member_status || ""} ${m?.type || ""}`.toLowerCase();
      if (/trial|체험|wait|대기|종결|종료|ended|closed|close|inactive|resigned|withdraw|탈퇴/.test(s)) return false; // ✅ v3.68.0: closed 추가 (실제 DB 종결 상태값)
      if (m?.deleted_at) return false;
      return true;
    };
    const maxRemainingByMember: Record<string, number> = {};
    activeMemberships.forEach((ms: any) => {
      const total = ms.total_sessions ?? ms.sessions_total ?? 0;
      const used  = ms.used_sessions  ?? ms.sessions_used  ?? 0;
      const rem = Math.max(0, total - used);
      if (!(ms.member_id in maxRemainingByMember) || rem > maxRemainingByMember[ms.member_id]) maxRemainingByMember[ms.member_id] = rem;
    });
    const paymentDueMembers = activeMemberships
      .map((ms: any) => {
        const memb = data.members.find((m: any) => m.id === ms.member_id);
        if (!memb || !isOngoingMember(memb)) return null;
        const total = ms.total_sessions ?? ms.sessions_total ?? 0;
        const used  = ms.used_sessions  ?? ms.sessions_used  ?? 0;
        const remaining = Math.max(0, total - used);
        // ✅ v3.66.1: 같은 회원에게 잔여가 더 많은 (새로 결제된) 회원권이 있으면 이 낡은 회원권은 제외
        if ((maxRemainingByMember[ms.member_id] ?? remaining) > remaining) return null;
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

    // ✅ v3.67.0: 잔여 2회 회원의 "마지막 수업 종료 후" 결제 안내 알림 대상
    // - 잔여 정확히 2회인 정규 진행 회원만 (체험/대기/종결 제외 — 위 paymentDueMembers 필터와 동일 기준)
    // - 그 회원의 가장 최근 수업 슬롯이 (오늘 이전이거나 / 오늘인데 status가 done/attended) 이면 → 수업 끝난 것으로 판단
    const paymentAlertMembers = activeMemberships
      .map((ms: any) => {
        const memb = data.members.find((m: any) => m.id === ms.member_id);
        if (!memb || !isOngoingMember(memb)) return null;
        const total = ms.total_sessions ?? ms.sessions_total ?? 0;
        const used  = ms.used_sessions  ?? ms.sessions_used  ?? 0;
        const remaining = Math.max(0, total - used);
        if (remaining < 1 || remaining > 2) return null; // ✅ v3.68.0: 잔여 1~2회로 확대
        if ((maxRemainingByMember[ms.member_id] ?? remaining) > remaining) return null; // 최신 회원권만
        // 회원의 슬롯 중 가장 최근 것
        const memberSlots = (data.slots || [])
          .filter((s: any) => s.member_id === ms.member_id && !s.deleted_at && s.status !== "cancelled")
          .sort((a: any, b: any) => String(b.event_date || "").localeCompare(String(a.event_date || "")));
        // ✅ v3.68.0: 미래 예약 슬롯이 있어도 '가장 최근의 지난/오늘 수업' 기준으로 판단 (다음 수업이 예약되어 있어도 알림 뜨게)
        const pastSlots = memberSlots.filter((s: any) => String(s.event_date || "").substring(0, 10) <= today);
        const last = pastSlots[0];
        if (!last || !last.event_date) return null;
        const lastDate = String(last.event_date).substring(0, 10);
        const lastDone = lastDate < today || (lastDate === today && ["done", "attended", "present", "completed"].includes(String(last.status || "").toLowerCase()));
        // ✅ v3.67.2: 회원의 반복 요일(예: 월/수) 추출 — 안내 문구에 "매주 월요일·수요일" 포함
        const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
        const memberDays = Array.from(new Set(
          memberSlots
            .map((s: any) => {
              const d = s.event_date ? new Date(String(s.event_date).substring(0, 10)) : null;
              return d && !isNaN(d.getTime()) ? d.getDay() : null;
            })
            .filter((d: any) => d !== null)
        )).sort((a: any, b: any) => a - b) as number[];
        if (!lastDone) return null;
        // 너무 오래된(2주 전 이전) 마지막 수업이면 이미 종결 처리된 것으로 간주 → 제외
        const diffDays = Math.floor((now.getTime() - new Date(lastDate).getTime()) / 86400000);
        if (diffDays > 14) return null;
        return { member: memb, membership: ms, remaining, lastDate, memberDays }; // ✅ v3.67.2: memberDays 포함 (원본 패치 누락 보완)
      })
      .filter(Boolean)
      .sort((a: any, b: any) => String(a.lastDate).localeCompare(String(b.lastDate)));

    // 오늘 수업
    const todaySlots = data.slots.filter((s: any) => s.event_date === today);
    const todayAttendance = data.attendance.filter((a: any) => a.date === today);
    const todayPresent = todayAttendance.filter((a: any) => a.status === "present").length;
    const todayAbsent = todayAttendance.filter((a: any) => a.status === "absent" || a.status === "sick").length;

    // ✨ v3.34.2: 근무 직원 카운트 버그 수정 - 퇴사자 제외
    const activeStaff = (data.staff || []).filter((s: any) => {
      if (s.is_resigned === true) return false;
      if (s.deleted_at) return false;
      if (s.status && ["resigned", "inactive", "terminated"].includes(String(s.status).toLowerCase())) return false;
      if (s.is_active === false) return false;
      if (s.resign_date && new Date(s.resign_date) <= new Date()) return false;
      return true;
    });

    return {
      totalMembers: data.members.length,
      regularMembers, waitingMembers, trialMembers, childMembers, adultMembers,
      monthlyRevenue, lastMonthRevenue, revenueGrowth,
      newLeadsThisWeek, paymentDueMembers, paymentAlertMembers,
      todaySlots: todaySlots.length, todayPresent, todayAbsent,
      totalStaff: activeStaff.length, // ✨ v3.34.2: 퇴사자 제외된 재직 만 카운트
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
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-6">
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

      {/* ✨ v3.34.2: 최상단 4개 핵심 KPI - 라이트 모드 */}
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <BigKPI
          icon={<DollarSign className="w-5 h-5" />}
          label="이번 달 매출"
          value={`₩${stats.monthlyRevenue.toLocaleString()}`}
          sub={`전월 대비 ${Number(stats.revenueGrowth) >= 0 ? "▲" : "▼"} ${Math.abs(Number(stats.revenueGrowth))}%`}
          accent={{ iconBg: "bg-emerald-50", iconColor: "text-emerald-600", subText: Number(stats.revenueGrowth) >= 0 ? "text-emerald-600" : "text-rose-600" }}
          href="/dashboard/revenue"
        />
        <BigKPI
          icon={<Users className="w-5 h-5" />}
          label="정규 회원"
          value={`${stats.regularMembers}명`}
          sub={`전체 ${stats.totalMembers}명 · 아동 ${stats.childMembers} / 성인 ${stats.adultMembers}`}
          accent={{ iconBg: "bg-violet-50", iconColor: "text-violet-600", subText: "text-slate-500" }}
          href="/members"
        />
        <BigKPI
          icon={<MessageCircle className="w-5 h-5" />}
          label="대기자"
          value={`${stats.waitingMembers}명`}
          sub={`이번 주 신규 ${stats.newLeadsThisWeek}건`}
          accent={{ iconBg: "bg-amber-50", iconColor: "text-amber-600", subText: "text-amber-600" }}
          href="/consultations"
        />
        <BigKPI
          icon={<Calendar className="w-5 h-5" />}
          label="오늘 수업"
          value={`${stats.todaySlots}건`}
          sub={`출석 ${stats.todayPresent} · 결석 ${stats.todayAbsent}`}
          accent={{ iconBg: "bg-sky-50", iconColor: "text-sky-600", subText: "text-sky-600" }}
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

        {/* ✨ v3.34.2: 오늘의 현황 - 라이트 모드 (흰색 카드 + 파스텔 포인트) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <div className="bg-sky-50 text-sky-600 p-1.5 rounded-lg">
              <Activity className="w-4 h-4" />
            </div>
            오늘의 현황
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-1">
              <span className="text-sm text-slate-600 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> 예약된 수업
              </span>
              <span className="text-2xl font-extrabold text-sky-600">{stats.todaySlots}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-sm text-slate-600 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-500" /> 출석
              </span>
              <span className="text-2xl font-extrabold text-emerald-600">{stats.todayPresent}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-sm text-slate-600 flex items-center gap-1.5">
                <UserX className="w-3.5 h-3.5 text-rose-500" /> 결석/병결
              </span>
              <span className="text-2xl font-extrabold text-rose-600">{stats.todayAbsent}</span>
            </div>
            <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
              <span className="text-sm text-slate-600 font-medium">근무 직원</span>
              <span className="text-xl font-bold text-slate-700 bg-slate-50 px-3 py-0.5 rounded-full border border-slate-200">{stats.totalStaff}명</span>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <Link href="/attendance"
              className="flex-1 bg-gradient-to-r from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 border border-emerald-200 text-emerald-700 rounded-xl py-2 text-center text-xs font-semibold transition-all hover:shadow-sm">
              ✅ 출결 관리
            </Link>
            <Link href="/schedule"
              className="flex-1 bg-gradient-to-r from-sky-50 to-cyan-50 hover:from-sky-100 hover:to-cyan-100 border border-sky-200 text-sky-700 rounded-xl py-2 text-center text-xs font-semibold transition-all hover:shadow-sm">
              🗓️ 시간표
            </Link>
          </div>
        </div>
      </div>

      {/* ✅ v3.67.0: 잔여 2회 · 마지막 수업 완료 — 결제 안내 복사 섹션 */}
      {stats.paymentAlertMembers.length > 0 && (
        <div className="max-w-7xl mx-auto bg-white rounded-xl border border-rose-200 p-5 mb-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold text-rose-900 flex items-center gap-2">
              🔔 재결제 안내 보낼 회원 (잔여 2회 · 지난 수업 완료)
              <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">{stats.paymentAlertMembers.length}명</span>
            </h2>
          </div>
          <p className="text-[11px] text-gray-500 mb-3">마지막 수업이 끝난 회원입니다. "📋 안내 문구 복사"를 눌러 카카오톡 등에 붙여넣기 하세요.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.paymentAlertMembers.map((p: any) => {
              // ✅ v3.67.1: 알림톡 문구 템플릿 개선 + 지상재활(ground) 트랙 센터명 자동 분기
              const isGroundTrack = String(p.membership.track || p.membership.category || "aqua").toLowerCase() === "ground";
              const centerName = isGroundTrack ? "위례아쿠 리커버리케어존(지상재활)" : "위례아쿠수중운동센터";
              const guardianName = p.member.guardian_name || p.member.name;
              // ✅ v3.67.2: 수업 요일 포맷 (예: [1,3] → "매주 월요일·수요일")
              const dayNames2 = ["일", "월", "화", "수", "목", "금", "토"];
              const daysTxt = (p.memberDays && p.memberDays.length > 0)
                ? "매주 " + p.memberDays.map((d: number) => dayNames2[d] + "요일").join("·")
                : "기존 예약 요일";
              const msg = `안녕하세요, ${guardianName} 보호자님 🙂\n${centerName}입니다.\n\n우리 ${p.member.name} 회원님의 소중한 운동 시간이 차곡차곡 쌓여, 현재 등록된 회원권이 잔여 2회 남았습니다.\n(${p.lastDate} 수업 완료 기준)\n\n회원님의 운동 루틴과 ${daysTxt} 수업 시간대가 끊김 없이 유지될 수 있도록 재등록 일정을 미리 안내해 드립니다.\n\n다음 회차 수업 일정 유지 및 재등록 관련하여 편하신 때에 데스크 또는 카카오톡으로 말씀해 주시면 안내 도와드리겠습니다.\n\n늘 함께해 주셔서 감사드립니다. 🩵\n— ${centerName} 드림`;
              return (
                <div key={p.membership.id} className="border border-rose-100 rounded-lg p-3 bg-rose-50/40">
                  <div className="flex justify-between items-center mb-1">
                    <Link href={`/members/${p.member.id}`} className="font-medium text-aqu-900 text-sm hover:underline">{p.member.name}</Link>
                    <span className="text-[10px] text-gray-500">{p.member.member_type === "child" ? "🧒" : "👤"} 잔여 2회</span>
                  </div>
                  <div className="text-[11px] text-gray-500 mb-2">마지막 수업: {p.lastDate} ✅</div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(msg).then(() => alert(`📋 ${p.member.name} 회원 결제 안내 문구가 복사되었습니다.\n카카오톡에 붙여넣기 하세요.`)).catch(() => window.prompt("직접 복사해 주세요:", msg)); }}
                    className="w-full py-1.5 bg-rose-500 text-white rounded-lg text-xs font-semibold hover:bg-rose-600">
                    📋 안내 문구 복사
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
            <QuickLink href="/reports?tab=forms" label="양식" icon="📋" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ✨ v3.34.2: BigKPI 라이트 모드 리뉴얼 - 흥색 그라데이션 → 흰색 카드 + 파스텔 아이콘
function BigKPI({ icon, label, value, sub, subColor, gradient, href, accent }: any) {
  // accent: iconBg, iconColor, subColor 파스텔 톤 (기본값 제공)
  const acc = accent || { iconBg: "bg-emerald-50", iconColor: "text-emerald-600", subText: "text-emerald-600" };
  return (
    <Link href={href}
      className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5 transition-all group">
      <div className="flex items-start justify-between mb-3">
        <div className={`${acc.iconBg} ${acc.iconColor} p-2.5 rounded-xl`}>
          {icon}
        </div>
        <div className="text-[10px] text-slate-400 group-hover:text-slate-600 transition-colors">↗</div>
      </div>
      <div className="text-xs text-slate-500 font-medium">{label}</div>
      <div className="text-2xl font-extrabold mt-1 text-slate-800 tracking-tight">{value}</div>
      {sub && <div className={`text-[11px] mt-1.5 ${acc.subText} font-medium`}>{sub}</div>}
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
      {/* ✅ v3.68.0: 배포 확인용 버전 배지 (화면 최하단) */}
      <div className="text-center text-[10px] text-gray-300 pb-6 select-none">아쿠노트 v3.68.0</div>
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
