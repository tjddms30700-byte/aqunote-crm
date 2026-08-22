"use client";
/**
 * ═══════════════════════════════════════════════════════════════
 * 🔍 v3.46.3 - 회원 검색 콤보박스
 * ═══════════════════════════════════════════════════════════════
 * 드롭다운(<select>) 대신 이름 검색 가능한 자동완성 콤보박스
 * - 회원 수백 명이어도 몇 글자만 입력하면 즉시 필터링
 * - 아동/성인 구분 아이콘 표시
 * - 클릭·엔터로 선택
 * ═══════════════════════════════════════════════════════════════
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { Search, ChevronDown, X, User } from "lucide-react";

interface Member {
  id: string;
  name: string;
  member_type?: string;
  phone?: string;
}

interface Props {
  members: Member[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

export default function MemberSearchSelect({ members, value, onChange, placeholder = "이름으로 검색..." }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 선택된 회원 이름 표시용
  const selectedMember = useMemo(() => members.find(m => m.id === value), [members, value]);

  // 검색어 기반 필터링 (부분 일치, 대소문자 무시)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members.slice(0, 50);
    return members.filter(m =>
      m.name?.toLowerCase().includes(q) || m.phone?.includes(q)
    ).slice(0, 50);
  }, [members, query]);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(m: Member) {
    onChange(m.id);
    setQuery("");
    setOpen(false);
  }

  function handleClear() {
    onChange("");
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      {/* 표시 영역 */}
      <div
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={`w-full px-3 py-2 border rounded-lg text-sm cursor-text flex items-center gap-2 bg-white ${open ? "border-aqu-400 ring-2 ring-aqu-100" : "border-gray-200 hover:border-aqu-300"}`}
      >
        <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        {open ? (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="flex-1 outline-none bg-transparent text-sm"
            autoFocus
          />
        ) : selectedMember ? (
          <span className="flex-1 flex items-center gap-1.5">
            <span>{selectedMember.member_type === "child" ? "🧒" : "👤"}</span>
            <span className="font-medium text-gray-900">{selectedMember.name}</span>
            {selectedMember.phone && (
              <span className="text-[10px] text-gray-500 ml-1">{selectedMember.phone}</span>
            )}
          </span>
        ) : (
          <span className="flex-1 text-gray-400">{placeholder}</span>
        )}
        {selectedMember && !open && (
          <button
            onClick={(e) => { e.stopPropagation(); handleClear(); }}
            className="text-gray-400 hover:text-red-500"
            title="선택 해제"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      {/* 검색 결과 드롭다운 */}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {filtered.length === 0 ? (
            <div className="p-3 text-center text-xs text-gray-400">
              검색 결과 없음. 다른 검색어를 시도해 주세요.
            </div>
          ) : (
            <>
              {!query && (
                <div className="px-3 py-1.5 text-[10px] text-gray-400 border-b bg-gray-50">
                  {members.length}명 중 최근 50명 (검색어 입력 시 전체 검색)
                </div>
              )}
              {filtered.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleSelect(m)}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-aqu-50 flex items-center gap-2 border-b border-gray-50 last:border-b-0 ${
                    m.id === value ? "bg-aqu-50 font-semibold text-aqu-900" : ""
                  }`}
                >
                  <span>{m.member_type === "child" ? "🧒" : "👤"}</span>
                  <span className="flex-1">{m.name}</span>
                  {m.phone && <span className="text-[10px] text-gray-500">{m.phone}</span>}
                  {m.id === value && <span className="text-aqu-500 text-xs">✓</span>}
                </button>
              ))}
              {filtered.length >= 50 && query && (
                <div className="p-2 text-center text-[10px] text-gray-400 border-t">
                  💡 결과가 많습니다. 검색어를 좀 더 구체적으로 입력해 보세요.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
