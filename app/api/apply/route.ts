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
    const body = await req.json();

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
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
    memoParts.push(`━━━━━ 개인정보/의료정보 동의: ✅ (${new Date().toLocaleString("ko-KR")}) ━━━━━`);

    const memo = memoParts.join("\n");

    const phone = normalizePhone(body.phone);
    const sourceRowId = `web_apply_${Date.now()}_${name}_${phone}`;

    const payload = {
      source_row_id: sourceRowId,
      name,
      phone,
      member_type: body.member_type,
      source: body.source || "웹신청",
      memo,
      wish_days: body.wish_days || null,
      wish_time_slots: body.wish_time_slots || null,
      wish_start_date: body.wish_start_date || null,
      raw_payload: body,   // 원본 그대로 백업
    };

    const { data, error } = await supabase
      .from("leads_inbox")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("Apply insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (e: any) {
    console.error("Apply POST error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function normalizePhone(v: string): string {
  const digits = v.replace(/[^\d]/g, "");
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return v;
}
