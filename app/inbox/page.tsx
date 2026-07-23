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
  const [filter, setFilter] = useState<"pending" | "processed" | "archived" | "all">("pending");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [previewLead, setPreviewLead] = useState<InboxLead | null>(null);

  useEffect(() => { loadAll(); }, []);

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
    // 아카이브된 항목은 반드시 archived 탭에서만 노출
    const isArchived = (l as any).archived === true;
    if (filter === "archived") return isArchived;
    if (isArchived) return false;
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

  // ✅ v3.12.4: raw_payload를 members 컬럼 + extra.consult_form으로 자동 매핑
  function buildMemberPayload(lead: InboxLead, orgId: string) {
    const raw = lead.raw_payload || {};
    const isChild = lead.member_type === "child";

    // ✅ 현재 지점 ID (activeBranchId) 불러오기
    let activeBranchId: string | null = null;
    try {
      activeBranchId = typeof window !== "undefined" ? window.localStorage.getItem("aqu_active_branch_id") : null;
    } catch {}

    // 기본 필드
    const payload: any = {
      org_id: orgId,
      name: lead.name,
      phone: lead.phone,
      member_type: lead.member_type || "adult",
      status: "new",
      source: lead.source || "웹신청",
      wish_days: lead.wish_days,
      wish_time_slots: lead.wish_time_slots,
      wish_start_date: lead.wish_start_date,
    };

    // ✅ 지점 자동 태깅
    if (activeBranchId) payload.branch_id = activeBranchId;

    // 날짜 필드
    if (raw.birth) payload.birth = raw.birth;
    if (raw.gender) payload.gender = raw.gender === "여" ? "female" : raw.gender === "남" ? "male" : raw.gender;
    if (raw.address) payload.address = raw.address;
    if (isChild && raw.guardian_name) payload.guardian_name = raw.guardian_name;
    if (isChild && raw.guardian_relation) payload.guardian_relation = raw.guardian_relation;

    // 상세 의학 정보 (v2.8에서 추가된 컬럼에 직접 저장)
    if (raw.diagnosis) payload.diagnosis = raw.diagnosis;
    if (raw.main_symptom) payload.main_symptom = raw.main_symptom;
    if (raw.medication) payload.medication = raw.medication;
    if (raw.treatment_history) payload.treatment_history = raw.treatment_history;
    if (raw.expected_change) payload.expected_change = raw.expected_change;

    // 현재 상태 ≠ 주 증상 (서로 다른 필드)
    // 현재 상태 = 방문 이유 / 상황 설명
    if (raw.current_status) payload.current_status = raw.current_status;
    else if (raw.visit_reason) payload.current_status = raw.visit_reason;
    else if (raw.current_condition) payload.current_status = raw.current_condition;
    else if (raw.chief_complaint) payload.current_status = raw.chief_complaint;
    // main_symptom은 주 증상 필드에만 들어감 (중복 쓰지 않음)

    // 특이사항
    const specialParts: string[] = [];
    if (raw.special_notes) specialParts.push(raw.special_notes);
    if (raw.pain_area) specialParts.push(`[통증부위] ${raw.pain_area}`);
    if (raw.surgery_history) specialParts.push(`[수술이력]\n${raw.surgery_history}`);
    if (isChild) {
      if (raw.height_weight) specialParts.push(`[키/체중] ${raw.height_weight}`);
      if (raw.institution) specialParts.push(`[이용기관] ${raw.institution}`);
    }
    if (specialParts.length > 0) payload.special_notes = specialParts.join("\n");

    // ✅ v3.12.4: raw_payload 전체를 extra.consult_form에 저장 (자동 매핑 연동용)
    const consultForm: any = {
      source: isChild ? "self_form_child" : "self_form_adult",
      member_type: lead.member_type || "adult",
      submitted_at: lead.created_at,
      ...raw,  // 원본 필드 모두 먹짐 (자체폼 제출 데이터)
    };
    payload.extra = { consult_form: consultForm };

    // 메모는 간단한 요약만 (긴 원본 메모는 생략)
    payload.memo = `🌐 온라인 신청서 접수 (${new Date(lead.created_at).toLocaleDateString("ko-KR")})`;

    return payload;
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
          await supabase.from("leads_inbox").update({ processed: true, member_id: existing[0].id }).eq("id", lead.id);
          await loadAll();
          return;
        }
      }

      const memberPayload = buildMemberPayload(lead, orgId);
      const { data: newMember, error } = await supabase
        .from("members")
        .insert(memberPayload)
        .select()
        .single();

      if (error) {
        alert("❌ 회원 등록 실패: " + error.message);
        setProcessing(false);
        return;
      }

      // 상담차트 자동 생성 (하나씩 미리 만들어 두면 상담 당일 바로 입력 가능)
      try {
        await supabase.from("consultation_charts").insert({
          org_id: orgId,
          member_id: newMember.id,
          chart_type: lead.member_type || "adult",
          member_name: lead.name,
          phone: lead.phone,
          source: lead.source || "웹신청",
          consult_date: new Date().toISOString().slice(0, 10),
          consult_method: "온라인",
          wish_days: lead.wish_days || [],
          wish_time_slots: lead.wish_time_slots || [],
          status: "draft",
          attention_level: "일반",
        });
      } catch (chartErr) {
        console.warn("상담차트 자동생성 실패(무시해도 됨):", chartErr);
      }

      // 승격 성공 즉시 archived=true 로 변경하여 즐시 목록에서 감춤 (이력은 아카이브 탭에서 확인 가능)
      await supabase.from("leads_inbox").update({
        processed: true,
        member_id: newMember.id,
        archived: true,
        archived_at: new Date().toISOString(),
      }).eq("id", lead.id);

      await loadAll();
      alert(`✅ ${lead.name}님이 회원으로 승격되었습니다\n📝 상담차트가 자동 생성되었습니다 (회원 상세 → 상담차트 탭에서 입력)`);
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
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    for (const id of Array.from(selectedIds)) {
      const lead = leads.find(l => l.id === id);
      if (!lead || lead.processed) continue;
      try {
        const memberPayload = buildMemberPayload(lead, orgId);
        const { data: newMember, error } = await supabase
          .from("members")
          .insert(memberPayload)
          .select()
          .single();
        if (error) {
          console.error(`[${lead.name}] 실패:`, error.message);
          fail++;
          continue;
        }
        // 상담차트 자동 생성
        try {
          await supabase.from("consultation_charts").insert({
            org_id: orgId,
            member_id: newMember.id,
            chart_type: lead.member_type || "adult",
            member_name: lead.name,
            phone: lead.phone,
            source: lead.source || "웹신청",
            consult_date: new Date().toISOString().slice(0, 10),
            consult_method: "온라인",
            wish_days: lead.wish_days || [],
            wish_time_slots: lead.wish_time_slots || [],
            status: "draft",
            attention_level: "일반",
          });
        } catch {}

        await supabase.from("leads_inbox").update({
          processed: true, member_id: newMember.id,
          archived: true, archived_at: new Date().toISOString(),
        }).eq("id", lead.id);
        success++;
      } catch (e) { fail++; }
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

  const pendingCount = leads.filter(l => !l.processed && !(l as any).archived).length;
  const processedActiveCount = leads.filter(l => l.processed && !(l as any).archived).length;
  const archivedCount = leads.filter(l => (l as any).archived).length;

  // 즐시 안 메뉴에서 종료된 리드를 수동으로 아카이브하기 (7일 기다리지 않고)
  async function archiveSelected() {
    if (selectedIds.size === 0) return alert("아카이브할 항목을 선택하세요");
    if (!confirm(`선택한 ${selectedIds.size}건을 아카이브하시겠습니까?\n\n(목록에서 숨김 - 데이터는 보존됨)`)) return;
    setProcessing(true);
    const { error } = await supabase.from("leads_inbox")
      .update({ archived: true, archived_at: new Date().toISOString() })
      .in("id", Array.from(selectedIds));
    setProcessing(false);
    if (error) alert("아카이브 실패: " + error.message);
    else { alert(`✅ ${selectedIds.size}건 아카이브 완료`); await loadAll(); }
  }

  // 종료된 리드 자동 정리 (삭제된 회원 참조 + 회원 사라진 참조 + 7일 지난 승격완료)
  async function cleanupIntegrity() {
    if (!confirm("데이터 무결성 자동 정리를 실행합니다.\n\n• 삭제된 회원 참조 유입 → 자동 삭제\n• 회원이 사라진 유입 → 대기 상태로 복원\n• 7일 지난 승격완료 → 아카이브\n\n계속하시겠습니까?")) return;
    setProcessing(true);
    try {
      // 1) 삭제된 회원 참조 유입 삭제
      const { data: deletedMembers } = await supabase.from("members")
        .select("id").not("deleted_at", "is", null);
      const deletedIds = (deletedMembers || []).map((m: any) => m.id);
      let removed = 0;
      if (deletedIds.length > 0) {
        const { error, count } = await supabase.from("leads_inbox")
          .delete({ count: "exact" }).in("member_id", deletedIds);
        if (!error) removed = count || 0;
      }

      // 2) 7일 지난 processed=true 항목 자동 archived
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      const { count: archived } = await supabase.from("leads_inbox")
        .update({ archived: true, archived_at: new Date().toISOString() }, { count: "exact" })
        .eq("processed", true).eq("archived", false).lt("created_at", weekAgo.toISOString());

      alert(`✅ 무결성 정리 완료\n\n• 삭제된 회원 참조 유입 ${removed}건 삭제\n• 7일 지난 승격완료 ${archived || 0}건 아카이브`);
      await loadAll();
    } catch (e: any) {
      alert("무결성 정리 실패: " + e.message);
    } finally { setProcessing(false); }
  }

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
              📥 신규 유입
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              자체 상담 신청폼으로 들어온 신규 유입 관리
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <HomeButton />
          <button onClick={loadAll} className="px-3 py-2 text-sm text-aqu-700 hover:bg-aqu-50 rounded-lg flex items-center gap-1">
            <RefreshCw className="w-4 h-4" /> 새로고침
          </button>
        </div>
      </div>

      {/* 신청폼 URL 바로가기 (심플) */}
      <div className="max-w-7xl mx-auto mb-5 bg-white border border-aqu-100 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm text-gray-700">
            <span className="font-semibold text-aqu-700">📝 자체 신청폼</span>
            <span className="text-gray-500 ml-2">아래 URL을 안내하면 응답이 자동으로 수집됩니다.</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.origin + "/apply-child");
                alert("✅ 아동 신청 URL이 복사되었습니다");
              }}
              className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100"
            >🧒 아동 URL 복사</button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.origin + "/apply-adult");
                alert("✅ 성인 신청 URL이 복사되었습니다");
              }}
              className="px-3 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100"
            >👤 성인 URL 복사</button>
            <Link href="/apply-child" target="_blank"
              className="px-3 py-1.5 text-xs bg-gray-50 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100">
              👁️ 미리보기
            </Link>
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
          <div className="flex items-center gap-2 text-sm opacity-90"><Check className="w-4 h-4" /> 승격 완료 (유효)</div>
          <div className="text-3xl font-bold mt-1">{processedActiveCount}건</div>
          <div className="text-xs opacity-80 mt-1">아카이브: {archivedCount}건</div>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl p-5 text-white shadow-md">
          <div className="flex items-center gap-2 text-sm opacity-90"><Users className="w-4 h-4" /> 전체 유입</div>
          <div className="text-3xl font-bold mt-1">{leads.length}건</div>
          <div className="text-xs opacity-80 mt-1">누적</div>
        </div>
      </div>

      {/* 필터 & 일괄작업 */}
      <div className="max-w-7xl mx-auto mb-4 flex justify-between items-center">
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilter("pending")} className={`px-4 py-2 text-sm rounded-lg ${filter === "pending" ? "bg-orange-500 text-white" : "bg-white border border-gray-200"}`}>⏳ 미처리 ({pendingCount})</button>
          <button onClick={() => setFilter("processed")} className={`px-4 py-2 text-sm rounded-lg ${filter === "processed" ? "bg-emerald-500 text-white" : "bg-white border border-gray-200"}`}>✅ 승격완료 ({processedActiveCount})</button>
          <button onClick={() => setFilter("archived")} className={`px-4 py-2 text-sm rounded-lg ${filter === "archived" ? "bg-gray-500 text-white" : "bg-white border border-gray-200"}`}>🗄️ 아카이브 ({archivedCount})</button>
          <button onClick={() => setFilter("all")} className={`px-4 py-2 text-sm rounded-lg ${filter === "all" ? "bg-purple-500 text-white" : "bg-white border border-gray-200"}`}>📋 전체 ({leads.length})</button>
          <button onClick={cleanupIntegrity} disabled={processing}
            className="px-3 py-2 text-sm rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50"
            title="삭제된 회원이 참조하는 유입 자동 정리 + 7일 지난 승격완료 아카이브">
            🧹 무결성 정리
          </button>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex gap-2">
            <span className="px-3 py-2 text-sm text-purple-700">{selectedIds.size}건 선택됨</span>
            {filter !== "archived" && (
              <button onClick={archiveSelected} disabled={processing}
                className="px-4 py-2 bg-gray-500 text-white text-sm rounded-lg hover:bg-gray-600 disabled:opacity-50">
                🗄️ 아카이브
              </button>
            )}
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
                        <button onClick={() => setPreviewLead(l)}
                          className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 flex items-center gap-1"
                          title="승격 전 상세 내용 미리보기">
                          👁️ 미리보기
                        </button>
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
                      <div className="flex gap-1 justify-center items-center">
                        <button onClick={() => setPreviewLead(l)}
                          className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200 border border-gray-200"
                          title="유입 원본 데이터 상세보기">👁️ 보기</button>
                        <span className="text-emerald-600 text-xs">✅ 완료</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 하단 간략 가이드 */}
      <div className="max-w-7xl mx-auto mt-5 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
          <div className="font-semibold text-orange-800 mb-1">⏳ 미처리</div>
          <div className="text-orange-700">신청서 도착 후 아직 상담/승격하지 않은 건. 승격 버튼으로 정식 회원 등록.</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <div className="font-semibold text-emerald-800 mb-1">✅ 승격완료</div>
          <div className="text-emerald-700">정식 회원으로 이동된 유입. 상세정보는 회원 카드에서 확인 가능.</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="font-semibold text-gray-800 mb-1">🗄️ 아카이브</div>
          <div className="text-gray-700">오래된 승격완료/중복/불필요 항목 보관함. 목록을 짧게 유지해 집중력 확보.</div>
        </div>
      </div>

      {/* ✅ v3.13: 승격 전 미리보기 모달 */}
      {previewLead && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPreviewLead(null)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="sticky top-0 bg-gradient-to-r from-blue-500 to-purple-500 text-white px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold">👁️ 신청서 상세보기</h2>
                <p className="text-xs opacity-90">{previewLead.name} · {previewLead.member_type === "child" ? "🧒 아동" : "👤 성인"} · {new Date(previewLead.created_at).toLocaleString("ko-KR")}</p>
              </div>
              <button onClick={() => setPreviewLead(null)} className="text-white/80 hover:text-white text-2xl leading-none">✕</button>
            </div>

            {/* 기본 정보 */}
            <div className="p-6 space-y-4">
              <section className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 text-sm mb-2">📌 기본 정보</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500">이름:</span> <strong>{previewLead.name}</strong></div>
                  <div><span className="text-gray-500">연락처:</span> {previewLead.phone || "-"}</div>
                  <div><span className="text-gray-500">유형:</span> {previewLead.member_type === "child" ? "🧒 아동" : "👤 성인"}</div>
                  <div><span className="text-gray-500">유입경로:</span> {previewLead.source || "-"}</div>
                  {previewLead.wish_start_date && <div><span className="text-gray-500">희망시작일:</span> {previewLead.wish_start_date}</div>}
                  {previewLead.wish_days && previewLead.wish_days.length > 0 && <div><span className="text-gray-500">희망요일:</span> {previewLead.wish_days.join(", ")}</div>}
                  {previewLead.wish_time_slots && previewLead.wish_time_slots.length > 0 && <div className="col-span-2"><span className="text-gray-500">희망시간:</span> {previewLead.wish_time_slots.join(", ")}</div>}
                  {previewLead.memo && <div className="col-span-2"><span className="text-gray-500">메모:</span> {previewLead.memo}</div>}
                </div>
              </section>

              {/* 신청폼 원본 데이터 */}
              {previewLead.raw_payload && Object.keys(previewLead.raw_payload).length > 0 && (
                <section className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h3 className="font-semibold text-purple-900 text-sm mb-3">📝 신청폼 원본 내용</h3>
                  <div className="space-y-2 text-sm">
                    {Object.entries(previewLead.raw_payload).map(([k, v]) => {
                      if (v === null || v === undefined || v === "") return null;
                      const displayValue = Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v);
                      const labelMap: Record<string, string> = {
                        diagnosis: "진단명", main_symptom: "주 증상", current_status: "현재 상태", visit_reason: "방문 이유",
                        medication: "복용 약", treatment_history: "치료 이력", expected_change: "기대하는 변화",
                        special_notes: "특이사항", pain_area: "통증 부위", pain_scale: "통증 도", pain_onset: "통증 시작",
                        surgery_history: "수술 이력", allergy: "알레르기", underlying_disease: "기저질환",
                        height_weight: "키/체중", institution: "이용 기관", gender: "성별", birth: "생년월일",
                        address: "주소", guardian_name: "보호자명", guardian_relation: "관계", email: "이메일",
                        preferences: "좋아하는 것", dislikes: "싫어하는 것", walking: "보행", communication: "의사소통",
                        wish_treatment: "희망 치료", aggravating_factor: "악화 요인", waterproof_diaper: "방수 기저귀",
                      };
                      const label = labelMap[k] || k;
                      return (
                        <div key={k} className="grid grid-cols-[140px_1fr] gap-2 border-b border-purple-100 pb-1.5">
                          <div className="text-xs text-purple-700 font-medium">{label}</div>
                          <div className="text-sm text-gray-800 whitespace-pre-wrap break-words">{displayValue}</div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>

            {/* 하단 액션 */}
            <div className="sticky bottom-0 bg-white border-t px-6 py-3 flex justify-end gap-2">
              <button onClick={() => setPreviewLead(null)}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">닫기</button>
              {!previewLead.processed && (
                <button onClick={() => { const lead = previewLead; setPreviewLead(null); promoteOne(lead); }}
                  disabled={processing}
                  className="px-4 py-2 text-sm bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1">
                  <Check className="w-4 h-4" /> 이 내용으로 승격
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
