"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import {
  Inbox, RefreshCw, UserPlus, Phone, Calendar, Check, X,
  ExternalLink, AlertCircle, Users, Trash2
} from "lucide-react";

type InboxLead = {
  id: string;
  source_row_id: string | null;
  name: string;
  phone: string | null;
  member_type: string;
  wish_days: string[] | null;
  wish_time_slots: string[] | null;
  wish_start_date: string | null;
  memo: string | null;
  source: string | null;
  processed: boolean;
  member_id: string | null;
  raw_payload: any;
  created_at: string;
};

export default function InboxPage() {
  const [leads, setLeads] = useState<InboxLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "processed" | "all">("pending");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<any>(null);

  useEffect(() => { loadAll(); }, []);

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync-sheets", { cache: "no-store" });
      const j = await res.json();
      setLastSync(j);
      if (j.success) {
        alert(
          `✅ 동기화 완료!\n\n` +
          `신규: ${j.summary?.total_new || 0}건\n` +
          `업데이트: ${j.summary?.total_updated || 0}건\n` +
          `스킵: ${j.summary?.total_skipped || 0}건\n` +
          `오류: ${j.summary?.total_error || 0}건`
        );
        await loadAll();
      } else {
        alert("❌ 동기화 실패: " + JSON.stringify(j).slice(0, 200));
      }
    } catch (e: any) {
      alert("❌ 오류: " + e.message);
    }
    setSyncing(false);
  }

  async function loadAll() {
    setLoading(true);
    const { data, error } = await supabase
      .from("leads_inbox")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Inbox 로드 실패:", error);
      alert("신규 유입 로드 실패. leads_inbox 테이블이 있는지 확인하세요.\n\n" + error.message);
    }
    setLeads((data as InboxLead[]) || []);
    setLoading(false);
    setSelectedIds(new Set());
  }

  const filteredLeads = leads.filter(l => {
    if (filter === "pending") return !l.processed;
    if (filter === "processed") return l.processed;
    return true;
  });

  function toggleSelect(id: string) {
    const s = new Set(selectedIds);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelectedIds(s);
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredLeads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLeads.map(l => l.id)));
    }
  }

  async function promoteOne(lead: InboxLead) {
    setProcessing(true);
    try {
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      // 이미 같은 이름+전화번호 회원이 있는지 확인
      const { data: existing } = await supabase
        .from("members")
        .select("id, name")
        .eq("name", lead.name)
        .eq("phone", lead.phone || "")
        .is("deleted_at", null);

      if (existing && existing.length > 0) {
        if (!confirm(`⚠️ 동일 회원 발견: ${existing[0].name}\n\n그래도 신규 회원으로 추가하시겠습니까?\n(취소 시 유입 데이터만 처리됨 표시)`)) {
          // 처리됨 표시만
          await supabase.from("leads_inbox").update({ processed: true, member_id: existing[0].id }).eq("id", lead.id);
          await loadAll();
          return;
        }
      }

      const { data: newMember, error } = await supabase.from("members").insert({
        org_id: orgId,
        name: lead.name,
        phone: lead.phone,
        member_type: lead.member_type || "adult",
        status: "waiting",
        source: lead.source || "구글시트",
        memo: lead.memo,
        wish_days: lead.wish_days,
        wish_time_slots: lead.wish_time_slots,
        wish_start_date: lead.wish_start_date,
      }).select().single();

      if (error) {
        alert("❌ 회원 등록 실패: " + error.message);
        setProcessing(false);
        return;
      }

      await supabase.from("leads_inbox").update({
        processed: true,
        member_id: newMember.id,
      }).eq("id", lead.id);

      await loadAll();
    } catch (e: any) {
      alert("오류: " + e.message);
    }
    setProcessing(false);
  }

  async function promoteSelected() {
    if (selectedIds.size === 0) return alert("승격할 항목을 선택하세요");
    if (!confirm(`선택한 ${selectedIds.size}건을 회원 목록으로 승격하시겠습니까?`)) return;
    setProcessing(true);
    let success = 0, fail = 0;
    for (const id of Array.from(selectedIds)) {
      const lead = leads.find(l => l.id === id);
      if (!lead || lead.processed) continue;
      try {
        const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
        const { data: newMember, error } = await supabase.from("members").insert({
          org_id: orgId,
          name: lead.name, phone: lead.phone,
          member_type: lead.member_type || "adult",
          status: "waiting", source: lead.source || "구글시트",
          memo: lead.memo,
          wish_days: lead.wish_days, wish_time_slots: lead.wish_time_slots,
          wish_start_date: lead.wish_start_date,
        }).select().single();
        if (error) { fail++; continue; }
        await supabase.from("leads_inbox").update({
          processed: true, member_id: newMember.id,
        }).eq("id", lead.id);
        success++;
      } catch { fail++; }
    }
    setProcessing(false);
    alert(`✅ 승격 완료: ${success}건\n❌ 실패: ${fail}건`);
    await loadAll();
  }

  async function rejectLead(id: string) {
    if (!confirm("이 유입을 삭제하시겠습니까? (되돌릴 수 없음)")) return;
    await supabase.from("leads_inbox").delete().eq("id", id);
    await loadAll();
  }

  const pendingCount = leads.filter(l => !l.processed).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-aqu-50 to-white p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500">
            <Inbox className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              📥 신규 유입 (구글시트 자동 연동)
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              구글 폼 → 시트 → Apps Script → Supabase leads_inbox → 이 화면
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <HomeButton />
          <button onClick={loadAll} className="px-3 py-2 text-sm text-aqu-700 hover:bg-aqu-50 rounded-lg flex items-center gap-1">
            <RefreshCw className="w-4 h-4" /> 새로고침
          </button>
          <button onClick={syncNow} disabled={syncing}
            className="px-4 py-2 text-sm bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 flex items-center gap-1 shadow-md font-medium">
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "동기화 중..." : "🔄 지금 구글시트 동기화"}
          </button>
          <a href="https://docs.google.com/spreadsheets/d/1lzSXvmClip7LXign9mqmRIE9CHyY2oqXApQhd-g6JKg/edit"
            target="_blank"
            className="px-3 py-2 text-sm bg-green-50 border border-green-200 text-green-700 rounded-lg hover:bg-green-100 flex items-center gap-1">
            <ExternalLink className="w-4 h-4" /> AQU LAB 시트
          </a>
        </div>
      </div>

      {/* 공개 신청 URL 안내 카드 (NEW!) */}
      <div className="max-w-7xl mx-auto mb-6 bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-bold mb-1">🎉 자체 신청폼 URL 생성됨! (구글폼 완전 대체)</h2>
            <p className="text-xs opacity-90">이 URL을 부모님/회원들께 보내주세요. 응답이 즉시 이 페이지에 자동 등장합니다.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.origin + "/apply-child");
                alert("✅ 아동 신청 URL이 복사되었습니다!");
              }}
              className="px-4 py-2 bg-white/20 backdrop-blur border border-white/30 rounded-lg text-sm hover:bg-white/30 flex items-center gap-2"
            >
              🧒 아동 신청 URL 복사
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.origin + "/apply-adult");
                alert("✅ 성인 신청 URL이 복사되었습니다!");
              }}
              className="px-4 py-2 bg-white/20 backdrop-blur border border-white/30 rounded-lg text-sm hover:bg-white/30 flex items-center gap-2"
            >
              👤 성인 신청 URL 복사
            </button>
            <Link href="/apply-child" target="_blank"
              className="px-4 py-2 bg-white text-purple-600 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2">
              👁️ 미리보기
            </Link>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-white/20 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <div className="bg-white/10 backdrop-blur rounded-lg p-2 font-mono">
            🧒 <strong>아동:</strong> aqunote.vercel.app<span className="opacity-80">/apply-child</span>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-lg p-2 font-mono">
            👤 <strong>성인:</strong> aqunote.vercel.app<span className="opacity-80">/apply-adult</span>
          </div>
        </div>
      </div>

      {/* 통계 */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-xl p-5 text-white shadow-md">
          <div className="flex items-center gap-2 text-sm opacity-90"><AlertCircle className="w-4 h-4" /> 미처리 대기</div>
          <div className="text-3xl font-bold mt-1">{pendingCount}건</div>
          <div className="text-xs opacity-80 mt-1">관리자 승격 필요</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl p-5 text-white shadow-md">
          <div className="flex items-center gap-2 text-sm opacity-90"><Check className="w-4 h-4" /> 승격 완료</div>
          <div className="text-3xl font-bold mt-1">{leads.filter(l => l.processed).length}건</div>
          <div className="text-xs opacity-80 mt-1">회원 목록으로 이동됨</div>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl p-5 text-white shadow-md">
          <div className="flex items-center gap-2 text-sm opacity-90"><Users className="w-4 h-4" /> 전체 유입</div>
          <div className="text-3xl font-bold mt-1">{leads.length}건</div>
          <div className="text-xs opacity-80 mt-1">누적</div>
        </div>
      </div>

      {/* 필터 & 일괄작업 */}
      <div className="max-w-7xl mx-auto mb-4 flex justify-between items-center">
        <div className="flex gap-2">
          <button onClick={() => setFilter("pending")} className={`px-4 py-2 text-sm rounded-lg ${filter === "pending" ? "bg-orange-500 text-white" : "bg-white border border-gray-200"}`}>⏳ 미처리 ({pendingCount})</button>
          <button onClick={() => setFilter("processed")} className={`px-4 py-2 text-sm rounded-lg ${filter === "processed" ? "bg-emerald-500 text-white" : "bg-white border border-gray-200"}`}>✅ 완료 ({leads.length - pendingCount})</button>
          <button onClick={() => setFilter("all")} className={`px-4 py-2 text-sm rounded-lg ${filter === "all" ? "bg-purple-500 text-white" : "bg-white border border-gray-200"}`}>📋 전체 ({leads.length})</button>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex gap-2">
            <span className="px-3 py-2 text-sm text-purple-700">{selectedIds.size}건 선택됨</span>
            <button onClick={promoteSelected} disabled={processing}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm rounded-lg hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 flex items-center gap-1">
              <UserPlus className="w-4 h-4" /> 일괄 승격
            </button>
          </div>
        )}
      </div>

      {/* 리스트 */}
      <div className="max-w-7xl mx-auto bg-white rounded-xl border border-aqu-100 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">로딩 중...</div>
        ) : filteredLeads.length === 0 ? (
          <div className="text-center py-12">
            <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">
              {filter === "pending" ? "🎉 처리 대기 중인 신규 유입이 없습니다" : "데이터가 없습니다"}
            </p>
            {filter === "pending" && (
              <p className="text-xs text-gray-400 mt-2">
                구글 폼으로 새 상담이 접수되면 자동으로 여기 표시됩니다.
              </p>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-aqu-50 border-b border-aqu-100">
              <tr>
                <th className="p-3 w-10">
                  <input type="checkbox" checked={selectedIds.size === filteredLeads.length && filteredLeads.length > 0}
                    onChange={toggleSelectAll} />
                </th>
                <th className="p-3 text-left">접수일</th>
                <th className="p-3 text-left">구분</th>
                <th className="p-3 text-left">이름</th>
                <th className="p-3 text-left">연락처</th>
                <th className="p-3 text-left">희망시간</th>
                <th className="p-3 text-left">메모</th>
                <th className="p-3 text-left">유입경로</th>
                <th className="p-3 text-center">액션</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map(l => (
                <tr key={l.id} className={`border-b border-gray-100 hover:bg-aqu-50/30 ${l.processed ? "opacity-60" : ""}`}>
                  <td className="p-3">
                    <input type="checkbox" checked={selectedIds.has(l.id)} onChange={() => toggleSelect(l.id)} disabled={l.processed} />
                  </td>
                  <td className="p-3 text-xs text-gray-600">
                    {new Date(l.created_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${l.member_type === "child" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                      {l.member_type === "child" ? "🧒 아동" : "👤 성인"}
                    </span>
                  </td>
                  <td className="p-3 font-medium text-aqu-900">
                    {l.processed && l.member_id ? (
                      <Link href={`/members/${l.member_id}`} className="text-aqu-600 hover:underline">{l.name} →</Link>
                    ) : l.name}
                  </td>
                  <td className="p-3 text-gray-600">{l.phone || "-"}</td>
                  <td className="p-3 text-xs text-gray-600">
                    {(l.wish_days && l.wish_days.length > 0) && (
                      <div>📅 {l.wish_days.join(", ")}</div>
                    )}
                    {(l.wish_time_slots && l.wish_time_slots.length > 0) && (
                      <div>🕐 {l.wish_time_slots.slice(0, 2).join(", ")}{l.wish_time_slots.length > 2 && "..."}</div>
                    )}
                  </td>
                  <td className="p-3 text-xs text-gray-600 max-w-[200px] truncate" title={l.memo || ""}>
                    {l.memo || "-"}
                  </td>
                  <td className="p-3 text-xs text-gray-500">{l.source || "-"}</td>
                  <td className="p-3">
                    {!l.processed ? (
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => promoteOne(l)} disabled={processing}
                          className="px-2 py-1 bg-emerald-500 text-white text-xs rounded hover:bg-emerald-600 flex items-center gap-1 disabled:opacity-50">
                          <Check className="w-3 h-3" /> 승격
                        </button>
                        <button onClick={() => rejectLead(l.id)}
                          className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-emerald-600 text-xs">✅ 완료</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 하단 안내 */}
      <div className="max-w-7xl mx-auto mt-6 space-y-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <h3 className="font-medium text-emerald-900 flex items-center gap-2 mb-2">
            ✅ 현재 동기화 방식
          </h3>
          <ol className="text-xs text-emerald-800 space-y-1 list-decimal list-inside">
            <li>AQUNOTE 서버가 구글 시트 CSV를 직접 읽어옴 (Apps Script 불필요, API 키 불필요)</li>
            <li>시트에 새로운 상담자가 추가되면 이 페이지에 자동 등장</li>
            <li>상단의 <strong>지금 구글시트 동기화</strong> 버튼 니를 누르면 즉시 가져옴</li>
            <li>Vercel Cron이 설정되어 있으면 자동으로 주기적 실행</li>
          </ol>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h3 className="font-medium text-blue-900 flex items-center gap-2 mb-2">
            💡 자동 동기화가 안 될 때
          </h3>
          <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
            <li>구글 시트가 <strong>"링크가 있는 모든 사용자 - 뷰어"</strong>로 공유되어 있어야 함</li>
            <li>종종 구글 시트 gid가 바뀌면 API에 등록된 gid도 수정 필요 (현재 아동=527581212, 성인=미등록)</li>
            <li>문제 시 상단 <strong>지금 동기화</strong> 버튼 후 판업 메시지에 오류 내용 확인</li>
            <li>Vercel Free 플랜은 Cron이 하루 1회만 동작. 5분마다 자동화는 Pro 플랜 필요</li>
          </ol>
        </div>

        {lastSync && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <h3 className="text-xs font-medium text-gray-600 mb-2">마지막 동기화 결과</h3>
            <pre className="text-[10px] text-gray-700 overflow-x-auto">{JSON.stringify(lastSync, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
