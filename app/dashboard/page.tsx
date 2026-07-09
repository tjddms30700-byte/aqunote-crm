"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Waves, Users, Calendar, ClipboardList, TrendingUp, Activity } from "lucide-react";

export default function Dashboard() {
  const [stats, setStats] = useState({ child: 0, adult: 0, total: 0, timeslots: 0, activities: 0, templates: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [c, a, t, l, tpl] = await Promise.all([
        supabase.from("members").select("*", { count: "exact", head: true }).eq("member_type", "child"),
        supabase.from("members").select("*", { count: "exact", head: true }).eq("member_type", "adult"),
        supabase.from("timeslots").select("*", { count: "exact", head: true }),
        supabase.from("label_library").select("*", { count: "exact", head: true }),
        supabase.from("assessment_templates").select("*", { count: "exact", head: true }),
      ]);
      setStats({
        child: c.count || 0,
        adult: a.count || 0,
        total: (c.count || 0) + (a.count || 0),
        timeslots: t.count || 0,
        activities: l.count || 0,
        templates: tpl.count || 0,
      });
      setLoading(false);
    })();
  }, []);

  const Card = ({ icon: Icon, label, value, color }: any) => (
    <div className="p-6 bg-white rounded-2xl shadow-md border border-aqu-100">
      <div className="flex items-center justify-between mb-2">
        <Icon className={`w-8 h-8 ${color}`} />
        <span className="text-3xl font-bold text-aqu-900">{loading ? "..." : value}</span>
      </div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <Waves className="w-8 h-8 text-aqu-600" />
          <h1 className="text-3xl font-bold text-aqu-900">📊 대시보드</h1>
        </div>
        <Link href="/" className="text-sm text-aqu-600 hover:underline">← 홈으로</Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card icon={Users} label="아동 회원" value={stats.child} color="text-blue-500" />
        <Card icon={Users} label="성인 회원" value={stats.adult} color="text-purple-500" />
        <Card icon={TrendingUp} label="전체 회원" value={stats.total} color="text-aqu-500" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card icon={Calendar} label="시간표 슬롯" value={stats.timeslots} color="text-orange-500" />
        <Card icon={Activity} label="수중활동 라벨" value={stats.activities} color="text-green-500" />
        <Card icon={ClipboardList} label="평가 템플릿" value={stats.templates} color="text-pink-500" />
      </div>

      <div className="p-6 bg-gradient-to-r from-aqu-500 to-aqu-700 text-white rounded-2xl shadow-lg">
        <h2 className="text-xl font-bold mb-2">🌊 환영합니다, AQUNOTE!</h2>
        <p className="text-aqu-100 text-sm">
          위례아쿠수중운동센터 통합 CRM에 접속하셨습니다.
          왼쪽 상단 메뉴 또는 홈 화면에서 회원, 상담, 시간표를 자유롭게 관리하실 수 있습니다.
        </p>
      </div>
    </main>
  );
}
