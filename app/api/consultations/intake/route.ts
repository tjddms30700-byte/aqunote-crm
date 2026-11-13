import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {createHash} from 'crypto';
export const dynamic='force-dynamic';export const maxDuration=30;
const json=(b:any,status=200)=>NextResponse.json(b,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
export async function POST(req:NextRequest){
 const key=req.headers.get('x-aqu-intake-key')||'';if(!/^[A-Za-z0-9_-]{32,128}$/.test(key))return json({error:'접수 연결 인증이 필요합니다.'},401);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!secret)return json({error:'서버 접수 연결 설정이 필요합니다.'},503);
 try{if(Number(req.headers.get('content-length')||0)>32000)return json({error:'접수 내용이 너무 큽니다.'},413);const raw=await req.text();if(Buffer.byteLength(raw,'utf8')>32000)return json({error:'접수 내용이 너무 큽니다.'},413);let b:any;try{b=JSON.parse(raw);}catch{return json({error:'JSON 접수 형식을 확인해주세요.'},400);}
  if(!b||typeof b!=='object'||Array.isArray(b)||typeof b.event_id!=='string'||!b.event_id.trim()||b.event_id.length>160||typeof b.name!=='string'||!b.name.trim()||b.name.length>80||!/^01[016789][0-9]{7,8}$/.test(String(b.phone||'').replace(/\D/g,''))||b.consent!==true||!['child','adult'].includes(b.member_type||'child')||!['aqua','ground'].includes(b.track||'aqua'))return json({error:'이름·연락처·동의·접수 식별자를 확인해주세요.'},400);
  // Never accept client-supplied org_id, branch_id, stage or member_id.
  const payload={name:b.name.trim(),phone:String(b.phone).replace(/\D/g,''),birth:typeof b.birth==='string'?b.birth.slice(0,10):null,member_type:b.member_type||'child',track:b.track||'aqua',wish_days:Array.isArray(b.wish_days)?b.wish_days.slice(0,7).map(String):[],wish_times:Array.isArray(b.wish_times)?b.wish_times.slice(0,20).map((x:any)=>String(x).slice(0,80)):[],summary:typeof b.summary==='string'?b.summary:'',consent:true};
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});const r=await db.rpc('consultation_external_3920',{p_key_hash:createHash('sha256').update(key).digest('hex'),p_event_id:b.event_id.trim(),p_payload:payload});
  if(r.error)return json({error:r.error.code==='42501'?'접수 연결 인증을 확인해주세요.':r.error.message},r.error.code==='42501'?401:/요청이 많/.test(r.error.message)?429:400);
  return json({success:true,id:r.data.id,already:!!r.data.already},r.data.already?200:201);
 }catch{return json({error:'접수 결과를 확인하지 못했습니다. 같은 event_id로 재시도해주세요.'},503);}
}
