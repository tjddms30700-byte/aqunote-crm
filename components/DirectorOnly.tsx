"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

/**
 * 원장(director) 역할만 자녀 컴포넌트를 볼 수 있게 보호하는 래퍼.
 * staff 테이블에 로그인 사용자의 email이 있고 role='director' 이면 통과.
 * 개발 편의를 위해 아직 staff 등록이 없거나 로그인 안 되어 있으면 접근 허용
 * (v3.5에서는 원장 계정 등록 안 되어 있을 수 있으므로 관대한 정책).
 */
export default function DirectorOnly({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "allowed" | "denied">("loading");

  useEffect(() => {
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const email = userData.user?.email;

        // 로그인 안 되어 있으면 일단 허용 (v3.5 임시)
        if (!email) {
          setStatus("allowed");
          return;
        }

        // staff 테이블 조회
        const { data: staffRow, error } = await supabase
          .from("staff")
          .select("role, name")
          .eq("email", email)
          .maybeSingle();

        if (error) {
          console.warn("staff 조회 오류, 접근 허용:", error.message);
          setStatus("allowed"); // 오류 시 허용
          return;
        }

        // staff 등록이 아직 없으면 허용 (초기 설정 단계)
        if (!staffRow) {
          setStatus("allowed");
          return;
        }

        // director만 통과
        if (staffRow.role === "director") {
          setStatus("allowed");
        } else {
          setStatus("denied");
        }
      } catch (e) {
        console.error("권한 체크 오류:", e);
        setStatus("allowed"); // 오류 시 허용
      }
    })();
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-aqu-50">
        <div className="text-sm text-gray-500">권한 확인 중...</div>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-aqu-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center border-2 border-orange-200">
          <div className="w-16 h-16 mx-auto mb-4 bg-orange-100 rounded-full flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-orange-500" />
          </div>
          <h1 className="text-xl font-bold text-orange-900 mb-2">🔒 접근 권한 없음</h1>
          <p className="text-sm text-gray-600 mb-6">
            이 페이지는 <strong>원장(director) 역할</strong>의 계정만 접근할 수 있습니다.
            <br /><br />
            매출·재무 정보는 민감한 데이터로 보호됩니다.
          </p>
          <Link href="/" className="inline-block px-5 py-2.5 bg-aqu-500 hover:bg-aqu-600 text-white text-sm font-medium rounded-lg">
            홈으로 돌아가기
          </Link>
          <div className="mt-4 text-xs text-gray-400">
            💡 원장 권한이 필요하면 관리자에게 요청하세요.<br />
            (직원관리 → 계정 → 역할 원장으로 설정)
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
