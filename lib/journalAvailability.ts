import {modelName,requestBody,providerProblem,repairRequest,type JournalProvider} from './journalProviderContract';
import {JOURNAL_TRANSIENT_HTTP} from './aiProviderRetry';
export const JOURNAL_RELEASE='3.94.2';
export const JOURNAL_TOTAL_MS=48000;
const valid=(s:unknown)=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(s)?s:undefined;
const safeCode=(s:unknown)=>typeof s==='string'&&/^(?:\d{3}|[a-z][a-z0-9_]{1,63})$/i.test(s)&&!/^AIza/i.test(s)?s:undefined;
export function compactJournalHistory(history:unknown,redact:(text:string)=>string){
 if(!Array.isArray(history))return [];
 return history.slice(0,3).map(h=>{
  const clean=(v:string,n:number)=>Array.from(redact(v).replace(/\s+/g,' ').trim()).slice(0,n).join('');
  const activities=Array.isArray(h?.activities)?h.activities.slice(0,5).filter((x:unknown)=>typeof x==='string').map((x:string)=>clean(x,36)).filter(Boolean):[];
  const memo=typeof h?.memo==='string'?h.memo.slice(0,1600):'';
  const objective=memo.match(/(?:^|\n)\s*O\s*[:：]\s*([\s\S]*?)(?=\n\s*[AP]\s*[:：]|$)/i)?.[1];
  return {activity_summary:clean(activities.join(' · ')||objective||'',180)};
 }).filter(h=>h.activity_summary);
}
type Diagnostic={provider:string;model?:string;http?:number;upstream_code?:string;upstream_id?:string;duration_ms?:number;reason?:string};
export class JournalUpstreamError extends Error{
 constructor(public code:string,message:string,public status:number,public detail:Diagnostic,public canFallback=false){super(message);}
}
const providerOf=(s:string):JournalProvider|null=>s==='openai'||s==='gemini'?s:null;
const keyOf=(p:JournalProvider)=>(p==='gemini'?process.env.GEMINI_API_KEY:process.env.OPENAI_API_KEY)?.trim();
export async function generateJournalUpstream(system:string,input:any,signal:AbortSignal,deadline:number,onAttempt:(d:Diagnostic)=>void){
 const preferred=(process.env.AI_JOURNAL_PROVIDER||'openai').trim().toLowerCase();
 const primary=providerOf(preferred);const preferredBackup=(process.env.AI_JOURNAL_FALLBACK_PROVIDER||'').trim().toLowerCase();const backup=providerOf(preferredBackup);
 const configError=()=>new JournalUpstreamError('AI_PROVIDER_CONFIG','AI 제공업체·API 키·모델 설정을 확인해주세요.',503,{provider:primary||'unknown',reason:'configuration'});
 if(!primary||(preferredBackup&&(!backup||primary===backup)))throw configError();
 const candidates=backup?[primary,backup]:[primary];
 let last:JournalUpstreamError|undefined;
 for(const [i,provider] of candidates.entries()){
  const start=Date.now(),detail:Diagnostic={provider};
  const key=keyOf(provider),remaining=deadline-start;
  if(signal.aborted)throw new JournalUpstreamError('AI_CANCELLED','일지 생성을 취소했습니다.',499,{...detail,reason:'client_cancel'});
  if(remaining<1000){throw new JournalUpstreamError('AI_TIMEOUT','일지 생성 요청의 응답 시간이 초과되었습니다.',504,{...detail,reason:'total_deadline'});}
  const useBackup=i===0&&!!backup&&!!keyOf(backup);
  const controller=new AbortController();const stop=()=>controller.abort();signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();
  const until=Math.min(deadline,start+(useBackup?23000:remaining));const timer=setTimeout(stop,Math.max(1,until-Date.now()));
  let stage='config';
  try{
   if(!key)throw new JournalUpstreamError('AI_PROVIDER_CONFIG','AI API 키가 설정되지 않았습니다.',503,detail,true);
   let model:string;try{model=modelName(provider);}catch{throw new JournalUpstreamError('AI_PROVIDER_CONFIG','AI 모델 환경변수를 확인해주세요.',503,detail,true);}
   detail.model=model;
   const endpoint=provider==='openai'?'https://api.openai.com/v1/chat/completions':`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
   let body=requestBody(provider,model,system,input);
   for(let call=0;call<2;call++){
    stage='fetch';const r=await fetch(endpoint,{method:'POST',signal:controller.signal,headers:provider==='openai'?{Authorization:`Bearer ${key}`,'Content-Type':'application/json'}:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify(body)});
    detail.http=r.status;detail.upstream_id=valid(r.headers.get('x-request-id')||r.headers.get('x-goog-request-id'));detail.upstream_code=undefined;
    stage='body';if(r.ok){const data=await r.json();onAttempt({...detail,duration_ms:Date.now()-start,reason:'ok'});return {provider,data};}
    const problem=await providerProblem(r);if(controller.signal.aborted)throw new DOMException('timed out','AbortError');
    const upstream=problem.code==='400'||/^\d{3}$/.test(problem.code)?problem.type||problem.code:problem.code||problem.type;
    detail.upstream_code=safeCode(upstream);
    const billing=/insufficient_quota|credit_balance_exhausted|billing|spend_limit|usage_limit_exceeded/i.test(`${problem.code} ${problem.type}`);
    const badKey=/api_key_invalid|invalid_api_key|unauthenticated/i.test(`${problem.code} ${problem.type}`);
    if(r.status===400&&call===0&&!badKey&&until-Date.now()>3000){const fixed=repairRequest(body,provider,problem);if(fixed){onAttempt({...detail,duration_ms:Date.now()-start,reason:'compatible_request_retry'});body=fixed;continue;}}
    const err=(c:string,m:string,s:number,fallback=true)=>new JournalUpstreamError(c,m,s,detail,fallback);
    if(r.status===429)throw billing?err('AI_PROVIDER_BILLING','AI API의 잔액 또는 결제·사용 예산 한도를 확인해주세요.',429):err('AI_PROVIDER_RATE_LIMIT','AI API 요청 한도에 도달했습니다. 해당 프로젝트의 분당·일일 한도를 확인해주세요.',429);
    if(r.status===401||r.status===403||badKey)throw err('AI_PROVIDER_AUTH','AI API 키 또는 프로젝트 권한을 확인해주세요.',502);
    if(r.status===404)throw err('AI_PROVIDER_MODEL','설정한 AI 모델을 이 프로젝트에서 사용할 수 없습니다.',502);
    if(r.status===408||r.status===504)throw err('AI_PROVIDER_TIMEOUT','AI 제공업체가 응답 시간 초과를 반환했습니다.',504);
    if(JOURNAL_TRANSIENT_HTTP.has(r.status)||r.status>=500)throw err('AI_PROVIDER_UNAVAILABLE','AI 제공업체가 일시적으로 요청을 처리하지 못했습니다.',503);
    throw err('AI_PROVIDER_REQUEST','AI 제공업체가 생성 요청을 거절했습니다. 모델·요청 설정을 확인해주세요.',502,false);
   }
  }catch(e:any){
   if(signal.aborted)throw new JournalUpstreamError('AI_CANCELLED','일지 생성을 취소했습니다.',499,{...detail,reason:'client_cancel'});
   last=e instanceof JournalUpstreamError?e:controller.signal.aborted?new JournalUpstreamError('AI_TIMEOUT','AI 응답 대기시간이 초과되었습니다.',504,{...detail,reason:'provider_deadline'},true):new JournalUpstreamError(stage==='body'?'AI_PROVIDER_BODY':'AI_NETWORK',stage==='body'?'AI 응답 형식을 읽지 못했습니다.':'AI 제공업체와 통신하지 못했습니다.',502,{...detail,reason:stage==='body'?'invalid_body':'network'},true);
   onAttempt({...last.detail,duration_ms:Date.now()-start,reason:last.detail.reason||last.code});
   if(!last.canFallback||!useBackup)throw last;
  }finally{clearTimeout(timer);signal.removeEventListener('abort',stop);}
 }
 throw last||configError();
}
export function journalLog(trace:string,d:Diagnostic){console.info('[ai-journal-upstream]',JSON.stringify({diagnostic_id:trace,...d,version:JOURNAL_RELEASE}));}
