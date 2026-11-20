import {QUANTITY_REVIEW_RULES} from './journalOrderPrompt';
import {randomUUID} from 'node:crypto';
import {JOURNAL_RELEASE,JOURNAL_TOTAL_MS,compactJournalHistory,generateJournalUpstream,JournalUpstreamError,journalLog} from './journalAvailability';
import {memoUnits,ORDERED_JOURNAL_SCHEMA,parseOrderedJournal} from './journalSource';
import {NextRequest,NextResponse} from 'next/server';
import {sessionStructure,combinedPrompt,finalizeCombined} from './journalSession';
import {lessonTrack} from './lessonTrack';
import {clinicalMetrics,formatClinicalMetrics} from './journalClinical';
import {createClient} from '@supabase/supabase-js';
import {JOURNAL_GENERATION_SCHEMA,journalPrompt,parseGeneratedJournalResponse,JournalFormatError,finalizeParentMessage,messageThemeCount} from './aiJournal';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store, private'}});
export async function handleAiJournal(req:NextRequest){
 const diagnostic_id=randomUUID(),deadline=Date.now()+JOURNAL_TOTAL_MS;
 let phase='auth',providerName='unknown',sourceSaved:any=null;
 const fail=(code:string,message:string,status=502,upstream?:JournalUpstreamError)=>{
  const detail=upstream?.detail;const suffix=[detail?.http?`HTTP ${detail.http}`:'',detail?.upstream_code||''].filter(Boolean).join(' · ');
  console.warn('[ai-journal]',JSON.stringify({diagnostic_id,code,phase,provider:detail?.provider||providerName,http:detail?.http,upstream_code:detail?.upstream_code,version:JOURNAL_RELEASE}));
  return reply({error:`${message} [${code}${suffix?' · '+suffix:''}] 진단 ID: ${diagnostic_id}`,code,diagnostic_id,upstream_status:detail?.http,upstream_code:detail?.upstream_code,version:JOURNAL_RELEASE,...(sourceSaved?{raw_saved:true,session_id:sourceSaved.session_id,review_required:true}:{})},status);
 };
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
  if(b.save_key&&!UUID.test(b.save_key))return reply({error:'저장 식별자를 확인해주세요.'},400);
  if(b.save_key){const checkpoint=await db.rpc('journal_single_flow_3925',{p_key:b.save_key,p_member:b.member_id,p_slot:b.slot_id||null,p_date:b.date,p_time:b.time,p_style:b.style,p_source:b.memo,p_result:null});if(checkpoint.error)return fail('AI_SOURCE_SAVE','원문을 세션 DB에 저장하지 못해 AI 호출을 중단했습니다. 입력 메모는 유지됩니다.',503);sourceSaved=checkpoint.data;}
  const {error:quotaError}=await db.rpc('ai_journal_claim',{p_member:b.member_id});if(quotaError)return fail('AI_LOCAL_QUOTA','센터 시스템의 생성 요청 제한을 확인해주세요. 외부 AI 결제 한도와는 별개입니다.',429);
  const realName=String(ctx.member_name||''),redact=(s:string)=>{let text=realName?s.split(realName).join('회원이름'):s;return text.replace(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g,'[연락처 제외]').replace(/\b\d{6}[-\s]?[1-8]\d{6}\b/g,'[주민번호 제외]');};
  const input={member_name:'회원이름',memo:redact(b.memo.trim())+(Object.keys(metrics).length?'\n\n[치료사가 직접 입력한 측정값]\n'+formatClinicalMetrics(metrics):''),style:b.style,history:b.include_history===false?[]:compactJournalHistory(ctx?.history,redact)};
  const units=memoUnits(redact(b.memo));Object.assign(input,{memo_units:units});
  const structure=sessionStructure('',false);
  const nowKst=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());const preSession=b.date+' '+b.time>nowKst.slice(0,16);
  const system=journalPrompt(b.style,ctx.track,ctx.member_type==='child')+QUANTITY_REVIEW_RULES+(preSession?'\n[사전작성] 예약 시간이 아직 남아 있습니다. 메모의 계획은 계획/예정으로 표시하고 수행·호전·출석 완료를 만들어내지 마세요. 메모에 명시된 실제 관찰과 예정 활동을 구분하세요. SOAP O/A에 실제 관찰 근거가 없다면 관찰 전/평가 보류를 명시하세요.':'');
  Object.assign(input,{session_structure:{...structure,oral_evidence:structure.oral_evidence.map(redact),aquatic_evidence:structure.aquatic_evidence.map(redact)}});
  phase='network';
  const {provider,data}=await generateJournalUpstream(system,input,req.signal||new AbortController().signal,deadline,d=>journalLog(diagnostic_id,d));providerName=provider;
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
  let result=parseOrderedJournal(text,units);result.parent_message=finalizeParentMessage(result.parent_message,realName,b.style,ctx.member_type==='child');result.clinical_record=result.clinical_record.split('회원이름').join(realName);
  if(structure.combined){try{result={...result,...finalizeCombined(result,structure)};}catch{return fail('AI_COMBINED_SECTIONS','구강·연하와 수중 활동 두 영역을 확인하지 못했어요. 메모는 유지됩니다. 다시 생성해주세요.');}}
  if(req.signal?.aborted)return fail('AI_CANCELLED','일지 생성을 취소했습니다.',499);
  if(b.save_key){const stored=await db.rpc('journal_single_flow_3925',{p_key:b.save_key,p_member:b.member_id,p_slot:b.slot_id||null,p_date:b.date,p_time:b.time,p_style:b.style,p_source:b.memo,p_result:result});if(stored.error)return fail('AI_RESULT_SAVE','AI 생성은 완료됐지만 DB 저장 확인에 실패했습니다. 원문은 저장되어 있습니다. 저장된 원문 기록에서 다시 확인해주세요.',503);sourceSaved=stored.data;}
  const chars=Array.from(result.parent_message).length,themes=messageThemeCount(result.parent_message);const warnings:string[]=[...result.expansion_warnings];return reply({...result,...(sourceSaved?{auto_saved:true,session_id:sourceSaved.session_id,review_required:true}:{}),session_components:structure.combined?[{kind:'oral_swallow',duration_minutes:structure.oral_minutes},{kind:'aqua',duration_minutes:structure.aquatic_minutes}]:[],provider,diagnostic_id,version:JOURNAL_RELEASE,quality:{characters:chars,themes,warnings,review_required:true}});
 }catch(e:any){
  if(e instanceof JournalUpstreamError)return fail(e.code,e.message,e.status,e);
  if(e?.name==='AbortError')return fail('AI_TIMEOUT','AI 응답 대기시간이 초과되었습니다. 메모는 유지됩니다.',504);
  if(e instanceof JournalFormatError)return fail(e.code,e.message);
  if(phase==='network'||phase==='response_body')return fail('AI_NETWORK','AI 서버와 통신하지 못했습니다. 잠시 후 다시 시도해주세요.');
  return fail('AI_INTERNAL','AI 일지 요청 처리 중 오류가 발생했습니다. 메모는 유지됩니다. 오류 코드를 관리자에게 알려주세요.');
 }
}

/** Heartbeat only until the validated draft has been persisted; never stream unreviewed clinical text. */
export function streamAiJournal(req:NextRequest){
 const abort=new AbortController(),enc=new TextEncoder();let timer:ReturnType<typeof setInterval>|undefined,closed=false;
 const cleanup=()=>{if(timer)clearInterval(timer);req.signal.removeEventListener('abort',stop);};
 let streamController:ReadableStreamDefaultController<Uint8Array>|undefined;
 const stop=()=>{if(closed)return;closed=true;cleanup();abort.abort();try{streamController?.close();}catch{}};
 const forwarded=new NextRequest(req,{signal:abort.signal});
 const stream=new ReadableStream<Uint8Array>({start(ctrl){
  streamController=ctrl;
  const write=(x:unknown)=>{if(!closed)ctrl.enqueue(enc.encode(JSON.stringify(x)+'\n'));};
  const finish=(status:number,body:unknown)=>{if(closed)return;write({type:'result',status,body});closed=true;cleanup();ctrl.close();};
  req.signal.addEventListener('abort',stop,{once:true});if(req.signal.aborted){stop();return;}
  write({type:'progress',phase:'processing'});timer=setInterval(()=>write({type:'progress',phase:'processing'}),4000);
  void handleAiJournal(forwarded).then(async r=>finish(r.status,await r.json())).catch(()=>finish(502,{error:'일지 응답을 전달하지 못했습니다. 원문 저장을 확인해주세요.',code:'AI_STREAM_ERROR'}));
 },cancel:stop});
 return new Response(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store, private, no-transform','X-Accel-Buffering':'no','X-Aqunote-Journal-Version':JOURNAL_RELEASE}});
}
