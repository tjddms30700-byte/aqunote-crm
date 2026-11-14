import {masterTimes,masterCell,type MasterCell} from './consultationMaster';
export function masterPoolCells(data:any):MasterCell[]{return data?masterTimes(data,'aqua').flatMap(time=>[1,2,3,4,5].map(day=>masterCell(data,'aqua',day,time))):[];}
export function masterVacancies(data:any):MasterCell[]{return masterPoolCells(data).filter(c=>c.status==='open');}
const weekdays=['','월','화','수','목','금'];
export function memberFixedTimes(data:any,id:string):string[]{
 const cells:MasterCell[]=data?(['aqua','ground'] as const).flatMap(track=>masterTimes(data,track).flatMap(time=>[1,2,3,4,5].map(day=>masterCell(data,track,day,time)))):[];
 return cells.filter(c=>c.status==='fixed'&&c.member_id===id).sort((a,b)=>a.weekday-b.weekday||a.time_slot.localeCompare(b.time_slot)||a.track.localeCompare(b.track)).map(c=>`${weekdays[c.weekday]} ${c.time_slot} (${c.track==='ground'?'지상':'수중'})`);
}
export function renewalMembers(data:any){return (data?.ops?.member_balances||[]).filter((x:any)=>x.member_id&&Number.isFinite(Number(x.total_remaining))&&Number(x.total_remaining)>=0&&Number(x.total_remaining)<=2).map((x:any)=>({...x,fixed_times:memberFixedTimes(data,x.member_id)})).sort((a:any,b:any)=>Number(a.total_remaining)-Number(b.total_remaining)||String(a.name).localeCompare(String(b.name),'ko')||a.member_id.localeCompare(b.member_id));}
export function renewalMessage(member:any):string{
 const when=member.fixed_times?.length?` 현재 고정 수업은 ${member.fixed_times.join(', ')}이에요.`:'';
 return `안녕하세요, 아쿠입니다. ${member.name}님의 유효 회원권 총 잔여 횟수는 ${member.total_remaining}회로 확인되어 재등록 안내드려요.${when} 다음 수업을 이어서 준비하실 수 있도록 재등록 일정과 이용권에 대해 안내드리겠습니다. 확인 후 편하실 때 답장 부탁드려요. 감사합니다.`;
}
export function unansweredLeads(data:any){return (data?.leads||[]).filter((l:any)=>l.stage==='new'&&!l.first_contact_at);}
