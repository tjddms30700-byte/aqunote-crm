import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {JOURNAL_SCHEMA,journalPrompt,validateJournal} from './aiJournal';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store, private'}});
export async function handleAiJournal(req:NextRequest){
 let phase='auth';
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
  const provider=process.env.AI_JOURNAL_PROVIDER||'openai';
  if(!['openai','gemini'].includes(provider))return reply({error:'AI_JOURNAL_PROVIDER는 openai 또는 gemini로 설정해주세요.'},503);
  const apiKey=provider==='gemini'?process.env.GEMINI_API_KEY:process.env.OPENAI_API_KEY;
  if(!apiKey)return reply({error:`AI 연결 설정이 필요합니다. Vercel에 ${provider==='gemini'?'GEMINI_API_KEY':'OPENAI_API_KEY'}를 등록하고 다시 배포해주세요.`},503);
  phase='context';const {data:ctx,error:ctxError}=await db.rpc('ai_journal_context',{p_member:b.member_id,p_slot:b.slot_id||null,p_date:b.date,p_time:b.time});
  if(ctxError)return reply({error:['PGRST202','42883','42P01'].includes(ctxError.code)?'AI 일지 DB 설치가 필요합니다. v3.80.0 SQL을 실행해주세요.':'담당 회원 또는 수업 조회 권한을 확인해주세요.'},403);
  const {error:quotaError}=await db.rpc('ai_journal_claim',{p_member:b.member_id});if(quotaError)return reply({error:'생성 요청이 많습니다. 잠시 후 다시 시도해주세요.'},429);
  const realName=String(ctx.member_name||''),redact=(s:string)=>{let text=realName?s.split(realName).join('회원이름'):s;return text.replace(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g,'[연락처 제외]').replace(/\b\d{6}[-\s]?[1-8]\d{6}\b/g,'[주민번호 제외]');};
  const input={member_name:'회원이름',memo:redact(b.memo.trim()),style:b.style,history:b.include_history===false?[]:ctx.history.map((h:any)=>({date:h.date,memo:redact(String(h.memo||'')),activities:h.activities}))};
  const system=journalPrompt(b.style,ctx.track,ctx.member_type==='child');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);phase='provider';let response:Response;
  try{if(provider==='openai'){
   response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_JOURNAL_MODEL||'gpt-4.1-mini',store:false,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_schema',json_schema:{name:'aqunote_dual_journal',strict:true,schema:JOURNAL_SCHEMA}},max_completion_tokens:2500})});
  }else{
   const model=process.env.GEMINI_JOURNAL_MODEL||'gemini-2.5-flash';if(!/^[a-zA-Z0-9_.-]+$/.test(model))return reply({error:'Gemini 모델 설정을 확인해주세요.'},503);
   response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',signal:controller.signal,headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:JSON.stringify(input)}]}],generationConfig:{responseMimeType:'application/json',responseJsonSchema:JOURNAL_SCHEMA,maxOutputTokens:4096}})});
  }}finally{clearTimeout(timer);}
  if(!response.ok)return reply({error:response.status===429?'AI 제공업체 사용량 한도에 도달했습니다. 잠시 후 다시 시도해주세요.':'AI 제공업체 연결에 실패했습니다. 관리자에게 API 키·모델 설정 확인을 요청해주세요.'},502);
  const data=await response.json();let text='';
  if(provider==='openai'){if(data.choices?.[0]?.finish_reason!=='stop'||data.choices?.[0]?.message?.refusal)return reply({error:'AI가 안전한 초안을 완성하지 못했습니다. 메모를 확인 후 다시 시도해주세요.'},502);text=data.choices[0].message.content;}
  else{if(data.candidates?.[0]?.finishReason!=='STOP')return reply({error:'AI가 초안을 완성하지 못했습니다. 메모를 확인 후 다시 시도해주세요.'},502);text=data.candidates[0].content?.parts?.map((p:any)=>p.text||'').join('')||'';}
  const result=validateJournal(JSON.parse(text));result.parent_message=result.parent_message.split('회원이름').join(realName);result.clinical_record=result.clinical_record.split('회원이름').join(realName);
  return reply({...result,provider});
 }catch(e:any){if(e?.name==='AbortError')return reply({error:'AI 응답 대기시간이 초과되었습니다. 메모는 유지됩니다. 잠시 후 다시 생성해주세요.'},504);return reply({error:phase==='provider'?'AI 응답 형식을 확인하지 못했습니다. 메모를 유지한 채 다시 시도해주세요.':'AI 일지 요청을 처리하지 못했습니다. 로그인 및 DB 설정을 확인해주세요.'},502);}
}
