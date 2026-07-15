"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const DEFAULT_LOGO = "/logo-whale.png";

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

export default function Logo({ size = "md", showText = false, className = "" }: LogoProps) {
  const [logoUrl, setLogoUrl] = useState<string>(DEFAULT_LOGO);

  async function loadLogo() {
    const { data } = await supabase.from("organizations").select("logo_url").limit(1).single();
    if (data?.logo_url) {
      // 캐시 버스팅 파라미터 추가 (즉시 반영)
      const sep = data.logo_url.includes("?") ? "&" : "?";
      setLogoUrl(`${data.logo_url}${sep}v=${Date.now()}`);
    } else {
      setLogoUrl(DEFAULT_LOGO);
    }
  }

  useEffect(() => {
    loadLogo();
    // 로고 업데이트 이벤트 감지 → 즉시 새로고침
    const handler = () => loadLogo();
    window.addEventListener("logo-updated", handler);
    return () => window.removeEventListener("logo-updated", handler);
  }, []);

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <img src={logoUrl} alt="AQUNOTE"
        className={`${SIZE_MAP[size]} object-contain rounded-2xl`}
        onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_LOGO; }} />
      {showText && (
        <span className="font-bold text-aqu-900">AQUNOTE</span>
      )}
    </div>
  );
}
