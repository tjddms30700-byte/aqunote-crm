'use client';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Link from 'next/link';
import {ArrowRight,Copy,X,Phone} from 'lucide-react';
import {consultCopy} from '@/lib/consultations';
import {renewalMembers,renewalMessage} from '@/lib/consultationSummary';
export default function ConsultationSummaryDrawer({kind,data,onClose}:{kind:'renewals'|'today';data:any;onClose:()=>void}){
 const box=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
 const [notice,setNotice]=useState(''),[error,setError]=useState(''),[copying,setCopying]=useState('');
 const rows=renewalMembers(data),lessons=data?.ops?.today_lessons||[];
 const title=kind==='renewals'?'재등록 임박 회원 명단 (총 잔여 2회 이하)':'오늘 수업 타임라인';
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';box.current?.focus();
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();close.current();return;}if(e.key!=='Tab')return;const nodes=Array.from(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]')||[]).filter(x=>x.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(!first){e.preventDefault();box.current?.focus();return;}if(e.shiftKey&&(document.activeElement===first||document.activeElement===box.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===box.current)){e.preventDefault();first.focus();}};
  document.addEventListener('keydown',onKey);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',onKey);if(previous?.isConnected)previous.focus();};
 },[]);
 async function copy(member:any){if(copying)return;setCopying(member.member_id);setError('');setNotice('');try{await consultCopy(renewalMessage(member));setNotice(`${member.name}님 재등록 안내문을 복사했어요. 자동 발송하지 않습니다.`);}catch(e:any){setError(e?.message||'문구를 복사하지 못했어요.');}finally{setCopying('');}}
 return createPortal(<div className="consult-summary-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)onClose();}}><section ref={box} tabIndex={-1} className="consult-summary-drawer" role="dialog" aria-modal="true" aria-label={title}>
 <header><div><small>{kind==='renewals'?`재등록 임박 ${rows.length}명`:`${data.ops.today} · 한국 시간`}</small><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label={title+' 닫기'}><X size={20}/></button></header>
 <div className="consult-summary-drawer-body">
 {notice&&<p className="consult-summary-success" role="status">{notice}</p>}{error&&<p role="alert" className="consult-summary-error">{error}</p>}
 {kind==='renewals'?<><p className="consult-summary-explainer">유효 정규 회원권의 총 잔여가 2회 이하인 회원이에요. 이름을 누르면 회원 상세로 이동합니다.</p>
 {!rows.length&&<p className="consult-summary-empty">현재 재등록 임박 회원이 없습니다.</p>}
 <div className="consult-renewal-list">{rows.map((member:any)=><article key={member.member_id} data-testid="renewal-member-row"><div className="consult-renewal-heading"><Link href={'/members/'+member.member_id} className="consult-renewal-name">{member.name}<ArrowRight size={15}/></Link><span className="consult-remaining-badge">잔여 {member.total_remaining}회</span></div><dl><div><dt>고정 요일·시간</dt><dd>{member.fixed_times.length?member.fixed_times.join(' · '):'고정 시간 미등록'}</dd></div><div><dt>연락처</dt><dd>{member.phone?<a href={'tel:'+String(member.phone).replace(/[^+0-9]/g,'')}><Phone size={13}/>{member.phone}</a>:'연락처 미등록'}</dd></div></dl><div className="consult-renewal-actions"><button type="button" disabled={!!copying} onClick={()=>void copy(member)} aria-label={member.name+' 재등록 안내 문자 복사'}><Copy size={15}/>{copying===member.member_id?'복사 중…':'💬 재등록 안내 문자 복사'}</button><Link href={'/members/'+member.member_id}>회원 상세 <ArrowRight size={14}/></Link></div></article>)}</div>
 </>:<><p className="consult-summary-explainer">총 {lessons.length}건 · 완료 {lessons.filter((l:any)=>l.completed).length} / 예정 {lessons.filter((l:any)=>!l.completed).length}</p>{!lessons.length&&<p className="consult-summary-empty">오늘 등록된 유효 수업이 없습니다.</p>}
 <ol className="consult-summary-timeline">{lessons.map((lesson:any)=><li key={lesson.id} data-testid="today-lesson-row"><time>{lesson.time}</time><div>{lesson.member_id?<Link href={'/members/'+lesson.member_id}>{lesson.member_name}</Link>:<strong>{lesson.member_name}</strong>}<p>{lesson.program}</p></div><span className={'aqu-status '+(lesson.completed?'is-done':'is-waiting')}>{lesson.completed?'완료':'예정'}</span></li>)}</ol></>}
 </div><footer>{kind==='renewals'?'안내문 복사만 수행하며 결제·회원권·출석은 변경하지 않습니다.':'상단 건수와 같은 수업 목록입니다. 일정 수정은 통합 시간표에서 진행해주세요.'}</footer>
 </section></div>,document.body);
}
