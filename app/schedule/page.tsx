"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Calendar, Plus, X, User, DollarSign, Briefcase,
  Trash2, ChevronLeft, Home
} from "lucide-react";

const DAYS = ["월", "화", "수", "목", "금", "토"];
const TIMES = [
  "10:00", "11:00", "13:00", "14:00", "15:00",
  "16:00", "17:00", "18:00", "19:00", "20:00"
];

const EVENT_TYPES = [
  { value: "lesson",     label: "🏊 수업 예약",  color: "bg-blue-100 border-blue-400 text-blue-800" },
  { value: "trial",      label: "🎯 체험 예약",  color: "bg-purple-100 border-purple-400 text-purple-800" },
  { value: "revenue",    label: "💰 매출 등록",  color: "bg-pink-100 border-pink-400 text-pink-800" },
  { value: "staff_work", label: "👤 직원 근무",  color: "bg-emerald-100 border-emerald-400 text-emerald-800" },
  { value: "staff_off",  label: "🏖️ 직원 휴무",  color: "bg-gray-100 border-gray-400 text-gray-700" },
  { value: "other",      label: "📌 기타",       color: "bg-yellow-100 border-yellow-400 text-yellow-800" },
];

function eventStyle(type: string) {
  return EVENT_TYPES.find(e => e.value === type)?.color || "bg-gray-100 border-gray-300 text-gray-700";
}
function eventLabel(type: string) {
  return EVENT_TYPES.find(e => e.value === type)?.label || type;
}

export default function SchedulePage() {
  const [slots, setSlots]     = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [staff, setStaff]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState<{day: number, time: string} | null>(null);

  // Form state
  const [eventType, setEventType]   = useState("lesson");
  const [memberId, setMemberId]     = useState("");
  const [staffId, setStaffId]       = useState("");
  const [title, setTitle]           = useState("");
  const [amount, setAmount]         = useState("");
  const [saving, setSaving]         = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [slotsRes, membersRes, staffRes] = await Promise.all([
      supabase.from("schedule_slots").select("*").order("day_of_week").order("time_slot"),
      supabase.from("members").select("id, name, member_type").is("deleted_at", null).order("name"),
      supabase.from("staff").select("id, name, role").order("name"),
    ]);
    setSlots(slotsRes.data || []);
    setMembers(membersRes.data || []);
    setStaff(staffRes.data || []);
    setLoading(false);
  }

  function openModal(dayIdx: number, time: string) {
    setModal({ day: dayIdx + 1, time });
    setEventType("lesson");
    setMemberId("");
    setStaffId("");
    setTitle("");
    setAmount("");
  }

  async function saveEvent() {
    if (!modal) return;
    setSaving(true);

    // Get org_id from first member (fallback)
    const orgId = members[0]?.org_id || (await supabase.from("organizations").select("id").limit(1).single()).data?.id;

    const payload: any = {
      day_of_week: modal.day,
      time_slot: modal.time,
      event_type: eventType,
      title: title || null,
    };
    if (orgId) payload.org_id = orgId;
    if (memberId) payload.member_id = memberId;
    if (staffId) payload.extra = { staff_id: staffId };
    if (amount && eventType === "revenue") payload.amount = parseInt(amount);

    const { error } = await supabase.from("schedule_slots").insert(payload);
    if (error) {
      alert("저장 실패: " + error.message);
    } else {
      setModal(null);
      await loadAll();
    }
    setSaving(false);
  }

  async function deleteSlot(id: string) {
    if (!confirm("이 일정을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("schedule_slots").delete().eq("id", id);
    if (error) alert("삭제 실패: " + error.message);
    else await loadAll();
  }

  function slotsAt(dayIdx: number, time: string) {
    return slots.filter(s => s.day_of_week === dayIdx + 1 && s.time_slot === time);
  }

  // Statistics
  const totalRevenue = slots.filter(s => s.event_type === "revenue").reduce((sum, s) => sum + (s.amount || 0), 0);
  const totalLessons = slots.filter(s => s.event_type === "lesson").length;
  const totalTrials  = slots.filter(s => s.event_type === "trial").length;
  const totalStaff   = slots.filter(s => s.event_type === "staff_work" || s.event_type === "staff_off").length;

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-aqu-600 hover:text-aqu-800 flex items-center gap-1 text-sm">
            <Home className="w-4 h-4" /> 홈
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-2xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
            <Calendar className="w-7 h-7 text-green-500" /> 일정관리
          </h1>
        </div>
        <div className="text-xs text-gray-500">
          셀 클릭 → 예약/매출/직원일정 등록
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KPI icon={User}      title="예약된 수업" val={totalLessons + "건"} color="text-blue-500" />
        <KPI icon={User}      title="체험 예약"   val={totalTrials + "건"}   color="text-purple-500" />
        <KPI icon={DollarSign} title="이번 주 매출" val={totalRevenue.toLocaleString() + "원"} color="text-pink-500" />
        <KPI icon={Briefcase}  title="직원 일정"   val={totalStaff + "건"}    color="text-emerald-500" />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        {EVENT_TYPES.map(t => (
          <span key={t.value} className={`px-2 py-1 rounded-md border ${t.color}`}>{t.label}</span>
        ))}
      </div>

      {/* Schedule Grid */}
      {loading ? (
        <div className="text-center py-10 text-gray-500">로딩 중...</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-x-auto">
          <table className="w-full text-xs md:text-sm">
            <thead>
              <tr className="bg-aqu-50 border-b border-aqu-100">
                <th className="p-2 md:p-3 text-left font-semibold text-aqu-800 w-16 md:w-20">시간</th>
                {DAYS.map(d => (
                  <th key={d} className="p-2 md:p-3 text-center font-semibold text-aqu-800 min-w-[110px]">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIMES.map(time => (
                <tr key={time} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-2 md:p-3 font-medium text-gray-700 bg-gray-50">{time}</td>
                  {DAYS.map((_, dayIdx) => {
                    const cellSlots = slotsAt(dayIdx, time);
                    return (
                      <td key={dayIdx} className="p-1 align-top border-l border-gray-100">
                        <div className="space-y-1">
                          {cellSlots.map(s => {
                            const member = members.find(m => m.id === s.member_id);
                            const staffP = staff.find(st => st.id === s.extra?.staff_id);
                            return (
                              <div key={s.id}
                                className={`text-[10px] md:text-xs p-1.5 rounded border ${eventStyle(s.event_type)} relative group`}>
                                <div className="font-medium truncate">
                                  {member?.name || staffP?.name || s.title || eventLabel(s.event_type)}
                                </div>
                                {s.event_type === "revenue" && s.amount && (
                                  <div className="text-[10px] font-bold">{s.amount.toLocaleString()}원</div>
                                )}
                                {s.title && (member || staffP) && (
                                  <div className="text-[9px] opacity-70 truncate">{s.title}</div>
                                )}
                                <button onClick={() => deleteSlot(s.id)}
                                  className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 bg-red-500 text-white rounded-full p-0.5 transition">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })}
                          <button onClick={() => openModal(dayIdx, time)}
                            className="w-full text-gray-400 hover:text-aqu-600 hover:bg-aqu-50 rounded border border-dashed border-gray-200 py-1 flex items-center justify-center transition">
                            <Plus className="w-3 h-3 md:w-4 md:h-4" />
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
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-aqu-900">
                {DAYS[modal.day - 1]}요일 {modal.time} 일정 등록
              </h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Event type */}
            <label className="block text-xs font-semibold text-gray-600 mb-1">이벤트 종류</label>
            <select value={eventType} onChange={e => setEventType(e.target.value)}
              className="w-full mb-3 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
              {EVENT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            {/* Member picker (for lesson, trial, revenue) */}
            {(eventType === "lesson" || eventType === "trial" || eventType === "revenue") && (
              <>
                <label className="block text-xs font-semibold text-gray-600 mb-1">회원 선택</label>
                <select value={memberId} onChange={e => setMemberId(e.target.value)}
                  className="w-full mb-3 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
                  <option value="">-- 선택 --</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.member_type === "child" ? "아동" : "성인"})
                    </option>
                  ))}
                </select>
              </>
            )}

            {/* Staff picker */}
            {(eventType === "staff_work" || eventType === "staff_off") && (
              <>
                <label className="block text-xs font-semibold text-gray-600 mb-1">직원 선택</label>
                <select value={staffId} onChange={e => setStaffId(e.target.value)}
                  className="w-full mb-3 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none">
                  <option value="">-- 선택 --</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role || "직원"})</option>
                  ))}
                </select>
              </>
            )}

            {/* Amount (revenue) */}
            {eventType === "revenue" && (
              <>
                <label className="block text-xs font-semibold text-gray-600 mb-1">금액 (원)</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="예: 50000"
                  className="w-full mb-3 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
              </>
            )}

            {/* Title/memo */}
            <label className="block text-xs font-semibold text-gray-600 mb-1">제목/메모 (선택)</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="예: 그룹수업, 개인지도, 상담 등"
              className="w-full mb-4 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />

            <div className="flex gap-2">
              <button onClick={() => setModal(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                취소
              </button>
              <button onClick={saveEvent} disabled={saving}
                className="flex-1 px-4 py-2 bg-aqu-600 text-white rounded-lg text-sm hover:bg-aqu-700 disabled:opacity-50">
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function KPI({ icon: Icon, title, val, color }: any) {
  return (
    <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-aqu-100">
      <Icon className={`w-5 h-5 mb-1 ${color}`} />
      <div className="text-xs text-gray-500">{title}</div>
      <div className="text-lg md:text-xl font-bold text-aqu-900">{val}</div>
    </div>
  );
}
