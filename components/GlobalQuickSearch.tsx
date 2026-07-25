"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Search, X, User, Phone } from "lucide-react";

/**
 * v3.19.0: 글로벌 Quick Search (로컬 캐시 방식)
 * - 모달 첫 오픈 시 전체 회원 리스트를 한 번 가져와 클라이언트에서 즉시 필터링
 * - .or() 문법 이스케이프 이슈, RLS/브랜치 필터 이슈를 원천 차단
 * - Ctrl+K / Cmd+K 단축키
 */
export default function GlobalQuickSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [allMembers, setAllMembers] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Ctrl+K / Cmd+K 단축키
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // 모달 열릴 때 전체 회원 로드 (최초 1회만)
  useEffect(() => {
    if (!open || loaded) return;
    (async () => {
      setLoading(true);
      setErrorMsg("");
      const { data, error } = await supabase
        .from("members")
        .select("id, name, phone, member_type, guardian_name, birth_date, status")
        .order("created_at", { ascending: false });
      if (error) {
        setErrorMsg(`회원 로드 실패: ${error.message}`);
        setAllMembers([]);
      } else {
        setAllMembers(data || []);
      }
      setLoaded(true);
      setLoading(false);
    })();
  }, [open, loaded]);

  // 클라이언트 필터링
  const kw = q.trim().toLowerCase();
  const digits = kw.replace(/\D/g, "");
  const filtered = !kw ? [] : allMembers.filter((m: any) => {
    const nameHit = (m.name || "").toLowerCase().includes(kw);
    const phoneHit = digits.length >= 2 && (m.phone || "").replace(/-/g, "").includes(digits);
    const gHit = (m.guardian_name || "").toLowerCase().includes(kw);
    return nameHit || phoneHit || gHit;
  }).slice(0, 30);

  return (
    <>
      {/* 검색 버튼 (상단 헤더에 노출) */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/80 backdrop-blur border border-aqu-200 hover:border-aqu-400 hover:shadow-sm transition text-sm text-gray-500 min-w-[180px]"
      >
        <Search className="w-4 h-4 text-aqu-500" />
        <span>회원·연락처 검색</span>
        <kbd className="ml-auto text-[10px] px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200 text-gray-500">Ctrl+K</kbd>
      </button>

      {/* 모달 */}
      {open && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-start justify-center pt-[10vh] p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-aqu-50 to-cyan-50">
              <Search className="w-5 h-5 text-aqu-600" />
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="회원명 · 전화번호 · 보호자명"
                className="flex-1 bg-transparent outline-none text-sm"
              />
              {loaded && !loading && (
                <span className="text-[10px] text-gray-400">{allMembers.length}명 로드됨</span>
              )}
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/50 rounded">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {errorMsg ? (
                <div className="p-6 text-center text-sm text-red-500">
                  ⚠️ {errorMsg}<br/>
                  <span className="text-xs text-gray-500 mt-2 block">Supabase 로그인 상태를 확인해 주세요</span>
                </div>
              ) : loading ? (
                <div className="p-6 text-center text-sm text-gray-400">회원 목록 로드 중...</div>
              ) : !q.trim() ? (
                <div className="p-8 text-center text-sm text-gray-400">
                  🔍 회원명 또는 전화번호를 입력하세요<br/>
                  <span className="text-xs">Ctrl+K로 언제든 열 수 있어요</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">일치하는 회원이 없습니다</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filtered.map(m => (
                    <Link
                      key={m.id}
                      href={`/members/${m.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-aqu-50/50 transition"
                    >
                      <span className="w-8 h-8 rounded-full bg-aqu-100 flex items-center justify-center text-lg">
                        {m.member_type === "child" ? "🧒" : "👤"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                          <User className="w-3 h-3 text-gray-400" /> {m.name}
                          {m.guardian_name && <span className="text-xs text-gray-500">· 보호자 {m.guardian_name}</span>}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                          {m.phone && (<><Phone className="w-3 h-3" />{m.phone}</>)}
                          {m.birth_date && <span className="ml-2">🎂 {m.birth_date}</span>}
                        </div>
                      </div>
                      <span className="text-xs text-aqu-600">→</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-[10px] text-gray-500 flex items-center justify-between">
              <span>💡 결과 클릭 시 회원 상세 페이지로 이동</span>
              <span>ESC 닫기</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
