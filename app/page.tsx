"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  Waves, Users, Calendar, ClipboardList, BarChart3,
  LogIn, LogOut, User as UserIcon, CreditCard, DollarSign, Briefcase, FileText,
  ClipboardCheck, TrendingUp, Ticket
} from "lucide-react";

const CARDS = [
  { href: "/dashboard",         icon: BarChart3,      title: "대시보드",    subtitle: "전체 현황 KPI",       from: "from-blue-500",    to: "to-cyan-500" },
  { href: "/members",           icon: Users,          title: "회원 관리",   subtitle: "아동 · 성인 통합",     from: "from-purple-500",  to: "to-fuchsia-500" },
  { href: "/consultations",     icon: ClipboardList,  title: "상담 리드",   subtitle: "칸반보드",            from: "from-orange-500",  to: "to-amber-500" },
  { href: "/schedule",          icon: Calendar,       title: "시간표",     subtitle: "월간 · 주간 · 일간",   from: "from-emerald-500", to: "to-green-500" },
  { href: "/payments",          icon: CreditCard,     title: "결제 관리",   subtitle: "결제 수단 · 이력",     from: "from-pink-500",    to: "to-rose-500" },
  { href: "/plans",             icon: Ticket,         title: "회원권",     subtitle: "횟수 · 금액 설정",     from: "from-violet-500",  to: "to-purple-500" },
  { href: "/finance",           icon: DollarSign,     title: "재무 관리",   subtitle: "수입 · 지출 · 손익",   from: "from-teal-500",    to: "to-emerald-500" },
  { href: "/staff",             icon: Briefcase,      title: "직원 · 급여", subtitle: "원장 · 치료사 · 관리자", from: "from-indigo-500",  to: "to-blue-500" },
  { href: "/attendance",        icon: ClipboardCheck, title: "출결 관리",   subtitle: "출석 · 결석 · 병결",   from: "from-cyan-500",    to: "to-teal-500" },
  { href: "/documents",         icon: FileText,       title: "문서 관리",   subtitle: "영수증 · 계약서",       from: "from-amber-500",   to: "to-orange-500" },
  { href: "/dashboard/revenue", icon: TrendingUp,     title: "매출 통계",   subtitle: "월별 · 주별 추이",     from: "from-rose-500",    to: "to-red-500" },
];

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    })();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    router.refresh();
  }

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
      {/* Top nav */}
      <div className="flex items-center justify-end mb-6">
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

      {/* Hero */}
      <div className="text-center mb-10 md:mb-14">
        <div className="inline-flex items-center gap-3 mb-3">
          <div className="p-3 bg-gradient-to-br from-aqu-400 to-aqu-600 rounded-2xl shadow-lg">
            <Waves className="w-8 h-8 md:w-10 md:h-10 text-white" />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-aqu-600 to-aqu-900 bg-clip-text text-transparent">
            AQUNOTE
          </h1>
        </div>
        <p className="text-base md:text-xl text-gray-700 font-medium">위례아쿠수중운동센터 통합 CRM+ERP</p>
        <p className="text-xs md:text-sm text-gray-500 mt-2">회원 · 상담 · 시간표 · 결제 · 출결 · 재무를 하나로</p>
      </div>

      {/* Big Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href}
            className="group relative overflow-hidden bg-white rounded-3xl shadow-md hover:shadow-2xl transition-all duration-300 border border-gray-100 hover:-translate-y-1">
            {/* Gradient background */}
            <div className={`absolute inset-0 bg-gradient-to-br ${c.from} ${c.to} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>

            <div className="relative p-5 md:p-7 min-h-[130px] md:min-h-[160px] flex flex-col justify-between">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br ${c.from} ${c.to} p-3 shadow-md group-hover:shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                <c.icon className="w-full h-full text-white" />
              </div>
              <div className="mt-3 md:mt-4">
                <h2 className="font-bold text-base md:text-xl text-aqu-900 group-hover:text-white transition-colors">
                  {c.title}
                </h2>
                <p className="text-xs md:text-sm text-gray-500 mt-0.5 md:mt-1 group-hover:text-white/90 transition-colors">
                  {c.subtitle}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-14 md:mt-20 text-center">
        <div className="text-xs text-gray-400">
          v2.7.0 · Powered by Supabase + Next.js · © 2026 AQUNOTE
        </div>
      </div>
    </main>
  );
}
