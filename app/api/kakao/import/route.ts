import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ============================================================
   v3.15.2 - 카카오톡 파싱 결과 → DB 실제 저장 (안전 강화판)
   - 어떤 예외 상황에서도 JSON 응답 보장
   - service_role_key 없으면 anon_key 폴백
   - 배치 처리 최적화
============================================================ */

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

interface SlimSession {
  date: string;
  weekday: string;
  status: "attended" | "cancelled" | "sick" | "absent" | "makeup";
  activities: string[];
  tags: string[];
  memo: string;
  parent_messages?: string[];
}

// 어떤 상황에서도 JSON 응답을 반환하기 위한 헬퍼
function jsonError(msg: string, status = 500, extra: any = {}) {
  return NextResponse.json(
    { error: msg, ...extra },
    { status, headers: { "Content-Type": "application/json" } }
  );
}

export async function POST(req: Request) {
  try {
    // 1) 요청 파싱
    let body: any;
    try {
      body = await req.json();
    } catch (e: any) {
      return jsonError("요청 본문 파싱 실패: " + (e.message || e), 400);
    }

    const { member_id, sessions, staff_id, skip_duplicates = true } = body as {
      member_id: string;
      sessions: SlimSession[];
      staff_id?: string;
      skip_duplicates?: boolean;
    };

    if (!member_id) return jsonError("member_id 필수", 400);
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return jsonError("세션 목록이 비어있습니다", 400);
    }

    // 2) Supabase 클라이언트 (service_role 우선, 없으면 anon)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const key = serviceKey || anonKey;

    if (!url || !key) {
      return jsonError(
        "Supabase 환경변수 누락 - NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 확인 필요",
        500
      );
    }

    const admin = createClient(url, key);
    const usingServiceKey = !!serviceKey;

    // 3) 조직 ID 조회 (실패해도 계속 진행)
    let orgId: string | null = null;
    try {
      const org = await admin.from("organizations").select("id").limit(1).single();
      orgId = org.data?.id || null;
    } catch {
      // 무시
    }

    // 4) 회원 존재 확인
    const { data: mem, error: memErr } = await admin
      .from("members")
      .select("id, name")
      .eq("id", member_id)
      .maybeSingle();

    if (memErr) return jsonError("회원 조회 실패: " + memErr.message, 500);
    if (!mem) return jsonError("회원을 찾을 수 없습니다 (id=" + member_id + ")", 404);

    // 5) 중복 체크 - 이 회원의 기존 세션 날짜 목록
    let existingDates = new Set<string>();
    if (skip_duplicates) {
      try {
        const { data: exist } = await admin
          .from("sessions")
          .select("session_date")
          .eq("member_id", member_id);
        existingDates = new Set(
          (exist || []).map((s: any) => s.session_date).filter(Boolean)
        );
      } catch {
        // sessions 테이블이 없을 수도 있음 - 무시
      }
    }

    // 6) 세션 & 출결 payload 준비
    const statusMap: Record<string, string> = {
      attended: "present",
      makeup: "present",
      sick: "sick",
      cancelled: "absent",
      absent: "absent",
    };

    const sessionsPayload: any[] = [];
    const attendancePayload: any[] = [];
    let skipped = 0;

    for (const s of sessions) {
      if (!s.date) continue;
      if (skip_duplicates && existingDates.has(s.date)) {
        skipped++;
        continue;
      }
      if (s.status === "attended" || s.status === "makeup") {
        sessionsPayload.push({
          org_id: orgId,
          member_id,
          staff_id: staff_id || null,
          session_date: s.date,
          activities: s.activities || [],
          tags: s.tags || [],
          memo: (s.memo || "").slice(0, 2000),
          source: "kakao_import",
        });
      }
      attendancePayload.push({
        org_id: orgId,
        member_id,
        attend_date: s.date,
        status: statusMap[s.status] || "absent",
      });
    }

    // 7) sessions 배치 저장
    let insertedSessions = 0;
    const errors: string[] = [];

    if (sessionsPayload.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < sessionsPayload.length; i += CHUNK) {
        const chunk = sessionsPayload.slice(i, i + CHUNK);
        const { error } = await admin.from("sessions").insert(chunk);
        if (error) {
          if (
            error.code === "42P01" ||
            error.code === "PGRST205" ||
            error.message?.includes("does not exist") ||
            error.message?.includes("schema cache")
          ) {
            errors.push(
              "sessions 테이블 없음 또는 스키마 오류 - AQUNOTE_V315_SESSIONS_FIXED.sql 실행 필요"
            );
            break; // 이후 청크도 실패할 것이므로 중단
          } else if (
            error.code === "42501" ||
            error.message?.toLowerCase().includes("permission") ||
            error.message?.toLowerCase().includes("policy") ||
            error.message?.toLowerCase().includes("row-level security")
          ) {
            errors.push(
              "RLS 정책으로 인해 저장 거부됨 - Vercel 환경변수 SUPABASE_SERVICE_ROLE_KEY 등록 필요"
            );
            break;
          } else {
            errors.push(`세션 저장 실패 (${i}~${i + chunk.length}): ${error.message}`);
          }
        } else {
          insertedSessions += chunk.length;
        }
      }
    }

    // 8) attendance 저장 (개별 upsert - 중복 체크)
    let insertedAttendance = 0;
    for (const a of attendancePayload) {
      try {
        const { data: exist } = await admin
          .from("attendance")
          .select("id")
          .eq("member_id", a.member_id)
          .eq("attend_date", a.attend_date)
          .maybeSingle();
        if (exist) continue;
        const { error } = await admin.from("attendance").insert(a);
        if (!error) insertedAttendance++;
      } catch {
        // 개별 실패는 무시
      }
    }

    return NextResponse.json({
      status: "ok",
      member_name: mem.name,
      inserted_sessions: insertedSessions,
      inserted_attendance: insertedAttendance,
      skipped_duplicates: skipped,
      using_service_key: usingServiceKey,
      errors,
    });
  } catch (e: any) {
    console.error("[kakao/import] fatal error:", e);
    return jsonError("서버 예외: " + (e?.message || String(e)), 500);
  }
}
