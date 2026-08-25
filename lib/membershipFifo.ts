// ✅ v3.48.0: 회원권 FIFO(선입선출) 차감 공용 유틸
// 핵심 원칙:
//  - 차감 대상 = 잔여 횟수가 남아있는(>0) 가장 오래된 회원권 (start_date → created_at 오름차순)
//  - 음수 잔여 방지: remainingOf 계산은 항상 Math.max(0, ...) 으로 clamp
import { supabase } from "@/lib/supabase";

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
  const pool = (list || []).filter((m: any) =>
    m.status !== "cancelled" &&
    remainingOf(m) > 0 &&
    (!m.start_date || m.start_date <= today) &&
    (!m.end_date || m.end_date >= today)
  );
  return fifoSort(pool)[0] || null;
}

/**
 * 단일 회원 회원권 FIFO 일괄 재계산
 *  - 총 유효 출석 횟수(attendance status = present/absent)를 기준으로
 *  - 결제 순서(FIFO)대로 회차를 처음부터 재배정
 *  - 예: 총 출석 25회 / [체험1회권, 10회권×3] → 0/1, 0/10, 0/10, 4/10
 *  - 전 회원권 소진 후 초과 출석분은 마지막 회원권에 누적 (표시는 0으로 clamp)
 */
export async function recalcMemberFifo(memberId: string): Promise<{ used: number; after: string }> {
  // 1) 유효 출석 횟수 집계
  const { data: att } = await supabase.from("attendance").select("id, status").eq("member_id", memberId);
  const used = (att || []).filter((a: any) => a.status === "present" || a.status === "absent").length;

  // 2) 회원권 로드 (취소 제외) + FIFO 정렬
  const { data: ms } = await supabase.from("memberships").select("*")
    .eq("member_id", memberId).neq("status", "cancelled");
  const ordered = fifoSort(ms || []);

  // 3) FIFO 재배정
  let rest = used;
  for (const m of ordered) {
    const cap = (m.total_sessions || 0) + (m.adjustment || 0);
    const newUsed = Math.min(cap, Math.max(0, rest));
    rest -= newUsed;
    if ((m.used_sessions || 0) !== newUsed) {
      await supabase.from("memberships").update({ used_sessions: newUsed }).eq("id", m.id);
      m.used_sessions = newUsed;
    }
  }
  // 4) 초과 출석분 → 마지막 회원권에 누적 (과거 출석이 회원권 총량보다 많은 예외 케이스)
  if (rest > 0 && ordered.length > 0) {
    const lastM = ordered[ordered.length - 1];
    const cap = (lastM.total_sessions || 0) + (lastM.adjustment || 0);
    const newUsed = cap + rest;
    await supabase.from("memberships").update({ used_sessions: newUsed }).eq("id", lastM.id);
    lastM.used_sessions = newUsed;
  }

  const after = ordered
    .map(m => `${m.plan_name}:${remainingOf(m)}/${(m.total_sessions || 0) + (m.adjustment || 0)}`)
    .join(" | ");
  return { used, after };
}
