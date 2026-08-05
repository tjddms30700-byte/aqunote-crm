"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import HomeButton from "@/components/HomeButton";
import { MessageSquare, Plus, X, Pin, Trash2, Eye } from "lucide-react";

const CATEGORIES = [
  { v: "notice",     label: "📢 공지",   color: "bg-red-100 text-red-700" },
  { v: "general",    label: "💬 일반",   color: "bg-blue-100 text-blue-700" },
  { v: "qna",        label: "❓ Q&A",   color: "bg-purple-100 text-purple-700" },
  { v: "suggestion", label: "💡 건의",   color: "bg-yellow-100 text-yellow-700" },
];

export default function BoardPage() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("");
  const [showModal, setShowModal] = useState(false);
  const [viewing, setViewing] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [staff, setStaff] = useState<any[]>([]);

  const [form, setForm] = useState<any>({
    category: "general", title: "", content: "", author_name: "",
    is_pinned: false,
  });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [pRes, sRes] = await Promise.all([
      supabase.from("posts").select("*").order("is_pinned", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("staff").select("id, name"),
    ]);
    setPosts(pRes.data || []);
    setStaff(sRes.data || []);
    setLoading(false);
  }

  async function submitPost() {
    if (!form.title.trim()) return;
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    await supabase.from("posts").insert({
      org_id: orgId,
      category: form.category,
      title: form.title,
      content: form.content,
      author_name: form.author_name || "익명",
      is_pinned: form.is_pinned,
    });
    setShowModal(false);
    setForm({ category: "general", title: "", content: "", author_name: "", is_pinned: false });
    await loadAll();
  }

  async function deletePost(id: string) {
    if (!confirm("삭제할까요?")) return;
    await supabase.from("posts").delete().eq("id", id);
    if (viewing?.id === id) setViewing(null);
    await loadAll();
  }

  async function togglePin(p: any) {
    await supabase.from("posts").update({ is_pinned: !p.is_pinned }).eq("id", p.id);
    await loadAll();
  }

  async function openPost(p: any) {
    // view count 증가
    await supabase.from("posts").update({ view_count: (p.view_count || 0) + 1 }).eq("id", p.id);
    setViewing(p);
    // 댓글 로드
    const { data } = await supabase.from("post_comments").select("*")
      .eq("post_id", p.id).order("created_at");
    setComments(data || []);
    await loadAll();
  }

  async function addComment() {
    if (!newComment.trim() || !viewing) return;
    await supabase.from("post_comments").insert({
      post_id: viewing.id, author_name: form.author_name || "익명", content: newComment,
    });
    setNewComment("");
    const { data } = await supabase.from("post_comments").select("*")
      .eq("post_id", viewing.id).order("created_at");
    setComments(data || []);
  }

  const filtered = category ? posts.filter(p => p.category === category) : posts;

  return (
    <main className="max-w-5xl mx-auto px-3 md:px-6 py-6 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
          <MessageSquare className="w-6 h-6 md:w-7 md:h-7 text-indigo-500" /> 사내 게시판
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setShowModal(true)}
            className="bg-aqu-600 hover:bg-aqu-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1">
            <Plus className="w-4 h-4" /> 새 글
          </button>
          <HomeButton />
        </div>
      </div>

      {/* 카테고리 필터 */}
      <div className="flex flex-wrap gap-1 mb-4">
        <button onClick={() => setCategory("")}
          className={`px-3 py-1.5 rounded-lg text-xs border ${!category ? "bg-aqu-500 text-white border-transparent font-bold" : "bg-white border-gray-200"}`}>
          전체 ({posts.length})
        </button>
        {CATEGORIES.map(c => (
          <button key={c.v} onClick={() => setCategory(c.v)}
            className={`px-3 py-1.5 rounded-lg text-xs border ${category === c.v ? c.color + " border-transparent font-bold" : "bg-white border-gray-200"}`}>
            {c.label} ({posts.filter(p => p.category === c.v).length})
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-gray-500">로딩...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
            게시글이 없습니다
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map(p => {
              const c = CATEGORIES.find(x => x.v === p.category);
              return (
                <div key={p.id} className="p-3 md:p-4 hover:bg-aqu-50/30 cursor-pointer" onClick={() => openPost(p)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {p.is_pinned && <Pin className="w-3 h-3 text-red-500 fill-red-500" />}
                        <span className={`text-[10px] px-2 py-0.5 rounded ${c?.color}`}>{c?.label}</span>
                        <span className="text-xs text-gray-500">{p.author_name || "익명"}</span>
                        <span className="text-[10px] text-gray-400">{new Date(p.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="font-medium text-aqu-900 truncate">{p.title}</div>
                      {p.content && (
                        <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{p.content}</div>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 flex items-center gap-1">
                      <Eye className="w-3 h-3" /> {p.view_count || 0}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 새 글 작성 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-aqu-900">✏️ 새 글 작성</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">카테고리</label>
                <div className="grid grid-cols-4 gap-1">
                  {CATEGORIES.map(c => (
                    <button key={c.v} onClick={() => setForm({ ...form, category: c.v })}
                      className={`py-1.5 rounded text-xs border ${form.category === c.v ? c.color + " font-bold" : "bg-white border-gray-200"}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">작성자</label>
                <select value={form.author_name} onChange={e => setForm({ ...form, author_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="">-- 이름 선택 --</option>
                  {staff.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">제목 *</label>
                <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">내용</label>
                <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}
                  rows={6} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_pinned} onChange={e => setForm({ ...form, is_pinned: e.target.checked })} />
                📌 상단 고정
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">취소</button>
              <button onClick={submitPost} disabled={!form.title.trim()}
                className="flex-1 px-4 py-2 bg-aqu-600 hover:bg-aqu-700 text-white rounded-lg text-sm disabled:opacity-50">
                게시
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 게시글 보기 */}
      {viewing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {viewing.is_pinned && <Pin className="w-4 h-4 text-red-500 fill-red-500" />}
                <span className={`text-[10px] px-2 py-0.5 rounded ${CATEGORIES.find(c => c.v === viewing.category)?.color}`}>
                  {CATEGORIES.find(c => c.v === viewing.category)?.label}
                </span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => togglePin(viewing)}
                  className="text-xs p-1 hover:bg-gray-100 rounded" title={viewing.is_pinned ? "고정 해제" : "상단 고정"}>
                  <Pin className={`w-4 h-4 ${viewing.is_pinned ? "text-red-500 fill-red-500" : "text-gray-400"}`} />
                </button>
                <button onClick={() => deletePost(viewing.id)}
                  className="text-xs p-1 hover:bg-red-50 rounded">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
                <button onClick={() => setViewing(null)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
            </div>
            <h2 className="text-xl font-bold text-aqu-900 mb-2">{viewing.title}</h2>
            <div className="text-xs text-gray-500 mb-3 flex items-center gap-2">
              <span>👤 {viewing.author_name || "익명"}</span>
              <span>· {new Date(viewing.created_at).toLocaleString()}</span>
              <span>· 조회 {viewing.view_count || 0}</span>
            </div>
            <div className="prose prose-sm whitespace-pre-wrap text-gray-800 border-t border-b border-gray-100 py-4 mb-4">
              {viewing.content}
            </div>

            {/* 댓글 */}
            <div className="space-y-2 mb-3">
              <div className="text-xs font-semibold text-gray-700">💬 댓글 ({comments.length})</div>
              {comments.map(c => (
                <div key={c.id} className="p-2 bg-gray-50 rounded-lg text-xs">
                  <div className="font-medium text-aqu-800 mb-0.5">{c.author_name}</div>
                  <div className="text-gray-700">{c.content}</div>
                  <div className="text-[10px] text-gray-400 mt-1">{new Date(c.created_at).toLocaleString()}</div>
                </div>
              ))}
              <div className="flex gap-1 mt-2">
                <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addComment()}
                  placeholder="댓글 입력..."
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <button onClick={addComment}
                  className="px-3 py-2 bg-aqu-600 hover:bg-aqu-700 text-white rounded-lg text-sm">등록</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
