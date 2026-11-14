/**
 * AQUNOTE - 공개 신청 폼 접수 API
 * POST /api/apply
 *   - 아동 · 성인 신청서를 leads_inbox에 즉시 저장
 *   - 관리자 /inbox 페이지에서 승격 대기
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if(Number(req.headers.get("content-length")||0)>48000)return NextResponse.json({error:"신청 내용이 너무 큽니다."},{status:413});
    const text=await req.text();if(Buffer.byteLength(text,"utf8")>48000)return NextResponse.json({error:"신청 내용이 너무 큽니다."},{status:413});
    let body:any;try{body=JSON.parse(text);}catch{return NextResponse.json({error:"신청 형식을 확인해주세요."},{status:400});}

    // 필수 필드 검증
    const isChild = body.member_type === "child";
    const name = isChild ? body.child_name : body.name;
    if (!name) return NextResponse.json({ error: "이름은 필수입니다" }, { status: 400 });
    if (!body.phone) return NextResponse.json({ error: "연락처는 필수입니다" }, { status: 400 });
    if (!body.agree_privacy || !body.agree_medical) {
      return NextResponse.json({ error: "동의 항목을 확인해주세요" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

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
    if(!/^[0-9a-f-]{36}$/i.test(event))return NextResponse.json({error:'신청 식별자를 확인해주세요.'},{status:400});
    const {data,error}=await supabase.rpc('consultation_web_apply_3927',{p_event:event,p_payload:{...body,intake_memo:memo}});
    if(error){console.warn('[web-apply]',JSON.stringify({code:error.code}));return NextResponse.json({error:['PGRST202','42883'].includes(error.code)?'신청 접수 DB 업데이트가 필요합니다. 센터에 문의해주세요.':'신청을 저장하지 못했습니다. 센터·연락처를 확인하고 다시 시도해주세요.'},{status:503});}
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
