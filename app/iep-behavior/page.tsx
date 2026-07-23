"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { Target, AlertTriangle } from "lucide-react";
import IEPPage from "../iep/page";
import BehaviorPage from "../behavior/page";

/**
 * v3.13.2 - IEP 목표 + 행동중재 통합 페이지
 * 상단 탭으로 전환하여 하나의 메뉴로 접근 가능
 */
export default function IEPBehaviorPage() {
  const [tab, setTab] = useState<"iep" | "behavior">("iep");

  return (
    <div className="min-h-screen bg-gradient-to-b from-aqu-50 to-white">
      {/* 헤더 */}
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-3 flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-aqu-900 flex items-center gap-2">
            🎯 IEP · 행동 중재
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            개별화 교육 목표(IEP)와 문제행동 중재(ABC) 기록을 한 곳에서 관리합니다.
          </p>
        </div>
        <HomeButton />
      </div>

      {/* 탭 스위처 */}
      <div className="max-w-7xl mx-auto px-6 mb-2">
        <div className="inline-flex bg-white rounded-xl border border-aqu-100 shadow-sm p-1">
          <button
            onClick={() => setTab("iep")}
            className={`px-5 py-2 text-sm rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
              tab === "iep"
                ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Target className="w-4 h-4" /> IEP 목표
          </button>
          <button
            onClick={() => setTab("behavior")}
            className={`px-5 py-2 text-sm rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
              tab === "behavior"
                ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <AlertTriangle className="w-4 h-4" /> 행동 중재
          </button>
        </div>
      </div>

      {/* 콘텐츠 (기존 페이지 재사용) */}
      <div className="iep-behavior-wrapper">
        {tab === "iep" ? <IEPPage /> : <BehaviorPage />}
      </div>

      {/* 하위 페이지의 자체 헤더 숨김 (통합 헤더 사용) */}
      <style jsx global>{`
        .iep-behavior-wrapper > div > div:first-child h1 { display: none; }
        .iep-behavior-wrapper > div { padding-top: 0 !important; }
      `}</style>
    </div>
  );
}
