"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import MemberSearch from "@/components/MemberSearch";
import { supabase } from "@/lib/supabase";
import {
  FileText, Upload, Download, Trash2, Home, Search,
  Receipt, FileCheck, Image as ImageIcon, FileQuestion,
  Filter, User
} from "lucide-react";

// ✅ v3.20.0: 소유자 유형 (회원/직원/센터)
const OWNER_TYPES = [
  { value: "member", label: "👥 회원 서류",     desc: "영수증·계약서·진단서 등" },
  { value: "staff",  label: "👨‍💼 직원 서류",     desc: "근로계약·러보프유·자격증" },
  { value: "center", label: "🏢 센터 서류",       desc: "사업자등록증·임대차·보험" },
];

const CATEGORIES = [
  // 회원
  { value: "receipt",         label: "🧾 영수증",       icon: Receipt,      owner: "member" },
  { value: "contract",        label: "📝 계약서",       icon: FileCheck,    owner: "member" },
  { value: "consent",         label: "✅ 동의서",         icon: FileCheck,    owner: "member" },
  { value: "diagnosis",       label: "🏥 진단서",       icon: FileText,     owner: "member" },
  { value: "photo",           label: "📷 사진",           icon: ImageIcon,    owner: "member" },
  // 직원
  { value: "staff_contract",  label: "📄 근로계약서",   icon: FileCheck,    owner: "staff" },
  { value: "staff_id",        label: "🆔 신분증",         icon: FileText,     owner: "staff" },
  { value: "staff_bank",      label: "🏦 통장사본",       icon: FileText,     owner: "staff" },
  { value: "staff_license",   label: "📜 자격증",         icon: FileCheck,    owner: "staff" },
  { value: "staff_resume",    label: "📝 이력서",         icon: FileText,     owner: "staff" },
  // 센터
  { value: "business_reg",    label: "🏢 사업자등록증", icon: FileCheck,    owner: "center" },
  { value: "lease",           label: "🔑 임대차계약서",   icon: FileCheck,    owner: "center" },
  { value: "insurance",       label: "🛡️ 보험증마",       icon: FileText,     owner: "center" },
  { value: "license_center",  label: "📜 운영허가증",     icon: FileCheck,    owner: "center" },
  // 공통
  { value: "other",           label: "📎 기타",           icon: FileQuestion, owner: null },
];

function catLabel(cat: string) {
  return CATEGORIES.find(c => c.value === cat)?.label || cat;
}

export default function DocumentsPage() {
  const [docs, setDocs]         = useState<any[]>([]);
  const [members, setMembers]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);

  // Filters
  // ✅ v3.20.0: 소유자 유형 필터 (member/staff/center) 추가
  const [ownerType, setOwnerType]       = useState<string>("member");
  const [filterCat, setFilterCat]       = useState("");
  const [filterMember, setFilterMember] = useState("");
  const [search, setSearch]             = useState("");

  // ✅ v3.18.1: 마운트 후 URL 쿼리를 직접 파싱해서 분류 자동 적용
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const cat = params.get("tab") || params.get("cat") || "";
      if (cat) setFilterCat(cat);
    }
  }, []);

  // Upload form
  const [showUpload, setShowUpload]   = useState(false);
  const [upMember, setUpMember]       = useState("");
  const [upStaff, setUpStaff]         = useState("");
  const [upOwnerType, setUpOwnerType] = useState<string>("member");
  const [upCat, setUpCat]             = useState("receipt");
  const [upDesc, setUpDesc]           = useState("");
  // ✅ v3.20.0: 직원 목록
  const [staffList, setStaffList]     = useState<any[]>([]);
  const fileInputRef                  = useRef<HTMLInputElement>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [docsRes, membersRes] = await Promise.all([
      supabase.from("documents").select("*").order("created_at", { ascending: false }),
      supabase.from("members").select("id, name, member_type").is("deleted_at", null).order("name"),
    ]);
    setDocs(docsRes.data || []);
    setMembers(membersRes.data || []);
    setLoading(false);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // ✅ v3.20.0: 소유자 유형별 관련 필수값 체크
    if (upOwnerType === "member" && !upMember) {
      alert("먼저 회원을 선택하세요");
      return;
    }
    if (upOwnerType === "staff" && !upStaff) {
      alert("먼저 직원을 선택하세요");
      return;
    }
    setUploading(true);

    try {
      const orgId = members[0]?.org_id || (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      // v3.20.30: 공용 업로드 유틸리티 - sanitize + 재시도 + RLS/버킷 오류 명확화
      const ownerKey = upOwnerType === "staff" ? `staff/${upStaff || "unknown"}` : upOwnerType === "center" ? `center` : `member/${upMember}`;
      const { uploadToStorage } = await import("@/lib/storageUpload");
      const { filePath } = await uploadToStorage("documents", ownerKey, file);

      // Insert metadata
      const { error: dbErr } = await supabase.from("documents").insert({
        org_id: orgId,
        member_id: upMember,
        category: upCat,
        filename: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
        description: upDesc || null,
      });
      if (dbErr) throw dbErr;

      alert("✅ 업로드 완료!");
      setShowUpload(false);
      setUpDesc("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadAll();
    } catch (err: any) {
      alert("업로드 실패: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function downloadDoc(d: any) {
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(d.file_path, 60);
    if (error) {
      alert("다운로드 실패: " + error.message);
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function deleteDoc(d: any) {
    if (!confirm(`"${d.filename}" 파일을 삭제하시겠습니까?`)) return;
    await supabase.storage.from("documents").remove([d.file_path]);
    await supabase.from("documents").delete().eq("id", d.id);
    await loadAll();
  }

  // Filtered docs
  const filtered = docs.filter(d => {
    // ✅ v3.20.0: 소유자 유형 필터
    if (ownerType) {
      const catMeta = CATEGORIES.find(c => c.value === d.category);
      const docOwner = d.owner_type || catMeta?.owner || "member";
      if (docOwner !== ownerType && d.category !== "other") return false;
    }
    if (filterCat && d.category !== filterCat) return false;
    if (filterMember && d.member_id !== filterMember) return false;
    if (search && !d.filename.toLowerCase().includes(search.toLowerCase()) &&
        !(d.description || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function memberName(id: string) {
    return members.find(m => m.id === id)?.name || "알 수 없음";
  }

  function humanSize(bytes: number) {
    if (!bytes) return "-";
    if (bytes < 1024) return bytes + "B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "KB";
    return (bytes / 1024 / 1024).toFixed(1) + "MB";
  }

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <HomeButton />
          <span className="text-gray-300">/</span>
          <h1 className="text-2xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
            <FileText className="w-7 h-7 text-orange-500" /> 문서관리
          </h1>
        </div>
        <button onClick={() => setShowUpload(true)}
          className="bg-aqu-600 hover:bg-aqu-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 shadow-sm">
          <Upload className="w-4 h-4" /> 파일 업로드
        </button>
      </div>

      {/* ✅ v3.20.0: 소유자 유형 탭 (회원/직원/센터) */}
      <div className="flex gap-1 mb-4 border-b border-aqu-100">
        {OWNER_TYPES.map(o => {
          const cnt = docs.filter(d => {
            const cm = CATEGORIES.find(c => c.value === d.category);
            const own = d.owner_type || cm?.owner || "member";
            return own === o.value;
          }).length;
          return (
            <button key={o.value} onClick={() => { setOwnerType(o.value); setFilterCat(""); }}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${ownerType === o.value ? "text-aqu-700 border-aqu-500 bg-aqu-50/40" : "text-gray-500 border-transparent hover:text-aqu-600"}`}>
              {o.label}
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full">{cnt}</span>
              <div className="text-[10px] text-gray-400 font-normal">{o.desc}</div>
            </button>
          );
        })}
      </div>

      {/* KPI – 현재 탭의 카테고리만 */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        <KPI title="전체 문서" val={docs.length + "개"} color="text-aqu-600" />
        {CATEGORIES.filter(c => c.owner === ownerType || c.owner === null).map(c => (
          <KPI key={c.value} title={c.label}
            val={docs.filter(d => d.category === c.value).length + "개"}
            color="text-gray-600" />
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-aqu-100 p-3 md:p-4 mb-4 flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-gray-400" />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
          <option value="">전체 카테고리</option>
          {/* ✅ v3.20.0: 현재 소유자 유형에 해당하는 카테고리만 */}
          {CATEGORIES.filter(c => c.owner === ownerType || c.owner === null).map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        {/* ✅ v3.14.1: 이름·전화 검색 가능한 콤보박스 */}
        <MemberFilterCombo
          members={members}
          value={filterMember}
          onChange={setFilterMember}
        />
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="파일명 · 설명 검색"
            className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
        </div>
      </div>

      {/* Documents List */}
      {loading ? (
        <div className="text-center py-10 text-gray-500">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-aqu-100">
          <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>문서가 없습니다. "파일 업로드" 버튼으로 추가하세요.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-aqu-50 border-b border-aqu-100">
              <tr>
                <th className="p-3 text-left font-semibold text-aqu-800">카테고리</th>
                <th className="p-3 text-left font-semibold text-aqu-800">파일명</th>
                <th className="p-3 text-left font-semibold text-aqu-800 hidden md:table-cell">회원</th>
                <th className="p-3 text-left font-semibold text-aqu-800 hidden md:table-cell">설명</th>
                <th className="p-3 text-left font-semibold text-aqu-800 hidden lg:table-cell">크기</th>
                <th className="p-3 text-left font-semibold text-aqu-800 hidden lg:table-cell">업로드일</th>
                <th className="p-3 text-center font-semibold text-aqu-800">작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} className="border-b border-gray-100 hover:bg-aqu-50/30">
                  <td className="p-3 text-xs">
                    <span className="px-2 py-1 rounded-md bg-aqu-100 text-aqu-800 whitespace-nowrap">
                      {catLabel(d.category)}
                    </span>
                  </td>
                  <td className="p-3 text-gray-800 font-medium max-w-[200px] truncate">{d.filename}</td>
                  <td className="p-3 hidden md:table-cell">
                    <Link href={`/members/${d.member_id}`}
                      className="text-aqu-600 hover:underline flex items-center gap-1">
                      <User className="w-3 h-3" /> {memberName(d.member_id)}
                    </Link>
                  </td>
                  <td className="p-3 text-gray-500 text-xs hidden md:table-cell max-w-[200px] truncate">
                    {d.description || "-"}
                  </td>
                  <td className="p-3 text-gray-500 text-xs hidden lg:table-cell">{humanSize(d.file_size)}</td>
                  <td className="p-3 text-gray-500 text-xs hidden lg:table-cell">
                    {new Date(d.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => downloadDoc(d)}
                        className="p-1.5 text-aqu-600 hover:bg-aqu-100 rounded" title="다운로드">
                        <Download className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteDoc(d)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="삭제">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !uploading && setShowUpload(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-aqu-900 mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5" /> 파일 업로드
            </h2>

            {/* ✅ v3.20.0: 소유자 유형 선택 (회원/직원/센터) */}
            <label className="block text-xs font-semibold text-gray-600 mb-1">서류 구분 *</label>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {OWNER_TYPES.map(o => (
                <button key={o.value} type="button"
                  onClick={() => {
                    setUpOwnerType(o.value);
                    // 해당 유형의 첫 카테고리로 자동 설정
                    const firstCat = CATEGORIES.find(c => c.owner === o.value);
                    if (firstCat) setUpCat(firstCat.value);
                  }}
                  className={`px-2 py-2 rounded-lg text-xs font-semibold border-2 transition ${upOwnerType === o.value ? "bg-aqu-500 text-white border-aqu-500" : "bg-white text-gray-600 border-gray-200 hover:border-aqu-300"}`}>
                  {o.label}
                </button>
              ))}
            </div>

            {/* 회원 서류 → 회원 선택 */}
            {upOwnerType === "member" && (
              <>
                <label className="block text-xs font-semibold text-gray-600 mb-1">회원 (필수)</label>
                <div className="mb-3">
                  <MemberSearch members={members} value={upMember} onChange={setUpMember} />
                </div>
              </>
            )}

            {/* 직원 서류 → 직원 선택 */}
            {upOwnerType === "staff" && (
              <>
                <label className="block text-xs font-semibold text-gray-600 mb-1">직원 (필수)</label>
                <select value={upStaff} onChange={e => setUpStaff(e.target.value)}
                  className="w-full mb-3 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                  <option value="">-- 직원 선택 --</option>
                  {staffList.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role || "직원"})</option>
                  ))}
                </select>
              </>
            )}

            {upOwnerType === "center" && (
              <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-700">
                🏢 센터 서류는 회원·직원 구분 없이 공통 보관됩니다 (사업자등록증·임대차 계약 등)
              </div>
            )}

            <label className="block text-xs font-semibold text-gray-600 mb-1">카테고리</label>
            <select value={upCat} onChange={e => setUpCat(e.target.value)}
              className="w-full mb-3 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
              {CATEGORIES.filter(c => c.owner === upOwnerType || c.owner === null).map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>

            <label className="block text-xs font-semibold text-gray-600 mb-1">설명 (선택)</label>
            <input type="text" value={upDesc} onChange={e => setUpDesc(e.target.value)}
              placeholder="예: 2026-07 월결제 영수증"
              className="w-full mb-4 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />

            <label className="block text-xs font-semibold text-gray-600 mb-1">파일 선택</label>
            <input ref={fileInputRef} type="file" onChange={handleUpload}
              disabled={uploading || (upOwnerType === "member" && !upMember) || (upOwnerType === "staff" && !upStaff)}
              className="w-full mb-4 text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-aqu-600 file:text-white file:hover:bg-aqu-700 file:cursor-pointer disabled:opacity-50" />

            <div className="flex gap-2">
              <button onClick={() => setShowUpload(false)} disabled={uploading}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                {uploading ? "업로드 중..." : "닫기"}
              </button>
            </div>

            {uploading && (
              <div className="mt-3 text-center text-sm text-aqu-600">
                📤 업로드 진행 중...
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function KPI({ title, val, color }: any) {
  return (
    <div className="bg-white p-3 rounded-xl shadow-sm border border-aqu-100">
      <div className="text-xs text-gray-500">{title}</div>
      <div className={`text-lg md:text-xl font-bold ${color || "text-aqu-900"}`}>{val}</div>
    </div>
  );
}

/* ✅ v3.14.1: 이름/전화 검색 가능한 회원 필터 콤보박스 */
function MemberFilterCombo({ members, value, onChange }: any) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = members.find((m: any) => m.id === value);

  const filtered = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return members.slice(0, 100);
    const digits = q.replace(/\D/g, "");
    return members
      .filter((m: any) => {
        if (m.name.toLowerCase().includes(q)) return true;
        if (digits && m.phone) {
          const p = m.phone.replace(/\D/g, "");
          if (p.includes(digits)) return true;
        }
        return false;
      })
      .slice(0, 100);
  })();

  return (
    <div className="relative min-w-[200px]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white hover:border-aqu-400"
      >
        <span className={selected ? "text-gray-900" : "text-gray-500"}>
          {selected ? `${selected.name} (${selected.member_type === "child" ? "아동" : "성인"})` : "전체 회원"}
        </span>
        <span className="text-[10px] text-gray-400">▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => { setOpen(false); setQuery(""); }} />
          <div className="absolute z-40 mt-1 w-full min-w-[260px] bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col">
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="이름 또는 전화번호 뒷자리..."
                  className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-aqu-500"
                />
              </div>
            </div>
            <div className="overflow-y-auto">
              <button
                onClick={() => { onChange(""); setOpen(false); setQuery(""); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-aqu-50 border-b border-gray-100 ${!value ? "bg-aqu-50 font-semibold text-aqu-700" : ""}`}
              >📂 전체 회원</button>
              {filtered.map((m: any) => (
                <button
                  key={m.id}
                  onClick={() => { onChange(m.id); setOpen(false); setQuery(""); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-aqu-50 flex items-center gap-2 ${value === m.id ? "bg-aqu-50 font-semibold text-aqu-700" : ""}`}
                >
                  <span className="text-xs">{m.member_type === "child" ? "🧒" : "👤"}</span>
                  <span className="flex-1 truncate">{m.name}</span>
                  {m.phone && <span className="text-[10px] text-gray-500 font-mono">{m.phone.slice(-4)}</span>}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-xs text-gray-400 text-center">검색 결과 없음</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
