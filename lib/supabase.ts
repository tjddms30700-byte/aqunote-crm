import { createClient } from "@supabase/supabase-js";

// v3.23.6 긴급 하드코딩 fallback: Vercel 환경변수가 빌드 시 주입 실패해도 작동하도록
// (환경변수가 정상 주입되면 그것을 우선 사용, 아니면 하드코딩 값으로 fallback)
const HARDCODED_URL = "https://ngewuwxrvhorsfrdxlfu.supabase.co";
const HARDCODED_KEY = "sb_publishable_K-qxr6wIYdRQtYvupY_m4A_82w2zNwE";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || HARDCODED_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || HARDCODED_KEY;

// placeholder 값이 들어있으면 강제로 하드코딩 값으로 교체 (v3.23.6 방어 로직)
const finalUrl = supabaseUrl.includes("placeholder") ? HARDCODED_URL : supabaseUrl;
const finalKey = supabaseAnonKey.includes("placeholder") ? HARDCODED_KEY : supabaseAnonKey;

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
