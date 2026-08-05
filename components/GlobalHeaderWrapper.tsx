"use client";
import { usePathname } from "next/navigation";
import GlobalHeader from "./GlobalHeader";

/**
 * v3.30.0: 클라이언트 pathname 감지용 래퍼
 * - 홈("/")과 로그인 페이지에서는 헤더 숨김
 * - 그 외 모든 페이지 우측 상단에 홈 버튼 자동 렌더
 */
export default function GlobalHeaderWrapper() {
  const pathname = usePathname();

  // 홈, 로그인, 신청폼(고객용) 페이지에서는 헤더 숨김
  const hiddenPaths = ["/", "/login", "/apply-adult", "/apply-child", "/signup"];
  if (hiddenPaths.some(p => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }

  // 경로별 자동 타이틀 매핑
  const titleMap: Record<string, string> = {
    "/schedule": "시간표",
    "/attendance": "출결장",
    "/attendance/signatures": "사인 출결 이력",
    "/attendance-staff": "직원 출결",
    "/attendance-stats": "출결 통계",
    "/consultations": "상담 · 매칭 관리",
    "/members": "회원 DB",
    "/staff": "직원 · 근무 관리",
    "/payments": "결제 · 매출",
    "/finance": "재무 관리",
    "/facility": "시설 관리",
    "/reports": "리포트",
    "/dashboard": "대시보드",
    "/inbox": "메시지 함",
    "/backup": "백업 · 복원",
  };

  let title = "아쿠노트";
  for (const [k, v] of Object.entries(titleMap)) {
    if (pathname === k || pathname.startsWith(k + "/")) { title = v; break; }
  }

  return <GlobalHeader title={title} subtitle="아쿠노트 · 위례아쿠수중운동센터" />;
}
