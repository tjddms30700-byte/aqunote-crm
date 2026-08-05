import { NextResponse } from "next/server";
import { parseKakaoTalk } from "@/lib/kakaoParser";

/* ============================================================
   v3.15.1 - 카카오톡 파일 파싱 (미리보기용)
   POST multipart/form-data { file: File }
   Response: ParseResult (DB 저장 없음)
============================================================ */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
    }

    const buf = await file.arrayBuffer();
    // 카카오톡 export는 UTF-8 기본, 일부는 EUC-KR
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    } catch {
      text = new TextDecoder("euc-kr").decode(buf);
    }

    const result = parseKakaoTalk(text, file.name);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[kakao/parse] error:", e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
