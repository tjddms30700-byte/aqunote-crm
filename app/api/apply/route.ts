/**
 * AQUNOTE - 공개 신청 폼 접수 API
 * POST /api/apply
 *   - 아동 · 성인 신청서를 leads_inbox에 즉시 저장
 *   - 관리자 /inbox 페이지에서 승격 대기
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function serverConfig(){
 const url=(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'').trim();
 const key=(process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY||'').trim();
 let validUrl=false;try{const parsed=new URL(url);validUrl=parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&!parsed.search&&!parsed.hash&&parsed.pathname==='/';}catch{}
 let privileged=key.startsWith('sb_secret_')&&key.length>25;
 if(key.startsWith('eyJ'))try{privileged=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='service_role';}catch{}
 return {url,key,ready:validUrl&&privileged,missing:!url?'url':!key?'server_key':!validUrl?'url_format':'server_key_type'};
}
export async function GET(){const config=serverConfig();return NextResponse.json({available:config.ready,database_verified:false,...(!config.ready?{code:'APPLY_SERVER_CONFIG',error:'온라인 신청 접수가 일시 중단되어 있습니다. 기존 카카오톡 대화창으로 상담을 요청해주세요.'}:{})},{status:config.ready?200:503,headers:{'Cache-Control':'no-store, max-age=0'}});}
export async function POST(req: Request) {
  try {
    if(Number(req.headers.get("content-length")||0)>48000)return NextResponse.json({error:"신청 내용이 너무 큽니다."},{status:413});
    const text=await req.text();if(Buffer.byteLength(text,"utf8")>48000)return NextResponse.json({error:"신청 내용이 너무 큽니다."},{status:413});
    let body:any;try{body=JSON.parse(text);}catch{return NextResponse.json({error:"신청 형식을 확인해주세요."},{status:400});}

    if(!body||Array.isArray(body)||typeof body!=='object'||!['child','adult'].includes(body.member_type))return NextResponse.json({error:'신청 유형을 확인해주세요.',code:'APPLY_INPUT'},{status:400});
    // 필수 필드 검증
    const isChild = body.member_type === "child";
    const name = isChild ? body.child_name : body.name;
    if (typeof name!=='string'||!name.trim()) return NextResponse.json({ error: "이름은 필수입니다" }, { status: 400 });
    if (typeof body.phone!=='string'||!body.phone.trim()) return NextResponse.json({ error: "연락처는 필수입니다" }, { status: 400 });
    if (body.agree_privacy!==true || body.agree_medical!==true) {
      return NextResponse.json({ error: "동의 항목을 확인해주세요" }, { status: 400 });
    }

    const config=serverConfig();
    if(!config.ready){console.warn('[web-apply]',JSON.stringify({code:'APPLY_SERVER_CONFIG',configuration_issue:config.missing}));return NextResponse.json({error:'온라인 신청 접수가 일시 중단되어 있습니다. 작성 내용은 이 화면에 유지됩니다. 기존 카카오톡 대화창으로 상담을 요청해주세요.',code:'APPLY_SERVER_CONFIG'},{status:503});}
    const supabase=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

    // 메모 조합 (구조화된 정보를 텍스트로)
    const memoParts: string[] = [];
    memoParts.push("━━━━━ 온라인 신청서 접수 ━━━━━");
    memoParts.push(`[유형] ${isChild ? "아동" : "성인"}`);

    if (isChild) {
      if (body.birth) memoParts.push(`[생년월일] ${body.birth}`);
      if (body.gender) memoParts.push(`[성별] ${body.gender}`);
      if (body.height_weight) memoParts.push(`[키/체중] ${body.height_weight}`);
      if (body.guardian_name) memoParts.push(`[보호자] ${body.guardian_name} (${body.guardian_relation || "?"})`);
      if (body.address) memoParts.push(`[주소] ${body.address}`);
      if (body.institution) memoParts.push(`[이용기관] ${body.institution}`);
    } else {
      if (body.gender) memoParts.push(`[성별] ${body.gender}`);
      if (body.birth) memoParts.push(`[생년월일] ${body.birth}`);
      if (body.address) memoParts.push(`[주소] ${body.address}`);
    }

    memoParts.push("");
    memoParts.push("━━━━━ 의학·재활 정보 ━━━━━");
    if (body.diagnosis) memoParts.push(`[진단명]\n${body.diagnosis}`);
    if (body.main_symptom) memoParts.push(`[주 증상]\n${body.main_symptom}`);
    if (body.pain_area) memoParts.push(`[통증부위] ${body.pain_area}`);
    if (body.medication) memoParts.push(`[복용약]\n${body.medication}`);
    if (body.treatment_history) memoParts.push(`[치료이력]\n${body.treatment_history}`);
    if (body.surgery_history) memoParts.push(`[수술이력]\n${body.surgery_history}`);
    if (body.special_notes) memoParts.push(`[특이사항]\n${body.special_notes}`);
    if (body.expected_change) memoParts.push(`[기대 변화]\n${body.expected_change}`);

    memoParts.push("");
    memoParts.push("━━━━━ 희망 사항 ━━━━━");
    memoParts.push(`[희망 지점] ${body.wish_branch || "위례본점"}`);
    if (body.wish_start_date) memoParts.push(`[희망 시작일] ${body.wish_start_date}`);

    memoParts.push("");
    memoParts.push("━━━━━ 개인정보/의료정보 동의: ✅ ━━━━━");

    const memo = memoParts.join("\n");

    const phone = normalizePhone(body.phone);
    if(String(name).trim().length>80||!/^01[016789][0-9]{7,8}$/.test(phone.replace(/\D/g,'')))return NextResponse.json({error:'이름과 휴대전화 번호를 확인해주세요.'},{status:400});
    const event=body.submission_id||crypto.randomUUID();
    if(typeof event!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event))return NextResponse.json({error:'신청 식별자를 확인해주세요.'},{status:400});
    const {data,error}=await supabase.rpc('consultation_web_apply_3927',{p_event:event,p_payload:{...body,intake_memo:memo}});
    if(error){const code=['PGRST202','42883'].includes(error.code)?'APPLY_DB_UPDATE':['401','403','42501','PGRST301','PGRST302'].includes(error.code)?'APPLY_DB_AUTH':'APPLY_SAVE_FAILED';console.warn('[web-apply]',JSON.stringify({code,db_code:error.code}));return NextResponse.json({error:'신청 접수를 완료하지 못했습니다. 작성 내용은 이 화면에 유지됩니다. 잠시 뒤 다시 확인하거나 기존 카카오톡 대화창으로 문의해주세요.',code},{status:503});}
    if(data?.ok!==true){console.warn('[web-apply]',JSON.stringify({code:'APPLY_SAVE_UNCONFIRMED'}));return NextResponse.json({error:'접수 완료 여부를 확인하지 못했습니다. 이 화면을 유지한 채 기존 카카오톡 대화창으로 문의해주세요.',code:'APPLY_SAVE_UNCONFIRMED'},{status:503});}
    // No identity details or existing-record status are exposed to a public caller.
    return NextResponse.json({success:true,submission_id:event});
  } catch (e: any) {
    console.warn("[web-apply] request failed");
    return NextResponse.json({ error: "신청 처리 중 오류가 발생했습니다. 다시 시도해주세요." }, { status: 500 });
  }
}

function normalizePhone(v: string): string {
  const digits = v.replace(/[^\d]/g, "");
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return v;
}
