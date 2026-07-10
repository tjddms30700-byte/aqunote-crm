"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import {
  Waves, Plus, Phone, Calendar, User, MessageCircle,
  ArrowRight, X, Save
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
};

const COLUMNS = [
  { key: "waiting", label: "⏳ 대기중", color: "bg-yellow-50 border-yellow-200" },
  { key: "trial_scheduled", label: "📅 체험예정", color: "bg-blue-50 border-blue-200" },
  { key: "trial_done", label: "✅ 체험완료", color: "bg-purple-50 border-purple-200" },
  { key: "regular", label: "🎯 정규등록", color: "bg-green-50 border-green-200" },
  { key: "paused", label: "⏸️ 보류", color: "bg-gray-50 border-gray-200" },
  { key: "ended", label: "🛑 대기종료", color: "bg-red-50 border-red-200" },
];

export default function ConsultationsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLead, setNewLead] = useState<any>({
    name: "", phone: "", member_type: "adult", source: "검색", memo: ""
  });

  useEffect(() => {
    loadLeads();
  }, []);

  async function loadLeads() {
    const { data } = await supabase.from("members").select("*").order("created_at", { ascending: false });
    setLeads((data as Lead[]) || []);
    setLoading(false);
  }

  async function moveLead(id: string, newStatus: string) {
    await supabase.from("members").update({ status: newStatus }).eq("id", id);
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));
  }

  async function addLead() {
    if (!newLead.name) return;
    // 기본 org_id 확보 (첫 organization)
    const { data: orgs } = await supabase.from("organizations").select("id").limit(1);
    const orgId = orgs?.[0]?.id;
    const { error } = await supabase.from("members").insert({
      name: newLead.name,
      phone: newLead.phone,
      member_type: newLead.member_type,
      source: newLead.source,
      memo: newLead.memo,
      status: "waiting",
      org_id: orgId,
    });
    if (!error) {
      setShowAddModal(false);
      setNewLead({ name: "", phone: "", member_type: "adult", source: "검색", memo: "" });
      loadLeads();
    }
  }

  const leadsByColumn = (col: string) =>
    leads.filter((l) => (l.status || "waiting") === col);

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Waves className="w-8 h-8 text-aqu-600" />
          <h1 className="text-2xl md:text-3xl font-bold text-aqu-900">📋 상담 리드</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-aqu-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-aqu-700"
          >
            <Plus className="w-4 h-4" /> 신규
          </button>
          <Link href="/" className="text-sm text-aqu-600 hover:underline">← 홈</Link>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-gray-400">불러오는 중…</div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {COLUMNS.map((col) => (
              <div key={col.key} className="w-72 flex-shrink-0">
                <div className={`p-3 rounded-t-xl border-b-2 ${col.color}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{col.label}</span>
                    <span className="text-xs bg-white px-2 py-0.5 rounded-full">
                      {leadsByColumn(col.key).length}
                    </span>
                  </div>
                </div>
                <div className={`p-2 min-h-[400px] rounded-b-xl border-l border-r border-b ${col.color}`}>
                  {leadsByColumn(col.key).map((l) => (
                    <LeadCard key={l.id} lead={l} onMove={moveLead} />
                  ))}
                  {leadsByColumn(col.key).length === 0 && (
                    <div className="text-center text-xs text-gray-400 py-6">비어있음</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 text-xs text-gray-400 text-right">
        💡 카드의 &quot;→&quot; 버튼으로 다음 단계로 이동 · 데스크톱은 좌우 스크롤
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
             onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-aqu-900">🆕 신규 상담 리드</h3>
              <button onClick={() => setShowAddModal(false)}>
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-600">구분</label>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => setNewLead({ ...newLead, member_type: "child" })}
                    className={`flex-1 py-2 rounded-lg text-sm ${newLead.member_type === "child" ? "bg-blue-500 text-white" : "bg-gray-100"}`}
                  >👶 아동</button>
                  <button
                    onClick={() => setNewLead({ ...newLead, member_type: "adult" })}
                    className={`flex-1 py-2 rounded-lg text-sm ${newLead.member_type === "adult" ? "bg-purple-500 text-white" : "bg-gray-100"}`}
                  >🧑 성인</button>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600">이름 *</label>
                <input value={newLead.name} onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                       className="w-full px-3 py-2 rounded-lg border border-aqu-200 text-sm mt-1" placeholder="김철수"/>
              </div>
              <div>
                <label className="text-xs text-gray-600">연락처</label>
                <input value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                       className="w-full px-3 py-2 rounded-lg border border-aqu-200 text-sm mt-1" placeholder="010-1234-5678"/>
              </div>
              <div>
                <label className="text-xs text-gray-600">유입경로</label>
                <select value={newLead.source} onChange={(e) => setNewLead({ ...newLead, source: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-aqu-200 text-sm mt-1">
                  <option>검색</option><option>소개</option><option>간판</option><option>지인</option><option>기타</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">메모</label>
                <textarea value={newLead.memo} onChange={(e) => setNewLead({ ...newLead, memo: e.target.value })}
                          rows={2} className="w-full px-3 py-2 rounded-lg border border-aqu-200 text-sm mt-1" placeholder="희망 시간 등"/>
              </div>
              <button onClick={addLead} disabled={!newLead.name}
                      className="w-full py-2 bg-aqu-600 text-white rounded-lg text-sm disabled:bg-gray-300 hover:bg-aqu-700 flex items-center justify-center gap-1">
                <Save className="w-4 h-4" /> 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function LeadCard({ lead, onMove }: { lead: Lead; onMove: (id: string, s: string) => void }) {
  const currentIdx = COLUMNS.findIndex((c) => c.key === (lead.status || "waiting"));
  const nextCol = COLUMNS[currentIdx + 1];

  return (
    <Link href={`/members/${lead.id}`} className="block">
      <div className="bg-white p-3 rounded-lg shadow-sm mb-2 border border-white hover:border-aqu-300 transition">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-1">
            <span className="font-medium text-sm text-aqu-900">{lead.name}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] ${lead.member_type === "child" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
              {lead.member_type === "child" ? "아동" : "성인"}
            </span>
          </div>
          {nextCol && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onMove(lead.id, nextCol.key);
              }}
              className="text-aqu-600 hover:bg-aqu-100 rounded p-0.5"
              title={`→ ${nextCol.label}`}
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
        {lead.phone && (
          <div className="text-xs text-gray-500 flex items-center gap-1 mb-0.5">
            <Phone className="w-3 h-3" />{lead.phone}
          </div>
        )}
        {lead.source && (
          <div className="text-xs text-gray-500">유입: {lead.source}</div>
        )}
        {lead.memo && (
          <div className="text-xs text-gray-600 mt-1 line-clamp-2">📝 {lead.memo}</div>
        )}
      </div>
    </Link>
  );
}
