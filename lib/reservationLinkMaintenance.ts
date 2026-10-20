// v3.75.0: 확인한 예약만 연결 변경한다. 출결/회원권 회차/결제는 업데이트하지 않는다.
import { supabase } from "@/lib/supabase";
import { reservationMembershipDecision } from "@/lib/reservationMembership";
export function planReservationLinks(slots: any[], memberships: any[], signedSlotIds: Set<string> = new Set()): any {
  const changes: any[] = [], needsChoice: any[] = [], unavailable: any[] = [];
  for (const s of slots || []) {
    if (!s.member_id || s.deleted_at || !["scheduled","reserved"].includes(s.status) || !["lesson","trial","makeup"].includes(s.event_type) || signedSlotIds.has(s.id)) continue;
    const choice = reservationMembershipDecision(s,memberships);
    if (choice.reason === "unique" && choice.id !== s.membership_id) changes.push({ slot:s, membershipId:choice.id });
    else if (choice.reason === "choose") needsChoice.push(s);
    else if (choice.reason === "none") unavailable.push(s);
  }
  return { changes, needsChoice, unavailable };
}
export async function applyReservationLinks(changes: any[]): Promise<{ updated:number; skipped:number }> {
  let updated=0,skipped=0;
  for (const change of changes) {
    const s=change.slot;
    const sr=await supabase.from("schedule_slots").select("*").eq("id",s.id).maybeSingle();
    if(sr.error)throw sr.error;
    const current=sr.data;
    if(!current || current.deleted_at || !["scheduled","reserved"].includes(current.status) || current.member_id!==s.member_id || current.membership_id!==s.membership_id){skipped++;continue;}
    const ar=await supabase.from("attendance").select("id").eq("slot_id",s.id).is("deleted_at",null);
    if(ar.error)throw ar.error;
    if(ar.data?.length){skipped++;continue;}
    const mr=await supabase.from("memberships").select("*").eq("member_id",current.member_id);
    if(mr.error)throw mr.error;
    const fresh=reservationMembershipDecision(current,mr.data || []);
    if(fresh.reason!=="unique" || fresh.id!==change.membershipId){skipped++;continue;}
    let q=supabase.from("schedule_slots").update({membership_id:change.membershipId}).eq("id",s.id).eq("status",current.status).eq("member_id",current.member_id);
    q=current.membership_id==null?q.is("membership_id",null):q.eq("membership_id",current.membership_id);
    if(current.updated_at)q=q.eq("updated_at",current.updated_at);
    const r=await q.select("id");if(r.error)throw r.error;
    if(r.data?.length===1)updated++;else skipped++;
  }
  return {updated,skipped};
}
