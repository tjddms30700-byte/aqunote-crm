import "./globals.css";
import PwaRegister from "@/components/PwaRegister";
import MobileAppShell from "@/components/MobileAppShell";
import NativeAppBridge from "@/components/NativeAppBridge";
import type { Metadata, Viewport } from "next";
import GlobalHeaderWrapper from "@/components/GlobalHeaderWrapper";

export const viewport: Viewport = {width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#0a5f6e"};

export const metadata: Metadata = {
  title: "아쿠노트 프로그램",
  manifest: "/manifest.json",
  appleWebApp:{capable:true,title:"아쿠노트",statusBarStyle:"default"},
  description: "위례아쿠수중운동센터 통합 관리 시스템",
  icons: {
    icon: [
      { url: "/logo-whale.png", type: "image/png" },
    ],
    shortcut: "/logo-whale.png",
    apple: "/logo-whale.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/pwa-icons/icon-192.png"/>
        <link rel="apple-touch-startup-image" href="/pwa-splash/1170x2532.png" media="(device-width:390px) and (device-height:844px) and (-webkit-device-pixel-ratio:3)"/>
        <link rel="apple-touch-startup-image" href="/pwa-splash/750x1334.png" media="(device-width:375px) and (device-height:667px) and (-webkit-device-pixel-ratio:2)"/>
        <link rel="apple-touch-startup-image" href="/pwa-splash/828x1792.png" media="(device-width:414px) and (device-height:896px) and (-webkit-device-pixel-ratio:2)"/>
        <link rel="apple-touch-startup-image" href="/pwa-splash/1125x2436.png" media="(device-width:375px) and (device-height:812px) and (-webkit-device-pixel-ratio:3)"/>
        <link rel="apple-touch-startup-image" href="/pwa-splash/1284x2778.png" media="(device-width:428px) and (device-height:926px) and (-webkit-device-pixel-ratio:3)"/>
        <link rel="apple-touch-startup-image" href="/pwa-splash/1536x2048.png" media="(device-width:768px) and (device-height:1024px) and (-webkit-device-pixel-ratio:2)"/>
        <link rel="icon" href="/logo-whale.png" type="image/png" />
        <link rel="shortcut icon" href="/logo-whale.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo-whale.png" />
      </head>
      <body className="bg-gradient-to-br from-sky-50 via-white to-cyan-50 min-h-screen" suppressHydrationWarning>
        {/* v3.30.0: 전 페이지 공용 글로벌 헤더 (홈 버튼 우측 상단 고정) */}
        <GlobalHeaderWrapper />
        {children}
        <MobileAppShell />
        <PwaRegister />
        <NativeAppBridge />
      </body>
    </html>
  );
}
