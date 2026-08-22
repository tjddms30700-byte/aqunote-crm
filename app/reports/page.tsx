"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { analyzeSessions, detectBehaviors, recommendIepGoals, summarizeWeekly } from "@/lib/sessionAnalyzer";
import HomeButton from "@/components/HomeButton";
import { FileText, Download, User, Calendar, Printer, Loader2, ClipboardList, Search } from "lucide-react";

// v3.20.21: 직원용/회원용 양식 라이브러리 (v3.20.35: 4종 신규 보강 서식 추가)
const STAFF_FORMS = [
  { v: "employment",     label: "📄 근로계약서", desc: "표준 근로계약서 자동 생성" },
  { v: "nda",            label: "🔒 비밀유지서약서(NDA)", desc: "직원 기밀 보호 서약" },
  { v: "staff_privacy",  label: "🔒 개인정보·치료기록 비밀유지", desc: "회원 민감정보 보호 서약" },
  { v: "resignation",    label: "📝 사직서",       desc: "퇴사 자동 설문" },
  { v: "incident",       label: "⚠️ 시말서",       desc: "징계/사유서 자동 설문" },
];
// ✨ v3.33.2: 회원 이용계약서를 통합 4페이지(member_unified) 1개로 정돈
// ❌ 삭제: privacy, safety, aqua_safety(전부 통합), portrait, research, consent_minor (3종)
// ✅ v3.39.2: 라벨 간소화 (수중재활 이용계약서 / 지상재활·디바이스케어 이용계약서)
const MEMBER_FORMS = [
  { v: "member_unified", label: "📋 수중재활 이용계약서", desc: "이용계약 + 개인정보 + 안전 + 응급처치 · 등록 회원권 드롭다운 가변 선택 (4페이지)" },
  { v: "ground_care", label: "🏋️‍♂️ 지상재활·디바이스케어 이용계약서", desc: "자율 예약제 · 100% 회차권 즉시 차감 · 보강 없음 · 안전 사전 체크 필수" },
];

// ✅ v3.46.0: 4탭 → 2탭 통폐합 (성장 종합보고서)
const REPORT_TYPES = [
  { v: "monthly", label: "📅 월간 성장보고서", desc: "이번 달 세션·6축·PDF 자동 생성" },
  { v: "yearly",  label: "📊 연간 성장보고서", desc: "올해 성장 추이·연간 요약·PDF" },
];

// v3.20.36: 체험/상담 리드의 상세 데이터까지 URL로 전달해 계약서 변수 자동 치환
function buildContractUrl(formType: string, subject: any, embed: boolean): string {
  const params = new URLSearchParams();
  params.set("new", formType);
  params.set("subject_kind", subject?.kind || "member");
  // lead인 경우 subject_id를 비우고 lead_id만 전달 (contracts 페이지는 lead_id로 consult_form 재조회)
  if (subject?.source_type === "lead") {
    params.set("lead_id", subject.lead_id || "");
  } else if (subject?.id) {
    params.set("subject_id", subject.id);
  }
  params.set("subject_name", subject?.name || "");
  if (subject?.phone) params.set("phone", subject.phone);
  if (subject?.birth) params.set("birth", subject.birth);
  if (subject?.guardian_name) params.set("guardian_name", subject.guardian_name);
  if (subject?.guardian_relation) params.set("guardian_relation", subject.guardian_relation);
  if (subject?.address) params.set("address", subject.address);
  if (subject?.member_type) params.set("member_type", subject.member_type);
  if (embed) params.set("embed", "1");
  return `/contracts?${params.toString()}`;
}

function todayStr() { return new Date().toISOString().slice(0,10); }
function weekAgoStr() {
  const d = new Date(); d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0,10);
}

// ✅ v3.46.0: GrowthReportPanel 동적 임포트 (Recharts SSR 우회)
const GrowthReportPanel = dynamic(
  () => import("@/components/GrowthReportPanel"),
  { ssr: false, loading: () => (<div className="p-10 text-center text-gray-400">📊 성장보고서 로딩 중...</div>) }
);

export default function ReportsPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">로딩중...</div>}>
      <ReportsPage />
    </Suspense>
  );
}

function ReportsPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [type, setType] = useState<string>("monthly");
  const [selectedMember, setSelectedMember] = useState<string>("");
  const [startDate, setStartDate] = useState(weekAgoStr());
  // ✅ v3.26.10: hydration mismatch 방지
  const [endDate, setEndDate] = useState<string>("");
  useEffect(() => { setEndDate(todayStr()); }, []);
  const [generating, setGenerating] = useState(false);
  const [reportHtml, setReportHtml] = useState<string>("");
  // v3.20.21: 상단 탭 (보고서 / 양식)
  const searchParams = useSearchParams();
  const [topTab, setTopTab] = useState<"report" | "forms">("report");
  const [formsCat, setFormsCat] = useState<"staff" | "member">("staff");
  // v3.21.4: 직원 하위 탭 (재직 / 퇴사)
  const [staffTab, setStaffTab] = useState<"active" | "resigned">("active");
  const [formSearch, setFormSearch] = useState("");
  // v3.20.30: /contracts 리다이렉트 제거 - /reports 내 인라인 양식 작성
  const [selectedFormType, setSelectedFormType] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<any>(null); // { kind, id, name, phone, role, member_type }
  const [inlineFormOpen, setInlineFormOpen] = useState(false);

  useEffect(() => {
    const t = searchParams?.get("tab");
    if (t === "forms") setTopTab("forms");
  }, [searchParams]);

  // v3.20.36: 정식 회원 + 체험/상담 진행중(leads_inbox) 통합 로드
  useEffect(() => {
    (async () => {
      // 1) 정식 회원 (regular 뿐만 아니라 체험/대기 상태 회원도 모두 포함)
      // v3.21.3: staff 컬럼 존재 여부 자동 폴백 – is_active/is_resigned/resign_date 미존재 DB에서도 직원 목록이 정상 로드되도록
      async function loadStaffSafe() {
        // 전체 컴럼 시도 → 실패 시 서서히 축소
        const attempts = [
          "id, name, role, phone, status, is_active, is_resigned, resign_date",
          "id, name, role, phone, status, is_resigned, resign_date",
          "id, name, role, phone, status, resign_date",
          "id, name, role, phone, status",
          "id, name, role, phone",
          "id, name, role",
          "id, name",
        ];
        for (const cols of attempts) {
          const r = await supabase.from("staff").select(cols).order("name");
          if (!r.error) return r;
        }
        return { data: [], error: null } as any;
      }

      const [memRes, leadRes, staffRes] = await Promise.all([
        supabase.from("members")
          .select("id, name, member_type, status, phone, birth, extra")
          .is("deleted_at", null)
          .order("name"),
        supabase.from("leads_inbox")
          .select("id, consult_form, status, promoted_member_id, created_at")
          .is("promoted_member_id", null) // 이미 회원으로 변환된 리드는 제외
          .order("created_at", { ascending: false })
          .limit(200),
        loadStaffSafe(),
      ]);

      // 2) 회원 정규화 - status 배지 색상/라벨 계산
      const memberList = (memRes.data || []).map((m: any) => ({
        id: m.id,
        source_type: "member" as const,
        name: m.name || "",
        member_type: m.member_type,
        phone: m.phone || "",
        birth: m.birth || "",
        status: m.status || "regular",
        guardian_name: m?.extra?.consult_form?.guardian_name || "",
        badge: m.status === "trial_scheduled" || m.status === "trial_done"
          ? { label: "체험", cls: "bg-blue-50 text-blue-700 border-blue-200" }
          : m.status === "waiting" || m.status === "new"
          ? { label: "상담대기", cls: "bg-orange-50 text-orange-700 border-orange-200" }
          : m.status === "regular"
          ? { label: "정규", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
          : { label: m.status || "-", cls: "bg-slate-50 text-slate-700 border-slate-200" },
      }));

      // 3) leads_inbox → 동일 구조로 통합 (id는 lead: 프리픽으로 구분)
      const leadList = (leadRes.data || [])
        .map((r: any) => {
          const cf = r.consult_form || {};
          const nm = cf.name || cf.child_name || cf.member_name;
          if (!nm) return null;
          return {
            id: `lead:${r.id}`,
            source_type: "lead" as const,
            lead_id: r.id,
            name: nm,
            member_type: cf.member_type || (cf.child_name ? "child" : "adult"),
            phone: cf.phone || cf.guardian_phone || "",
            birth: cf.birth || cf.birth_date || cf.child_birth || "",
            guardian_name: cf.guardian_name || cf.parent_name || "",
            guardian_relation: cf.guardian_relation || cf.parent_relation || "",
            address: cf.address || "",
            consult_form: cf,
            status: r.status || "pending",
            badge: { label: "상담대기", cls: "bg-orange-50 text-orange-700 border-orange-200" },
          };
        })
        .filter(Boolean) as any[];

      // 4) 중복 제거 (이름+전화번호 기준)
      const seen = new Set<string>();
      const merged = [...memberList, ...leadList].filter((x: any) => {
        const key = `${(x.name || "").trim()}|${(x.phone || "").replace(/[^0-9]/g, "").slice(-8)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // 정렬: 체험/정규 → 상담대기 → 기타
      merged.sort((a: any, b: any) => {
        const order = (x: any) => x.status === "trial_done" || x.status === "trial_scheduled" ? 0
          : x.status === "regular" ? 1 : x.source_type === "lead" ? 2 : 3;
        const oa = order(a), ob = order(b);
        if (oa !== ob) return oa - ob;
        return (a.name || "").localeCompare(b.name || "");
      });

      setMembers(merged);
      if (merged.length > 0) setSelectedMember(merged[0].id);
      // v3.21.4: 직원용 양식 – 재직·퇴사 별도 상태 보존으로 저장 (탭 분리 노출)
      const allStaff = ((staffRes as any).data || []).map((s: any) => {
        const st = String(s.status || "").toLowerCase();
        const isResigned =
          ["resigned", "retired", "inactive", "terminated", "quit", "leave", "퇴사", "퇴직"].includes(st) ||
          s.is_active === false ||
          s.is_resigned === true ||
          !!s.resign_date;
        return { ...s, __resigned: isResigned };
      });
      setStaffList(allStaff);
    })();
  }, []);

  // v3.21.4: 재직/퇴사 탭 분리 + 검색 필터링
  const activeStaffList  = useMemo(() => staffList.filter((s: any) => !s.__resigned), [staffList]);
  const resignedStaffList = useMemo(() => staffList.filter((s: any) =>  s.__resigned), [staffList]);
  const filteredStaff = useMemo(() => {
    const base = staffTab === "resigned" ? resignedStaffList : activeStaffList;
    if (!formSearch) return base;
    const q = formSearch.toLowerCase();
    return base.filter((s: any) => (s.name || "").toLowerCase().includes(q) || (s.phone || "").includes(q));
  }, [activeStaffList, resignedStaffList, staffTab, formSearch]);
  // v3.20.36: 이름 + 전화번호(뒷자리 포함) + 보호자명 + 생년월일 실시간 검색
  const filteredMembers = useMemo(() => {
    if (!formSearch) return members;
    const q = formSearch.trim().toLowerCase();
    const qDigits = q.replace(/[^0-9]/g, "");
    return members.filter((m: any) => {
      const name = (m.name || "").toLowerCase();
      const phone = (m.phone || "").toLowerCase();
      const phoneDigits = phone.replace(/[^0-9]/g, "");
      const guardian = (m.guardian_name || "").toLowerCase();
      const birth = (m.birth || "").toLowerCase();
      if (name.includes(q) || guardian.includes(q) || birth.includes(q)) return true;
      if (qDigits && (phoneDigits.includes(qDigits) || phoneDigits.endsWith(qDigits))) return true;
      if (phone.includes(q)) return true;
      return false;
    });
  }, [members, formSearch]);

  async function generate() {
    if (!selectedMember) { alert("회원을 선택하세요"); return; }
    setGenerating(true);
    try {
      const member = members.find(m => m.id === selectedMember);

      // ✅ v3.35.0: sessions 테이블 직접 조회 (레거시 members.extra.sessions 폐기)
      const [sessionsRes, iepRes, progressRes, behaviorsRes, behavRecRes, attRes] = await Promise.all([
        supabase.from("sessions").select("*")
          .eq("member_id", selectedMember)
          .gte("session_date", startDate)
          .lte("session_date", endDate)
          .is("deleted_at", null)
          .order("session_date", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase.from("iep_goals").select("*").eq("member_id", selectedMember),
        supabase.from("iep_progress_records").select("*").eq("member_id", selectedMember)
          .gte("record_date", startDate).lte("record_date", endDate),
        supabase.from("problem_behaviors").select("*").eq("member_id", selectedMember),
        supabase.from("behavior_records").select("*").eq("member_id", selectedMember)
          .gte("record_date", startDate).lte("record_date", endDate),
        supabase.from("attendance").select("*").eq("member_id", selectedMember)
          .gte("attend_date", startDate).lte("attend_date", endDate),
      ]);

      const sessions = sessionsRes.data || [];
      console.log(`[v3.35.0] 보고서 세션 로드: ${sessions.length}건 (${startDate} ~ ${endDate})`);
      const goals = iepRes.data || [];
      const progress = progressRes.data || [];
      const behaviors = behaviorsRes.data || [];
      const behRecords = behavRecRes.data || [];
      const attendance = attRes.data || [];

      const html = generateHtml(type, {
        member, sessions, goals, progress, behaviors, behRecords, attendance,
        startDate, endDate,
      });

      setReportHtml(html);

      // DB에 저장
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      await supabase.from("reports").insert({
        org_id: orgId,
        member_id: selectedMember,
        report_type: type,
        title: `${member?.name} - ${REPORT_TYPES.find(t => t.v === type)?.label} (${startDate}~${endDate})`,
        period_start: startDate,
        period_end: endDate,
        html_content: html,
      });
    } catch (e: any) {
      alert("생성 실패: " + e.message);
    } finally {
      setGenerating(false);
    }
  }

  function downloadHtml() {
    if (!reportHtml) return;
    const blob = new Blob([reportHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report_${todayStr()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printReport() {
    if (!reportHtml) return;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(reportHtml);
      w.document.close();
      setTimeout(() => w.print(), 500);
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-3 md:px-6 py-6 md:py-10 bg-gradient-to-br from-sky-50 via-white to-cyan-50 min-h-screen">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
          <FileText className="w-6 h-6 md:w-7 md:h-7 text-blue-500" /> 보고서 · 양식
        </h1>
        <HomeButton />
      </div>

      {/* v3.20.21: 상단 탭 */}
      <div className="flex gap-2 mb-4 bg-white p-1.5 rounded-xl border border-aqu-100 shadow-sm">
        <button onClick={() => setTopTab("report")}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold transition ${topTab==="report" ? "bg-gradient-to-r from-aqu-500 to-blue-600 text-white shadow" : "text-gray-600 hover:bg-gray-50"}`}>
          📊 보고서
        </button>
        <button onClick={() => setTopTab("forms")}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold transition ${topTab==="forms" ? "bg-gradient-to-r from-aqu-500 to-blue-600 text-white shadow" : "text-gray-600 hover:bg-gray-50"}`}>
          📋 양식
        </button>
      </div>

      {topTab === "forms" && (
        <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-5 mb-5">
          {/* 양식 하위 탭 – 직원용 / 회원용 */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => setFormsCat("staff")}
              className={`px-4 py-2 rounded-lg text-sm font-bold border-2 transition ${formsCat==="staff" ? "border-aqu-500 bg-aqu-50 text-aqu-900" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              👥 직원용 ({STAFF_FORMS.length})
            </button>
            <button onClick={() => setFormsCat("member")}
              className={`px-4 py-2 rounded-lg text-sm font-bold border-2 transition ${formsCat==="member" ? "border-aqu-500 bg-aqu-50 text-aqu-900" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              🏊‍♀️ 회원용 ({MEMBER_FORMS.length})
            </button>
          </div>

          {/* 대상자 검색 */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={formSearch} onChange={e => setFormSearch(e.target.value)}
              placeholder={formsCat === "staff" ? "직원 이름/연락처로 검색" : "회원 이름/연락처로 검색"}
              className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-aqu-500 focus:outline-none" />
          </div>

          {/* v3.20.30: 양식 목록 - Link 리다이렉트 대신 인라인 상태 선택 */}
          <div className="mb-4">
            <div className="text-xs font-bold text-gray-600 mb-2">1. 양식 종류 선택</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(formsCat === "staff" ? STAFF_FORMS : MEMBER_FORMS).map(f => (
                <button key={f.v}
                  onClick={() => setSelectedFormType(f.v)}
                  className={`p-3 rounded-lg text-left border-2 transition ${selectedFormType===f.v ? "border-aqu-500 bg-aqu-50 ring-2 ring-aqu-200" : "border-gray-200 hover:border-aqu-400 hover:bg-aqu-50"}`}>
                  <div className="text-sm font-bold">{f.label}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{f.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* v3.20.30: 대상자 목록 - button으로 전환 (리다이렉트 제거) */}
          <div>
            <div className="text-xs font-bold text-gray-600 mb-2 flex items-center justify-between">
              <span>2. {formsCat === "staff" ? "직원 선택" : "회원 선택"} ({formsCat === "staff" ? filteredStaff.length : filteredMembers.length}명)</span>
              {/* v3.21.4: 직원용일 때 재직/퇴사 하위 탭 노출 */}
              {formsCat === "staff" && (
                <div className="flex gap-1">
                  <button onClick={() => setStaffTab("active")}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition border ${staffTab==="active" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                    🟢 재직 ({activeStaffList.length})
                  </button>
                  <button onClick={() => setStaffTab("resigned")}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition border ${staffTab==="resigned" ? "bg-slate-500 text-white border-slate-500" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                    👋 퇴사 ({resignedStaffList.length})
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-80 overflow-y-auto">
              {formsCat === "staff" ? filteredStaff.map(s => (
                <div key={s?.id} className={`relative p-2.5 rounded-lg border text-left transition ${selectedSubject?.id===s?.id ? "border-aqu-500 bg-aqu-50 ring-2 ring-aqu-200" : "border-gray-200 hover:border-aqu-400 hover:bg-aqu-50"}`}>
                  <button
                    onClick={() => setSelectedSubject({ kind: "staff", id: s?.id, name: s?.name || "", phone: s?.phone || "", role: s?.role || "" })}
                    className="w-full text-left">
                    <div className="text-sm font-bold text-gray-800 pr-6">{s?.name}</div>
                    <div className="text-[10px] text-gray-500">{s?.role || "직원"} · {s?.phone || "-"}</div>
                  </button>
                  {/* v3.21.5: 원클릭 퇴사/복직 토글 버튼 */}
                  {staffTab === "active" ? (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(`${s?.name} 님을 퇴사 처리하시겠습니까?\n\n• 퇴사자 탭으로 이동\n• 시간표·상담 등에서 자동 제외`)) return;
                        const today = new Date().toISOString().slice(0, 10);
                        // 6시도 폴백 - is_resigned/resign_date 컴럼 미존재 DB 대응
                        let payload: any = { is_resigned: true, resign_date: today, status: "resigned", is_active: false };
                        let ok = false;
                        for (let i = 0; i < 6; i++) {
                          const { error } = await supabase.from("staff").update(payload).eq("id", s?.id);
                          if (!error) { ok = true; break; }
                          const m = /'([^']+)' column|column "([^"]+)"/.exec(error.message || "");
                          const missing = m?.[1] || m?.[2];
                          if (missing && missing in payload) { const { [missing]: _drop, ...rest } = payload; payload = rest; continue; }
                          alert("퇴사 처리 실패: " + error.message); return;
                        }
                        if (!ok) return alert("퇴사 처리 실패 - 필드 미존재");
                        setStaffList(prev => prev.map((x: any) => x.id === s?.id ? { ...x, __resigned: true, is_resigned: true, resign_date: today, status: "resigned" } : x));
                        alert(`✅ ${s?.name} 님 퇴사 처리 완료 (${today})`);
                      }}
                      className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 hover:bg-orange-200 font-semibold"
                      title="퇴사 처리">
                      🚪
                    </button>
                  ) : (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(`${s?.name} 님의 퇴사를 취소하시겠습니까?`)) return;
                        let payload: any = { is_resigned: false, resign_date: null, status: "active", is_active: true };
                        let ok = false;
                        for (let i = 0; i < 6; i++) {
                          const { error } = await supabase.from("staff").update(payload).eq("id", s?.id);
                          if (!error) { ok = true; break; }
                          const m = /'([^']+)' column|column "([^"]+)"/.exec(error.message || "");
                          const missing = m?.[1] || m?.[2];
                          if (missing && missing in payload) { const { [missing]: _drop, ...rest } = payload; payload = rest; continue; }
                          alert("퇴사 취소 실패: " + error.message); return;
                        }
                        if (!ok) return alert("퇴사 취소 실패");
                        setStaffList(prev => prev.map((x: any) => x.id === s?.id ? { ...x, __resigned: false, is_resigned: false, resign_date: null, status: "active" } : x));
                        alert(`✅ ${s?.name} 님 재입사 완료`);
                      }}
                      className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-semibold"
                      title="퇴사 취소">
                      🔄
                    </button>
                  )}
                </div>
              )) : filteredMembers.map((m: any) => (
                <button key={m?.id}
                  onClick={() => setSelectedSubject({
                    kind: "member",
                    id: m?.id,
                    source_type: m?.source_type || "member",
                    lead_id: m?.lead_id,
                    name: m?.name || "",
                    phone: m?.phone || "",
                    member_type: m?.member_type,
                    birth: m?.birth || "",
                    guardian_name: m?.guardian_name || "",
                    guardian_relation: m?.guardian_relation || "",
                    address: m?.address || "",
                    consult_form: m?.consult_form || null,
                    status: m?.status,
                  })}
                  className={`p-2.5 rounded-lg border text-left transition ${selectedSubject?.id===m?.id ? "border-aqu-500 bg-aqu-50 ring-2 ring-aqu-200" : "border-gray-200 hover:border-aqu-400 hover:bg-aqu-50"}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-sm font-bold text-gray-800">{m?.name}</span>
                    {m?.badge && (
                      <span className={`inline-block px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${m.badge.cls}`}>
                        {m.badge.label}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500">{m?.member_type === "child" ? "아동" : "성인"} · {m?.phone || "-"}</div>
                </button>
              ))}
            </div>
            {((formsCat === "staff" ? filteredStaff.length : filteredMembers.length) === 0) && (
              <div className="text-center text-sm text-gray-500 py-6">검색 결과가 없습니다</div>
            )}
          </div>

          {/* v3.20.30: 양식 + 대상자 모두 선택 시 인라인 통합 작성 연이어 */}
          {selectedFormType && selectedSubject && (
            <div className="mt-5 border-2 border-aqu-500 rounded-2xl bg-gradient-to-br from-aqu-50 to-blue-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-bold text-aqu-900 flex flex-wrap items-center gap-1.5">
                  ✅ 선택: <span className="text-blue-700">{[...STAFF_FORMS, ...MEMBER_FORMS].find(x => x.v === selectedFormType)?.label}</span>
                  <span>×</span>
                  <span className="text-purple-700">{selectedSubject.name}</span>
                  {/* v3.20.36: 선택된 대상자 배지 (체험/상담대기/정규) */}
                  {selectedSubject.kind === "member" && selectedSubject.status && (() => {
                    const st = selectedSubject.status;
                    const badge = (st === "trial_scheduled" || st === "trial_done")
                      ? { l: "체험", c: "bg-blue-50 text-blue-700 border-blue-200" }
                      : (st === "waiting" || st === "new" || selectedSubject.source_type === "lead")
                      ? { l: "상담대기", c: "bg-orange-50 text-orange-700 border-orange-200" }
                      : st === "regular"
                      ? { l: "정규", c: "bg-emerald-50 text-emerald-700 border-emerald-200" }
                      : null;
                    return badge ? <span className={`inline-block px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${badge.c}`}>{badge.l}</span> : null;
                  })()}
                  <span className="text-[11px] text-gray-500 ml-1">({selectedSubject.kind === "staff" ? selectedSubject.role || "직원" : selectedSubject.member_type === "child" ? "아동" : "성인"} · {selectedSubject.phone || "-"})</span>
                </div>
                <button onClick={() => { setSelectedFormType(""); setSelectedSubject(null); setInlineFormOpen(false); }}
                  className="text-xs px-2 py-1 rounded bg-white border border-gray-300 hover:bg-gray-50">↻ 다시 선택</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setInlineFormOpen(true)}
                  className="px-4 py-2.5 bg-gradient-to-r from-aqu-500 to-blue-600 text-white rounded-lg text-sm font-bold hover:opacity-90 shadow">
                  📝 이 페이지에서 작성/서명
                </button>
                <Link href={buildContractUrl(selectedFormType, selectedSubject, false)}
                  className="px-4 py-2.5 bg-white border-2 border-aqu-300 text-aqu-700 rounded-lg text-sm font-bold hover:bg-aqu-50">
                  ↗ 계약서 관리 페이지에서 작성 (상세 옵션 포함)
                </Link>
              </div>
              <div className="mt-2 text-[11px] text-gray-600">💡 이 페이지에서 작성하면 입력 값과 대상자 정보가 그대로 유지되며, 미리보기 · 서명 · 인쇄/PDF 저장까지 일괄 진행됩니다.</div>
            </div>
          )}

          {/* v3.20.30: 인라인 양식 작성 iframe (계약서 페이지 로직 재활용) */}
          {inlineFormOpen && selectedFormType && selectedSubject && (
            <div className="mt-5 bg-white border-2 border-aqu-300 rounded-2xl overflow-hidden" style={{ height: "calc(100vh - 200px)", minHeight: 700 }}>
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
                <div className="text-xs font-bold text-gray-700">📄 인라인 양식 작성 에디터</div>
                <button onClick={() => setInlineFormOpen(false)}
                  className="text-xs px-2 py-1 rounded bg-white border border-gray-300 hover:bg-gray-100">✕ 닫기</button>
              </div>
              <iframe
                src={buildContractUrl(selectedFormType, selectedSubject, true)}
                className="w-full h-full border-0"
                title="양식 작성" />
            </div>
          )}

          <div className="mt-4 text-[11px] text-gray-500 bg-gray-50 rounded-lg p-3">
            💡 v3.20.30: 양식과 대상자를 선택하면 “이 페이지에서 작성/서명” 버튼으로 /reports 내에서 바로 작성 · 미리보기 · 서명 · 인쇄까지 일괄 진행합니다. 서명 완료 시 직원은 “직원 문서함”, 회원은 “회원 문서함”에 자동 저장됩니다.
          </div>
        </div>
      )}

      {topTab === "report" && (
      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-5 mb-5">
        {/* 보고서 종류 */}
        <div className="mb-4">
          <label className="text-sm font-bold text-aqu-900 mb-2 block">1. 보고서 종류 선택</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {REPORT_TYPES.map(t => (
              <button key={t.v} onClick={() => setType(t.v)}
                className={`p-3 rounded-lg text-left border-2 transition ${type === t.v ? "border-aqu-500 bg-aqu-50" : "border-gray-200 hover:border-aqu-300"}`}>
                <div className="text-sm font-bold">{t.label}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 회원 & 기간 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">회원</label>
            <select value={selectedMember} onChange={e => setSelectedMember(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">시작일</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">종료일</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
        </div>

        {/* ✅ v3.46.0: monthly/yearly 는 GrowthReportPanel 로 자동 렌더 (버튼 불필요) */}
        {(type === "monthly" || type === "yearly") ? (
          <div className="text-[11px] text-aqu-700 bg-aqu-50 border border-aqu-200 rounded-lg p-3 text-center">
            💡 회원을 선택하면 아래에 <b>성장보고서</b>가 자동 생성됩니다.
            AI 코멘트 초안이 자동 작성되며, 치료사가 직접 편집 후 <b>PDF 다운로드</b>·<b>인쇄</b>가 가능합니다.
          </div>
        ) : (
          <button onClick={generate} disabled={generating || !selectedMember}
            className="w-full py-3 bg-gradient-to-r from-aqu-500 to-blue-600 hover:from-aqu-600 hover:to-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
            {generating ? "생성 중..." : "보고서 생성"}
          </button>
        )}
      </div>
      )}

      {/* ✅ v3.46.0: 월간/연간 성장 종합보고서 자동 렌더 */}
      {topTab === "report" && selectedMember && (type === "monthly" || type === "yearly") && (
        <div className="mt-4">
          <GrowthReportPanel
            key={`${selectedMember}-${type}`}
            memberId={selectedMember}
            memberName={members.find(m => m.id === selectedMember)?.name || ""}
            memberLevel={(members.find(m => m.id === selectedMember) as any)?.computed_level || 2}
            period={type === "monthly" ? "monthly" : "yearly"}
          />
        </div>
      )}

      {/* 미리보기 */}
      {reportHtml && (
        <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b bg-gray-50">
            <div className="text-sm font-bold text-aqu-900">📄 미리보기</div>
            <div className="flex gap-2">
              <button onClick={printReport}
                className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1">
                <Printer className="w-3.5 h-3.5" /> 인쇄
              </button>
              <button onClick={downloadHtml}
                className="text-xs px-3 py-1.5 bg-aqu-600 hover:bg-aqu-700 text-white rounded-lg flex items-center gap-1">
                <Download className="w-3.5 h-3.5" /> HTML 다운로드
              </button>
            </div>
          </div>
          <iframe srcDoc={reportHtml} className="w-full h-[600px] bg-white" />
        </div>
      )}
    </main>
  );
}

/* ═════ 보고서 HTML 생성 ═════ */
function generateHtml(type: string, data: any) {
  const { member, sessions, goals, progress, behaviors, behRecords, attendance, startDate, endDate } = data;
  const title = `${member?.name || ""} - ${REPORT_TYPES.find(t => t.v === type)?.label}`;

  const baseStyle = `
    <style>
      body { font-family: 'Noto Sans KR', -apple-system, sans-serif; padding: 30px; color: #1f2937; line-height: 1.6; max-width: 900px; margin: 0 auto; }
      h1 { color: #0891b2; border-bottom: 3px solid #06b6d4; padding-bottom: 8px; }
      h2 { color: #0e7490; border-left: 4px solid #06b6d4; padding-left: 10px; margin-top: 30px; }
      h3 { color: #164e63; margin-top: 20px; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0; }
      th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
      th { background: #ecfeff; color: #0e7490; }
      .kpi { display: inline-block; padding: 10px 20px; background: #f0f9ff; border-radius: 8px; margin: 5px; }
      .kpi-val { font-size: 24px; font-weight: bold; color: #0891b2; }
      .kpi-label { font-size: 12px; color: #6b7280; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin: 2px; }
      .badge-blue { background: #dbeafe; color: #1e40af; }
      .badge-green { background: #d1fae5; color: #065f46; }
      .badge-yellow { background: #fef3c7; color: #92400e; }
      .badge-red { background: #fee2e2; color: #991b1b; }
      .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 11px; }
      .progress-bar { width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; }
      .progress-bar > div { height: 100%; background: linear-gradient(to right, #06b6d4, #0891b2); }
    </style>
  `;

  const header = `
    <h1>${title}</h1>
    <div style="color:#6b7280;font-size:14px;margin-bottom:20px;">
      📅 기간: ${startDate} ~ ${endDate}<br/>
      👤 대상: ${member?.name} (${member?.member_type === "child" ? "아동" : "성인"})<br/>
      🌊 아쿠수중운동센터
    </div>
  `;

  let content = "";

  // ═══ v3.35.0: 일일일지 - 세션 태그·메모·보호자 메시지 100% 매핑 ═══
  if (type === "daily") {
    content += `<h2>📝 일일 수업일지</h2>`;
    if (sessions.length === 0) {
      content += `<p style="color:#9ca3af;">이 날짜에 기록된 세션이 없습니다.</p>`;
    } else {
      sessions.forEach((s: any) => {
        const acts: string[] = Array.isArray(s.activities) ? s.activities
          : Array.isArray(s.tags) ? s.tags.filter((t: string) => !t.startsWith("status:")) : [];
        const memo = (s.memo || "").toString();
        const statusLabel = s.status === "sick" ? "🤒 병결"
                          : s.status === "personal" ? "📝 개인사정"
                          : s.status === "noshow" ? "🚩 노쇼"
                          : s.status === "cancel" ? "❌ 취소"
                          : "✅ 출석";
        content += `
          <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px;background:#f9fafb;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <b style="font-size:16px;color:#0891b2;">📅 ${s.session_date}</b>
              <span class="badge badge-${s.status === "sick" || s.status === "personal" || s.status === "noshow" ? "yellow" : "green"}">${statusLabel}</span>
            </div>
            <div style="margin-bottom:10px;">
              <b style="font-size:13px;color:#374151;">진행한 활동 (${acts.length}개):</b><br/>
              ${acts.length > 0 ? acts.map((l: string) => `<span class="badge badge-blue">${l}</span>`).join(" ") : "<span style='color:#9ca3af;'>기록된 활동 태그 없음</span>"}
            </div>
            ${memo ? `<div style="margin-top:10px;padding:10px;background:white;border-left:3px solid #06b6d4;border-radius:4px;">
              <b style="font-size:13px;color:#374151;">💬 관찰 메모 · 보호자 대화:</b><br/>
              <div style="white-space:pre-wrap;font-size:13px;color:#4b5563;margin-top:6px;">${memo.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
            </div>` : ""}
          </div>
        `;
      });
    }

    // 출결
    if (attendance.length > 0) {
      content += `<h2>✓ 출결 기록</h2>`;
      const statusCount: any = { present: 0, absent: 0, sick: 0 };
      attendance.forEach((a: any) => { if (statusCount[a.status] !== undefined) statusCount[a.status]++; });
      content += `<div class="kpi"><div class="kpi-label">출석</div><div class="kpi-val">${statusCount.present}</div></div>`;
      content += `<div class="kpi"><div class="kpi-label">결석</div><div class="kpi-val">${statusCount.absent}</div></div>`;
      content += `<div class="kpi"><div class="kpi-label">병결</div><div class="kpi-val">${statusCount.sick}</div></div>`;
    }
  }

  // ═══ v3.35.0: 주간리포트 - 영역별 활동 태그 요약 + 주간 관찰 종합 ═══
  if (type === "weekly") {
    const weekly = summarizeWeekly(sessions);
    content += `<h2>📅 주간 리포트 요약</h2>`;
    content += `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
        <div class="kpi"><div class="kpi-label">주간 총 세션</div><div class="kpi-val">${weekly.totalSessions}회</div></div>
        <div class="kpi"><div class="kpi-label">주력 영역</div><div class="kpi-val" style="font-size:14px;">${weekly.strongestArea}</div></div>
        <div class="kpi"><div class="kpi-label">진행 활동</div><div class="kpi-val">${weekly.activityTags.length}종</div></div>
      </div>
    `;

    if (weekly.areaBreakdown.length > 0) {
      content += `<h3>🎯 영역별 활동 태그 요약</h3>`;
      content += `<table><thead><tr><th>영역</th><th>세션 수</th><th>진행 활동</th></tr></thead><tbody>`;
      weekly.areaBreakdown.forEach((a: any) => {
        content += `<tr>
          <td><b>${a.label}</b></td>
          <td style="text-align:center;">${a.count}건</td>
          <td>${a.activities.map((act: string) => `<span class="badge badge-${a.color === "purple" ? "blue" : a.color === "emerald" ? "green" : a.color === "amber" ? "yellow" : a.color === "rose" ? "red" : "blue"}">${act}</span>`).join(" ")}</td>
        </tr>`;
      });
      content += `</tbody></table>`;
    }

    if (weekly.memoSummary.length > 0) {
      content += `<h3>💬 주간 관찰 종합</h3>`;
      content += `<div style="background:#f0f9ff;padding:14px;border-radius:8px;border-left:4px solid #06b6d4;">`;
      weekly.memoSummary.forEach((m: string) => {
        content += `<p style="font-size:13px;color:#4b5563;margin:6px 0;white-space:pre-wrap;">${m.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
      });
      content += `</div>`;
    }

    if (weekly.parentMessages.length > 0) {
      content += `<h3>👨‍👩‍👦 보호자 커뮤니케이션 하이라이트</h3>`;
      content += `<div style="background:#fef3c7;padding:14px;border-radius:8px;border-left:4px solid #f59e0b;">`;
      weekly.parentMessages.forEach((m: string) => {
        content += `<p style="font-size:12px;color:#78350f;margin:6px 0;white-space:pre-wrap;">${m.slice(0, 200).replace(/</g, "&lt;").replace(/>/g, "&gt;")}${m.length > 200 ? "…" : ""}</p>`;
      });
      content += `</div>`;
    }

    // 출결
    if (attendance.length > 0) {
      content += `<h3>✓ 주간 출결</h3>`;
      const statusCount: any = { present: 0, absent: 0, sick: 0 };
      attendance.forEach((a: any) => { if (statusCount[a.status] !== undefined) statusCount[a.status]++; });
      content += `<div class="kpi"><div class="kpi-label">출석</div><div class="kpi-val">${statusCount.present}</div></div>`;
      content += `<div class="kpi"><div class="kpi-label">결석</div><div class="kpi-val">${statusCount.absent}</div></div>`;
      content += `<div class="kpi"><div class="kpi-label">병결</div><div class="kpi-val">${statusCount.sick}</div></div>`;
    }
  }

  if (type === "iep" || type === "weekly") {
    // ═══ v3.35.0: 세션기록 기반 IEP 목표 자동 추천 (신규) ═══
    const recommended = recommendIepGoals(sessions);
    if (recommended.length > 0) {
      content += `<h2>🤖 세션기록 기반 IEP 목표 자동 추천</h2>`;
      content += `<p style="font-size:12px;color:#6b7280;margin-bottom:14px;">최근 ${sessions.length}건의 세션 활동 태그를 분석해 자동 추천된 목표입니다. 담당 치료사가 검토 후 확정합니다.</p>`;
      recommended.forEach((rec: any) => {
        content += `
          <div style="border:2px solid #06b6d4;border-radius:10px;padding:14px;margin-bottom:14px;background:linear-gradient(135deg, #ecfeff 0%, #f0f9ff 100%);">
            <h3 style="margin-top:0;">${rec.areaLabel} <span style="font-size:12px;color:#6b7280;">(${rec.sessionCount}건 활동 기반)</span></h3>
            <div style="margin-bottom:10px;">
              ${rec.activities.slice(0, 8).map((a: string) => `<span class="badge badge-blue">${a}</span>`).join(" ")}
            </div>
            <p style="font-size:13px;margin:8px 0 4px 0;"><b>🎯 장기 목표 (6개월~1년):</b></p>
            <ul style="font-size:13px;color:#4b5563;margin:0 0 10px 20px;">
              ${rec.longGoals.map((g: string) => `<li>${g}</li>`).join("")}
            </ul>
            <p style="font-size:13px;margin:8px 0 4px 0;"><b>⚡ 단기 목표 (4~6주):</b></p>
            <ul style="font-size:13px;color:#4b5563;margin:0 0 4px 20px;">
              ${rec.shortGoals.map((g: string) => `<li>${g}</li>`).join("")}
            </ul>
          </div>
        `;
      });
    }

    // 기존 IEP 목표 현황
    content += `<h2>🎯 IEP 목표 현황</h2>`;
    if (goals.length === 0) {
      content += `<p style="color:#9ca3af;">등록된 IEP 목표가 없습니다. 위의 자동 추천 목표를 참고해 등록하세요.</p>`;
    } else {
      goals.forEach((g: any) => {
        const goalRecords = progress.filter((p: any) => p.goal_id === g.id);
        const avgRate = goalRecords.length > 0
          ? goalRecords.reduce((s: number, r: any) => s + Number(r.success_rate || 0), 0) / goalRecords.length
          : 0;
        content += `
          <h3>${g.title}</h3>
          <div style="margin-bottom:8px;">
            <span class="badge badge-${g.status === "achieved" ? "green" : "blue"}">${g.status === "achieved" ? "달성" : g.status === "in_progress" ? "진행중" : g.status}</span>
            <span class="badge badge-yellow">${g.goal_type === "long" ? "장기" : "단기"}</span>
            <span style="font-size:12px;color:#6b7280;">진도: ${g.progress_percent || 0}%</span>
          </div>
          <div class="progress-bar"><div style="width:${g.progress_percent || 0}%;"></div></div>
          ${g.description ? `<p style="font-size:12px;color:#6b7280;">${g.description}</p>` : ""}
          ${g.target_criteria ? `<p style="font-size:12px;"><b>성취 기준:</b> ${g.target_criteria}</p>` : ""}
          ${goalRecords.length > 0 ? `<p style="font-size:12px;"><b>기록 ${goalRecords.length}회 · 평균 성공률 ${avgRate.toFixed(1)}%</b></p>` : ""}
        `;
      });
    }
  }

  if (type === "behavior" || type === "weekly") {
    // ═══ v3.35.0: 세션 메모 기반 행동 키워드 자동 감지 (신규) ═══
    const detected = detectBehaviors(sessions);
    if (detected.length > 0) {
      content += `<h2>🤖 세션기록 기반 행동중재 자동 감지</h2>`;
      content += `<p style="font-size:12px;color:#6b7280;margin-bottom:14px;">세션 메모 및 카톡 대화록에서 감지된 표적 행동 및 대응 중재 가이드입니다.</p>`;
      detected.forEach((det: any) => {
        const sevColor = det.severity === "high" ? "red" : det.severity === "medium" ? "yellow" : "blue";
        const sevLabel = det.severity === "high" ? "🔴 High" : det.severity === "medium" ? "🟡 Medium" : "🔵 Low";
        content += `
          <div style="border:2px solid ${det.severity === "high" ? "#dc2626" : det.severity === "medium" ? "#f59e0b" : "#0891b2"};border-radius:10px;padding:14px;margin-bottom:14px;background:${det.severity === "high" ? "#fef2f2" : det.severity === "medium" ? "#fffbeb" : "#f0f9ff"};">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <h3 style="margin:0;">${det.targetBehavior}</h3>
              <span class="badge badge-${sevColor}">${sevLabel}</span>
            </div>
            <p style="font-size:12px;color:#6b7280;margin:4px 0;"><b>발생 ${det.occurrences.length}회</b> · ${det.occurrences.slice(0, 3).map((o: any) => o.date).join(", ")}</p>
            <div style="margin-top:8px;padding:10px;background:white;border-radius:6px;">
              <b style="font-size:13px;">💡 대응 중재 가이드:</b>
              <div style="font-size:13px;color:#4b5563;margin-top:6px;white-space:pre-wrap;">${det.intervention}</div>
            </div>
            ${det.occurrences.length > 0 ? `<details style="margin-top:8px;">
              <summary style="cursor:pointer;font-size:12px;color:#6b7280;">📋 감지 근거 (${det.occurrences.length}건 발췌)</summary>
              <div style="margin-top:6px;padding:8px;background:#f9fafb;border-radius:4px;font-size:11px;color:#6b7280;">
                ${det.occurrences.slice(0, 5).map((o: any) => `<div style="margin:4px 0;"><b>${o.date}:</b> "${o.excerpt.replace(/</g, "&lt;").replace(/>/g, "&gt;")}"</div>`).join("")}
              </div>
            </details>` : ""}
          </div>
        `;
      });
    }

    // 기존 행동중재
    content += `<h2>🚨 행동중재 현황</h2>`;
    if (behaviors.length === 0) {
      content += `<p style="color:#9ca3af;">등록된 문제행동이 없습니다. 위의 자동 감지 결과를 참고해 등록하세요.</p>`;
    } else {
      behaviors.forEach((b: any) => {
        const recs = behRecords.filter((r: any) => r.behavior_id === b.id);
        const totalFreq = recs.reduce((s: number, r: any) => s + (r.frequency || 1), 0);
        content += `
          <h3>${b.name}</h3>
          <div style="margin-bottom:8px;">
            <span class="badge badge-${b.severity === "high" || b.severity === "crisis" ? "red" : b.severity === "medium" ? "yellow" : "blue"}">${b.severity}</span>
          </div>
          ${b.operational_definition ? `<p style="font-size:12px;"><b>조작적 정의:</b> ${b.operational_definition}</p>` : ""}
          ${b.intervention_plan ? `<p style="font-size:12px;"><b>중재 계획:</b> ${b.intervention_plan}</p>` : ""}
          <p style="font-size:12px;"><b>기간 발생: ${recs.length}건 (총 ${totalFreq}회)</b></p>
        `;
      });
    }
  }

  const footer = `
    <div class="footer">
      🌊 이 보고서는 AQUNOTE에서 자동 생성되었습니다 · 생성일: ${new Date().toLocaleString("ko-KR")}
    </div>
  `;

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title>${baseStyle}</head><body>${header}${content}${footer}</body></html>`;
}
