'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';
export type OfficeContext={access:true;actor:{name:string;role:string;org_id:string;branch_id:string|null};mode:'simulation';hub_connected:false;cloud_connector:false;version:string};
export function useOfficeAccess(){
 const [context,setContext]=useState<OfficeContext|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),seq=useRef(0),abort=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{const n=++seq.current;abort.current?.abort();const c=new AbortController();abort.current=c;setContext(null);setLoading(true);setError('');const timer=setTimeout(()=>c.abort(),20000);try{const {data,error:authError}=await supabase.auth.getSession();if(authError||!data.session?.access_token)throw Error('로그인 후 AI 오피스를 이용해주세요.');const response=await fetch('/api/office/context',{headers:{Authorization:`Bearer ${data.session.access_token}`},cache:'no-store',signal:c.signal});const body=await response.json();if(!response.ok||body.access!==true)throw Error(body.error||'관리자 권한을 확인하지 못했습니다.');if(seq.current===n)setContext(body);}catch(e){if(seq.current===n)setError(c.signal.aborted?'접속 확인 시간이 초과되었습니다. 다시 시도해주세요.':e instanceof Error?e.message:'접속을 확인하지 못했습니다.');}finally{clearTimeout(timer);if(seq.current===n)setLoading(false);}},[]);
 useEffect(()=>{let active=true;void refresh();const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>{++seq.current;abort.current?.abort();setContext(null);setLoading(true);setTimeout(()=>{if(active)void refresh();},0);});return()=>{active=false;++seq.current;abort.current?.abort();subscription.unsubscribe();};},[refresh]);
 return {context,loading,error,refresh};
}
