"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import HomeButton from "@/components/HomeButton";
import { DollarSign, ChevronLeft, ChevronRight, Search, Eye } from "lucide-react";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function SalesPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selMonth, setSelMonth] = useState(monthKey(new Date()));
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("payments")
      .select("*, members(name, member_type, customer_no), staff(name), memberships(plan_name, total_sessions, used_sessions)")
      .order("paid_at", { ascending: false });
    setPayments(data || []);
    setLoading(false);
  }

  // 월별 필터
  const monthPayments = useMemo(() => {
    return payments.filter(p => (p.paid_at || "").startsWith(selMonth));
  }, [payments, selMonth]);

  // 검색 필터
  const filtered = useMemo(() => {
    let list = monthPayments;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        (p.members?.name || "").toLowerCase().includes(q) ||
        (p.members?.phone || "").includes(q) ||
        (p.members?.customer_no || "").toString().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const dA = (a.paid_at || "") + " " + (a.paid_time || "");
      const dB = (b.paid_at || "") + " " + (b.paid_time || "");
      return sortBy === "newest" ? dB.localeCompare(dA) : dA.localeCompare(dB);
    });
  }, [monthPayments, search, sortBy]);

  // 총합계 (취소 제외)
  const totals = useMemo(() => {
    const active = filtered.filter(p => p.status !== "cancelled");
    return {
      gross:    active.reduce((s, p) => s + (p.gross_amount || p.amount || 0), 0),
      net:      active.reduce((s, p) => s + Math.max(0, (p.amount || 0) - (p.refunded_amount || 0)), 0),
      card:     active.reduce((s, p) => s + (p.pay_card || 0), 0),
      cash:     active.reduce((s, p) => s + (p.pay_cash || 0), 0),
      transfer: active.reduce((s, p) => s + (p.pay_transfer || 0), 0),
      unpaid:   active.reduce((s, p) => s + (p.unpaid_amount || 0), 0),
      amountPlan:  active.reduce((s, p) => s + (p.pay_amount_plan || 0), 0),
      sessionPlan: active.reduce((s, p) => s + (p.pay_session_plan || 0), 0),
      point:    active.reduce((s, p) => s + (p.pay_point || 0), 0),
      pg:       active.reduce((s, p) => s + (p.pay_pg || 0), 0),
      other:    active.reduce((s, p) => s + (p.pay_other || 0), 0),
      discount: active.reduce((s, p) => s + (p.discount_amount || 0), 0),
    };
  }, [filtered]);

  function shiftMonth(delta: number) {
    const [y, m] = selMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelMonth(monthKey(d));
  }

  return (
    <main className="max-w-full mx-auto px-3 md:px-6 py-6 md:py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HomeButton />
          <span className="text-gray-400">/</span>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-pink-500" /> 수납 · 매출 내역
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/payments" className="px-3 py-1.5 bg-aqu-600 text-white text-sm rounded-lg hover:bg-aqu-700">
            + 매출 등록
          </Link>
        </div>
      </div>

      {/* 월 선택 & 검색 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => shiftMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="px-4 py-2 bg-aqu-50 text-aqu-800 rounded-lg font-bold min-w-[140px] text-center">
            {selMonth.replace("-", "년 ")}월
          </div>
          <button onClick={() => shiftMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setSelMonth(monthKey(new Date()))} className="text-xs px-2 py-1 bg-slate-100 rounded ml-1">오늘</button>
        </div>

        <div className="flex-1 flex items-center gap-2 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="이름 · 연락처 · 고객번호 · 상품"
              className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="newest">최신순</option>
            <option value="oldest">오래된순</option>
          </select>
        </div>
      </div>

      {/* 매출 내역 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="font-bold text-slate-900">매출내역 ({filtered.length}건)</div>
          <div className="text-xs text-gray-500">가로 스크롤 가능 →</div>
        </div>
        {loading ? (
          <div className="text-center py-16 text-gray-400">로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">이 달의 매출 내역이 없습니다</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-200">
                  <th className="px-2 py-3 text-left font-bold text-slate-700 whitespace-nowrap">매출일시</th>
                  <th className="px-2 py-3 text-left font-bold text-slate-700 whitespace-nowrap">고객명</th>
                  <th className="px-2 py-3 text-left font-bold text-slate-700 whitespace-nowrap">담당자</th>
                  <th className="px-2 py-3 text-left font-bold text-slate-700 whitespace-nowrap">메뉴</th>
                  <th className="px-2 py-3 text-right font-bold text-slate-700 whitespace-nowrap">영업액</th>
                  <th className="px-2 py-3 text-right font-bold text-red-600 whitespace-nowrap">결제금액</th>
                  <th className="px-2 py-3 text-right font-bold text-blue-700 whitespace-nowrap">카드</th>
                  <th className="px-2 py-3 text-right font-bold text-green-700 whitespace-nowrap">현금</th>
                  <th className="px-2 py-3 text-right font-bold text-orange-700 whitespace-nowrap">계좌</th>
                  <th className="px-2 py-3 text-right font-bold text-red-500 whitespace-nowrap">미수</th>
                  <th className="px-2 py-3 text-right font-bold text-purple-700 whitespace-nowrap">정액권</th>
                  <th className="px-2 py-3 text-right font-bold text-indigo-700 whitespace-nowrap">횟수권</th>
                  <th className="px-2 py-3 text-right font-bold text-cyan-700 whitespace-nowrap">포인트</th>
                  <th className="px-2 py-3 text-right font-bold text-teal-700 whitespace-nowrap">페이</th>
                  <th className="px-2 py-3 text-right font-bold text-gray-700 whitespace-nowrap">기타</th>
                  <th className="px-2 py-3 text-right font-bold text-pink-700 whitespace-nowrap">할인</th>
                  <th className="px-2 py-3 text-center font-bold text-slate-700 whitespace-nowrap">보기</th>
                </tr>
                {/* 총 합계 행 */}
                <tr className="bg-slate-100 border-b-2 border-slate-300 font-bold">
                  <td colSpan={4} className="px-2 py-2 text-center text-slate-800">📊 총 합계</td>
                  <td className="px-2 py-2 text-right text-slate-800">₩{totals.gross.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-red-600">₩{totals.net.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-blue-700">₩{totals.card.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-green-700">₩{totals.cash.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-orange-700">₩{totals.transfer.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-red-500">₩{totals.unpaid.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-purple-700">₩{totals.amountPlan.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-indigo-700">₩{totals.sessionPlan.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-cyan-700">₩{totals.point.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-teal-700">₩{totals.pg.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-gray-700">₩{totals.other.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-pink-700">₩{totals.discount.toLocaleString()}</td>
                  <td></td>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const isCancelled = p.status === "cancelled";
                  return (
                  <tr key={p.id} className={`border-b border-gray-100 hover:bg-slate-50 ${isCancelled ? "opacity-50" : ""}`}>
                    <td className="px-2 py-2.5 text-slate-600 whitespace-nowrap">
                      {p.paid_at}
                      {p.paid_time && <div className="text-[10px] text-gray-400">{p.paid_time}</div>}
                      {isCancelled && <div className="mt-0.5 inline-block px-1 py-0.5 bg-red-500 text-white text-[9px] rounded">취소</div>}
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      {p.member_id ? (
                        <Link href={`/members/${p.member_id}`} className="text-aqu-700 hover:underline font-medium">
                          {p.members?.name || "-"}
                        </Link>
                      ) : "-"}
                    </td>
                    <td className="px-2 py-2.5 text-slate-700 whitespace-nowrap">{p.staff?.name || "-"}</td>
                    <td className="px-2 py-2.5 text-slate-800 max-w-[140px] truncate" title={p.description}>
                      {p.memberships?.plan_name || p.description || "-"}
                    </td>
                    <td className="px-2 py-2.5 text-right font-medium text-slate-800">₩{(p.gross_amount || p.amount || 0).toLocaleString()}</td>
                    <td className="px-2 py-2.5 text-right font-bold text-red-600">
                      ₩{Math.max(0, (p.amount || 0) - (p.refunded_amount || 0)).toLocaleString()}
                      {p.refunded_amount > 0 && <div className="text-[9px] text-orange-500 font-normal">-{p.refunded_amount.toLocaleString()}</div>}
                    </td>
                    <td className="px-2 py-2.5 text-right text-blue-700">{p.pay_card ? `₩${p.pay_card.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-right text-green-700">{p.pay_cash ? `₩${p.pay_cash.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-right text-orange-700">{p.pay_transfer ? `₩${p.pay_transfer.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-right text-red-500">{p.unpaid_amount ? `₩${p.unpaid_amount.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-right text-purple-700">{p.pay_amount_plan ? `₩${p.pay_amount_plan.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-right text-indigo-700">{p.pay_session_plan ? `₩${p.pay_session_plan.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-right text-cyan-700">{p.pay_point ? `₩${p.pay_point.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-right text-teal-700">{p.pay_pg ? `₩${p.pay_pg.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-right text-gray-700">{p.pay_other ? `₩${p.pay_other.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-right text-pink-700">{p.discount_amount ? `₩${p.discount_amount.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-center">
                      <Link href={`/members/${p.member_id}`}
                        className="inline-flex items-center gap-1 px-2 py-1 border border-gray-200 rounded text-[10px] hover:bg-gray-50">
                        <Eye className="w-3 h-3" /> 보기
                      </Link>
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
