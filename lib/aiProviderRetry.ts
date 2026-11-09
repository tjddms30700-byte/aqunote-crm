/** Bounded retries for explicit transient HTTP failures only. No provider/model fallback or DB calls. */
export const JOURNAL_TRANSIENT_HTTP = new Set([408,500,502,503,504]);
type RetryOptions={signal:AbortSignal;deadline:number;maxAttempts?:number;now?:()=>number;random?:()=>number;sleep?:(ms:number,signal:AbortSignal)=>Promise<void>};
function aborted(){return new DOMException('AI request cancelled or timed out','AbortError');}
export function abortableJournalDelay(ms:number,signal:AbortSignal):Promise<void>{
 if(signal.aborted)return Promise.reject(aborted());
 return new Promise((resolve,reject)=>{const done=()=>{signal.removeEventListener('abort',cancel);resolve();};const timer=setTimeout(done,ms);const cancel=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(aborted());};signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();});
}
function retryAfter(response:Response,now:number):number{
 const raw=response.headers.get('retry-after');if(!raw)return 0;
 const seconds=Number(raw);if(Number.isFinite(seconds))return seconds>=0?seconds*1000:0;
 const date=Date.parse(raw);return Number.isFinite(date)?Math.max(0,date-now):0;
}
export async function fetchJournalProvider(send:()=>Promise<Response>,options:RetryOptions):Promise<Response>{
 const now=options.now||Date.now,random=options.random||Math.random,sleep=options.sleep||abortableJournalDelay;
 const max=Math.max(1,Math.min(3,options.maxAttempts||3));
 for(let attempt=0;attempt<max;attempt++){
  if(options.signal.aborted||now()>=options.deadline)throw aborted();
  const response=await send();
  if(!JOURNAL_TRANSIENT_HTTP.has(response.status)||attempt===max-1)return response;
  const delay=Math.max(1000*2**attempt+Math.floor(Math.max(0,Math.min(1,random()))*250),retryAfter(response,now()));
  // Respect Retry-After and the shared request budget; never start a retry with no useful time left.
  if(now()+delay+1500>=options.deadline)return response;
  if(response.body)void response.body.cancel().catch(()=>{});
  await sleep(delay,options.signal);
 }
 throw aborted();
}
