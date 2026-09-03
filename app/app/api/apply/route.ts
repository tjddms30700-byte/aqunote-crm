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

    // v3.31.0: 종만감이 자동 승격 - leads_inbox 메이보다 members + consultations 직접 INSERT
    // 이제 신청폼 제출 즉시 [NEW 신규] 컬럼으로 자동 생성 (수동 승격 절차 완전 제거)

    // 1) leads_inbox에도 백업으로 저장 (오류 무시 - 테이블 없을 수 있음)
    let leadId: string | null = null;
    try {
      const { data: leadData } = await supabase.from("leads_inbox").insert(payload).select().maybeSingle();
      leadId = leadData?.id || null;
    } catch (e) { console.warn("[v3.31.0] leads_inbox 저장 실패 (무시):", e); }

    // 2) members 테이블에 직접 INSERT (status='new' - 파이프라인 [NEW 신규] 컬럼에 바로 표시)
    const memberPayload: any = {
      name,
      phone,
      member_type: body.member_type,
      gender: body.gender || null,
      birth: body.birth || null,
      address: body.address || null,
      guardian_name: isChild ? (body.guardian_name || null) : null,
      guardian_relation: isChild ? (body.guardian_relation || null) : null,
      school: isChild ? (body.institution || null) : null,
      diagnosis: body.diagnosis || null,
      status: "new", // 파이프라인 [NEW 신규] 컬럼 직행
      source: body.source || "웹신청",
      memo,
      wish_days: body.wish_days?.length > 0 ? body.wish_days : null,
      wish_time_slots: body.wish_time_slots?.length > 0 ? body.wish_time_slots : null,
      extra: {
        height_weight: body.height_weight,
        main_symptom: body.main_symptom,
        surgery_history: body.surgery_history,
        medication: body.medication,
        treatment_history: body.treatment_history,
        expected_change: body.expected_change,
        wish_branch: body.wish_branch,
        wish_start_date: body.wish_start_date,
        source_lead_id: leadId,
      },
    };

    // ✅ v3.49.5: 희망 지점(wish_branch) 텍스트 → branches.id 자동 매핑
    //   기존 버그: memberPayload에 branch_id가 없어 지점 필터가 걸린 화면(상담/시간표)에서
    //   신규 접수 회원이 보이지 않던 문제. 매칭 실패 시 첫 번째(본점) 지점으로 폴백.
    try {
      const { data: branchRows } = await supabase
        .from("branches")
        .select("id, name, branch_type")
        .is("deleted_at", null)
        .order("branch_type", { ascending: true })
        .order("created_at");
      if (branchRows && branchRows.length > 0) {
        const wish = String(body.wish_branch || "").replace(/\s/g, "");
        const matched =
          branchRows.find((b: any) => wish && String(b.name || "").replace(/\s/g, "").includes(wish.replace(/점$/, "").replace(/본점$/, ""))) ||
          branchRows.find((b: any) => wish && wish.includes(String(b.name || "").replace(/점$/, ""))) ||
          branchRows[0]; // 폴백: 본점(첫 번째)
        memberPayload.branch_id = matched.id;
      }
    } catch (e) { console.warn("[v3.49.5] branch 매핑 실패 (무시):", e); }

    const { data: memberData, error: memberErr } = await supabase
      .from("members")
      .insert(memberPayload)
      .select()
      .single();

    if (memberErr) {
      console.error("[v3.31.0] members 자동 승격 실패:", memberErr);
      return NextResponse.json({ error: memberErr.message }, { status: 500 });
    }

    // 3) consultations 테이블에도 기록 (상담 이력 추적용 - 있으면)
    try {
      await supabase.from("consultations").insert({
        member_id: memberData.id,
        status: "new",
        source: body.source || "웹신청",
        memo,
        raw_payload: body,
        created_at: new Date().toISOString(),
      });
    } catch (e) { console.warn("[v3.31.0] consultations 저장 실패 (무시):", e); }

    console.log("[v3.31.0] ✅ 신규 상담 자동 승격 완료:", { memberId: memberData.id, name, phone });

    return NextResponse.json({ success: true, id: memberData.id, leadId });
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
