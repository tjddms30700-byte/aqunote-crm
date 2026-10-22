// v3.75.0: 예약 연결만 관리하며 예약 저장 시 회차를 차감하지 않는다.
import { remainingOf } from "@/lib/membershipFifo";
import { resolveBillingCategory } from "@/lib/billingCategory";
import { matchesLessonProduct } from "@/lib/lessonProduct";
export function isFreeReservation(slot: any): boolean {
  return String(slot?.lesson_name || "").replace(/\s/g, "") === "무료체험" || slot?.metadata?.billing_kind === "free_trial";
}
export function availableReservationMemberships(slot: any, memberships: any[]): any[] {
  if (isFreeReservation(slot)) return [];
  const date = String(slot.event_date || "").slice(0,10);
  const trial = slot.event_type === "trial" || /체험|trial/i.test(String(slot.lesson_name || ""));
  const linked=(memberships || []).find(m=>m.id===slot.membership_id && m.member_id===slot.member_id);
  const track = resolveBillingCategory(slot,[],linked);
  const explicitTrack=!!(slot.track || slot.service_track || slot.category || linked) || /수중|지상|디바이스|리커버리|aqua|ground|device|standard|premium|advanced/i.test(String(slot.lesson_name || ""));
  const group = (c: string) => c === "aqua" ? "aqua" : "ground";
  return (memberships || []).filter(m => m.member_id === slot.member_id && !m.deleted_at && !["cancelled","refunded"].includes(m.status) &&
    matchesLessonProduct(slot,m,memberships) && remainingOf(m) > 0 && (!m.start_date || String(m.start_date).slice(0,10) <= date) &&
    !/무료체험/.test(String(m.plan_name || "")) && trial === /체험|trial/i.test(String(m.plan_name || "")) && (!explicitTrack || group(resolveBillingCategory(m)) === group(track)));
}
export function reservationMembershipDecision(slot: any, memberships: any[]): { id: string | null; reason: string; choices: any[] } {
  if (isFreeReservation(slot)) return { id:null, reason:"free", choices:[] };
  const choices = availableReservationMemberships(slot,memberships);
  if (slot.membership_id && choices.some(m => m.id === slot.membership_id)) return { id:slot.membership_id, reason:"keep", choices };
  // 기존에 지정한 만료권은 잔여가 있으면 유지한다. 미지정일 때는 기간 내 권을 우선 제안한다.
  const date=String(slot.event_date || "").slice(0,10);
  const inDate=choices.filter(m=>!m.end_date || String(m.end_date).slice(0,10)>=date);
  const preferred=inDate.length?inDate:choices;
  if (preferred.length === 1) return { id:preferred[0].id, reason:"unique", choices };
  return { id:null, reason:preferred.length ? "choose" : "none", choices };
}
