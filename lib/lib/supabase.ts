import { createClient } from "@supabase/supabase-js";

// v3.23.7 완전 해결판: JWT 형식 anon key 하드코딩 (신형 sb_publishable 대신)
// Vercel 환경변수 주입 실패 상황과 무관하게 무조건 작동
const HARDCODED_URL = "https://ngewuwxrvhorsfrdxlfu.supabase.co";
const HARDCODED_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nZXd1d3hydmhvcnNmcmR4bGZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NjIwOTMsImV4cCI6MjA5OTEzODA5M30.Sjll5Osx3Amnoo5s-QI1vZE35x_zn8zAcCOa3bn7Cc0";

// 환경변수가 유효한 값(placeholder가 아니고 sb_publishable도 아닌 JWT)이면 사용, 아니면 하드코딩
function pickKey(envKey: string | undefined): string {
  if (!envKey) return HARDCODED_KEY;
  if (envKey.includes("placeholder")) return HARDCODED_KEY;
  // sb_publishable 신형 키는 아쿠노트 코드 일부 경로에서 인식 실패 → JWT 우선
  if (envKey.startsWith("sb_publishable_")) return HARDCODED_KEY;
  if (envKey.startsWith("eyJ")) return envKey;
  return HARDCODED_KEY;
}

function pickUrl(envUrl: string | undefined): string {
  if (!envUrl) return HARDCODED_URL;
  if (envUrl.includes("placeholder")) return HARDCODED_URL;
  if (envUrl.includes("aBcDe")) return HARDCODED_URL;
  if (envUrl.startsWith("https://") && envUrl.includes(".supabase.co")) return envUrl;
  return HARDCODED_URL;
}

const finalUrl = pickUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const finalKey = pickKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const supabase = createClient(finalUrl, finalKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      apikey: finalKey,
      Authorization: `Bearer ${finalKey}`,
    },
  },
});
