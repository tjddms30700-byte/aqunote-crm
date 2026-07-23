"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { supabase } from "@/lib/supabase";
import { getActiveBranchId, useBranchWatch } from "@/lib/branchContext";
import { Lock, Unlock, Search, X, Users, ChevronRight } from "lucide-react";

// ─────────────── 상수 ───────────────
const DAYS = ["월", "화", "수", "목", "금", "토"];
const TIME_SLOTS = [
  "10:00~11:10", "11:10~12:20", "12:20~13:30", "13:30~14:40",
  "14:40~15:50", "15:50~17:00", "17:00~18:10", "18:10~19:20",
  "19:20~20:30", "20:30~21:40",
];

type CellStatus = "open" | "fixed" | "closed";

type MatrixCell = {
  id?: string;
  day_of_week: number;   // 1=월 ~ 6=토
  time_slot: string;
  status: CellStatus;
  fixed_name?: string | null;
  member_id?: string | null;
  note?: string | null;
};

type Member = {
  id: string;
  name: string;
  member_type: "child" | "adult";
  status: string;
  wish_days?: string[] | null;
  wish_time_slots?: string[] | null;
};

// 대기자 우선순위 (신청 순서 = created_at 오름차순)
type Waiter = Member & { priority: number; created_at: string };

export default function ScheduleMatchingPage() {
  const [matrix, setMatrix] = useState<MatrixCell[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState<{ day: number; time: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);
  useBranchWatch(() => loadAll());

  async function loadAll() {
    setLoading(true);
    const branchId = getActiveBranchId();

    // org_id 확보
    const { data: org } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
    setOrgId(org?.id || null);

    // slot_matrix 로드
    const { data: matrixData } = await supabase.from("slot_matrix").select("*");

    // 회원 (지점필터)
    const memQuery = branchId
      ? supabase.from("members").select("id,name,member_type,status,wish_days,wish_time_slots,created_at,branch_id").is("deleted_at", null).eq("branch_id", branchId)
      : supabase.from("members").select("id,name,member_type,status,wish_days,wish_time_slots,created_at").is("deleted_at", null);
    let { data: memData, error: memErr } = await memQuery;
    if (memErr && (memErr.code === "42703" || memErr.message?.includes("branch_id"))) {
      const r = await supabase.from("members").select("id,name,member_type,status,wish_days,wish_time_slots,created_at").is("deleted_at", null);
      memData = r.data;
    }

    setMatrix((matrixData as MatrixCell[]) || []);
    setMembers((memData as any) || []);
    setLoading(false);
  }

  // 셀 조회 헬퍼
  function getCell(day: number, time: string): MatrixCell | undefined {
    return matrix.find(c => c.day_of_week === day && c.time_slot === time);
  }

  // 대기자 = 상태가 'waiting' or 'new' 인 회원
  const waiters: Waiter[] = useMemo(() => {
    return members
      .filter(m => m.status === "waiting" || m.status === "new")
      .map((m: any, idx) => ({ ...m, priority: idx + 1, created_at: m.created_at || "" }))
      .sort((a, b) => (a.created_at > b.created_at ? 1 : -1))
      .map((m, idx) => ({ ...m, priority: idx + 1 }));
  }, [members]);

  // 대기자의 희망 요일/시간 매칭 판단 (v3.13.2 개선: 시간구간 + 세미콜론 구분자 지원)
  function matchesWish(w: Waiter, day: number, time: string): boolean {
    const dayName = DAYS[day - 1]; // "월".."토"
    const wishTimes = (w.wish_time_slots || []).map((s: string) => String(s).trim()).filter(Boolean);
    const wishDays  = (w.wish_days || []).flatMap((s: string) =>
      String(s).split(/[;,|/\s]+/).map(x => x.trim()).filter(Boolean)
    );

    // ✅ v3.13.8: 셀 시작시각을 분 단위까지 파싱 (예 "15:50~17:00" → 15*60+50=950분)
    const cellStart = parseTimeToMinutes(time.slice(0, 5));   // "15:50" → 950
    const cellEnd   = parseTimeToMinutes(time.slice(-5));      // "17:00" → 1020
    const cellStartHour = Math.floor(cellStart / 60);

    // 1) 요일 매칭 검사
    let dayMatched = false;
    if (wishDays.length > 0) {
      dayMatched = wishDays.some(d => d.replace("요일", "").includes(dayName));
    } else if (wishTimes.length > 0) {
      dayMatched = wishTimes.some(t => t.includes(dayName));
    }
    if (!dayMatched) return false;

    // 2) 시간 매칭
    for (const raw of wishTimes) {
      const parts = raw.split(/[|,;]/).map(p => p.trim()).filter(Boolean);
      for (const p of parts) {
        // (a) 정확한 시작 시각 ("15:50") → 셀 시작과 일치
        const timeStart = time.slice(0, 5); // "15:50"
        if (p.includes(timeStart)) return true;

        // (b) HH:MM ~ HH:MM 또는 HH:MM-HH:MM 구간 ("13:30~14:40", "14:40-15:50")
        const rangeMinMatch = p.match(/(\d{1,2}):(\d{2})\s*[~\-]\s*(\d{1,2}):(\d{2})/);
        if (rangeMinMatch) {
          const rStart = parseInt(rangeMinMatch[1], 10) * 60 + parseInt(rangeMinMatch[2], 10);
          const rEnd   = parseInt(rangeMinMatch[3], 10) * 60 + parseInt(rangeMinMatch[4], 10);
          // 셀과 희망구간이 겹치면 매칭 (시작이 구간 내 또는 구간 경계와 같음)
          if (cellStart >= rStart && cellStart < rEnd) return true;
          // 정확히 일치하는 예약 슬롯 (예: "13:30~14:40" ≡ 셀 "13:30~14:40")
          if (cellStart === rStart) return true;
        }

        // (c) 시간구간 ("오전 10~12", "오후 14~17", "저녁 17~20", "점심 12~14", "12~14", "14-17")
        //     이전 정규식과 겹치지 않도록 HH:MM 패턴 없는 경우에만 시도
        if (!rangeMinMatch) {
          const rangeMatch = p.match(/(\d{1,2})\s*[~\-]\s*(\d{1,2})/);
          if (rangeMatch) {
            const start = parseInt(rangeMatch[1], 10);
            const end   = parseInt(rangeMatch[2], 10);
            if (cellStartHour >= start && cellStartHour < end) return true;
          }
        }

        // (d) 키워드 기반
        if (p.includes("오전") && cellStartHour < 12) return true;
        if (p.includes("점심") && cellStartHour >= 12 && cellStartHour < 14) return true;
        if (p.includes("오후") && cellStartHour >= 12 && cellStartHour < 17) return true;
        if (p.includes("저녁") && cellStartHour >= 17) return true;
        if (p.includes("밤") && cellStartHour >= 19) return true;
      }
    }

    // 3) 희망시간이 비어있으면 요일만 맞으면 매칭 (운영시간 전체)
    if (wishTimes.length === 0 && dayMatched) return true;

    return false;
  }

  // ✅ v3.13.8: HH:MM → 분 변환 헬퍼
  function parseTimeToMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(":").map(x => parseInt(x, 10));
    return (h || 0) * 60 + (m || 0);
  }

  // 해당 셀에 매칭되는 대기자 리스트 (우선순위 순)
  function getMatchedWaiters(day: number, time: string): Waiter[] {
    return waiters.filter(w => matchesWish(w, day, time));
  }

  // 셀 저장
  async function saveCell(day: number, time: string, patch: Partial<MatrixCell>) {
    setSaving(true);
    const existing = getCell(day, time);
    let error;
    if (existing) {
      const r = await supabase.from("slot_matrix").update({
        ...patch, updated_at: new Date().toISOString(),
      }).eq("id", existing.id!);
      error = r.error;
    } else {
      const r = await supabase.from("slot_matrix").insert({
        org_id: orgId, day_of_week: day, time_slot: time,
        status: "closed", ...patch,
      });
      error = r.error;
    }
    if (error) {
      alert("저장 실패: " + error.message);
    } else {
      await loadAll();
    }
    setSaving(false);
  }

  // 셀 상태 변경 (open/closed/fixed)
  async function setCellStatus(day: number, time: string, status: CellStatus) {
    await saveCell(day, time, { status, fixed_name: status === "fixed" ? "" : null, member_id: null });
  }

  // 고정회원 배정 (자동 락)
  async function assignFixedMember(day: number, time: string, member: Member) {
    await saveCell(day, time, {
      status: "fixed",
      fixed_name: member.name,
      member_id: member.id,
    });
    setSelectedCell(null);
    setSearchQuery("");
  }

  // 고정 해제
  async function unlockCell(day: number, time: string) {
    if (!confirm("고정 배정을 해제하고 '빈자리(open)'로 되돌립니다.\n대기자 자동 매칭이 다시 활성화됩니다.")) return;
    await saveCell(day, time, { status: "open", fixed_name: null, member_id: null });
  }

  // 통계
  const stats = useMemo(() => {
    let fixed = 0, open = 0, closed = 0;
    for (let d = 1; d <= 6; d++) {
      for (const t of TIME_SLOTS) {
        const c = getCell(d, t);
        if (!c || c.status === "closed") closed++;
        else if (c.status === "fixed") fixed++;
        else if (c.status === "open") open++;
      }
    }
    // 매칭된 대기자 셀 (open + 매칭자>=1)
    let matchedOpen = 0;
    for (let d = 1; d <= 6; d++) {
      for (const t of TIME_SLOTS) {
        const c = getCell(d, t);
        if (c?.status === "open" && getMatchedWaiters(d, t).length > 0) matchedOpen++;
      }
    }
    return { fixed, open, closed, matchedOpen, waitersCount: waiters.length };
  }, [matrix, waiters]);

  // 검색용 회원 필터 (정규 회원 및 체험완료 대상)
  const searchableMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return members.slice(0, 30);
    return members.filter(m =>
      m.name.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [members, searchQuery]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-aqu-50 text-aqu-600">시간표 로딩 중...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-aqu-50 to-white p-6">
      {/* 헤더 */}
      <div className="max-w-7xl mx-auto mb-6 flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-aqu-900 flex items-center gap-2">
            🎯 고정 시간표 + 대기자 매칭
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            고정회원을 배정하면 <strong>자동 락(🔒)</strong>이 걸리고, 빈자리에만 <strong>대기자가 순위별로 자동 노출</strong>됩니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/schedule" className="px-3 py-2 text-sm bg-white border border-aqu-200 rounded-lg hover:bg-aqu-50">
            📅 일반 시간표
          </Link>
          <HomeButton />
        </div>
      </div>

      {/* KPI */}
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <StatCard color="from-emerald-500 to-teal-500" label="🔒 고정 배정" value={`${stats.fixed}칸`} />
        <StatCard color="from-blue-500 to-cyan-500" label="🟢 빈자리(OPEN)" value={`${stats.open}칸`} />
        <StatCard color="from-orange-500 to-amber-500" label="⭐ 매칭 가능 빈자리" value={`${stats.matchedOpen}칸`} />
        <StatCard color="from-gray-400 to-gray-500" label="⬛ 운영 안함" value={`${stats.closed}칸`} />
        <StatCard color="from-purple-500 to-pink-500" label="⏳ 대기자" value={`${stats.waitersCount}명`} />
      </div>

      {/* 안내 카드 */}
      <div className="max-w-7xl mx-auto mb-4 bg-white border border-aqu-100 rounded-xl p-3 text-xs text-gray-600 flex flex-wrap gap-4">
        <span><strong className="text-emerald-600">🔒 고정</strong> — 회원 배정 완료. 클릭 시 해제</span>
        <span><strong className="text-blue-600">🟢 OPEN</strong> — 빈자리. 대기자 자동 노출</span>
        <span><strong className="text-gray-500">⬛ 운영 안함</strong> — 클릭 시 OPEN 전환</span>
        <span><strong className="text-orange-600">1순위</strong> — 대기자 신청 순서 (가장 오래된 순)</span>
      </div>

      {/* 매트릭스 */}
      <div className="max-w-7xl mx-auto bg-white rounded-xl border border-aqu-100 overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-aqu-500 to-cyan-500 text-white px-4 py-3 flex items-center justify-between">
          <div className="font-bold">📋 주간 시간표 매트릭스</div>
          <div className="text-xs opacity-90">셀 클릭 → 상태 변경 / 회원 배정</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-aqu-50 text-aqu-800">
                <th className="w-24 p-2 border-b border-r border-aqu-100 text-xs">시간대</th>
                {DAYS.map((d, idx) => (
                  <th key={d} className={`p-2 border-b border-r border-aqu-100 text-xs font-bold ${idx === 5 ? "bg-orange-50" : ""}`}>
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map((time) => (
                <tr key={time} className="hover:bg-aqu-50/30">
                  <td className="p-2 border-b border-r border-aqu-100 text-xs font-medium text-aqu-700 bg-aqu-50/50">
                    {time}
                  </td>
                  {DAYS.map((_, idx) => {
                    const day = idx + 1; // 1..6
                    const cell = getCell(day, time);
                    const status: CellStatus = cell?.status || "closed";
                    const matched = status === "open" ? getMatchedWaiters(day, time) : [];
                    return (
                      <td key={`${day}-${time}`}
                        className={`p-1 border-b border-r border-aqu-100 align-top cursor-pointer min-w-[120px] transition-colors
                          ${status === "fixed" ? "bg-emerald-50 hover:bg-emerald-100" : ""}
                          ${status === "open" ? "bg-blue-50 hover:bg-blue-100" : ""}
                          ${status === "closed" ? "bg-gray-100 hover:bg-gray-200" : ""}
                        `}
                        onClick={() => setSelectedCell({ day, time })}
                      >
                        {status === "fixed" && (
                          <div className="text-xs">
                            <div className="flex items-center gap-1 text-emerald-800 font-semibold">
                              <Lock className="w-3 h-3" /> {cell?.fixed_name || "고정"}
                            </div>
                            {cell?.note && <div className="text-[10px] text-gray-500 mt-0.5">{cell.note}</div>}
                          </div>
                        )}
                        {status === "open" && (
                          <div className="text-xs">
                            <div className="text-blue-700 font-semibold mb-0.5">🟢 OPEN</div>
                            {matched.length === 0 ? (
                              <div className="text-[10px] text-gray-400 italic">대기자 없음</div>
                            ) : (
                              <div className="space-y-0.5">
                                {matched.slice(0, 3).map((w, i) => (
                                  <div key={w.id} className="text-[11px] flex items-center gap-1">
                                    <span className={`inline-block w-4 h-4 rounded-full text-white text-[9px] text-center font-bold leading-4 ${i === 0 ? "bg-red-500" : i === 1 ? "bg-orange-500" : "bg-gray-400"}`}>
                                      {w.priority}
                                    </span>
                                    <span className="truncate">{w.name}</span>
                                  </div>
                                ))}
                                {matched.length > 3 && <div className="text-[10px] text-gray-500">+{matched.length - 3}명</div>}
                              </div>
                            )}
                          </div>
                        )}
                        {status === "closed" && (
                          <div className="text-[10px] text-gray-400 text-center">⬛ 운영 안함</div>
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

      {/* 셀 편집 모달 */}
      {selectedCell && (
        <CellEditor
          day={selectedCell.day}
          time={selectedCell.time}
          cell={getCell(selectedCell.day, selectedCell.time)}
          matchedWaiters={getMatchedWaiters(selectedCell.day, selectedCell.time)}
          searchableMembers={searchableMembers}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          saving={saving}
          onClose={() => { setSelectedCell(null); setSearchQuery(""); }}
          onSetStatus={(s) => setCellStatus(selectedCell.day, selectedCell.time, s)}
          onAssign={(m) => assignFixedMember(selectedCell.day, selectedCell.time, m)}
          onUnlock={() => unlockCell(selectedCell.day, selectedCell.time)}
        />
      )}
    </div>
  );
}

// ─────────── 서브 컴포넌트 ───────────
function StatCard({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className={`bg-gradient-to-br ${color} rounded-xl p-3 text-white shadow-sm`}>
      <div className="text-xs opacity-90">{label}</div>
      <div className="text-xl font-bold mt-0.5">{value}</div>
    </div>
  );
}

function CellEditor(props: any) {
  const { day, time, cell, matchedWaiters, searchableMembers, searchQuery, setSearchQuery, saving, onClose, onSetStatus, onAssign, onUnlock } = props;
  const status: CellStatus = cell?.status || "closed";
  const dayName = DAYS[day - 1];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="sticky top-0 bg-gradient-to-r from-aqu-500 to-cyan-500 text-white px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold">📍 {dayName}요일 {time}</h2>
            <p className="text-xs opacity-90">
              현재 상태:
              <span className="ml-1 font-semibold">
                {status === "fixed" ? `🔒 ${cell?.fixed_name || "고정"}` : status === "open" ? "🟢 OPEN (빈자리)" : "⬛ 운영 안함"}
              </span>
            </p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">✕</button>
        </div>

        <div className="p-6 space-y-5">
          {/* 상태 전환 버튼 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">1️⃣ 셀 상태</h3>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => onSetStatus("open")} disabled={saving || status === "open"}
                className={`px-3 py-2 text-sm rounded-lg border ${status === "open" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-blue-700 border-blue-200 hover:bg-blue-50"} disabled:opacity-50`}>
                🟢 OPEN (빈자리)
              </button>
              <button onClick={() => onSetStatus("closed")} disabled={saving || status === "closed"}
                className={`px-3 py-2 text-sm rounded-lg border ${status === "closed" ? "bg-gray-500 text-white border-gray-500" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"} disabled:opacity-50`}>
                ⬛ 운영 안함
              </button>
              {status === "fixed" && (
                <button onClick={onUnlock} disabled={saving}
                  className="px-3 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center gap-1">
                  <Unlock className="w-4 h-4" /> 고정 해제
                </button>
              )}
            </div>
          </section>

          {/* 고정 회원 배정 */}
          {status !== "closed" && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                2️⃣ 고정 회원 배정 <span className="text-xs text-gray-500">(배정 시 자동으로 🔒 락됩니다)</span>
              </h3>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="회원 이름 검색..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-aqu-500"
                />
              </div>
              <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-lg divide-y">
                {searchableMembers.length === 0 && (
                  <div className="p-3 text-xs text-gray-500 text-center">검색 결과 없음</div>
                )}
                {searchableMembers.map((m: any) => (
                  <button key={m.id} onClick={() => onAssign(m)} disabled={saving}
                    className="w-full px-3 py-2 text-left hover:bg-emerald-50 flex items-center justify-between disabled:opacity-50">
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{m.member_type === "child" ? "🧒" : "👤"}</span>
                      <span className="text-sm font-medium">{m.name}</span>
                      <span className="text-[10px] text-gray-500">{m.status}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* 매칭 대기자 리스트 */}
          {status === "open" && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <Users className="w-4 h-4" /> 3️⃣ 이 시간대 대기자 순위
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{matchedWaiters.length}명</span>
              </h3>
              {matchedWaiters.length === 0 ? (
                <div className="p-3 text-xs text-gray-500 text-center bg-gray-50 rounded-lg">
                  이 시간을 희망한 대기자가 없습니다
                </div>
              ) : (
                <div className="space-y-1.5">
                  {matchedWaiters.map((w: Waiter, i: number) => (
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
                        🔒 이 회원으로 고정
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
