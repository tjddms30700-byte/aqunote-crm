// v3.73.2: 무료체험 미차감·유료체험은 결제된 체험권만.
// v3.73.1: 회원권을 추측하지 않는다. 출석/수업에 연결된 권 또는 사용자가 명시한 권만 처리한다.
import { supabase } from "@/lib/supabase";
import { remainingOf } from "@/lib/membershipFifo";

export const USAGE_CANCELLED = "회원권 선택이 취소되어 저장하지 않았습니다.";
export const countedStatus = (status: any): boolean =>
  ["present", "absent", "done", "completed", "noshow", "cancel"].includes(String(status || "").toLowerCase());
const day = (value: any) => String(value || "").slice(0, 10);
const attendanceDay = (row: any) => day(row?.attend_date || row?.date || row?.attendance_date || row?.session_date);

/** 순수 정책 함수: 과거 미연결 출석에는 나중에 구입한 권을 소급 연결/차감하지 않는다. */
export function usageDecision(previous: any, slot: any, nextStatus: string | null) {
  const previousCounted = countedStatus(previous?.status) || countedStatus(slot?.status);
  const previousId = previous?.membership_id || (previousCounted ? slot?.membership_id : null) || null;
  const nextCounted = countedStatus(nextStatus);
  return {
    previousCounted, previousId, nextCounted,
    needsSelection: nextCounted && !previousCounted && !previousId && !slot?.membership_id,
    legacyUnlinked: previousCounted && !previousId,
  };
}

/** 후보가 1건이어도 자동 선택하지 않고 상품명·기간·잔여를 보여주고 번호를 직접 입력받는다. */
export const isTrialMembership = (m: any): boolean => /체험|trial/i.test(String(m?.plan_name || "")) && !/무료/.test(String(m?.plan_name || ""));
export function lessonBillingKind(slot: any): "free" | "trial" | "regular" {
  const label = String(slot?.lesson_name || "").replace(/\s/g, "");
  if (label === "무료체험" || slot?.metadata?.billing_kind === "free_trial") return "free";
  return slot?.event_type === "trial" || /체험|trial/i.test(label) ? "trial" : "regular";
}

export function chooseActualMembership(list: any[], memberId: string, date: string, trialOnly = false): any {
  const eligible = list.filter(m => m.member_id === memberId && m.status !== "cancelled" && !m.deleted_at &&
    !/무료체험/.test(String(m.plan_name || "").replace(/\s/g, "")) && (trialOnly ? isTrialMembership(m) : !isTrialMembership(m)) &&
    remainingOf(m) > 0 && (!m.start_date || day(m.start_date) <= date) &&
    (!m.end_date || day(m.end_date) >= date));
  if (!eligible.length) throw new Error("수업일에 사용 가능한 회원권이 없습니다. 회원권 기간과 잔여 횟수를 확인해주세요.");
  const description = eligible.map((m, i) => `${i + 1}. ${m.plan_name || "회원권"} · 잔여 ${remainingOf(m)}회 · ${m.start_date || "-"}~${m.end_date || "-"}`).join("\n");
  const answer = window.prompt(`실제 사용한 회원권 선택\n수업일: ${date}\n\n${description}\n\n사용한 회원권 번호를 입력해주세요.\n자동 선택하지 않으며, 취소하면 저장하지 않습니다.`, "");
  if (answer === null) throw new Error(USAGE_CANCELLED);
  if (!/^[1-9]\d*$/.test(answer.trim())) throw new Error("목록에 있는 회원권 번호를 입력해주세요. 저장하지 않았습니다.");
  const selected = eligible[Number(answer.trim()) - 1];
  if (!selected) throw new Error("목록에 없는 회원권 번호입니다. 저장하지 않았습니다.");
  return selected;
}

type SaveOptions = {
  memberId: string; date: string; status: string | null;
  slot?: any; existing?: any; extra?: Record<string, any>; orgId?: string | null;
  slotStatus?: string; timeSlot?: string | null;
};

/** 한 수업에 대한 저장 경로를 통일한다. 새 출석의 대상 선택은 모든 쓰기 전에 완료한다.
 * REST 여러 요청이므로 DB 트랜잭션은 아니다. 실패 시 완료된 쓰기를 원래 값으로 복구한다.
 * usage CAS 및 DB 최신 출석 재조회로 반복 저장/오래된 UI의 중복 차감을 방어한다.
 */
export async function saveActualAttendance(options: SaveOptions): Promise<{
  deducted: boolean; restored: boolean; warning: string; membershipId: string | null;
}> {
  const { memberId, date, status, extra = {}, orgId } = options;
  if (!memberId || !date) throw new Error("회원과 수업일이 필요합니다.");
  let slot: any = null;
  if (options.slot?.id) {
    const r = await supabase.from("schedule_slots").select("*").eq("id", options.slot.id).eq("member_id", memberId).maybeSingle();
    if (r.error) throw r.error;
    if (!r.data || r.data.deleted_at) throw new Error("수업을 찾을 수 없거나 삭제되었습니다. 새로고침 후 다시 시도해주세요.");
    slot = r.data;
    if (day(slot.event_date) !== date) throw new Error("출석일과 수업일이 다릅니다. 저장하지 않았습니다.");
  }
  let time = options.timeSlot || slot?.time_slot || options.existing?.time_slot || null;
  if (!slot) {
    const next = new Date(date + "T00:00:00Z"); next.setUTCDate(next.getUTCDate() + 1);
    let query = supabase.from("schedule_slots").select("*").eq("member_id", memberId)
      .gte("event_date", date).lt("event_date", next.toISOString().slice(0, 10)).is("deleted_at", null);
    if (time) query = query.eq("time_slot", time);
    const sr = await query;
    if (sr.error) throw sr.error;
    if ((sr.data || []).length > 1) throw new Error("같은 날 수업이 여러 개입니다. 시간표에서 해당 수업을 직접 선택해주세요.");
    slot = sr.data?.[0] || null;
    time = time || slot?.time_slot || null;
  }
  const ar = await supabase.from("attendance").select("*").eq("member_id", memberId)
    .or(`attend_date.eq.${date},date.eq.${date},attendance_date.eq.${date},session_date.eq.${date}`);
  if (ar.error) throw ar.error;
  const rows = (ar.data || []).filter((a: any) => !a.deleted_at && attendanceDay(a) === date);
  let candidates = slot ? rows.filter((a: any) => a.slot_id === slot.id) : [];
  if (!candidates.length && options.existing?.id) candidates = rows.filter((a: any) => a.id === options.existing.id);
  if (!candidates.length) candidates = rows.filter((a: any) => (!a.slot_id || !slot) && (time ? a.time_slot === time : !a.time_slot));
  if (!candidates.length && slot && rows.length === 1 && !rows[0].slot_id && !rows[0].time_slot) {
    const sr = await supabase.from("schedule_slots").select("id, event_date").eq("member_id", memberId).is("deleted_at", null);
    if (sr.error) throw sr.error;
    if ((sr.data || []).filter((row: any) => day(row.event_date) === date).length === 1) candidates = rows;
    else throw new Error("과거 출석 기록에 수업 시간이 없어 여러 수업 중 어느 기록인지 확인이 필요합니다.");
  }
  if (candidates.length > 1) throw new Error("같은 수업에 출석 기록이 여러 건입니다. 중복 기록을 먼저 확인해주세요.");
  const previous = candidates[0] || null;
  if (!slot && previous?.slot_id) {
    const r = await supabase.from("schedule_slots").select("*").eq("id", previous.slot_id).eq("member_id", memberId).maybeSingle();
    if (r.error) throw r.error;
    slot = r.data;
    if (slot && day(slot.event_date) !== date) throw new Error("연결된 수업일이 다릅니다.");
  }
  if (previous?.membership_id && slot?.membership_id && previous.membership_id !== slot.membership_id) {
    throw new Error("출석과 수업에 서로 다른 회원권이 연결되어 있습니다. 임의로 차감하지 않았습니다.");
  }
  const decision = usageDecision(previous, slot, status);
  const mr = await supabase.from("memberships").select("*").eq("member_id", memberId);
  if (mr.error) throw mr.error;
  const memberships = mr.data || [];
  let membershipId: string | null = decision.previousId || slot?.membership_id || null;
  let target: any = membershipId ? memberships.find((m: any) => m.id === membershipId) : null;
  if (membershipId && !target) throw new Error("연결된 회원권이 이 회원의 회원권이 아니거나 삭제되었습니다.");
  const billingKind = lessonBillingKind(slot);
  if (billingKind === "free") {
    // 과거 차감 복원은 증빙 대조 후 별도로 수행한다. 재서명만으로 추정 복원하지 않는다.
    if (decision.previousCounted && decision.previousId) throw new Error("무료체험에 과거 회원권 차감이 연결돼 있습니다. 관리자 대조·정리 후 저장해주세요. 추가 차감하지 않았습니다.");
    membershipId = null; target = null;
  }
  if (decision.needsSelection && billingKind !== "free") {
    target = chooseActualMembership(memberships, memberId, date, billingKind === "trial");
    membershipId = target.id;
  }
  // 이미 출석 처리된 미연결 과거 기록은 재서명/상태변경 시에도 소급 차감하지 않는다.
  if (decision.legacyUnlinked) { membershipId = null; target = null; }
  let previousUsed = decision.previousCounted && !!decision.previousId;
  if (["carried_over", "refunded"].includes(slot?.noshow_action)) previousUsed = false;
  const nextSlotStatus = options.slotStatus || ({ present: "done", absent: "noshow", sick: "sick", personal: "personal" } as Record<string, string>)[status || ""] || "scheduled";
  const policy = target?.noshow_policy || "deduct";
  const nextAction = nextSlotStatus === "noshow" ? (policy === "carryover" ? "carried_over" : policy === "refund" ? "refunded" : "deducted") : null;
  const nextUsed = billingKind !== "free" && decision.nextCounted && !!membershipId && !["carried_over", "refunded"].includes(nextAction || "");
  const delta = Number(nextUsed) - Number(previousUsed);
  if (delta > 0 && (!target || target.status === "cancelled" || remainingOf(target) < 1 ||
    (target.start_date && day(target.start_date) > date) || (target.end_date && day(target.end_date) < date))) {
    throw new Error("선택된 회원권의 기간 또는 잔여 횟수가 수업일에 맞지 않습니다. 다른 회원권으로 자동 차감하지 않았습니다.");
  }
  if (nextUsed && target) {
    const trial = isTrialMembership(target);
    if ((billingKind === "trial" && !trial) || (billingKind === "regular" && trial)) {
      throw new Error("체험 수업은 체험권에서만, 정규 수업은 정규 회원권에서만 차감할 수 있습니다. 저장하지 않았습니다.");
    }
    if (trial) {
      const pr = await supabase.from("payments").select("*").eq("member_id", memberId);
      if (pr.error) throw pr.error;
      const paid = (pr.data || []).some((p: any) => !p.deleted_at && !p.is_cancelled && !p.cancelled_at && p.status !== "cancelled" &&
        (p.membership_id === target.id || (target.payment_id && p.id === target.payment_id)) &&
        Number(p.amount || 0) - Number(p.discount_amount || 0) - Number(p.refunded_amount || 0) - Number(p.unpaid_amount || 0) > 0);
      if (!paid) throw new Error("결제 내역이 확인되는 체험권만 차감할 수 있습니다. 무료체험은 무료체험으로 등록해주세요. 정규 회원권은 차감하지 않았습니다.");
    }
  }
  const carryDelta = Number(nextAction === "carried_over" && !!target) - Number(slot?.noshow_action === "carried_over" && !!target);
  const now = new Date().toISOString();
  const payload: any = {
    ...extra, member_id: memberId, attend_date: date, status,
    slot_id: slot?.id || previous?.slot_id || null, time_slot: time,
    membership_id: decision.nextCounted ? membershipId : null,
    deducted_at: nextUsed ? (previous?.deducted_at || now) : null,
    deduction_mode: nextUsed ? "auto" : null,
  };
  if (orgId) payload.org_id = orgId;
  const slotPatch: any = { status: nextSlotStatus, membership_id: membershipId };
  if (nextAction || slot?.noshow_action) slotPatch.noshow_action = nextAction;
  let writtenId: string | null = null;
  let attendanceWritten = false, slotWritten = false, usageWritten = false;
  let createdSlotId: string | null = null;
  const originalUsed = Number(target?.used_sessions || 0);
  const newUsed = Math.max(0, originalUsed + delta);
  const usagePatch: any = { used_sessions: newUsed };
  if (carryDelta) usagePatch.carryover_count = Math.max(0, (target?.carryover_count || 0) + carryDelta);
  // 보조 표시 컬럼만 생략할 수 있다. 회원권·날짜·상태·수업 연결 컬럼은 절대 버리지 않는다.
  const optional = new Set(["saved_at", "signer_role", "deducted_at", "deduction_mode"]);
  async function writeAttendance(): Promise<any> {
    let p = { ...payload };
    for (let i = 0; i < 5; i++) {
      const r = previous
        ? await supabase.from("attendance").update(p).eq("id", previous.id).select("id").single()
        : await supabase.from("attendance").insert(p).select("id").single();
      if (!r.error) return r.data;
      const match = /(?:Could not find the |column )['"]([^'"]+)['"]/i.exec(r.error.message || "");
      if (match && optional.has(match[1]) && match[1] in p) { delete p[match[1]]; continue; }
      throw r.error;
    }
    throw new Error("출석 저장 재시도에 실패했습니다.");
  }
  try {
    if (status) {
      const saved = await writeAttendance();
      writtenId = saved.id;
      attendanceWritten = true;
    } else if (previous) {
      const r = await supabase.from("attendance").delete().eq("id", previous.id).select("id").single();
      if (r.error) throw r.error;
      attendanceWritten = true;
    }
    if (!slot && status) {
      const newSlot: any = { ...slotPatch, member_id: memberId, event_date: date, time_slot: time || "00:00", event_type: "lesson" };
      if (orgId) newSlot.org_id = orgId;
      const created = await supabase.from("schedule_slots").insert(newSlot).select("id").single();
      if (created.error) throw created.error;
      createdSlotId = created.data.id;
      const linked = await supabase.from("attendance").update({ slot_id: createdSlotId, time_slot: time || "00:00" }).eq("id", writtenId!).select("id").single();
      if (linked.error) throw linked.error;
    }
    if (slot) {
      const r = await supabase.from("schedule_slots").update(slotPatch).eq("id", slot.id).eq("member_id", memberId).select("id").single();
      if (r.error) throw r.error;
      slotWritten = true;
    }
    if (target && (delta || carryDelta)) {
      // DB 출석 트리거가 먼저 동일한 차감을 처리한 경우 클라이언트에서 중복 가산하지 않는다.
      const current = await supabase.from("memberships").select("*").eq("id", target.id).single();
      if (current.error) throw current.error;
      const alreadyApplied = Number(current.data.used_sessions || 0) === newUsed &&
        (!carryDelta || Number(current.data.carryover_count || 0) === usagePatch.carryover_count);
      if (!alreadyApplied) {
        if (Number(current.data.used_sessions || 0) !== originalUsed) throw new Error("다른 화면에서 회원권이 변경되었습니다. 새로고침 후 다시 시도해주세요.");
        let q = supabase.from("memberships").update(usagePatch).eq("id", target.id).eq("member_id", memberId);
        q = target.used_sessions == null ? q.is("used_sessions", null) : q.eq("used_sessions", originalUsed);
        const r = await q.select("id").single();
        if (r.error) throw r.error;
        usageWritten = true;
      }
    }
  } catch (error: any) {
    const rollbackErrors: string[] = [];
    if (attendanceWritten) {
      let r: any;
      if (previous && !status) r = await supabase.from("attendance").insert(previous);
      else if (previous) {
        const restore: any = {};
        for (const key of Object.keys(payload)) if (key in previous) restore[key] = previous[key];
        r = await supabase.from("attendance").update(restore).eq("id", previous.id);
      } else r = await supabase.from("attendance").delete().eq("id", writtenId!);
      if (r.error) rollbackErrors.push("출석");
    }
    if (slotWritten) {
      const restore: any = { status: slot.status, membership_id: slot.membership_id || null };
      if ("noshow_action" in slotPatch) restore.noshow_action = slot.noshow_action || null;
      const r = await supabase.from("schedule_slots").update(restore).eq("id", slot.id);
      if (r.error) rollbackErrors.push("시간표");
    }
    if (createdSlotId) {
      const r = await supabase.from("schedule_slots").delete().eq("id", createdSlotId);
      if (r.error) rollbackErrors.push("자동 생성 시간표");
    }
    if (usageWritten) {
      const restore: any = { used_sessions: originalUsed };
      if (carryDelta) restore.carryover_count = target.carryover_count || 0;
      const r = await supabase.from("memberships").update(restore).eq("id", target.id).eq("used_sessions", newUsed);
      if (r.error) rollbackErrors.push("회원권");
    }
    throw new Error((error?.message || String(error)) + (rollbackErrors.length ? `\n⚠️ ${rollbackErrors.join("·")} 복구 확인이 필요합니다. 다시 저장하지 말고 관리자에게 알려주세요.` : "\n저장을 중단했습니다."));
  }
  return { deducted: delta > 0, restored: delta < 0, membershipId,
    warning: decision.legacyUnlinked ? "과거 출석의 사용 회원권이 미지정이라 소급 차감·복원하지 않았습니다." : "" };
}
