"use client";

// ═══════════════════════════════════════════════════════════════
// 🔀 v3.40.0 리다이렉트 페이지 – /settings/programs → /settings/catalog?tab=programs
// 이용 프로그램 관리는 회원권과 함께 통합 관리 페이지로 이동
// ═══════════════════════════════════════════════════════════════

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ProgramsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings/catalog?tab=programs");
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-white p-4">
      <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md text-center border border-slate-200">
        <div className="text-4xl mb-3">🔀</div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">페이지가 이동되었습니다</h1>
        <p className="text-sm text-slate-600 mb-4">
          이용 프로그램 관리는 v3.40.0부터<br/>
          <b className="text-emerald-700">회원권 · 이용 프로그램 통합 관리</b> 페이지로 이동했습니다.
        </p>
        <Link href="/settings/catalog?tab=programs"
          className="inline-block px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-sm font-bold hover:opacity-90">
          지금 이동하기 →
        </Link>
        <p className="text-[10px] text-slate-400 mt-3">자동 이동되지 않을 경우 위 버튼을 눌러주세요.</p>
      </div>
    </main>
  );
}
