"use client";
export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * v3.14.0 - 고정시간표 매칭 페이지는 상담·매칭 통합 페이지로 이관됨
 * /schedule/matching → /consultations?tab=match 자동 리다이렉트
 */
export default function ScheduleMatchingRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/consultations");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-aqu-50 text-aqu-700 text-sm">
      🔀 상담·매칭 페이지로 이동 중...
    </div>
  );
}
