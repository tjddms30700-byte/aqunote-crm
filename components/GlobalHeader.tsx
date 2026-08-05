"use client";
import Link from "next/link";
import { Home, Search } from "lucide-react";
import GlobalQuickSearch from "./GlobalQuickSearch";
import BranchSwitcher from "./BranchSwitcher";

/**
 * v3.30.0: 전 페이지 공용 글로벌 헤더
 * - 우측 상단 홈 버튼 고정 (파스텔 알약형)
 * - Branch 선택기 + Quick Search 통합
 * - sticky 배치로 스크롤 시에도 상단 고정
 */
export default function GlobalHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-white/85 border-b border-slate-100 shadow-sm">
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-4">
        {/* 좌측: 페이지 타이틀 */}
        <div className="flex items-center gap-3 min-w-0">
          {title && (
            <div className="min-w-0">
              <h1 className="text-base md:text-lg font-bold text-slate-800 truncate">{title}</h1>
              {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
            </div>
          )}
        </div>

        {/* 우측: 브랜치 · 검색 · 홈 (알약형 pill 스타일) */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden md:block">
            <BranchSwitcher />
          </div>
          <div className="hidden md:block">
            <GlobalQuickSearch />
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-br from-sky-500 to-cyan-600 text-white font-semibold text-sm shadow-md hover:shadow-lg hover:scale-105 transition-all"
            title="홈으로"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">홈</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
