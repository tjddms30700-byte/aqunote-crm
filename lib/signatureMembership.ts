// v3.75.1: 사인창 표시와 실제 차감에 같은 상품·기간·잔여 기준을 적용한다.
import { reservationMembershipDecision, availableReservationMemberships, isFreeReservation } from "@/lib/reservationMembership";
import { lessonProductFamily, lessonDurationMinutes, matchesLessonProduct } from "@/lib/lessonProduct";
import { remainingOf } from "@/lib/membershipFifo";
export function signatureMembershipDecision(slot: any, memberships: any[], existing?: any): any {
  if (isFreeReservation(slot)) return { id:null,activeMs:null,choices:[],reason:"free",message:"무료체험 · 회원권 차감 없음" };
  const recorded=existing?.membership_id && (existing.deduction_mode === "auto" || existing.deduction_mode === "manual_link" || existing.deducted_at);
  if (recorded) {
    const m=memberships.find(x=>x.id===existing.membership_id && x.member_id===slot.member_id);
    if(m)return {id:m.id,activeMs:m,choices:[],reason:"recorded",message:"이미 처리된 당일 사용 회원권 · 재서명 시 추가 차감 없음"};
  }
  const choice=reservationMembershipDecision(slot,memberships);
  const activeMs=choice.id?memberships.find(m=>m.id===choice.id):null;
  const available=availableReservationMemberships(slot,memberships);
  const family=lessonProductFamily(slot.lesson_name);
  const minutes=lessonDurationMinutes(slot.lesson_name);
  const label=minutes?`${family === "standard-half" ? "STANDARD-HALF" : "STANDARD"} ${minutes}분 수업`:String(slot.lesson_name || "이번 수업");
  if (choice.reason === "none") {
    const date=String(slot.event_date || "").slice(0,10);
    const held=memberships.filter(m=>m.member_id===slot.member_id && !m.deleted_at && !["cancelled","refunded"].includes(m.status) && remainingOf(m)>0);
    const same=held.filter(m=>matchesLessonProduct(slot,m,memberships));
    const notStarted=same.filter(m=>m.start_date&&String(m.start_date).slice(0,10)>date);
    if(notStarted.length)return {...choice,activeMs:null,choices:notStarted,reason:"not_started",message:`${label} 회원권 ${notStarted.length}건이 있지만 수업일보다 사용 시작일이 늦습니다. 회원권 기간을 확인해주세요.`};
    if(held.length&&!same.length)return {...choice,activeMs:null,choices:held,reason:"different_product",message:`잔여 회원권 ${held.length}건은 보유하고 있으나 ${label} 상품과 다릅니다. 수업 상품을 확인해주세요. 보유권: ${held.map(m=>`${m.plan_name} ${remainingOf(m)}회`).join(" / ")}`};
  }
  if (activeMs?.end_date && String(activeMs.end_date).slice(0,10)<String(slot.event_date || "").slice(0,10)) {
    return {...choice,activeMs,choices:available,reason:"expired_allowed",message:`기간 만료 · 잔여 ${remainingOf(activeMs)}회 사용 가능. 출석/서명 완료 시 이 회원권에서 1회 차감합니다. 만료일 자체는 변경하지 않습니다.`};
  }
  const message=choice.reason === "choose" ? `${label}에 사용 가능한 회원권이 여러 개입니다. 관리자 확인 후 연결합니다.` :
    choice.reason === "none" ? `${label}에 사용할 잔여 회원권이 없습니다. 소진·취소·환불된 권이나 다른 상품은 대신 차감하지 않습니다.` :
    slot.membership_id && slot.membership_id!==choice.id ? "이전 연결권 대신 같은 수업 상품의 사용 가능한 회원권을 표시합니다. 서명 저장 시 연결·차감합니다." : "선택한 수업 상품의 사용 회원권";
  return {...choice,activeMs,choices:available,message};
}
