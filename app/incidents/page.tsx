"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { supabase } from "@/lib/supabase";
import {
  AlertTriangle, Plus, Search, Filter, Printer, FileText,
  Calendar, MapPin, User, Activity, X, Edit2, Trash2, Download
} from "lucide-react";

/* ============================================================
   v3.15.0 - 안전사고 · 응급 로그 관리
   - 사고 발생 즉시 기록 (시간·장소·조치)
   - 보험 청구용 리포트 자동 생성 (인쇄/PDF)
============================================================ */

const SEVERITY = [
  { value: "minor",    label: "경미",   color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  { value: "moderate", label: "중간",   color: "bg-orange-100 text-orange-800 border-orange-300" },
  { value: "severe",   label: "심각",   color: "bg-red-100 text-red-800 border-red-300" },
  { value: "critical", label: "위급",   color: "bg-red-600 text-white border-red-700" },
];

const CATEGORIES = [
  { value: "slip",       label: "🩹 미끄러짐/낙상" },
  { value: "collision",  label: "💥 충돌/부딪힘" },
  { value: "drowning",   label: "🌊 익수 위험" },
  { value: "cramp",      label: "🦵 쥐/근육경련" },
  { value: "cut",        label: "🩸 상처/찰과상" },
  { value: "faint",      label: "😵 실신/어지러움" },
  { value: "allergy",    label: "🤧 알레르기" },
  { value: "seizure",    label: "⚡ 발작" },
  { value: "equipment",  label: "🛠️ 장비 관련" },
  { value: "other",      label: "❓ 기타" },
];

const LOCATIONS = [
  "메인 풀 (수심 얕은쪽)", "메인 풀 (수심 깊은쪽)",
  "샤워실", "탈의실", "출입구", "복도",
  "상담실", "치료실", "기타"
];

const RESPONSE_STAGES = [
  { value: "first_aid",    label: "🩹 응급처치" },
  { value: "rest",         label: "😌 안정/휴식" },
  { value: "clinic",       label: "🏥 병원 진료" },
  { value: "hospital",     label: "🚑 응급실 이송" },
  { value: "call_119",     label: "🚨 119 신고" },
  { value: "parent_call",  label: "📞 보호자 연락" },
  { value: "no_action",    label: "🚫 조치 불필요" },
];

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function IncidentsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const [fSeverity, setFSeverity] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fSearch, setFSearch] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [ms, st, inc] = await Promise.all([
      supabase.from("members").select("id, name, member_type, guardian_name, guardian_relation, phone").is("deleted_at", null),
      supabase.from("staff").select("id, name, role, color"),
      supabase.from("incidents").select("*").order("incident_date", { ascending: false }).order("incident_time", { ascending: false }),
    ]);
    setMembers(ms.data || []);
    setStaff(st.data || []);
    if (inc.error) {
      console.error(inc.error);
      if (inc.error.message?.includes("does not exist") || inc.error.message?.includes("not found") || inc.error.code === "42P01" || inc.error.code === "PGRST205") {
        alert("⚠️ incidents 테이블이 없습니다.\nAQUNOTE_V315_INCIDENTS.sql을 Supabase SQL Editor에서 실행하세요.");
      }
      setItems([]);
    } else {
      setItems(inc.data || []);
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (fSeverity && it.severity !== fSeverity) return false;
      if (fCategory && it.category !== fCategory) return false;
      if (fFrom && it.incident_date < fFrom) return false;
      if (fTo && it.incident_date > fTo) return false;
      if (fSearch) {
        const kw = fSearch.trim().toLowerCase();
        const memberName = members.find((m) => m.id === it.member_id)?.name || "";
        const hay = `${it.title || ""} ${it.description || ""} ${it.location || ""} ${memberName}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [items, fSeverity, fCategory, fFrom, fTo, fSearch, members]);

  const stat = useMemo(() => {
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const monthAgoStr = monthAgo.toISOString().slice(0, 10);
    const recent = items.filter((i) => i.incident_date >= monthAgoStr);
    return {
      total: items.length,
      recent30: recent.length,
      severe: items.filter((i) => i.severity === "severe" || i.severity === "critical").length,
      insurance: items.filter((i) => i.insurance_claim).length,
    };
  }, [items]);

  async function deleteItem(id: string) {
    if (!confirm("이 사고 기록을 완전히 삭제할까요? (되돌릴 수 없습니다)")) return;
    const { error } = await supabase.from("incidents").delete().eq("id", id);
    if (error) alert("삭제 실패: " + error.message);
    else await loadAll();
  }

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <HomeButton />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-7 h-7" /> 안전사고 · 응급 로그
            </h1>
            <p className="text-xs md:text-sm text-gray-500 mt-0.5">
              사고 발생 즉시 기록 · 보험 청구용 리포트 자동 생성
            </p>
          </div>
        </div>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-md"
        >
          <Plus className="w-4 h-4" /> 사고 등록
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KPI title="전체 사고" val={stat.total} color="text-gray-700" icon="📋" />
        <KPI title="최근 30일" val={stat.recent30} color="text-orange-600" icon="📅" />
        <KPI title="중대 사고" val={stat.severe} color="text-red-600" icon="🚨" />
        <KPI title="보험 청구" val={stat.insurance} color="text-blue-600" icon="🛡️" />
      </div>

      {/* Filter */}
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-3 mb-4 flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-gray-400" />
        <select value={fSeverity} onChange={(e) => setFSeverity(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">
          <option value="">전체 심각도</option>
          {SEVERITY.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={fCategory} onChange={(e) => setFCategory(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">
          <option value="">전체 유형</option>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)}
          className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
        <span className="text-gray-400 text-xs">~</span>
        <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)}
          className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={fSearch} onChange={(e) => setFSearch(e.target.value)}
            placeholder="회원명 · 장소 · 내용 검색"
            className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-red-100 text-gray-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>등록된 사고 기록이 없습니다.</p>
          <p className="text-xs mt-1">우측 상단 "사고 등록" 버튼으로 추가하세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((it) => {
            const sev = SEVERITY.find((s) => s.value === it.severity);
            const cat = CATEGORIES.find((c) => c.value === it.category);
            const member = members.find((m) => m.id === it.member_id);
            const st = staff.find((s) => s.id === it.reporter_staff_id);
            return (
              <div key={it.id} className={`bg-white rounded-2xl shadow-sm border-l-4 ${sev?.value === "critical" ? "border-l-red-600" : sev?.value === "severe" ? "border-l-red-400" : sev?.value === "moderate" ? "border-l-orange-400" : "border-l-yellow-400"} border-t border-r border-b border-gray-100 p-4 hover:shadow-md transition`}>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${sev?.color}`}>
                        {sev?.label}
                      </span>
                      <span className="text-xs text-gray-500">{cat?.label}</span>
                      {it.insurance_claim && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-300">
                          🛡️ 보험청구
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-base text-gray-800">{it.title}</div>
                    <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-3">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {it.incident_date} {it.incident_time}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {it.location || "-"}</span>
                      {member && (
                        <Link href={`/members/${member.id}`} className="flex items-center gap-1 text-red-600 hover:underline">
                          <User className="w-3 h-3" /> {member.name}
                        </Link>
                      )}
                      {st && <span className="flex items-center gap-1 text-gray-500">기록자: {st.name}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPreviewId(it.id)}
                      className="p-2 hover:bg-red-50 rounded-lg text-red-700"
                      title="리포트 미리보기">
                      <FileText className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setEditing(it); setShowModal(true); }}
                      className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"
                      title="수정">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteItem(it.id)}
                      className="p-2 hover:bg-red-50 rounded-lg text-red-600"
                      title="삭제">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {it.description && (
                  <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-2 mt-2 leading-relaxed">
                    {it.description}
                  </div>
                )}
                {it.response_actions && Array.isArray(it.response_actions) && it.response_actions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {it.response_actions.map((r: string) => {
                      const rs = RESPONSE_STAGES.find((x) => x.value === r);
                      return rs ? (
                        <span key={r} className="text-[11px] px-2 py-0.5 bg-red-50 text-red-800 rounded-full border border-red-200">
                          {rs.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <IncidentModal
          incident={editing}
          members={members}
          staff={staff}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={async () => { setShowModal(false); setEditing(null); await loadAll(); }}
        />
      )}

      {/* Preview */}
      {previewId && (
        <ReportPreview
          incident={items.find((x) => x.id === previewId)!}
          member={members.find((m) => m.id === items.find((x) => x.id === previewId)?.member_id)}
          staffName={staff.find((s) => s.id === items.find((x) => x.id === previewId)?.reporter_staff_id)?.name || "-"}
          onClose={() => setPreviewId(null)}
        />
      )}
    </main>
  );
}

function KPI({ title, val, color, icon }: any) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-3 text-center">
      <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
        <span>{icon}</span> {title}
      </div>
      <div className={`text-xl md:text-2xl font-bold ${color} mt-1`}>{val}</div>
    </div>
  );
}

/* ============================================================
   사고 등록/수정 모달
============================================================ */
function IncidentModal({ incident, members, staff, onClose, onSaved }: any) {
  const [f, setF] = useState<any>({
    incident_date: incident?.incident_date || todayStr(),
    incident_time: incident?.incident_time || nowTime(),
    member_id: incident?.member_id || "",
    reporter_staff_id: incident?.reporter_staff_id || "",
    severity: incident?.severity || "minor",
    category: incident?.category || "slip",
    location: incident?.location || "메인 풀 (수심 얕은쪽)",
    title: incident?.title || "",
    description: incident?.description || "",
    response_actions: incident?.response_actions || [],
    witness: incident?.witness || "",
    hospital_name: incident?.hospital_name || "",
    diagnosis: incident?.diagnosis || "",
    treatment_cost: incident?.treatment_cost || 0,
    insurance_claim: incident?.insurance_claim || false,
    insurance_company: incident?.insurance_company || "",
    parent_notified: incident?.parent_notified || false,
    parent_notified_at: incident?.parent_notified_at || "",
    followup: incident?.followup || "",
  });
  const [saving, setSaving] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");

  const filteredMembers = !memberSearch.trim()
    ? members.slice(0, 30)
    : members.filter((m: any) => (m.name || "").toLowerCase().includes(memberSearch.trim().toLowerCase())).slice(0, 30);

  const selectedMember = members.find((m: any) => m.id === f.member_id);

  function toggleAction(v: string) {
    const arr = f.response_actions.includes(v)
      ? f.response_actions.filter((x: string) => x !== v)
      : [...f.response_actions, v];
    setF({ ...f, response_actions: arr });
  }

  async function save() {
    if (!f.title.trim()) { alert("사고 제목을 입력하세요"); return; }
    if (!f.incident_date) { alert("발생일자를 입력하세요"); return; }
    setSaving(true);

    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;

    const payload = {
      ...f,
      org_id: orgId,
      treatment_cost: Number(f.treatment_cost) || 0,
      member_id: f.member_id || null,
      reporter_staff_id: f.reporter_staff_id || null,
      parent_notified_at: f.parent_notified_at || null,
    };

    let error;
    if (incident?.id) {
      const res = await supabase.from("incidents").update(payload).eq("id", incident.id);
      error = res.error;
    } else {
      const res = await supabase.from("incidents").insert(payload);
      error = res.error;
    }

    setSaving(false);
    if (error) {
      alert("저장 실패: " + error.message);
    } else {
      await onSaved();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 md:p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-red-50 rounded-t-2xl sticky top-0 z-10">
          <div>
            <div className="text-lg font-bold text-red-800 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> {incident ? "사고 수정" : "사고 등록"}
            </div>
            <div className="text-xs text-gray-600">발생 즉시 정확히 기록해주세요</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-red-100 rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* 발생 정보 */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="📅 발생 일자 *">
              <input type="date" value={f.incident_date} onChange={(e) => setF({ ...f, incident_date: e.target.value })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
            </Field>
            <Field label="⏰ 발생 시각 *">
              <input type="time" value={f.incident_time} onChange={(e) => setF({ ...f, incident_time: e.target.value })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
            </Field>
            <Field label="👨‍🏫 기록자">
              <select value={f.reporter_staff_id} onChange={(e) => setF({ ...f, reporter_staff_id: e.target.value })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm">
                <option value="">선택</option>
                {staff.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>

          {/* 심각도 + 유형 */}
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-1">🚨 심각도 *</div>
            <div className="flex gap-2 flex-wrap">
              {SEVERITY.map((s) => (
                <button key={s.value} type="button" onClick={() => setF({ ...f, severity: s.value })}
                  className={`px-3 py-2 rounded-lg text-sm font-bold border-2 ${f.severity === s.value ? s.color + " border-current" : "bg-white text-gray-500 border-gray-200"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-700 mb-1">🏷️ 사고 유형 *</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-1.5">
              {CATEGORIES.map((c) => (
                <button key={c.value} type="button" onClick={() => setF({ ...f, category: c.value })}
                  className={`px-2 py-1.5 rounded-lg text-xs border ${f.category === c.value ? "bg-red-100 text-red-800 border-red-400 font-bold" : "bg-white text-gray-600 border-gray-200"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* 회원 검색 */}
          <Field label="👤 관련 회원 (선택)">
            {selectedMember ? (
              <div className="flex items-center justify-between p-2 bg-red-50 border border-red-200 rounded-lg">
                <span className="text-sm font-semibold text-red-800">
                  {selectedMember.name} {selectedMember.member_type === "child" ? "(아동)" : "(성인)"}
                  {selectedMember.guardian_name && ` · 보호자: ${selectedMember.guardian_name}`}
                </span>
                <button onClick={() => setF({ ...f, member_id: "" })} className="text-xs text-red-600 hover:underline">변경</button>
              </div>
            ) : (
              <>
                <input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="회원명 검색..."
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm mb-1" />
                {memberSearch && (
                  <div className="max-h-40 overflow-y-auto bg-white border border-gray-200 rounded-lg">
                    {filteredMembers.length === 0 ? (
                      <div className="p-2 text-xs text-gray-400 text-center">검색 결과 없음</div>
                    ) : filteredMembers.map((m: any) => (
                      <button key={m.id} onClick={() => { setF({ ...f, member_id: m.id }); setMemberSearch(""); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 border-b border-gray-100 flex justify-between">
                        <span>{m.name}</span>
                        <span className="text-[10px] text-gray-400">{m.member_type === "child" ? "아동" : "성인"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </Field>

          {/* 장소 + 제목 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="📍 발생 장소">
              <select value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm">
                {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="📝 사고 제목 *">
              <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })}
                placeholder="예: 샤워실에서 미끄러져 무릎 타박상"
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
            </Field>
          </div>

          {/* 상세 내용 */}
          <Field label="📄 상세 내용 (경위·상황)">
            <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })}
              rows={4} placeholder="사고 발생 상황, 원인, 부상 부위 등을 자세히 기록"
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm leading-relaxed" />
          </Field>

          {/* 조치 사항 */}
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-1">🩹 취한 조치 (다중 선택)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
              {RESPONSE_STAGES.map((r) => (
                <button key={r.value} type="button" onClick={() => toggleAction(r.value)}
                  className={`px-2 py-1.5 rounded-lg text-xs border ${f.response_actions.includes(r.value) ? "bg-red-100 text-red-800 border-red-400 font-bold" : "bg-white text-gray-600 border-gray-200"}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* 목격자 + 병원 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="👀 목격자">
              <input value={f.witness} onChange={(e) => setF({ ...f, witness: e.target.value })}
                placeholder="예: 김민수 강사, 학부모 박모씨"
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
            </Field>
            <Field label="🏥 방문 병원명">
              <input value={f.hospital_name} onChange={(e) => setF({ ...f, hospital_name: e.target.value })}
                placeholder="예: 서울정형외과의원"
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
            </Field>
          </div>

          <Field label="🔬 진단명 · 상해 정도">
            <input value={f.diagnosis} onChange={(e) => setF({ ...f, diagnosis: e.target.value })}
              placeholder="예: 우측 무릎 타박상, 2주 안정"
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
          </Field>

          {/* 보호자 통보 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="👪 보호자 통보">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.parent_notified} onChange={(e) => setF({ ...f, parent_notified: e.target.checked })} />
                통보 완료
              </label>
            </Field>
            <Field label="📞 통보 일시">
              <input type="datetime-local" value={f.parent_notified_at} onChange={(e) => setF({ ...f, parent_notified_at: e.target.value })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
            </Field>
          </div>

          {/* 보험 청구 */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <label className="flex items-center gap-2 text-sm font-bold text-blue-800 mb-2">
              <input type="checkbox" checked={f.insurance_claim} onChange={(e) => setF({ ...f, insurance_claim: e.target.checked })} />
              🛡️ 보험 청구 대상
            </label>
            {f.insurance_claim && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                <Field label="보험사">
                  <input value={f.insurance_company} onChange={(e) => setF({ ...f, insurance_company: e.target.value })}
                    placeholder="예: 한화손해보험"
                    className="w-full px-2 py-1.5 border border-blue-300 rounded-lg text-sm" />
                </Field>
                <Field label="치료비 (원)">
                  <input type="number" value={f.treatment_cost} onChange={(e) => setF({ ...f, treatment_cost: e.target.value })}
                    className="w-full px-2 py-1.5 border border-blue-300 rounded-lg text-sm text-right" />
                </Field>
              </div>
            )}
          </div>

          <Field label="🔄 후속 조치 · 재발 방지">
            <textarea value={f.followup} onChange={(e) => setF({ ...f, followup: e.target.value })}
              rows={2} placeholder="예: 샤워실 미끄럼방지매트 추가 설치"
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
          </Field>

          <div className="flex justify-end gap-2 pt-3 border-t sticky bottom-0 bg-white">
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">취소</button>
            <button onClick={save} disabled={saving}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold">
              {saving ? "저장 중..." : "✓ 저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-700 mb-1">{label}</div>
      {children}
    </div>
  );
}

/* ============================================================
   보험 청구용 리포트 (인쇄/PDF)
============================================================ */
function ReportPreview({ incident, member, staffName, onClose }: any) {
  const sev = SEVERITY.find((s) => s.value === incident.severity);
  const cat = CATEGORIES.find((c) => c.value === incident.category);

  function printReport() {
    const w = window.open("", "_blank", "width=900,height=1200");
    if (!w) { alert("팝업 차단을 해제해주세요"); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>안전사고 발생 보고서</title>
<style>
body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;padding:32px;color:#111;font-size:13px;line-height:1.6}
h1{text-align:center;font-size:22px;margin-bottom:4px;letter-spacing:2px}
.sub{text-align:center;color:#666;font-size:11px;margin-bottom:24px}
table{width:100%;border-collapse:collapse;margin-bottom:16px}
td,th{border:1px solid #333;padding:8px 12px;vertical-align:top}
th{background:#f3f4f6;text-align:left;width:22%;font-weight:bold}
.section{margin-top:16px;font-weight:bold;color:#dc2626;border-bottom:2px solid #dc2626;padding-bottom:4px;margin-bottom:8px}
.sig-area{margin-top:40px;display:flex;justify-content:space-around}
.sig-box{text-align:center;width:180px}
.sig-line{border-top:1px solid #333;margin-top:60px;padding-top:6px}
.stamp{color:#dc2626;font-weight:bold;font-size:14px}
@media print{.no-print{display:none}}
</style></head><body>
<h1>안 전 사 고 발 생 보 고 서</h1>
<div class="sub">아쿠수중운동센터 · 발행일: ${new Date().toISOString().slice(0, 10)}</div>

<div class="section">■ 사고 개요</div>
<table>
  <tr><th>사고 제목</th><td colspan="3"><b>${escapeHtml(incident.title || "")}</b></td></tr>
  <tr><th>발생 일자</th><td>${incident.incident_date} ${incident.incident_time || ""}</td>
      <th>심각도</th><td class="stamp">${sev?.label || "-"}</td></tr>
  <tr><th>사고 유형</th><td>${cat?.label || "-"}</td>
      <th>발생 장소</th><td>${escapeHtml(incident.location || "-")}</td></tr>
  <tr><th>관련 회원</th><td>${escapeHtml(member?.name || "-")} ${member?.member_type === "child" ? "(아동)" : member ? "(성인)" : ""}</td>
      <th>보호자</th><td>${escapeHtml(member?.guardian_name || "-")}</td></tr>
  <tr><th>목격자</th><td colspan="3">${escapeHtml(incident.witness || "-")}</td></tr>
</table>

<div class="section">■ 사고 경위 · 상황</div>
<table><tr><td style="min-height:100px;white-space:pre-wrap">${escapeHtml(incident.description || "-")}</td></tr></table>

<div class="section">■ 응급 조치 사항</div>
<table>
  <tr><th>취한 조치</th><td>${(incident.response_actions || []).map((r: string) => RESPONSE_STAGES.find((x) => x.value === r)?.label).filter(Boolean).join(" · ") || "-"}</td></tr>
  <tr><th>방문 병원</th><td>${escapeHtml(incident.hospital_name || "-")}</td></tr>
  <tr><th>진단명 / 상해 정도</th><td>${escapeHtml(incident.diagnosis || "-")}</td></tr>
  <tr><th>보호자 통보</th><td>${incident.parent_notified ? "✓ 통보 완료" : "미통보"} ${incident.parent_notified_at ? " (" + incident.parent_notified_at.replace("T", " ") + ")" : ""}</td></tr>
</table>

<div class="section">■ 보험 청구 정보</div>
<table>
  <tr><th>청구 대상</th><td>${incident.insurance_claim ? "✓ 예" : "아니오"}</td>
      <th>보험사</th><td>${escapeHtml(incident.insurance_company || "-")}</td></tr>
  <tr><th>치료비</th><td colspan="3"><b>${(incident.treatment_cost || 0).toLocaleString()}원</b></td></tr>
</table>

<div class="section">■ 후속 조치 · 재발 방지</div>
<table><tr><td style="min-height:60px;white-space:pre-wrap">${escapeHtml(incident.followup || "-")}</td></tr></table>

<div class="sig-area">
  <div class="sig-box"><div>기록자</div><div class="sig-line">${escapeHtml(staffName || "-")} (인)</div></div>
  <div class="sig-box"><div>담당자 확인</div><div class="sig-line">(인)</div></div>
  <div class="sig-box"><div>대표자 확인</div><div class="sig-line">(인)</div></div>
</div>

<div style="margin-top:24px;text-align:center;color:#666;font-size:10px">
본 보고서는 아쿠수중운동센터 CRM 시스템에서 자동 생성되었습니다.<br/>
문서 ID: ${incident.id} · 발행 시각: ${new Date().toISOString().replace("T", " ").slice(0, 19)}
</div>

<div class="no-print" style="margin-top:20px;text-align:center">
  <button onclick="window.print()" style="padding:10px 20px;background:#dc2626;color:white;border:0;border-radius:8px;cursor:pointer;font-size:14px">🖨️ 인쇄 / PDF 저장</button>
</div>
</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b bg-red-50 sticky top-0">
          <div className="flex items-center gap-2 font-bold text-red-800">
            <FileText className="w-5 h-5" /> 보험 청구용 리포트 미리보기
          </div>
          <div className="flex gap-2">
            <button onClick={printReport}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold flex items-center gap-1">
              <Printer className="w-4 h-4" /> 인쇄 / PDF
            </button>
            <button onClick={onClose} className="p-1 hover:bg-red-100 rounded"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="p-6 text-sm text-gray-800 space-y-4">
          <h2 className="text-xl font-bold text-center border-b pb-2">안 전 사 고 발 생 보 고 서</h2>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 border rounded-lg p-3 bg-gray-50">
            <div><b>발생 일시</b>: {incident.incident_date} {incident.incident_time}</div>
            <div><b>심각도</b>: <span className={`px-1.5 rounded text-xs ${sev?.color}`}>{sev?.label}</span></div>
            <div><b>사고 유형</b>: {cat?.label}</div>
            <div><b>발생 장소</b>: {incident.location || "-"}</div>
            <div className="col-span-2"><b>사고 제목</b>: {incident.title}</div>
            <div><b>회원</b>: {member?.name || "-"}</div>
            <div><b>기록자</b>: {staffName}</div>
          </div>

          {incident.description && (
            <div>
              <div className="font-bold text-red-700 mb-1">경위/상황</div>
              <div className="whitespace-pre-wrap bg-gray-50 p-2 rounded border text-sm">{incident.description}</div>
            </div>
          )}

          <div>
            <div className="font-bold text-red-700 mb-1">응급 조치</div>
            <div className="flex flex-wrap gap-1 mb-2">
              {(incident.response_actions || []).map((r: string) => {
                const rs = RESPONSE_STAGES.find((x) => x.value === r);
                return rs ? <span key={r} className="text-xs px-2 py-0.5 bg-red-50 border border-red-200 text-red-800 rounded">{rs.label}</span> : null;
              })}
            </div>
            <div className="text-sm space-y-1">
              <div><b>병원</b>: {incident.hospital_name || "-"}</div>
              <div><b>진단</b>: {incident.diagnosis || "-"}</div>
              <div><b>보호자 통보</b>: {incident.parent_notified ? "✓ 완료" : "미완료"}</div>
            </div>
          </div>

          {incident.insurance_claim && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="font-bold text-blue-800 mb-1">🛡️ 보험 청구</div>
              <div className="text-sm">보험사: {incident.insurance_company || "-"}</div>
              <div className="text-sm">치료비: <b>{Number(incident.treatment_cost || 0).toLocaleString()}원</b></div>
            </div>
          )}

          {incident.followup && (
            <div>
              <div className="font-bold text-red-700 mb-1">후속 조치</div>
              <div className="whitespace-pre-wrap bg-gray-50 p-2 rounded border text-sm">{incident.followup}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}
