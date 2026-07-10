"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Waves, ChevronRight, Plus, X, Save, UserPlus } from "lucide-react";

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
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "child" | "adult">("all");
  const [query, setQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newMember, setNewMember] = useState<any>({
    member_type: "child",
    name: "",
    birth: "",
    gender: "",
    phone: "",
    guardian_name: "",
    guardian_relation: "모",
    address: "",
    diagnosis: "",
    special_notes: "",
    pain_area: "",
    pain_scale: 0,
    medical_history: "",
    source: "검색",
    status: "waiting",
  });

  useEffect(() => { loadMembers(); }, []);

  async function loadMembers() {
    setLoading(true);
    const { data, error } = await supabase.from("members").select("*").order("name", { ascending: true });
    if (!error && data) setMembers(data as Member[]);
    setLoading(false);
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
        // Reset form
        setNewMember({
          member_type: "child", name: "", birth: "", gender: "", phone: "",
          guardian_name: "", guardian_relation: "모", address: "",
          diagnosis: "", special_notes: "", pain_area: "", pain_scale: 0,
          medical_history: "", source: "검색", status: "waiting",
        });
        // 새 회원 상세로 이동
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
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-aqu-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-aqu-700"
          >
            <UserPlus className="w-4 h-4" /> 신규 회원
          </button>
          <Link href="/" className="text-sm text-aqu-600 hover:underline">← 홈</Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-4">
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
                  <th className="text-left px-4 py-3">상태</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}
                    className="border-t border-aqu-100 hover:bg-aqu-50/50 cursor-pointer"
                    onClick={() => router.push(`/members/${m.id}`)}>
                    <td className="px-4 py-3 font-medium text-aqu-900">{m.name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${m.member_type === "child" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                        {m.member_type === "child" ? "아동" : "성인"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{m.guardian_name || "-"}</td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{m.phone || "-"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">{m.extra?.diagnosis || "-"}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">{m.status || "regular"}</span>
                    </td>
                    <td className="px-2 py-3 text-gray-400"><ChevronRight className="w-4 h-4" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-400 text-right">
        총 {filtered.length}명 · 이름 클릭하여 상세보기 · <b>🆕 신규 회원</b> 버튼으로 추가
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl p-5 md:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-aqu-900 flex items-center gap-1">
                <UserPlus className="w-5 h-5" /> 신규 회원 등록
              </h3>
              <button onClick={() => setShowAddModal(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            {/* 아동/성인 선택 */}
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
              <Field label="이름 *" value={newMember.name} onChange={(v) => setNewMember({ ...newMember, name: v })} placeholder="김철수" />
              <Field label="연락처" value={newMember.phone} onChange={(v) => setNewMember({ ...newMember, phone: v })} placeholder="010-1234-5678" />
              <Field label="생년월일" type="date" value={newMember.birth} onChange={(v) => setNewMember({ ...newMember, birth: v })} />

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

            {/* 아동 전용 */}
            {newMember.member_type === "child" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <Field label="보호자 성함" value={newMember.guardian_name} onChange={(v) => setNewMember({ ...newMember, guardian_name: v })} placeholder="김보호" />
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
              <Field label="주소" value={newMember.address} onChange={(v) => setNewMember({ ...newMember, address: v })} placeholder="서울시 송파구..." />
            </div>

            <div className="mt-3">
              <Field label="진단명" value={newMember.diagnosis} onChange={(v) => setNewMember({ ...newMember, diagnosis: v })} placeholder="자폐성장애 / 뇌병변 / 없음 등" />
            </div>

            {/* 아동: 특이사항 / 성인: 통증정보 */}
            {newMember.member_type === "child" ? (
              <div className="mt-3">
                <label className="text-xs text-gray-600">특이사항</label>
                <textarea value={newMember.special_notes} onChange={(e) => setNewMember({ ...newMember, special_notes: e.target.value })}
                  rows={2} className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm"
                  placeholder="발달 상태 · 주의사항 등" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <Field label="통증 부위" value={newMember.pain_area} onChange={(v) => setNewMember({ ...newMember, pain_area: v })} placeholder="목·허리·무릎" />
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
                  <option value="waiting">⏳ 대기중</option>
                  <option value="trial_scheduled">📅 체험예정</option>
                  <option value="trial_done">✅ 체험완료</option>
                  <option value="regular">🎯 정규등록</option>
                  <option value="paused">⏸️ 보류</option>
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
