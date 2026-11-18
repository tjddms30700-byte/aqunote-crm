'use client';
import {useEffect,useRef,useState} from 'react';
import {consultRpc} from '@/lib/consultations';
import {getActiveBranchId} from '@/lib/branchContext';

/** A consultation id is never a member id. Never infer identity or create members on navigation. */
export function memberProfileHref(id:unknown):string|null{
 const value=typeof id==='string'?id.trim():'';
 return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)?`/members/${value}`:null;
}
type Lead={id:string;name:string;member_id?:string|null;phone?:string|null};
export default function ConsultationMemberLink({lead}:{lead:Lead}){
 const href=memberProfileHref(lead.member_id);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[rows,setRows]=useState<any[]>([]),[resultBranch,setResultBranch]=useState<string|null>(null);
 const request=useRef(0),box=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>()=>{request.current++;},[]);
 useEffect(()=>{
  if(!open)return;
  const prev=document.activeElement as HTMLElement,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';box.current?.querySelector<HTMLButtonElement>('button')?.focus();
  function key(e:KeyboardEvent){
   if(e.key==='Escape'){request.current++;setOpen(false);}
   if(e.key==='Tab'){
    const nodes=Array.from(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]')||[]).filter(n=>n.getClientRects().length);
    const first=nodes[0],last=nodes[nodes.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
   }
  }
  document.addEventListener('keydown',key);
  return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);(trigger.current||prev)?.focus();};
 },[open]);
 async function find(){
  const n=++request.current,branch=getActiveBranchId();setOpen(true);setBusy(true);setRows([]);setError('');setResultBranch(null);
  try{
   if(branch==='ALL')throw Error('센터를 선택한 후 개인 DB를 확인해주세요.');
   if(!lead.name.trim())throw Error('접수 이름을 확인해주세요.');
   const data=await consultRpc('consultation_member_search_3920',{p_branch:branch||null,p_query:lead.name.trim()});
   if(n!==request.current)return;
   if(branch!==getActiveBranchId())throw Error('센터가 변경되었습니다. 닫고 다시 확인해주세요.');
   if(!Array.isArray(data))throw Error('회원 검색 응답을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.');
   setRows(data.filter((m:any)=>memberProfileHref(m?.id)));setResultBranch(branch);
  }catch(e:any){if(n===request.current)setError(e?.message||'개인 DB를 확인하지 못했습니다.');}
  finally{if(n===request.current)setBusy(false);}
 }
 function close(){request.current++;setOpen(false);setBusy(false);}
 const linkClass='inline-flex min-h-11 items-center rounded px-1 text-left text-sky-800 underline decoration-sky-300 underline-offset-4 hover:text-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600';
 if(href)return <a className={linkClass} href={href} aria-label={`${lead.name} 개인 DB 열기`} title="개인 DB 열기">{lead.name}</a>;
 return <><button ref={trigger} type="button" className={linkClass} aria-label={`${lead.name} 개인 DB 확인`} onClick={()=>void find()}>{lead.name}</button>{open&&<div className="consult-dialog-backdrop"><div ref={box} className="consult-dialog" role="dialog" aria-modal="true" aria-label={`${lead.name} 개인 DB 확인`}><header><h2>개인 DB 확인</h2><button type="button" aria-label="개인 DB 확인 닫기" onClick={close}>✕</button></header><p><b>{lead.name}</b> · {lead.phone||'연락처 미등록'}</p><p>이 접수에는 개인 DB 연결 정보가 없습니다. 같은 이름의 회원이 있을 수 있으니 연락처를 확인한 뒤 열어주세요. 이름 클릭만으로 회원을 생성하거나 자동 연결하지 않습니다.</p>{busy&&<p role="status">현재 센터의 회원 DB를 확인하고 있습니다.</p>}{error&&<p role="alert" className="aqu-alert">{error}<button type="button" onClick={()=>void find()}>다시 확인</button></p>}{!busy&&!error&&<>{rows.length?<ul>{rows.map(m=><li key={m.id}><a className={linkClass} href={memberProfileHref(m.id)!} onClick={e=>{if(resultBranch!==getActiveBranchId()){e.preventDefault();setRows([]);setError('센터가 변경되었습니다. 다시 확인해주세요.');}}} aria-label={`${m.name} ${m.phone||'연락처 미등록'} 개인 DB 열기`}>{m.name} · {m.phone||'연락처 미등록'} · {m.member_type==='child'?'아동':m.member_type==='adult'?'성인':'구분 확인'} → 개인 DB</a></li>)}</ul>:<p role="status">현재 권한으로 조회 가능한 회원을 찾지 못했습니다. 회원 DB에서 등록 여부를 확인해주세요.</p>}<a className={linkClass} href="/members">회원 DB 목록에서 확인</a></>}<footer><button type="button" onClick={close}>닫기</button></footer></div></div>}</>;
}
