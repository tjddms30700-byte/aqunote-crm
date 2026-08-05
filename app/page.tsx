"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  Users, Calendar, ClipboardList, BarChart3,
  LogIn, LogOut, User as UserIcon, CreditCard, DollarSign, Briefcase, FileText,
  ClipboardCheck, TrendingUp, Ticket, Settings,
  Target, AlertTriangle, Clock, FileCheck, MessageSquare,
  Waves, Wallet, UserCog, PieChart, Inbox, RefreshCw, Database, KeyRound
} from "lucide-react";
import Logo from "@/components/Logo";
import BranchSwitcher from "@/components/BranchSwitcher";
import GlobalQuickSearch from "@/components/GlobalQuickSearch";

/* ═════ v3.20.0: 5대분류 (안전사고→회원·수업, 직원관리 단일화, 결제·설정 마스터/센터장 전용) ═════ */
const GROUPS = [
  {
    key: "members",
    title: "회원 · 수업",
    subtitle: "상담 · 회원 · 시간표 · IEP · 안전",
    icon: Users,
    from: "from-purple-500",
    to: "to-fuchsia-600",
    accent: "text-purple-600",
    bg: "bg-purple-50",
    directorOnly: false,
    items: [
      { href: "/consultations",   icon: ClipboardList,  title: "🎯 상담 · 리드",  desc: "신규유입 + 상담매칭 통합", badgeKey: "inbox_pending" },
      // ✅ v3.24.2: 회원 DB의 보강 필요 알림 배지 제거 (상담 리드 신규 유입 시에만 알림 표시)
      { href: "/members",         icon: Users,          title: "회원 DB · 출결",   desc: "아동·성인 + 출석 이력" },
      { href: "/schedule",        icon: Calendar,       title: "통합 시간표",       desc: "월·주·일 + 더블클릭 새 일정" },
      { href: "/iep-behavior",    icon: Target,         title: "IEP · 행동중재",   desc: "목표·ABC·수업일지" },
      { href: "/incidents",       icon: AlertTriangle,  title: "🚨 안전사고",       desc: "응급기록 · 선생님도 사용 가능" },
    ],
  },
  {
    key: "staff",
    title: "직원 · 근무",
    subtitle: "출퇴근 · 휴가 · 사내 소통",
    icon: UserCog,
    from: "from-blue-500",
    to: "to-indigo-600",
    accent: "text-blue-600",
    bg: "bg-blue-50",
    directorOnly: false,
    items: [
      // v3.20.31: 4개 카드 → 1개 통합 카드로 개편 (상세 페이지 상단에서 Sub-Tab 전환)
      { href: "/attendance-staff", icon: UserCog,       title: "👥 직원·근무 관리",  desc: "출퇴근 · 실근무 · 휴가·결재 · 사내 게시판 (통합)" },
    ],
  },
  {
    key: "analytics",
    title: "📊 경영 리포트 · 문서 센터",
    subtitle: "센터 현황 지표 및 보고서 · 계약서 자동 발급",
    icon: PieChart,
    from: "from-teal-500",
    to: "to-emerald-600",
    accent: "text-teal-600",
    bg: "bg-teal-50",
    directorOnly: false,
    items: [
      { href: "/dashboard", icon: BarChart3, title: "통합 대시보드",    desc: "전체 현황 KPI + D+400 처리" },
      { href: "/reports",   icon: FileText,  title: "보고서 생성",      desc: "IEP·일지·행동 보고서" },
      // v3.20.23: 계약서/문서 관리를 대시보드·보고서 섹션으로 이동
      { href: "/reports?tab=forms", icon: FileText, title: "📝 계약서·서식 작성", desc: "근로계약·회원계약·NDA·사직서 자동생성" },
      { href: "/contracts", icon: FileText,  title: "📂 계약서 관리",   desc: "서명 완료 계약·자동연장·PDF 저장" },
      { href: "/documents", icon: FileText,  title: "📄 문서 관리",       desc: "센터 관련 서류 (사업자등록증 등)" },
    ],
  },
  {
    key: "ops",
    title: "🏢 운영",
    subtitle: "결제·재무 · 직원·문서 · 지점 정책 · 로그인 승인 (마스터/센터장 전용)",
    icon: Settings,
    from: "from-slate-500",
    to: "to-gray-700",
    accent: "text-slate-600",
    bg: "bg-slate-50",
    directorOnly: true,
    items: [
      // ✅ v3.20.12: 직원관리·직원급여를 별도 카드로 분리
      { href: "/payments",                 icon: CreditCard,     title: "💳 결제 · 매출 분석",       desc: "결제·매출·통계 통합" },
      { href: "/finance",                  icon: DollarSign,     title: "💼 센터 재무 · 자동정산",   desc: "수입·지출·법인카드·세무사 ZIP" },
      { href: "/facility",                 icon: Waves,          title: "💧 수질·안전 관리",         desc: "일일 점검 · 월간 대장 PDF/Excel" },
      { href: "/staff",                    icon: UserCog,        title: "👥 직원 관리",              desc: "직원 등록 · 재직/퇴사 관리" },
      { href: "/settings/payroll-config",  icon: Briefcase,      title: "👨‍💼 직원 급여 · 수당",      desc: "회당 단가 · 인센티브 · 지급 이력" },
      { href: "/settings?tab=policy",      icon: Settings,       title: "⚙️ 지점 정책",              desc: "회원권 · 시간표 · 자동백업" },
      { href: "/settings/accounts",        icon: KeyRound,       title: "🔑 로그인 승인 · 계정",      desc: "가입 승인 · 비밀번호 관리" },
    ],
  },
];

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isDirector, setIsDirector] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>("members");
  const [badges, setBadges] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);

      // 원장 권한 체크
      if (data.user?.email) {
        const { data: staffRow } = await supabase
          .from("staff")
          .select("role")
          .eq("email", data.user.email)
          .maybeSingle();
        setIsDirector(staffRow?.role === "director");
      }

      // 신규 유입 미처리 건수 조회
      const { count } = await supabase
        .from("leads_inbox")
        .select("*", { count: "exact", head: true })
        .eq("processed", false);

      // ✅ v3.24.2: 회원 DB 배지 제거 - 상담 리드 신규 유입 시에만 알림 표시
      setBadges({ inbox_pending: count || 0 });
    })();
  }, []);

  // ✅ v3.20.0: directorOnly 그룹은 마스터/센터장(isDirector)만 노출
  const visibleGroups = GROUPS.filter(g => !g.directorOnly || isDirector);

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    router.refresh();
  }

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
      {/* Top nav */}
      <div className="flex items-center justify-between mb-6 gap-2">
        {/* ✅ v3.18.0: 글로벌 퀵 서치 (좌측) */}
        <div className="flex-1">
          {user && <GlobalQuickSearch />}
        </div>
        {user ? (
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-600 flex items-center gap-1">
              <UserIcon className="w-4 h-4" />
              <span className="hidden sm:inline">{user.email}</span>
            </div>
            <button onClick={logout}
              className="text-xs px-3 py-1.5 rounded-lg border border-aqu-200 text-aqu-700 hover:bg-aqu-50 flex items-center gap-1">
              <LogOut className="w-3.5 h-3.5" /> 로그아웃
            </button>
          </div>
        ) : (
          <Link href="/login"
            className="text-xs px-3 py-1.5 rounded-lg bg-aqu-600 text-white hover:bg-aqu-700 flex items-center gap-1">
            <LogIn className="w-3.5 h-3.5" /> 로그인
          </Link>
        )}
      </div>

      {/* ✅ 지점 스위처 (로그인 상태일 때만 표시) */}
      <div className="flex justify-end mb-3">
        <BranchSwitcher />
      </div>

      {/* Hero */}
      <div className="text-center mb-10 md:mb-14">
        <div className="flex flex-col items-center gap-3 mb-3">
          <Logo size="xl" />
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-aqu-600 to-aqu-900 bg-clip-text text-transparent">
            AQUNOTE
          </h1>
        </div>
        <p className="text-base md:text-xl text-gray-700 font-medium">센터 운영부터 맞춤 중재·재무까지 한 곳에서</p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs md:text-sm font-semibold border border-blue-100 shadow-sm">
            <span>👥</span> 회원·수업
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 text-xs md:text-sm font-semibold border border-purple-100 shadow-sm">
            <span>📝</span> IEP·행동중재
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs md:text-sm font-semibold border border-emerald-100 shadow-sm">
            <span>💰</span> 결제·재무
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs md:text-sm font-semibold border border-amber-100 shadow-sm">
            <span>👨‍💼</span> 직원·근태
          </span>
        </div>
      </div>

      {/* ═══ 6개 그룹 카드 ═══ */}
      <div className="space-y-6">
        {visibleGroups.map((group) => {
          const isExpanded = expandedGroup === group.key;
          const GroupIcon = group.icon;

          return (
            <div key={group.key} className="bg-white rounded-3xl shadow-md hover:shadow-lg transition-shadow border border-gray-100 overflow-hidden">
              {/* Group Header */}
              <button
                onClick={() => setExpandedGroup(isExpanded ? null : group.key)}
                className="w-full p-5 md:p-6 flex items-center gap-4 hover:bg-gray-50 transition text-left">
                {/* Big icon */}
                <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br ${group.from} ${group.to} p-3 md:p-4 shadow-md shrink-0`}>
                  <GroupIcon className="w-full h-full text-white" />
                </div>
                {/* Title */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg md:text-2xl font-bold text-aqu-900 flex items-center gap-2">
                    {group.title}
                    <span className={`text-[10px] md:text-xs px-2 py-0.5 rounded-full ${group.bg} ${group.accent} font-medium`}>
                      {group.items.length}개
                    </span>
                  </h2>
                  <p className="text-xs md:text-sm text-gray-500 mt-0.5">{group.subtitle}</p>
                </div>
                {/* Expand indicator */}
                <div className={`w-8 h-8 rounded-full ${group.bg} flex items-center justify-center shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                  <svg className={`w-4 h-4 ${group.accent}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
                  </svg>
                </div>
              </button>

              {/* Sub items (expanded) */}
              {isExpanded && (
                <div className="border-t border-gray-100 p-4 md:p-5 bg-gradient-to-br from-gray-50/50 to-white">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                    {group.items.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <Link key={item.href} href={item.href}
                          className={`group relative overflow-hidden bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-200 border border-gray-100 hover:border-transparent hover:-translate-y-0.5`}>
                          <div className={`absolute inset-0 bg-gradient-to-br ${group.from} ${group.to} opacity-0 group-hover:opacity-100 transition-opacity duration-200`}></div>
                          <div className="relative p-3 md:p-4 flex flex-col justify-between min-h-[100px] md:min-h-[110px]">
                            <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br ${group.from} ${group.to} p-2 md:p-2.5 shadow-sm shrink-0 relative`}>
                              <ItemIcon className="w-full h-full text-white" />
                              {(item as any).badgeKey && badges[(item as any).badgeKey] > 0 && (
                                <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                                  {badges[(item as any).badgeKey]}
                                </span>
                              )}
                            </div>
                            <div className="mt-2">
                              <div className="font-bold text-xs md:text-sm text-aqu-900 group-hover:text-white transition-colors">
                                {item.title}
                              </div>
                              <div className="text-[10px] md:text-xs text-gray-500 group-hover:text-white/90 transition-colors mt-0.5">
                                {item.desc}
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 미니멀 푸터 */}
      <footer className="mt-16 md:mt-20 pt-6 border-t border-gray-200">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <Waves className="w-3.5 h-3.5" />
            <span className="font-semibold">AQUNOTE</span>
            <span>v3.7</span>
          </div>
          <div className="text-[11px]">© 2026 아쿠수중운동센터 · All rights reserved</div>
        </div>
      </footer>
    </main>
  );
}
