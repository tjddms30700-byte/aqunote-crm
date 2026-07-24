import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { ParsedSession } from "@/lib/kakaoParser";

/* ============================================================
   v3.15.1 - 카카오톡 파싱 결과 → DB 실제 저장
   POST JSON {
     member_id: string,
     sessions: ParsedSession[],
     staff_id?: string,
     skip_duplicates?: boolean
   }
============================================================ */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { member_id, sessions, staff_id, skip_duplicates = true } = body as {
      member_id: string;
      sessions: ParsedSession[];
      staff_id?: string;
      skip_duplicates?: boolean;
    };

    if (!member_id) return NextResponse.json({ error: "member_id 필수" }, { status: 400 });
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return NextResponse.json({ error: "세션 목록이 비어있습니다" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.json({ error: "supabase env 누락" }, { status: 500 });

    const admin = createClient(url, key);

    // 조직 ID 조회
    const orgId = (await admin.from("organizations").select("id").limit(1).single()).data?.id;

    // 회원 존재 확인
    const { data: mem, error: memErr } = await admin.from("members").select("id, name").eq("id", member_id).single();
    if (memErr || !mem) return NextResponse.json({ error: "회원 조회 실패" }, { status: 404 });

    // 중복 체크: 같은 회원의 같은 날짜 세션
    let existingDates = new Set<string>();
    if (skip_duplicates) {
      const { data: exist } = await admin
        .from("sessions")
        .select("session_date")
        .eq("member_id", member_id);
      existingDates = new Set((exist || []).map((s: any) => s.session_date));
    }

    // attendance에도 병결/결석 이력 반영
    const attendancePayload: any[] = [];
    const sessionsPayload: any[] = [];
    let skipped = 0;

    for (const s of sessions) {
      if (skip_duplicates && existingDates.has(s.date)) {
        skipped++;
        continue;
      }

      // sessions 테이블 (세션 기록)
      if (s.status === "attended" || s.status === "makeup") {
        sessionsPayload.push({
          org_id: orgId,
          member_id,
          staff_id: staff_id || null,
          session_date: s.date,
          activities: s.activities,
          memo: s.memo,
          tags: s.tags,
          source: "kakao_import",
        });
      }

      // attendance 테이블 (출결)
      const statusMap: Record<string, string> = {
        attended: "present",
        makeup: "present",
        sick: "sick",
        cancelled: "absent",
        absent: "absent",
      };
      attendancePayload.push({
        org_id: orgId,
        member_id,
        attend_date: s.date,
        status: statusMap[s.status] || "absent",
      });
    }

    // 배치 저장
    let insertedSessions = 0;
    let insertedAttendance = 0;
    const errors: string[] = [];

    if (sessionsPayload.length > 0) {
      const { error } = await admin.from("sessions").insert(sessionsPayload);
      if (error) {
        // sessions 테이블이 없으면 스킵 (attendance만 저장)
        if (error.code === "42P01" || error.code === "PGRST205" || error.message?.includes("does not exist")) {
          errors.push("sessions 테이블 없음 - AQUNOTE_V315_SESSIONS.sql 실행 필요");
        } else {
          errors.push("세션 저장 실패: " + error.message);
        }
      } else {
        insertedSessions = sessionsPayload.length;
      }
    }

    // attendance는 upsert (중복 방지)
    if (attendancePayload.length > 0) {
      for (const a of attendancePayload) {
        const { data: exist } = await admin
          .from("attendance")
          .select("id")
          .eq("member_id", a.member_id)
          .eq("attend_date", a.attend_date)
          .maybeSingle();
        if (exist) continue;
        const { error } = await admin.from("attendance").insert(a);
        if (!error) insertedAttendance++;
      }
    }

    return NextResponse.json({
      status: "ok",
      member_name: mem.name,
      inserted_sessions: insertedSessions,
      inserted_attendance: insertedAttendance,
      skipped_duplicates: skipped,
      errors,
    });
  } catch (e: any) {
    console.error("[kakao/import] error:", e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
