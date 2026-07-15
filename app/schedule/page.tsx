"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { supabase } from "@/lib/supabase";
import {
  Calendar, Plus, X, Home, ChevronLeft, ChevronRight,
  Clock, User, DollarSign, Trash2, Check, XCircle,
  AlertCircle, Ban, Repeat, ArrowLeftRight, Grid3x3, LayoutGrid,
  Move
} from "lucide-react";

/* ═════ 상수 ═════ */
const DAYS_KR = ["일", "월", "화", "수", "목", "금", "토"];
const DAYS_WEEK = ["월", "화", "수", "목", "금", "토"];
const TIMES = [
  "10:00", "11:00", "13:00", "14:00", "15:00",
  "16:00", "17:00", "18:00", "19:00", "20:00"
];

const STATUS_OPTIONS = [
  { value: "scheduled", label: "예약",  color: "bg-blue-100 text-blue-800 border-blue-300",     dot: "bg-blue-500",   textColor: "text-blue-700" },
  { value: "done",      label: "완료",  color: "bg-green-100 text-green-800 border-green-300",  dot: "bg-green-500",  textColor: "text-green-700" },
  { value: "sick",      label: "병결",  color: "bg-orange-100 text-orange-800 border-orange-300", dot: "bg-orange-500", textColor: "text-orange-700" },
  { value: "cancel",    label: "취소",  color: "bg-gray-100 text-gray-700 border-gray-300",      dot: "bg-gray-400",   textColor: "text-gray-700" },
  { value: "noshow",    label: "노쇼",  color: "bg-red-100 text-red-800 border-red-300",         dot: "bg-red-500",    textColor: "text-red-700" },
  { value: "carryover", label: "이월",  color: "bg-purple-100 text-purple-800 border-purple-300", dot: "bg-purple-500", textColor: "text-purple-700" },
];
function statusMeta(s: string) {
  return STATUS_OPTIONS.find(x => x.value === s) || STATUS_OPTIONS[0];
}

/* ═════ 유틸 ═════ */
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function todayStr() { return ymd(new Date()); }
function uuid() {
  // Simple UUID v4 generator (browser has crypto.randomUUID but fall back for safety)
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) return (crypto as any).randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// 월 그리드용 6주 × 7일 배열 생성
function monthGrid(year: number, month0: number) {
  const first = new Date(year, month0, 1);
  const firstWeekday = first.getDay();
  const start = new Date(year, month0, 1 - firstWeekday);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return cells;
}

/* ═════ 메인 컴포넌트 ═════ */
export default function SchedulePage() {
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [year, setYear]     = useState(new Date().getFullYear());
  const [month0, setMonth0] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(todayStr());

  const [slots, setSlots]     = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [staff, setStaff]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [modal, setModal] = useState<{date: string, time?: string, editing?: any} | null>(null);
  const [f, setF]         = useState<any>({});
  const [saving, setSaving] = useState(false);

  // Drag & drop
  const [dragging, setDragging] = useState<any | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  // Quick action sheet (예약 클릭 시)
  const [quickAction, setQuickAction] = useState<any | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);

  useEffect(() => { loadAll(); }, []);

  const [plans, setPlans] = useState<any[]>([]);

  async function loadAll() {
    setLoading(true);
    const [sRes, mRes, stRes, pRes, aRes, plRes] = await Promise.all([
      supabase.from("schedule_slots").select("*").order("event_date").order("time_slot"),
      supabase.from("members").select("id, name, member_type, status, phone").is("deleted_at", null).order("name"),
      supabase.from("staff").select("id, name, role").order("name"),
      supabase.from("payments").select("*").order("paid_at", { ascending: false }),
      supabase.from("attendance").select("*"),
      supabase.from("membership_plans").select("*").eq("is_active", true).order("sort_order"),
    ]);
    setSlots(sRes.data || []);
    setMembers(mRes.data || []);
    setStaff(stRes.data || []);
    setPayments(pRes.data || []);
    setAttendance(aRes.data || []);
    setPlans(plRes.data || []);
    setLoading(false);
  }

  // 예약 클릭 시 액션 시트 열기
  function openQuickAction(slot: any) {
    setQuickAction(slot);
  }

  // 출결 상태 변경
  async function setAttendanceStatus(slot: any, status: "present" | "absent" | "sick") {
    if (!slot.member_id || !slot.event_date) {
      alert("회원/날짜 정보가 없는 예약입니다.");
      return;
    }
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    // upsert
    const existing = attendance.find((a: any) => a.member_id === slot.member_id && a.date === slot.event_date);
    if (existing) {
      const { error } = await supabase.from("attendance").update({ status, slot_id: slot.id }).eq("id", existing.id).select();
      if (error) return alert("오류: " + error.message);
    } else {
      const { error } = await supabase.from("attendance").insert({
        org_id: orgId, member_id: slot.member_id, date: slot.event_date, status, slot_id: slot.id,
      }).select();
      if (error) return alert("오류: " + error.message);
    }
    // schedule_slots의 status도 동기화
    const scheduleStatus = status === "present" ? "completed" : status === "absent" ? "cancelled" : "sick";
    await supabase.from("schedule_slots").update({ status: scheduleStatus }).eq("id", slot.id);
    await loadAll();
    alert(status === "present" ? "✅ 출석" : status === "absent" ? "⚠️ 결석" : "🤒 병결");
  }

  // 결제 추가 (상세 필드 포함)
  async function addPaymentFromSlot(slot: any, payment: any) {
    if (!slot.member_id) { alert("회원 정보가 없습니다."); return; }
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const { error } = await supabase.from("payments").insert({
      org_id: orgId,
      member_id: slot.member_id,
      amount: payment.amount,
      method: payment.method,
      lesson_name: payment.lesson_name,
      plan_id: payment.plan_id || null,
      card_number: payment.card_number || null,
      approval_no: payment.approval_no || null,
      paid_time: payment.paid_time || null,
      paid_at: new Date().toISOString(),
      event_date: slot.event_date,
      slot_id: slot.id,
    }).select();
    if (error) return alert("결제 등록 실패: " + error.message);
    await loadAll();
    alert("✅ 결제 등록되었습니다");
  }

  // 결제 삭제
  async function deletePayment(id: string) {
    if (!confirm("이 결제 내역을 삭제하시겠습니까?")) return;
    await supabase.from("payments").delete().eq("id", id);
    await loadAll();
  }

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

  const slotsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    slots.forEach(s => {
      if (!s.event_date) return;
      if (!map[s.event_date]) map[s.event_date] = [];
      map[s.event_date].push(s);
    });
    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => (a.time_slot || "").localeCompare(b.time_slot || ""));
    });
    return map;
  }, [slots]);

  const monthCells = useMemo(() => monthGrid(year, month0), [year, month0]);

  /* 이번 달 상태별 통계 */
  const monthStats = useMemo(() => {
    const prefix = `${year}-${String(month0+1).padStart(2,"0")}`;
    const monthSlots = slots.filter(s => (s.event_date || "").startsWith(prefix));
    const byStatus: Record<string, number> = {};
    STATUS_OPTIONS.forEach(o => byStatus[o.value] = 0);
    monthSlots.forEach(s => {
      const st = s.status || "scheduled";
      byStatus[st] = (byStatus[st] || 0) + 1;
    });
    const total = monthSlots.length;
    const revenue = monthSlots.filter(s => s.event_type === "revenue").reduce((a,b) => a + (b.amount || 0), 0);
    return { total, byStatus, revenue };
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
      // 반복예약 관련
      recurring_enabled: false,
      recurring_weeks: 4,
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
      recurring_id: slot.recurring_id,
      recurring_enabled: false,
      recurring_weeks: 0,
    });
    setModal({ date: slot.event_date, time: slot.time_slot, editing: slot });
  }

  async function saveSlot() {
    if (!f.event_date) { alert("날짜가 필요합니다"); return; }
    setSaving(true);

    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const buildDow = (dateStr: string) => {
      const d = new Date(dateStr);
      return d.getDay() === 0 ? 7 : d.getDay();
    };

    const basePayload: any = {
      time_slot: f.time_slot,
      event_type: f.event_type,
      status: f.status,
      lesson_name: f.lesson_name || null,
      note: f.note || null,
    };
    if (orgId) basePayload.org_id = orgId;
    if (f.member_id) basePayload.member_id = f.member_id;
    if (f.staff_id) basePayload.staff_id = f.staff_id;
    if (f.event_type === "revenue") basePayload.amount = Number(f.amount || 0);

    try {
      if (f.id) {
        // 수정
        const payload = {
          ...basePayload,
          event_date: f.event_date,
          day_of_week: buildDow(f.event_date),
        };
        const { error } = await supabase.from("schedule_slots").update(payload).eq("id", f.id);
        if (error) throw error;
      } else if (f.recurring_enabled && f.recurring_weeks > 1) {
        // 반복예약 등록: 오늘 포함 N주 동안 매주 같은 요일에 등록
        const recurringId = uuid();
        const startDate = new Date(f.event_date);
        const rows: any[] = [];
        for (let i = 0; i < f.recurring_weeks; i++) {
          const d = new Date(startDate);
          d.setDate(startDate.getDate() + i * 7);
          const dateStr = ymd(d);
          rows.push({
            ...basePayload,
            event_date: dateStr,
            day_of_week: buildDow(dateStr),
            recurring_id: recurringId,
            recurring_weeks: f.recurring_weeks,
          });
        }
        const { error } = await supabase.from("schedule_slots").insert(rows);
        if (error) throw error;
      } else {
        // 단일 등록
        const payload = {
          ...basePayload,
          event_date: f.event_date,
          day_of_week: buildDow(f.event_date),
        };
        const { error } = await supabase.from("schedule_slots").insert(payload);
        if (error) throw error;
      }
      setModal(null);
      await loadAll();
    } catch (err: any) {
      alert("저장 실패: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteSlot(id: string, opts?: { series?: boolean, recurring_id?: string }) {
    if (opts?.series && opts.recurring_id) {
      if (!confirm("반복 시리즈 전체를 삭제할까요?")) return;
      await supabase.from("schedule_slots").delete().eq("recurring_id", opts.recurring_id);
    } else {
      if (!confirm("이 일정을 삭제할까요?")) return;
      await supabase.from("schedule_slots").delete().eq("id", id);
    }
    await loadAll();
  }

  async function quickStatus(slot: any, newStatus: string) {
    await supabase.from("schedule_slots").update({ status: newStatus }).eq("id", slot.id);
    await loadAll();
  }

  /* 드래그앤드롭 이월 */
  function handleDragStart(slot: any, e: React.DragEvent) {
    setDragging(slot);
    e.dataTransfer.effectAllowed = "move";
    // Chrome 요구사항
    e.dataTransfer.setData("text/plain", slot.id);
  }
  function handleDragOver(dateStr: string, e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverDate !== dateStr) setDragOverDate(dateStr);
  }
  async function handleDrop(newDate: string, e: React.DragEvent) {
    e.preventDefault();
    if (!dragging) { setDragOverDate(null); return; }
    if (dragging.event_date === newDate) { setDragging(null); setDragOverDate(null); return; }

    const d = new Date(newDate);
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    const oldDate = dragging.event_date;
    setDragging(null);
    setDragOverDate(null);

    const { error } = await supabase.from("schedule_slots").update({
      event_date: newDate,
      day_of_week: dow,
      status: "carryover", // 자동으로 이월 상태 부여
      note: (dragging.note ? dragging.note + " · " : "") + `[${oldDate}→${newDate} 이월]`,
    }).eq("id", dragging.id);
    if (error) alert("이동 실패: " + error.message);
    else await loadAll();
  }

  function memberName(id: string) {
    return members.find(m => m.id === id)?.name || "";
  }
  function staffName(id: string) {
    return staff.find(s => s.id === id)?.name || "";
  }

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-4 md:py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <HomeButton />
          <span className="text-gray-300">/</span>
          <h1 className="text-xl md:text-2xl font-bold text-aqu-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-green-500" /> 시간표
          </h1>
        </div>

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
            <button onClick={() => setView("day")}
              className={`px-3 py-1.5 rounded flex items-center gap-1 ${view === "day" ? "bg-aqu-600 text-white" : "text-gray-600"}`}>
              <Clock className="w-3.5 h-3.5" /> 일간
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

      {/* 상단 KPI (컴팩트) */}
      <div className="grid grid-cols-3 md:grid-cols-7 gap-2 mb-3 text-xs">
        <MonthKPI label="총 일정" val={monthStats.total + ""} color="text-aqu-700" />
        {STATUS_OPTIONS.map(s => (
          <MonthKPI key={s.value} label={s.label} val={(monthStats.byStatus[s.value]||0) + ""} color={s.textColor} />
        ))}
      </div>

      {/* 드래그 안내 */}
      {view === "month" && (
        <div className="mb-2 text-[11px] text-gray-500 flex items-center gap-1">
          <Move className="w-3 h-3" /> 예약을 다른 날짜로 <b className="text-aqu-700">드래그</b>하면 자동으로 <b className="text-purple-600">이월</b> 처리됩니다
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-500">로딩 중...</div>
      ) : view === "month" ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3">
          {/* ═══ 월간 캘린더 ═══ */}
          <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-aqu-100 bg-aqu-50">
              {DAYS_KR.map((d, i) => (
                <div key={d} className={`p-2 text-center text-xs md:text-sm font-semibold ${i===0 ? "text-red-500" : i===6 ? "text-blue-500" : "text-aqu-800"}`}>
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {monthCells.map((cell, idx) => {
                const cellStr = ymd(cell);
                const isOtherMonth = cell.getMonth() !== month0;
                const isToday = cellStr === todayStr();
                const isSelected = cellStr === selectedDate;
                const isDragOver = dragOverDate === cellStr;
                const daySlots = slotsByDate[cellStr] || [];
                const dow = cell.getDay();
                const dayRevenue = daySlots.filter(s => s.event_type === "revenue").reduce((a,b) => a + (b.amount || 0), 0);

                return (
                  <div key={idx}
                    onClick={() => setSelectedDate(cellStr)}
                    onDragOver={(e) => handleDragOver(cellStr, e)}
                    onDragLeave={() => dragOverDate === cellStr && setDragOverDate(null)}
                    onDrop={(e) => handleDrop(cellStr, e)}
                    className={`min-h-[80px] md:min-h-[110px] border-r border-b border-gray-100 p-1 md:p-1.5 cursor-pointer transition
                      ${isOtherMonth ? "bg-gray-50/50 text-gray-400" : "bg-white"}
                      ${isSelected ? "ring-2 ring-aqu-400 ring-inset" : "hover:bg-aqu-50/30"}
                      ${isDragOver ? "bg-purple-100 ring-2 ring-purple-500 ring-inset" : ""}
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

                    <div className="space-y-0.5 overflow-hidden">
                      {daySlots.slice(0, 3).map(s => {
                        const meta = statusMeta(s.status || "scheduled");
                        const staffP = staff.find((st: any) => st.id === s.staff_id);
                        return (
                          <div key={s.id}
                            draggable
                            onDragStart={(e) => handleDragStart(s, e)}
                            onClick={(e) => { e.stopPropagation(); openQuickAction(s); }}
                            style={staffP ? { borderLeftColor: staffP.color, borderLeftWidth: 3 } : {}}
                            className={`text-[9px] md:text-[10px] px-1 py-0.5 rounded border truncate ${meta.color} hover:shadow-sm cursor-move flex items-center gap-0.5`}
                            title={`${s.time_slot} ${memberName(s.member_id) || s.lesson_name || ""}${staffP ? " (" + staffP.name + ")" : ""} (드래그하여 이월)`}>
                            <span className="font-mono opacity-70">{s.time_slot?.slice(0,5)}</span>
                            <span className="truncate">
                              {memberName(s.member_id) || s.lesson_name || (s.event_type === "revenue" ? "💰" + (s.amount||0)/1000 + "k" : "일정")}
                            </span>
                            {s.recurring_id && <Repeat className="w-2.5 h-2.5 opacity-60" />}
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

          {/* ═══ 오른쪽 사이드바 ═══ */}
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

            {/* 선택 날짜 상세 */}
            <SelectedDayPanel
              date={selectedDate}
              slots={slotsByDate[selectedDate] || []}
              members={members}
              staffName={staffName}
              onAdd={() => openNewModal(selectedDate)}
              onEdit={openEditModal}
              onQuickStatus={quickStatus}
              onDelete={deleteSlot}
            />
          </aside>
        </div>
      ) : view === "week" ? (
        <WeekView
          slots={slots}
          members={members}
          staff={staff}
          onCellClick={(date, time) => openNewModal(date, time)}
          onEdit={openEditModal}
          memberName={memberName}
        />
      ) : (
        <DayView
          date={selectedDate}
          setDate={setSelectedDate}
          slots={slots}
          members={members}
          staff={staff}
          onCellClick={(date, time) => openNewModal(date, time)}
          onEdit={openEditModal}
          memberName={memberName}
        />
      )}

      {/* ═══ 하단 상태별 통계 요약 ═══ */}
      <StatsSummary stats={monthStats} year={year} month0={month0} />

      {/* ═══ 등록/수정 모달 ═══ */}
      {modal && (
        <SlotModal
          f={f} setF={setF}
          modal={modal}
          members={members} staff={staff} plans={plans}
          onClose={() => setModal(null)}
          onSave={saveSlot}
          onDelete={f.id ? (opts?: any) => { deleteSlot(f.id, opts); setModal(null); } : undefined}
          saving={saving}
        />
      )}

      {/* ═══ 예약 클릭 시 빠른 액션 시트 ═══ */}
      {quickAction && (
        <QuickActionSheet
          slot={quickAction}
          members={members}
          staff={staff}
          plans={plans}
          payments={payments.filter((p: any) => p.slot_id === quickAction.id || (p.member_id === quickAction.member_id && p.event_date === quickAction.event_date))}
          attendance={attendance.find((a: any) => a.member_id === quickAction.member_id && a.date === quickAction.event_date)}
          onClose={() => setQuickAction(null)}
          onEdit={() => { openEditModal(quickAction); setQuickAction(null); }}
          onAttendance={(status: any) => setAttendanceStatus(quickAction, status)}
          onAddPayment={(payment: any) => addPaymentFromSlot(quickAction, payment)}
          onDeletePayment={deletePayment}
        />
      )}
    </main>
  );
}

/* ═════ 선택 날짜 상세 패널 (회원 이름 → 링크) ═════ */
function SelectedDayPanel({ date, slots, members, staffName, onAdd, onEdit, onQuickStatus, onDelete }: any) {
  const d = new Date(date);
  const dayLabel = `${d.getMonth()+1}월 ${d.getDate()}일 (${DAYS_KR[d.getDay()]})`;
  const memberMap = useMemo(() => {
    const m: Record<string, any> = {};
    members.forEach((mem: any) => m[mem.id] = mem);
    return m;
  }, [members]);

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
            const mem = memberMap[s.member_id];
            return (
              <div key={s.id} className={`border rounded-lg p-2 ${meta.color} border-opacity-50`}>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-mono text-xs font-bold">{s.time_slot?.slice(0,5)}</span>
                  <div className="flex items-center gap-1">
                    {s.recurring_id && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-white/60 flex items-center gap-0.5" title="반복 예약">
                        <Repeat className="w-2.5 h-2.5" /> 반복
                      </span>
                    )}
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium">{meta.label}</span>
                  </div>
                </div>
                <div className="text-xs">
                  {mem && (
                    <Link href={`/members/${mem.id}`}
                      className="font-medium flex items-center gap-1 hover:underline decoration-dotted">
                      <User className="w-3 h-3" /> {mem.name}
                      <span className="text-[9px] opacity-70 ml-0.5">
                        ({mem.member_type === "child" ? "아동" : "성인"})
                      </span>
                    </Link>
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

                <div className="flex flex-wrap gap-0.5 mt-1.5 pt-1.5 border-t border-white/50">
                  {STATUS_OPTIONS.map(st => (
                    <button key={st.value} onClick={() => onQuickStatus(s, st.value)}
                      className={`text-[9px] px-1 py-0.5 rounded ${s.status === st.value ? "bg-white/70 font-bold" : "bg-white/30 hover:bg-white/60"}`}
                      title={st.label}>
                      {st.label}
                    </button>
                  ))}
                  <button onClick={() => onEdit(s)}
                    className="text-[9px] px-1 py-0.5 rounded bg-white/30 hover:bg-white/60 ml-auto" title="편집">
                    ✎
                  </button>
                  <button onClick={() => onDelete(s.id)}
                    className="text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-600 hover:bg-red-200" title="삭제">
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═════ 하단 상태별 통계 요약 ═════ */
function StatsSummary({ stats, year, month0 }: any) {
  const total = stats.total || 0;
  const done = stats.byStatus.done || 0;
  const scheduled = stats.byStatus.scheduled || 0;
  const sick = stats.byStatus.sick || 0;
  const cancel = stats.byStatus.cancel || 0;
  const noshow = stats.byStatus.noshow || 0;
  const carryover = stats.byStatus.carryover || 0;

  const doneRate     = total > 0 ? Math.round((done / total) * 100)     : 0;
  const attendedRate = total > 0 ? Math.round(((done + carryover) / total) * 100) : 0;
  const missedRate   = total > 0 ? Math.round(((sick + cancel + noshow) / total) * 100) : 0;

  return (
    <div className="mt-4 bg-white rounded-2xl shadow-md border border-aqu-100 p-4 md:p-5">
      <h2 className="text-sm md:text-base font-bold text-aqu-900 mb-3 flex items-center gap-2">
        📊 {year}년 {month0+1}월 상태별 요약
        {total === 0 && <span className="text-xs text-gray-400 font-normal">(데이터 없음)</span>}
      </h2>

      {total > 0 && (
        <>
          {/* 프로그레스 바 */}
          <div className="mb-4">
            <div className="flex w-full h-4 rounded-full overflow-hidden border border-gray-200">
              {STATUS_OPTIONS.map(s => {
                const cnt = stats.byStatus[s.value] || 0;
                const pct = (cnt / total) * 100;
                if (pct === 0) return null;
                return (
                  <div key={s.value}
                    className={s.dot}
                    style={{ width: pct + "%" }}
                    title={`${s.label}: ${cnt}건 (${Math.round(pct)}%)`} />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 mt-2 text-[10px] md:text-xs">
              {STATUS_OPTIONS.map(s => {
                const cnt = stats.byStatus[s.value] || 0;
                if (cnt === 0) return null;
                const pct = Math.round((cnt / total) * 100);
                return (
                  <div key={s.value} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${s.dot}`}></span>
                    <span className="text-gray-700 font-medium">{s.label}</span>
                    <span className="text-gray-500">{cnt}건 · {pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 요약 지표 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <BigStat label="✓ 완료율"    val={doneRate + "%"}     sub={`${done}/${total}건`} color="text-green-600 bg-green-50" />
            <BigStat label="📅 예약 중"  val={scheduled + "건"}   sub={`전체의 ${total > 0 ? Math.round((scheduled/total)*100) : 0}%`} color="text-blue-600 bg-blue-50" />
            <BigStat label="⚠️ 결석/취소" val={(sick+cancel+noshow) + "건"} sub={`병결 ${sick} · 취소 ${cancel} · 노쇼 ${noshow}`} color="text-red-600 bg-red-50" />
            <BigStat label="↻ 이월"      val={carryover + "건"}   sub={carryover > 0 ? `${Math.round((carryover/total)*100)}% 이월` : "이월 없음"} color="text-purple-600 bg-purple-50" />
          </div>

          {/* 매출 */}
          {stats.revenue > 0 && (
            <div className="mt-3 p-3 bg-gradient-to-r from-pink-50 to-rose-50 rounded-xl border border-pink-100 flex items-center justify-between">
              <span className="text-sm font-medium text-pink-800 flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> 이번 달 시간표 등록 매출
              </span>
              <span className="text-lg md:text-xl font-bold text-pink-700">
                ₩{stats.revenue.toLocaleString()}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BigStat({ label, val, sub, color }: any) {
  return (
    <div className={`p-3 rounded-xl ${color}`}>
      <div className="text-[10px] md:text-xs font-medium opacity-80">{label}</div>
      <div className="text-lg md:text-xl font-bold">{val}</div>
      <div className="text-[10px] opacity-70 mt-0.5">{sub}</div>
    </div>
  );
}

/* ═════ 주간 뷰 ═════ */
function WeekView({ slots, members, staff, onCellClick, onEdit, memberName }: any) {
  const staffMap = useMemo(() => {
    const m: Record<string, any> = {};
    (staff || []).forEach((s: any) => m[s.id] = s);
    return m;
  }, [staff]);
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const dow = now.getDay();
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
                          const mem = members.find((mm: any) => mm.id === s.member_id);
                          const staffP = staffMap[s.staff_id];
                          const borderColor = staffP?.color || undefined;
                          return (
                            <div key={s.id}
                              onClick={() => onEdit(s)}
                              style={borderColor ? { borderLeftColor: borderColor, borderLeftWidth: 3 } : {}}
                              className={`text-[10px] p-1 rounded border ${meta.color} cursor-pointer hover:shadow-sm`}>
                              <div className="font-medium truncate">
                                {mem?.name || s.lesson_name || "일정"}
                              </div>
                              {staffP && (
                                <div className="text-[9px] opacity-90 flex items-center gap-0.5">
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: staffP.color }}></span>
                                  {staffP.name}
                                </div>
                              )}
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

/* ═════ 일간 뷰 (강사별 컬럼) ═════ */
function DayView({ date, setDate, slots, members, staff, onCellClick, onEdit, memberName }: any) {
  const dayDate = new Date(date);
  const activeStaff = staff && staff.length > 0 ? staff : [{ id: null, name: "미배정", color: "#94a3b8", role: "" }];

  function shift(delta: number) {
    const d = new Date(dayDate);
    d.setDate(dayDate.getDate() + delta);
    setDate(ymd(d));
  }

  function slotsAtStaff(staffId: string | null, time: string) {
    return slots.filter((s: any) =>
      s.event_date === date &&
      s.time_slot === time &&
      (staffId ? s.staff_id === staffId : !s.staff_id)
    );
  }

  const daySlots = slots.filter((s: any) => s.event_date === date);
  const total = daySlots.length;

  return (
    <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-3 border-b border-aqu-100 bg-aqu-50">
        <button onClick={() => shift(-1)} className="p-1.5 hover:bg-white rounded">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-sm md:text-base font-bold text-aqu-800">
          {date} ({DAYS_KR[dayDate.getDay()]}) · 총 {total}건
        </div>
        <button onClick={() => shift(1)} className="p-1.5 hover:bg-white rounded">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 강사별 컬럼 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-aqu-100">
              <th className="p-2 text-left w-14 md:w-20 bg-aqu-50">시간</th>
              {activeStaff.map((st: any) => (
                <th key={st.id || "unassigned"}
                    className="p-2 text-center min-w-[120px] bg-aqu-50"
                    style={{ borderTop: `4px solid ${st.color || "#94a3b8"}` }}>
                  <div className="flex items-center justify-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color || "#94a3b8" }}></span>
                    <span className="font-bold text-aqu-800">{st.name}</span>
                  </div>
                  {st.role && <div className="text-[9px] text-gray-500">{st.role}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIMES.map(time => (
              <tr key={time} className="border-b border-gray-100">
                <td className="p-2 font-medium text-gray-700 bg-gray-50 text-xs">{time}</td>
                {activeStaff.map((st: any) => {
                  const cellSlots = slotsAtStaff(st.id, time);
                  return (
                    <td key={st.id || "un"} className="p-1 align-top border-l border-gray-100 min-w-[120px]">
                      <div className="space-y-1">
                        {cellSlots.map((s: any) => {
                          const meta = statusMeta(s.status || "scheduled");
                          const mem = members.find((m: any) => m.id === s.member_id);
                          return (
                            <div key={s.id}
                              onClick={() => onEdit(s)}
                              style={{ borderLeft: `4px solid ${st.color || "#94a3b8"}` }}
                              className={`text-[10px] p-1.5 rounded ${meta.color} cursor-pointer hover:shadow-sm`}>
                              <div className="font-medium truncate">
                                {mem?.name || s.lesson_name || "일정"}
                              </div>
                              {s.lesson_name && mem && (
                                <div className="text-[9px] opacity-70 truncate">{s.lesson_name}</div>
                              )}
                              {s.status && s.status !== "scheduled" && (
                                <div className="text-[9px] font-bold">{meta.label}</div>
                              )}
                            </div>
                          );
                        })}
                        <button onClick={() => onCellClick(date, time)}
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

      {/* 범례 */}
      <div className="p-3 border-t border-aqu-100 bg-aqu-50/50">
        <div className="text-[10px] text-gray-600 mb-1">강사 색상 범례</div>
        <div className="flex flex-wrap gap-2">
          {activeStaff.map((st: any) => (
            <div key={st.id || "un"} className="flex items-center gap-1 text-[10px]">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: st.color || "#94a3b8" }}></span>
              <span>{st.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═════ 등록/수정 모달 (반복예약 옵션 포함) ═════ */
function SlotModal({ f, setF, modal, members, staff, plans, onClose, onSave, onDelete, saving }: any) {
  const isEditing = !!f.id;
  const isRecurring = !!f.recurring_id;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-aqu-900 flex items-center gap-2">
            {isEditing ? "일정 수정" : "새 일정"}
            {isRecurring && (
              <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded flex items-center gap-1">
                <Repeat className="w-3 h-3" /> 반복 시리즈
              </span>
            )}
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
              <MemberSearchSelect
                members={members}
                value={f.member_id}
                onChange={(id: string) => setF({ ...f, member_id: id })}
              />
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

          <Field label="수업명 / 회원권 졌택">
            {plans && plans.length > 0 ? (
              <div className="space-y-1">
                <select value={f.lesson_name || ""} onChange={e => setF({ ...f, lesson_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
                  <option value="">-- 회원권 선택 --</option>
                  {plans.map((p: any) => (
                    <option key={p.id} value={p.name}>
                      {p.name} {p.sessions > 0 ? `(${p.sessions}회)` : "(무제한)"} ‧ ₩{(p.price || 0).toLocaleString()}
                    </option>
                  ))}
                  <option value="__custom__">📝 직접 입력...</option>
                </select>
                {(f.lesson_name === "__custom__" || (f.lesson_name && !plans.find((p: any) => p.name === f.lesson_name))) && (
                  <input type="text"
                    value={f.lesson_name === "__custom__" ? "" : f.lesson_name}
                    onChange={e => setF({ ...f, lesson_name: e.target.value })}
                    placeholder="자유 입력 (예: 체험, 개인지도)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
                )}
                <div className="text-[10px] text-gray-500">💡 회원권은 <a href="/plans" className="text-aqu-600 underline">횟원권 관리 페이지</a>에서 추가하세요</div>
              </div>
            ) : (
              <input type="text" value={f.lesson_name || ""}
                onChange={e => setF({ ...f, lesson_name: e.target.value })}
                placeholder="예: 수중프로그램 30회권"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
            )}
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

          {/* 반복 예약 옵션 (새 예약일 때만) */}
          {!isEditing && (
            <div className="p-3 bg-purple-50/50 border border-purple-100 rounded-xl">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={f.recurring_enabled}
                  onChange={e => setF({ ...f, recurring_enabled: e.target.checked })}
                  className="w-4 h-4 accent-purple-600" />
                <span className="text-sm font-medium text-purple-900 flex items-center gap-1">
                  <Repeat className="w-4 h-4" /> 매주 반복 예약
                </span>
              </label>
              {f.recurring_enabled && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-purple-800">이번 주부터</span>
                  <select value={f.recurring_weeks}
                    onChange={e => setF({ ...f, recurring_weeks: parseInt(e.target.value) })}
                    className="px-2 py-1 border border-purple-200 rounded text-sm bg-white focus:ring-2 focus:ring-purple-400 focus:outline-none">
                    {[2,4,6,8,10,12,16,20,24].map(n => (
                      <option key={n} value={n}>{n}주 동안</option>
                    ))}
                  </select>
                  <span className="text-xs text-purple-800">매주 같은 시간</span>
                </div>
              )}
              {f.recurring_enabled && f.event_date && (
                <div className="text-[11px] text-purple-700 mt-2">
                  📅 {f.event_date} ({DAYS_KR[new Date(f.event_date).getDay()]})요일 {f.time_slot}에 <b>{f.recurring_weeks}회</b> 자동 등록됩니다
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          {onDelete && (
            <div className="flex flex-col gap-1">
              <button onClick={() => onDelete()}
                className="px-3 py-2 border border-red-200 text-red-500 rounded-lg text-xs hover:bg-red-50 flex items-center gap-1"
                title="이 일정만 삭제">
                <Trash2 className="w-4 h-4" />
              </button>
              {isRecurring && (
                <button onClick={() => onDelete({ series: true, recurring_id: f.recurring_id })}
                  className="px-2 py-1 border border-red-300 text-red-600 rounded-lg text-[10px] hover:bg-red-50"
                  title="반복 시리즈 전체 삭제">
                  시리즈 전체
                </button>
              )}
            </div>
          )}
          <button onClick={onClose} disabled={saving}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            취소
          </button>
          <button onClick={onSave} disabled={saving}
            className="flex-1 px-4 py-2 bg-aqu-600 text-white rounded-lg text-sm hover:bg-aqu-700 disabled:opacity-50">
            {saving ? "저장 중..." : (f.recurring_enabled ? `${f.recurring_weeks}주 등록` : "저장")}
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

// 예약 셀 클릭 시 떨어지는 빠른 액션 시트 (출결 + 결제 + 수정)
function QuickActionSheet({ slot, members, staff, plans, payments, attendance, onClose, onEdit, onAttendance, onAddPayment, onDeletePayment }: any) {
  const member = members.find((m: any) => m.id === slot.member_id);
  const staffP = staff.find((s: any) => s.id === slot.staff_id);
  const [tab, setTab] = useState<"info" | "attend" | "payment">("info");

  // 새 결제 폼
  const [payPlanId, setPayPlanId] = useState("");
  const [payLesson, setPayLesson] = useState(slot.lesson_name || "");
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState("card");
  const [payTime, setPayTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [payCardNo, setPayCardNo] = useState("");
  const [payApprovalNo, setPayApprovalNo] = useState("");

  function handlePlanChange(planId: string) {
    setPayPlanId(planId);
    const p = plans?.find((x: any) => x.id === planId);
    if (p) {
      setPayLesson(p.name);
      setPayAmount(p.price || 0);
    }
  }

  function maskCardNo(v: string) {
    // 입력 중에는 그대로 보여주고, 저장 시에만 마스킹
    return v.replace(/[^\d-]/g, "");
  }
  function finalMaskedCardNo() {
    const digits = payCardNo.replace(/\D/g, "");
    if (digits.length < 8) return payCardNo || null;
    if (digits.length >= 12) {
      return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-****-${digits.slice(-4)}`;
    }
    return payCardNo;
  }

  const currentAttStatus = attendance?.status;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-aqu-50 to-cyan-50">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs text-gray-500">{slot.event_date} · {slot.time_slot}</div>
              <div className="text-lg font-bold text-aqu-900 mt-0.5 flex items-center gap-2">
                {member ? (
                  <>
                    {member.member_type === "child" ? "🧒" : "👤"} {member.name}
                    <a href={`/members/${member.id}`} className="text-xs text-aqu-600 hover:underline">👁️ 상세</a>
                  </>
                ) : (
                  <span className="text-gray-500">회원 미지정</span>
                )}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {slot.lesson_name && `📐 ${slot.lesson_name}`}
                {staffP && ` · 👨‍⚕️ ${staffP.name}`}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-gray-100">
          <button onClick={() => setTab("info")}
            className={`flex-1 py-3 text-sm font-medium ${tab === "info" ? "text-aqu-700 border-b-2 border-aqu-500 bg-aqu-50/50" : "text-gray-500"}`}>
            ℹ️ 예약정보
          </button>
          <button onClick={() => setTab("attend")}
            className={`flex-1 py-3 text-sm font-medium ${tab === "attend" ? "text-purple-700 border-b-2 border-purple-500 bg-purple-50/50" : "text-gray-500"}`}>
            ✅ 출결 {currentAttStatus && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
                currentAttStatus === "present" ? "bg-emerald-100 text-emerald-700" :
                currentAttStatus === "absent" ? "bg-red-100 text-red-700" :
                "bg-orange-100 text-orange-700"}`}>
                {currentAttStatus === "present" ? "출석" : currentAttStatus === "absent" ? "결석" : "병결"}
              </span>
            )}
          </button>
          <button onClick={() => setTab("payment")}
            className={`flex-1 py-3 text-sm font-medium ${tab === "payment" ? "text-pink-700 border-b-2 border-pink-500 bg-pink-50/50" : "text-gray-500"}`}>
            💰 결제 {payments.length > 0 && <span className="ml-1 px-1.5 bg-pink-100 text-pink-700 text-[10px] rounded-full">{payments.length}</span>}
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "info" && (
            <div className="space-y-3">
              <InfoLine label="날짜" value={slot.event_date} />
              <InfoLine label="시간" value={slot.time_slot} />
              <InfoLine label="유형" value={slot.event_type} />
              <InfoLine label="상태" value={slot.status || "예약"} />
              {slot.note && <InfoLine label="메모" value={slot.note} />}
              {slot.recurring_id && (
                <div className="p-2 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-800">
                  ♻️ 반복 예약의 일부입니다
                </div>
              )}
              <button onClick={onEdit}
                className="w-full py-2.5 bg-aqu-500 hover:bg-aqu-600 text-white text-sm font-medium rounded-lg mt-4">
                ✏️ 예약 수정/삭제
              </button>
            </div>
          )}

          {tab === "attend" && (
            <div className="space-y-3">
              <div className="text-xs text-gray-600">이 회원의 <b>{slot.event_date}</b> 출석 상태를 입력하세요.</div>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => onAttendance("present")}
                  className={`py-4 rounded-xl border-2 font-medium text-sm ${currentAttStatus === "present" ? "bg-emerald-500 border-emerald-500 text-white shadow-md" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>
                  ✅<br/>출석
                </button>
                <button onClick={() => onAttendance("absent")}
                  className={`py-4 rounded-xl border-2 font-medium text-sm ${currentAttStatus === "absent" ? "bg-red-500 border-red-500 text-white shadow-md" : "border-red-200 text-red-700 hover:bg-red-50"}`}>
                  ❌<br/>결석
                </button>
                <button onClick={() => onAttendance("sick")}
                  className={`py-4 rounded-xl border-2 font-medium text-sm ${currentAttStatus === "sick" ? "bg-orange-500 border-orange-500 text-white shadow-md" : "border-orange-200 text-orange-700 hover:bg-orange-50"}`}>
                  🤒<br/>병결
                </button>
              </div>
              <div className="text-[11px] text-gray-500 mt-2 p-3 bg-gray-50 rounded-lg">
                💡 출결 상태를 변경하면 예약 상태도 자동으로 동기화됩니다 (출석→완료 / 결석→취소 / 병결→병결).
              </div>
            </div>
          )}

          {tab === "payment" && (
            <div className="space-y-4">
              {/* 등록된 결제 목록 */}
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-2">등록된 결제 내역</div>
                {payments.length === 0 ? (
                  <div className="text-xs text-gray-400 py-3 text-center bg-gray-50 rounded-lg">아직 결제 내역이 없습니다</div>
                ) : (
                  <div className="space-y-2">
                    {payments.map((p: any) => (
                      <div key={p.id} className="p-3 bg-pink-50 border border-pink-100 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-sm font-bold text-pink-900">₩{(p.amount || 0).toLocaleString()}</div>
                          <button onClick={() => onDeletePayment(p.id)}
                            className="text-xs text-red-500 hover:text-red-700">삭제</button>
                        </div>
                        <div className="text-[10px] text-gray-700 space-y-0.5">
                          <div>
                            <span className="font-medium">
                              {p.method === "card" ? "💳 카드" :
                               p.method === "cash" ? "💵 현금" :
                               p.method === "transfer" ? "🏦 계좌이체" : "📝 기타"}
                            </span>
                            {p.paid_time && ` · ${p.paid_time}`}
                          </div>
                          {p.lesson_name && <div>📚 {p.lesson_name}</div>}
                          {p.card_number && <div className="font-mono">💳 {p.card_number}</div>}
                          {p.approval_no && <div>승인: {p.approval_no}</div>}
                          <div className="text-gray-400">{new Date(p.paid_at).toLocaleDateString("ko-KR")}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 새 결제 등록 */}
              <div className="border-t border-gray-100 pt-4">
                <div className="text-xs font-semibold text-gray-600 mb-2">💰 새 결제 등록</div>
                <div className="space-y-2">
                  {/* 회원권 드롭다운 */}
                  {plans && plans.length > 0 && (
                    <div>
                      <label className="text-[10px] text-gray-500">회원권 선택</label>
                      <select value={payPlanId} onChange={e => handlePlanChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                        <option value="">-- 직접 입력 --</option>
                        {plans.map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.sessions > 0 ? `(${p.sessions}회)` : ""} ‧ ₩{(p.price || 0).toLocaleString()}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] text-gray-500">프로그램명</label>
                    <input type="text" value={payLesson} onChange={e => setPayLesson(e.target.value)}
                      placeholder="예: 수중프로그램 10회권"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500">금액 (원)</label>
                      <input type="number" value={payAmount || ""} onChange={e => setPayAmount(parseInt(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500">결제 시간</label>
                      <input type="time" value={payTime} onChange={e => setPayTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-500">결제 수단</label>
                    <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                      <option value="card">💳 카드</option>
                      <option value="cash">💵 현금</option>
                      <option value="transfer">🏦 계좌이체</option>
                      <option value="other">📝 기타</option>
                    </select>
                  </div>

                  {payMethod === "card" && (
                    <div className="space-y-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                      <div>
                        <label className="text-[10px] text-blue-700">카드 번호 (자동 마스킹)</label>
                        <input type="text" value={payCardNo} onChange={e => setPayCardNo(maskCardNo(e.target.value))}
                          placeholder="1234-5678-9012-3456"
                          maxLength={19}
                          className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white" />
                        {payCardNo.replace(/\D/g, "").length >= 12 && (
                          <div className="text-[10px] text-blue-600 mt-1">저장 시: <span className="font-mono">{finalMaskedCardNo()}</span></div>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] text-blue-700">승인번호</label>
                        <input type="text" value={payApprovalNo} onChange={e => setPayApprovalNo(e.target.value)}
                          placeholder="예: 12345678"
                          className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white" />
                      </div>
                    </div>
                  )}

                  <button onClick={() => {
                    if (!payAmount) { alert("금액을 입력하세요"); return; }
                    onAddPayment({
                      plan_id: payPlanId || null,
                      lesson_name: payLesson,
                      amount: payAmount,
                      method: payMethod,
                      paid_time: payTime,
                      card_number: payMethod === "card" ? finalMaskedCardNo() : null,
                      approval_no: payMethod === "card" ? (payApprovalNo || null) : null,
                    });
                    setPayAmount(0); setPayLesson(""); setPayCardNo(""); setPayApprovalNo(""); setPayPlanId("");
                  }}
                    className="w-full py-2.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white text-sm font-medium rounded-lg hover:from-pink-600 hover:to-rose-600">
                    ➕ 결제 등록
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoLine({ label, value }: any) {
  return (
    <div className="flex">
      <span className="w-20 text-xs text-gray-500">{label}</span>
      <span className="flex-1 text-sm text-gray-800">{value}</span>
    </div>
  );
}

// 회원 검색 가능한 드롭다운 (이름 타이핑으로 필터링)
function MemberSearchSelect({ members, value, onChange }: any) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  // 종결/대기종료 제외하고 모든 회원 표시
  const filtered = members
    .filter((m: any) => !(["closed", "ended"].includes(m.status)))
    .filter((m: any) => !query || (m.name || "").toLowerCase().includes(query.toLowerCase())
                       || (m.phone || "").includes(query));

  const selected = members.find((m: any) => m.id === value);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          type="text"
          value={selected ? `${selected.name} (${selected.member_type === "child" ? "아동" : "성인"})` : query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (selected) onChange(""); }}
          onFocus={() => setOpen(true)}
          placeholder="🔍 회원 이름이나 전화번호로 검색..."
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none"
        />
        {value && (
          <button type="button" onClick={() => { onChange(""); setQuery(""); }}
            className="px-2 text-gray-400 hover:text-red-500 text-sm">×</button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-gray-500 text-center">검색 결과 없음</div>
          ) : (
            filtered.slice(0, 50).map((m: any) => {
              const statusMap: any = {
                regular: { icon: "🎯", color: "text-green-600" },
                waiting: { icon: "⏳", color: "text-yellow-600" },
                trial_scheduled: { icon: "📅", color: "text-blue-600" },
                trial_done: { icon: "✅", color: "text-purple-600" },
                paused: { icon: "⏸️", color: "text-gray-500" },
              };
              const st = statusMap[m.status] || statusMap.regular;
              return (
                <button key={m.id} type="button"
                  onClick={() => { onChange(m.id); setQuery(""); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-aqu-50 flex items-center gap-2 ${value === m.id ? "bg-aqu-50" : ""}`}>
                  <span className={st.color}>{st.icon}</span>
                  <span className="font-medium">{m.name}</span>
                  <span className="text-xs text-gray-400">
                    {m.member_type === "child" ? "🧒 아동" : "👤 성인"}
                    {m.phone && " · " + m.phone.slice(-4)}
                  </span>
                </button>
              );
            })
          )}
          {filtered.length > 50 && (
            <div className="p-2 text-[10px] text-gray-400 text-center border-t">+{filtered.length - 50}명 더 있음. 검색을 좁혀보세요.</div>
          )}
        </div>
      )}

      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}></div>}
    </div>
  );
}
