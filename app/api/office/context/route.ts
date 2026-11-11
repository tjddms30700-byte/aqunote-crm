import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const dynamic='force-dynamic';
export const maxDuration=30;
const json=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'no-store, private','Vary':'Authorization'}});
export async function GET(req:NextRequest){
 const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];if(!token)return json({error:'로그인 후 AI 오피스를 이용해주세요.',code:'OFFICE_LOGIN'},401);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!url||!key)return json({error:'서버 인증 연결 설정을 확인해주세요.',code:'OFFICE_CONFIG'},503);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{const db=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`},fetch:(u,i)=>fetch(u,{...i,signal:controller.signal})},auth:{persistSession:false,autoRefreshToken:false}});const auth=await db.auth.getUser(token);if(controller.signal.aborted)return json({error:'접속 확인 시간이 초과되었습니다. 다시 시도해주세요.',code:'OFFICE_TIMEOUT'},504);if(auth.error||!auth.data.user)return json({error:'로그인 상태를 확인해주세요.',code:'OFFICE_LOGIN'},401);
 const r=await db.rpc('office_console_context_3910');if(r.error){if(['PGRST202','42883','42P01'].includes(r.error.code))return json({error:'AI 오피스 권한 확인 SQL 설치가 필요합니다. v3.91.0 SQL을 적용해주세요.',code:'OFFICE_INSTALL'},503);return json({error:'AI 오피스는 승인된 대표·센터 관리자 계정만 이용할 수 있습니다.',code:'OFFICE_FORBIDDEN'},403);}
 if(r.data?.access!==true||!r.data?.actor?.org_id)return json({error:'관리자 연결 정보를 확인하지 못했습니다.',code:'OFFICE_FORBIDDEN'},403);
 return json({...r.data,hub_connected:false,cloud_connector:false,mode:'simulation'});
 }catch{return json({error:'관리자 접속 확인에 실패했습니다. 다시 시도해주세요.',code:controller.signal.aborted?'OFFICE_TIMEOUT':'OFFICE_CONNECTION'},controller.signal.aborted?504:503);}finally{clearTimeout(timer);}
}
