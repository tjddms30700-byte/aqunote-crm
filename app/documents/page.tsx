"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { supabase } from "@/lib/supabase";
import {
  FileText, Upload, Download, Trash2, Home, Search,
  Receipt, FileCheck, Image as ImageIcon, FileQuestion,
  Filter, User
} from "lucide-react";

const CATEGORIES = [
  { value: "receipt",   label: "🧾 영수증",   icon: Receipt },
  { value: "contract",  label: "📝 계약서",   icon: FileCheck },
  { value: "diagnosis", label: "🏥 진단서",   icon: FileText },
  { value: "photo",     label: "📷 사진",     icon: ImageIcon },
  { value: "other",     label: "📎 기타",     icon: FileQuestion },
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
  const [filterCat, setFilterCat]       = useState("");
  const [filterMember, setFilterMember] = useState("");
  const [search, setSearch]             = useState("");

  // Upload form
  const [showUpload, setShowUpload]   = useState(false);
  const [upMember, setUpMember]       = useState("");
  const [upCat, setUpCat]             = useState("receipt");
  const [upDesc, setUpDesc]           = useState("");
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
    if (!upMember) {
      alert("먼저 회원을 선택하세요");
      return;
    }
    setUploading(true);

    try {
      const orgId = members[0]?.org_id || (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_가-힣]/g, "_");
      const filePath = `${upMember}/${Date.now()}_${safeName}`;

      // Upload to Storage
      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(filePath, file, { upsert: false });
      if (upErr) throw upErr;

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

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KPI title="전체 문서" val={docs.length + "개"} color="text-aqu-600" />
        {CATEGORIES.map(c => (
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
          {CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <select value={filterMember} onChange={e => setFilterMember(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
          <option value="">전체 회원</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.member_type === "child" ? "아동" : "성인"})
            </option>
          ))}
        </select>
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

            <label className="block text-xs font-semibold text-gray-600 mb-1">회원 (필수)</label>
            <select value={upMember} onChange={e => setUpMember(e.target.value)}
              className="w-full mb-3 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
              <option value="">-- 회원 선택 --</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.member_type === "child" ? "아동" : "성인"})
                </option>
              ))}
            </select>

            <label className="block text-xs font-semibold text-gray-600 mb-1">카테고리</label>
            <select value={upCat} onChange={e => setUpCat(e.target.value)}
              className="w-full mb-3 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>

            <label className="block text-xs font-semibold text-gray-600 mb-1">설명 (선택)</label>
            <input type="text" value={upDesc} onChange={e => setUpDesc(e.target.value)}
              placeholder="예: 2026-07 월결제 영수증"
              className="w-full mb-4 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />

            <label className="block text-xs font-semibold text-gray-600 mb-1">파일 선택</label>
            <input ref={fileInputRef} type="file" onChange={handleUpload} disabled={uploading || !upMember}
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
