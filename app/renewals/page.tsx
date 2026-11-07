"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import KakaoMessageModal from "@/components/KakaoMessageModal";
import { supabase } from "@/lib/supabase";
import { getActiveBranchId, useBranchWatch } from "@/lib/branchContext";
import {
  RefreshCw, Calendar, Users, CreditCard, AlertTriangle,
  MessageSquare, Filter, ChevronRight, Bell, DollarSign
} from "lucide-react";

import {koreanToday,renewalRows,renewalCounts,readBillingPages} from "@/lib/billingReadModels";

type Filter = "auto_renew" | "expiring" | "remaining_low" | "all" | "history";

export default function RenewalsPage() {
  const [memberships, setMemberships] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [branch, setBranch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("expiring");
  const [msgTarget, setMsgTarget] = useState<{ member: any; membership: any } | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const loadVersion=useRef(0);
  const [loadError,setLoadError]=useState("");
  const [todayStr,setTodayStr]=useState(koreanToday);
  useEffect(()=>{const timer=setInterval(()=>setTodayStr(koreanToday()),60000);return()=>clearInterval(timer);},[]);

  useEffect(() => { loadAll(); }, []);
  useBranchWatch(() => loadAll());

  async function loadAll() {
    const version=++loadVersion.current;setLoading(true);setLoadError("");setMembers([]);setMemberships([]);setBranch(null);
    const branchId=getActiveBranchId();const selected=branchId&&branchId!=="ALL"?branchId:null;
    try{
      const ms=await readBillingPages((from,to)=>{let q=supabase.from('members').select('*').eq('status','active').is('deleted_at',null).order('id');if(selected)q=q.eq('branch_id',selected);return q.range(from,to);});
      if(version!==loadVersion.current)return;
      const all:any[]=[];
      for(let i=0;i<ms.length;i+=300){const ids=ms.slice(i,i+300).map(m=>m.id);all.push(...await readBillingPages((from,to)=>supabase.from('memberships').select('*').in('member_id',ids).order('id').range(from,to)));}
      if(version!==loadVersion.current)return;
      if(selected){const r=await supabase.from('branches').select('*').eq('id',selected).maybeSingle();if(version!==loadVersion.current)return;setBranch(r.data);}
      setMembers(ms);setMemberships(all);
    }catch(e:any){if(version===loadVersion.current)setLoadError('갱신 목록 조회 실패: '+(e.message||String(e)));}
    finally{if(version===loadVersion.current)setLoading(false);}
  }
  const enrichedList=useMemo(()=>renewalRows(memberships,members,todayStr),[memberships,members,todayStr]);
  const counts=useMemo(()=>renewalCounts(enrichedList),[enrichedList]);
  const filtered=useMemo(()=>enrichedList.filter(x=>filter==='history'?x._isExpired:filter==='expiring'?x._isExpiringSoon:filter==='remaining_low'?x._isRemainingLow:filter==='auto_renew'?x._isValidTicket&&x.auto_renew===true:x._isValidTicket),[enrichedList,filter]);

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
    <main className="max-w-6xl mx-auto px-3 md:px-6 py-6 md:py-10 min-h-screen bg-slate-50">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sky-600 p-2.5 shadow">
            <RefreshCw className="w-full h-full text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">정기 결제 · 갱신 관리</h1>
            <p className="text-xs text-gray-500">활동 회원의 정규 회원권만 · 체험권 및 종결·휴원 회원 제외</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">FIFO 소급 재계산 중지</span>
          <HomeButton />
        </div>
      </div>

      {loadError&&<p role="alert" className="mb-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{loadError}<button onClick={()=>void loadAll()} className="ml-3 underline">다시 조회</button></p>}
      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <button onClick={() => setFilter("auto_renew")}
          className={`p-4 rounded-2xl text-left transition ${filter === "auto_renew" ? "bg-sky-600 text-white shadow-md" : "bg-white shadow-sm hover:bg-sky-50"}`}>
          <div className="flex items-center justify-between">
            <RefreshCw className="w-5 h-5" />
            <span className="text-2xl font-black">{counts.auto_renew}</span>
          </div>
          <div className="text-sm font-bold mt-2">🔄 자동 갱신</div>
          <div className="text-[10px] opacity-80 mt-0.5">정액권 매월 갱신</div>
        </button>
        <button onClick={() => setFilter("expiring")}
          className={`p-4 rounded-2xl text-left transition ${filter === "expiring" ? "bg-sky-600 text-white shadow-md" : "bg-white shadow-sm hover:bg-sky-50"}`}>
          <div className="flex items-center justify-between">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-2xl font-black">{counts.expiring}</span>
          </div>
          <div className="text-sm font-bold mt-2">⏰ 만료 임박</div>
          <div className="text-[10px] opacity-80 mt-0.5">D-7 이내</div>
        </button>
        <button onClick={() => setFilter("remaining_low")}
          className={`p-4 rounded-2xl text-left transition ${filter === "remaining_low" ? "bg-sky-600 text-white shadow-md" : "bg-white shadow-sm hover:bg-sky-50"}`}>
          <div className="flex items-center justify-between">
            <Bell className="w-5 h-5" />
            <span className="text-2xl font-black">{counts.remaining_low}</span>
          </div>
          <div className="text-sm font-bold mt-2">💧 잔여 3회 이하</div>
          <div className="text-[10px] opacity-80 mt-0.5">재등록 유도</div>
        </button>
        <button onClick={() => setFilter("all")}
          className={`p-4 rounded-2xl text-left transition ${filter === "all" ? "bg-sky-600 text-white shadow-md" : "bg-white shadow-sm hover:bg-sky-50"}`}>
          <div className="flex items-center justify-between">
            <Users className="w-5 h-5" />
            <span className="text-2xl font-black">{counts.all}</span>
          </div>
          <div className="text-sm font-bold mt-2">📋 전체</div>
          <div className="text-[10px] opacity-80 mt-0.5">활성 회원권</div>
        </button>
        <button onClick={()=>setFilter('history')} className={`rounded-2xl p-4 text-left shadow-sm ${filter==='history'?'bg-sky-600 text-white':'bg-white text-slate-600'}`}><div className="text-2xl font-bold">{counts.history}</div><div className="mt-2 text-sm font-semibold">만료 완료(이력)</div><div className="mt-1 text-[10px] opacity-80">잔여 0회 또는 기간 만료</div></button>
      </div>

      <p className="mb-4 text-xs leading-relaxed text-slate-500">한국 날짜 {todayStr} 기준 · 만료 임박은 오늘부터 D-7까지, 잔여가 있는 유효 회원권만 집계해요. 0회·기간 만료는 이력에서 확인해요. 단위는 회원권 건수예요.</p>
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
                          {ms._remaining} / {Number(ms.total_sessions || 0)+Number(ms.adjustment || 0)}회
                        </span>
                        {ms._carryover > 0 && (
                          <span className="ml-2 text-emerald-600">+이월 {ms._carryover}회</span>
                        )}
                        {(ms.expire_date||ms.end_date) && (
                          <span className="ml-2 text-gray-500">📅 ~{String(ms.expire_date||ms.end_date).slice(0,10)}</span>
                        )}
                      </div>
                    </div>

                    {/* 액션 */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* 노쇼 정책 */}
                      <div className="flex items-center gap-1 bg-slate-50 rounded-lg px-2 py-1">
                        <span className="text-[10px] text-gray-500">노쇼:</span>
                        <select value={ms.noshow_policy || "deduct"}
                          disabled={updatingId === ms.id || ms._isExpired}
                          onChange={(e) => setNoshowPolicy(ms, e.target.value)}
                          className="text-xs bg-transparent border-none focus:outline-none cursor-pointer">
                          <option value="deduct">차감</option>
                          <option value="carryover">이월</option>
                          <option value="refund">환불</option>
                        </select>
                      </div>
                      {/* 자동 갱신 토글 */}
                      <button onClick={() => toggleAutoRenew(ms)}
                        disabled={updatingId === ms.id || ms._isExpired}
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
