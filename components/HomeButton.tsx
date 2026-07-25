"use client";
import Link from "next/link";
import { Home } from "lucide-react";
import GlobalQuickSearch from "./GlobalQuickSearch";

/**
 * v3.18.0: 홈 버튼 + 글로벌 Quick Search 결합
 * - 모든 페이지 좌상단에서 Ctrl+K로 즉시 검색
 */
export default function HomeButton() {
  return (
    <div className="inline-flex items-center gap-2">
      <Link href="/"
        className="inline-flex items-center gap-1.5 px-4 py-2 md:px-5 md:py-2.5 rounded-xl bg-gradient-to-br from-aqu-500 to-aqu-700 text-white font-semibold text-sm md:text-base shadow-md hover:shadow-lg hover:scale-105 transition-all">
        <Home className="w-4 h-4 md:w-5 md:h-5" />
        <span>홈</span>
      </Link>
      <div className="hidden md:block">
        <GlobalQuickSearch />
      </div>
    </div>
  );
}
