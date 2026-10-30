import { resolveBillingCategory } from "@/lib/billingCategory";
import { isPaymentCancelled } from "@/lib/paymentCancellation";
export function paymentDay(value:any):string {return typeof value==="string"?value.slice(0,10):"";}
export function paymentInCalendarTrack(payment:any,track:string,memberships:any[]=[],plans:any[]=[]):boolean {
 const membership=memberships.find(m=>m.id===payment.membership_id)||payment.memberships;
 const category=resolveBillingCategory(payment,plans,membership);
 // 달력의 지상재활 탭은 리커버리(device)를 포함합니다. 결제 원본 분류는 변경하지 않습니다.
 return track==="ground" ? category==="ground"||category==="device" : category===track;
}
export function calendarPaymentNet(payment:any,memberships:any[]=[]):number {
 return isPaymentCancelled(payment,memberships)?0:Math.max(0,Number(payment.amount||0)-Number(payment.discount_amount||0)-Number(payment.refunded_amount||0));
}
export function normalizeClockTime(value:unknown):string|null {
 const s=String(value??"").trim();const match=s.match(/^(\d{1,2}):(\d{2})$/)||s.match(/^(\d{2})(\d{2})$/);
 if(!match)return null;const h=Number(match[1]),m=Number(match[2]);return h<24&&m<60?String(h).padStart(2,"0")+":"+String(m).padStart(2,"0"):null;
}
