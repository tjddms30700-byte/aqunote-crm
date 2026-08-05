"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * v3.31.0: /inbox 페이지 완전 폐지 - /consultations 파이프라인으로 자동 리다이렉트
 * - 신청폼 제출 시 별도 승격 없이 [NEW 신규] 컬럼에 즉시 자동 생성됨
 * - 기존 /inbox 링크/북마크 유입자를 상담·매칭 관리 페이지로 자동 이동
 */
export default function InboxRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/consultations");
  }, [router]);

  return (
    <main className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-3">🔄</div>
        <div className="text-lg font-bold text-slate-700 mb-1">신규 유입 관리 페이지가 이전되었습니다</div>
        <div className="text-sm text-slate-500 mb-4">신청폼 제출 시 상담 파이프라인 <b>[NEW 신규]</b> 컬럼에 자동 생성됩니다.</div>
        <div className="text-xs text-slate-400">잠시만 기다려주세요… /consultations 로 이동합니다.</div>
      </div>
    </main>
  );
}
