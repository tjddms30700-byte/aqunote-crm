"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Calendar, Plus, X, Home, ChevronLeft, ChevronRight,
  Clock, User, DollarSign, Trash2, Check, XCircle,
  AlertCircle, Ban, Repeat, ArrowLeftRight, Grid3x3, LayoutGrid
} from "lucide-react";

/* ═════ 상수 ═════ */
const DAYS_KR = ["일", "월", "화", "수", "목", "금", "토"];
const DAYS_WEEK = ["월", "화", "수", "목", "금", "토"];
const TIMES = [
  "10:00", "11:00", "13:00", "14:00", "15:00",
  "16:00", "17:00", "18:00", "19:00", "20:00"
];

const STATUS_OPTIONS = [
  { value: "scheduled", label: "예약",  color: "bg-blue-100 text-blue-800 border-blue-300",     dot: "bg-blue-500" },
  { value: "done",      label: "완료",  color: "bg-green-100 text-green-800 border-green-300",  dot: "bg-green-500" },
  { value: "sick",      label: "병결",  color: "bg-orange-100 text-orange-800 border-orange-300", dot: "bg-orange-500" },
  { value: "cancel",    label: "취소",  color: "bg-gray-100 text-gray-700 border-gray-300",      dot: "bg-gray-400" },
  { value: "noshow",    label: "노쇼",  color: "bg-red-100 text-red-800 border-red-300",         dot: "bg-red-500" },
  { value: "carryover", label: "이월",  color: "bg-purple-100 text-purple-800 border-purple-300", dot: "bg-purple-500" },
];
function statusMeta(s: string) {
  return STATUS_OPTIONS.find(x => x.value === s) || STATUS_OPTIONS[0];
}

/* ═════ 유틸 ═════ */
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function todayStr() { return ymd(new Date()); }

// 월 그리드용 6주 × 7일 배열 생성
function monthGrid(year: number, month0: number) {
  const first = new Date(year, month0, 1);
  const firstWeekday = first.getDay(); // 0=Sun
  const start = new Date(year, month0, 1 - firstWeekday);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return cells;
}

/* ═════ 컴포넌트 ═════ */
export default function SchedulePage() {
  const [view, setView] = useState<"month" | "week">("month");
  const [year, setYear]     = useState(new Date().getFullYear());
  const [month0, setMonth0] = useState(new Date().getMonth()); // 0-based
  const [selectedDate, setSelectedDate] = useState(todayStr());

  const [slots, setSlots]       = useState<any[]>([]);
  const [members, setMembers]   = useState<any[]>([]);
  const [staff, setStaff]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  // Modal
  const [modal, setModal] = useState<{date: string, time?: string, editing?: any} | null>(null);
  const [f, setF]         = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [sRes, mRes, stRes] = await Promise.all([
      supabase.from("schedule_slots").select("*").order("event_date").order("time_slot"),
      supabase.from("members").select("id, name, member_type").is("deleted_at", null).order("name"),
      supabase.from("staff").select("id, name, role").order("name"),
    ]);
    setSlots(sRes.data || []);
    setMembers(mRes.data || []);
    setStaff(stRes.data || []);
    setLoading(false);
  }

  /* 월 이동 */
  function prevMonth() {
    if (month0 === 0) { setYear(year - 1); setMonth0(11); }
    else setMonth0(month0 - 1);
  }
  function nextMonth() {
    if (month0 === 11) { setYear(year + 1); setMonth0(0); }
    else setMonth0(month0 + 1);
  }
  function goToday() {
    const d = new Date();
    setYear(d.getFullYear()); setMonth0(d.getMonth());
    setSelectedDate(todayStr());
  }

  /* 날짜별 슬롯 그룹 */
  const slotsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    slots.forEach(s => {
      if (!s.event_date) return;
      if (!map[s.event_date]) map[s.event_date] = [];
      map[s.event_date].push(s);
    });
    // 시간 순 정렬
    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => (a.time_slot || "").localeCompare(b.time_slot || ""));
    });
    return map;
  }, [slots]);

  /* 월간 셀 데이터 */
  const monthCells = useMemo(() => monthGrid(year, month0), [year, month0]);

  /* 이번달 합계 */
  const monthTotal = useMemo(() => {
    const prefix = `${year}-${String(month0+1).padStart(2,"0")}`;
    const monthSlots = slots.filter(s => (s.event_date || "").startsWith(prefix));
    return {
      total: monthSlots.length,
      done: monthSlots.filter(s => s.status === "done").length,
      scheduled: monthSlots.filter(s => s.status === "scheduled" || !s.status).length,
      sick: monthSlots.filter(s => s.status === "sick").length,
      cancel: monthSlots.filter(s => s.status === "cancel").length,
      noshow: monthSlots.filter(s => s.status === "noshow").length,
      revenue: monthSlots.filter(s => s.event_type === "revenue").reduce((a,b) => a + (b.amount || 0), 0),
    };
  }, [slots, year, month0]);

  /* 모달 열기 */
  function openNewModal(date: string, time?: string) {
    setF({
      event_date: date,
      time_slot: time || "10:00",
      event_type: "lesson",
      member_id: "",
      staff_id: "",
      lesson_name: "",
      status: "scheduled",
      note: "",
      amount: 0,
    });
    setModal({ date, time });
  }

  function openEditModal(slot: any) {
    setF({
      id: slot.id,
      event_date: slot.event_date,
      time_slot: slot.time_slot || "10:00",
      event_type: slot.event_type || "lesson",
      member_id: slot.member_id || "",
      staff_id: slot.staff_id || "",
      lesson_name: slot.lesson_name || "",
      status: slot.status || "scheduled",
      note: slot.note || "",
      amount: slot.amount || 0,
    });
    setModal({ date: slot.event_date, time: slot.time_slot, editing: slot });
  }

  async function saveSlot() {
    if (!f.event_date) { alert("날짜가 필요합니다"); return; }
    setSaving(true);

    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const d = new Date(f.event_date);
    const dow = d.getDay() === 0 ? 7 : d.getDay(); // 월=1 ~ 일=7

    const payload: any = {
      event_date: f.event_date,
      time_slot: f.time_slot,
      event_type: f.event_type,
      status: f.status,
      lesson_name: f.lesson_name || null,
      note: f.note || null,
      day_of_week: dow,
    };
    if (orgId) payload.org_id = orgId;
    if (f.member_id) payload.member_id = f.member_id;
    if (f.staff_id) payload.staff_id = f.staff_id;
    if (f.event_type === "revenue") payload.amount = Number(f.amount || 0);

    const { error } = f.id
      ? await supabase.from("schedule_slots").update(payload).eq("id", f.id)
      : await supabase.from("schedule_slots").insert(payload);

    if (error) alert("저장 실패: " + error.message);
    else {
      setModal(null);
      await loadAll();
    }
    setSaving(false);
  }

  async function deleteSlot(id: string) {
    if (!confirm("이 일정을 삭제할까요?")) return;
    await supabase.from("schedule_slots").delete().eq("id", id);
    await loadAll();
  }

  async function quickStatus(slot: any, newStatus: string) {
    await supabase.from("schedule_slots").update({ status: newStatus }).eq("id", slot.id);
    await loadAll();
  }

  function memberName(id: string) {
    return members.find(m => m.id === id)?.name || "";
  }
  function staffName(id: string) {
    return staff.find(s => s.id === id)?.name || "";
  }

  /* 주간 뷰용 슬롯 필터 */
  const weekSlots = useMemo(() => {
    // 이번 주 (월~토) 계산
    const today = new Date(year, month0, 1); // 표시월의 1일 기준으로 이번주 아님 → 별도 처리
    return slots;
  }, [slots, year, month0]);

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-4 md:py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-aqu-600 hover:text-aqu-800 flex items-center gap-1 text-sm">
            <Home className="w-4 h-4" /> 홈
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl md:text-2xl font-bold text-aqu-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-green-500" /> 시간표
          </h1>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-2">
          <div className="flex bg-white border border-aqu-100 rounded-lg p-1 text-xs">
            <button onClick={() => setView("month")}
              className={`px-3 py-1.5 rounded flex items-center gap-1 ${view === "month" ? "bg-aqu-600 text-white" : "text-gray-600"}`}>
              <LayoutGrid className="w-3.5 h-3.5" /> 월간
            </button>
            <button onClick={() => setView("week")}
              className={`px-3 py-1.5 rounded flex items-center gap-1 ${view === "week" ? "bg-aqu-600 text-white" : "text-gray-600"}`}>
              <Grid3x3 className="w-3.5 h-3.5" /> 주간
            </button>
          </div>
          <button onClick={() => openNewModal(selectedDate)}
            className="bg-aqu-600 hover:bg-aqu-700 text-white px-3 py-1.5 rounded-lg text-xs md:text-sm flex items-center gap-1">
            <Plus className="w-4 h-4" /> 예약
          </button>
        </div>
      </div>

      {/* 상단 네비 */}
      <div className="flex items-center justify-between mb-3 bg-white rounded-xl border border-aqu-100 p-2 md:p-3">
        <button onClick={prevMonth} className="p-2 hover:bg-aqu-50 rounded-lg">
          <ChevronLeft className="w-5 h-5 text-aqu-700" />
        </button>
        <div className="flex items-center gap-3">
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="text-sm md:text-base font-bold text-aqu-900 border-none focus:outline-none cursor-pointer bg-transparent">
            {Array.from({length: 10}).map((_, i) => {
              const y = new Date().getFullYear() - 3 + i;
              return <option key={y} value={y}>{y}년</option>;
            })}
          </select>
          <select value={month0} onChange={e => setMonth0(parseInt(e.target.value))}
            className="text-sm md:text-base font-bold text-aqu-900 border-none focus:outline-none cursor-pointer bg-transparent">
            {Array.from({length: 12}).map((_, i) => (
              <option key={i} value={i}>{i+1}월</option>
            ))}
          </select>
          <button onClick={goToday}
            className="text-xs px-2 py-1 bg-aqu-50 border border-aqu-200 rounded text-aqu-700 hover:bg-aqu-100">
            오늘
          </button>
        </div>
        <button onClick={nextMonth} className="p-2 hover:bg-aqu-50 rounded-lg">
          <ChevronRight className="w-5 h-5 text-aqu-700" />
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 md:grid-cols-7 gap-2 mb-3 text-xs">
        <MonthKPI label="총 일정" val={monthTotal.total + ""} color="text-aqu-700" />
        <MonthKPI label="✓ 완료"  val={monthTotal.done + ""} color="text-green-600" />
        <MonthKPI label="예약"    val={monthTotal.scheduled + ""} color="text-blue-600" />
        <MonthKPI label="병결"    val={monthTotal.sick + ""} color="text-orange-600" />
        <MonthKPI label="취소"    val={monthTotal.cancel + ""} color="text-gray-600" />
        <MonthKPI label="노쇼"    val={monthTotal.noshow + ""} color="text-red-600" />
        <MonthKPI label="💰매출"  val={monthTotal.revenue > 0 ? "₩" + monthTotal.revenue.toLocaleString() : "-"} color="text-pink-600" />
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">로딩 중...</div>
      ) : view === "month" ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3">
          {/* ═══ 월간 캘린더 ═══ */}
          <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 border-b border-aqu-100 bg-aqu-50">
              {DAYS_KR.map((d, i) => (
                <div key={d} className={`p-2 text-center text-xs md:text-sm font-semibold ${i===0 ? "text-red-500" : i===6 ? "text-blue-500" : "text-aqu-800"}`}>
                  {d}
                </div>
              ))}
            </div>

            {/* 6주 × 7일 그리드 */}
            <div className="grid grid-cols-7">
              {monthCells.map((cell, idx) => {
                const cellStr = ymd(cell);
                const isOtherMonth = cell.getMonth() !== month0;
                const isToday = cellStr === todayStr();
                const isSelected = cellStr === selectedDate;
                const daySlots = slotsByDate[cellStr] || [];
                const dow = cell.getDay();

                // 그날 총액
                const dayRevenue = daySlots.filter(s => s.event_type === "revenue").reduce((a,b) => a + (b.amount || 0), 0);

                return (
                  <div key={idx}
                    onClick={() => setSelectedDate(cellStr)}
                    className={`min-h-[80px] md:min-h-[110px] border-r border-b border-gray-100 p-1 md:p-1.5 cursor-pointer transition
                      ${isOtherMonth ? "bg-gray-50/50 text-gray-400" : "bg-white"}
                      ${isSelected ? "ring-2 ring-aqu-400 ring-inset" : "hover:bg-aqu-50/30"}
                    `}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-xs md:text-sm font-semibold ${
                        isToday ? "bg-aqu-600 text-white rounded-full w-5 h-5 md:w-6 md:h-6 flex items-center justify-center" :
                        dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : ""
                      }`}>
                        {cell.getDate()}
                      </span>
                      {daySlots.length > 0 && (
                        <span className="text-[9px] md:text-[10px] text-gray-500 font-medium">
                          {daySlots.length}
                        </span>
                      )}
                    </div>

                    {/* 그날의 슬롯 (최대 3개 표시) */}
                    <div className="space-y-0.5 overflow-hidden">
                      {daySlots.slice(0, 3).map(s => {
                        const meta = statusMeta(s.status || "scheduled");
                        return (
                          <div key={s.id}
                            onClick={(e) => { e.stopPropagation(); openEditModal(s); }}
                            className={`text-[9px] md:text-[10px] px-1 py-0.5 rounded border truncate ${meta.color} hover:shadow-sm`}
                            title={`${s.time_slot} ${memberName(s.member_id) || s.lesson_name || ""}`}>
                            <span className="font-mono opacity-70">{s.time_slot?.slice(0,5)}</span>
                            <span className="ml-0.5">
                              {memberName(s.member_id) || s.lesson_name || (s.event_type === "revenue" ? "💰" + (s.amount||0)/1000 + "k" : "일정")}
                            </span>
                          </div>
                        );
                      })}
                      {daySlots.length > 3 && (
                        <div className="text-[9px] md:text-[10px] text-gray-500 pl-1">
                          +{daySlots.length - 3} 더보기
                        </div>
                      )}
                      {dayRevenue > 0 && (
                        <div className="text-[9px] md:text-[10px] text-pink-600 font-bold text-right">
                          ₩{dayRevenue.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ═══ 오른쪽 사이드바 (선택 날짜 상세) ═══ */}
          <aside className="space-y-3">
            {/* 미니 달력 */}
            <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-3">
              <div className="flex items-center justify-between mb-2">
                <button onClick={prevMonth} className="p-1 hover:bg-aqu-50 rounded">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-sm font-bold text-aqu-900">{year}년 {month0+1}월</div>
                <button onClick={nextMonth} className="p-1 hover:bg-aqu-50 rounded">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-[10px]">
                {DAYS_KR.map((d, i) => (
                  <div key={d} className={`text-center py-1 font-medium ${i===0 ? "text-red-400" : i===6 ? "text-blue-400" : "text-gray-500"}`}>
                    {d}
                  </div>
                ))}
                {monthCells.map((c, i) => {
                  const cs = ymd(c);
                  const has = (slotsByDate[cs] || []).length > 0;
                  const isSel = cs === selectedDate;
                  const isT = cs === todayStr();
                  const isOther = c.getMonth() !== month0;
                  return (
                    <button key={i} onClick={() => setSelectedDate(cs)}
                      className={`aspect-square text-center rounded flex flex-col items-center justify-center relative transition
                        ${isSel ? "bg-aqu-600 text-white font-bold" :
                          isT ? "bg-aqu-100 text-aqu-900 font-bold" :
                          isOther ? "text-gray-300" : "text-gray-700 hover:bg-aqu-50"}
                      `}>
                      <span>{c.getDate()}</span>
                      {has && !isSel && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-aqu-500"></span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 선택 날짜 상세 패널 */}
            <SelectedDayPanel
              date={selectedDate}
              slots={slotsByDate[selectedDate] || []}
              memberName={memberName}
              staffName={staffName}
              onAdd={() => openNewModal(selectedDate)}
              onEdit={openEditModal}
              onQuickStatus={quickStatus}
              onDelete={deleteSlot}
            />
          </aside>
        </div>
      ) : (
        /* ═══ 주간 뷰 ═══ */
        <WeekView
          year={year} month0={month0}
          slots={slots}
          members={members} staff={staff}
          onCellClick={(date, time) => openNewModal(date, time)}
          onEdit={openEditModal}
          onDelete={deleteSlot}
          memberName={memberName}
          staffName={staffName}
        />
      )}

      {/* ═══ 등록/수정 모달 ═══ */}
      {modal && (
        <SlotModal
          f={f} setF={setF}
          modal={modal}
          members={members} staff={staff}
          onClose={() => setModal(null)}
          onSave={saveSlot}
          onDelete={f.id ? () => deleteSlot(f.id) : undefined}
          saving={saving}
        />
      )}
    </main>
  );
}

/* ═════ 선택 날짜 상세 패널 ═════ */
function SelectedDayPanel({ date, slots, memberName, staffName, onAdd, onEdit, onQuickStatus, onDelete }: any) {
  const d = new Date(date);
  const dayLabel = `${d.getMonth()+1}월 ${d.getDate()}일 (${DAYS_KR[d.getDay()]})`;

  return (
    <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-aqu-900 text-sm">{dayLabel}</h3>
        <button onClick={onAdd}
          className="text-xs bg-aqu-600 hover:bg-aqu-700 text-white px-2 py-1 rounded flex items-center gap-1">
          <Plus className="w-3 h-3" /> 추가
        </button>
      </div>

      {slots.length === 0 ? (
        <div className="text-center py-6 text-xs text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
          예약이 없습니다<br/>클릭하여 추가하세요
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
          {slots.map((s: any) => {
            const meta = statusMeta(s.status || "scheduled");
            return (
              <div key={s.id} className={`border rounded-lg p-2 ${meta.color} border-opacity-50`}>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-mono text-xs font-bold">{s.time_slot?.slice(0,5)}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium`}>
                    {meta.label}
                  </span>
                </div>
                <div className="text-xs">
                  {memberName(s.member_id) && (
                    <div className="font-medium flex items-center gap-1">
                      <User className="w-3 h-3" /> {memberName(s.member_id)}
                    </div>
                  )}
                  {staffName(s.staff_id) && (
                    <div className="text-[10px] opacity-80">👤 {staffName(s.staff_id)}</div>
                  )}
                  {s.lesson_name && (
                    <div className="text-[10px] opacity-80">📚 {s.lesson_name}</div>
                  )}
                  {s.amount > 0 && (
                    <div className="text-[10px] font-bold">💰 ₩{s.amount.toLocaleString()}</div>
                  )}
                  {s.note && (
                    <div className="text-[10px] opacity-70 italic mt-0.5">💬 {s.note}</div>
                  )}
                </div>

                {/* 상태 빠른변경 */}
                <div className="flex flex-wrap gap-0.5 mt-1.5 pt-1.5 border-t border-white/50">
                  {STATUS_OPTIONS.map(st => (
                    <button key={st.value} onClick={() => onQuickStatus(s, st.value)}
                      className={`text-[9px] px-1 py-0.5 rounded ${s.status === st.value ? "bg-white/70 font-bold" : "bg-white/30 hover:bg-white/60"}`}
                      title={st.label}>
                      {st.label}
                    </button>
                  ))}
                  <button onClick={() => onEdit(s)}
                    className="text-[9px] px-1 py-0.5 rounded bg-white/30 hover:bg-white/60 ml-auto">
                    ✎
                  </button>
                  <button onClick={() => onDelete(s.id)}
                    className="text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-600 hover:bg-red-200">
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 상태 범례 */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="text-[10px] text-gray-500 mb-1">상태 색상</div>
        <div className="grid grid-cols-3 gap-1">
          {STATUS_OPTIONS.map(s => (
            <div key={s.value} className="flex items-center gap-1 text-[10px]">
              <span className={`w-2 h-2 rounded-full ${s.dot}`}></span>
              <span className="text-gray-600">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═════ 주간 뷰 컴포넌트 ═════ */
function WeekView({ year, month0, slots, members, staff, onCellClick, onEdit, onDelete, memberName, staffName }: any) {
  // 이번주 (월~토) 날짜 계산
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const dow = now.getDay(); // 0=Sun ~ 6=Sat
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    return monday;
  });

  const weekDates = Array.from({length: 6}).map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  function shiftWeek(delta: number) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + delta * 7);
    setWeekStart(d);
  }

  function slotsAt(date: string, time: string) {
    return slots.filter((s: any) => s.event_date === date && s.time_slot === time);
  }

  return (
    <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
      <div className="flex items-center justify-between p-2 md:p-3 border-b border-aqu-100 bg-aqu-50">
        <button onClick={() => shiftWeek(-1)} className="p-1.5 hover:bg-white rounded">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-xs md:text-sm font-bold text-aqu-800">
          {ymd(weekDates[0])} ~ {ymd(weekDates[5])}
        </div>
        <button onClick={() => shiftWeek(1)} className="p-1.5 hover:bg-white rounded">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs md:text-sm">
          <thead>
            <tr className="border-b border-aqu-100">
              <th className="p-2 text-left w-14 md:w-20 bg-aqu-50">시간</th>
              {weekDates.map((d, i) => (
                <th key={i} className={`p-2 text-center min-w-[100px] bg-aqu-50 ${i===5 ? "text-blue-600" : "text-aqu-800"}`}>
                  <div className="text-[10px] md:text-xs">{DAYS_WEEK[i]}</div>
                  <div className="text-xs md:text-sm font-bold">{d.getMonth()+1}/{d.getDate()}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIMES.map(time => (
              <tr key={time} className="border-b border-gray-100">
                <td className="p-2 font-medium text-gray-700 bg-gray-50 text-xs">{time}</td>
                {weekDates.map((d, di) => {
                  const dateStr = ymd(d);
                  const cellSlots = slotsAt(dateStr, time);
                  return (
                    <td key={di} className="p-1 align-top border-l border-gray-100">
                      <div className="space-y-1">
                        {cellSlots.map((s: any) => {
                          const meta = statusMeta(s.status || "scheduled");
                          return (
                            <div key={s.id}
                              onClick={() => onEdit(s)}
                              className={`text-[10px] p-1 rounded border ${meta.color} cursor-pointer hover:shadow-sm`}>
                              <div className="font-medium truncate">
                                {memberName(s.member_id) || s.lesson_name || "일정"}
                              </div>
                              {s.status && s.status !== "scheduled" && (
                                <div className="text-[9px] opacity-70">{meta.label}</div>
                              )}
                            </div>
                          );
                        })}
                        <button onClick={() => onCellClick(dateStr, time)}
                          className="w-full text-gray-400 hover:text-aqu-600 hover:bg-aqu-50 rounded border border-dashed border-gray-200 py-0.5">
                          <Plus className="w-3 h-3 inline" />
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═════ 등록/수정 모달 ═════ */
function SlotModal({ f, setF, modal, members, staff, onClose, onSave, onDelete, saving }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-aqu-900">
            {modal.editing ? "일정 수정" : "새 일정"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="날짜 *">
              <input type="date" value={f.event_date}
                onChange={e => setF({ ...f, event_date: e.target.value })}
                className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
            </Field>
            <Field label="시간 *">
              <input type="time" value={f.time_slot}
                onChange={e => setF({ ...f, time_slot: e.target.value })}
                className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
            </Field>
          </div>

          <Field label="유형">
            <select value={f.event_type} onChange={e => setF({ ...f, event_type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
              <option value="lesson">🏊 수업</option>
              <option value="trial">🎯 체험</option>
              <option value="revenue">💰 매출 등록</option>
              <option value="staff_work">👤 직원 근무</option>
              <option value="staff_off">🏖️ 직원 휴무</option>
              <option value="other">📌 기타</option>
            </select>
          </Field>

          {(f.event_type === "lesson" || f.event_type === "trial" || f.event_type === "revenue") && (
            <Field label="회원">
              <select value={f.member_id} onChange={e => setF({ ...f, member_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
                <option value="">-- 회원 선택 --</option>
                {members.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.member_type === "child" ? "아동" : "성인"})
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="담당 강사">
            <select value={f.staff_id} onChange={e => setF({ ...f, staff_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
              <option value="">-- 강사 선택 --</option>
              {staff.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name} ({s.role || "직원"})</option>
              ))}
            </select>
          </Field>

          <Field label="수업명 / 제목">
            <input type="text" value={f.lesson_name}
              onChange={e => setF({ ...f, lesson_name: e.target.value })}
              placeholder="예: 수중프로그램 30회권"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
          </Field>

          {f.event_type === "revenue" && (
            <Field label="금액 (원)">
              <input type="number" value={f.amount}
                onChange={e => setF({ ...f, amount: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
            </Field>
          )}

          <Field label="상태">
            <div className="grid grid-cols-3 gap-1">
              {STATUS_OPTIONS.map(st => (
                <button key={st.value} type="button"
                  onClick={() => setF({ ...f, status: st.value })}
                  className={`py-2 px-2 rounded-lg border text-xs ${f.status === st.value ? st.color + " font-bold shadow-sm" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                  {st.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="메모">
            <input type="text" value={f.note}
              onChange={e => setF({ ...f, note: e.target.value })}
              placeholder="예: 컨디션 나빠 30분 조기 종료"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
          </Field>
        </div>

        <div className="flex gap-2 mt-5">
          {onDelete && (
            <button onClick={() => { if(confirm("삭제할까요?")) { onDelete(); onClose(); } }}
              className="px-3 py-2 border border-red-200 text-red-500 rounded-lg text-sm hover:bg-red-50">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} disabled={saving}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            취소
          </button>
          <button onClick={onSave} disabled={saving}
            className="flex-1 px-4 py-2 bg-aqu-600 text-white rounded-lg text-sm hover:bg-aqu-700 disabled:opacity-50">
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MonthKPI({ label, val, color }: any) {
  return (
    <div className="bg-white p-2 rounded-lg border border-aqu-100 text-center">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className={`text-sm md:text-base font-bold ${color}`}>{val}</div>
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
