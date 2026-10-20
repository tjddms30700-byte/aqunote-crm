// v3.74.3: 일정 편집창의 완료/복원도 출결 공용 저장 경로를 사용한다.
import { supabase } from "@/lib/supabase";
import { saveActualAttendance, countedStatus } from "@/lib/actualMembershipUsage";
export async function saveScheduleAttendance(input: any): Promise<any> {
  const { payload, id, historicalHandling } = input;
  const next = payload.status || "scheduled";
  const statuses: Record<string, string | null> = { done: "present", completed: "present", noshow: "absent", cancel: "absent", sick: "sick", personal: "personal", scheduled: null, carryover: null };
  if (!(next in statuses)) throw new Error("지원하지 않는 출결 상태입니다.");
  let old: any = null;
  if (id) {
    const r = await supabase.from("schedule_slots").select("*").eq("id", id).maybeSingle();
    if (r.error) throw r.error;
    old = r.data;
    if (!old || old.deleted_at) throw new Error("수업을 찾을 수 없습니다. 새로고침 후 확인해주세요.");
    if (countedStatus(old.status) && (old.member_id !== payload.member_id || old.event_date?.slice(0,10) !== payload.event_date?.slice(0,10) || old.time_slot !== payload.time_slot)) throw new Error("완료 수업의 회원·날짜·시간 변경은 먼저 출결을 예약으로 되돌린 뒤 진행해주세요.");
  }
  const structural: any = { ...payload };
  delete structural.status; delete structural.membership_id;
  let slot: any = old; let created = false; let edited = false;
  try {
    if (!old) {
      const r = await supabase.from("schedule_slots").insert({ ...structural, status: "scheduled", membership_id: null }).select("*").single();
      if (r.error) throw r.error;
      slot = r.data; created = true;
    } else {
      const r = await supabase.from("schedule_slots").update(structural).eq("id", id).select("*").single();
      if (r.error) throw r.error;
      slot = r.data; edited = true;
    }
    const r = await saveActualAttendance({ memberId: payload.member_id, date: String(payload.event_date).slice(0,10), status: statuses[next], slot,
      slotStatus: next, orgId: payload.org_id, selectedMembershipId: payload.membership_id || null,
      historicalHandling, allowAutoUnique: true });
    // 예약은 차감하지 않고, 선택한 이용 예정 회원권 연결만 저장한다.
    return { ...r, slotId: slot.id };
  } catch (error: any) {
    let failed = false;
    if (created && slot?.id) {
      const ar = await supabase.from("attendance").select("id").eq("slot_id", slot.id);
      if (ar.error || ar.data?.length) failed = true;
      else { const r = await supabase.from("schedule_slots").delete().eq("id", slot.id).select("id"); if (r.error || r.data?.length !== 1) failed = true; }
    } else if (edited && old) {
      const restore: any = {};
      for (const key of Object.keys(structural)) restore[key] = old[key] ?? null;
      const r = await supabase.from("schedule_slots").update(restore).eq("id", id).select("id");
      if (r.error || r.data?.length !== 1) failed = true;
    }
    throw new Error((error?.message || String(error)) + (failed ? "\n저장 상태 확인이 필요합니다. 재저장하지 말고 관리자에게 알려주세요." : ""));
  }
}
