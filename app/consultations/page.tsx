"use client";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import {
  Waves, Plus, Phone, Calendar, User, MessageCircle,
  ArrowRight, X, Save, Clock, Users, ExternalLink, RefreshCw, Search
} from "lucide-react";

type Lead = {
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
  priority?: number;
};

type Slot = {
  id: string;
  day_of_week: number;
  time_slot: string;
  status: string;
  member_id?: string | null;
};

const COLUMNS = [
  { key: "waiting", label: "⏳ 대기중", color: "bg-yellow-50 border-yellow-200" },
  { key: "trial_scheduled", label: "📅 체험예정", color: "bg-blue-50 border-blue-200" },
  { key: "trial_done", label: "✅ 체험완료", color: "bg-purple-50 border-purple-200" },
  { key: "regular", label: "🎯 정규등록", color: "bg-green-50 border-green-200" },
  { key: "paused", label: "⏸️ 보류", color: "bg-gray-50 border-gray-200" },
  { key: "ended", label: "🛑 대기종료", color: "bg-red-50 border-red-200" },
];

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const TIME_SLOTS = [
  "10:00~11:10", "11:10~12:20", "12:20~13:30", "13:30~14:40",
  "14:40~15:50", "15:50~17:00", "17:00~18:10", "18:10~19:20",
  "19:20~20:30", "20:30~21:40",
];

export default function ConsultationsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [view, setView] = useState<"kanban" | "waiting" | "match">("kanban");
  const [newLead, setNewLead] = useState<any>({
    name: "", phone: "", member_type: "adult", source: "검색", memo: "",
    wish_days: [] as string[], wish_time_slots: [] as string[], wish_start_date: "",
  });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: ldata }, { data: sdata }] = await Promise.all([
      supabase.from("members").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("schedule_slots").select("id, day_of_week, time_slot, status, member_id").limit(1000),
    ]);
    setLeads((ldata as Lead[]) || []);
    setSlots((sdata as Slot[]) || []);
    setLoading(false);
  }

  async function moveLead(id: string, newStatus: string) {
    await supabase.from("members").update({ status: newStatus }).eq("id", id);
    loadAll();
  }

  async function addLead() {
    if (!newLead.name) return alert("이름을 입력하세요");
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const payload: any = {
      org_id: orgId,
      name: newLead.name,
      phone: newLead.phone || null,
      member_type: newLead.member_type,
      source: newLead.source,
      memo: newLead.memo || null,
      status: "waiting",
    };
    // wish 필드 - 컬럼이 없을 수도 있으므로 시도 + fallback extra
    payload.wish_days = newLead.wish_days;
    payload.wish_time_slots = newLead.wish_time_slots;
    payload.wish_start_date = newLead.wish_start_date || null;
    const { error } = await supabase.from("members").insert(payload);
    if (error) {
      // wish_* 컬럼이 없으면 extra로
      const { error: e2 } = await supabase.from("members").insert({
        org_id: orgId,
        name: newLead.name,
        phone: newLead.phone || null,
        member_type: newLead.member_type,
        source: newLead.source,
        memo: newLead.memo || null,
        status: "waiting",
        extra: {
          wish_days: newLead.wish_days,
          wish_time_slots: newLead.wish_time_slots,
          wish_start_date: newLead.wish_start_date || null,
        },
      });
      if (e2) return alert("추가 실패: " + e2.message);
    }
    setShowAddModal(false);
    setNewLead({ name: "", phone: "", member_type: "adult", source: "검색", memo: "", wish_days: [], wish_time_slots: [], wish_start_date: "" });
    loadAll();
  }

  // ─── 대기자 통계 ───
  const waitingLeads = leads.filter(l => l.status === "waiting" || l.status === "trial_scheduled");
  const stats = useMemo(() => ({
    total: waitingLeads.length,
    child: waitingLeads.filter(l => l.member_type === "child").length,
    adult: waitingLeads.filter(l => l.member_type === "adult").length,
    trialScheduled: leads.filter(l => l.status === "trial_scheduled").length,
    thisWeek: leads.filter(l => {
      if (!l.created_at) return false;
      const d = new Date(l.created_at);
      const now = new Date();
      const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 7;
    }).length,
  }), [leads, waitingLeads]);

  // ─── 시간대별 대기자 매칭 ───
  // day/time slot 별 대기자 수 집계
  const waitingByTimeSlot = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const l of waitingLeads) {
      const days = (l.wish_days || l.extra?.wish_days || []) as string[];
      const times = (l.wish_time_slots || l.extra?.wish_time_slots || []) as string[];
      for (const d of days) {
        for (const t of times) {
          const k = `${d}|${t}`;
          if (!map[k]) map[k] = [];
          map[k].push(l);
        }
      }
    }
    return map;
  }, [waitingLeads]);

  // 슬롯 상태 (OPEN/LOCK) 판단 - 슬롯이 존재하고 status='open'이면 OPEN
  function slotStatus(dayIdx: number, timeSlot: string): "open" | "booked" | "lock" {
    const s = slots.find(x => x.day_of_week === dayIdx && x.time_slot === timeSlot);
    if (!s) return "lock";
    if (s.status === "open" && !s.member_id) return "open";
    if (s.member_id) return "booked";
    return "lock";
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-aqu-50 to-white p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-pink-400 to-rose-500">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">
            상담 리드 관리
          </h1>
        </div>
        <div className="flex gap-2">
          <HomeButton />
          <button onClick={loadAll} className="px-3 py-2 text-sm text-aqu-700 hover:bg-aqu-50 rounded-lg flex items-center gap-1">
            <RefreshCw className="w-4 h-4" /> 새로고침
          </button>
          <button onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg hover:from-pink-600 hover:to-rose-600 flex items-center gap-2 shadow-md">
            <Plus className="w-4 h-4" /> 신규 상담 등록
          </button>
        </div>
      </div>

      {/* 통계 KPI */}
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <StatCard label="총 대기자" val={stats.total} color="from-yellow-400 to-orange-400" icon="⏳" />
        <StatCard label="아동" val={stats.child} color="from-purple-400 to-pink-400" icon="👶" />
        <StatCard label="성인" val={stats.adult} color="from-blue-400 to-cyan-400" icon="👤" />
        <StatCard label="체험 예정" val={stats.trialScheduled} color="from-emerald-400 to-teal-400" icon="📅" />
        <StatCard label="이번 주 유입" val={stats.thisWeek} color="from-rose-400 to-red-400" icon="🆕" />
      </div>

      {/* 뷰 전환 탭 */}
      <div className="max-w-7xl mx-auto mb-4 flex gap-2">
        <TabBtn active={view === "kanban"} onClick={() => setView("kanban")}>📋 칸반 보드</TabBtn>
        <TabBtn active={view === "waiting"} onClick={() => setView("waiting")}>⏳ 대기자 현황</TabBtn>
        <TabBtn active={view === "match"} onClick={() => setView("match")}>🎯 시간대 매칭</TabBtn>

        {/* Google Sheets 연동 안내 */}
        <a
          href="https://docs.google.com/spreadsheets/d/1lzSXvmClip7LXign9mqmRIE9CHyY2oqXApQhd-g6JKg/edit"
          target="_blank"
          className="ml-auto px-3 py-2 text-xs bg-green-50 border border-green-200 text-green-700 rounded-lg hover:bg-green-100 flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" /> AQU LAB 시트 열기
        </a>
      </div>

      {/* ─── 뷰 1: 칸반 보드 ─── */}
      {view === "kanban" && (
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {COLUMNS.map((col) => {
            const items = leads.filter(l => (l.status || "waiting") === col.key);
            return (
              <div key={col.key} className={`rounded-lg border-2 ${col.color} p-3`}>
                <div className="font-medium text-sm mb-2 flex justify-between">
                  <span>{col.label}</span>
                  <span className="text-xs bg-white/70 px-2 py-0.5 rounded-full">{items.length}</span>
                </div>
                <div className="space-y-2 min-h-[120px]">
                  {items.map(l => (
                    <div key={l.id} className="bg-white p-2 rounded-md shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                      <Link href={`/members/${l.id}`} className="font-medium text-sm text-aqu-900 hover:text-aqu-600 hover:underline flex items-center gap-1">
                        <User className="w-3 h-3" /> {l.name}
                      </Link>
                      <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                        {l.member_type === "child" ? "🧒" : "👤"} {l.member_type === "child" ? "아동" : "성인"}
                        {l.phone && <><Phone className="w-3 h-3 ml-1" /> {l.phone.slice(-4)}</>}
                      </div>
                      {l.source && <div className="text-[10px] text-gray-400 mt-1">🌐 {l.source}</div>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {COLUMNS.filter(c => c.key !== col.key).slice(0, 2).map(c => (
                          <button key={c.key} onClick={() => moveLead(l.id, c.key)}
                            className="text-[10px] px-1.5 py-0.5 bg-gray-50 rounded hover:bg-aqu-50 border border-gray-200">
                            → {c.label.split(" ")[1] || c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── 뷰 2: 대기자 현황 (시간대별 매트릭스) ─── */}
      {view === "waiting" && (
        <div className="max-w-7xl mx-auto bg-white rounded-xl border border-aqu-100 overflow-x-auto">
          <div className="p-4 border-b border-aqu-100">
            <h2 className="font-medium text-aqu-900 flex items-center gap-2">
              <Clock className="w-4 h-4" /> 요일·시간대별 대기자 집계
            </h2>
            <p className="text-xs text-gray-500 mt-1">각 셀에 대기자 이름과 인원수가 표시됩니다. 이름 클릭 시 상세로 이동.</p>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-aqu-50">
              <tr>
                <th className="p-2 border border-aqu-100 sticky left-0 bg-aqu-50">시간대</th>
                {DAYS.slice(1).map(d => <th key={d} className="p-2 border border-aqu-100 min-w-[110px]">{d}</th>)}
                <th className="p-2 border border-aqu-100">토</th>
                <th className="p-2 border border-aqu-100 bg-orange-50">총 대기</th>
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map((t) => {
                const rowTotal = DAYS.reduce((sum, d, i) => {
                  if (i === 0) return sum;
                  return sum + (waitingByTimeSlot[`${d}|${t}`]?.length || 0);
                }, 0);
                return (
                  <tr key={t}>
                    <td className="p-2 border border-aqu-100 bg-aqu-50 font-medium sticky left-0">{t}</td>
                    {DAYS.slice(1).map((d) => {
                      const list = waitingByTimeSlot[`${d}|${t}`] || [];
                      return (
                        <td key={d} className={`p-1 border border-aqu-100 align-top ${list.length > 0 ? "bg-yellow-50" : ""}`}>
                          {list.slice(0, 5).map((l, i) => (
                            <Link key={l.id} href={`/members/${l.id}`}
                              className="block text-[11px] text-aqu-700 hover:text-aqu-900 hover:underline">
                              {i + 1}. {l.name}
                            </Link>
                          ))}
                          {list.length > 5 && <div className="text-[10px] text-gray-400">+{list.length - 5}명</div>}
                        </td>
                      );
                    })}
                    <td className="p-2 border border-aqu-100 text-center font-medium bg-orange-50">
                      {rowTotal > 0 ? <span className="text-orange-600">⏳ {rowTotal}명</span> : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── 뷰 3: 시간대 매칭 (빈자리 vs 대기자) ─── */}
      {view === "match" && (
        <div className="max-w-7xl mx-auto bg-white rounded-xl border border-aqu-100 overflow-x-auto">
          <div className="p-4 border-b border-aqu-100 bg-gradient-to-r from-emerald-50 to-teal-50">
            <h2 className="font-medium text-emerald-900 flex items-center gap-2">
              🎯 빈자리 ↔ 대기자 자동 매칭
            </h2>
            <p className="text-xs text-emerald-700 mt-1">
              🟢 빈자리에 희망 대기자가 있으면 <strong>즉시 1순위 연락</strong>! · 🔴 예약됨 · ⬜ 운영 안함
            </p>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-emerald-50">
              <tr>
                <th className="p-2 border border-emerald-100 sticky left-0 bg-emerald-50">시간대</th>
                {DAYS.slice(1).map(d => <th key={d} className="p-2 border border-emerald-100 min-w-[130px]">{d}</th>)}
                <th className="p-2 border border-emerald-100">토</th>
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map((t) => (
                <tr key={t}>
                  <td className="p-2 border border-emerald-100 bg-emerald-50 font-medium sticky left-0">{t}</td>
                  {DAYS.slice(1).map((d, i) => {
                    const dayIdx = i + 1;
                    const st = slotStatus(dayIdx, t);
                    const waiters = waitingByTimeSlot[`${d}|${t}`] || [];
                    if (st === "lock") {
                      return <td key={d} className="p-1 border border-emerald-100 bg-gray-50 text-center text-gray-400">⬛ 운영 안함</td>;
                    }
                    if (st === "booked") {
                      return <td key={d} className="p-1 border border-emerald-100 bg-red-50 text-center text-red-600">🔴 예약됨</td>;
                    }
                    // OPEN
                    if (waiters.length > 0) {
                      return (
                        <td key={d} className="p-1 border-2 border-emerald-400 bg-emerald-50 align-top">
                          <div className="font-bold text-emerald-700 text-center mb-1">🟢 빈자리!</div>
                          <div className="text-[11px] font-medium text-emerald-800">1순위: {waiters[0].name}</div>
                          {waiters[0].phone && <div className="text-[10px] text-emerald-600">📞 {waiters[0].phone}</div>}
                          <Link href={`/members/${waiters[0].id}`}
                            className="text-[10px] text-aqu-600 hover:underline">→ 상세보기</Link>
                          {waiters.length > 1 && <div className="text-[10px] text-gray-500 mt-1">+ {waiters.length - 1}명 대기</div>}
                        </td>
                      );
                    }
                    return <td key={d} className="p-1 border border-emerald-100 bg-white text-center text-gray-400">🟢 빈자리</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 신규 상담 등록 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-aqu-900">🆕 신규 상담 등록</h3>
              <button onClick={() => setShowAddModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <Field label="이름 *" value={newLead.name} onChange={(v: string) => setNewLead({ ...newLead, name: v })} />
              <Field label="전화번호" value={newLead.phone} onChange={(v: string) => setNewLead({ ...newLead, phone: v })} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-600">유형</label>
                  <select value={newLead.member_type} onChange={(e) => setNewLead({ ...newLead, member_type: e.target.value })}
                    className="w-full p-2 border rounded-lg mt-1">
                    <option value="child">아동</option>
                    <option value="adult">성인</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">유입경로</label>
                  <select value={newLead.source} onChange={(e) => setNewLead({ ...newLead, source: e.target.value })}
                    className="w-full p-2 border rounded-lg mt-1">
                    <option>검색</option><option>블로그</option><option>인스타</option><option>지인</option><option>기타</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600">희망 요일 (복수 선택)</label>
                <div className="flex gap-1 mt-1">
                  {DAYS.slice(1).map(d => (
                    <button key={d} type="button"
                      onClick={() => {
                        const sel = newLead.wish_days.includes(d)
                          ? newLead.wish_days.filter((x: string) => x !== d)
                          : [...newLead.wish_days, d];
                        setNewLead({ ...newLead, wish_days: sel });
                      }}
                      className={`px-3 py-1 text-sm rounded-lg border ${
                        newLead.wish_days.includes(d) ? "bg-pink-500 text-white border-pink-500" : "bg-white border-gray-300"
                      }`}>{d}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600">희망 시간대 (복수 선택)</label>
                <div className="grid grid-cols-3 gap-1 mt-1">
                  {TIME_SLOTS.map(t => (
                    <button key={t} type="button"
                      onClick={() => {
                        const sel = newLead.wish_time_slots.includes(t)
                          ? newLead.wish_time_slots.filter((x: string) => x !== t)
                          : [...newLead.wish_time_slots, t];
                        setNewLead({ ...newLead, wish_time_slots: sel });
                      }}
                      className={`px-2 py-1 text-xs rounded border ${
                        newLead.wish_time_slots.includes(t) ? "bg-pink-500 text-white border-pink-500" : "bg-white border-gray-300"
                      }`}>{t}</button>
                  ))}
                </div>
              </div>
              <Field label="희망 시작일" type="date" value={newLead.wish_start_date} onChange={(v: string) => setNewLead({ ...newLead, wish_start_date: v })} />
              <div>
                <label className="text-sm text-gray-600">메모</label>
                <textarea value={newLead.memo} onChange={(e) => setNewLead({ ...newLead, memo: e.target.value })}
                  rows={3} className="w-full p-2 border rounded-lg mt-1" placeholder="첫 상담 내용, 특이사항 등" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={addLead} className="flex-1 py-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg font-medium hover:from-pink-600 hover:to-rose-600">
                  <Save className="w-4 h-4 inline mr-1" /> 저장
                </button>
                <button onClick={() => setShowAddModal(false)} className="px-4 py-2 border rounded-lg">취소</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, val, color, icon }: any) {
  return (
    <div className={`bg-gradient-to-br ${color} rounded-lg p-3 text-white shadow-sm`}>
      <div className="text-xs opacity-90">{icon} {label}</div>
      <div className="text-2xl font-bold mt-1">{val}</div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: any) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm rounded-lg ${
        active ? "bg-pink-500 text-white shadow-md" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
      }`}>{children}</button>
  );
}

function Field({ label, value, onChange, type = "text" }: any) {
  return (
    <div>
      <label className="text-sm text-gray-600">{label}</label>
      <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)}
        className="w-full p-2 border rounded-lg mt-1" />
    </div>
  );
}
