import Link from "next/link";
import { Waves, Users, Calendar, ClipboardList, BarChart3 } from "lucide-react";

export default function Home() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-16">
      {/* Hero */}
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-3 mb-4">
          <Waves className="w-12 h-12 text-aqu-600" />
          <h1 className="text-5xl font-bold text-aqu-900">AQUNOTE</h1>
        </div>
        <p className="text-lg text-gray-600">위례아쿠수중운동센터 통합 CRM</p>
        <p className="text-sm text-gray-500 mt-2">회원 · 상담 · 시간표 · 수중기능평가 · 라벨링을 하나로</p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/dashboard" className="p-6 bg-white rounded-2xl shadow-md hover:shadow-xl transition border border-aqu-100">
          <BarChart3 className="w-8 h-8 text-aqu-500 mb-3" />
          <h2 className="font-bold text-lg">대시보드</h2>
          <p className="text-sm text-gray-500 mt-1">전체 현황 한눈에</p>
        </Link>
        <Link href="/members" className="p-6 bg-white rounded-2xl shadow-md hover:shadow-xl transition border border-aqu-100">
          <Users className="w-8 h-8 text-aqu-500 mb-3" />
          <h2 className="font-bold text-lg">회원 관리</h2>
          <p className="text-sm text-gray-500 mt-1">아동 · 성인 통합</p>
        </Link>
        <Link href="/consultations" className="p-6 bg-white rounded-2xl shadow-md hover:shadow-xl transition border border-aqu-100">
          <ClipboardList className="w-8 h-8 text-aqu-500 mb-3" />
          <h2 className="font-bold text-lg">상담 리드</h2>
          <p className="text-sm text-gray-500 mt-1">신규 문의 · 대기자</p>
        </Link>
        <Link href="/schedule" className="p-6 bg-white rounded-2xl shadow-md hover:shadow-xl transition border border-aqu-100">
          <Calendar className="w-8 h-8 text-aqu-500 mb-3" />
          <h2 className="font-bold text-lg">시간표</h2>
          <p className="text-sm text-gray-500 mt-1">주간 스케줄 관리</p>
        </Link>
      </div>

      <div className="mt-16 text-center text-xs text-gray-400">
        v1.0.0 · Powered by Supabase + Next.js · © 2026 AQUNOTE
      </div>
    </main>
  );
}
