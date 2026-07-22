"use client";
/**
 * 🔍 통합 회원 검색 컴포넌트
 * ─────────────────────────────
 * 모든 페이지(회원/결제/출결/시간표/문서/IEP/행동중재/보고서 등)에서
 * 동일한 UX로 회원을 찾을 수 있도록 하는 공통 컴포넌트.
 *
 * 특징
 * - 이름 검색 (부분 일치)
 * - 전화번호 뒷자리 검색 (예: "3206" → 010-XXXX-3206)
 * - 종결/대기종료 회원도 표시 (opacity 60%, 🔴 배지)
 * - 상태별 컬러 배지 (정규/대기/체험/일시정지/종결/대기종료)
 * - 선택 시 "이름 (뒷4자리) · 성인/아동" 형태로 표시
 * - 포커스 시 입력창 텍스트 자동 선택 (재검색 편의)
 */
import { useState, useEffect, useRef } from "react";

const STATUS_MAP: Record<string, { icon: string; color: string; label: string }> = {
  regular:         { icon: "🎯", color: "text-green-600",  label: "정규" },
  waiting:         { icon: "⏳", color: "text-yellow-600", label: "대기" },
  trial_scheduled: { icon: "📅", color: "text-blue-600",   label: "체험예정" },
  trial_done:      { icon: "✅", color: "text-purple-600", label: "체험완료" },
  paused:          { icon: "⏸️", color: "text-gray-500",   label: "일시정지" },
  closed:          { icon: "🔴", color: "text-red-500",    label: "종결" },
  ended:           { icon: "⚫", color: "text-gray-400",   label: "대기종료" },
};

type MemberSearchProps = {
  members: any[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** true면 종결/대기종료 회원 제외 (기본 false = 모두 표시) */
  excludeClosed?: boolean;
  /** true면 전체 너비 사용 */
  fullWidth?: boolean;
  /** 라벨 표시 여부 (기본 false, 상위에서 라벨을 감싸는 경우) */
  label?: string;
};

export default function MemberSearch({
  members,
  value,
  onChange,
  placeholder = "🔍 이름 또는 전화번호 뒷자리 (예: 3206)",
  excludeClosed = false,
  fullWidth = true,
  label,
}: MemberSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = members.find((m: any) => m.id === value);

  // 검색 로직: 이름(부분일치) OR 전화번호 숫자만 추출 후 부분일치
  const qDigits = query.replace(/\D/g, "");
  const filtered = members.filter((m: any) => {
    if (excludeClosed && ["closed", "ended"].includes(m.status)) return false;
    if (!query.trim()) return true;
    const nameHit = (m.name || "").toLowerCase().includes(query.toLowerCase());
    const phoneDigits = (m.phone || "").replace(/\D/g, "");
    const phoneHit = qDigits.length > 0 && phoneDigits.includes(qDigits);
    return nameHit || phoneHit;
  });

  // 외부 클릭 감지
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectedDisplay = selected
    ? `${selected.name}${selected.phone ? ` (${(selected.phone || "").replace(/\D/g, "").slice(-4)})` : ""} · ${selected.member_type === "child" ? "아동" : "성인"}`
    : query;

  return (
    <div ref={wrapRef} className={`relative ${fullWidth ? "w-full" : ""}`}>
      {label && <label className="text-xs text-gray-600 block mb-1">{label}</label>}
      <div className="flex gap-2">
        <input
          type="text"
          value={selectedDisplay}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (selected) onChange(""); }}
          onFocus={(e) => { setOpen(true); e.currentTarget.select(); }}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none"
        />
        {value && (
          <button type="button" onClick={() => { onChange(""); setQuery(""); }}
            className="px-2 text-gray-400 hover:text-red-500 text-sm">×</button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-gray-500 text-center">
              🔍 검색 결과 없음
              <div className="text-[10px] text-gray-400 mt-1">이름 또는 전화번호 뒷자리로 검색해보세요</div>
            </div>
          ) : (
            filtered.slice(0, 80).map((m: any) => {
              const st = STATUS_MAP[m.status] || STATUS_MAP.regular;
              const phoneTail = (m.phone || "").replace(/\D/g, "").slice(-4);
              const isDim = ["closed", "ended"].includes(m.status);
              return (
                <button key={m.id} type="button"
                  onClick={() => { onChange(m.id); setQuery(""); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-aqu-50 flex items-center gap-2 ${value === m.id ? "bg-aqu-50" : ""} ${isDim ? "opacity-60" : ""}`}>
                  <span className={st.color}>{st.icon}</span>
                  <span className="font-medium text-slate-900">{m.name}</span>
                  {phoneTail && (
                    <span className="text-xs text-amber-700 font-mono bg-amber-50 px-1.5 py-0.5 rounded">
                      ({phoneTail})
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {m.member_type === "child" ? "🧒 아동" : "👤 성인"}
                  </span>
                  <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${st.color} bg-gray-50 whitespace-nowrap`}>
                    {st.label}
                  </span>
                </button>
              );
            })
          )}
          {filtered.length > 80 && (
            <div className="p-2 text-[10px] text-gray-400 text-center border-t bg-gray-50">
              +{filtered.length - 80}명 더 있음. 검색을 좁혀보세요.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
