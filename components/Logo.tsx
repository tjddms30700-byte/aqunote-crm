"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const DEFAULT_LOGO = "/logo-whale.png";
const LOGO_CACHE_KEY = "aqu_logo_url_v2";

type LogoProps = {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  className?: string;
};

const SIZE_MAP = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-20 h-20 md:w-24 md:h-24",
  xl: "w-28 h-28 md:w-36 md:h-36",
};

/**
 * 🐋 로고 컴포넌트
 * ─────────────────────
 * - localStorage 캐시로 깜빡임 방지 (SSR/CSR 첫 렌더에 즉시 반영)
 * - DB의 logo_url이 null이면 기본 로고 (아쿠고래) 사용
 * - "logo-updated" 이벤트로 실시간 전체 페이지 즉시 반영
 * - "logo-reset" 이벤트 발생 시 캐시 즉시 초기화 (깜빡임 없이)
 */
export default function Logo({ size = "md", showText = false, className = "" }: LogoProps) {
  // 초기 상태: localStorage에 저장된 값 or 기본 로고 (깜빡임 방지)
  const [logoUrl, setLogoUrl] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_LOGO;
    try {
      const cached = window.localStorage.getItem(LOGO_CACHE_KEY);
      if (cached === "DEFAULT" || !cached) return DEFAULT_LOGO;
      return cached;
    } catch {
      return DEFAULT_LOGO;
    }
  });

  async function loadLogo(forceDefault = false) {
    if (forceDefault) {
      setLogoUrl(DEFAULT_LOGO);
      try { window.localStorage.setItem(LOGO_CACHE_KEY, "DEFAULT"); } catch {}
      return;
    }
    const { data } = await supabase
      .from("organizations")
      .select("logo_url")
      .limit(1)
      .single();

    if (data?.logo_url) {
      // 캐시 버스팅 파라미터 추가
      const sep = data.logo_url.includes("?") ? "&" : "?";
      const url = `${data.logo_url}${sep}v=${Date.now()}`;
      setLogoUrl(url);
      try { window.localStorage.setItem(LOGO_CACHE_KEY, url); } catch {}
    } else {
      // ✅ DB의 logo_url이 null → 즉시 기본 로고 + 캐시도 DEFAULT로 갱신
      setLogoUrl(DEFAULT_LOGO);
      try { window.localStorage.setItem(LOGO_CACHE_KEY, "DEFAULT"); } catch {}
    }
  }

  useEffect(() => {
    loadLogo();
    const updateHandler = () => loadLogo();
    // 명시적 리셋: 즉시 기본 로고로 강제 (DB 왕복 없이 깜빡임 없음)
    const resetHandler = () => loadLogo(true);
    window.addEventListener("logo-updated", updateHandler);
    window.addEventListener("logo-reset", resetHandler);
    return () => {
      window.removeEventListener("logo-updated", updateHandler);
      window.removeEventListener("logo-reset", resetHandler);
    };
  }, []);

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src={logoUrl}
        alt="아쿠노트"
        className={`${SIZE_MAP[size]} object-contain rounded-2xl`}
        onError={(e) => {
          // 로드 실패 시 즉시 기본 로고 + 캐시 정리
          (e.target as HTMLImageElement).src = DEFAULT_LOGO;
          try { window.localStorage.setItem(LOGO_CACHE_KEY, "DEFAULT"); } catch {}
        }}
      />
      {showText && <span className="font-bold text-aqu-900">아쿠노트</span>}
    </div>
  );
}
