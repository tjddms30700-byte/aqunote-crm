"use client";
import {useEffect,useState} from 'react';
/** Checks server configuration only; never sends or persists application contents. */
export default function ApplyAvailabilityNotice({onReady}:{onReady:(ready:boolean)=>void}){
 const [state,setState]=useState<'checking'|'ready'|'unavailable'>('checking'),[revision,setRevision]=useState(0);
 useEffect(()=>{let live=true;let current:AbortController|null=null;
  async function check(){current?.abort();current=new AbortController();const signal=current.signal;const timer=setTimeout(()=>current?.abort(),10000);try{const r=await fetch('/api/apply',{cache:'no-store',signal});const value=await r.json();if(!live||signal.aborted)return;const ready=r.ok&&value.available===true;setState(ready?'ready':'unavailable');onReady(ready);}catch{if(live){setState('unavailable');onReady(false);}}finally{clearTimeout(timer);}}
  void check();const timer=setInterval(check,30000);return()=>{live=false;clearInterval(timer);current?.abort();};
 },[onReady,revision]);
 if(state==='ready')return null;
 return <section role={state==='unavailable'?'alert':'status'} className="relative mx-auto mt-5 max-w-2xl px-4"><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-800">{state==='checking'?<p>온라인 접수 연결 설정을 확인하고 있습니다.</p>:<><p className="font-semibold">온라인 신청 접수가 일시 중단되어 있습니다.</p><p className="mt-2">신청서를 반복 작성하지 않으셔도 됩니다. 기존 카카오톡 대화창에서 상담 접수와 연락 가능한 시간을 남겨주세요. 진단명 등 민감정보를 다시 보내실 필요는 없습니다.</p><p className="mt-2">이미 입력하셨다면 이 화면을 닫거나 새로고침하지 마세요. 현재 입력 내용은 이 화면에만 유지됩니다.</p><button type="button" className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold text-slate-800" onClick={()=>{setState('checking');setRevision(v=>v+1);}}>접수 연결 다시 확인</button></>}</div></section>;
}
