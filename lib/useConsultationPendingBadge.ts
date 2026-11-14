"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {getActiveBranchId} from './branchContext';
import {consultRpc} from './consultations';
import {consultationPendingCount} from './consultationCounts';
export function useConsultationPendingBadge(){
 const [count,setCount]=useState<number|null>(null),[error,setError]=useState('');
 const live=useRef(false),sequence=useRef(0);
 const refresh=useCallback(async(reset=false)=>{
  const request=++sequence.current;
  if(reset){setCount(null);setError('');}
  try{
   const branch=getActiveBranchId();
   if(branch==='ALL')throw new Error('센터를 선택하면 신규 문의(미응대)를 확인할 수 있어요.');
   const data=await consultRpc('consultation_ops_3925',{p_branch:branch||null});
   const value=consultationPendingCount(data);
   if(live.current&&request===sequence.current){setCount(value);setError('');}
  }catch(e:any){if(live.current&&request===sequence.current){setCount(null);setError(e?.message||'신규 문의 집계를 불러오지 못했어요.');}}
 },[]);
 useEffect(()=>{
  live.current=true;void refresh(true);
  const changed=()=>void refresh(true),focus=()=>void refresh(),visible=()=>{if(document.visibilityState==='visible')void refresh();};
  const stored=(e:StorageEvent)=>{if(!e.key||['aqu_active_branch_id','aqu_current_account'].includes(e.key))changed();};
  const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},15000);
  for(const event of ['branch-switched','account-updated','aqunote-consultations-changed'])window.addEventListener(event,changed);
  window.addEventListener('focus',focus);window.addEventListener('storage',stored);document.addEventListener('visibilitychange',visible);
  return()=>{live.current=false;sequence.current++;clearInterval(timer);for(const event of ['branch-switched','account-updated','aqunote-consultations-changed'])window.removeEventListener(event,changed);window.removeEventListener('focus',focus);window.removeEventListener('storage',stored);document.removeEventListener('visibilitychange',visible);};
 },[refresh]);
 return {count,error};
}
