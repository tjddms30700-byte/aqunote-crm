"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Search, Waves, Users } from "lucide-react";

type Member = {
  id: string;
  name: string;
  member_type: "child" | "adult";
  phone: string | null;
  gender: string | null;
  birth: string | null;
  guardian_name: string | null;
  status: string | null;
  extra: any;
  memo: string | null;
};

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "child" | "adult">("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("members")
        .select("*")
        .order("name", { ascending: true });
      if (!error && data) setMembers(data as Member[]);
      setLoading(false);
    })();
  }, []);

  const filtered = members
    .filter((m) => (filter === "all" ? true : m.member_type === filter))
    .filter((m) =>
      query
        ? (m.name || "").toLowerCase().includes(query.toLowerCase()) ||
          (m.guardian_name || "").toLowerCase().includes(query.toLowerCase()) ||
          (m.phone || "").includes(query)
        : true
    );

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Waves className="w-8 h-8 text-aqu-600" />
          <h1 className="text-3xl font-bold text-aqu-900">👥 회원 관리</h1>
        </div>
        <Link href="/" className="text-sm text-aqu-600 hover:underline">← 홈으로</Link>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-lg text-sm ${filter === "all" ? "bg-aqu-600 text-white" : "bg-white border border-aqu-200 text-aqu-700"}`}
        >
          전체 ({members.length})
        </button>
        <button
          onClick={() => setFilter("child")}
          className={`px-4 py-2 rounded-lg text-sm ${filter === "child" ? "bg-aqu-600 text-white" : "bg-white border border-aqu-200 text-aqu-700"}`}
        >
          👶 아동 ({members.filter((m) => m.member_type === "child").length})
        </button>
        <button
          onClick={() => setFilter("adult")}
          className={`px-4 py-2 rounded-lg text-sm ${filter === "adult" ? "bg-aqu-600 text-white" : "bg-white border border-aqu-200 text-aqu-700"}`}
        >
          🧑 성인 ({members.filter((m) => m.member_type === "adult").length})
        </button>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            className="w-full pl-10 pr-3 py-2 rounded-lg border border-aqu-200 text-sm"
            placeholder="이름 · 보호자 · 전화 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400">회원이 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-aqu-50 text-aqu-900">
              <tr>
                <th className="text-left px-4 py-3">이름</th>
                <th className="text-left px-4 py-3">구분</th>
                <th className="text-left px-4 py-3">보호자</th>
                <th className="text-left px-4 py-3">연락처</th>
                <th className="text-left px-4 py-3">생년월일</th>
                <th className="text-left px-4 py-3">진단명</th>
                <th className="text-left px-4 py-3">상태</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-t border-aqu-100 hover:bg-aqu-50/50">
                  <td className="px-4 py-3 font-medium text-aqu-900">{m.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${m.member_type === "child" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                      {m.member_type === "child" ? "아동" : "성인"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.guardian_name || "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{m.phone || "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{m.birth || "-"}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{m.extra?.diagnosis || "-"}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
                      {m.status || "regular"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-400 text-right">
        총 {filtered.length}명 표시 · Powered by Supabase
      </div>
    </main>
  );
}
