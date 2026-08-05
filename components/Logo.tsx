"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const DEFAULT_LOGO = "/logo-whale.png";
const LOGO_CACHE_KEY = "aqu_logo_url_v2";
const ACTIVE_BRANCH_KEY = "aqu_active_branch_id";

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
 * 🐋 로고 컴포넌트 (v3.11: 지점별 독립 로고)
 * ─────────────────────
 * - 현재 활성 지점(branches.logo_url) 우선, 없으면 organizations.logo_url, 없으면 기본 로고
 * - localStorage 캐시로 첫 렌더 깜빡임 방지
 * - "logo-updated"/"logo-reset"/"branch-switched" 이벤트 감지하여 실시간 갱신
 */
export default function Logo({ size = "md", showText = false, className = "" }: LogoProps) {
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

    // ✅ v3.11: 현재 지점의 로고 우선 조회
    let logo: string | null = null;
    try {
      const branchId = window.localStorage.getItem(ACTIVE_BRANCH_KEY);
      if (branchId) {
        const { data } = await supabase
          .from("branches")
          .select("logo_url")
          .eq("id", branchId)
          .maybeSingle();
        if (data?.logo_url) logo = data.logo_url;
      }
    } catch {}

    // 지점 로고 없으면 organizations로 폴백
    if (!logo) {
      try {
        const { data } = await supabase
          .from("organizations")
          .select("logo_url")
          .limit(1)
          .single();
        if (data?.logo_url) logo = data.logo_url;
      } catch {}
    }

    if (logo) {
      const sep = logo.includes("?") ? "&" : "?";
      const url = `${logo}${sep}v=${Date.now()}`;
      setLogoUrl(url);
      try { window.localStorage.setItem(LOGO_CACHE_KEY, url); } catch {}
    } else {
      setLogoUrl(DEFAULT_LOGO);
      try { window.localStorage.setItem(LOGO_CACHE_KEY, "DEFAULT"); } catch {}
    }
  }

  useEffect(() => {
    loadLogo();
    const updateHandler = () => loadLogo();
    const resetHandler = () => loadLogo(true);
    window.addEventListener("logo-updated", updateHandler);
    window.addEventListener("logo-reset", resetHandler);
    window.addEventListener("branch-switched", updateHandler);
    return () => {
      window.removeEventListener("logo-updated", updateHandler);
      window.removeEventListener("logo-reset", resetHandler);
      window.removeEventListener("branch-switched", updateHandler);
    };
  }, []);

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src={logoUrl}
        alt="아쿠노트"
        className={`${SIZE_MAP[size]} object-contain rounded-2xl`}
        onError={(e) => {
          (e.target as HTMLImageElement).src = DEFAULT_LOGO;
          try { window.localStorage.setItem(LOGO_CACHE_KEY, "DEFAULT"); } catch {}
        }}
      />
      {showText && <span className="font-bold text-aqu-900">아쿠노트</span>}
    </div>
  );
}
