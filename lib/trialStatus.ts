import {deskRpc} from './deskBooking';
export const TRIALS_CHANGED='aqunote-trials-changed';
export function trialPaid(slot:any):boolean{if(slot?.payment_status==='unpaid')return false;return slot?.payment_status==='paid'||slot?.trial_balance_paid===true;}
/** Resolve actual receipt state once per batch; never guess from a name or a paid-looking badge. */
export async function hydrateTrialStatuses(rows:any[]):Promise<any[]>{const slots=(rows||[]).filter(s=>s.workflow_kind==='trial_split');if(!slots.length)return rows;const states=new Map<string,any>();for(let i=0;i<slots.length;i+=500){const response=await deskRpc('desk_trial_statuses',{p_slots:slots.slice(i,i+500).map(s=>s.id)});if(!Array.isArray(response))throw new Error('체험 결제 상태 응답을 확인하지 못했습니다. 새로고침해주세요.');response.forEach(s=>states.set(s.slot_id,s));}return rows.map(s=>{const q=states.get(s.id);return q?{...s,trial_balance_paid:q.balance_paid,payment_status:q.payment_status,is_unpaid:q.balance_paid?false:s.is_unpaid}:s;});}
export function notifyTrialsChanged(){window.dispatchEvent(new Event(TRIALS_CHANGED));window.dispatchEvent(new Event('aqunote-mobile-work-changed'));window.dispatchEvent(new Event('aqunote-payments-changed'));}
export function weekDay(date:string){return new Date(date+'T12:00:00').getDay();}
export function firstWeekDay(base:string,dow:number){const d=new Date(base+'T12:00:00');const current=(d.getDay()+6)%7;d.setDate(d.getDate()-current+7+((dow+6)%7));return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
