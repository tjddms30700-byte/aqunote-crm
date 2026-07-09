"use client";
import Link from "next/link";
import { ClipboardList, Waves } from "lucide-react";

export default function ConsultationsPage() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <Waves className="w-8 h-8 text-aqu-600" />
          <h1 className="text-3xl font-bold text-aqu-900">📋 상담 리드</h1>
        </div>
        <Link href="/" className="text-sm text-aqu-600 hover:underline">← 홈으로</Link>
      </div>
      <div className="p-10 bg-white rounded-2xl border border-aqu-100 text-center">
        <ClipboardList className="w-16 h-16 text-aqu-400 mx-auto mb-4" />
        <p className="text-gray-600">상담 리드 페이지는 다음 스프린트에서 추가됩니다.</p>
        <p className="text-sm text-gray-400 mt-2">칸반보드(신규→체험예정→체험완료→정규등록→대기종료) 예정</p>
      </div>
    </main>
  );
}
