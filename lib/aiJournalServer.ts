import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {JOURNAL_GENERATION_SCHEMA,journalPrompt,parseGeneratedJournalResponse,JournalFormatError} from './aiJournal';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store, private'}});
export async function handleAiJournal(req:NextRequest){
 let phase='auth',providerName='unknown';
 const fail=(code:string,message:string,status=502)=>{console.warn('[ai-journal]',JSON.stringify({code,phase,provider:providerName,version:'3.80.2'}));return reply({error:`${message} [${code}]`,code,version:'3.80.2'},status);};
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
  if(!UUID.test(b.member_id||'')||(b.slot_id&&!UUID.test(b.slot_id))||!['A','B'].includes(b.style)||typeof b.memo!=='string'||!b.memo.trim()||b.memo.length>4000||b.consent!==true||!/^\d{4}-\d{2}-\d{2}$/.test(b.date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time||''))return reply({error:'회원·수업일·시간·문체·메모와 외부 AI 처리 확인을 점검해주세요.'},400);
  const provider=(process.env.AI_JOURNAL_PROVIDER||'openai').trim().toLowerCase();providerName=provider;
  if(!['openai','gemini'].includes(provider))return reply({error:'AI_JOURNAL_PROVIDER는 openai 또는 gemini로 설정해주세요.'},503);
  const apiKey=(provider==='gemini'?process.env.GEMINI_API_KEY:process.env.OPENAI_API_KEY)?.trim();
  if(!apiKey)return reply({error:`AI 연결 설정이 필요합니다. Vercel에 ${provider==='gemini'?'GEMINI_API_KEY':'OPENAI_API_KEY'}를 등록하고 다시 배포해주세요.`},503);
  phase='context';const {data:ctx,error:ctxError}=await db.rpc('ai_journal_context',{p_member:b.member_id,p_slot:b.slot_id||null,p_date:b.date,p_time:b.time});
  if(ctxError)return reply({error:['PGRST202','42883','42P01'].includes(ctxError.code)?'AI 일지 DB 설치가 필요합니다. v3.80.0 SQL을 실행해주세요.':'담당 회원 또는 수업 조회 권한을 확인해주세요.'},403);
  const {error:quotaError}=await db.rpc('ai_journal_claim',{p_member:b.member_id});if(quotaError)return reply({error:'생성 요청이 많습니다. 잠시 후 다시 시도해주세요.'},429);
  const realName=String(ctx.member_name||''),redact=(s:string)=>{let text=realName?s.split(realName).join('회원이름'):s;return text.replace(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g,'[연락처 제외]').replace(/\b\d{6}[-\s]?[1-8]\d{6}\b/g,'[주민번호 제외]');};
  const input={member_name:'회원이름',memo:redact(b.memo.trim()),style:b.style,history:b.include_history===false?[]:(Array.isArray(ctx?.history)?ctx.history:[]).map((h:any)=>({date:h.date,memo:redact(String(h.memo||'')),activities:h.activities}))};
  const system=journalPrompt(b.style,ctx.track,ctx.member_type==='child');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);phase='network';let response:Response;let data:any;
  try{if(provider==='openai'){
   response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_JOURNAL_MODEL||'gpt-4.1-mini',store:false,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_schema',json_schema:{name:'aqunote_dual_journal',strict:true,schema:JOURNAL_GENERATION_SCHEMA}},max_completion_tokens:2500})});
  }else{
   const model=(process.env.GEMINI_JOURNAL_MODEL||'gemini-2.5-flash').trim();if(!/^[a-zA-Z0-9_.-]+$/.test(model))return reply({error:'Gemini 모델 설정을 확인해주세요.'},503);
   response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',signal:controller.signal,headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:JSON.stringify(input)}]}],generationConfig:{responseMimeType:'application/json',responseJsonSchema:JOURNAL_GENERATION_SCHEMA,maxOutputTokens:4096}})});
  }
  phase='response_body';
  try{data=await response.json();}catch{return fail('AI_PROVIDER_BODY','AI 서버의 응답을 읽지 못했습니다. 잠시 후 다시 시도해주세요.');}
  if(!response.ok){
   if(response.status===429)return fail('AI_PROVIDER_QUOTA','AI 제공업체 사용 한도 또는 요청 한도에 도달했습니다. 선택한 API 프로젝트의 할당량을 확인해주세요.',429);
   if(response.status===401||response.status===403)return fail('AI_PROVIDER_AUTH','AI API 키의 권한 또는 사용 제한을 확인해주세요.',502);
   if(response.status===404)return fail('AI_PROVIDER_MODEL','설정한 AI 모델을 찾지 못했습니다. 모델 환경변수를 확인해주세요.',502);
   const invalidKey=data?.error?.details?.some((d:any)=>d?.reason==='API_KEY_INVALID');
   if(invalidKey)return fail('AI_PROVIDER_AUTH','AI 제공업체가 API 키를 유효한 키로 확인하지 못했습니다. 등록한 키를 확인해주세요.',502);
   return fail('AI_PROVIDER_REQUEST',`AI 제공업체가 요청을 처리하지 못했습니다(HTTP ${response.status}). API 키 제한·모델·요청 설정을 확인해주세요.`);
  }
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
  const result=parseGeneratedJournalResponse(text);result.parent_message=result.parent_message.split('회원이름').join(realName);result.clinical_record=result.clinical_record.split('회원이름').join(realName);
  return reply({...result,provider,version:'3.80.2'});
 }catch(e:any){
  if(e?.name==='AbortError')return fail('AI_TIMEOUT','AI 응답 대기시간이 초과되었습니다. 메모는 유지됩니다.',504);
  if(e instanceof JournalFormatError)return fail(e.code,e.message);
  if(phase==='network'||phase==='response_body')return fail('AI_NETWORK','AI 서버와 통신하지 못했습니다. 잠시 후 다시 시도해주세요.');
  return fail('AI_INTERNAL','AI 일지 요청 처리 중 오류가 발생했습니다. 메모는 유지됩니다. 오류 코드를 관리자에게 알려주세요.');
 }
}
