/**
 * ═══════════════════════════════════════════════════════════════
 * AQUNOTE - Google Sheets 자동 동기화 API Route
 * ═══════════════════════════════════════════════════════════════
 *
 * 동작 방식:
 *   1. Vercel Cron이 5분마다 GET /api/sync-sheets 호출
 *   2. 이 API가 AQU LAB 시트의 CSV export를 fetch
 *   3. 각 행을 파싱하여 Supabase leads_inbox에 upsert
 *   4. 이미 있는 row는 skip, 신규만 추가
 *
 * 시트 요구사항:
 *   - "링크가 있는 모든 사용자"로 공유 설정 되어 있어야 함
 *   - CSV export URL 접근 가능해야 함
 *
 * 트리거 방법:
 *   - 자동: Vercel Cron (vercel.json에 정의)
 *   - 수동: /inbox 페이지의 "지금 동기화" 버튼
 *   - 외부: GET https://aqunote.vercel.app/api/sync-sheets
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SHEET_ID = "1lzSXvmClip7LXign9mqmRIE9CHyY2oqXApQhd-g6JKg";

// AQU LAB 상담자동화 시트의 탭들 (gid는 사용자가 설정에서 수정 가능)
const SOURCE_TABS = [
  {
    name: "아동상담",
    gid: "527581212",       // 📋 아동상담_정리뷰 탭
    type: "child" as const,
  },
  // 성인 gid는 사용자 확인 후 추가 (아래 성인 상담 탭 gid 알려주시면 넣어드림)
  // {
  //   name: "성인상담",
  //   gid: "XXX",           // 📋 성인상담_정리뷰 탭 gid
  //   type: "adult" as const,
  // },
];

// 헤더 매핑: CSV 헤더 값 → leads_inbox 필드
const HEADER_MAP: Record<string, string[]> = {
  received_at: ["접수일", "날짜", "timestamp"],
  name: ["이름", "성함", "아동 이름", "회원이름"],
  birth: ["생년월일", "birth", "생일"],
  gender: ["성별", "gender"],
  guardian: ["보호자", "부모", "guardian"],
  relation: ["관계", "relation"],
  phone: ["연락처", "전화번호", "phone", "휴대폰"],
  address: ["주소", "address"],
  source: ["유입경로", "유입", "경로"],
  status: ["상담 상태", "상태", "status", "📊"],
  trial_date: ["체험일", "🗓️"],
  memo: ["메모", "비고", "📝"],
  diagnosis: ["진단명", "진단"],
  current_status: ["현재 상태", "현재상태"],
  main_symptom: ["주증상", "주 증상"],
  medication: ["복용약", "복용 약"],
  treatment_history: ["치료이력", "치료 이력"],
  expected_change: ["기대 변화", "기대변화"],
  wish_start_date: ["가능 시작일", "시작일", "희망시작일"],
};

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1";

  // Supabase 클라이언트 (Service Role Key 사용 시 RLS 우회 가능, 없으면 anon)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase env not set" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const results: any[] = [];
  let totalNew = 0, totalUpdated = 0, totalSkipped = 0, totalError = 0;

  for (const tab of SOURCE_TABS) {
    try {
      // CSV export
      const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${tab.gid}`;
      const csvRes = await fetch(csvUrl, {
        redirect: "follow",
        cache: "no-store",
        headers: { "User-Agent": "AQUNOTE-Sync/1.0" },
      });

      if (!csvRes.ok) {
        results.push({ tab: tab.name, error: `HTTP ${csvRes.status}` });
        totalError++;
        continue;
      }

      const csvText = await csvRes.text();
      const rows = parseCSV(csvText);

      // 헤더 행 찾기 (컬럼명이 5개 이상이고 "이름" 포함)
      const headerRowIdx = rows.findIndex(
        (r) => r.filter((c) => c.trim()).length >= 5 && r.some((c) => c.includes("이름"))
      );

      if (headerRowIdx === -1) {
        results.push({ tab: tab.name, error: "헤더 행 찾을 수 없음" });
        totalError++;
        continue;
      }

      const headers = rows[headerRowIdx];
      const dataRows = rows.slice(headerRowIdx + 1);

      // 헤더 → 컬럼 인덱스 매핑
      const colIdx: Record<string, number> = {};
      headers.forEach((h, i) => {
        const cleanH = h.trim();
        if (!cleanH) return;
        for (const [field, candidates] of Object.entries(HEADER_MAP)) {
          if (candidates.some((c) => cleanH.includes(c))) {
            if (colIdx[field] === undefined) colIdx[field] = i;
            break;
          }
        }
      });

      // 데이터 행 처리
      let newCount = 0, updatedCount = 0, skippedCount = 0;
      for (let ri = 0; ri < dataRows.length; ri++) {
        const row = dataRows[ri];
        // 빈 행 스킵
        if (row.filter((c) => c.trim()).length < 2) continue;

        const name = row[colIdx.name || 1]?.trim();
        if (!name || name.length < 1 || name.startsWith("📋") || name.startsWith("💡")) {
          skippedCount++;
          continue;
        }

        // 이 시트 행의 고유 식별자 (탭명 + 이름 + 생년월일 + 연락처)
        const birth = row[colIdx.birth]?.trim() || "";
        const phone = normalizePhone(row[colIdx.phone]?.trim() || "");
        const sourceRowId = `${tab.name}_${name}_${birth}_${phone}`.replace(/\s+/g, "");

        // 메모 조합
        const memoParts: string[] = [];
        const memoRaw = row[colIdx.memo]?.trim();
        if (memoRaw) memoParts.push(memoRaw);
        if (row[colIdx.status]?.trim()) memoParts.push(`[상태] ${row[colIdx.status]}`);
        if (row[colIdx.trial_date]?.trim()) memoParts.push(`[체험일] ${row[colIdx.trial_date]}`);
        if (row[colIdx.guardian]?.trim()) memoParts.push(`[보호자] ${row[colIdx.guardian]} (${row[colIdx.relation] || "?"})`);
        if (row[colIdx.address]?.trim()) memoParts.push(`[주소] ${row[colIdx.address]}`);
        if (row[colIdx.gender]?.trim()) memoParts.push(`[성별] ${row[colIdx.gender]}`);
        if (birth) memoParts.push(`[생년월일] ${birth}`);

        const payload: any = {
          source_row_id: sourceRowId,
          name,
          phone: phone || null,
          member_type: tab.type,
          source: row[colIdx.source]?.trim() || "구글폼",
          memo: memoParts.join("\n") || null,
          wish_start_date: parseDate(row[colIdx.wish_start_date]?.trim()),
          raw_payload: Object.fromEntries(
            headers.map((h, i) => [h.trim() || `col${i}`, row[i]?.trim() || ""])
              .filter(([, v]) => v)
          ),
        };

        if (dryRun) {
          newCount++;
          continue;
        }

        // upsert (source_row_id 기준)
        const { data, error } = await supabase
          .from("leads_inbox")
          .upsert(payload, { onConflict: "source_row_id", ignoreDuplicates: false })
          .select();

        if (error) {
          console.error(`[${tab.name}][${ri}] ${name} 실패:`, error.message);
          totalError++;
        } else if (data && data.length > 0) {
          // 신규인지 업데이트인지 판단 (created_at 기준)
          const isNew = new Date(data[0].created_at).getTime() > Date.now() - 5000;
          if (isNew) newCount++;
          else updatedCount++;
        }
      }

      results.push({
        tab: tab.name,
        gid: tab.gid,
        headers_matched: Object.keys(colIdx),
        rows_total: dataRows.length,
        new: newCount,
        updated: updatedCount,
        skipped: skippedCount,
      });
      totalNew += newCount;
      totalUpdated += updatedCount;
      totalSkipped += skippedCount;
    } catch (e: any) {
      results.push({ tab: tab.name, error: e.message });
      totalError++;
    }
  }

  return NextResponse.json({
    success: true,
    synced_at: new Date().toISOString(),
    dry_run: dryRun,
    summary: {
      total_new: totalNew,
      total_updated: totalUpdated,
      total_skipped: totalSkipped,
      total_error: totalError,
    },
    tabs: results,
  });
}

// ─── CSV 파서 (간단한 quote-aware) ─────────────────────────
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && next === "\n") i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += ch;
      }
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function normalizePhone(v: string): string {
  if (!v) return "";
  const digits = v.replace(/[^\d]/g, "");
  if (digits.length === 10) return digits.slice(0, 3) + "-" + digits.slice(3, 6) + "-" + digits.slice(6);
  if (digits.length === 11) return digits.slice(0, 3) + "-" + digits.slice(3, 7) + "-" + digits.slice(7);
  return v;
}

function parseDate(v: string | undefined): string | null {
  if (!v) return null;
  // "2026. 7. 15" 형식
  const m = v.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
