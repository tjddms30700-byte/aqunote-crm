"use client";
import {useEffect,useState,useRef} from 'react';
import {deskRpc} from '@/lib/deskBooking';
import {remainingOf} from '@/lib/membershipFifo';
import TrialHoldingDialog from './TrialHoldingDialog';
import {trialPaid,notifyTrialsChanged} from '@/lib/trialStatus';
const b='min-h-12 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40';
export function BookingBadges({slot}:{slot:any}){if(slot.status==='holding')return <span className="compact-holding-slot">🔒 {slot.member_name||'회원'} 체험 홀딩 ({String(slot.time_slot||'').slice(0,5)})</span>;return <span className="booking-badges-compact">{slot.event_type==='trial'&&<span className="trial-type-badge">체험</span>}{slot.workflow_kind==='trial_split'&&<span className={'trial-balance-badge'+(trialPaid(slot)?' trial-balance-paid':'')}>{trialPaid(slot)?'잔금 수납 완료':'잔금 3.5만 미납'}</span>}{slot.is_unpaid&&<span className="trial-balance-badge">결제예정</span>}</span>}
export default function BookingWorkflowActions({slot,onChanged}:{slot:any;onChanged:()=>void|Promise<void>}){
 const [converting,setConverting]=useState(false);const [trial,setTrial]=useState<any>(null),[ms,setMs]=useState<any[]>([]),[selected,setSelected]=useState(''),[method,setMethod]=useState('card'),[error,setError]=useState(''),[busy,setBusy]=useState(false);const lock=useRef(false);
 const applicable=!!slot.workflow_kind?.startsWith('trial')||!!slot.is_unpaid;
 useEffect(()=>{if(!applicable)return;let stop=false;void (async()=>{try{const [t,r]=await Promise.all([deskRpc('desk_trial_state',{p_slot:slot.id}),deskRpc('desk_booking_resources',{p_member:slot.member_id})]);if(!stop){setTrial(t);setMs((r.memberships||[]).filter((m:any)=>remainingOf(m)>0&&!/체험|trial|무료/i.test(m.plan_name)));}}catch(e:any){if(!stop)setError(e.message);}})();return()=>{stop=true;};},[slot.id,slot.is_unpaid,slot.trial_balance_paid,applicable]);
 async function run(name:string,args:any,text:string){if(lock.current||!window.confirm(text))return;lock.current=true;setBusy(true);setError('');try{const result=await deskRpc(name,args);if(name==='desk_trial_balance'&&result.balance_paid){setTrial((t:any)=>({...t,balance_paid:true}));}try{await onChanged();notifyTrialsChanged();}catch{setError('처리는 저장되었습니다. 같은 결제를 다시 누르지 말고 시간표를 새로고침해주세요.');}}catch(e:any){setError(e.message);}finally{lock.current=false;setBusy(false);}}
 if(!applicable)return null;
 return <section aria-label="체험 및 결제예정 처리" className="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
 {trial&&!trial.balance_paid&&slot.status!=='holding'&&<><label className="block text-xs">잔금 수납 수단<select aria-label="잔금 결제 수단" className={b+' mt-1 w-full bg-white'} disabled={busy} value={method} onChange={e=>setMethod(e.target.value)}><option value="card">카드</option><option value="transfer">계좌이체</option></select></label><button disabled={busy} className={b+' w-full bg-teal-800 text-white'} onClick={()=>void run('desk_trial_balance',{p_slot:trial.slot_id,p_method:method},'잔금 35,000원을 실제 수납했나요? 결제 기록 추가와 체험 출석/1회 차감을 함께 처리합니다. 카드/계좌에서 실제 결제하는 기능은 아닙니다.')}>✅ 잔금 35,000원 결제 및 출석 완료</button></>}
 {slot.is_unpaid&&<><label className="block text-xs">사용할 정규 회원권<select aria-label="전환 정규 회원권" className={b+' mt-1 w-full bg-white'} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">회원권 선택</option>{ms.map(m=><option key={m.id} value={m.id}>{m.plan_name} · 잔여 {remainingOf(m)}회</option>)}</select></label>{ms.length===0&&<p className="text-xs">정규 회원권을 <a className="underline" href="/payments">결제 등록</a> 후 다시 열어주세요. 서로 다른 상품은 자동 연결하지 않습니다.</p>}</>}
 {trial&&!trial.decision&&<div className="grid gap-2"><button disabled={busy||!trial.balance_paid} className={b+' bg-white'} onClick={()=>setConverting(true)}>정규 등록으로 전환 · 요일/시간 변경</button><button disabled={busy} className={b+' bg-white'} onClick={()=>void run('desk_trial_decide',{p_slot:trial.slot_id,p_decision:'ended',p_membership:null},'미등록으로 종료하고 홀딩 자리를 비울까요? 기존 수납과 출석은 유지합니다.')}>체험 종료(미등록) · 홀딩 해제</button></div>}
 {converting&&<TrialHoldingDialog slot={slot} startEditing onClose={()=>setConverting(false)} onSaved={onChanged}/>}
 {trial?.decision&&<p className="text-xs">처리 완료: {trial.decision==='regular'?'정규 등록 전환':'미등록 종료·홀딩 해제'}</p>}
 {slot.is_unpaid&&<button disabled={busy||!selected} className={b+' w-full bg-white'} onClick={()=>void run('desk_settle',{p_slot:slot.id,p_membership:selected},'선택한 실제 결제 회원권과 연결할까요? 예약은 연결만 하고, 이 결제예정 수업이 이미 출석 완료된 경우에만 1회 정산합니다.')}>실제 결제 회원권 연결/정산</button>}
 {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </section>;
}
