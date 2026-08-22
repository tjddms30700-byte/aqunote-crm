/**
 * 📱 카카오톡 메시지 템플릿 생성 유틸리티
 * ─────────────────────────────
 * - 재등록 유도 / 만료 임박 / 잔여 소진 등 상황별 메시지 자동 생성
 * - 회원 정보와 회원권 정보를 받아 개인화된 메시지 반환
 * - 복사 버튼 UI에서 사용
 */

export type MessageContext = {
  memberName: string;
  memberType?: "child" | "adult";
  guardianName?: string;      // 아동인 경우 보호자명
  planName?: string;
  remaining?: number;
  totalSessions?: number;
  endDate?: string;
  daysToExpire?: number;
  branchName?: string;
  centerPhone?: string;
};

/**
 * 회원 호칭 결정 (아동이면 보호자님, 성인이면 회원명 님)
 */
function resolveGreetingName(ctx: MessageContext): string {
  if (ctx.memberType === "child" && ctx.guardianName) {
    return `${ctx.memberName} ${ctx.guardianName}`;
  }
  return ctx.memberName;
}

/**
 * 잔여 횟수 소진 임박 (잔여 3회 이하) - 재등록 유도
 */
export function makeRemainingLowMessage(ctx: MessageContext): string {
  const greeting = resolveGreetingName(ctx);
  const centerName = ctx.branchName || "아쿠수중운동센터";
  return `안녕하세요, ${greeting} 님 😊
${centerName}입니다.

현재 이용 중이신 회원권 잔여 횟수를 안내드립니다.
━━━━━━━━━━━━━━━━━━
📋 회원권: ${ctx.planName || "-"}
💧 잔여: ${ctx.remaining ?? 0}회 / ${ctx.totalSessions ?? 0}회
${ctx.endDate ? `📅 만료일: ${ctx.endDate}` : ""}
━━━━━━━━━━━━━━━━━━

수업이 얼마 남지 않아 재등록 안내드립니다.
편하실 때 센터로 연락 주시면 상담 도와드리겠습니다.
${ctx.centerPhone ? `📞 ${ctx.centerPhone}` : ""}

늘 함께해 주셔서 감사합니다 🙏`;
}

/**
 * 회원권 만료 임박 (D-7 이내)
 */
export function makeExpireAlertMessage(ctx: MessageContext): string {
  const greeting = resolveGreetingName(ctx);
  const centerName = ctx.branchName || "아쿠수중운동센터";
  const dLabel = ctx.daysToExpire === 0 ? "오늘"
              : ctx.daysToExpire === 1 ? "내일"
              : `${ctx.daysToExpire}일 후`;
  return `안녕하세요, ${greeting} 님 🌊
${centerName}입니다.

이용 중이신 회원권이 ${dLabel} 만료됩니다.
━━━━━━━━━━━━━━━━━━
📋 회원권: ${ctx.planName || "-"}
📅 만료일: ${ctx.endDate || "-"}
💧 잔여: ${ctx.remaining ?? 0}회
━━━━━━━━━━━━━━━━━━

재등록을 원하시면 언제든 편하게 연락 주세요.
${ctx.centerPhone ? `📞 ${ctx.centerPhone}` : ""}

건강한 하루 되세요 🙏`;
}

/**
 * 재등록 유도 (일반)
 */
export function makeReregisterMessage(ctx: MessageContext): string {
  const greeting = resolveGreetingName(ctx);
  const centerName = ctx.branchName || "아쿠수중운동센터";
  return `안녕하세요, ${greeting} 님 💙
${centerName}입니다.

그간 잘 지내셨나요?
${ctx.memberName} 회원님의 수업이 종료된 지 시간이 지나
안부 인사와 함께 재등록 안내드립니다.

새로운 회원권 안내와 시간대 상담을 원하시면
편하실 때 연락 주세요.
${ctx.centerPhone ? `📞 ${ctx.centerPhone}` : ""}

언제나 응원하겠습니다 🙏`;
}

/**
 * 정액권 매월 자동 갱신 안내
 */
export function makeAutoRenewalMessage(ctx: MessageContext): string {
  const greeting = resolveGreetingName(ctx);
  const centerName = ctx.branchName || "아쿠수중운동센터";
  return `안녕하세요, ${greeting} 님 🎯
${centerName}입니다.

이번 달 정기 회원권 갱신 안내드립니다.
━━━━━━━━━━━━━━━━━━
📋 회원권: ${ctx.planName || "-"}
💧 이번 달 사용 가능: ${ctx.totalSessions ?? 0}회
${ctx.endDate ? `📅 이용 기간: ~ ${ctx.endDate}` : ""}
━━━━━━━━━━━━━━━━━━

갱신 결제 안내를 위해 편하실 때 연락 부탁드립니다.
${ctx.centerPhone ? `📞 ${ctx.centerPhone}` : ""}

이번 달도 함께해 주세요 🙏`;
}

/**
 * 노쇼 이월 안내
 */
export function makeCarryoverMessage(ctx: MessageContext & { carryDate?: string }): string {
  const greeting = resolveGreetingName(ctx);
  const centerName = ctx.branchName || "아쿠수중운동센터";
  return `안녕하세요, ${greeting} 님 🌿
${centerName}입니다.

${ctx.carryDate ? `${ctx.carryDate} ` : ""}수업 불참으로 인해 회원권 1회가 이월 처리되었습니다.
━━━━━━━━━━━━━━━━━━
📋 회원권: ${ctx.planName || "-"}
💧 잔여: ${ctx.remaining ?? 0}회 (+이월 1회)
━━━━━━━━━━━━━━━━━━

다음 방문 시 이월분이 자동 반영됩니다.
문의사항 있으시면 언제든 연락 주세요.
${ctx.centerPhone ? `📞 ${ctx.centerPhone}` : ""}

감사합니다 🙏`;
}

/**
 * 상황별 메시지 자동 선택
 */
export function autoPickMessage(ctx: MessageContext): { title: string; content: string } {
  // 만료 임박 우선
  if (ctx.daysToExpire !== undefined && ctx.daysToExpire >= 0 && ctx.daysToExpire <= 7) {
    return { title: "⏰ 만료 임박 안내", content: makeExpireAlertMessage(ctx) };
  }
  // 잔여 소진 임박
  if (ctx.remaining !== undefined && ctx.remaining <= 3 && ctx.remaining > 0) {
    return { title: "💧 잔여 횟수 안내", content: makeRemainingLowMessage(ctx) };
  }
  // 일반 재등록
  return { title: "💙 재등록 안내", content: makeReregisterMessage(ctx) };
}
