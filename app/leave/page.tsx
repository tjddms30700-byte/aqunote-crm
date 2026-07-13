"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import HomeButton from "@/components/HomeButton";
import { FileCheck, Plus, X, Check, Ban, Clock } from "lucide-react";

const TYPES = [
  { v: "annual",       label: "연차",     color: "bg-blue-100 text-blue-700" },
  { v: "sick",         label: "병가",     color: "bg-red-100 text-red-700" },
  { v: "personal",     label: "개인휴가",  color: "bg-purple-100 text-purple-700" },
  { v: "compensatory", label: "보상휴가",  color: "bg-emerald-100 text-emerald-700" },
  { v: "other",        label: "기타",     color: "bg-gray-100 text-gray-700" },
];
const STATUS = {
  pending:  { label: "대기중", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  approved: { label: "승인",   color: "bg-green-100 text-green-700 border-green-300" },
  rejected: { label: "반려",   color: "bg-red-100 text-red-700 border-red-300" },
  canceled: { label: "취소",   color: "bg-gray-100 text-gray-600 border-gray-300" },
};

export default function LeavePage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>({
    staff_id: "", leave_type: "annual",
    start_date: new Date().toISOString().slice(0,10),
    end_date: new Date().toISOString().slice(0,10),
    reason: "",
  });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [rRes, sRes] = await Promise.all([
      supabase.from("leave_requests").select("*, staff:staff_id(name, role)").order("created_at", { ascending: false }),
      supabase.from("staff").select("*").order("name"),
    ]);
    setRequests(rRes.data || []);
    setStaff(sRes.data || []);
    setLoading(false);
  }

  async function submitRequest() {
    if (!form.staff_id) return;
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const days = Math.round((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000) + 1;
    await supabase.from("leave_requests").insert({
      org_id: orgId,
      staff_id: form.staff_id,
      leave_type: form.leave_type,
      start_date: form.start_date,
      end_date: form.end_date,
      days,
      reason: form.reason || null,
      status: "pending",
    });
    setShowModal(false);
    setForm({ staff_id: "", leave_type: "annual",
      start_date: new Date().toISOString().slice(0,10),
      end_date: new Date().toISOString().slice(0,10),
      reason: "" });
    await loadAll();
  }

  async function approve(id: string) {
    await supabase.from("leave_requests").update({
      status: "approved",
      approved_at: new Date().toISOString(),
    }).eq("id", id);
    await loadAll();
  }
  async function reject(id: string) {
    const reason = prompt("반려 사유:");
    if (reason === null) return;
    await supabase.from("leave_requests").update({
      status: "rejected",
      reject_reason: reason,
    }).eq("id", id);
    await loadAll();
  }
  async function cancel(id: string) {
    if (!confirm("이 요청을 취소할까요?")) return;
    await supabase.from("leave_requests").update({ status: "canceled" }).eq("id", id);
    await loadAll();
  }

  const pending = requests.filter(r => r.status === "pending");
  const approved = requests.filter(r => r.status === "approved");

  return (
    <main className="max-w-5xl mx-auto px-3 md:px-6 py-6 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
          <FileCheck className="w-6 h-6 md:w-7 md:h-7 text-emerald-500" /> 휴가 · 전자결재
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setShowModal(true)}
            className="bg-aqu-600 hover:bg-aqu-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1">
            <Plus className="w-4 h-4" /> 휴가 신청
          </button>
          <HomeButton />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <KPI label="대기중" val={pending.length + "건"} color="text-yellow-600" />
        <KPI label="이번달 승인" val={approved.filter(r => r.start_date?.startsWith(new Date().toISOString().slice(0,7))).length + "건"} color="text-green-600" />
        <KPI label="전체 요청" val={requests.length + "건"} color="text-aqu-700" />
      </div>

      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
        <div className="p-3 border-b border-gray-100 font-bold text-aqu-900">신청 목록</div>
        {loading ? (
          <div className="p-6 text-center text-gray-500">로딩...</div>
        ) : requests.length === 0 ? (
          <div className="p-10 text-center text-gray-400">신청 내역이 없습니다</div>
        ) : (
          <div className="divide-y">
            {requests.map(r => {
              const t = TYPES.find(x => x.v === r.leave_type);
              const s = STATUS[r.status as keyof typeof STATUS];
              return (
                <div key={r.id} className="p-3 md:p-4 flex flex-wrap items-center gap-2 hover:bg-aqu-50/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded border ${s.color}`}>{s.label}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded ${t?.color}`}>{t?.label}</span>
                      <span className="font-medium text-sm">{r.staff?.name}</span>
                      <span className="text-xs text-gray-500">({r.staff?.role})</span>
                    </div>
                    <div className="text-sm text-gray-700">
                      📅 {r.start_date} ~ {r.end_date} <b>({r.days}일)</b>
                    </div>
                    {r.reason && <div className="text-xs text-gray-500 mt-0.5">💬 {r.reason}</div>}
                    {r.reject_reason && <div className="text-xs text-red-500 mt-0.5">❌ 반려: {r.reject_reason}</div>}
                  </div>
                  {r.status === "pending" && (
                    <div className="flex gap-1">
                      <button onClick={() => approve(r.id)}
                        className="text-xs px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded flex items-center gap-1">
                        <Check className="w-3 h-3" /> 승인
                      </button>
                      <button onClick={() => reject(r.id)}
                        className="text-xs px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded flex items-center gap-1">
                        <Ban className="w-3 h-3" /> 반려
                      </button>
                      <button onClick={() => cancel(r.id)}
                        className="text-xs px-2 py-1 border border-gray-200 rounded">취소</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-aqu-900">📝 휴가 신청</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">신청자 *</label>
                <select value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="">-- 선택 --</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">종류</label>
                <div className="grid grid-cols-5 gap-1">
                  {TYPES.map(t => (
                    <button key={t.v} onClick={() => setForm({ ...form, leave_type: t.v })}
                      className={`py-1.5 rounded text-xs border ${form.leave_type === t.v ? t.color + " font-bold border-transparent" : "bg-white border-gray-200"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">시작일</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">종료일</label>
                  <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">사유</label>
                <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                  rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">취소</button>
              <button onClick={submitRequest} disabled={!form.staff_id}
                className="flex-1 px-4 py-2 bg-aqu-600 hover:bg-aqu-700 text-white rounded-lg text-sm disabled:opacity-50">
                제출
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function KPI({ label, val, color }: any) {
  return (
    <div className="p-3 bg-white rounded-xl border border-aqu-100 text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{val}</div>
    </div>
  );
}
