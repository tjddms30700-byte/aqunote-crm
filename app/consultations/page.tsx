"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { getActiveBranchId, useBranchWatch } from "@/lib/branchContext";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import {
  Plus, Phone, Calendar, User, MessageCircle, ArrowRight, X, Save,
  Clock, Users, RefreshCw, Search, Lock, Unlock, ChevronRight,
  AlertCircle, TrendingUp, CheckCircle2, Target
} from "lucide-react";

/* ─────────────── 타입 & 상수 ─────────────── */

type Member = {
  id: string;
  name: string;
  member_type: "child" | "adult";
  phone: string | null;
  status: string | null;
  extra: any;
  memo: string | null;
  source: string | null;
  created_at?: string;
  wish_days?: string[] | null;
  wish_time_slots?: string[] | null;
  wish_start_date?: string | null;
  branch_id?: string | null;
  guardian_name?: string | null;
};

type MatrixCell = {
  id?: string;
  day_of_week: number;
  time_slot: string;
  status: "open" | "fixed" | "closed";
  fixed_name?: string | null;
  member_id?: string | null;
  note?: string | null;
};

const COLUMNS = [
  { key: "new",             label: "🆕 신규",     bg: "bg-pink-50 border-pink-200",     accent: "text-pink-700" },
  { key: "waiting",         label: "⏳ 대기중",   bg: "bg-yellow-50 border-yellow-200", accent: "text-yellow-700" },
  { key: "trial_scheduled", label: "📅 체험예정", bg: "bg-blue-50 border-blue-200",     accent: "text-blue-700" },
  { key: "trial_done",      label: "✅ 체험완료", bg: "bg-purple-50 border-purple-200", accent: "text-purple-700" },
  { key: "regular",         label: "🎯 정규등록", bg: "bg-emerald-50 border-emerald-200", accent: "text-emerald-700" },
  { key: "ended",           label: "🛑 대기종료", bg: "bg-red-50 border-red-200",       accent: "text-red-700" },
];

const DAYS = ["월", "화", "수", "목", "금", "토"];
const TIME_SLOTS = [
  "10:00~11:10", "11:10~12:20", "12:20~13:30", "13:30~14:40",
  "14:40~15:50", "15:50~17:00", "17:00~18:10", "18:10~19:20",
  "19:20~20:30", "20:30~21:40",
];

function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(x => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

/** 셀-대기자 매칭 로직 (분단위 정밀) */
function matchesWish(wishDaysRaw: any[] | null | undefined, wishTimesRaw: any[] | null | undefined, day: number, time: string): boolean {
  const dayName = DAYS[day - 1];
  const wishTimes = (wishTimesRaw || []).map((s: any) => String(s).trim()).filter(Boolean);
  const wishDays  = (wishDaysRaw || []).flatMap((s: any) =>
    String(s).split(/[;,|/\s]+/).map(x => x.trim().replace("요일", "")).filter(Boolean)
  );
  const cellStart = parseTimeToMinutes(time.slice(0, 5));
  const cellStartHour = Math.floor(cellStart / 60);

  let dayMatched = false;
  if (wishDays.length > 0) dayMatched = wishDays.some(d => d.includes(dayName));
  else if (wishTimes.length > 0) dayMatched = wishTimes.some(t => t.includes(dayName));
  if (!dayMatched) return false;

  for (const raw of wishTimes) {
    const parts = raw.split(/[|,;]/).map((p: string) => p.trim()).filter(Boolean);
    for (const p of parts) {
      const timeStart = time.slice(0, 5);
      if (p.includes(timeStart)) return true;
      const rangeMin = p.match(/(\d{1,2}):(\d{2})\s*[~\-]\s*(\d{1,2}):(\d{2})/);
      if (rangeMin) {
        const rS = parseInt(rangeMin[1], 10) * 60 + parseInt(rangeMin[2], 10);
        const rE = parseInt(rangeMin[3], 10) * 60 + parseInt(rangeMin[4], 10);
        if (cellStart >= rS && cellStart < rE) return true;
        if (cellStart === rS) return true;
        continue;
      }
      const range = p.match(/(\d{1,2})\s*[~\-]\s*(\d{1,2})/);
      if (range) {
        const s = parseInt(range[1], 10), e = parseInt(range[2], 10);
        if (cellStartHour >= s && cellStartHour < e) return true;
      }
      if (p.includes("오전") && cellStartHour < 12) return true;
      if (p.includes("점심") && cellStartHour >= 12 && cellStartHour < 14) return true;
      if (p.includes("오후") && cellStartHour >= 12 && cellStartHour < 17) return true;
      if (p.includes("저녁") && cellStartHour >= 17) return true;
    }
  }
  if (wishTimes.length === 0 && dayMatched) return true;
  return false;
}

/* ─────────────── 메인 페이지 ─────────────── */

export default function ConsultationsPage() {
  const [tab, setTab] = useState<"kanban" | "match" | "dashboard">("kanban");
  const [members, setMembers] = useState<Member[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [matrix, setMatrix] = useState<MatrixCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ day: number; time: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => { loadAll(); }, []);
  useBranchWatch(() => loadAll());

  async function loadAll() {
    setLoading(true);
    const branchId = getActiveBranchId();
    const { data: org } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
    setOrgId(org?.id || null);

    // members (지점필터 fallback)
    const q = branchId
      ? supabase.from("members").select("*").is("deleted_at", null).eq("branch_id", branchId).order("created_at", { ascending: false })
      : supabase.from("members").select("*").is("deleted_at", null).order("created_at", { ascending: false });
    let { data: memData, error: memErr } = await q;
    if (memErr && (memErr.code === "42703" || memErr.message?.includes("branch_id"))) {
      const r = await supabase.from("members").select("*").is("deleted_at", null).order("created_at", { ascending: false });
      memData = r.data;
    }

    const [staffRes, matrixRes] = await Promise.all([
      supabase.from("staff").select("id, name, color").order("name"),
      supabase.from("slot_matrix").select("*"),
    ]);

    setMembers((memData as any) || []);
    setStaff(staffRes.data || []);
    setMatrix((matrixRes.data as any) || []);
    setLoading(false);
  }

  /* ─── 회원 상태 변경 (드래그 등) ─── */
  async function moveMember(id: string, newStatus: string) {
    const { error } = await supabase.from("members").update({ status: newStatus }).eq("id", id);
    if (error) alert("변경 실패: " + error.message);
    else await loadAll();
  }

  /* ─── 신규 상담 빠른 등록 ─── */
  async function quickAdd(payload: any) {
    setSaving(true);
    const branchId = getActiveBranchId();
    const insertData: any = {
      org_id: orgId,
      name: payload.name.trim(),
      phone: payload.phone.trim() || null,
      member_type: payload.member_type,
      status: "new",
      source: payload.source || "직접등록",
      memo: payload.memo || null,
      wish_days: payload.wish_days.length > 0 ? payload.wish_days : null,
      wish_time_slots: payload.wish_time_slots.length > 0 ? payload.wish_time_slots : null,
    };
    if (branchId) insertData.branch_id = branchId;
    const { error } = await supabase.from("members").insert(insertData);
    setSaving(false);
    if (error) alert("등록 실패: " + error.message);
    else {
      setShowQuickAdd(false);
      await loadAll();
    }
  }

  /* ─── 매트릭스 셀 저장 ─── */
  function getCell(day: number, time: string): MatrixCell | undefined {
    return matrix.find(c => c.day_of_week === day && c.time_slot === time);
  }
  async function saveCell(day: number, time: string, patch: Partial<MatrixCell>) {
    setSaving(true);
    const existing = getCell(day, time);
    let error;
    if (existing) {
      const r = await supabase.from("slot_matrix").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", existing.id!);
      error = r.error;
    } else {
      const r = await supabase.from("slot_matrix").insert({ org_id: orgId, day_of_week: day, time_slot: time, status: "closed", ...patch });
      error = r.error;
    }
    if (error) alert("저장 실패: " + error.message);
    else await loadAll();
    setSaving(false);
  }

  /* ─── 대기자(정렬된) 및 셀별 매칭 ─── */
  const fixedMemberIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of matrix) if (c.status === "fixed" && c.member_id) s.add(c.member_id);
    return s;
  }, [matrix]);

  const waiters = useMemo(() => {
    return members
      .filter(m => m.status === "waiting")
      .filter(m => !fixedMemberIds.has(m.id))
      .sort((a, b) => {
        const ca = a.created_at || ""; const cb = b.created_at || "";
        if (!ca && !cb) return 0; if (!ca) return 1; if (!cb) return -1;
        return ca.localeCompare(cb);
      });
  }, [members, fixedMemberIds]);

  function getMatchedWaiters(day: number, time: string) {
    return waiters
      .filter(w => matchesWish(w.wish_days, w.wish_time_slots, day, time))
      .map((w, i) => ({ ...w, priority: i + 1 }));
  }

  /* ─── 통계 ─── */
  const stats = useMemo(() => {
    const now = new Date();
    const byStatus: Record<string, number> = {};
    COLUMNS.forEach(c => byStatus[c.key] = 0);
    for (const m of members) {
      const s = m.status || "waiting";
      byStatus[s] = (byStatus[s] || 0) + 1;
    }

    // 매칭 통계
    let openCells = 0, fixedCells = 0, matchedOpen = 0;
    for (let d = 1; d <= 6; d++) for (const t of TIME_SLOTS) {
      const c = getCell(d, t);
      if (c?.status === "fixed") fixedCells++;
      else if (c?.status === "open") {
        openCells++;
        if (getMatchedWaiters(d, t).length > 0) matchedOpen++;
      }
    }

    // 긴급 액션
    const stale = members.filter(m => {
      if (m.status !== "waiting") return false;
      const created = m.created_at ? new Date(m.created_at) : null;
      if (!created) return false;
      return (now.getTime() - created.getTime()) / 86400000 >= 30;
    });
    const trialSoon = members.filter(m => m.status === "trial_scheduled").slice(0, 10);

    // 이번 주 신규
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const newThisWeek = members.filter(m => m.created_at && new Date(m.created_at) >= weekAgo).length;

    // 전환율 (waiting → regular)
    const total = members.length;
    const converted = byStatus["regular"] || 0;
    const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;

    return { byStatus, openCells, fixedCells, matchedOpen, stale, trialSoon, newThisWeek, conversionRate, waitersCount: waiters.length };
  }, [members, matrix, waiters]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-aqu-50 text-aqu-600">로딩 중...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-aqu-50 to-white p-4 md:p-6">
      {/* 헤더 */}
      <div className="max-w-7xl mx-auto mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">
            🎯 상담·매칭 관리
          </h1>
          <p className="text-xs text-gray-500 mt-1">상담 리드부터 시간표 배정까지 한 곳에서 관리합니다</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowQuickAdd(true)}
            className="px-3 py-2 text-sm bg-pink-600 text-white rounded-lg hover:bg-pink-700 flex items-center gap-1 shadow-sm">
            <Plus className="w-4 h-4" /> 신규 상담
          </button>
          <button onClick={loadAll} className="px-3 py-2 text-sm bg-white border border-aqu-200 rounded-lg hover:bg-aqu-50 flex items-center gap-1">
            <RefreshCw className="w-4 h-4" />
          </button>
          <HomeButton />
        </div>
      </div>

      {/* 탭 전환 */}
      <div className="max-w-7xl mx-auto mb-5 flex gap-1 border-b border-aqu-100">
        <TabBtn active={tab === "kanban"} onClick={() => setTab("kanban")} icon="📋" label="칸반 (파이프라인)" />
        <TabBtn active={tab === "match"} onClick={() => setTab("match")} icon="🗓️" label="시간표 매칭" />
        <TabBtn active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon="📊" label="대시보드" />
      </div>

      {/* ─── 탭 1: 칸반 ─── */}
      {tab === "kanban" && (
        <KanbanView members={members} stats={stats} onMove={moveMember} matrix={matrix} />
      )}

      {/* ─── 탭 2: 시간표 매칭 ─── */}
      {tab === "match" && (
        <MatchView
          matrix={matrix}
          members={members}
          staff={staff}
          waiters={waiters}
          stats={stats}
          getCell={getCell}
          getMatchedWaiters={getMatchedWaiters}
          onCellClick={(day, time) => setSelectedCell({ day, time })}
        />
      )}

      {/* ─── 탭 3: 대시보드 ─── */}
      {tab === "dashboard" && (
        <DashboardView members={members} stats={stats} onMove={moveMember} />
      )}

      {/* 셀 편집 모달 */}
      {selectedCell && (
        <CellEditor
          day={selectedCell.day}
          time={selectedCell.time}
          cell={getCell(selectedCell.day, selectedCell.time)}
          matchedWaiters={getMatchedWaiters(selectedCell.day, selectedCell.time)}
          searchableMembers={members}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          saving={saving}
          onClose={() => { setSelectedCell(null); setSearchQuery(""); }}
          onSetStatus={(s: any) => saveCell(selectedCell.day, selectedCell.time, { status: s, fixed_name: s === "fixed" ? "" : null, member_id: null })}
          onAssign={async (m: Member) => {
            // ✅ 신기능 B: 대기자 → 정규회원 자동 전환 + 셀 고정
            await saveCell(selectedCell.day, selectedCell.time, {
              status: "fixed", fixed_name: m.name, member_id: m.id,
            });
            if (m.status !== "regular") {
              await supabase.from("members").update({ status: "regular" }).eq("id", m.id);
            }
            setSelectedCell(null); setSearchQuery("");
            await loadAll();
          }}
          onUnlock={async () => {
            if (!confirm("고정 배정을 해제합니다. 계속?")) return;
            await saveCell(selectedCell.day, selectedCell.time, { status: "open", fixed_name: null, member_id: null });
          }}
        />
      )}

      {/* 신규 상담 등록 모달 */}
      {showQuickAdd && (
        <QuickAddModal
          onClose={() => setShowQuickAdd(false)}
          onSave={quickAdd}
          saving={saving}
        />
      )}
    </div>
  );
}

/* ─────────────── 하위 컴포넌트: 칸반 ─────────────── */

function KanbanView({ members, stats, onMove, matrix }: any) {
  const [draggedId, setDraggedId] = useState<string | null>(null);

  function isFixedInMatrix(memberId: string): { day: number; time: string } | null {
    const cell = matrix.find((c: MatrixCell) => c.member_id === memberId && c.status === "fixed");
    if (!cell) return null;
    return { day: cell.day_of_week, time: cell.time_slot };
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* 파이프라인 요약 */}
      <div className="mb-4 grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
        {COLUMNS.map(col => (
          <div key={col.key} className={`${col.bg} border rounded-lg p-2`}>
            <div className={`font-medium ${col.accent}`}>{col.label}</div>
            <div className="text-lg font-bold mt-0.5">{stats.byStatus[col.key] || 0}명</div>
          </div>
        ))}
      </div>

      {/* 칸반 보드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {COLUMNS.map(col => {
          const cards = members.filter((m: Member) => (m.status || "waiting") === col.key);
          return (
            <div key={col.key}
              className={`${col.bg} border-2 border-dashed rounded-xl p-2 min-h-[400px]`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id && draggedId) onMove(id, col.key);
                setDraggedId(null);
              }}>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className={`text-xs font-semibold ${col.accent}`}>{col.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-white ${col.accent} font-bold`}>{cards.length}</span>
              </div>
              <div className="space-y-1.5 max-h-[560px] overflow-y-auto">
                {cards.map((m: Member) => {
                  const fixed = isFixedInMatrix(m.id);
                  return (
                    <div key={m.id}
                      draggable
                      onDragStart={(e) => { setDraggedId(m.id); e.dataTransfer.setData("text/plain", m.id); }}
                      className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm hover:shadow-md cursor-move transition-shadow">
                      <Link href={`/members/${m.id}`} className="block">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="font-medium text-sm text-aqu-900 truncate">{m.name}</span>
                          <span className="text-[9px] flex-shrink-0">{m.member_type === "child" ? "🧒" : "👤"}</span>
                        </div>
                        {m.phone && <div className="text-[10px] text-gray-500 font-mono">{m.phone}</div>}
                        {(m.wish_days && m.wish_days.length > 0) && (
                          <div className="text-[10px] text-gray-600 mt-0.5">📅 {m.wish_days.join(",")}</div>
                        )}
                        {fixed && (
                          <div className="mt-1 text-[9px] inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">
                            <Lock className="w-2.5 h-2.5" /> {DAYS[fixed.day - 1]} {fixed.time.slice(0, 5)}
                          </div>
                        )}
                        {m.memo && (
                          <div className="text-[10px] text-gray-500 mt-1 truncate italic" title={m.memo}>💬 {m.memo}</div>
                        )}
                      </Link>
                    </div>
                  );
                })}
                {cards.length === 0 && (
                  <div className="text-center text-[10px] text-gray-400 py-8 italic">비어있음</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 text-[11px] text-gray-500 text-center">
        💡 카드를 드래그해서 상태를 변경할 수 있습니다 · 카드 클릭 시 회원 상세페이지로 이동
      </div>
    </div>
  );
}

/* ─────────────── 하위 컴포넌트: 매칭 ─────────────── */

function MatchView({ matrix, members, staff, waiters, stats, getCell, getMatchedWaiters, onCellClick }: any) {
  const staffMap = useMemo(() => {
    const m: any = {};
    staff.forEach((s: any) => { m[s.id] = s; });
    return m;
  }, [staff]);
  const memberMap = useMemo(() => {
    const m: any = {};
    members.forEach((mm: Member) => { m[mm.id] = mm; });
    return m;
  }, [members]);

  return (
    <div className="max-w-7xl mx-auto">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 text-xs">
        <StatCard color="from-emerald-500 to-teal-500" label="🔒 고정 배정" value={`${stats.fixedCells}칸`} />
        <StatCard color="from-blue-500 to-cyan-500" label="🟢 빈자리(OPEN)" value={`${stats.openCells}칸`} />
        <StatCard color="from-orange-500 to-amber-500" label="⭐ 매칭 가능" value={`${stats.matchedOpen}칸`} />
        <StatCard color="from-purple-500 to-pink-500" label="⏳ 대기자" value={`${stats.waitersCount}명`} />
      </div>

      {/* 매트릭스 */}
      <div className="bg-white rounded-xl border border-aqu-100 overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-aqu-500 to-cyan-500 text-white px-4 py-2.5 flex items-center justify-between">
          <div className="font-bold text-sm">📋 주간 시간표 매트릭스</div>
          <div className="text-[11px] opacity-90">셀 클릭 → 상태 변경 · 회원 배정</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-aqu-50 text-aqu-800">
                <th className="w-20 p-2 border-b border-r border-aqu-100">시간대</th>
                {DAYS.map((d, i) => (
                  <th key={d} className={`p-2 border-b border-r border-aqu-100 font-bold ${i === 5 ? "bg-orange-50" : ""}`}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map(time => (
                <tr key={time}>
                  <td className="p-2 border-b border-r border-aqu-100 font-medium text-aqu-700 bg-aqu-50/50 text-[11px]">{time}</td>
                  {DAYS.map((_, idx) => {
                    const day = idx + 1;
                    const cell = getCell(day, time);
                    const status: any = cell?.status || "closed";
                    const matched = status === "open" ? getMatchedWaiters(day, time) : [];
                    const member = cell?.member_id ? memberMap[cell.member_id] : null;
                    const staffColor = (member?.staff_id && staffMap[member.staff_id]?.color) || null;
                    return (
                      <td key={`${day}-${time}`}
                        onClick={() => onCellClick(day, time)}
                        className={`p-1 border-b border-r border-aqu-100 align-top cursor-pointer min-w-[110px] transition-colors
                          ${status === "fixed" ? "bg-emerald-50 hover:bg-emerald-100" : ""}
                          ${status === "open" ? "bg-blue-50 hover:bg-blue-100" : ""}
                          ${status === "closed" ? "bg-gray-100 hover:bg-gray-200" : ""}`}
                        style={status === "fixed" && staffColor ? {
                          backgroundColor: staffColor + "22",
                          borderLeftColor: staffColor,
                          borderLeftWidth: 3,
                        } : {}}
                      >
                        {status === "fixed" && (
                          <div className="text-[11px]">
                            <div className="flex items-center gap-0.5 text-emerald-800 font-semibold">
                              <Lock className="w-2.5 h-2.5" /> {cell?.fixed_name || "고정"}
                            </div>
                          </div>
                        )}
                        {status === "open" && (
                          <div className="text-[10px]">
                            <div className="text-blue-700 font-semibold mb-0.5">🟢 OPEN</div>
                            {matched.length === 0 ? (
                              <div className="text-gray-400 italic">대기자 없음</div>
                            ) : (
                              <div className="space-y-0.5">
                                {matched.slice(0, 3).map((w: any, i: number) => (
                                  <div key={w.id} className="flex items-center gap-1">
                                    <span className={`inline-block w-3.5 h-3.5 rounded-full text-white text-[8px] text-center font-bold leading-[14px] ${i === 0 ? "bg-red-500" : i === 1 ? "bg-orange-500" : "bg-gray-400"}`}>{w.priority}</span>
                                    <span className="truncate">{w.name}</span>
                                  </div>
                                ))}
                                {matched.length > 3 && <div className="text-gray-500 text-[9px]">+{matched.length - 3}명</div>}
                              </div>
                            )}
                          </div>
                        )}
                        {status === "closed" && (
                          <div className="text-[9px] text-gray-400 text-center py-1">⬛</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-gray-500 flex flex-wrap gap-3 justify-center">
        <span>🔒 고정 — 배정 완료</span>
        <span>🟢 OPEN — 빈자리, 대기자 자동 매칭</span>
        <span>⬛ 운영 안함</span>
        <span>1·2·3순위 — 신청 순서</span>
      </div>
    </div>
  );
}

/* ─────────────── 하위 컴포넌트: 대시보드 ─────────────── */

function DashboardView({ members, stats, onMove }: any) {
  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* 상단 KPI 4개 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-pink-500 to-rose-500 rounded-xl p-4 text-white shadow">
          <div className="flex items-center gap-1 text-xs opacity-90"><TrendingUp className="w-3.5 h-3.5" /> 이번 주 신규</div>
          <div className="text-2xl font-bold mt-1">{stats.newThisWeek}명</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl p-4 text-white shadow">
          <div className="flex items-center gap-1 text-xs opacity-90"><CheckCircle2 className="w-3.5 h-3.5" /> 정규 전환율</div>
          <div className="text-2xl font-bold mt-1">{stats.conversionRate}%</div>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl p-4 text-white shadow">
          <div className="flex items-center gap-1 text-xs opacity-90"><Clock className="w-3.5 h-3.5" /> 대기자</div>
          <div className="text-2xl font-bold mt-1">{stats.waitersCount}명</div>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl p-4 text-white shadow">
          <div className="flex items-center gap-1 text-xs opacity-90"><Target className="w-3.5 h-3.5" /> 매칭 가능</div>
          <div className="text-2xl font-bold mt-1">{stats.matchedOpen}칸</div>
        </div>
      </div>

      {/* 긴급 액션 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 30일↑ 대기자 */}
        <div className="bg-white rounded-xl border border-red-200 p-4">
          <h3 className="text-sm font-bold text-red-800 flex items-center gap-1.5 mb-3">
            <AlertCircle className="w-4 h-4" /> ⏰ 30일 이상 대기 중
            <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{stats.stale.length}명</span>
          </h3>
          {stats.stale.length === 0 ? (
            <div className="text-center text-xs text-gray-400 py-6">🎉 30일 이상 대기 중인 회원이 없습니다</div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {stats.stale.slice(0, 8).map((m: Member) => {
                const days = m.created_at ? Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86400000) : 0;
                return (
                  <Link href={`/members/${m.id}`} key={m.id}
                    className="flex items-center justify-between bg-red-50 hover:bg-red-100 rounded-lg p-2 border border-red-100">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs">{m.member_type === "child" ? "🧒" : "👤"}</span>
                      <span className="text-sm font-medium truncate">{m.name}</span>
                      {m.phone && <span className="text-[10px] text-gray-500 font-mono flex-shrink-0">{m.phone}</span>}
                    </div>
                    <span className="text-xs font-bold text-red-600 flex-shrink-0">D+{days}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* 체험 예정자 */}
        <div className="bg-white rounded-xl border border-blue-200 p-4">
          <h3 className="text-sm font-bold text-blue-800 flex items-center gap-1.5 mb-3">
            <Calendar className="w-4 h-4" /> 📅 체험 예정
            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{stats.trialSoon.length}명</span>
          </h3>
          {stats.trialSoon.length === 0 ? (
            <div className="text-center text-xs text-gray-400 py-6">체험 예정자가 없습니다</div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {stats.trialSoon.map((m: Member) => (
                <div key={m.id} className="flex items-center justify-between bg-blue-50 rounded-lg p-2 border border-blue-100">
                  <Link href={`/members/${m.id}`} className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xs">{m.member_type === "child" ? "🧒" : "👤"}</span>
                    <span className="text-sm font-medium truncate">{m.name}</span>
                    {m.phone && <span className="text-[10px] text-gray-500 font-mono">{m.phone}</span>}
                  </Link>
                  <button onClick={() => onMove(m.id, "trial_done")}
                    className="text-[10px] px-2 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 flex-shrink-0">
                    체험완료 ▶
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 상태 분포 시각화 */}
      <div className="bg-white rounded-xl border border-aqu-100 p-4">
        <h3 className="text-sm font-bold text-aqu-900 mb-3">📊 회원 상태 분포</h3>
        <div className="space-y-2">
          {COLUMNS.map(col => {
            const cnt = stats.byStatus[col.key] || 0;
            const total = members.length;
            const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
            return (
              <div key={col.key} className="flex items-center gap-2 text-xs">
                <span className="w-20 flex-shrink-0">{col.label}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden relative">
                  <div className={`h-full ${col.bg.replace("50", "400").replace("bg-", "bg-")} transition-all`}
                    style={{ width: `${pct}%` }} />
                </div>
                <span className="w-16 text-right font-mono">{cnt}명 ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── 하위 컴포넌트: 셀 편집 모달 ─────────────── */

function CellEditor(props: any) {
  const { day, time, cell, matchedWaiters, searchableMembers, searchQuery, setSearchQuery, saving, onClose, onSetStatus, onAssign, onUnlock } = props;
  const status = cell?.status || "closed";
  const dayName = DAYS[day - 1];

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return searchableMembers.slice(0, 30);
    return searchableMembers.filter((m: any) =>
      m.name.toLowerCase().includes(q) || (m.phone && m.phone.includes(q))
    ).slice(0, 30);
  }, [searchableMembers, searchQuery]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-gradient-to-r from-aqu-500 to-cyan-500 text-white px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold">📍 {dayName}요일 {time}</h2>
            <p className="text-xs opacity-90 mt-0.5">
              현재: <span className="font-semibold">
                {status === "fixed" ? `🔒 ${cell?.fixed_name || "고정"}` : status === "open" ? "🟢 OPEN (빈자리)" : "⬛ 운영 안함"}
              </span>
            </p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {/* 상태 전환 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">① 셀 상태</h3>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => onSetStatus("open")} disabled={saving || status === "open"}
                className={`px-3 py-2 text-sm rounded-lg border ${status === "open" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-blue-700 border-blue-200 hover:bg-blue-50"} disabled:opacity-50`}>
                🟢 OPEN
              </button>
              <button onClick={() => onSetStatus("closed")} disabled={saving || status === "closed"}
                className={`px-3 py-2 text-sm rounded-lg border ${status === "closed" ? "bg-gray-500 text-white border-gray-500" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"} disabled:opacity-50`}>
                ⬛ 운영 안함
              </button>
              {status === "fixed" && (
                <button onClick={onUnlock} disabled={saving}
                  className="px-3 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center gap-1">
                  <Unlock className="w-4 h-4" /> 해제
                </button>
              )}
            </div>
          </section>

          {/* 대기자 순위 */}
          {status === "open" && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <Users className="w-4 h-4" /> ② 이 시간대 대기자
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{matchedWaiters.length}명</span>
              </h3>
              {matchedWaiters.length === 0 ? (
                <div className="p-3 text-xs text-gray-500 text-center bg-gray-50 rounded-lg">이 시간을 희망한 대기자가 없습니다</div>
              ) : (
                <div className="space-y-1.5">
                  {matchedWaiters.map((w: any, i: number) => (
                    <div key={w.id} className="flex items-center justify-between p-2.5 bg-orange-50 border border-orange-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold ${i === 0 ? "bg-red-500" : i === 1 ? "bg-orange-500" : "bg-gray-400"}`}>
                          {w.priority}
                        </span>
                        <span className="text-sm font-medium">{w.name}</span>
                        <span className="text-[10px] text-gray-500">{w.member_type === "child" ? "🧒 아동" : "👤 성인"}</span>
                      </div>
                      <button onClick={() => onAssign(w)} disabled={saving}
                        className="px-3 py-1 text-xs bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50">
                        🔒 이 회원으로 고정 (정규 등록)
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 회원 검색 */}
          {status !== "closed" && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">③ 다른 회원 검색·배정</h3>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="회원 이름/전화번호 검색..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-aqu-500" />
              </div>
              <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-lg divide-y">
                {filteredMembers.length === 0 && (
                  <div className="p-3 text-xs text-gray-500 text-center">검색 결과 없음</div>
                )}
                {filteredMembers.map((m: any) => (
                  <button key={m.id} onClick={() => onAssign(m)} disabled={saving}
                    className="w-full px-3 py-2 text-left hover:bg-emerald-50 flex items-center justify-between disabled:opacity-50">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs">{m.member_type === "child" ? "🧒" : "👤"}</span>
                      <span className="text-sm font-medium truncate">{m.name}</span>
                      <span className="text-[10px] text-gray-500">{m.status}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="border-t px-6 py-3 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">닫기</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── 하위 컴포넌트: 신규 등록 모달 ─────────────── */

function QuickAddModal({ onClose, onSave, saving }: any) {
  const [form, setForm] = useState({
    name: "", phone: "", member_type: "adult" as "adult" | "child",
    source: "직접등록", memo: "",
    wish_days: [] as string[], wish_time_slots: [] as string[],
  });

  function toggle<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  }

  function submit() {
    if (!form.name.trim()) { alert("이름을 입력하세요"); return; }
    onSave(form);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-gradient-to-r from-pink-500 to-rose-500 text-white px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-bold">🆕 신규 상담 등록</h2>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">✕</button>
        </div>
        <div className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setForm({ ...form, member_type: "adult" })}
              className={`py-2 rounded-lg text-sm border-2 ${form.member_type === "adult" ? "bg-purple-100 border-purple-500 text-purple-700 font-bold" : "bg-white border-gray-200 text-gray-500"}`}>
              👤 성인
            </button>
            <button onClick={() => setForm({ ...form, member_type: "child" })}
              className={`py-2 rounded-lg text-sm border-2 ${form.member_type === "child" ? "bg-blue-100 border-blue-500 text-blue-700 font-bold" : "bg-white border-gray-200 text-gray-500"}`}>
              🧒 아동
            </button>
          </div>

          <div>
            <label className="text-xs text-gray-600 block mb-1">이름 *</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="회원 이름" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">전화번호</label>
            <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="010-1234-5678" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono" />
          </div>

          <div>
            <label className="text-xs text-gray-600 block mb-1">희망 요일</label>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map(d => (
                <button key={d} onClick={() => setForm({ ...form, wish_days: toggle(form.wish_days, d) })}
                  className={`px-3 py-1.5 text-xs rounded-lg border ${form.wish_days.includes(d) ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-600 border-gray-200"}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-600 block mb-1">희망 시간대</label>
            <div className="grid grid-cols-2 gap-1.5">
              {TIME_SLOTS.map(t => (
                <button key={t} onClick={() => setForm({ ...form, wish_time_slots: toggle(form.wish_time_slots, t) })}
                  className={`px-2 py-1.5 text-[11px] rounded-lg border ${form.wish_time_slots.includes(t) ? "bg-cyan-500 text-white border-cyan-500" : "bg-white text-gray-600 border-gray-200"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-600 block mb-1">메모</label>
            <textarea value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} rows={2}
              placeholder="특이사항, 상담 내용..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
          </div>

          <div>
            <label className="text-xs text-gray-600 block mb-1">유입경로</label>
            <input type="text" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
        </div>
        <div className="border-t px-6 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg">취소</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-sm bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 flex items-center gap-1">
            <Save className="w-4 h-4" /> {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── 유틸 컴포넌트 ─────────────── */

function TabBtn({ active, onClick, icon, label }: any) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2.5 text-sm border-b-2 transition-colors flex items-center gap-1.5 ${
        active ? "border-pink-500 text-pink-700 font-bold bg-pink-50/50" : "border-transparent text-gray-500 hover:text-gray-700"
      }`}>
      <span>{icon}</span> {label}
    </button>
  );
}

function StatCard({ color, label, value }: any) {
  return (
    <div className={`bg-gradient-to-br ${color} rounded-xl p-3 text-white shadow-sm`}>
      <div className="text-xs opacity-90">{label}</div>
      <div className="text-xl font-bold mt-0.5">{value}</div>
    </div>
  );
}
