import {NextRequest,NextResponse} from 'next/server';
import {sessionStructure,combinedPrompt,finalizeCombined} from './journalSession';
import {lessonTrack} from './lessonTrack';
import {clinicalMetrics,formatClinicalMetrics} from './journalClinical';
import {fetchJournalProvider,JOURNAL_TRANSIENT_HTTP} from './aiProviderRetry';
import {createClient} from '@supabase/supabase-js';
import {JOURNAL_GENERATION_SCHEMA,journalPrompt,parseGeneratedJournalResponse,JournalFormatError,finalizeParentMessage,messageThemeCount} from './aiJournal';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store, private'}});
export async function handleAiJournal(req:NextRequest){
 let phase='auth',providerName='unknown';
 const fail=(code:string,message:string,status=502)=>{console.warn('[ai-journal]',JSON.stringify({code,phase,provider:providerName,version:'3.91.3'}));return reply({error:`${message} [${code}]`,code,version:'3.91.3'},status);};
 try{
  const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)return reply({error:'로그인 후 다시 이용해주세요.'},401);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)return reply({error:'서버의 Supabase 환경변수 설정을 확인해주세요.'},503);
  const db=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth,error:authError}=await db.auth.getUser(token);if(authError||!auth.user)return reply({error:'로그인이 만료되었습니다. 다시 로그인해주세요.'},401);
  if(Number(req.headers.get('content-length')||0)>24000)return reply({error:'입력 크기를 줄여주세요.'},413);
  const raw=await req.text();if(raw.length>16000)return reply({error:'입력 크기를 줄여주세요.'},413);
  let b:any;try{b=JSON.parse(raw);}catch{return reply({error:'요청 형식을 확인해주세요.'},400);}
  if(!UUID.test(b.member_id||'')||(b.slot_id&&!UUID.test(b.slot_id))||!['A','B','C'].includes(b.style)||typeof b.memo!=='string'||!b.memo.trim()||b.memo.length>4000||b.consent!==true||!/^\d{4}-\d{2}-\d{2}$/.test(b.date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time||''))return reply({error:'회원·수업일·시간·문체·메모와 외부 AI 처리 확인을 점검해주세요.'},400);
  let metrics:Record<string,number|null>={};try{if(b.metrics!=null){if(typeof b.metrics!=='object'||Array.isArray(b.metrics))throw new Error('정밀 수치 형식을 확인해주세요.');metrics=clinicalMetrics(b.metrics);}}catch(e:any){return reply({error:e.message},400);}
  phase='context';const {data:ctx,error:ctxError}=await db.rpc('ai_journal_context',{p_member:b.member_id,p_slot:b.slot_id||null,p_date:b.date,p_time:b.time});
  if(ctxError)return reply({error:['PGRST202','42883','42P01'].includes(ctxError.code)?'AI 일지 DB 설치가 필요합니다. v3.80.0 SQL을 실행해주세요.':'담당 회원 또는 수업 조회 권한을 확인해주세요.'},403);
  if(lessonTrack(ctx.track)==='ground'&&b.style!=='C')return reply({error:'지상재활은 AI로 가공하지 않습니다. 원문 저장을 이용해주세요.',code:'GROUND_RAW_ONLY'},409);
  const provider=(process.env.AI_JOURNAL_PROVIDER||'openai').trim().toLowerCase();providerName=provider;
  if(!['openai','gemini'].includes(provider))return reply({error:'AI_JOURNAL_PROVIDER는 openai 또는 gemini로 설정해주세요.'},503);
  const apiKey=(provider==='gemini'?process.env.GEMINI_API_KEY:process.env.OPENAI_API_KEY)?.trim();
  if(!apiKey)return reply({error:`AI 연결 설정이 필요합니다. Vercel에 ${provider==='gemini'?'GEMINI_API_KEY':'OPENAI_API_KEY'}를 등록하고 다시 배포해주세요.`},503);
  const {error:quotaError}=await db.rpc('ai_journal_claim',{p_member:b.member_id});if(quotaError)return reply({error:'생성 요청이 많습니다. 잠시 후 다시 시도해주세요.'},429);
  const realName=String(ctx.member_name||''),redact=(s:string)=>{let text=realName?s.split(realName).join('회원이름'):s;return text.replace(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g,'[연락처 제외]').replace(/\b\d{6}[-\s]?[1-8]\d{6}\b/g,'[주민번호 제외]');};
  const input={member_name:'회원이름',memo:redact(b.memo.trim())+(Object.keys(metrics).length?'\n\n[치료사가 직접 입력한 측정값]\n'+formatClinicalMetrics(metrics):''),style:b.style,history:b.include_history===false?[]:(Array.isArray(ctx?.history)?ctx.history:[]).map((h:any)=>({date:h.date,memo:redact(String(h.memo||'')),activities:Array.isArray(h.activities)?h.activities.map((x:any)=>redact(String(x))):[],parent_message:redact(String(h.parent_message||''))}))};
  const structure=sessionStructure('',false);
  const nowKst=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());const preSession=b.date+' '+b.time>nowKst.slice(0,16);
  const system=journalPrompt(b.style,ctx.track,ctx.member_type==='child')+(preSession?'\n[사전작성] 예약 시간이 아직 남아 있습니다. 메모의 계획은 계획/예정으로 표시하고 수행·호전·출석 완료를 만들어내지 마세요. 메모에 명시된 실제 관찰과 예정 활동을 구분하세요. SOAP O/A에 실제 관찰 근거가 없다면 관찰 전/평가 보류를 명시하세요.':'');
  Object.assign(input,{session_structure:{...structure,oral_evidence:structure.oral_evidence.map(redact),aquatic_evidence:structure.aquatic_evidence.map(redact)}});
  const controller=new AbortController(),deadline=Date.now()+45000,timer=setTimeout(()=>controller.abort(),45000);phase='network';let response:Response;let data:any;
  try{if(provider==='openai'){
   response=await fetchJournalProvider(()=>fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_JOURNAL_MODEL||'gpt-4.1-mini',store:false,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_schema',json_schema:{name:'aqunote_dual_journal',strict:true,schema:JOURNAL_GENERATION_SCHEMA}},max_completion_tokens:4500})}),{signal:controller.signal,deadline});
  }else{
   const model=(process.env.GEMINI_JOURNAL_MODEL||'gemini-2.5-flash').trim();if(!/^[a-zA-Z0-9_.-]+$/.test(model))return reply({error:'Gemini 모델 설정을 확인해주세요.'},503);
   response=await fetchJournalProvider(()=>fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',signal:controller.signal,headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:JSON.stringify(input)}]}],generationConfig:{responseMimeType:'application/json',responseJsonSchema:JOURNAL_GENERATION_SCHEMA,maxOutputTokens:8192,...(model.startsWith('gemini-2.5-flash')?{thinkingConfig:{thinkingBudget:0}}:{})}})}),{signal:controller.signal,deadline});
  }
  phase='response_body';
  if(!response.ok){
   // An upstream 503/5xx is not evidence of a bad API key. Non-JSON outage pages are classified too.
   if(JOURNAL_TRANSIENT_HTTP.has(response.status)){
    if(response.body)void response.body.cancel().catch(()=>{});
    return fail('AI_PROVIDER_UNAVAILABLE','AI 서비스가 일시적으로 혼잡하거나 응답하지 않습니다. 제한된 자동 재시도 후에도 처리하지 못했습니다. 입력 메모는 유지됩니다. 잠시 후 같은 버튼으로 다시 시도해주세요.',503);
   }
   if(response.status===429)return fail('AI_PROVIDER_QUOTA','AI 제공업체 사용 한도 또는 요청 한도에 도달했습니다. 선택한 API 프로젝트의 할당량을 확인해주세요.',429);
   if(response.status===401||response.status===403)return fail('AI_PROVIDER_AUTH','AI API 키의 권한 또는 사용 제한을 확인해주세요.',502);
   if(response.status===404)return fail('AI_PROVIDER_MODEL','설정한 AI 모델을 찾지 못했습니다. 모델 환경변수를 확인해주세요.',502);
   try{data=await response.json();}catch{data=null;}
   const invalidKey=Array.isArray(data?.error?.details)&&data.error.details.some((d:any)=>d?.reason==='API_KEY_INVALID');
   if(invalidKey)return fail('AI_PROVIDER_AUTH','AI 제공업체가 API 키를 유효한 키로 확인하지 못했습니다. 등록한 키를 확인해주세요.',502);
   return fail('AI_PROVIDER_REQUEST',`AI 제공업체가 요청을 처리하지 못했습니다(HTTP ${response.status}). API 키 제한·모델·요청 설정을 확인해주세요.`);
  }
  try{data=await response.json();}catch{return fail('AI_PROVIDER_BODY','AI 서버의 응답을 읽지 못했습니다. 잠시 후 다시 시도해주세요.');}
  }finally{clearTimeout(timer);}
  phase='extract';let text='';
  if(provider==='openai'){
   const c=data?.choices?.[0];if(c?.message?.refusal)return fail('AI_RESPONSE_BLOCKED','AI가 이 메모의 생성을 거절했습니다. 입력 내용을 확인해주세요.');
   if(c?.finish_reason==='length')return fail('AI_RESPONSE_TRUNCATED','AI 답변이 길이 제한으로 중단되었습니다. 메모를 짧게 나눠 작성해주세요.');
   if(c?.finish_reason!=='stop')return fail('AI_RESPONSE_INCOMPLETE','AI가 답변을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.');
   text=c?.message?.content;
  }else{
   const c=data?.candidates?.[0];
   if(data?.promptFeedback?.blockReason||['SAFETY','BLOCKLIST','PROHIBITED_CONTENT','RECITATION','SPII'].includes(c?.finishReason))return fail('AI_RESPONSE_BLOCKED','Gemini의 안전 기준으로 답변이 제한되었습니다. 메모 내용을 확인해주세요.');
   if(c?.finishReason==='MAX_TOKENS')return fail('AI_RESPONSE_TRUNCATED','Gemini 답변이 길이 제한으로 중단되었습니다. 메모를 짧게 나눠 작성해주세요.');
   if(c?.finishReason!=='STOP')return fail('AI_RESPONSE_INCOMPLETE','Gemini가 답변을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.');
   text=(Array.isArray(c?.content?.parts)?c.content.parts:[]).filter((p:any)=>p&&p.thought!==true&&typeof p.text==='string').map((p:any)=>p.text).join('');
  }
  phase='parse_validate';
  let result=parseGeneratedJournalResponse(text);result.parent_message=finalizeParentMessage(result.parent_message,realName,b.style,ctx.member_type==='child');result.clinical_record=result.clinical_record.split('회원이름').join(realName);
  if(structure.combined){try{result=finalizeCombined(result,structure);}catch{return fail('AI_COMBINED_SECTIONS','구강·연하와 수중 활동 두 영역을 확인하지 못했어요. 메모는 유지됩니다. 다시 생성해주세요.');}}
  const chars=Array.from(result.parent_message).length,themes=messageThemeCount(result.parent_message);const warnings:string[]=[];if(chars>1200)warnings.push('알림장이 길어요. 실제 관찰 중심으로 검토해주세요.');return reply({...result,session_components:structure.combined?[{kind:'oral_swallow',duration_minutes:structure.oral_minutes},{kind:'aqua',duration_minutes:structure.aquatic_minutes}]:[],provider,version:'3.91.3',quality:{characters:chars,themes,warnings}});
 }catch(e:any){
  if(e?.name==='AbortError')return fail('AI_TIMEOUT','AI 응답 대기시간이 초과되었습니다. 메모는 유지됩니다.',504);
  if(e instanceof JournalFormatError)return fail(e.code,e.message);
  if(phase==='network'||phase==='response_body')return fail('AI_NETWORK','AI 서버와 통신하지 못했습니다. 잠시 후 다시 시도해주세요.');
  return fail('AI_INTERNAL','AI 일지 요청 처리 중 오류가 발생했습니다. 메모는 유지됩니다. 오류 코드를 관리자에게 알려주세요.');
 }
}
