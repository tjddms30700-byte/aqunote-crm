"use client";

/**
 * ✅ v3.61.0: 직원·근무 공통 탭 바
 * - 출퇴근/휴가/차량/지출/공지/업무 6개 메뉴를 모든 직원 페이지에서 동일하게 노출
 * - 페이지 간 이동이 탭 클릭 한 번으로 가능
 */
import Link from "next/link";

export type StaffTabKey = "commute" | "leave" | "vehicle" | "expense" | "notice" | "tasks";

const TABS: { k: StaffTabKey; label: string; href: string }[] = [
  { k: "commute", label: "⏱️ 출퇴근·근태", href: "/attendance-staff?tab=commute" },
  { k: "leave",   label: "🌴 휴가 신청",   href: "/attendance-staff?tab=leave" },
  { k: "vehicle", label: "🚗 차량운행일지", href: "/vehicles" },
  { k: "expense", label: "💸 지출·경비",   href: "/attendance-staff?tab=expense" },
  { k: "notice",  label: "📢 공지사항",     href: "/attendance-staff?tab=notice" },
  { k: "tasks",   label: "📋 업무·프로젝트", href: "/tasks" },
];

export default function StaffNavTabs({ active }: { active: StaffTabKey }) {
  return (
    <div className="bg-slate-100 p-1.5 rounded-2xl inline-flex flex-wrap gap-1 mb-6 shadow-inner">
      {TABS.map(t => (
        <Link
          key={t.k}
          href={t.href}
          className={`px-4 md:px-5 py-2 rounded-xl text-sm transition-all ${
            active === t.k
              ? "bg-white shadow-sm font-bold text-blue-600"
              : "text-slate-600 hover:text-slate-800 font-medium"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
