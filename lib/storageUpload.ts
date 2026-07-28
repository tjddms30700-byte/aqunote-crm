// v3.20.30: Supabase Storage 업로드 공용 유틸 - 파일명 sanitize + 재시도 + 예외 처리 강화
import { supabase } from "@/lib/supabase";

/**
 * Supabase Storage는 파일 경로에 한글/특수문자 사용 시 종종 실패한다.
 * 안전한 파일명으로 변환하면서 원본 파일명은 DB의 filename 컬럼에 그대로 보존.
 */
export function sanitizeStorageFileName(name: string): string {
  if (!name) return `file_${Date.now()}`;
  // 확장자 분리
  const dotIdx = name.lastIndexOf(".");
  const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  const ext = dotIdx > 0 ? name.slice(dotIdx + 1).toLowerCase() : "";
  // ASCII 알파벳/숫자/. - _ 만 허용, 그 외 문자는 _ 로 치환
  let safe = base
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!safe) safe = "file";
  // 확장자 화이트리스트
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  return safeExt ? `${safe}.${safeExt}` : safe;
}

/**
 * 지정된 버킷(기본 documents)에 파일 업로드.
 * - 한글 파일명 sanitize
 * - 동일 경로 존재 시 timestamp 재부여로 1회 자동 재시도
 * - RLS/버킷 미설정 오류를 사람이 읽을 수 있게 변환
 */
export async function uploadToStorage(
  bucket: string,
  pathPrefix: string,
  file: File,
): Promise<{ filePath: string; publicUrl?: string }> {
  const safeName = sanitizeStorageFileName(file.name);
  let filePath = `${pathPrefix}/${Date.now()}_${safeName}`;

  const client = supabase.storage.from(bucket);
  let { error: upErr } = await client.upload(filePath, file, {
    upsert: false,
    cacheControl: "3600",
    contentType: file.type || "application/octet-stream",
  });

  // 파일명 충돌 시 1회 재시도
  if (upErr && /already exists|duplicate/i.test(upErr.message || "")) {
    filePath = `${pathPrefix}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
    const retry = await client.upload(filePath, file, {
      upsert: false,
      cacheControl: "3600",
      contentType: file.type || "application/octet-stream",
    });
    upErr = retry.error;
  }

  if (upErr) {
    const msg = String(upErr.message || upErr);
    if (/bucket.*not.*found|Bucket not found/i.test(msg)) {
      throw new Error(
        `Storage 버킷 "${bucket}"가 없습니다. Supabase 대시보드 → Storage에서 "${bucket}" 버킷을 생성해 주세요.`,
      );
    }
    if (/row-level security|policy|permission/i.test(msg)) {
      throw new Error(
        `Storage RLS 정책 오류: "${bucket}" 버킷에 INSERT 정책을 추가해 주세요. (Supabase 대시보드 → Storage → Policies → New policy)`,
      );
    }
    if (/payload too large|exceeded/i.test(msg)) {
      throw new Error("파일 크기 초과: 50MB 이하로 업로드해 주세요.");
    }
    throw new Error(`업로드 실패: ${msg}`);
  }

  const { data: pub } = client.getPublicUrl(filePath);
  return { filePath, publicUrl: pub?.publicUrl };
}
