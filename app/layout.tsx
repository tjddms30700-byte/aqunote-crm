import "./globals.css";
import MobileAppShell from "@/components/MobileAppShell";
import NativeAppBridge from "@/components/NativeAppBridge";
import type { Metadata, Viewport } from "next";
import GlobalHeaderWrapper from "@/components/GlobalHeaderWrapper";

export const viewport: Viewport = {width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#0284c7"};

export const metadata: Metadata = {
  title: "아쿠노트 프로그램",
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
        <link rel="icon" href="/logo-whale.png" type="image/png" />
        <link rel="shortcut icon" href="/logo-whale.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo-whale.png" />
      </head>
      <body className="bg-gradient-to-br from-sky-50 via-white to-cyan-50 min-h-screen" suppressHydrationWarning>
        {/* v3.30.0: 전 페이지 공용 글로벌 헤더 (홈 버튼 우측 상단 고정) */}
        <GlobalHeaderWrapper />
        {children}
        <MobileAppShell />
        <NativeAppBridge />
      </body>
    </html>
  );
}
