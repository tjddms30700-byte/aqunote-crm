"use client";

// ═══════════════════════════════════════════════════════════════
// 🔀 v3.40.0 리다이렉트 페이지 – /plans → /settings/catalog?tab=plans
// 회원권과 이용 프로그램을 하나의 통합 관리 페이지로 이동
// ═══════════════════════════════════════════════════════════════

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function PlansRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // 즉시 리다이렉트
    router.replace("/settings/catalog?tab=plans");
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-white p-4">
      <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md text-center border border-slate-200">
        <div className="text-4xl mb-3">🔀</div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">페이지가 이동되었습니다</h1>
        <p className="text-sm text-slate-600 mb-4">
          회원권 관리는 v3.40.0부터<br/>
          <b className="text-aqu-700">회원권 · 이용 프로그램 통합 관리</b> 페이지로 이동했습니다.
        </p>
        <Link href="/settings/catalog?tab=plans"
          className="inline-block px-5 py-2.5 bg-gradient-to-r from-aqu-500 to-blue-600 text-white rounded-xl text-sm font-bold hover:opacity-90">
          지금 이동하기 →
        </Link>
        <p className="text-[10px] text-slate-400 mt-3">자동 이동되지 않을 경우 위 버튼을 눌러주세요.</p>
      </div>
    </main>
  );
}
