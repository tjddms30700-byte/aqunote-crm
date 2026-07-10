"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Calendar, Waves, Plus, X, Save, User } from "lucide-react";

type Member = { id: string; name: string; member_type: string };
type ScheduleSlot = { id?: string; day_of_week: number; time_slot: string; member_id: string; notes?: string };

const DAYS = ["월", "화", "수", "목", "금", "토"];
const TIME_SLOTS = [
  "10:00~11:10", "11:10~12:20", "12:20~13:30",
  "13:30~14:40", "14:40~15:50", "15:50~17:00",
  "17:00~18:10", "18:10~19:20", "19:20~20:30", "20:30~21:40",
];

export default function SchedulePage() {
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editSlot, setEditSlot] = useState<{ day: number; time: string } | null>(null);
  const [selectedMember, setSelectedMember] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [slotsRes, membersRes] = await Promise.all([
      supabase.from("schedule_slots").select("*"),
      supabase.from("members").select("id, name, member_type").is("deleted_at", null).order("name"),
    ]);
    setSlots((slotsRes.data as ScheduleSlot[]) || []);
    setMembers((membersRes.data as Member[]) || []);
    setLoading(false);
  }

  function getSlotMembers(day: number, time: string) {
    const slotList = slots.filter((s) => s.day_of_week === day && s.time_slot === time);
    return slotList.map((s) => ({
      ...s,
      member: members.find((m) => m.id === s.member_id),
    }));
  }

  async function assignSlot() {
    if (!editSlot || !selectedMember) return;
    const { data: orgs } = await supabase.from("organizations").select("id").limit(1);
    const orgId = orgs?.[0]?.id;
    const { error } = await supabase.from("schedule_slots").insert({
      org_id: orgId,
      day_of_week: editSlot.day,
      time_slot: editSlot.time,
      member_id: selectedMember,
      notes,
    });
    if (!error) {
      setEditSlot(null);
      setSelectedMember("");
      setNotes("");
      loadAll();
    } else {
      alert(error.message);
    }
  }

  async function removeSlot(slotId: string | undefined) {
    if (!slotId) return;
    if (!confirm("이 배정을 삭제할까요?")) return;
    await supabase.from("schedule_slots").delete().eq("id", slotId);
    loadAll();
  }

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Waves className="w-8 h-8 text-aqu-600" />
          <h1 className="text-2xl md:text-3xl font-bold text-aqu-900">📅 시간표</h1>
        </div>
        <Link href="/" className="text-sm text-aqu-600 hover:underline">← 홈</Link>
      </div>

      {loading ? (
        <div className="p-10 text-center text-gray-400">불러오는 중…</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-x-auto">
          <table className="w-full text-xs md:text-sm">
            <thead>
              <tr className="bg-aqu-50">
                <th className="px-2 py-3 border-b border-aqu-200 w-24 text-aqu-900">시간</th>
                {DAYS.map((d, i) => (
                  <th key={d} className="px-2 py-3 border-b border-aqu-200 min-w-[100px] text-aqu-900">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map((t) => (
                <tr key={t}>
                  <td className="px-2 py-2 bg-aqu-50/30 border-b border-aqu-100 text-aqu-800 font-medium text-center">{t}</td>
                  {DAYS.map((_, di) => {
                    const assigned = getSlotMembers(di + 1, t);
                    return (
                      <td key={di} className="px-1 py-1 border-b border-aqu-100 align-top">
                        <div className="min-h-[40px] space-y-1">
                          {assigned.map((a) => (
                            <div
                              key={a.id}
                              onClick={() => removeSlot(a.id)}
                              className={`px-1.5 py-0.5 rounded text-[10px] md:text-xs cursor-pointer group ${
                                a.member?.member_type === "child"
                                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                  : "bg-purple-100 text-purple-700 hover:bg-purple-200"
                              }`}
                              title="클릭하여 삭제"
                            >
                              {a.member?.name || "?"}
                            </div>
                          ))}
                          <button
                            onClick={() => { setEditSlot({ day: di + 1, time: t }); setSelectedMember(""); setNotes(""); }}
                            className="w-full py-0.5 text-gray-400 hover:text-aqu-600 hover:bg-aqu-50 rounded text-[10px]"
                          >
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
      )}

      <div className="mt-3 text-xs text-gray-400 flex flex-wrap gap-3">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-100 rounded"></span> 아동</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-purple-100 rounded"></span> 성인</span>
        <span>💡 + 버튼으로 배정 · 이름 클릭으로 삭제</span>
      </div>

      {/* Assign Modal */}
      {editSlot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditSlot(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-aqu-900">
                {DAYS[editSlot.day - 1]} · {editSlot.time}
              </h3>
              <button onClick={() => setEditSlot(null)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-600">회원 선택</label>
                <select value={selectedMember} onChange={(e) => setSelectedMember(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm">
                  <option value="">-- 선택하세요 --</option>
                  <optgroup label="👶 아동">
                    {members.filter((m) => m.member_type === "child").map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="🧑 성인">
                    {members.filter((m) => m.member_type === "adult").map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">메모 (선택)</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm"
                  placeholder="예: 결제 확인 필요" />
              </div>
              <button onClick={assignSlot} disabled={!selectedMember}
                className="w-full py-2.5 bg-aqu-600 text-white rounded-lg text-sm font-medium hover:bg-aqu-700 disabled:bg-gray-300 flex items-center justify-center gap-1">
                <Save className="w-4 h-4" /> 배정
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
