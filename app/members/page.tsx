"use client";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { getActiveBranchId, useBranchWatch } from "@/lib/branchContext";
import {
  Search, Waves, ChevronRight, Plus, X, Save, UserPlus, MessageSquare, Copy, Trash2, AlertTriangle, CheckSquare, Square
} from "lucide-react";

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

const STATUS_OPTIONS = [
  { key: "new", label: "🆕 신규", bgColor: "bg-pink-100", textColor: "text-pink-700" },
  { key: "waiting", label: "⏳ 대기중", bgColor: "bg-yellow-100", textColor: "text-yellow-700" },
  { key: "trial_scheduled", label: "📅 체험예정", bgColor: "bg-blue-100", textColor: "text-blue-700" },
  { key: "trial_done", label: "✅ 체험완료", bgColor: "bg-purple-100", textColor: "text-purple-700" },
  { key: "regular", label: "🎯 정규등록", bgColor: "bg-green-100", textColor: "text-green-700" },
  { key: "paused", label: "⏸️ 보류", bgColor: "bg-gray-100", textColor: "text-gray-700" },
  { key: "closed", label: "🏳️ 종결", bgColor: "bg-slate-200", textColor: "text-slate-700" },
  { key: "ended", label: "🛑 대기종료", bgColor: "bg-red-100", textColor: "text-red-700" },
];

function getStatusInfo(status: string | null) {
  return STATUS_OPTIONS.find((s) => s.key === status) || STATUS_OPTIONS.find((s) => s.key === "regular")!;
}

export default function MembersPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "child" | "adult">("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDedupeModal, setShowDedupeModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // 메모 편집 모달
  const [memoMember, setMemoMember] = useState<Member | null>(null);
  const [memoText, setMemoText] = useState("");
  const [memoSaving, setMemoSaving] = useState(false);

  // 상태 드롭다운 열림 여부
  const [openStatusId, setOpenStatusId] = useState<string | null>(null);
  const [inboxPending, setInboxPending] = useState(0);

  // ✅ v3.11: 지점 이관 상태
  const [selectedForTransfer, setSelectedForTransfer] = useState<Set<string>>(new Set());
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [branchList, setBranchList] = useState<any[]>([]);
  const [transferring, setTransferring] = useState(false);

  const [newMember, setNewMember] = useState<any>({
    member_type: "child", name: "", birth: "", gender: "", phone: "",
    guardian_name: "", guardian_relation: "모", address: "",
    diagnosis: "", special_notes: "", pain_area: "", pain_scale: 0,
    medical_history: "", source: "검색", status: "waiting",
  });

  useEffect(() => {
    loadMembers();
    // 신규 유입 미처리 건수
    supabase.from("leads_inbox").select("*", { count: "exact", head: true }).eq("processed", false)
      .then(({ count }) => setInboxPending(count || 0));
    // ✅ 지점 목록 로드 (이관 대상)
    supabase.from("branches").select("*").is("deleted_at", null).order("branch_type").order("created_at")
      .then(({ data }) => setBranchList(data || []));
  }, []);

  // ✅ 지점 전환 이벤트 감지 → 데이터 자동 재로드
  useBranchWatch(() => loadMembers());

  async function loadMembers() {
    setLoading(true);
    const branchId = getActiveBranchId();
    let query = supabase
      .from("members")
      .select("*")
      .is("deleted_at", null);
    // ✅ 지점 필터 (branchId가 있을 때만)
    if (branchId) query = query.eq("branch_id", branchId);
    query = query.order("name", { ascending: true });
    const { data, error } = await query;
    // branch_id 컴럼 미존재 시 네트워크 에러 가능 → 폴백
    if (error && (error.message?.includes("branch_id") || error.code === "42703")) {
      const fb = await supabase.from("members").select("*").is("deleted_at", null).order("name");
      if (fb.data) setMembers(fb.data as Member[]);
    } else if (!error && data) {
      setMembers(data as Member[]);
    }
    setLoading(false);
  }

  async function updateStatus(memberId: string, newStatus: string) {
    setOpenStatusId(null);
    // Optimistic update
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, status: newStatus } : m)));
    // .select()로 실제 반환 rows 검증 (RLS 차단 감지)
    const { data, error } = await supabase.from("members")
      .update({ status: newStatus })
      .eq("id", memberId)
      .select();

    if (error) {
      alert("❌ 상태 변경 실패: " + error.message);
      loadMembers();
      return;
    }
    if (!data || data.length === 0) {
      alert(
        "❌ 상태 변경이 저장되지 않았습니다!\n\n" +
        "[원인] Supabase RLS(Row Level Security) 정책이 UPDATE를 막고 있습니다.\n" +
        "[해결] AQUNOTE_FIX_RLS_UPDATE.sql 파일을 Supabase SQL Editor에서 실행해주세요."
      );
      loadMembers();
      return;
    }
    // ✅ 성공 - 이미 optimistic update 되었음
  }

  function openMemoModal(m: Member) {
    setMemoMember(m);
    setMemoText(m.memo || "");
  }

  async function saveMemo() {
    if (!memoMember) return;
    setMemoSaving(true);
    const { error } = await supabase.from("members").update({ memo: memoText }).eq("id", memoMember.id);
    if (!error) {
      setMembers((prev) => prev.map((m) => (m.id === memoMember.id ? { ...m, memo: memoText } : m)));
      setMemoMember(null);
      setMemoText("");
    } else {
      alert("메모 저장 실패: " + error.message);
    }
    setMemoSaving(false);
  }

  async function addMember(gotoDetail: boolean = false) {
    if (!newMember.name) return;
    setSaving(true);
    try {
      const { data: orgs } = await supabase.from("organizations").select("id").limit(1);
      const orgId = orgs?.[0]?.id;

      const extra: any = {};
      if (newMember.diagnosis) extra.diagnosis = newMember.diagnosis;
      if (newMember.special_notes) extra.special_notes = newMember.special_notes;
      if (newMember.pain_area) extra.pain_area = newMember.pain_area;
      if (newMember.pain_scale) extra.pain_scale = Number(newMember.pain_scale);
      if (newMember.medical_history) extra.medical_history = newMember.medical_history;

      const payload: any = {
        org_id: orgId,
        member_type: newMember.member_type,
        name: newMember.name,
        birth: newMember.birth || null,
        gender: newMember.gender || null,
        phone: newMember.phone || null,
        address: newMember.address || null,
        source: newMember.source,
        status: newMember.status,
        extra,
      };
      // ✅ 현재 지점으로 자동 태깅
      const activeBranchId = getActiveBranchId();
      if (activeBranchId) payload.branch_id = activeBranchId;
      if (newMember.member_type === "child") {
        payload.guardian_name = newMember.guardian_name || null;
        payload.guardian_relation = newMember.guardian_relation || null;
      }

      const { data, error } = await supabase.from("members").insert(payload).select().single();
      if (!error && data) {
        setShowAddModal(false);
        setNewMember({
          member_type: "child", name: "", birth: "", gender: "", phone: "",
          guardian_name: "", guardian_relation: "모", address: "",
          diagnosis: "", special_notes: "", pain_area: "", pain_scale: 0,
          medical_history: "", source: "검색", status: "waiting",
        });
        if (gotoDetail) {
          router.push(`/members/${data.id}`);
        } else {
          await loadMembers();
          alert(`✅ ${data.name}님이 저장되었습니다`);
        }
      } else {
        alert("저장 실패: " + (error?.message || "알 수 없는 오류"));
      }
    } finally {
      setSaving(false);
    }
  }

  const filtered = members
    .filter((m) => (filter === "all" ? true : m.member_type === filter))
    .filter((m) => (statusFilter === "all" ? true : (m.status || "regular") === statusFilter))
    .filter((m) =>
      query
        ? (m.name || "").toLowerCase().includes(query.toLowerCase()) ||
          (m.guardian_name || "").toLowerCase().includes(query.toLowerCase()) ||
          (m.phone || "").includes(query)
        : true
    );

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Waves className="w-8 h-8 text-aqu-600" />
          <h1 className="text-2xl md:text-3xl font-bold text-aqu-900">👥 회원 관리</h1>
        </div>
        <div className="flex items-center gap-2">
          {inboxPending > 0 && (
            <Link href="/inbox"
              className="px-3 py-1.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg text-sm flex items-center gap-1 hover:from-orange-600 hover:to-red-600 shadow-md animate-pulse">
              📥 신규 유입 <span className="bg-white text-red-600 px-1.5 rounded font-bold">{inboxPending}</span>
            </Link>
          )}
          <button onClick={() => setShowDedupeModal(true)}
            className="px-3 py-1.5 bg-gradient-to-br from-amber-500 to-orange-500 text-white rounded-lg text-sm flex items-center gap-1 hover:opacity-90 shadow-sm"
            title="이름 + 전화번호 기준으로 중복 회원 감지">
            <Copy className="w-4 h-4" /> 중복 정리
          </button>
          {/* ✅ v3.11: 지점 이관 버튼 */}
          <button onClick={() => {
              if (selectedForTransfer.size === 0) { alert("먼저 이관할 회원을 체크박스로 선택하세요"); return; }
              setShowTransferModal(true);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 shadow-sm text-white ${selectedForTransfer.size === 0 ? "bg-gray-300 cursor-not-allowed" : "bg-gradient-to-br from-indigo-500 to-blue-600 hover:opacity-90"}`}
            title="선택한 회원을 다른 지점으로 이관">
            🏬 지점 이관 {selectedForTransfer.size > 0 && `(${selectedForTransfer.size})`}
          </button>
          {/* ✅ v3.12.3: 상담폼 일괄 자동 채우기 버튼 */}
          <button
            onClick={async () => {
              if (!confirm("모든 회원의 상담폼 데이터를 상세 정보 칸으로 자동 복사합니다.\n\n✅ 비어있는 칸만 채워집니다 (기존 값 보존)\n⚠️ 이 작업은 수분 소요될 수 있습니다\n\n계속할까요?")) return;
              try {
                const { mapConsultFormToMemberInfo, mergeMappedInfo, hasFillableData } = await import("@/lib/consultFormMapper");
                let done = 0, skipped = 0, err = 0;
                for (const m of members) {
                  const form = (m as any)?.extra?.consult_form;
                  if (!form || !hasFillableData(form)) { skipped++; continue; }
                  const existing = {
                    current_status: (m as any).current_status || (m as any).extra?.current_status || "",
                    main_symptom: (m as any).main_symptom || (m as any).extra?.main_symptom || "",
                    medication: (m as any).medication || (m as any).extra?.medication || "",
                    treatment_history: (m as any).treatment_history || (m as any).extra?.treatment_history || "",
                    expected_change: (m as any).expected_change || (m as any).extra?.expected_change || "",
                    special_notes: (m as any).special_notes || (m as any).extra?.special_notes || "",
                    diagnosis: (m as any).extra?.diagnosis || "",
                  };
                  const mapped = mapConsultFormToMemberInfo(form, m.member_type);
                  const merged = mergeMappedInfo(existing, mapped, "fill_empty");
                  // 1차: 직접 컬럼 업데이트 시도
                  const directPayload: any = {
                    current_status: merged.current_status || null,
                    main_symptom: merged.main_symptom || null,
                    medication: merged.medication || null,
                    treatment_history: merged.treatment_history || null,
                    expected_change: merged.expected_change || null,
                    special_notes: merged.special_notes || null,
                  };
                  const r1 = await supabase.from("members").update(directPayload).eq("id", m.id).select();
                  if (r1.error || !r1.data || r1.data.length === 0) {
                    // 2차: extra JSONB로 fallback
                    const newExtra = {
                      ...((m as any).extra || {}),
                      current_status: merged.current_status,
                      main_symptom: merged.main_symptom,
                      medication: merged.medication,
                      treatment_history: merged.treatment_history,
                      expected_change: merged.expected_change,
                      special_notes: merged.special_notes,
                      diagnosis: merged.diagnosis || (m as any).extra?.diagnosis,
                    };
                    const r2 = await supabase.from("members").update({ extra: newExtra }).eq("id", m.id);
                    if (r2.error) { err++; continue; }
                  } else if (merged.diagnosis && !(m as any).extra?.diagnosis) {
                    const newExtra = { ...((m as any).extra || {}), diagnosis: merged.diagnosis };
                    await supabase.from("members").update({ extra: newExtra }).eq("id", m.id);
                  }
                  done++;
                }
                alert(`✅ 자동 채우기 완료\n\n• 적용된 회원: ${done}명\n• 상담폼 없음: ${skipped}명${err > 0 ? `\n• 실패: ${err}명` : ""}`);
                loadMembers();
              } catch (e: any) {
                alert("일괄 자동 채우기 실패: " + (e?.message || e));
              }
            }}
            className="px-3 py-1.5 bg-gradient-to-br from-purple-500 to-indigo-500 text-white rounded-lg text-sm flex items-center gap-1 hover:opacity-90 shadow-sm"
            title="모든 회원의 상담폼 데이터를 상세정보 칸에 일괄 복사 (기존 값 보존)">
            🔄 상담폼 일괄적용
          </button>
          <button onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-aqu-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-aqu-700">
            <UserPlus className="w-4 h-4" /> 신규 회원
          </button>
          <HomeButton />
        </div>
      </div>

      {/* Filter row 1: 아동/성인 + 검색 */}
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <button onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-lg text-sm ${filter === "all" ? "bg-aqu-600 text-white" : "bg-white border border-aqu-200 text-aqu-700"}`}>
          전체 ({members.length})
        </button>
        <button onClick={() => setFilter("child")}
          className={`px-4 py-2 rounded-lg text-sm ${filter === "child" ? "bg-aqu-600 text-white" : "bg-white border border-aqu-200 text-aqu-700"}`}>
          👶 아동 ({members.filter((m) => m.member_type === "child").length})
        </button>
        <button onClick={() => setFilter("adult")}
          className={`px-4 py-2 rounded-lg text-sm ${filter === "adult" ? "bg-aqu-600 text-white" : "bg-white border border-aqu-200 text-aqu-700"}`}>
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

      {/* Filter row 2: 상태별 필터 */}
      <div className="flex flex-wrap gap-1 items-center mb-4 text-xs">
        <span className="text-gray-500 mr-1">상태:</span>
        <button onClick={() => setStatusFilter("all")}
          className={`px-2 py-1 rounded ${statusFilter === "all" ? "bg-aqu-600 text-white" : "bg-white border border-aqu-200"}`}>
          전체
        </button>
        {STATUS_OPTIONS.map((s) => {
          const count = members.filter((m) => (m.status || "regular") === s.key).length;
          if (count === 0) return null;
          return (
            <button key={s.key} onClick={() => setStatusFilter(s.key)}
              className={`px-2 py-1 rounded ${statusFilter === s.key ? `${s.bgColor} ${s.textColor} border border-current` : "bg-white border border-aqu-200"}`}>
              {s.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400">회원이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-aqu-50 text-aqu-900">
                <tr>
                  <th className="w-10 text-center px-2 py-3">
                    <input type="checkbox"
                      checked={selectedForTransfer.size > 0 && selectedForTransfer.size === filtered.length}
                      onChange={() => {
                        if (selectedForTransfer.size === filtered.length) setSelectedForTransfer(new Set());
                        else setSelectedForTransfer(new Set(filtered.map((m: any) => m.id)));
                      }}
                      title="전체 선택"
                      className="w-4 h-4 accent-indigo-500 cursor-pointer" />
                  </th>
                  <th className="text-left px-4 py-3">이름</th>
                  <th className="px-2 py-3 text-center w-14 whitespace-nowrap">구분</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">보호자</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">진단명</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell whitespace-nowrap">연락처</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">메모</th>
                  <th className="text-left px-4 py-3">상태 (클릭변경)</th>
                  <th className="text-center px-2 py-3">메모</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const statusInfo = getStatusInfo(m.status);
                  const isSelForTransfer = selectedForTransfer.has(m.id);
                  return (
                    <tr key={m.id} className={`border-t border-aqu-100 hover:bg-aqu-50/50 ${isSelForTransfer ? "bg-indigo-50/50" : ""}`}>
                      <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={isSelForTransfer}
                          onChange={() => {
                            setSelectedForTransfer(prev => {
                              const next = new Set(prev);
                              if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                              return next;
                            });
                          }}
                          className="w-4 h-4 accent-indigo-500 cursor-pointer" />
                      </td>
                      <td className="px-4 py-3 font-medium text-aqu-900 cursor-pointer"
                        onClick={() => router.push(`/members/${m.id}`)}>
                        {m.name}
                      </td>
                      <td className="px-2 py-3 cursor-pointer w-14"
                        onClick={() => router.push(`/members/${m.id}`)}>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs whitespace-nowrap font-semibold ${m.member_type === "child" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                          {m.member_type === "child" ? "아동" : "성인"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell cursor-pointer"
                        onClick={() => router.push(`/members/${m.id}`)}>
                        {m.guardian_name || "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs hidden md:table-cell cursor-pointer max-w-[180px]"
                        onClick={() => router.push(`/members/${m.id}`)}
                        title={m.extra?.diagnosis || ""}>
                        <div className="truncate">{m.extra?.diagnosis || "-"}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell cursor-pointer whitespace-nowrap font-mono text-[13px]"
                        onClick={() => router.push(`/members/${m.id}`)}>
                        {m.phone || "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell cursor-pointer max-w-[240px]"
                        onClick={() => router.push(`/members/${m.id}`)}
                        title={m.memo || m.extra?.diagnosis || ""}>
                        <div className="truncate">
                          {m.memo || (m.extra?.diagnosis ? <span className="text-gray-400 italic">{m.extra.diagnosis}</span> : "-")}
                        </div>
                      </td>
                      {/* 상태 드롭다운 */}
                      <td className="px-4 py-3 relative min-w-[140px]">
                        <button
                          onClick={() => setOpenStatusId(openStatusId === m.id ? null : m.id)}
                          className={`px-3 py-1.5 rounded text-xs ${statusInfo.bgColor} ${statusInfo.textColor} hover:opacity-80 inline-flex items-center gap-1 whitespace-nowrap`}
                        >
                          {statusInfo.label}
                          <span className="text-[10px] opacity-60">▼</span>
                        </button>
                        {openStatusId === m.id && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setOpenStatusId(null)}
                            />
                            <div className="absolute z-50 mt-1 left-4 bg-white border border-aqu-200 rounded-lg shadow-lg overflow-hidden min-w-[130px]">
                              {STATUS_OPTIONS.map((s) => (
                                <button
                                  key={s.key}
                                  onClick={() => updateStatus(m.id, s.key)}
                                  className={`w-full text-left px-3 py-2 text-xs hover:bg-aqu-50 ${
                                    (m.status || "regular") === s.key ? "bg-aqu-50 font-medium" : ""
                                  }`}
                                >
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </td>
                      {/* 메모 아이콘 */}
                      <td className="px-2 py-3 text-center">
                        <button
                          onClick={() => openMemoModal(m)}
                          title={m.memo || "메모 추가"}
                          className={`p-1.5 rounded-lg transition ${
                            m.memo ? "bg-yellow-50 text-yellow-600 hover:bg-yellow-100" : "text-gray-300 hover:text-aqu-600 hover:bg-aqu-50"
                          }`}
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      </td>
                      <td className="px-2 py-3 text-gray-400 cursor-pointer"
                        onClick={() => router.push(`/members/${m.id}`)}>
                        <ChevronRight className="w-4 h-4" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-400 text-right">
        총 {filtered.length}명 · 상태 배지 클릭으로 즉시 변경 · 💬 아이콘으로 메모 편집
      </div>

      {/* Memo Modal */}
      {memoMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setMemoMember(null)}>
          <div className="bg-white rounded-2xl p-5 md:p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-aqu-900 flex items-center gap-1">
                <MessageSquare className="w-5 h-5" /> {memoMember.name}님 메모
              </h3>
              <button onClick={() => setMemoMember(null)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">
              <span className={`px-2 py-0.5 rounded ${memoMember.member_type === "child" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                {memoMember.member_type === "child" ? "아동" : "성인"}
              </span>
              {memoMember.guardian_name && <span>보호자: {memoMember.guardian_name}</span>}
              {memoMember.phone && <span>{memoMember.phone}</span>}
            </div>
            <textarea
              value={memoText}
              onChange={(e) => setMemoText(e.target.value)}
              placeholder="회원에 대한 메모를 자유롭게 남기세요.

예시:
- 매주 화요일 15시 정기 방문
- 물을 무서워하니 천천히 진행
- 조부모님이 데려오시고 대기실에서 기다림
- 특정 코치 선호 (김코치)
- 결제 방식: 매월 자동이체
- 컨디션 관찰 필요"
              rows={12}
              className="w-full p-3 rounded-lg border border-aqu-200 text-sm resize-none"
              autoFocus
            />
            <div className="text-xs text-gray-400 mt-1 mb-3">{memoText.length}자</div>
            <div className="flex gap-2">
              <button onClick={() => setMemoMember(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
                취소
              </button>
              <button onClick={saveMemo} disabled={memoSaving}
                className="flex-1 py-2.5 bg-aqu-600 text-white rounded-lg text-sm font-medium hover:bg-aqu-700 disabled:bg-gray-300 flex items-center justify-center gap-1">
                <Save className="w-4 h-4" /> {memoSaving ? "저장중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal (기존과 동일) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl p-5 md:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-aqu-900 flex items-center gap-1">
                <UserPlus className="w-5 h-5" /> 신규 회원 등록
              </h3>
              <button onClick={() => setShowAddModal(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            <div className="mb-4">
              <label className="text-xs text-gray-600">구분</label>
              <div className="flex gap-2 mt-1">
                <button onClick={() => setNewMember({ ...newMember, member_type: "child" })}
                  className={`flex-1 py-3 rounded-lg text-sm font-medium ${newMember.member_type === "child" ? "bg-blue-500 text-white" : "bg-gray-100 hover:bg-gray-200"}`}>
                  👶 아동
                </button>
                <button onClick={() => setNewMember({ ...newMember, member_type: "adult" })}
                  className={`flex-1 py-3 rounded-lg text-sm font-medium ${newMember.member_type === "adult" ? "bg-purple-500 text-white" : "bg-gray-100 hover:bg-gray-200"}`}>
                  🧑 성인
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="이름 *" value={newMember.name} onChange={(v: string) => setNewMember({ ...newMember, name: v })} placeholder="김철수" />
              <Field label="연락처" value={newMember.phone} onChange={(v: string) => setNewMember({ ...newMember, phone: v })} placeholder="010-1234-5678" />
              <Field label="생년월일" type="date" value={newMember.birth} onChange={(v: string) => setNewMember({ ...newMember, birth: v })} />
              <div>
                <label className="text-xs text-gray-600">성별</label>
                <select value={newMember.gender} onChange={(e) => setNewMember({ ...newMember, gender: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm">
                  <option value="">선택</option>
                  <option value="M">남</option>
                  <option value="F">여</option>
                </select>
              </div>
            </div>

            {newMember.member_type === "child" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <Field label="보호자 성함" value={newMember.guardian_name} onChange={(v: string) => setNewMember({ ...newMember, guardian_name: v })} placeholder="김보호" />
                <div>
                  <label className="text-xs text-gray-600">보호자 관계</label>
                  <select value={newMember.guardian_relation} onChange={(e) => setNewMember({ ...newMember, guardian_relation: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm">
                    <option>모</option><option>부</option><option>조부모</option><option>기타</option>
                  </select>
                </div>
              </div>
            )}

            <div className="mt-3">
              <Field label="주소" value={newMember.address} onChange={(v: string) => setNewMember({ ...newMember, address: v })} placeholder="서울시 송파구..." />
            </div>

            <div className="mt-3">
              <Field label="진단명" value={newMember.diagnosis} onChange={(v: string) => setNewMember({ ...newMember, diagnosis: v })} placeholder="자폐성장애 / 뇌병변 / 없음 등" />
            </div>

            {newMember.member_type === "child" ? (
              <div className="mt-3">
                <label className="text-xs text-gray-600">특이사항</label>
                <textarea value={newMember.special_notes} onChange={(e) => setNewMember({ ...newMember, special_notes: e.target.value })}
                  rows={2} className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm"
                  placeholder="발달 상태 · 주의사항 등" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <Field label="통증 부위" value={newMember.pain_area} onChange={(v: string) => setNewMember({ ...newMember, pain_area: v })} placeholder="목·허리·무릎" />
                <div>
                  <label className="text-xs text-gray-600">통증 척도 (0-10)</label>
                  <input type="number" min={0} max={10} value={newMember.pain_scale}
                    onChange={(e) => setNewMember({ ...newMember, pain_scale: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-600">기저질환</label>
                  <input value={newMember.medical_history} onChange={(e) => setNewMember({ ...newMember, medical_history: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm"
                    placeholder="고혈압 · 당뇨 · 심장질환 등" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div>
                <label className="text-xs text-gray-600">유입경로</label>
                <select value={newMember.source} onChange={(e) => setNewMember({ ...newMember, source: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm">
                  <option>검색</option><option>소개</option><option>간판</option><option>지인</option><option>기타</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">상태</label>
                <select value={newMember.status} onChange={(e) => setNewMember({ ...newMember, status: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm">
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={() => addMember(false)} disabled={!newMember.name || saving}
                className="flex-1 py-2.5 bg-aqu-600 text-white rounded-lg text-sm font-medium hover:bg-aqu-700 disabled:bg-gray-300 flex items-center justify-center gap-1">
                <Save className="w-4 h-4" /> {saving ? "저장중..." : "저장하기"}
              </button>
              <button onClick={() => addMember(true)} disabled={!newMember.name || saving}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:bg-gray-300 flex items-center justify-center gap-1">
                <Save className="w-4 h-4" /> 저장 후 상세보기
              </button>
              <button onClick={() => setShowAddModal(false)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
                취소하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 중복 회원 정리 모달 ─── */}
      {/* ✅ v3.11: 지점 이관 모달 */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !transferring && setShowTransferModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-blue-50 flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  🏬 지점 이관
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  선택된 <b className="text-indigo-600">{selectedForTransfer.size}명</b>을 다른 지점으로 이관합니다
                </div>
              </div>
              <button onClick={() => !transferring && setShowTransferModal(false)}
                className="p-1.5 hover:bg-white/50 rounded-lg">
                <span className="text-xl">✕</span>
              </button>
            </div>
            <div className="p-5 max-h-[60vh] overflow-y-auto">
              <div className="text-sm font-semibold text-slate-700 mb-3">이관할 지점 선택</div>
              {branchList.length === 0 ? (
                <div className="text-sm text-gray-400 py-6 text-center">등록된 지점이 없습니다</div>
              ) : (
                <div className="space-y-2">
                  {branchList.map(b => {
                    const typeMeta: any = {
                      head:   { icon: "🏢", label: "본점",   color: "from-yellow-500 to-amber-500" },
                      direct: { icon: "🏪", label: "직영점", color: "from-blue-500 to-indigo-500" },
                      branch: { icon: "🏬", label: "지점",   color: "from-gray-400 to-slate-500" },
                    };
                    const tm = typeMeta[b.branch_type] || typeMeta.branch;
                    return (
                      <button key={b.id} type="button"
                        disabled={transferring}
                        onClick={async () => {
                          if (selectedForTransfer.size === 0) { alert("이관할 회원을 선택하세요"); return; }
                          const ids = Array.from(selectedForTransfer);
                          if (!confirm(`선택한 ${ids.length}명을 [${b.name}](으)로 이관합니다.\n이관 시 해당 회원의 결제·시간표 데이터도 함께 이전됩니다.\n계속할까요?`)) return;
                          setTransferring(true);
                          let done = 0, err = 0;
                          for (let i = 0; i < ids.length; i += 100) {
                            const batch = ids.slice(i, i + 100);
                            const { error: e1 } = await supabase.from("members").update({ branch_id: b.id }).in("id", batch);
                            if (e1) { err++; continue; }
                            try { await supabase.from("payments").update({ branch_id: b.id }).in("member_id", batch); } catch {}
                            try { await supabase.from("schedule_slots").update({ branch_id: b.id }).in("member_id", batch); } catch {}
                            done += batch.length;
                          }
                          setTransferring(false);
                          setShowTransferModal(false);
                          setSelectedForTransfer(new Set());
                          alert(err > 0
                            ? `⚠️ ${done}명 이관 완료, ${err}건 실패\n(SQL 마이그레이션 미적용 시 AQUNOTE_V310_BRANCH_MASTER.sql 먼저 실행)`
                            : `✅ ${done}명이 [${b.name}](으)로 이관되었습니다`);
                          loadMembers();
                        }}
                        className={`w-full p-3 rounded-xl border-2 border-gray-100 hover:border-indigo-300 hover:bg-indigo-50 transition text-left flex items-center gap-3 ${transferring ? "opacity-50 cursor-not-allowed" : ""}`}>
                        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${tm.color} flex items-center justify-center text-2xl shadow`}>
                          {tm.icon}
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-slate-900 flex items-center gap-2">
                            {b.name}
                            <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{tm.label}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {b.address && <span>📍 {b.address}</span>}
                            {b.manager_name && <span className="ml-2">👤 {b.manager_name}</span>}
                          </div>
                        </div>
                        <span className="text-indigo-500 text-sm font-bold">이관 →</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button onClick={() => !transferring && setShowTransferModal(false)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-100">
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {showDedupeModal && (
        <DedupeModal members={members} onClose={() => setShowDedupeModal(false)} onDone={() => { setShowDedupeModal(false); loadMembers(); }} />
      )}
    </main>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: any) {
  return (
    <div>
      <label className="text-xs text-gray-600">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 🧹 중복 회원 정리 모달 (이름 + 전화번호 기준)
// ═══════════════════════════════════════════════════════════════
function DedupeModal({ members, onClose, onDone }: { members: any[]; onClose: () => void; onDone: () => void }) {
  const [strategy, setStrategy] = useState<"strict" | "loose">("loose");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState(false);

  // 전화번호 정규화: 숫자만 추출
  function normPhone(p: string | null): string {
    if (!p) return "";
    const digits = p.replace(/\D/g, "");
    return digits;
  }
  // 마지막 4자리 (loose 매칭용)
  function tail4(p: string | null): string {
    const d = normPhone(p);
    return d.length >= 4 ? d.slice(-4) : d;
  }

  // 중복 그룹 계산
  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const m of members) {
      const name = (m.name || "").trim();
      if (!name) continue;
      const phone = m.phone || m.guardian_phone || "";

      let key: string;
      if (strategy === "strict") {
        // 이름 + 전화번호 완전 일치 (전화 없으면 별개 취급)
        const p = normPhone(phone);
        if (!p) continue;
        key = `${name}|${p}`;
      } else {
        // 이름 + 전화 뒤 4자리 (전화 없어도 이름만 같으면 후보)
        const t = tail4(phone);
        key = `${name}|${t}`;
      }
      const arr = map.get(key) || [];
      arr.push(m);
      map.set(key, arr);
    }
    // 2건 이상인 그룹만
    return Array.from(map.entries())
      .filter(([, arr]) => arr.length >= 2)
      .map(([key, arr]) => ({
        key,
        name: arr[0].name,
        entries: arr.sort((a, b) => {
          // 정보가 더 많은 순으로 정렬 (진단명, 보호자 등 있는 쪽 우선)
          const score = (m: any) => {
            let s = 0;
            if (m.extra?.diagnosis) s += 3;
            if (m.guardian_name) s += 2;
            if (m.phone || m.guardian_phone) s += 2;
            if (m.status === "regular") s += 3;
            if (m.status === "trial_scheduled") s += 2;
            if (m.memo && m.memo.length > 10) s += 1;
            if (m.created_at) s += new Date(m.created_at).getTime() / 1e13;
            return s;
          };
          return score(b) - score(a);
        }),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [members, strategy]);

  // 초기 체크: 각 그룹의 2번째~N번째(정보 적은 쪽)만 자동 체크
  useEffect(() => {
    const initial: Record<string, boolean> = {};
    for (const g of groups) {
      g.entries.forEach((m, idx) => {
        initial[m.id] = idx > 0; // 첫 번째(가장 정보 많은 회원) 제외
      });
    }
    setChecked(initial);
  }, [groups]);

  const totalDupMembers = groups.reduce((s, g) => s + g.entries.length, 0);
  const totalToDelete = Object.values(checked).filter(v => v).length;

  function toggle(id: string) {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  }
  function selectAllInGroup(g: any, val: boolean) {
    setChecked(prev => {
      const c = { ...prev };
      g.entries.forEach((m: any, idx: number) => {
        // 첫 번째(원본)는 val=false일 때만 명시적으로 해제
        c[m.id] = val ? idx > 0 : false;
      });
      return c;
    });
  }

  async function executeDelete() {
    const ids = Object.entries(checked).filter(([, v]) => v).map(([id]) => id);
    if (ids.length === 0) { alert("삭제할 회원을 선택하세요"); return; }
    if (!confirm(`⚠️ 선택된 ${ids.length}명의 회원을 완전 삭제하시겠습니까?\n\n• 회원 기본정보 영구 삭제\n• 시간표·출결·결제·회원권 데이터 모두 삭제\n• 고정시간표 배정 자동 복구(OPEN)\n• 상담차트·IEP·행동기록 삭제\n• 복구 불가`)) return;
    if (!confirm(`마지막 확인: ${ids.length}명 완전 삭제 진행?`)) return;

    setDeleting(true);
    const BATCH = 100;
    let done = 0;
    let errCount = 0;

    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);

      // ✅ v3.13.7: 연관 데이터 전체 hard delete
      await supabase.from("schedule_slots").delete().in("member_id", batch);
      await supabase.from("slot_matrix").update({ status: "open", fixed_name: null, member_id: null }).in("member_id", batch);
      await supabase.from("attendance").delete().in("member_id", batch);
      await supabase.from("payments").delete().in("member_id", batch);
      await supabase.from("memberships").delete().in("member_id", batch);
      // 선택 테이블들 (없을 수 있으니 에러 무시)
      for (const tbl of ["consultation_charts", "iep_goals", "behavior_records", "documents", "leads_inbox"]) {
        await supabase.from(tbl).delete().in("member_id", batch);
      }

      const { error } = await supabase.from("members").delete().in("id", batch);
      if (error) { errCount++; console.error(error); }
      else done += batch.length;
    }

    setDeleting(false);
    if (errCount > 0) {
      alert(`⚠️ 부분 성공: ${done}명 삭제됨, ${errCount}배치 실패\n\n실패 원인은 브라우저 콘솔에서 확인하세요.`);
    } else {
      alert(`✅ ${done}명이 완전 삭제되었습니다 (모든 연관 데이터 동시 삭제)`);
    }
    onDone();
  }

  function fmtPhone(p: string | null) {
    if (!p) return "-";
    const d = normPhone(p);
    if (d.length === 11) return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
    if (d.length === 10) return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
    return p;
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow">
              <Copy className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="font-bold text-slate-900">중복 회원 정리</div>
              <div className="text-xs text-gray-500">
                {groups.length}개 그룹 · 중복 후보 {totalDupMembers}명 · 삭제 예정 {totalToDelete}명
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        {/* 매칭 방식 선택 */}
        <div className="px-5 py-3 border-b border-gray-100 bg-slate-50 flex flex-wrap items-center gap-3">
          <div className="text-xs text-gray-600 font-semibold">매칭 기준:</div>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" checked={strategy === "loose"} onChange={() => setStrategy("loose")} />
            <span>이름 + 전화 <b>뒤 4자리</b> <span className="text-xs text-gray-500">(권장)</span></span>
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" checked={strategy === "strict"} onChange={() => setStrategy("strict")} />
            <span>이름 + 전화 <b>완전 일치</b> <span className="text-xs text-gray-500">(엄격)</span></span>
          </label>
          <div className="ml-auto flex items-center gap-1 text-xs text-orange-700 bg-orange-100 px-2 py-1 rounded-full">
            <AlertTriangle className="w-3.5 h-3.5" />
            초기 선택: 첫 번째(정보 많은) 회원 제외
          </div>
        </div>

        {/* 그룹 목록 */}
        <div className="flex-1 overflow-y-auto p-4">
          {groups.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <CheckSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <div className="text-sm">✨ 이 기준으로는 중복 회원이 발견되지 않았습니다</div>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map(g => {
                const keepCount = g.entries.filter((m: any) => !checked[m.id]).length;
                const delCount = g.entries.filter((m: any) => checked[m.id]).length;
                return (
                  <div key={g.key} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{g.name}</span>
                        <span className="text-xs text-gray-500">({g.entries.length}건 중복)</span>
                        <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-semibold">유지 {keepCount}</span>
                        <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-semibold">삭제 {delCount}</span>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => selectAllInGroup(g, false)}
                          className="text-[10px] px-2 py-1 bg-white border border-gray-200 rounded hover:bg-green-50 hover:border-green-300">
                          모두 유지
                        </button>
                        <button onClick={() => selectAllInGroup(g, true)}
                          className="text-[10px] px-2 py-1 bg-white border border-gray-200 rounded hover:bg-red-50 hover:border-red-300">
                          첫 항목만 유지
                        </button>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {g.entries.map((m: any, idx: number) => {
                        const isChecked = !!checked[m.id];
                        return (
                          <div key={m.id}
                            className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition ${
                              isChecked ? "bg-red-50 hover:bg-red-100" : idx === 0 ? "bg-green-50/50 hover:bg-green-50" : "hover:bg-slate-50"
                            }`}
                            onClick={() => toggle(m.id)}>
                            <div className="flex-shrink-0">
                              {isChecked ? <CheckSquare className="w-5 h-5 text-red-500" /> : <Square className="w-5 h-5 text-gray-400" />}
                            </div>
                            <div className="flex-1 grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
                              <div>
                                <div className="text-[10px] text-gray-400">구분·상태</div>
                                <div className="font-semibold">
                                  <span className={`px-1.5 py-0.5 rounded ${m.member_type === "child" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                                    {m.member_type === "child" ? "아동" : "성인"}
                                  </span>
                                  {idx === 0 && !isChecked && <span className="ml-1 text-[9px] text-green-700 font-bold">✓ 원본</span>}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] text-gray-400">보호자</div>
                                <div className="truncate">{m.guardian_name || "-"}</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-gray-400">전화</div>
                                <div className="font-mono text-[11px]">{fmtPhone(m.phone || m.guardian_phone)}</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-gray-400">진단명</div>
                                <div className="truncate">{m.extra?.diagnosis || "-"}</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-gray-400">등록일</div>
                                <div>{m.created_at ? new Date(m.created_at).toLocaleDateString("ko-KR") : "-"}</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-gray-400">상태</div>
                                <div>{m.status || "-"}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 하단 액션 */}
        <div className="px-5 py-3 border-t border-gray-100 bg-white flex items-center justify-between">
          <div className="text-sm">
            <span className="text-red-600 font-bold">{totalToDelete}명</span>
            <span className="text-gray-500"> 삭제 예정</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">취소</button>
            <button onClick={executeDelete} disabled={deleting || totalToDelete === 0}
              className="px-5 py-2 bg-gradient-to-br from-red-500 to-rose-600 text-white rounded-lg text-sm font-bold shadow hover:opacity-90 disabled:opacity-40 flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> {deleting ? "삭제 중..." : `${totalToDelete}명 삭제`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
