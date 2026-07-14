"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import {
  Search, Waves, ChevronRight, Plus, X, Save, UserPlus, MessageSquare
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
  { key: "waiting", label: "⏳ 대기중", bgColor: "bg-yellow-100", textColor: "text-yellow-700" },
  { key: "trial_scheduled", label: "📅 체험예정", bgColor: "bg-blue-100", textColor: "text-blue-700" },
  { key: "trial_done", label: "✅ 체험완료", bgColor: "bg-purple-100", textColor: "text-purple-700" },
  { key: "regular", label: "🎯 정규등록", bgColor: "bg-green-100", textColor: "text-green-700" },
  { key: "paused", label: "⏸️ 보류", bgColor: "bg-gray-100", textColor: "text-gray-700" },
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
  const [saving, setSaving] = useState(false);

  // 메모 편집 모달
  const [memoMember, setMemoMember] = useState<Member | null>(null);
  const [memoText, setMemoText] = useState("");
  const [memoSaving, setMemoSaving] = useState(false);

  // 상태 드롭다운 열림 여부
  const [openStatusId, setOpenStatusId] = useState<string | null>(null);
  const [inboxPending, setInboxPending] = useState(0);

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
  }, []);

  async function loadMembers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (!error && data) setMembers(data as Member[]);
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

  async function addMember() {
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
        router.push(`/members/${data.id}`);
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
                  <th className="text-left px-4 py-3">이름</th>
                  <th className="text-left px-4 py-3">구분</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">보호자</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">연락처</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">진단명</th>
                  <th className="text-left px-4 py-3">상태 (클릭변경)</th>
                  <th className="text-center px-2 py-3">메모</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const statusInfo = getStatusInfo(m.status);
                  return (
                    <tr key={m.id} className="border-t border-aqu-100 hover:bg-aqu-50/50">
                      <td className="px-4 py-3 font-medium text-aqu-900 cursor-pointer"
                        onClick={() => router.push(`/members/${m.id}`)}>
                        {m.name}
                      </td>
                      <td className="px-4 py-3 cursor-pointer"
                        onClick={() => router.push(`/members/${m.id}`)}>
                        <span className={`px-2 py-0.5 rounded text-xs ${m.member_type === "child" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                          {m.member_type === "child" ? "아동" : "성인"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell cursor-pointer"
                        onClick={() => router.push(`/members/${m.id}`)}>
                        {m.guardian_name || "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell cursor-pointer"
                        onClick={() => router.push(`/members/${m.id}`)}>
                        {m.phone || "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell cursor-pointer"
                        onClick={() => router.push(`/members/${m.id}`)}>
                        {m.extra?.diagnosis || "-"}
                      </td>
                      {/* 상태 드롭다운 */}
                      <td className="px-4 py-3 relative">
                        <button
                          onClick={() => setOpenStatusId(openStatusId === m.id ? null : m.id)}
                          className={`px-2 py-1 rounded text-xs ${statusInfo.bgColor} ${statusInfo.textColor} hover:opacity-80 flex items-center gap-1`}
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
              <button onClick={() => setShowAddModal(false)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
                취소
              </button>
              <button onClick={addMember} disabled={!newMember.name || saving}
                className="flex-1 py-2.5 bg-aqu-600 text-white rounded-lg text-sm font-medium hover:bg-aqu-700 disabled:bg-gray-300 flex items-center justify-center gap-1">
                <Save className="w-4 h-4" /> {saving ? "저장중..." : "저장 후 상세보기"}
              </button>
            </div>
          </div>
        </div>
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
