"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { supabase } from "@/lib/supabase";
import { getActiveBranchId, useBranchWatch } from "@/lib/branchContext";
import {
  FileSignature, FileText, Plus, X, Save, Trash2, Search,
  UserCheck, Users, Calendar, ChevronLeft, Printer, Download
} from "lucide-react";

/**
 * v3.20.11: 계약서 폼 관리
 * - 근로계약서, 회원 이용계약서, 개인정보동의서 자체 폼 작성
 * - 서명 이미지 첨부 및 파일 저장
 * - 회원별 · 직원별 이력 관리
 */

const CONTRACT_TYPES = [
  { v: "employment",       l: "📄 근로계약서",         cat: "staff",  color: "bg-blue-100 text-blue-800 border-blue-300" },
  { v: "employment_annex", l: "📎 근로계약 부속합의", cat: "staff",  color: "bg-cyan-100 text-cyan-800 border-cyan-300" },
  { v: "nda",              l: "🔒 비밀유지서약",      cat: "staff",  color: "bg-slate-100 text-slate-800 border-slate-300" },
  { v: "member_service",   l: "📝 회원 이용계약서",   cat: "member", color: "bg-purple-100 text-purple-800 border-purple-300" },
  { v: "privacy",          l: "🛡️ 개인정보동의서",     cat: "member", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  { v: "portrait",         l: "📷 초상권 동의서",     cat: "member", color: "bg-pink-100 text-pink-800 border-pink-300" },
  { v: "consent_minor",    l: "👶 미성년 보호자 동의서", cat: "member", color: "bg-orange-100 text-orange-800 border-orange-300" },
  { v: "other",            l: "📌 기타 계약서",        cat: "other",  color: "bg-gray-100 text-gray-800 border-gray-300" },
];

function typeLabel(t: string) {
  return CONTRACT_TYPES.find(x => x.v === t)?.l || t;
}
function typeColor(t: string) {
  return CONTRACT_TYPES.find(x => x.v === t)?.color || "bg-gray-100 text-gray-800 border-gray-300";
}

// 기본 템플릿 문구
const TEMPLATES: Record<string, string> = {
  employment: `근 로 계 약 서

사업주(甲): 아쿠수중운동센터
근로자(乙): {{name}}

제1조 (계약기간)
- 시작일: {{start_date}}
- 종료일: {{end_date}}

제2조 (근무장소 · 업무내용)
- 근무장소: {{workplace}}
- 담당업무: {{duty}}

제3조 (근무시간)
- 근무일: {{workdays}}
- 근무시간: {{work_hours}}
- 휴게시간: {{break_time}}

제4조 (임금)
- 기본급: 월 {{base_salary}}원
- 지급일: 매월 {{pay_day}}일
- 지급방법: 근로자 계좌 입금

제5조 (연차 · 휴가)
- 근로기준법에 따라 유급휴가를 부여한다.

제6조 (사회보험)
- 4대 보험 가입: 국민연금, 건강보험, 고용보험, 산재보험

제7조 (기타)
- 본 계약서에 명시되지 않은 사항은 근로기준법 및 관계법령을 따른다.

계약일: {{contract_date}}

사업주(甲) 서명: ______________
근로자(乙) 서명: ______________`,

  member_service: `회 원 이 용 계 약 서

시설명: 아쿠수중운동센터
회원명: {{name}}
보호자명: {{guardian}}
연락처: {{phone}}

제1조 (계약목적)
아쿠수중운동센터가 제공하는 수중운동 프로그램을 회원이 이용함에 있어 필요한 사항을 정한다.

제2조 (이용회원권)
- 회원권명: {{plan_name}}
- 회차: {{sessions}}회
- 유효기간: {{start_date}} ~ {{end_date}}
- 결제금액: {{amount}}원

제3조 (환불 규정)
- 결제 후 7일 이내: 100% 환불
- 이용 개시 후: 잔여 회차 × 회당 정상가 차감 후 환불
- 회원 귀책사유(질병·이사 등): 진단서·증빙자료 제출 시 별도 협의

제4조 (수업 참여)
- 예약제 운영: 최소 24시간 전 예약 필수
- 노쇼 시: 회원권 1회 차감
- 병결 시: 진단서 제출로 회차 보존 가능

제5조 (안전사고)
- 회원은 자신의 건강상태를 사전에 고지해야 한다.
- 시설 이용 중 발생한 상해는 시설물 하자가 아닌 이상 회원 본인 책임이다.

계약일: {{contract_date}}

시설장 서명: ______________
회원(보호자) 서명: ______________`,

  privacy: `개 인 정 보 수 집 · 이 용 동 의 서

아쿠수중운동센터는 「개인정보보호법」에 따라 아래와 같이 개인정보를 수집·이용하고자 합니다.

■ 수집·이용 목적
- 회원 관리 및 이용료 결제·환불
- 수업 예약 및 안내 문자 발송
- 안전사고 발생 시 응급조치 및 보호자 연락
- 세무 신고 및 법정 의무 이행

■ 수집 항목
[필수] 성명, 생년월일, 연락처(휴대전화), 주소
[필수-미성년] 보호자 성명 · 관계 · 연락처
[선택] 이메일, 건강상태·진단명, 비상연락처, 사진

■ 보유·이용 기간
- 회원 탈퇴 후 5년 (세무·회계 법정 보관 의무)
- 계약 종료 시 즉시 파기 요청 가능 (일부 법정 항목 제외)

■ 동의를 거부할 권리
정보주체는 개인정보 수집·이용에 동의하지 않을 수 있습니다. 다만 필수항목 미동의 시 회원 등록이 제한됩니다.

□ 위 개인정보 수집·이용에 동의합니다.       (필수)
□ 사진·영상 촬영 및 홍보물 활용에 동의합니다. (선택)
□ 이벤트·프로모션 문자 수신에 동의합니다.    (선택)

동의일: {{contract_date}}

동의자 성명: {{name}}
서명: ______________`,
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<"all" | "staff" | "member" | "other">("all");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | null>(null);

  useEffect(() => { loadAll(); }, []);
  useBranchWatch(() => loadAll());

  async function loadAll() {
    setLoading(true);
    const branchId = getActiveBranchId();
    const bf = (q: any) => branchId ? q.eq("branch_id", branchId) : q;

    // contracts 테이블 (자동 폴백)
    let contractsData: any[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await bf(supabase.from("contracts").select("*")).order("contract_date", { ascending: false });
      if (!r.error) { contractsData = r.data || []; break; }
      if (r.error.code === "42703" || r.error.message?.includes("branch_id")) {
        const r2 = await supabase.from("contracts").select("*").order("contract_date", { ascending: false });
        if (!r2.error) { contractsData = r2.data || []; break; }
      }
      if (r.error.code === "42P01" || r.error.message?.includes("does not exist")) {
        // 테이블 없음
        contractsData = [];
        break;
      }
      break;
    }
    setContracts(contractsData);

    const mRes = await supabase.from("members").select("id, name, member_type, phone, guardian_name").is("deleted_at", null).order("name");
    setMembers(mRes.data || []);
    const sRes = await supabase.from("staff").select("id, name, role, phone, hire_date").order("name");
    setStaffList(sRes.data || []);

    setLoading(false);
  }

  const filtered = useMemo(() => {
    return contracts.filter(c => {
      if (filterCat !== "all") {
        const t = CONTRACT_TYPES.find(x => x.v === c.contract_type);
        if (!t || t.cat !== filterCat) return false;
      }
      if (filterType && c.contract_type !== filterType) return false;
      if (search) {
        const q = search.toLowerCase();
        const nameHit = (c.subject_name || "").toLowerCase().includes(q);
        const titleHit = (c.title || "").toLowerCase().includes(q);
        if (!nameHit && !titleHit) return false;
      }
      return true;
    });
  }, [contracts, filterCat, filterType, search]);

  const stats = useMemo(() => ({
    total: contracts.length,
    staff: contracts.filter(c => {
      const t = CONTRACT_TYPES.find(x => x.v === c.contract_type);
      return t?.cat === "staff";
    }).length,
    member: contracts.filter(c => {
      const t = CONTRACT_TYPES.find(x => x.v === c.contract_type);
      return t?.cat === "member";
    }).length,
    thisMonth: contracts.filter(c => c.contract_date?.startsWith(new Date().toISOString().slice(0,7))).length,
  }), [contracts]);

  function openNew(subCat: "staff" | "member") {
    setEditing({
      contract_type: subCat === "staff" ? "employment" : "member_service",
      subject_kind: subCat,
      subject_id: "",
      subject_name: "",
      title: "",
      contract_date: todayStr(),
      start_date: todayStr(),
      end_date: "",
      body: TEMPLATES[subCat === "staff" ? "employment" : "member_service"] || "",
      signature: "",
      counter_signature: "",
      status: "draft",
      note: "",
    });
  }

  async function save() {
    if (!editing.subject_name) return alert("대상(회원/직원)명을 입력해 주세요");
    if (!editing.title) return alert("계약서 제목을 입력해 주세요");

    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const branchId = getActiveBranchId();
    const payload: any = {
      org_id: orgId,
      ...(branchId ? { branch_id: branchId } : {}),
      contract_type: editing.contract_type,
      subject_kind: editing.subject_kind,
      subject_id: editing.subject_id || null,
      subject_name: editing.subject_name,
      title: editing.title,
      contract_date: editing.contract_date,
      start_date: editing.start_date || null,
      end_date: editing.end_date || null,
      body: editing.body,
      signature: editing.signature || null,
      counter_signature: editing.counter_signature || null,
      status: editing.status,
      note: editing.note || null,
    };

    // 자동 컬럼 폴백
    let lastErr: any = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const call = editing.id
        ? supabase.from("contracts").update(payload).eq("id", editing.id)
        : supabase.from("contracts").insert(payload);
      const { error } = await call;
      if (!error) {
        alert(editing.id ? "✅ 계약서가 수정되었습니다" : "✅ 계약서가 저장되었습니다");
        setEditing(null);
        loadAll();
        return;
      }
      lastErr = error;
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        alert(`❌ contracts 테이블이 없습니다.\n\n💡 아래 SQL을 Supabase에서 먼저 실행하세요:\n\nCREATE TABLE contracts (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  org_id UUID, branch_id UUID,\n  contract_type TEXT NOT NULL,\n  subject_kind TEXT, subject_id UUID, subject_name TEXT,\n  title TEXT, contract_date DATE, start_date DATE, end_date DATE,\n  body TEXT, signature TEXT, counter_signature TEXT,\n  status TEXT DEFAULT 'draft', note TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\nALTER TABLE contracts ENABLE ROW LEVEL SECURITY;\nCREATE POLICY contracts_all ON contracts FOR ALL USING (true) WITH CHECK (true);`);
        return;
      }
      const m = error.message.match(/'([^']+)' column|column "([^"]+)"/);
      const missing = m?.[1] || m?.[2];
      if (missing && missing in payload) { delete payload[missing]; continue; }
      break;
    }
    alert("저장 실패: " + (lastErr?.message || "알 수 없는 오류"));
  }

  async function del(c: any) {
    if (!confirm(`"${c.title}" 계약서를 삭제할까요?\n\n삭제된 데이터는 복구할 수 없습니다.`)) return;
    const { error } = await supabase.from("contracts").delete().eq("id", c.id);
    if (error) return alert("삭제 실패: " + error.message);
    loadAll();
  }

  function handlePrint() {
    window.print();
  }

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-10">
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          main { max-width: 100% !important; padding: 0 !important; }
          .contract-print { border: none !important; }
          .contract-body { white-space: pre-wrap; font-family: serif; line-height: 1.9; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="no-print">
        <div className="flex items-center gap-2 mb-3">
          <HomeButton />
          <span className="text-gray-300">/</span>
          <Link href="/settings" className="text-sm text-gray-500 hover:text-aqu-700 flex items-center gap-1">
            <ChevronLeft className="w-4 h-4" /> 설정
          </Link>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="text-2xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
            <FileSignature className="w-7 h-7 text-emerald-600" /> 계약서 관리
          </h1>
          <div className="flex gap-2">
            <button onClick={() => openNew("staff")}
              className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold flex items-center gap-1">
              <Plus className="w-4 h-4" /> 근로계약서
            </button>
            <button onClick={() => openNew("member")}
              className="px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-semibold flex items-center gap-1">
              <Plus className="w-4 h-4" /> 회원 계약서
            </button>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KPI label="전체 계약서" val={stats.total} icon="📁" color="text-slate-700" />
          <KPI label="근로계약"   val={stats.staff} icon="👨‍💼" color="text-blue-700" />
          <KPI label="회원계약"   val={stats.member} icon="👥" color="text-purple-700" />
          <KPI label="이번달"     val={stats.thisMonth} icon="📅" color="text-emerald-700" />
        </div>

        {/* 필터 */}
        <div className="bg-white rounded-xl border border-emerald-100 p-3 mb-4 flex flex-wrap items-center gap-2">
          {(["all","staff","member","other"] as const).map(c => (
            <button key={c} onClick={() => { setFilterCat(c); setFilterType(""); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filterCat === c ? "bg-emerald-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              {c === "all" ? "전체" : c === "staff" ? "👨‍💼 직원" : c === "member" ? "👥 회원" : "기타"}
            </button>
          ))}
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs">
            <option value="">전체 유형</option>
            {CONTRACT_TYPES.filter(t => filterCat === "all" || t.cat === filterCat).map(t => (
              <option key={t.v} value={t.v}>{t.l}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="이름·제목 검색"
              className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />
          </div>
        </div>
      </div>

      {/* 리스트 */}
      <div className="bg-white rounded-xl border border-emerald-100 overflow-hidden no-print">
        {loading ? (
          <div className="p-8 text-center text-gray-400">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
            등록된 계약서가 없습니다.<br />
            <span className="text-xs">상단의 "+" 버튼으로 새 계약서를 작성해 주세요.</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-emerald-50/60 border-b border-emerald-100">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-700">유형</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-700">대상</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-700">제목</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-700">계약일</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-700">기간</th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-gray-700">상태</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-700">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-t border-gray-100 hover:bg-emerald-50/30">
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${typeColor(c.contract_type)}`}>
                      {typeLabel(c.contract_type)}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-800">{c.subject_name}</td>
                  <td className="px-3 py-2 text-gray-700">{c.title}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{c.contract_date}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {c.start_date && c.end_date ? `${c.start_date} ~ ${c.end_date}` : c.start_date || "-"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      c.status === "signed" ? "bg-green-100 text-green-700" :
                      c.status === "sent" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {c.status === "signed" ? "✓ 서명완료" : c.status === "sent" ? "📤 발송" : "📝 초안"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setEditing(c)} className="text-xs text-emerald-600 hover:text-emerald-800 mr-2">보기/편집</button>
                    <button onClick={() => del(c)} className="text-red-400 hover:text-red-600" title="삭제">
                      <Trash2 className="w-3.5 h-3.5 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 편집 모달 */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="no-print px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50">
              <div className="flex items-center gap-2">
                <FileSignature className="w-5 h-5 text-emerald-600" />
                <div className="font-bold text-slate-900">{editing.id ? "계약서 편집" : "새 계약서 작성"}</div>
              </div>
              <div className="flex gap-1">
                <button onClick={handlePrint} className="px-2 py-1 border border-gray-200 rounded text-xs hover:bg-gray-50 flex items-center gap-1">
                  <Printer className="w-3.5 h-3.5" /> 인쇄
                </button>
                <button onClick={() => setEditing(null)} className="p-1.5 hover:bg-white/70 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="no-print grid grid-cols-2 gap-2">
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">유형 *</span>
                  <select value={editing.contract_type}
                    onChange={e => {
                      const newType = e.target.value;
                      const useTemplate = !editing.id && (!editing.body || Object.values(TEMPLATES).includes(editing.body));
                      setEditing({ ...editing, contract_type: newType, body: useTemplate && TEMPLATES[newType] ? TEMPLATES[newType] : editing.body });
                    }}
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm">
                    {CONTRACT_TYPES.map(t => (
                      <option key={t.v} value={t.v}>{t.l}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">상태</span>
                  <select value={editing.status}
                    onChange={e => setEditing({ ...editing, status: e.target.value })}
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm">
                    <option value="draft">📝 초안</option>
                    <option value="sent">📤 발송/전달</option>
                    <option value="signed">✓ 서명완료</option>
                  </select>
                </label>
              </div>

              <div className="no-print grid grid-cols-2 gap-2">
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">대상자명 *</span>
                  <input type="text" value={editing.subject_name}
                    onChange={e => setEditing({ ...editing, subject_name: e.target.value })}
                    placeholder="회원명 또는 직원명"
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                </label>
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">계약서 제목 *</span>
                  <input type="text" value={editing.title}
                    onChange={e => setEditing({ ...editing, title: e.target.value })}
                    placeholder="예: 2026년 근로계약서 (윤성은)"
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                </label>
              </div>

              <div className="no-print grid grid-cols-3 gap-2">
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">계약일 *</span>
                  <input type="date" value={editing.contract_date}
                    onChange={e => setEditing({ ...editing, contract_date: e.target.value })}
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                </label>
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">시작일</span>
                  <input type="date" value={editing.start_date || ""}
                    onChange={e => setEditing({ ...editing, start_date: e.target.value })}
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                </label>
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">종료일</span>
                  <input type="date" value={editing.end_date || ""}
                    onChange={e => setEditing({ ...editing, end_date: e.target.value })}
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                </label>
              </div>

              {/* 인쇄용 헤더 */}
              <div className="print-only mb-3 text-center">
                <div className="text-xl font-bold mb-1">{editing.title}</div>
                <div className="text-xs text-gray-600">아쿠수중운동센터 · 계약일 {editing.contract_date}</div>
                <hr className="my-2 border-black" />
              </div>

              <label className="text-xs block">
                <span className="text-gray-600 font-semibold no-print">📄 계약 내용</span>
                <textarea value={editing.body}
                  onChange={e => setEditing({ ...editing, body: e.target.value })}
                  rows={18}
                  className="contract-body w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono leading-relaxed"
                  placeholder="계약서 본문을 입력하세요..." />
              </label>

              <div className="no-print">
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">비고</span>
                  <input type="text" value={editing.note || ""}
                    onChange={e => setEditing({ ...editing, note: e.target.value })}
                    placeholder="내부 메모 (계약 상대방에게 노출되지 않음)"
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                </label>
              </div>

              {/* 인쇄용 서명란 */}
              <div className="print-only mt-8 flex justify-around text-xs">
                <div>
                  <div className="mb-8">시설장 서명</div>
                  <div className="border-t border-black w-40 mt-8"></div>
                </div>
                <div>
                  <div className="mb-8">{editing.subject_kind === "staff" ? "근로자" : "회원(보호자)"} 서명</div>
                  <div className="border-t border-black w-40 mt-8"></div>
                </div>
              </div>
            </div>

            <div className="no-print px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
              <div className="text-[11px] text-gray-500">
                💡 <b>{`{{name}}`}, {`{{contract_date}}`}</b> 등 자리표시자는 저장 후 수동 수정하거나 직접 입력하세요.
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>
                <button onClick={save}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center gap-1">
                  <Save className="w-4 h-4" /> 저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function KPI({ label, val, icon, color }: any) {
  return (
    <div className="bg-white rounded-xl border border-emerald-100 p-3 flex items-center gap-3">
      <div className="text-2xl">{icon}</div>
      <div>
        <div className="text-[10px] text-gray-500 font-medium">{label}</div>
        <div className={`text-xl md:text-2xl font-bold ${color}`}>{val}</div>
      </div>
    </div>
  );
}
