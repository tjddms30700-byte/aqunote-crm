// ✅ v3.48.1: 재계산 카운트 = 완료(done) 슬롯만 · 미래 예약 제외
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
  // ✅ v3.48.1: 유효 출석 = schedule_slots 중 '완료(done/completed)' 상태인 과거~당일 세션만
  //   - 미래·예약(scheduled) / 병결(sick) / 이월(carryover) / 개인사정(personal) 건은 차감 제외
  //   - 회원 상세 KPI '완료 수업 N회'와 동일한 데이터 소스로 일치
  const today = new Date().toISOString().slice(0, 10);
  const { data: slotRows } = await supabase.from("schedule_slots")
    .select("id, status, event_date, time_slot, staff_id")
    .eq("member_id", memberId)
    .is("deleted_at", null);
  // ✅ v3.48.4: 중복 완료 슬롯 제거 - 같은 날짜+시간대는 1회만 카운트
  //   (v3.48.3은 강사 id까지 키에 넣어, 같은 수업이 다른 강사로 이중 등록된 건을 중복으로 잡지 못했음)
  const doneKeySet = new Set<string>();
  const dupLog: string[] = [];
  (slotRows || []).forEach((s: any) => {
    const st = (s.status || "").toLowerCase();
    const d = typeof s.event_date === "string" ? s.event_date.slice(0, 10) : "";
    if (!((st === "done" || st === "completed") && !!d && d <= today)) return;
    const key = `${d}|${s.time_slot || "-"}`;
    if (doneKeySet.has(key)) dupLog.push(`중복제거: ${key} (slot ${s.id})`);
    doneKeySet.add(key);
  });
  // ✅ v3.48.5: 회원권 먼저 로드 - 최초 회원권 시작일 이전의 출석은 '이전 시스템 이력'으로 차감 제외
  const { data: msPre } = await supabase.from("memberships").select("*")
    .eq("member_id", memberId).neq("status", "cancelled");
  const firstStart = fifoSort(msPre || [])
    .map((m: any) => m.start_date)
    .filter(Boolean)[0] || null;

  // ✅ v3.48.5: 유령 카운트 진단 - 카운트에 포함된 슬롯의 원본 event_date 를 그대로 출력
  //   (SQL에서 date 등호로 안 잡히는데 카운트엔 잡히는 경우 = timestamp 형태로 저장된 케이스 탐지)
  const rawSample = (slotRows || [])
    .filter((s: any) => {
      const st = (s.status || "").toLowerCase();
      const d = typeof s.event_date === "string" ? s.event_date.slice(0, 10) : "";
      return (st === "done" || st === "completed") && !!d && d <= today;
    })
    .map((s: any) => ({ id: s.id, raw_date: s.event_date, time_slot: s.time_slot }));
  console.log(`[FIFO 재계산] 완료 슬롯 원본 날짜값 (복사해서 보내주세요):`, rawSample);

  let used = doneKeySet.size;
  // ✅ v3.48.5: 마이그레이션 컷오프 - 최초 회원권 시작일 이전 출석 제외
  if (firstStart) {
    const beforeCut = Array.from(doneKeySet).filter(k => k.slice(0, 10) < firstStart);
    if (beforeCut.length > 0) {
      beforeCut.forEach(k => doneKeySet.delete(k));
      console.log(`[FIFO 재계산] 회원권 최초 시작일(${firstStart}) 이전 출석 ${beforeCut.length}건 제외:`, beforeCut.sort());
      used = doneKeySet.size;
    }
  }
  console.log(`[FIFO 재계산] member=${memberId} 최종 카운트=${used}회 (슬롯 ${(slotRows || []).length}건 중 완료 dedupe 후)`);
  if (dupLog.length > 0) console.warn("[FIFO 재계산] 중복 제거된 슬롯:", dupLog);
  console.log("[FIFO 재계산] 카운트된 날짜/시간대:", Array.from(doneKeySet).sort().join(", "));
  if ((slotRows || []).length === 0) {
    // 폴백: schedule_slots이 전혀 없는 회원만 attendance(present/absent, 과거~당일) 기준
    const { data: att } = await supabase.from("attendance").select("*").eq("member_id", memberId);
    const attKeySet = new Set<string>();
    (att || []).forEach((a: any) => {
      const d0 = a.attend_date || a.date || a.attendance_date || a.session_date || "";
      const d = typeof d0 === "string" ? d0.slice(0, 10) : "";
      if (!((a.status === "present" || a.status === "absent") && !!d && d <= today)) return;
      attKeySet.add(`${d}|${a.time_slot || "-"}`);
    });
    used = attKeySet.size;
  }

  // 2) 회원권은 위(1단계)에서 이미 로드됨
  const allOrdered = fifoSort(msPre || []);

  // ✅ v3.48.4: 총량 0 회원권(체험 0회권 등 placeholder)은 배정 대상에서 제외 - 항상 0으로 고정
  const zeroCap = allOrdered.filter((m: any) => ((m.total_sessions || 0) + (m.adjustment || 0)) <= 0);
  const ordered = allOrdered.filter((m: any) => ((m.total_sessions || 0) + (m.adjustment || 0)) > 0);
  for (const z of zeroCap) {
    if ((z.used_sessions || 0) !== 0) {
      await supabase.from("memberships").update({ used_sessions: 0 }).eq("id", z.id);
      z.used_sessions = 0;
    }
  }

  // 3) FIFO 재배정
  let rest = used;
  const assignLog: string[] = [];
  for (const m of ordered) {
    const cap = (m.total_sessions || 0) + (m.adjustment || 0);
    const newUsed = Math.min(cap, Math.max(0, rest));
    rest -= newUsed;
    assignLog.push(`${m.plan_name || "회원권"}(${m.start_date || "-"}~): 사용 ${newUsed}/${cap} → 잔여 ${cap - newUsed}`);
    if ((m.used_sessions || 0) !== newUsed) {
      await supabase.from("memberships").update({ used_sessions: newUsed }).eq("id", m.id);
      m.used_sessions = newUsed;
    }
  }
  // 4) 초과 출석분 → 잔여 총량이 있는 마지막 회원권에 누적 (과거 출석이 회원권 총량보다 많은 예외 케이스)
  if (rest > 0 && ordered.length > 0) {
    const lastM = ordered[ordered.length - 1];
    const cap = (lastM.total_sessions || 0) + (lastM.adjustment || 0);
    const newUsed = cap + rest;
    assignLog.push(`⚠️ 초과 ${rest}회 → 마지막 회원권에 누적 (${newUsed}/${cap}, 표시 잔여는 0으로 clamp)`);
    await supabase.from("memberships").update({ used_sessions: newUsed }).eq("id", lastM.id);
    lastM.used_sessions = newUsed;
  }
  console.log("[FIFO 재계산] 배정 결과:", assignLog);

  const after = ordered
    .map(m => `${m.plan_name}:${remainingOf(m)}/${(m.total_sessions || 0) + (m.adjustment || 0)}`)
    .join(" | ");
  return { used, after };
}
