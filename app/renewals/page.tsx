"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import KakaoMessageModal from "@/components/KakaoMessageModal";
import { supabase } from "@/lib/supabase";
import { getActiveBranchId, useBranchWatch } from "@/lib/branchContext";
import {
  RefreshCw, Calendar, Users, CreditCard, AlertTriangle,
  MessageSquare, Filter, ChevronRight, Bell, DollarSign
} from "lucide-react";

type Filter = "auto_renew" | "expiring" | "remaining_low" | "all";

export default function RenewalsPage() {
  const [memberships, setMemberships] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [branch, setBranch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("auto_renew");
  const [msgTarget, setMsgTarget] = useState<{ member: any; membership: any } | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);
  useBranchWatch(() => loadAll());

  async function loadAll() {
    setLoading(true);
    const branchId = getActiveBranchId();
    // 지점 정보 (센터명/전화)
    if (branchId) {
      const { data: b } = await supabase.from("branches").select("*").eq("id", branchId).maybeSingle();
      setBranch(b);
    }

    // 회원 (branch_id 필터)
    const memberQuery = branchId
      ? supabase.from("members").select("*").is("deleted_at", null).eq("branch_id", branchId)
      : supabase.from("members").select("*").is("deleted_at", null);
    let { data: ms, error: e1 } = await memberQuery;
    if (e1 && (e1.code === "42703" || e1.message?.includes("branch_id"))) {
      const fb = await supabase.from("members").select("*").is("deleted_at", null);
      ms = fb.data;
    }
    setMembers(ms || []);

    // 회원권 (cancelled 제외)
    const { data: mships } = await supabase.from("memberships")
      .select("*")
      .neq("status", "cancelled")
      .order("end_date", { ascending: true });
    // 지점의 회원 ID 목록으로 필터
    const memIds = new Set((ms || []).map((m: any) => m.id));
    setMemberships((mships || []).filter((x: any) => memIds.has(x.member_id)));

    setLoading(false);
  }

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const enrichedList = useMemo(() => {
    return memberships.map((ms: any) => {
      const memb = members.find(m => m.id === ms.member_id);
      const remaining = Math.max(0, (ms.total_sessions || 0) - (ms.used_sessions || 0));
      const carryover = ms.carryover_count || 0;
      const daysToExpire = ms.end_date
        ? Math.floor((new Date(ms.end_date).getTime() - today.getTime()) / 86400000)
        : null;
      return {
        ...ms,
        _member: memb,
        _remaining: remaining,
        _carryover: carryover,
        _daysToExpire: daysToExpire,
        _isExpired: daysToExpire !== null && daysToExpire < 0,
        _isExpiringSoon: daysToExpire !== null && daysToExpire >= 0 && daysToExpire <= 7,
        _isRemainingLow: remaining <= 3 && remaining > 0,
      };
    }).filter((x: any) => x._member); // 회원 없는 회원권 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberships, members]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "auto_renew":
        return enrichedList.filter((x: any) => x.auto_renew === true);
      case "expiring":
        return enrichedList.filter((x: any) => x._isExpiringSoon || x._isExpired);
      case "remaining_low":
        return enrichedList.filter((x: any) => x._isRemainingLow);
      default:
        return enrichedList;
    }
  }, [enrichedList, filter]);

  const counts = useMemo(() => ({
    auto_renew: enrichedList.filter((x: any) => x.auto_renew).length,
    expiring: enrichedList.filter((x: any) => x._isExpiringSoon || x._isExpired).length,
    remaining_low: enrichedList.filter((x: any) => x._isRemainingLow).length,
    all: enrichedList.length,
  }), [enrichedList]);

  async function toggleAutoRenew(ms: any) {
    setUpdatingId(ms.id);
    const { error } = await supabase.from("memberships")
      .update({ auto_renew: !ms.auto_renew })
      .eq("id", ms.id);
    setUpdatingId(null);
    if (error) {
      alert("자동 갱신 설정 실패: " + error.message + "\n(SQL 미실행 시 AQUNOTE_V312_AUTO_MEMBERSHIP.sql 먼저 실행)");
      return;
    }
    loadAll();
  }

  async function setNoshowPolicy(ms: any, policy: string) {
    setUpdatingId(ms.id);
    const { error } = await supabase.from("memberships")
      .update({ noshow_policy: policy })
      .eq("id", ms.id);
    setUpdatingId(null);
    if (error) { alert("정책 변경 실패: " + error.message); return; }
    loadAll();
  }

  return (
    <main className="max-w-6xl mx-auto px-3 md:px-6 py-6 md:py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 shadow">
            <RefreshCw className="w-full h-full text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">정기 결제 · 갱신 관리</h1>
            <p className="text-xs text-gray-500">자동 갱신 · 만료 임박 · 잔여 소진</p>
          </div>
        </div>
        <HomeButton />
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <button onClick={() => setFilter("auto_renew")}
          className={`p-4 rounded-2xl text-left transition ${filter === "auto_renew" ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md" : "bg-white border border-gray-100 hover:border-emerald-200"}`}>
          <div className="flex items-center justify-between">
            <RefreshCw className="w-5 h-5" />
            <span className="text-2xl font-black">{counts.auto_renew}</span>
          </div>
          <div className="text-sm font-bold mt-2">🔄 자동 갱신</div>
          <div className="text-[10px] opacity-80 mt-0.5">정액권 매월 갱신</div>
        </button>
        <button onClick={() => setFilter("expiring")}
          className={`p-4 rounded-2xl text-left transition ${filter === "expiring" ? "bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-md" : "bg-white border border-gray-100 hover:border-red-200"}`}>
          <div className="flex items-center justify-between">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-2xl font-black">{counts.expiring}</span>
          </div>
          <div className="text-sm font-bold mt-2">⏰ 만료 임박</div>
          <div className="text-[10px] opacity-80 mt-0.5">D-7 이내</div>
        </button>
        <button onClick={() => setFilter("remaining_low")}
          className={`p-4 rounded-2xl text-left transition ${filter === "remaining_low" ? "bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md" : "bg-white border border-gray-100 hover:border-amber-200"}`}>
          <div className="flex items-center justify-between">
            <Bell className="w-5 h-5" />
            <span className="text-2xl font-black">{counts.remaining_low}</span>
          </div>
          <div className="text-sm font-bold mt-2">💧 잔여 3회 이하</div>
          <div className="text-[10px] opacity-80 mt-0.5">재등록 유도</div>
        </button>
        <button onClick={() => setFilter("all")}
          className={`p-4 rounded-2xl text-left transition ${filter === "all" ? "bg-gradient-to-br from-slate-600 to-gray-700 text-white shadow-md" : "bg-white border border-gray-100 hover:border-gray-300"}`}>
          <div className="flex items-center justify-between">
            <Users className="w-5 h-5" />
            <span className="text-2xl font-black">{counts.all}</span>
          </div>
          <div className="text-sm font-bold mt-2">📋 전체</div>
          <div className="text-[10px] opacity-80 mt-0.5">활성 회원권</div>
        </button>
      </div>

      {/* 리스트 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            해당 조건의 회원권이 없습니다
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((ms: any) => {
              const m = ms._member;
              const phoneTail = (m.phone || "").replace(/\D/g, "").slice(-4);
              return (
                <div key={ms.id} className="p-4 hover:bg-slate-50/50 transition">
                  <div className="flex flex-wrap items-start gap-4">
                    {/* 회원 정보 */}
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/members/${m.id}`} className="font-bold text-slate-900 hover:text-blue-600">
                          {m.name}
                        </Link>
                        {phoneTail && (
                          <span className="text-xs text-amber-700 font-mono bg-amber-50 px-1.5 py-0.5 rounded">
                            ({phoneTail})
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          {m.member_type === "child" ? "🧒 아동" : "👤 성인"}
                        </span>
                        {ms.auto_renew && (
                          <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold">
                            🔄 자동 갱신
                          </span>
                        )}
                        {ms._isExpired && (
                          <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-bold">
                            ⛔ 만료됨
                          </span>
                        )}
                        {ms._isExpiringSoon && (
                          <span className="text-[10px] px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-bold">
                            ⏰ D-{ms._daysToExpire}
                          </span>
                        )}
                        {ms._isRemainingLow && (
                          <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">
                            💧 잔여 {ms._remaining}회
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        📋 <b>{ms.plan_name || "회원권"}</b>
                        <span className="ml-2">
                          {ms._remaining} / {ms.total_sessions || 0}회
                        </span>
                        {ms._carryover > 0 && (
                          <span className="ml-2 text-emerald-600">+이월 {ms._carryover}회</span>
                        )}
                        {ms.end_date && (
                          <span className="ml-2 text-gray-500">📅 ~{ms.end_date}</span>
                        )}
                      </div>
                    </div>

                    {/* 액션 */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* 노쇼 정책 */}
                      <div className="flex items-center gap-1 bg-slate-50 rounded-lg px-2 py-1">
                        <span className="text-[10px] text-gray-500">노쇼:</span>
                        <select value={ms.noshow_policy || "deduct"}
                          disabled={updatingId === ms.id}
                          onChange={(e) => setNoshowPolicy(ms, e.target.value)}
                          className="text-xs bg-transparent border-none focus:outline-none cursor-pointer">
                          <option value="deduct">차감</option>
                          <option value="carryover">이월</option>
                          <option value="refund">환불</option>
                        </select>
                      </div>
                      {/* 자동 갱신 토글 */}
                      <button onClick={() => toggleAutoRenew(ms)}
                        disabled={updatingId === ms.id}
                        className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold transition ${
                          ms.auto_renew
                            ? "bg-emerald-500 text-white hover:bg-emerald-600"
                            : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}>
                        🔄 {ms.auto_renew ? "자동 갱신 ON" : "자동 갱신 OFF"}
                      </button>
                      {/* 카카오 메시지 */}
                      <button onClick={() => setMsgTarget({ member: m, membership: ms })}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-gradient-to-br from-yellow-400 to-amber-500 text-white font-semibold hover:opacity-90 flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5" /> 메시지
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 안내 문구 */}
      <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 text-xs text-emerald-900">
        <div className="font-bold mb-2 flex items-center gap-1">
          <DollarSign className="w-3.5 h-3.5" /> 정기 결제 · 노쇼 정책 안내
        </div>
        <ul className="space-y-1 opacity-90">
          <li>• <b>차감</b>: 노쇼 발생 시 회원권 1회 자동 차감 (기본값)</li>
          <li>• <b>이월</b>: 노쇼 발생 시 차감하지 않고 다음달로 이월 (carryover_count +1)</li>
          <li>• <b>환불</b>: 차감하지 않고 환불 대상으로 표시 (결제 페이지에서 수동 환불)</li>
          <li>• <b>자동 갱신 ON</b>: 매월 갱신 대상 리스트에 자동 포함 (실제 결제는 수동 처리)</li>
          <li>• <b>메시지 버튼</b>: 회원별 카카오 메시지 자동 생성 → 복사 후 카톡에 붙여넣기</li>
        </ul>
      </div>

      {/* 메시지 모달 */}
      {msgTarget && (
        <KakaoMessageModal
          open={true}
          onClose={() => setMsgTarget(null)}
          member={msgTarget.member}
          membership={msgTarget.membership}
          branchName={branch?.name}
          centerPhone={branch?.phone}
        />
      )}
    </main>
  );
}
