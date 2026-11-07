/** v3.89.0 read-only billing projections. No client, writes or membership reallocation. */
export type TicketView = 'all'|'regular'|'trial';
const number=(v:any):number=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const state=(v:any)=>String(v||'').trim().toLowerCase();
export function koreanToday(now:Date=new Date()):string{return new Date(now.getTime()+9*3600000).toISOString().slice(0,10);}
export function billingDay(v:any):string{if(!v)return '';const s=String(v);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return validDay(s)?s:'';if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s))return validDay(s.slice(0,10))?s.slice(0,10):'';const n=new Date(s);return Number.isFinite(n.getTime())?koreanToday(n):'';}
function validDay(s:string):boolean{const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;}
export function shiftDay(day:string,n:number):string{const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function isTrialTicket(row:any,linked?:any):boolean{
 const rows=[row,linked,...[row?.memberships].flat()].filter(Boolean);
 return rows.some(r=>['ticket_type','membership_type','plan_type','plan_name','name','description'].some(k=>/체험|trial/i.test(String(r[k]||'').replace(/\s/g,'')))||r.billing_mode==='free'||String(r.notes||'').startsWith('AQUNOTE_BILLING_V1:')&&/"mode"\s*:\s*"free"/.test(r.notes));
}
export function ticketViewMatches(row:any,view:TicketView,linked?:any):boolean{return view==='all'||(view==='trial')===isTrialTicket(row,linked);}
const cancelled=new Set(['cancelled','canceled','cancel','refunded','void']);
export function isCancelledRecord(row:any):boolean{
 return !!row&&(!!(row.deleted_at||row.cancelled_at||row.canceled_at)||['true','t','1','yes','y'].includes(state(row.is_cancelled))||cancelled.has(state(row.status))||state(row.refund_status)==='full'||number(row.amount)>0&&number(row.refunded_amount)>=number(row.amount));
}
export function isBillingHistory(row:any,linked?:any):boolean{return isCancelledRecord(row)||isCancelledRecord(linked)||number(row?.refunded_amount)>0||number(row?.refund_amount)>0||['partial','full','refunded'].includes(state(row?.refund_status));}
export function ticketRemaining(row:any):number{
 if(row?.remaining_count!==null&&row?.remaining_count!==undefined&&row.remaining_count!==''&&Number.isFinite(Number(row.remaining_count)))return Math.max(0,Number(row.remaining_count));
 return Math.max(0,number(row?.total_sessions)+number(row?.adjustment)-number(row?.used_sessions));
}
export function renewalRows(tickets:any[],members:any[],today:string=koreanToday()):any[]{
 const active=new Map(members.filter(m=>m.status==='active'&&!m.deleted_at).map(m=>[m.id,m]));
 return tickets.filter(t=>active.has(t.member_id)&&!isTrialTicket(t)&&!isCancelledRecord(t)).map(t=>{
  const rawEnd=t.expire_date||t.end_date;const end=billingDay(rawEnd),start=billingDay(t.start_date);const rem=ticketRemaining(t);
  const days=end?Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000):null;
  const expired=rem===0||!!end&&end<today||['expired','exhausted','finished'].includes(state(t.status));
  const valid=!expired&&(!rawEnd||!!end)&&(!t.start_date||!!start&&start<=today)&&(!t.status||state(t.status)==='active');
  return {...t,_member:active.get(t.member_id),_remaining:rem,_carryover:number(t.carryover_count),_daysToExpire:days,_isExpired:expired,_isValidTicket:valid,
   _isExpiringSoon:valid&&rem>0&&!!end&&end>=today&&end<=shiftDay(today,7),_isRemainingLow:valid&&rem>=1&&rem<=3};
 });
}
export function renewalCounts(rows:any[]){return {auto_renew:rows.filter(r=>r._isValidTicket&&r.auto_renew===true).length,expiring:rows.filter(r=>r._isExpiringSoon).length,remaining_low:rows.filter(r=>r._isRemainingLow).length,all:rows.filter(r=>r._isValidTicket).length,history:rows.filter(r=>r._isExpired).length};}
export function paymentNet(row:any):number{return isCancelledRecord(row)?0:Math.max(0,number(row?.amount)-number(row?.discount_amount)-number(row?.refunded_amount)-number(row?.unpaid_amount));}
export type RevenueRow={id:string;source:'payment'|'schedule';amount:number;date:string;member_id:string;label:string};
function meta(row:any):any{if(row?.metadata&&typeof row.metadata==='object')return row.metadata;try{return JSON.parse(row?.metadata||'{}');}catch{return {};}}
export function revenueRows(payments:any[],slots:any[],memberships:any[],today:string=koreanToday()):RevenueRow[]{
 const passes=new Map(memberships.map(m=>[m.id,m]));const paymentIds=new Set(payments.map(p=>p.id));
 const linkedSlots=new Set(payments.flatMap(p=>[p.slot_id,p.schedule_slot_id,p.revenue_slot_id,meta(p).slot_id,meta(p).schedule_slot_id]).filter(Boolean));
 const receipts:RevenueRow[]=payments.filter(p=>!isCancelledRecord(p)&&!isCancelledRecord(passes.get(p.membership_id)||p.memberships)).map(p=>({id:p.id,source:'payment',amount:paymentNet(p),date:billingDay(p.paid_at||p.created_at),member_id:p.member_id,label:p.plan_name||p.description||'결제'}));
 const manual:RevenueRow[]=slots.filter(s=>s.event_type==='revenue'&&!isCancelledRecord(s)&&!linkedSlots.has(s.id)&&![s.payment_id,meta(s).payment_id].some(id=>id&&paymentIds.has(id))).map(s=>({id:s.id,source:'schedule',amount:paymentNet(s),date:billingDay(s.event_date||s.paid_at||s.created_at),member_id:s.member_id,label:s.lesson_name||'별도 시간표 매출'}));
 return [...receipts,...manual].filter(r=>r.amount>0&&!!r.date&&r.date<=today).sort((a,b)=>b.date.localeCompare(a.date));
}
export function revenueSummary(rows:RevenueRow[],today:string=koreanToday()){
 const currentMonth=today.slice(0,7),day=Number(today.slice(8));const d=new Date(today+'T00:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);const previousMonth=d.toISOString().slice(0,7);
 const lastDay=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();const previousCutoff=previousMonth+'-'+String(Math.min(day,lastDay)).padStart(2,'0');
 const current=rows.filter(r=>r.date.slice(0,7)===currentMonth&&r.date<=today).reduce((s,r)=>s+r.amount,0);
 const previous=rows.filter(r=>r.date.slice(0,7)===previousMonth&&r.date<=previousCutoff).reduce((s,r)=>s+r.amount,0);
 return {total:rows.reduce((s,r)=>s+r.amount,0),current,previous,previousMonth,previousCutoff,growth:previous>0?(current-previous)/previous*100:null,members:new Set(rows.filter(r=>r.member_id).map(r=>r.member_id)).size};
}
export function revenueSeries(rows:RevenueRow[],period:'month'|'week',today:string=koreanToday()){
 const start=new Date(today+'T00:00:00Z');if(period==='month')start.setUTCDate(1);else start.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7));
 return Array.from({length:12},(_,i)=>{const date=new Date(start);if(period==='month')date.setUTCMonth(date.getUTCMonth()-(11-i));else date.setUTCDate(date.getUTCDate()-(11-i)*7);const first=date.toISOString().slice(0,10);const next=new Date(date);if(period==='month')next.setUTCMonth(next.getUTCMonth()+1);else next.setUTCDate(next.getUTCDate()+7);const end=next.toISOString().slice(0,10);return {key:period==='month'?first.slice(0,7):first,label:period==='month'?first.slice(2,7).replace('-','.'):`${Number(first.slice(5,7))}/${Number(first.slice(8))}주`,amount:rows.filter(r=>r.date>=first&&r.date<end).reduce((s,r)=>s+r.amount,0)};});
}
/** Stable ordered pages; never silently treat a truncated/error result as the full population. */
export async function readBillingPages(make:(from:number,to:number)=>any):Promise<any[]>{const rows:any[]=[];const seen=new Set();for(let page=0;page<100;page++){const r=await make(page*1000,page*1000+999);if(r.error)throw r.error;if(!Array.isArray(r.data))throw new Error('조회 응답 형식을 확인해주세요.');for(const row of r.data){if(!seen.has(row.id)){rows.push(row);seen.add(row.id);}}if(r.data.length<1000)return rows;}throw new Error('조회량이 매우 많습니다. 지점 또는 기간을 좁혀주세요.');}
