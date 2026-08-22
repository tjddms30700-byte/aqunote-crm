"use client";
/**
 * 🏢 지점 스위처
 * ────────────────
 * - 메인 마스터 계정: 전체 지점 드롭다운으로 자유롭게 전환
 * - 일반 계정: 자기 소속 지점만 배지로 표시 (전환 불가)
 * - 로그인 안 된 경우: 아무것도 표시하지 않음
 */
import { useBranchContext } from "@/lib/branchContext";
import { ChevronDown, Building2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";

const TYPE_META: Record<string, { icon: string; label: string; color: string }> = {
  head:   { icon: "🏢", label: "본점",   color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  direct: { icon: "🏪", label: "직영점", color: "bg-blue-50 text-blue-700 border-blue-200" },
  branch: { icon: "🏬", label: "지점",   color: "bg-gray-50 text-gray-700 border-gray-200" },
};

export default function BranchSwitcher() {
  const { isMaster, activeBranchId, branches, setActiveBranchId, loading } = useBranchContext();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  if (loading || !activeBranchId || branches.length === 0) return null;

  const active = branches.find(b => b.id === activeBranchId);
  if (!active) return null;

  const tm = TYPE_META[active.branch_type] || TYPE_META.branch;

  // 일반 계정: 배지만 표시 (전환 불가)
  if (!isMaster || branches.length <= 1) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${tm.color}`}>
        <span>{tm.icon}</span>
        <span>{active.name}</span>
        <span className="text-[10px] opacity-70">{tm.label}</span>
      </div>
    );
  }

  // 마스터 계정: 드롭다운 스위처
  return (
    <div ref={wrapRef} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border shadow-sm hover:shadow ${tm.color}`}>
        <Building2 className="w-3.5 h-3.5" />
        <span>{tm.icon} {active.name}</span>
        <span className="text-[10px] opacity-70">({tm.label})</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute z-50 right-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 bg-gradient-to-r from-yellow-50 to-amber-50">
            <div className="text-[10px] font-bold text-yellow-700 flex items-center gap-1">
              👑 메인 마스터 모드
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">지점을 선택해 해당 지점 데이터를 조회하세요</div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {branches.map(b => {
              const meta = TYPE_META[b.branch_type] || TYPE_META.branch;
              const isActive = b.id === activeBranchId;
              return (
                <button key={b.id}
                  onClick={() => { setActiveBranchId(b.id); setOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-50 ${isActive ? "bg-yellow-50" : ""}`}>
                  <span className="text-lg">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{b.name}</div>
                    <div className="text-[10px] text-gray-500">
                      {meta.label}
                      {b.manager_name && <span className="ml-1">· 👤 {b.manager_name}</span>}
                    </div>
                  </div>
                  {isActive && <span className="text-[10px] text-yellow-600 font-bold">✓ 현재</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
