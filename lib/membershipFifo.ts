// ✅ v3.48.1: 재계산 카운트 = 완료(done) 슬롯만 · 미래 예약 제외
// ✅ v3.48.0: 회원권 FIFO(선입선출) 차감 공용 유틸
// 핵심 원칙:
//  - 차감 대상 = 잔여 횟수가 남아있는(>0) 가장 오래된 회원권 (start_date → created_at 오름차순)
//  - 음수 잔여 방지: remainingOf 계산은 항상 Math.max(0, ...) 으로 clamp

/** 회원권 FIFO 정렬: 시작일 → 생성일 오름차순 (가장 먼저 결제/시작된 회원권이 첫 번째) */
export function fifoSort(list: any[]): any[] {
  return [...(list || [])].sort((a: any, b: any) =>
    (a.start_date || "9999-12-31").localeCompare(b.start_date || "9999-12-31") ||
    (a.created_at || "").localeCompare(b.created_at || "")
  );
}

/** 잔여 횟수 (음수 방지 clamp) */
export function remainingOf(m: any): number {
  return Math.max(0, (m.total_sessions || 0) + (m.adjustment || 0) - (m.used_sessions || 0));
}

/**
 * FIFO 차감 대상 회원권 선택
 *  - 취소(cancelled) 제외
 *  - 잔여 > 0 인 회원권만 (소진된 회원권은 절대 차감하지 않음 → 음수 원천 차단)
 *  - 기준일(기본 오늘)을 포함하는 회원권 우선
 */
export function pickFifoMembership(list: any[], date?: string): any | null {
  const today = date || new Date().toISOString().slice(0, 10);
  // ✅ v3.57.2: 1순위 - 기간 유효 + 잔여 있는 회원권
  const valid = (list || []).filter((m: any) =>
    m.status !== "cancelled" &&
    remainingOf(m) > 0 &&
    (!m.start_date || m.start_date <= today) &&
    (!m.end_date || m.end_date >= today)
  );
  if (valid.length > 0) return fifoSort(valid)[0];
  // ✅ v3.57.2: 2순위(폴백) - 기한은 지났지만 잔여가 남은 회원권도 출석 허용
  //   (센터 재량으로 기간연장 없이 수강 허용하는 운영 방침 반영 / UI에 ⚠️기한만료 배지 표시)
  const expired = (list || []).filter((m: any) =>
    m.status !== "cancelled" &&
    remainingOf(m) > 0 &&
    (!m.start_date || m.start_date <= today) &&
    m.end_date && m.end_date < today
  );
  return fifoSort(expired)[0] || null;
}

/** v3.73.1: 구버전 호출이 남아 있어도 과거 출석을 회원권에 재배분하지 않는다. */
export async function recalcMemberFifo(_memberId: string): Promise<{ used: number; after: string }> {
  throw new Error("FIFO 소급 재계산은 중지되었습니다. 실제 사용 회원권이 연결된 출석만 차감합니다. 과거 오차는 기록 확인 후 회원권별로 수동 정정해주세요.");
}
