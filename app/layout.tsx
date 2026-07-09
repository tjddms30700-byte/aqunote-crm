import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AQUNOTE - 수중운동 CRM",
  description: "위례아쿠수중운동센터 통합 관리 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gradient-to-br from-aqu-50 to-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
