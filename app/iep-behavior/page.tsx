"use client";
export const dynamic = "force-dynamic";

import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { Target, AlertTriangle, ArrowRight } from "lucide-react";

/**
 * v3.13.3 - IEP 목표 + 행동중재 진입 허브
 * 두 페이지 링크를 카드로 제공하여 홈 메뉴 하나로 축소
 */
export default function IEPBehaviorHubPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-aqu-50 to-white p-6">
      {/* 헤더 */}
      <div className="max-w-5xl mx-auto mb-8 flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-aqu-900 flex items-center gap-2">
            🎯 IEP · 행동 중재
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            개별화 교육 목표와 문제행동 중재 기록을 통합 관리합니다.
          </p>
        </div>
        <HomeButton />
      </div>

      {/* 카드 2개 */}
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/iep"
          className="group bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-2xl p-6 shadow-md hover:shadow-xl transition-all hover:-translate-y-0.5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <div className="text-lg font-bold">IEP 목표</div>
              <div className="text-xs opacity-90">개별화 교육 계획</div>
            </div>
            <ArrowRight className="w-5 h-5 ml-auto opacity-70 group-hover:translate-x-1 transition-transform" />
          </div>
          <ul className="text-xs opacity-95 space-y-1">
            <li>• 장·단기 목표 및 커리큘럼 관리</li>
            <li>• 진행률·촉구 수준(독립수행~신체촉구) 기록</li>
            <li>• 회원별 도메인 진척도 시각화</li>
          </ul>
        </Link>

        <Link href="/behavior"
          className="group bg-gradient-to-br from-orange-500 to-red-500 text-white rounded-2xl p-6 shadow-md hover:shadow-xl transition-all hover:-translate-y-0.5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="text-lg font-bold">행동 중재</div>
              <div className="text-xs opacity-90">ABC · 빈도 · 시간 분석</div>
            </div>
            <ArrowRight className="w-5 h-5 ml-auto opacity-70 group-hover:translate-x-1 transition-transform" />
          </div>
          <ul className="text-xs opacity-95 space-y-1">
            <li>• ABC(선행-행동-결과) 기록</li>
            <li>• 빈도·지속시간·강도 통계</li>
            <li>• 중재 전략 및 효과 추적</li>
          </ul>
        </Link>
      </div>

      {/* 힌트 */}
      <div className="max-w-5xl mx-auto mt-6 text-xs text-gray-500 text-center">
        💡 두 메뉴는 목표 설정 → 행동 기록 → 진척도 확인 흐름으로 함께 사용하시면 효과적입니다.
      </div>
    </div>
  );
}
