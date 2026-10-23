"use client";
import { ReactNode, createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { centerFundRows, koreaToday, PRIVATE_FINANCE_EVENT, privateFinanceRpc, safeCsv, won } from "@/lib/privateFinance";
import PrivateFinancePanel from "@/components/PrivateFinancePanel";
const MasterContext=createContext(false);
export const usePrivateMaster=()=>useContext(MasterContext);
export const OPEN_PRIVATE_FINANCE="aqunote-open-private-finance";

export default function FinanceWorkspace({children}:{children:ReactNode}) {
  const [tab,setTab]=useState("center"),[initialKind,setInitialKind]=useState<string|undefined>(),[notice,setNotice]=useState("");
  const generation=useRef(0);
  useEffect(()=>{
    let live=true;
    async function check(){const n=++generation.current;try{const access=await privateFinanceRpc("pf_access");if(!live||n!==generation.current)return;
      if(access?.is_master===true)setNotice("");else {setNotice("개인 재무 조회·저장은 재무 관리 대표 계정으로 로그인해야 합니다.");setTab("center");}
    }catch(e:any){if(live&&n===generation.current)setNotice(e.message);}}
    void check();
    const {data:{subscription}}=supabase.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT"||event==="SIGNED_IN"||event==="USER_UPDATED"){generation.current++;setTab("center");setInitialKind(undefined);setTimeout(()=>{if(live)void check();},0);}});
    const focus=()=>void check();window.addEventListener("focus",focus);const timer=setInterval(focus,60000);
    return()=>{live=false;generation.current++;subscription.unsubscribe();window.removeEventListener("focus",focus);clearInterval(timer);};
  },[]);
  useEffect(()=>{function open(e:Event){setInitialKind((e as CustomEvent).detail?.kind||"center_pay_debt");setTab("private");window.scrollTo({top:0,behavior:"smooth"});}window.addEventListener(OPEN_PRIVATE_FINANCE,open);return()=>window.removeEventListener(OPEN_PRIVATE_FINANCE,open);},[]);
  // 표시 여부에 별도 마스터 플래그를 쓰지 않습니다. 실제 데이터는 모든 RPC에서 대표 권한을 검증합니다.
  return <MasterContext.Provider value={true}><div className="min-h-screen bg-slate-50"><div className="mx-auto max-w-6xl px-4 pt-5"><nav aria-label="재무 관리 구분" className="flex gap-2 rounded-xl border bg-white p-1.5"><button type="button" onClick={()=>setTab("center")} aria-pressed={tab==="center"} className={"flex-1 rounded-lg px-4 py-3 text-sm font-bold "+(tab==="center"?"bg-sky-100 text-sky-900":"text-slate-600")}>🏢 센터 재무</button><button type="button" onClick={()=>{setInitialKind(undefined);setTab("private");}} aria-pressed={tab==="private"} className={"flex-1 rounded-lg px-4 py-3 text-sm font-bold "+(tab==="private"?"bg-slate-900 text-white":"text-slate-600")}>대표 개인 재무</button></nav>{notice&&<p role="status" className="mt-2 text-xs text-amber-700">{notice}</p>}<p className="mt-2 text-right text-[10px] text-slate-400">아쿠노트 v3.77.2</p></div>{tab==="private"?<PrivateFinancePanel key={initialKind||"personal"} initialKind={initialKind} onClose={()=>setTab("center")} />:children}</div></MasterContext.Provider>;
}
export function CenterFundLedger({month}:{month:string}) {
  const allowed=usePrivateMaster();const [rows,setRows]=useState<any[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(false);const generation=useRef(0);
  useEffect(()=>{let live=true;async function load(){if(!month)return;const n=++generation.current;setLoading(true);setRows([]);setError("");try{const result=await centerFundRows(month);if(live&&n===generation.current)setRows(result);}catch(e:any){if(live&&n===generation.current)setError(e.message);}finally{if(live&&n===generation.current)setLoading(false);}}void load();const refresh=()=>void load();window.addEventListener(PRIVATE_FINANCE_EVENT,refresh);window.addEventListener("focus",refresh);return()=>{live=false;generation.current++;window.removeEventListener(PRIVATE_FINANCE_EVENT,refresh);window.removeEventListener("focus",refresh);};},[month]);
  function open(kind:string){window.dispatchEvent(new CustomEvent(OPEN_PRIVATE_FINANCE,{detail:{kind}}));}
  async function exportRows(){try{const fresh=await centerFundRows(month);const csv=safeCsv([["날짜","분류","입금","출금","결제수단","상태"],...fresh.map(r=>[r.occurred_on,r.account_label,r.direction==="in"?r.amount:"",r.direction==="out"?r.amount:"",r.payment_method,r.voided_at?"취소":"정상"])]);const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`대표자금이동_세무별도_${month}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e:any){setError(e.message);}}
  const valid=rows.filter(r=>!r.voided_at),money=(direction:string)=>valid.filter(r=>r.direction===direction).reduce((a,r)=>a+Number(r.amount),0);
  return <section className="mb-5 rounded-xl border border-purple-200 bg-white p-4"><header className="flex flex-wrap justify-between gap-2"><div><h2 className="text-sm font-bold text-purple-900">센터 ↔ 대표 자금 이동 · 세무 별도 분류</h2><p className="mt-1 text-xs text-slate-500">센터 운영비·매출·급여 합계에 포함하지 않습니다. 개인 채권자명·메모는 표시/내보내지 않습니다.</p></div>{allowed&&<div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg border border-purple-200 px-3 py-2 text-xs text-purple-800" onClick={()=>open("center_pay_debt")}>개인 채무 대납</button><button type="button" className="rounded-lg border border-purple-200 px-3 py-2 text-xs text-purple-800" onClick={()=>open("center_pay_personal")}>대표 개인 지출</button></div>}</header>{error?<p className="mt-3 text-xs text-amber-800">{error}</p>:loading?<p className="mt-3 text-xs">조회 중…</p>:<><div className="my-3 flex flex-wrap gap-4 text-xs"><span>센터 입금 <b>{won(money("in"))}</b></span><span>센터 출금 <b>{won(money("out"))}</b></span><button type="button" onClick={()=>void exportRows()} className="ml-auto underline">별도 CSV 내려받기</button></div>{rows.length>0?<div className="max-h-64 overflow-auto"><table className="w-full min-w-[440px] text-xs text-left"><thead><tr>{["날짜","회계 분류","입출금","금액","상태"].map(s=><th className="bg-slate-50 p-2" key={s}>{s}</th>)}</tr></thead><tbody>{rows.map(r=><tr className={"border-t "+(r.voided_at?"text-slate-400":"")} key={r.id}><td className="p-2">{r.occurred_on}</td><td className="p-2">{r.account_label}</td><td className="p-2">{r.direction==="in"?"센터 입금":"센터 출금"}</td><td className="p-2">{won(r.amount)}</td><td className="p-2">{r.voided_at?"취소":"정상"}</td></tr>)}</tbody></table></div>:<p className="text-xs text-slate-400">당월 별도 자금 이동이 없습니다.</p>}</>}</section>;
}
