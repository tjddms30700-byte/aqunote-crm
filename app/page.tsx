"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  Waves, Users, Calendar, ClipboardList, BarChart3,
  LogIn, LogOut, User as UserIcon
} from "lucide-react";

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
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-10 md:py-16">
      {/* Top bar */}
      <div className="flex items-center justify-end mb-8">
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
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-3 mb-4">
          <Waves className="w-12 h-12 md:w-14 md:h-14 text-aqu-600" />
          <h1 className="text-4xl md:text-5xl font-bold text-aqu-900">AQUNOTE</h1>
        </div>
        <p className="text-base md:text-lg text-gray-600">위례아쿠수중운동센터 통합 CRM</p>
        <p className="text-sm text-gray-500 mt-2">회원 · 상담 · 시간표 · 수중기능평가 · 라벨링을 하나로</p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card href="/dashboard" icon={BarChart3} title="대시보드" subtitle="전체 현황 한눈에" />
        <Card href="/members" icon={Users} title="회원 관리" subtitle="아동 · 성인 통합" />
        <Card href="/consultations" icon={ClipboardList} title="상담 리드" subtitle="칸반보드 관리" />
        <Card href="/schedule" icon={Calendar} title="시간표" subtitle="주간 스케줄" />
      </div>

      <div className="mt-16 text-center text-xs text-gray-400">
        v1.2.0 · Powered by Supabase + Next.js · © 2026 AQUNOTE
      </div>
    </main>
  );
}

function Card({ href, icon: Icon, title, subtitle }: any) {
  return (
    <Link href={href} className="p-4 md:p-6 bg-white rounded-2xl shadow-md hover:shadow-xl transition border border-aqu-100 hover:border-aqu-300">
      <Icon className="w-7 h-7 md:w-8 md:h-8 text-aqu-500 mb-2 md:mb-3" />
      <h2 className="font-bold text-base md:text-lg text-aqu-900">{title}</h2>
      <p className="text-xs md:text-sm text-gray-500 mt-1">{subtitle}</p>
    </Link>
  );
}
