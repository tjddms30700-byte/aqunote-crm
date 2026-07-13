"use client";
import Link from "next/link";
import { Home } from "lucide-react";

export default function HomeButton() {
  return (
    <Link href="/"
      className="inline-flex items-center gap-1.5 px-4 py-2 md:px-5 md:py-2.5 rounded-xl bg-gradient-to-br from-aqu-500 to-aqu-700 text-white font-semibold text-sm md:text-base shadow-md hover:shadow-lg hover:scale-105 transition-all">
      <Home className="w-4 h-4 md:w-5 md:h-5" />
      <span>홈</span>
    </Link>
  );
}
