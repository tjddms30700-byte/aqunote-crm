"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { supabase } from "@/lib/supabase";
import { getActiveBranchId, useBranchWatch } from "@/lib/branchContext";
import {
  FileSignature, FileText, Plus, X, Save, Trash2, Search,
  UserCheck, Users, Calendar, ChevronLeft, Printer, Download, Link2
} from "lucide-react";
import ContractSignaturePad, { CenterSeal } from "@/components/ContractSignaturePad";
// ✅ v3.60.0: 템플릿 공용 모듈 분리
import { CONTRACT_TYPES, typeLabel, buildContractTitle, typeColor, TEMPLATES } from "@/lib/contractTemplates";

/**
 * v3.20.11: 계약서 폼 관리
 * - 근로계약서, 회원 이용계약서, 개인정보동의서 자체 폼 작성
 * - 서명 이미지 첨부 및 파일 저장
 * - 회원별 · 직원별 이력 관리
 */

// ✨ v3.33.0: 통합 회원이용계약서 (4페이지) + 파편 3종 삭제

// v3.20.24: 계약직 · 일용·시급제 근로계약서 템플릿 상수
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// ✅ v3.60.0: 전자서명 링크 복사 (유형별 공개 서명 페이지 URL)
function copySignLink(contractType: string) {
  const url = `${window.location.origin}/contract-sign?type=${contractType}`;
  navigator.clipboard.writeText(url).then(
    () => alert(`✅ 서명 링크가 복사되었습니다.\n\n${url}\n\n카카오톡·문자로 전달하면 상대방이 바로 작성·서명할 수 있습니다.`),
    () => prompt("아래 링크를 복사하세요:", url)
  );
}

export default function ContractsPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">로딩중...</div>}>
      <ContractsPage />
    </Suspense>
  );
}

function ContractsPage() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  // ✅ v3.39.0: 등록된 회원권 목록 로드 (가변 선택용)
  const [plans, setPlans] = useState<any[]>([]);
  // ✅ v3.39.3: 관리자 설정 페이지(/settings/programs)의 이용 프로그램 목록 로드
  const [servicePrograms, setServicePrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<"all" | "staff" | "member" | "other">("all");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => { loadAll(); }, []);

  // v3.20.36: URL 파라미터 확장 - lead 상세 데이터 자동 수신 + form_data 매핑
  useEffect(() => {
    const newType = searchParams?.get("new");
    const subjectKind = searchParams?.get("subject_kind") as "staff" | "member" | null;
    const subjectId = searchParams?.get("subject_id") || "";
    const subjectName = searchParams?.get("subject_name") || "";
    const leadId = searchParams?.get("lead_id") || "";
    // 체험/상담 리드 상세
    const extraFromUrl = {
      phone: searchParams?.get("phone") || "",
      birth: searchParams?.get("birth") || "",
      guardian_name: searchParams?.get("guardian_name") || "",
      guardian_relation: searchParams?.get("guardian_relation") || "",
      address: searchParams?.get("address") || "",
      member_type: searchParams?.get("member_type") || "",
      lead_id: leadId,
    };
    if (newType && subjectKind) {
      openNewByType(newType, subjectKind, subjectId, subjectName, extraFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // v3.20.21: 계약서 유형별 자동 폼장이 주입
  function defaultFormDataFor(contractType: string, subCat: "staff" | "member") {
    if (contractType === "employment") return {
      employment_type: "정규직",
      workplace: "경기도 하남시 위례대로 190, 위례효성 해링턴타워 203호 아쿠수중운동센터",
      duty: "아동발달에 대한 상담 및 지원사업, 행정 및 운영업무 보조",
      weekday_hours: "13:00 ~ 22:00 (휴게 19:30~20:30, 1시간)",
      saturday_hours: "10:00 ~ 14:30 (휴게 12:00~12:30, 30분)",
      base_salary: 2100000, meal_allowance: 200000, transport_allowance: 0,
      bonus_yn: "있음 (금액 상이함)", pay_day: 15,
      pay_method: "근로자 명의 예금통장 입금",
      insurance_employment: true, insurance_industrial: true,
      insurance_pension: true, insurance_health: true,
      employer_name: "위례아쿠수중운동센터", employer_ceo: "하유정",
      worker_phone: "",
    };
    // v3.20.24: 계약직 근로계약서
    if (contractType === "employment_fixed") return {
      employment_type: "계약직",
      workplace: "경기도 하남시 위례대로 190, 위례효성 해링턴타워 203호 아쿠수중운동센터",
      duty: "아동발달에 대한 상담 및 지원사업, 행정 및 운영업무 보조",
      weekday_hours: "13:00 ~ 22:00 (휴게 19:30~20:30, 1시간)",
      saturday_hours: "10:00 ~ 14:30 (휴게 12:00~12:30, 30분)",
      probation_months: 3,
      renewal_clause: "계약종료 30일 전 상호 협의로 갱신 가능",
      base_salary: 2100000, meal_allowance: 200000,
      pay_day: 15, pay_method: "근로자 명의 예금통장 입금",
      insurance_employment: true, insurance_industrial: true,
      insurance_pension: true, insurance_health: true,
      employer_name: "위례아쿠수중운동센터", employer_ceo: "하유정",
      worker_phone: "",
    };
    // v3.20.24: 일용·시급제 근로계약서
    if (contractType === "employment_daily") return {
      employment_type: "일용·시급제",
      workplace: "경기도 하남시 위례대로 190, 위례효성 해링턴타워 203호 아쿠수중운동센터",
      duty: "수중재활 수업 진행 및 해당 회원 지원 업무",
      daily_hours: 4,
      break_time: "수업 사이 10분",
      hourly_wage: 15000,
      daily_wage: 60000,
      pay_day: 15,
      pay_method: "근로자 명의 예금통장 입금",
      insurance_industrial: true, insurance_employment: false,
      insurance_pension: false, insurance_health: false,
      employer_name: "위례아쿠수중운동센터", employer_ceo: "하유정",
      worker_phone: "",
    };
    if (contractType === "nda") return {
      employer_name: "위례아쿠수중운동센터", employer_ceo: "하유정",
      worker_phone: "",
      confidential_scope: "회원·보호자 개인정보, 결제·매출 자료, 진단·치료 기록, 센터 운영 노하우 일체",
      duration_years: 3,
      penalty: "민형상 배상 및 근로계약 해지",
    };
    if (contractType === "resignation") return {
      worker_phone: "", birth_date: "",
      hire_date: "", last_work_date: todayStr(),
      reason: "개인 사유",
      handover_notes: "담당 회원 인수인계 및 자료 정리 완료",
    };
    if (contractType === "incident") return {
      worker_phone: "", incident_date: todayStr(),
      incident_desc: "", cause: "", pledge: "동일 사유로 재발 시 징계를 감수하겠습니다",
    };
    if (contractType === "member_service") return {
      guardian: "", phone: "", plan_name: "", sessions: 0, amount: 0,
      agree_contract: false, agree_privacy: false, agree_safety: false, agree_photo: false,
    };
    if (contractType === "privacy") return {
      guardian: "", phone: "", birth_date: "",
      agree_required: false, agree_optional_photo: false, agree_optional_marketing: false,
    };
    if (contractType === "safety") return {
      guardian: "", phone: "", health_note: "",
      agree_risk: false, agree_emergency: false,
    };
    // ✨ v3.33.0: 통합 회원이용계약서 4페이지 - 기본값
    if (contractType === "member_unified") return {
      plan: "STANDARD", // ✨ STANDARD | ADVANCED | PREMIUM
      per_session_amount: 130000, // 회당 기본 (STANDARD)
      sessions_per_week: 1, // 주 1회 고정
      sessions: 4, // 월 총 회수
      total_amount: 520000,
      period_start: todayStr(),
      period_end: "",
      guardian: "", guardian_relation: "", phone: "", birth: "", address: "",
      health_note: "", medications: "", allergies: "",
      emergency_contact: "", emergency_relation: "",
      // 4페이지 별 동의 체크박스
      agree_contract: false, // Page 1: 이용계약
      agree_privacy_required: false, // Page 2: 개인정보 필수
      agree_privacy_optional: false, // Page 2: 선택 (목적 외 활용)
      agree_safety: false, // Page 3: 안전·입수
      agree_emergency: false, // Page 4: 응급처치 이송
      agree_aqua_risk: false, // Page 4: 수중재활 위험 인지
    };
    if (contractType === "consent_minor") return {
      guardian: "", relation: "부", phone: "", child_name: "", child_birth: "",
    };
    // ✅ v3.39.2: 지상재활·디바이스케어 계약서 기본 form_data
    if (contractType === "ground_care") return {
      // 회원권 정보 (수동 입력 또는 드롭다운 선택)
      _selected_plan_id: "",
      plan_name: "",
      sessions: 10, // 총 회수 기본값
      per_session_amount: 0,
      total_amount: 0,
      valid_months: 3, // 유효기간 개월 (5회권=2, 10회권=3, 20회권=6 자동 매핑)
      period_start: todayStr(), // 계약일 (오늘)
      period_end: "", // 만료일 (자동 계산)
      // 이용 프로그램 (가변 체크박스 - 관리자가 추가/편집 가능)
      programs: [
        { key: "movement", label: "1:1 맞춤 운동재활", checked: false },
        { key: "posture", label: "체형교정", checked: false },
        { key: "device", label: "디바이스 케어 (근막·소닉)", checked: false },
      ],
      // 회원 개인정보
      guardian: "", guardian_relation: "", phone: "", birth: "", address: "",
      // 건강 정보 (fallback으로 "없음" 표시)
      health_note: "", medications: "", allergies: "",
      emergency_contact: "", emergency_relation: "",
      // 동의 체크박스
      agree_contract: false,
      agree_safety: false,
      agree_refund: false,
    };
    return {};
  }

  // v3.20.30: 대상자 정보 + form_data → 계약서 본문 실시간 100% 치환
  function applyTemplateVars(body: string, editingObj: any): string {
    if (!body) return "";
    const fd = editingObj?.form_data || {};
    // v3.20.35: 신규 4종 서식용 변수 확장 (member_name, guardian_relation, center_name, staff_*, research_*)
    const subjName = editingObj?.subject_name || fd.name || fd.member_name || fd.staff_name || "";
    const vars: Record<string, string> = {
      name: subjName,
      member_name: subjName,
      staff_name: subjName,
      phone: fd.phone || fd.worker_phone || fd.contact || "",
      birth: fd.birth || fd.birth_date || fd.child_birth || fd.staff_birth || "",
      birth_date: fd.birth_date || fd.birth || fd.child_birth || "",
      staff_birth: fd.staff_birth || fd.birth || fd.birth_date || "",
      address: fd.address || "",
      start_date: editingObj?.start_date || fd.start_date || fd.hire_date || "",
      end_date: editingObj?.end_date || fd.end_date || "",
      hire_date: fd.hire_date || editingObj?.start_date || fd.start_date || "",
      contract_date: editingObj?.contract_date || "",
      base_salary: fd.base_salary ? Number(fd.base_salary).toLocaleString() : "",
      meal_allowance: fd.meal_allowance ? Number(fd.meal_allowance).toLocaleString() : "",
      transport_allowance: fd.transport_allowance ? Number(fd.transport_allowance).toLocaleString() : "",
      workplace: fd.workplace || "",
      duty: fd.duty || "",
      weekday_hours: fd.weekday_hours || "",
      saturday_hours: fd.saturday_hours || "",
      bonus_yn: fd.bonus_yn || "",
      pay_day: fd.pay_day || "",
      pay_method: fd.pay_method || "",
      employer_name: fd.employer_name || "위례아쿠수중운동센터",
      employer_ceo: fd.employer_ceo || "하유정",
      center_name: fd.center_name || "위례아쿠수중운동센터",
      guardian: fd.guardian || fd.guardian_name || "",
      guardian_name: fd.guardian_name || fd.guardian || subjName,
      guardian_relation: fd.guardian_relation || fd.relation || "머니",
      relation: fd.relation || fd.guardian_relation || "",
      child_name: fd.child_name || "",
      child_birth: fd.child_birth || "",
      staff_role: fd.staff_role || fd.role || fd.duty || "재활강사",
      research_org: fd.research_org || "미기재",
      research_pi: fd.research_pi || "미기재",
      confidential_scope: fd.confidential_scope || "",
      duration_years: fd.duration_years || "",
      penalty: fd.penalty || "",
      // ✅ v3.39.0: 건강상태 변수 fallback ('없음' 자동 처리 - 코드명 노출 방지)
      health_note: fd.health_note && String(fd.health_note).trim() ? fd.health_note : "없음",
      medications: fd.medications && String(fd.medications).trim() ? fd.medications : "없음",
      allergies: fd.allergies && String(fd.allergies).trim() ? fd.allergies : "없음",
      emergency_contact: fd.emergency_contact && String(fd.emergency_contact).trim() ? fd.emergency_contact : "없음",
      emergency_relation: fd.emergency_relation && String(fd.emergency_relation).trim() ? fd.emergency_relation : "-",
      // ✅ v3.39.0: 회원권 가변 변수 (드롭다운 선택 결과 자동 바인딩)
      plan_name: fd.plan_name || fd.plan || "",
      total_sessions: fd.sessions ? String(fd.sessions) : (fd.total_sessions ? String(fd.total_sessions) : ""),
      total_amount: fd.total_amount ? Number(fd.total_amount).toLocaleString() : "0",
      per_session_amount: fd.per_session_amount ? Number(fd.per_session_amount).toLocaleString() : "0",
      valid_months: fd.valid_months ? String(fd.valid_months) : "3",
      // ✅ v3.39.2: 지상재활 계약서 자동 계산 변수
      // 만료일: 계약일 + 유효기간(개월) - 1일 자동 계산 (period_end 직접 입력 시 우선)
      end_date: (() => {
        if (fd.period_end && String(fd.period_end).trim()) return fd.period_end;
        if (editingObj?.end_date) return editingObj.end_date;
        const startStr = fd.period_start || editingObj?.contract_date || editingObj?.start_date;
        const months = Number(fd.valid_months) || 3;
        if (!startStr) return "";
        try {
          const d = new Date(startStr);
          if (isNaN(d.getTime())) return "";
          d.setMonth(d.getMonth() + months);
          d.setDate(d.getDate() - 1);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${dd}`;
        } catch { return ""; }
      })(),
      // 이용 프로그램 라인: 체크된 항목만 [■] 아닌 항목은 [ ] 로 렌더 (가변)
      programs_line: (() => {
        const progs = Array.isArray(fd.programs) ? fd.programs : [];
        if (progs.length === 0) return "[ ] 1:1 맞춤 운동재활  [ ] 체형교정  [ ] 디바이스 케어 (근막·소닉)";
        return progs.map((p: any) => `[${p.checked ? "■" : " "}] ${p.label}`).join("  ");
      })(),
    };
    // 모든 플레이스홀더 {{key}} 치환
    let out = body;
    for (const [k, v] of Object.entries(vars)) {
      const re = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g");
      out = out.replace(re, String(v ?? ""));
    }
    // 또한 form_data의 임의 키도 자동 치환
    for (const [k, v] of Object.entries(fd)) {
      if (vars[k] !== undefined) continue;
      const re = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g");
      out = out.replace(re, String(v ?? ""));
    }
    return out;
  }

  // v3.20.36: extraFromUrl 파라미터로 체험/상담 리드 상세 데이터 자동 매핑
  function openNewByType(
    contractType: string,
    subCat: "staff" | "member",
    subjectId: string,
    subjectName: string,
    extra?: {
      phone?: string; birth?: string; guardian_name?: string; guardian_relation?: string;
      address?: string; member_type?: string; lead_id?: string;
    }
  ) {
    // 기본 form_data에 URL에서 전달받은 리드 데이터 병합
    const baseForm: any = defaultFormDataFor(contractType, subCat);
    if (extra) {
      if (extra.phone) baseForm.phone = baseForm.phone || extra.phone;
      if (extra.phone) baseForm.worker_phone = baseForm.worker_phone || extra.phone;
      if (extra.birth) { baseForm.birth = extra.birth; baseForm.birth_date = extra.birth; }
      if (extra.guardian_name) baseForm.guardian_name = extra.guardian_name;
      if (extra.guardian_relation) baseForm.guardian_relation = extra.guardian_relation;
      if (extra.address) baseForm.address = extra.address;
      if (extra.member_type) baseForm.member_type = extra.member_type;
      if (extra.lead_id) baseForm.lead_id = extra.lead_id;
    }
    setEditing({
      contract_type: contractType,
      subject_kind: subCat,
      subject_id: subjectId,
      subject_name: subjectName,
      title: buildContractTitle(contractType, subjectName, todayStr()),
      contract_date: todayStr(),
      start_date: todayStr(),
      end_date: "",
      body: TEMPLATES[contractType] || "",
      form_data: baseForm,
      signature: "", counter_signature: "", status: "draft", note: "",
      auto_renew: true,
      renew_period_months: subCat === "staff" ? 12 : 12,
      // v3.20.36: 리드 원본 ID 보존 (추후 leads_inbox에 promoted_member_id 연결)
      _lead_id: extra?.lead_id || null,
    });
  }
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

    // v3.20.36: 정식 회원 + 체험/상담 리드 통합 조회 (계약서 대상자 검색에서 체험/상담 회원도 노출)
    // ✅ v3.39.0: membership_plans 병렬 로드 (계약서 회원권 드롭다운)
    // ✅ v3.39.3: service_programs 병렬 로드 (관리자 설정 페이지 자동 반영)
    const [mRes, lRes, planRes, progRes] = await Promise.all([
      supabase.from("members").select("id, name, member_type, phone, guardian_name, birth, status, extra").is("deleted_at", null).order("name"),
      supabase.from("leads_inbox").select("id, consult_form, status, promoted_member_id, created_at").is("promoted_member_id", null).order("created_at", { ascending: false }).limit(200),
      supabase.from("membership_plans").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
      supabase.from("service_programs").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    ]);
    setPlans(planRes.data || []);
    // service_programs 실패 시(테이블 미생성) localStorage fallback
    if (progRes.error || !Array.isArray(progRes.data) || progRes.data.length === 0) {
      try {
        const stored = typeof window !== "undefined" ? window.localStorage.getItem("aqunote_service_programs_v1") : null;
        if (stored) {
          const parsed = JSON.parse(stored);
          setServicePrograms(Array.isArray(parsed) ? parsed.filter((p: any) => p.is_active !== false) : []);
        } else {
          setServicePrograms([]);
        }
      } catch { setServicePrograms([]); }
    } else {
      setServicePrograms(progRes.data);
    }
    console.log(`[v3.39.3] membership_plans: ${(planRes.data || []).length}건 · service_programs: ${(progRes.data || []).length}건`);
    const memberList = (mRes.data || []).map((m: any) => ({
      id: m.id,
      source_type: "member",
      name: m.name,
      member_type: m.member_type,
      phone: m.phone,
      birth: m.birth,
      guardian_name: m.guardian_name || m?.extra?.consult_form?.guardian_name || "",
      status: m.status,
      _badge: m.status === "trial_scheduled" || m.status === "trial_done" ? "체험"
        : m.status === "waiting" || m.status === "new" ? "상담대기"
        : m.status === "regular" ? null : null,
    }));
    const leadList = (lRes.data || []).map((r: any) => {
      const cf = r.consult_form || {};
      const nm = cf.name || cf.child_name || cf.member_name;
      if (!nm) return null;
      return {
        id: `lead:${r.id}`,
        source_type: "lead",
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
        _badge: "상담대기",
      };
    }).filter(Boolean) as any[];
    // 중복 제거 (이름+전화번호 뒷자리 8자리 기준)
    const seen = new Set<string>();
    const merged = [...memberList, ...leadList].filter((x: any) => {
      const key = `${(x.name || "").trim()}|${(x.phone || "").replace(/[^0-9]/g, "").slice(-8)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setMembers(merged);
    // v3.20.36: 재직자 필터링 – status='resigned' 및 is_active=false 제외
    const sRes = await supabase.from("staff").select("*").order("name");
    const activeStaff = (sRes.data || []).filter((s: any) => {
      const st = String(s?.status || "").toLowerCase();
      if (st === "resigned" || st === "retired" || st === "inactive") return false;
      if (s?.is_active === false) return false;
      if (s?.is_resigned === true) return false;
      return true;
    });
    setStaffList(activeStaff);

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
    // ✨ v3.33.0: 회원은 통합 4페이지 계약서를 기본으로 생성
    const contractType = subCat === "staff" ? "employment" : "member_unified";
    setEditing({
      contract_type: contractType,
      subject_kind: subCat,
      subject_id: "",
      subject_name: "",
      title: "",
      contract_date: todayStr(),
      start_date: todayStr(),
      end_date: "",
      body: TEMPLATES[contractType] || "",
      // ✅ v3.20.15: 상담신청서처럼 필드별 개별 입력 (form_data JSON 저장)
      form_data: subCat === "staff" ? {
        // 근로계약서 기본 필드 (위례아쿠수중운동센터 실제 양식)
        workplace: "경기도 하남시 위례대로 190, 위례효성 해링턴타워 203호 아쿠수중운동센터",
        duty: "아동발달에 대한 상담 및 지원사업 (발달바우처, 교육청 바우처 등)에 따른 관련 업무 수행, 행정 업무와 운영업무 보조, 아동발달에 대한 상담 및 치료 수중감각통합 등에 관련한 업무 수행",
        weekday_hours: "13:00 ~ 22:00 (휴게 19:30~20:30, 1시간)",
        saturday_hours: "10:00 ~ 14:30 (휴게 12:00~12:30, 30분)",
        base_salary: 2100000,
        meal_allowance: 200000,
        transport_allowance: 0,
        bonus_yn: "있음 (금액 상이함)",
        pay_day: 15,
        pay_method: "근로자 명의 예금통장 입금",
        insurance_employment: true,
        insurance_industrial: true,
        insurance_pension: true,
        insurance_health: true,
        employer_name: "위례아쿠수중운동센터",
        employer_ceo: "하유정",
        worker_phone: "",
      } : {
        // 회원 이용계약서 기본 필드
        guardian: "",
        phone: "",
        plan_name: "",
        sessions: 0,
        amount: 0,
      },
      signature: "",
      counter_signature: "",
      status: "draft",
      note: "",
      auto_renew: true,
      renew_period_months: 12,
    });
  }

  async function save() {
    // ✅ v3.39.2: 저장 직전 title이 비어있거나 신규 규칙 미적용 시 자동 생성
    if (editing) {
      const ct = editing.contract_type;
      const shouldAutoRename = ct === "member_unified" || ct === "ground_care";
      if (shouldAutoRename) {
        const expected = buildContractTitle(ct, editing.subject_name || "", editing.contract_date);
        if (!editing.title || editing.title !== expected) {
          editing.title = expected;
        }
      }
    }
    if (!editing.subject_name) return alert("대상(회원/직원)명을 입력해 주세요");
    if (!editing.title) return alert("계약서 제목을 입력해 주세요");

    // ✅ v3.20.18: 회원 계약서 필수 동의 체크 검증
    if (editing.subject_kind === "member" && editing.contract_type === "member_service") {
      const fd = editing.form_data || {};
      const missing: string[] = [];
      if (!fd.agree_contract) missing.push("계약·환불·위약금 조항 동의");
      if (!fd.agree_privacy)  missing.push("개인정보 수집·이용 동의");
      if (!fd.agree_safety)   missing.push("안전 관리·책임 조항 동의");
      if (missing.length > 0) {
        alert(`❌ 필수 동의 항목이 체크되지 않았습니다:\n\n• ${missing.join("\n• ")}\n\n하단 동의 체크박스를 모두 처리해 주세요.`);
        return;
      }
    }
    // 근로계약·비밀유지 등 직원 계약서도 서명 유도 검증
    if (!editing.signature) {
      const proceed = confirm("⚠️ 아직 서명하지 않았습니다.\n그대로 초안으로 저장하시겠습니까?");
      if (!proceed) return;
    }

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
      // ✅ v3.20.15: 필드 값 JSON 저장 (상담신청서과 동일 방식)
      form_data: editing.form_data || null,
      // v3.20.22: 자동연장 설정
      auto_renew: editing.auto_renew !== false,
      renew_period_months: editing.renew_period_months || 12,
      terminated_at: editing.terminated_at || null,
      termination_reason: editing.termination_reason || null,
    };

    // 자동 컬럼 폴백
    let lastErr: any = null;
    let savedId: string | null = editing.id || null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const call = editing.id
        ? supabase.from("contracts").update(payload).eq("id", editing.id).select().single()
        : supabase.from("contracts").insert(payload).select().single();
      const { data, error } = await call;
      if (!error) {
        savedId = data?.id || editing.id;
        // v3.20.21: 서명 완료 시 회원/직원 문서로 자동 링크
        if (savedId && editing.signature && editing.status === "signed") {
          await autoLinkToDocument(savedId, editing, orgId);
          // v3.20.22: 서명 완료 시 PDF Storage 자동 생성
          await generateAndUploadPdf(savedId);
        }
        alert((editing.id ? "✅ 계약서가 수정되었습니다" : "✅ 계약서가 저장되었습니다") +
          (editing.signature && editing.status === "signed"
            ? `\n\n📄 ${editing.subject_kind === "staff" ? "직원 문서함" : "회원 문서함"}으로 자동 저장되었습니다`
            : ""));
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

  // v3.20.21: 계약서 서명 완료 시 회원/직원 문서함으로 자동 복사
  async function autoLinkToDocument(contractId: string, ed: any, orgId: string | undefined) {
    try {
      const subjectKind = ed.subject_kind;
      const subjectId = ed.subject_id;
      if (!subjectId || !subjectKind) return;

      const typeLabelText = typeLabel(ed.contract_type);
      const fileName = `${ed.subject_name}_${typeLabelText}_${ed.contract_date}.pdf`;
      const category = ed.contract_type === "employment" ? "contract"
                      : ed.contract_type === "nda" ? "contract"
                      : ed.contract_type === "resignation" ? "resignation"
                      : ed.contract_type === "incident" ? "incident"
                      : ed.contract_type === "member_service" ? "contract"
                      : ed.contract_type === "privacy" ? "privacy"
                      : ed.contract_type === "safety" ? "safety"
                      : "contract";

      if (subjectKind === "staff") {
        // 이미 링크된 문서 있는지 확인
        const { data: existing } = await supabase.from("staff_documents")
          .select("id").eq("contract_id", contractId).maybeSingle();
        if (existing?.id) return;

        const { data: ins, error } = await supabase.from("staff_documents").insert({
          staff_id: subjectId,
          org_id: orgId,
          category,
          title: `${typeLabelText} (자동생성)`,
          file_name: fileName,
          file_size: 0,
          mime_type: "application/pdf",
          memo: `계약서 관리에서 자동 생성된 문서 (계약서 ID: ${contractId})`,
          contract_id: contractId,
        }).select().single();
        if (!error && ins?.id) {
          await supabase.from("contracts").update({ auto_doc_id: ins.id }).eq("id", contractId);
        }
      } else if (subjectKind === "member") {
        const { data: existing } = await supabase.from("documents")
          .select("id").eq("contract_id", contractId).maybeSingle();
        if (existing?.id) return;

        const { data: ins, error } = await supabase.from("documents").insert({
          org_id: orgId,
          member_id: subjectId,
          category,
          filename: fileName,
          file_size: 0,
          mime_type: "application/pdf",
          description: `${typeLabelText} - 계약서 관리에서 자동 생성 (계약서 ID: ${contractId})`,
          contract_id: contractId,
        }).select().single();
        if (!error && ins?.id) {
          await supabase.from("contracts").update({ auto_doc_id: ins.id }).eq("id", contractId);
        }
      }
    } catch (e) {
      console.warn("autoLinkToDocument fallback:", e);
    }
  }

  async function del(c: any) {
    if (!confirm(`"${c.title}" 계약서를 삭제할까요?\n\n삭제된 데이터는 복구할 수 없습니다.`)) return;
    const { error } = await supabase.from("contracts").delete().eq("id", c.id);
    if (error) return alert("삭제 실패: " + error.message);
    loadAll();
  }

  function handlePrint() {
    // ✨ v3.33.0: 통합 회원이용계약서(4페이지) 전용 인쇄 분기
    if (editing?.contract_type === "member_unified") {
      const html = renderUnifiedContractHtml(editing);
      const w = window.open("", "_blank", "width=900,height=1200");
      if (!w) { alert("팝업 차단이 해제되어 있는지 확인해 주세요."); return; }
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 500);
      return;
    }
    // ✅ v3.20.18: 계약서로 보기 모드에서만 프린트 (편집 UI 숨김)
    if (editing?._view !== "preview") {
      setEditing({ ...editing, _view: "preview" });
      setTimeout(() => window.print(), 300);
      return;
    }
    window.print();
  }

  // ✨ v3.33.0: 통합 회원이용계약서 4페이지 HTML 렌더링
  function renderUnifiedContractHtml(ed: any): string {
    const fd = ed?.form_data || {};
    const plan: string = (fd.plan || "STANDARD").toUpperCase();
    const isSTD = plan === "STANDARD";
    const isADV = plan === "ADVANCED";
    const isPREM = plan === "PREMIUM";
    const check = (b: boolean) => (b ? "■" : "□");
    const num = (n: any) => (n ? Number(n).toLocaleString() : "0");
    const signImg = ed?.signature ? `<img class="sig" src="${ed.signature}" alt="sig"/>` : "";
    const sealImg = `<img class="seal" src="/center_seal.png" alt="seal"/>`;
    const today = new Date().toISOString().slice(0, 10);
    const subject = ed?.subject_name || fd.name || "";
    const contractDate = ed?.contract_date || today;
    const perAmt = Number(fd.per_session_amount || (isSTD ? 130000 : isADV ? 122500 : 150000));
    const sessions = Number(fd.sessions || 4);
    const totalAmt = Number(fd.total_amount || (perAmt * sessions));

    // 각 페이지 공통 헤더
    const pageHeader = (n: number, title: string) => `
      <div class="pg-hd">
        <div class="pg-hd-l"><b>아쿠수중운동센터</b> · 회원 통합 이용계약서</div>
        <div class="pg-hd-r">Page ${n} / 4 · ${title}</div>
      </div>`;
    const pageFooter = `<div class="pg-ft">생성일: ${today} · 아쿠수중운동센터 · 사업자등록번호 680-04-03475</div>`;
    const signBlock = (roleLabel: string) => `
      <div class="sign-block">
        <div class="sign-row">
          <div class="sign-cell">${roleLabel}: <b>${subject || "-"}</b> <span class="in">(서명)</span>${signImg}</div>
          <div class="sign-cell">센터: <b>아쿠수중운동센터</b> 대표 서명 <span class="in">(인)</span>${sealImg}</div>
        </div>
        <div class="sign-date">서명일: ${contractDate}</div>
      </div>`;

    return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/>
<title>회원 이용계약서 · 통합 (${subject})</title>
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css" rel="stylesheet"/>
<style>
  @page { size: A4; margin: 12mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', sans-serif; font-size: 10pt; line-height: 1.5; color: #111; margin: 0; word-break: keep-all; letter-spacing: -0.02em; }
  .page { page-break-after: always; padding: 4mm 0; min-height: 260mm; position: relative; }
  .page:last-child { page-break-after: auto; }
  .pg-hd { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #0284c7; padding-bottom: 4px; margin-bottom: 8mm; font-size: 9pt; color: #0f172a; }
  .pg-hd-l { font-size: 11pt; }
  .pg-hd-r { color: #0284c7; font-weight: 700; }
  h1.doc-title { text-align: center; font-size: 18pt; font-weight: 800; margin: 0 0 3mm 0; letter-spacing: -0.03em; }
  h2.sec { font-size: 12pt; font-weight: 700; margin: 4mm 0 2mm 0; padding: 3px 8px; background: linear-gradient(90deg, #e0f2fe, transparent); border-left: 4px solid #0284c7; }
  h3.sub { font-size: 10.5pt; font-weight: 700; margin: 3mm 0 1mm 0; color: #0369a1; }
  p { margin: 1.5mm 0; }
  ul { margin: 1.5mm 0; padding-left: 6mm; }
  li { margin: 0.5mm 0; }
  table.info { width: 100%; border-collapse: collapse; margin: 3mm 0; }
  table.info th, table.info td { border: 1px solid #cbd5e1; padding: 4px 8px; font-size: 9.5pt; text-align: left; }
  table.info th { background: #f1f5f9; width: 25%; font-weight: 700; }
  .plan-box { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6mm; margin: 4mm 0; }
  .plan-card { border: 2px solid #cbd5e1; border-radius: 8px; padding: 4mm; text-align: center; background: #fff; }
  .plan-card.selected { border-color: #0284c7; background: linear-gradient(180deg, #f0f9ff, #fff); box-shadow: 0 0 0 1px #0284c7 inset; }
  .plan-card .plan-name { font-size: 11pt; font-weight: 800; color: #0369a1; margin-bottom: 2mm; }
  .plan-card.selected .plan-name { color: #0284c7; }
  .plan-card .plan-price { font-size: 13pt; font-weight: 800; color: #0f172a; }
  .plan-card .plan-desc { font-size: 8.5pt; color: #64748b; margin-top: 2mm; }
  .plan-check { font-size: 14pt; margin-right: 3px; color: #0284c7; }
  .consent-item { border: 1px solid #e2e8f0; border-radius: 6px; padding: 3mm 4mm; margin: 2mm 0; background: #fafafa; }
  .consent-item .head { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 10.5pt; margin-bottom: 1.5mm; }
  .consent-item .box { display: inline-block; width: 12pt; text-align: center; }
  .sign-block { position: absolute; bottom: 10mm; left: 0; right: 0; border-top: 2px solid #0284c7; padding-top: 4mm; }
  .sign-row { display: flex; justify-content: space-around; gap: 12mm; }
  .sign-cell { flex: 1; font-size: 10pt; padding: 2mm 4mm; text-align: center; }
  .sign-cell .in { color: #94a3b8; font-size: 9pt; }
  .sig { display: inline-block; vertical-align: middle; height: 32px; max-width: 26mm; object-fit: contain; margin-left: 2px; mix-blend-mode: multiply; }
  .seal { display: inline-block; vertical-align: middle; height: 14mm; width: 14mm; object-fit: contain; margin-left: 2px; }
  .sign-date { text-align: center; font-size: 9pt; color: #475569; margin-top: 3mm; }
  .pg-ft { position: absolute; bottom: 3mm; left: 0; right: 0; text-align: center; font-size: 8pt; color: #94a3b8; }
  .warn { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 3mm 4mm; border-radius: 4px; margin: 3mm 0; font-size: 9.5pt; }
  .risk { background: #fee2e2; border-left: 4px solid #dc2626; padding: 3mm 4mm; border-radius: 4px; margin: 3mm 0; font-size: 9.5pt; }
</style></head><body>

<!-- ================== PAGE 1: 이용계약서 ================== -->
<div class="page">
  ${pageHeader(1, "이용계약서")}
  <h1 class="doc-title">회원 이용계약서 (통합)</h1>

  <h2 class="sec">제1조 (계약자 및 기본정보)</h2>
  <table class="info">
    <tr><th>회원명</th><td>${subject || "-"}</td><th>생년월일</th><td>${fd.birth || "-"}</td></tr>
    <tr><th>보호자</th><td>${fd.guardian || "-"} (${fd.guardian_relation || "-"})</td><th>연락처</th><td>${fd.phone || "-"}</td></tr>
    <tr><th>주소</th><td colspan="3">${fd.address || "-"}</td></tr>
  </table>

  <h2 class="sec">제2조 (선택 요금제)</h2>
  <div class="plan-box">
    <div class="plan-card ${isSTD ? "selected" : ""}">
      <div><span class="plan-check">${check(isSTD)}</span> <span class="plan-name">STANDARD</span></div>
      <div class="plan-price">₩130,000 / 회</div>
      <div class="plan-desc">주 1회 고정<br/>일대일 맞춤 수중재활 · 기초기능 회복</div>
    </div>
    <div class="plan-card ${isADV ? "selected" : ""}">
      <div><span class="plan-check">${check(isADV)}</span> <span class="plan-name">ADVANCED</span></div>
      <div class="plan-price">₩122,500 / 회</div>
      <div class="plan-desc">주 2회 고정<br/>집중 재활 · 회당 7,500원 할인</div>
    </div>
    <div class="plan-card ${isPREM ? "selected" : ""}">
      <div><span class="plan-check">${check(isPREM)}</span> <span class="plan-name">PREMIUM</span></div>
      <div class="plan-price">₩150,000 / 회</div>
      <div class="plan-desc">주 2회 고정<br/>마스터 전담 · 프리미엄 솔루션</div>
    </div>
  </div>

  <h2 class="sec">제3조 (계약기간 및 수강료)</h2>
  <table class="info">
    <tr><th>계약기간</th><td>${fd.period_start || "-"} ~ ${fd.period_end || "-"}</td><th>이용회수</th><td>총 ${sessions}회 (주 ${fd.sessions_per_week || (isSTD ? 1 : 2)}회 고정)</td></tr>
    <tr><th>회당 수강료</th><td>₩${num(perAmt)}</td><th>총 결제금액</th><td><b style="color:#0284c7">₩${num(totalAmt)}</b></td></tr>
  </table>

  <h2 class="sec">제4조 (월 정액 선납제 및 사전 재결제)</h2>
  <p>본 센터는 지정 요일·시간 고정제로 운영되며, 해당 달의 주차(월 4회 또는 5회)에 따라 월 수강료를 선납하는 방식입니다. 스케줄 우선 배정을 위해 수업 잔여 회차가 2회기 남은 시점에 다음 달 사전 재결제가 진행됩니다.</p>

  <h2 class="sec">제5조 (보강 및 차감 규정)</h2>
  <p>개인 사정, 병결 등으로 인한 결석 시, <b>[다음 달(익월) 이내]</b>에 사전 예약 후 보강을 완료하셔야 합니다. 기한 내 미완료된 보강 회차는 자동 소멸(차감) 처리됩니다. (센터 사정 외 이월 불가)</p>

  <h2 class="sec">제6조 (출석률 관리)</h2>
  <p>수중재활의 연속성과 효과적인 수업 관리를 위해 <b>월 출석률 60% 미만</b> 시 대기자로 전환될 수 있습니다.</p>

  <div class="consent-item">
    <div class="head"><span class="box">${check(fd.agree_contract)}</span> 본인은 상기 이용계약의 전 조항을 이해하였으며, 이에 동의합니다.</div>
  </div>

  ${signBlock("회원(보호자)")}
  ${pageFooter}
</div>

<!-- ================== PAGE 2: 개인정보 동의서 ================== -->
<div class="page">
  ${pageHeader(2, "개인정보 동의서")}
  <h1 class="doc-title">개인정보 수집 및 이용 동의서</h1>

  <h2 class="sec">1. 수집하는 개인정보 항목</h2>
  <ul>
    <li>필수: 성명, 생년월일, 연락처, 주소, 보호자 성명·관계·연락처</li>
    <li>필수: 건강 문진정보(기저질환, 복용 약물, 알레르기), 응급 연락처</li>
    <li>선택: 수업 사진/영상(수업 개선 및 홍보 목적)</li>
  </ul>

  <h2 class="sec">2. 수집 · 이용 목적</h2>
  <ul>
    <li>회원 관리 및 수업 예약·출결 관리</li>
    <li>수중재활 프로그램 설계 및 상담에 따른 개인 맞춤 서비스 제공</li>
    <li>응급상황 발생 시 응급처치 및 보호자 통지</li>
    <li>요금 정산 및 세금계산서 발행</li>
  </ul>

  <h2 class="sec">3. 보유 · 이용 기간</h2>
  <p>회원 탈퇴 시까지(수집일로부터 최대 5년). 관계 법령이 정한 경우 해당 기간까지 보관합니다.</p>

  <h2 class="sec">4. 동의를 거부할 권리와 허용할 범위</h2>
  <p>회원은 개인정보 수집·이용에 대한 동의를 거부할 권리가 있으나, 필수 항목을 거부할 경우 회원 등록 및 수업 제공이 제한될 수 있습니다.</p>

  <div class="consent-item">
    <div class="head"><span class="box">${check(fd.agree_privacy_required)}</span> [필수] 개인정보 수집·이용에 동의합니다.</div>
    <p style="font-size:9pt;color:#64748b;margin:0;">미동의 시 회원 등록 불가</p>
  </div>
  <div class="consent-item">
    <div class="head"><span class="box">${check(fd.agree_privacy_optional)}</span> [선택] 수업 사진/영상 확보 및 센터 홍보 목적 사용에 동의합니다.</div>
    <p style="font-size:9pt;color:#64748b;margin:0;">미동의 시에도 회원 등록 및 수업 이용에는 지장 없음</p>
  </div>

  ${signBlock("회원(보호자)")}
  ${pageFooter}
</div>

<!-- ================== PAGE 3: 안전 · 입수 동의서 ================== -->
<div class="page">
  ${pageHeader(3, "안전 · 입수 동의서")}
  <h1 class="doc-title">안전 및 입수 동의서</h1>

  <h2 class="sec">1. 수질 및 운영 환경</h2>
  <ul>
    <li>수온: 31~35℃ (재활·수중운동 특화 온도)</li>
    <li>pH 5.8~8.6 · 잔류염소 0.4~3.0 ppm · 여과기 압력 0.5~2.5 bar</li>
    <li>매일 관계 법령에 따른 수질 검사 및 안전장비 점검 시행</li>
  </ul>

  <h2 class="sec">2. 입수 전 준수 사항</h2>
  <ul>
    <li>입수 전 반드시 샤워 및 화장실 사용을 완료해 주십시오.</li>
    <li>수영복, 수영모, 안전마스크 등 지정 장비 착용이 필요합니다.</li>
    <li>음주 시, 고열 · 감염성 질환 보유 시, 피부 상처가 있는 경우 입수하지 마십시오.</li>
    <li>수중 강사의 지시 없이 단독 프로그램 변경, 잠수, 과격한 행동(장난)을 금지합니다.</li>
  </ul>

  <h2 class="sec">3. 보호자 동반 기준 (아동 회원)</h2>
  <ul>
    <li>만 7세 미만: 보호자 동반 수업 (수중 동반 또는 대기실)</li>
    <li>만 7세 이상: 대기실 대기 가능</li>
  </ul>

  <div class="warn">
    <b>⚠️ 책임 제한 사항</b><br/>
    안전수칙을 준수하지 않은 결과 발생한 사고에 대한 책임은 회원(보호자)에게 있으며, 센터는 통상적 안전관리 의무에 한하여 책임을 부담합니다.
  </div>

  <div class="consent-item">
    <div class="head"><span class="box">${check(fd.agree_safety)}</span> 본인은 상기 안전 · 입수 관련 사항을 이해하였으며, 이에 동의합니다.</div>
  </div>

  ${signBlock("회원(보호자)")}
  ${pageFooter}
</div>

<!-- ================== PAGE 4: 수중재활 안전 · 응급처치 동의서 ================== -->
<div class="page">
  ${pageHeader(4, "수중재활 안전 · 응급처치 동의서")}
  <h1 class="doc-title">수중재활 안전 및 응급처치 동의서</h1>

  <h2 class="sec">1. 기저질환 · 복용 약물 · 알레르기 기재</h2>
  <table class="info">
    <tr><th>기저질환</th><td>${fd.health_note || "없음"}</td></tr>
    <tr><th>복용 약물</th><td>${fd.medications || "없음"}</td></tr>
    <tr><th>알레르기</th><td>${fd.allergies || "없음"}</td></tr>
    <tr><th>응급 연락처</th><td>${fd.emergency_contact || "-"} (${fd.emergency_relation || "-"})</td></tr>
  </table>

  <h2 class="sec">2. 수중재활 본인 위험 인지</h2>
  <ul>
    <li>수중 환경은 저산소증, 어지럼증, 하지 피로감, 혼미, 익사 등의 상황이 발생할 수 있습니다.</li>
    <li>심혈관 질환, 공황장애, 간질, 임산 예정자, 최근 수술력 보유자는 사전 고지 및 의사 소견 서를 제출해 주십시오.</li>
    <li>강사의 감시 하에도 돌발 상황은 발생할 수 있으며, 보호자는 이를 인지하고 동의합니다.</li>
  </ul>

  <h2 class="sec">3. 응급처치 및 이송 동의</h2>
  <p>응급상황 발생 시 센터는 아래와 같은 표준 응급처치를 진행합니다.</p>
  <ul>
    <li>강사 · 직원에 의한 1차 응급처치 (심폐소생술 CPR, 기도 확보, 충분한 보온 등)</li>
    <li>119 신고 및 인근 응급의료센터로의 이송 (증상에 따라 자가 이송 또는 구급차 호출)</li>
    <li>보호자 즉시 통지 및 상황 실시간 공유</li>
  </ul>

  <div class="risk">
    <b>🚨 응급처치 이송 동의</b><br/>
    응급 상황이 발생하여 보호자와의 즉시 연락이 어려울 경우, 센터가 임의로 구급차를 호출하여 응급의료센터로 이송하는 것에 동의합니다. 발생하는 응급이송 비용은 회원(보호자) 부담을 원칙으로 합니다.
  </div>

  <div class="consent-item">
    <div class="head"><span class="box">${check(fd.agree_aqua_risk)}</span> 본인은 수중재활의 위험을 인지하고 이에 동의합니다.</div>
  </div>
  <div class="consent-item">
    <div class="head"><span class="box">${check(fd.agree_emergency)}</span> 응급상황 발생 시 센터의 응급처치 및 구급차 이송 방침에 동의합니다.</div>
  </div>

  ${signBlock("회원(보호자)")}
  ${pageFooter}
</div>

</body></html>`;
  }

  // v3.20.22: 계약서를 자체 완결형 HTML 문서로 렌더링 (Storage 저장용)
  function renderContractHtmlForStorage(ed: any): string {
    const fd = ed?.form_data || {};
    const title = ed?.title || typeLabel(ed?.contract_type);
    // v3.20.30: 대상자 + form_data 자동 치환 적용
    const filledBody = applyTemplateVars(ed?.body || "", ed);
    const bodyHtml = filledBody.replace(/</g, "&lt;").replace(/\n/g, "<br/>");
    // v3.20.31: 서명 이미지 - inline-block, height:35px 수준으로 정돈 (인) 오른쪽 깔끔하게 정렬
    const signImg = ed?.signature
      ? `<img class="sign-inline" src="${ed.signature}" alt="sign"/>`
      : "";
    const sealHtml = ed?.counter_signature === "seal"
      ? `<img class="seal-inline" src="/center_seal.png" alt="seal"/>`
      : "";
    return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/>
<title>${title}</title>
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&family=Nanum+Gothic:wght@400;700;800&display=swap" rel="stylesheet"/>
<style>
  /* v3.20.30: A4 1페이지 완전 압축 + 서명란 오버레이 (인) 자리 고정 */
  @page { size: A4; margin: 6mm 8mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Nanum Gothic', sans-serif;
    font-size: 8.5pt; line-height: 1.3; color: #111;
    margin: 0; padding: 0; word-break: keep-all;
    letter-spacing: -0.03em;
  }
  h1 { text-align: center; font-size: 13pt; border-bottom: 1.5px solid #0284c7; padding-bottom: 2px; margin: 0 0 2mm 0; font-weight: 700; line-height: 1.15; }
  h2 { font-size: 9.5pt; margin: 2px 0 1px 0; padding: 0; line-height: 1.2; }
  h3 { font-size: 9pt; margin: 2px 0 1px 0; padding: 0; }
  .meta { display: flex; justify-content: space-between; font-size: 7.5pt; color: #475569; margin-bottom: 1.5mm; }
  .body { white-space: pre-wrap; letter-spacing: -0.03em; font-size: 8.5pt; line-height: 1.3; }
  .body p, .body div, .body li, .body ul, .body ol {
    margin: 0; margin-bottom: 1px; padding: 0; line-height: 1.3;
  }
  .body br { line-height: 1; }
  .sign {
    display: flex; justify-content: space-around;
    margin-top: 2.5mm; padding: 3px 4px;
    border-top: 1px solid #cbd5e1;
    page-break-inside: avoid !important; break-inside: avoid !important;
  }
  .sign-box {
    text-align: center; font-size: 8pt; line-height: 1.25; padding: 3px 5px;
    position: relative;
  }
  /* v3.20.31: 서명 inline-block 레이아웃 - (인) 오른쪽 자리에 자연스럽게 정렬 */
  .sign-name-line {
    display: inline-flex; align-items: center; gap: 4px;
    line-height: 1; white-space: nowrap;
  }
  .sign-in-text { color: #94a3b8; font-size: 7.5pt; }
  .sign-inline {
    display: inline-block; vertical-align: middle;
    height: 35px; max-width: 24mm;
    object-fit: contain; mix-blend-mode: multiply;
    margin-left: 2px;
  }
  .seal-inline {
    display: inline-block; vertical-align: middle;
    height: 14mm; width: 14mm;
    object-fit: contain; margin-left: 2px;
  }
  .footer { text-align: right; font-size: 7pt; color: #64748b; margin-top: 1.5mm; }
  @media print { .no-print { display: none !important; } }
</style></head><body>
<h1>${title}</h1>
<div class="meta"><span>대상: <b>${ed.subject_name || "-"}</b></span><span>계약일: <b>${ed.contract_date}</b></span><span>자동연장: <b>${ed.auto_renew !== false ? "O (" + (ed.renew_period_months || 12) + "개월 단위)" : "X"}</b></span></div>
<div class="body">${bodyHtml}</div>
<div class="sign">
  <div class="sign-box">
    <div>${ed?.subject_kind === "staff" ? "근로자" : "회원(보호자)"}: <span class="sign-name-line"><b>${ed?.subject_name || "-"}</b><span class="sign-in-text">(인/서명)</span>${signImg}</span></div>
    <div>연락처: ${fd?.worker_phone || fd?.phone || "-"}</div>
  </div>
  <div class="sign-box">
    <div>사업자: <b>${fd?.employer_name || "위례아쿠수중운동센터"}</b></div>
    <div>대표자: <span class="sign-name-line"><b>${fd?.employer_ceo || "하유정"}</b><span class="sign-in-text">(인)</span>${sealHtml}</span></div>
  </div>
</div>
<div class="footer">생성일: ${new Date().toISOString().slice(0,10)} · 위례아쿠수중운동센터 · 사업자등록번호 680-04-03475</div>
</body></html>`;
  }

  // v3.20.22: PDF Storage 자동 업로드 (HTML 스냅샷 → 서명 완료 시 호출)
  async function generateAndUploadPdf(contractId: string) {
    try {
      // 계약서 HTML 스냅샷을 base64 PDF 로 변환하려면 외부 툴이 필요.
      // 이단계에서는 계약서 HTML 본문을 .html 로 저장 (Storage 버킷 documents)
      const html = renderContractHtmlForStorage(editing);
      const blob = new Blob([html], { type: "text/html; charset=utf-8" });
      const safeName = (editing.subject_name || "contract").replace(/[^a-zA-Z0-9가-힣._-]/g, "_");
      const typeLabelText = typeLabel(editing.contract_type).replace(/^[^ ]+ /, "");
      const filePath = `contracts/${contractId}/${safeName}_${typeLabelText}_${editing.contract_date}_${Date.now()}.html`;

      const { error: upErr } = await supabase.storage.from("documents")
        .upload(filePath, blob, { upsert: true, contentType: "text/html; charset=utf-8" });
      if (upErr) throw upErr;

      const { data: signed } = await supabase.storage.from("documents").createSignedUrl(filePath, 60 * 60 * 24 * 365);

      await supabase.from("contracts").update({
        pdf_storage_path: filePath,
        pdf_public_url: signed?.signedUrl || null,
        pdf_generated_at: new Date().toISOString(),
      }).eq("id", contractId);

      return { path: filePath, url: signed?.signedUrl };
    } catch (e: any) {
      console.warn("generateAndUploadPdf failed:", e);
      return null;
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-10">
      <style jsx global>{`
        /* v3.20.23: Pretendard · Noto Sans KR · Nanum Gothic 고딕 웹폰트 (화면/인쇄 통일) */
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css');
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&family=Nanum+Gothic:wght@400;700;800&display=swap');

        /* 계약서 본문 – 화면용 (편집 단계) */
        .contract-body {
          white-space: pre-wrap;
          font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Nanum Gothic', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          line-height: 1.55;
          font-size: 12.5px;
          letter-spacing: -0.015em;
          color: #111;
          background: #fff;
          word-break: keep-all;
          text-align: justify;
        }
        .contract-body h1, .contract-body h2, .contract-body h3 {
          font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', sans-serif;
          font-weight: 700;
        }
        .contract-sign-area { page-break-inside: avoid; break-inside: avoid; }

        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff !important; font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Nanum Gothic', sans-serif !important; }
          main { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }

          /* 모달 배경 제거 */
          .fixed.inset-0 { position: static !important; background: #fff !important; padding: 0 !important; }
          .fixed.inset-0 > div { max-width: 100% !important; width: 100% !important; max-height: none !important; box-shadow: none !important; border-radius: 0 !important; overflow: visible !important; }
          .fixed.inset-0 > div > div { max-height: none !important; overflow: visible !important; }
          .fixed.inset-0 .bg-gradient-to-r,
          .fixed.inset-0 .border-b { border: none !important; background: transparent !important; }

          /* v3.20.30: A4 1페이지 완전 압축 – 6mm 8mm 마진 + line-height 1.3 */
          @page { size: A4; margin: 6mm 8mm; }

          html, body { font-size: 8.5pt !important; line-height: 1.3 !important; letter-spacing: -0.03em !important; }

          .contract-body {
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            font-size: 8.5pt !important;
            line-height: 1.35 !important;
            min-height: auto !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            resize: none;
            letter-spacing: -0.03em !important;
            page-break-inside: auto;
            word-break: keep-all;
            font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Nanum Gothic', sans-serif !important;
          }
          /* v3.20.25: 모든 블록 요소 margin/padding을 이전의 50%로 압축 */
          .contract-body p,
          .contract-body div,
          .contract-body li,
          .contract-body ul,
          .contract-body ol {
            margin: 0 !important;
            margin-bottom: 2px !important;
            padding: 0 !important;
            padding-bottom: 0 !important;
            line-height: 1.35 !important;
          }
          .contract-body h1 {
            font-size: 14pt !important;
            margin: 0 0 3px 0 !important;
            padding: 0 0 2px 0 !important;
            line-height: 1.2 !important;
          }
          .contract-body h2 {
            font-size: 10pt !important;
            margin: 3px 0 1px 0 !important;
            padding: 0 !important;
            line-height: 1.25 !important;
          }
          .contract-body h3 {
            font-size: 9pt !important;
            margin: 2px 0 1px 0 !important;
            padding: 0 !important;
          }
          .contract-body br { line-height: 1 !important; }
          .contract-body p,
          .contract-body div,
          .contract-body li { margin: 0 !important; padding: 0 !important; break-inside: auto; }
          .contract-body br { line-height: 1.2 !important; }

          /* 모달 헤더 제목 */
          h1 { font-size: 12pt !important; margin: 0 0 4px 0 !important; }
          h2 { font-size: 10pt !important; margin: 4px 0 2px 0 !important; }
          h3 { font-size: 9pt !important; margin: 3px 0 1px 0 !important; }

          /* v3.20.25: 서명·직인 영역 – A4 1장 최하단 안에 무조건 수용 (padding 4~6px) */
          .contract-sign-area {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-before: auto !important;
            margin-top: 3mm !important;
            padding: 4px 6px !important;
            font-size: 8pt !important;
            line-height: 1.3 !important;
            gap: 4px !important;
          }
          .contract-sign-area > * { padding: 4px 6px !important; margin: 0 !important; }
          .contract-sign-area img {
            max-width: 30mm !important;
            max-height: 45px !important;
            object-fit: contain !important;
          }

          /* v3.20.25: 모달 내부 입력 폼의 서명·직인 박스를 인쇄 시 완전 숨김 */
          .no-print, .no-print *,
          [data-noprint], [data-noprint] * {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            width: 0 !important;
            overflow: hidden !important;
          }
          /* 입력용 폼 요소는 무조건 미포함 (input/textarea/select 자체도 숨김) */
          input:not(.print-keep),
          textarea:not(.print-keep),
          select:not(.print-keep) {
            display: none !important;
          }

          /* 모든 grid/flex 여백 축소 */
          .fixed.inset-0 .space-y-2 > * + * { margin-top: 2mm !important; }
          .fixed.inset-0 .space-y-3 > * + * { margin-top: 3mm !important; }
          .fixed.inset-0 .space-y-4 > * + * { margin-top: 3mm !important; }
          .fixed.inset-0 .gap-2 { gap: 2mm !important; }
          .fixed.inset-0 .gap-3 { gap: 3mm !important; }
          .fixed.inset-0 .p-3, .fixed.inset-0 .p-4, .fixed.inset-0 .p-5 { padding: 2mm !important; }
          .fixed.inset-0 .py-3, .fixed.inset-0 .py-4 { padding-top: 2mm !important; padding-bottom: 2mm !important; }
          .fixed.inset-0 .my-2, .fixed.inset-0 .my-3, .fixed.inset-0 .my-4 { margin-top: 2mm !important; margin-bottom: 2mm !important; }
          .fixed.inset-0 .mt-4, .fixed.inset-0 .mt-6, .fixed.inset-0 .mt-8 { margin-top: 3mm !important; }

          input, textarea, select, button, label { visibility: visible; }
          .no-print, .no-print * { display: none !important; }

          .contract-print { border: none !important; padding: 0 !important; }
        }
        .print-only { display: none; }

        /* 화면에서 계약서로 보기 모드 (A4 프리뷰) */
        .contract-preview-a4 {
          font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Nanum Gothic', sans-serif !important;
          font-size: 12.5px !important;
          line-height: 1.55 !important;
        }
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
                    <button onClick={() => {
                      // ✅ v3.39.3: 재오픈 시 form_data 정규화 (빈칸 버그 방지)
                      const safe = { ...c };
                      const fd = c.form_data || {};
                      // form_data가 문자열(JSON)로 저장된 경우 파싱
                      const fdObj = typeof fd === "string" ? (() => { try { return JSON.parse(fd); } catch { return {}; } })() : fd;
                      safe.form_data = { ...(fdObj || {}) };
                      // 지상재활/수중재활 계약서: 회원권/기간 필드 자동 채움 (누락된 값만)
                      if (c.contract_type === "ground_care" || c.contract_type === "member_unified") {
                        if (!safe.form_data.plan_name && safe.form_data.plan) safe.form_data.plan_name = safe.form_data.plan;
                        if (!safe.form_data.sessions && safe.form_data.total_sessions) safe.form_data.sessions = safe.form_data.total_sessions;
                        // 회당 단가 역산
                        if (!safe.form_data.per_session_amount && safe.form_data.total_amount && safe.form_data.sessions) {
                          safe.form_data.per_session_amount = Math.round(Number(safe.form_data.total_amount) / Math.max(1, Number(safe.form_data.sessions)));
                        }
                        // 총 금액 역산
                        if (!safe.form_data.total_amount && safe.form_data.per_session_amount && safe.form_data.sessions) {
                          safe.form_data.total_amount = Number(safe.form_data.per_session_amount) * Number(safe.form_data.sessions);
                        }
                        // period_start 기본값
                        if (!safe.form_data.period_start) safe.form_data.period_start = c.contract_date || c.start_date || "";
                        // valid_months 기본값 (회수 기반 자동 매핑)
                        if (!safe.form_data.valid_months) {
                          const sess = Number(safe.form_data.sessions || 0);
                          safe.form_data.valid_months = sess <= 5 ? 2 : sess <= 10 ? 3 : sess <= 20 ? 6 : 3;
                        }
                        // period_end 자동 계산 (누락 시)
                        if (!safe.form_data.period_end && safe.form_data.period_start && safe.form_data.valid_months) {
                          try {
                            const d = new Date(safe.form_data.period_start);
                            d.setMonth(d.getMonth() + Number(safe.form_data.valid_months));
                            d.setDate(d.getDate() - 1);
                            const y = d.getFullYear();
                            const m = String(d.getMonth() + 1).padStart(2, "0");
                            const dd = String(d.getDate()).padStart(2, "0");
                            safe.form_data.period_end = `${y}-${m}-${dd}`;
                          } catch {}
                        }
                        // programs 배열 기본값 (ground_care)
                        if (c.contract_type === "ground_care" && !Array.isArray(safe.form_data.programs)) {
                          safe.form_data.programs = [
                            { key: "movement", label: "1:1 맞춤 운동재활", checked: false },
                            { key: "posture", label: "체형교정", checked: false },
                            { key: "device", label: "디바이스 케어 (근막·소닉)", checked: false },
                          ];
                        }
                      }
                      console.log("[v3.39.3] 계약서 재오픈:", c.id, "form_data 정규화 완료", safe.form_data);
                      setEditing(safe);
                    }} className="text-xs text-emerald-600 hover:text-emerald-800 mr-2">보기/편집</button>
      {/* ✅ v3.60.0: 링크 기반 전자서명 — 상담신청폼처럼 링크 전달 → 상대방이 직접 작성·서명 */}
      <div className="no-print bg-blue-50/70 border border-blue-100 rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Link2 className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-bold text-slate-800">전자서명 링크 보내기</span>
          <span className="text-[11px] text-slate-500">링크를 전달하면 상대방이 본문 확인 → 동의 체크 → 서명까지 직접 완료합니다</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {CONTRACT_TYPES.filter(t => t.cat !== "other").map(t => (
            <button key={t.v} onClick={() => copySignLink(t.v)}
              className={`text-xs px-3 py-1.5 rounded-full border bg-white hover:shadow-sm transition-all ${t.color}`}>
              🔗 {t.l.replace(/^[^ ]+ /, "")}
            </button>
          ))}
        </div>
      </div>

                    <button onClick={() => copySignLink(c.contract_type)} className="text-xs text-blue-500 hover:text-blue-700 mr-2" title="전자서명 링크 복사">
                      <Link2 className="w-3.5 h-3.5 inline" /> 링크
                    </button>
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

              {/* v3.20.36: 회원/직원 검색 셀렉터 - 정규/체험/상담 모두 노출 · lead 클릭 시 form_data 자동 매핑 */}
              <div className="no-print grid grid-cols-1 md:grid-cols-2 gap-2">
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">대상자 검색 (클릭 시 자동 입력)</span>
                  <select value={editing.subject_id || editing._lead_id || ""}
                    onChange={e => {
                      const val = e.target.value;
                      const list = editing.subject_kind === "staff" ? staffList : members;
                      const found = list.find((x: any) => x.id === val);
                      if (found) {
                        const fd = { ...(editing.form_data || {}) };
                        if (editing.subject_kind === "staff") {
                          fd.worker_phone = found.phone || fd.worker_phone;
                          fd.staff_name = found.name || fd.staff_name;
                          fd.staff_role = found.role || fd.staff_role;
                          fd.hire_date = found.hire_date || fd.hire_date;
                        } else {
                          // v3.20.36: 정규 회원 또는 leads_inbox 리드 상관없이 form_data 모든 필드 병합
                          fd.member_name = found.name || fd.member_name;
                          fd.phone = found.phone || fd.phone;
                          fd.birth = found.birth || fd.birth;
                          fd.birth_date = found.birth || fd.birth_date;
                          fd.guardian = found.guardian_name || fd.guardian;
                          fd.guardian_name = found.guardian_name || fd.guardian_name;
                          fd.guardian_relation = found.guardian_relation || fd.guardian_relation;
                          fd.address = found.address || fd.address;
                          fd.member_type = found.member_type || fd.member_type;
                        }
                        setEditing({
                          ...editing,
                          subject_id: found.source_type === "lead" ? "" : found.id,
                          _lead_id: found.source_type === "lead" ? found.lead_id : null,
                          subject_name: found.name,
                          title: buildContractTitle(editing.contract_type, found.name, editing.contract_date),
                          form_data: fd,
                        });
                      } else {
                        setEditing({ ...editing, subject_id: "", _lead_id: null });
                      }
                    }}
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm">
                    <option value="">— {editing.subject_kind === "staff" ? "직원" : "회원 (정규/체험/상담대기)"} 선택 —</option>
                    {(editing.subject_kind === "staff" ? staffList : members).map((x: any) => {
                      const badge = x._badge ? `[${x._badge}] ` : "";
                      return <option key={x.id} value={x.id}>{badge}{x.name}{x.phone ? ` (${x.phone})` : ""}</option>;
                    })}
                  </select>
                </label>
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">대상자명 *</span>
                  <input type="text" value={editing.subject_name}
                    onChange={e => setEditing({ ...editing, subject_name: e.target.value })}
                    placeholder="회원명 또는 직원명"
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                </label>
              </div>
              <div className="no-print">
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
                    onChange={e => {
                      const newDate = e.target.value;
                      // ✅ v3.39.2: 계약일 변경 시 수중/지상 계약서 title 자동 갱신
                      const shouldAutoRename = editing.contract_type === "member_unified" || editing.contract_type === "ground_care";
                      const newTitle = shouldAutoRename
                        ? buildContractTitle(editing.contract_type, editing.subject_name || "", newDate)
                        : editing.title;
                      setEditing({ ...editing, contract_date: newDate, title: newTitle });
                    }}
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

              {/* v3.20.22: 자동연장 UI */}
              <div className="no-print border-2 border-green-100 rounded-lg p-3 bg-green-50/40">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={editing.auto_renew !== false}
                    onChange={e => setEditing({ ...editing, auto_renew: e.target.checked })}
                    className="w-4 h-4" />
                  <span className="font-bold text-green-800">🔄 자동연장 (해지 전까지 계속 연장)</span>
                </label>
                {editing.auto_renew !== false && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">연장 주기 (개월)</span>
                      <input type="number" value={editing.renew_period_months || 12} min={1} max={60}
                        onChange={e => setEditing({ ...editing, renew_period_months: Number(e.target.value) })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                    <div className="text-xs text-green-700 flex items-end">
                      💡 종료일 도달 시 자동으로 {editing.renew_period_months || 12}개월 연장됩니다.
                    </div>
                  </div>
                )}
                {editing.id && editing.auto_renew !== false && (
                  <button type="button" onClick={() => {
                    const reason = prompt("해지 사유를 입력하세요 (필수)");
                    if (!reason) return;
                    setEditing({ ...editing, auto_renew: false,
                      terminated_at: new Date().toISOString(),
                      termination_reason: reason,
                      status: "terminated",
                    });
                    alert("✅ 해지 처리되었습니다. 저장 버튼을 눌러 확정해 주세요.");
                  }} className="mt-2 text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200">
                    🗑️ 계약 해지
                  </button>
                )}
                {editing.terminated_at && (
                  <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                    ⛔ 해지일: {new Date(editing.terminated_at).toLocaleDateString()} · 사유: {editing.termination_reason || "-"}
                  </div>
                )}
              </div>

              {/* 인쇄용 헤더 */}
              <div className="print-only mb-3 text-center">
                <div className="text-xl font-bold mb-1">{editing.title}</div>
                <div className="text-xs text-gray-600">아쿠수중운동센터 · 계약일 {editing.contract_date}</div>
                <hr className="my-2 border-black" />
              </div>

              {/* ✅ v3.20.15: 상담신청서처럼 필드별 입력폼 (근로계약서) */}
              {editing.contract_type === "employment" && editing.form_data && (
                <div className="no-print border-2 border-blue-100 rounded-lg p-3 bg-blue-50/30 space-y-2">
                  <div className="text-xs font-bold text-blue-800 mb-2">📝 근로계약서 필드 입력</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">근무장소</span>
                      <input type="text" value={editing.form_data.workplace || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, workplace: e.target.value } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">연락처 (근로자)</span>
                      <input type="tel" value={editing.form_data.worker_phone || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, worker_phone: e.target.value } })}
                        placeholder="010-0000-0000"
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                  </div>
                  <label className="text-xs block">
                    <span className="text-gray-600 font-semibold">업무의 내용</span>
                    <textarea value={editing.form_data.duty || ""} rows={2}
                      onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, duty: e.target.value } })}
                      className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">평일 근무시간</span>
                      <input type="text" value={editing.form_data.weekday_hours || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, weekday_hours: e.target.value } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">토요일 근무시간</span>
                      <input type="text" value={editing.form_data.saturday_hours || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, saturday_hours: e.target.value } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">월급 (원)</span>
                      <input type="number" value={editing.form_data.base_salary || 0} step={100000}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, base_salary: Number(e.target.value) } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm text-right" />
                    </label>
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">식대 (원)</span>
                      <input type="number" value={editing.form_data.meal_allowance || 0} step={10000}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, meal_allowance: Number(e.target.value) } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm text-right" />
                    </label>
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">교통비 (원)</span>
                      <input type="number" value={editing.form_data.transport_allowance || 0} step={10000}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, transport_allowance: Number(e.target.value) } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm text-right" />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">지급일 (매월)</span>
                      <input type="number" value={editing.form_data.pay_day || 15} min={1} max={31}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, pay_day: Number(e.target.value) } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">지급 방법</span>
                      <input type="text" value={editing.form_data.pay_method || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, pay_method: e.target.value } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-3 pt-1 text-xs">
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={!!editing.form_data.insurance_employment}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, insurance_employment: e.target.checked } })} />
                      고용보험
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={!!editing.form_data.insurance_industrial}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, insurance_industrial: e.target.checked } })} />
                      산재보험
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={!!editing.form_data.insurance_pension}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, insurance_pension: e.target.checked } })} />
                      국민연금
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={!!editing.form_data.insurance_health}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, insurance_health: e.target.checked } })} />
                      건강보험
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">사업체명</span>
                      <input type="text" value={editing.form_data.employer_name || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, employer_name: e.target.value } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                    <label className="text-xs">
                      <span className="text-gray-600 font-semibold">대표자</span>
                      <input type="text" value={editing.form_data.employer_ceo || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, employer_ceo: e.target.value } })}
                        className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                    </label>
                  </div>
                  <button type="button" onClick={() => {
                    const fd = editing.form_data;
                    const filled = (TEMPLATES.employment || "")
                      .replace(/\{\{name\}\}/g, editing.subject_name || "")
                      .replace(/\{\{start_date\}\}/g, editing.start_date || editing.contract_date || "")
                      .replace(/\{\{base_salary\}\}/g, Number(fd.base_salary || 0).toLocaleString())
                      .replace(/\{\{phone\}\}/g, fd.worker_phone || "")
                      .replace(/\{\{contract_date\}\}/g, editing.contract_date || "");
                    setEditing({ ...editing, body: filled });
                    alert("✅ 필드 값이 계약서 본문에 반영되었습니다. 아래 본문을 확인 후 필요시 추가 편집하세요.");
                  }} className="w-full py-2 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600 font-semibold">
                    🔄 필드 값 계약서 본문에 적용
                  </button>
                </div>
              )}

              {/* v3.20.21: NDA 비밀유지서약서 자동 폼 */}
              {editing.contract_type === "nda" && editing.form_data && (
                <div className="no-print border-2 border-purple-100 rounded-lg p-3 bg-purple-50/30 space-y-2">
                  <div className="text-xs font-bold text-purple-800 mb-2">🔒 비밀유지서약서(NDA) 필드</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label className="text-xs"><span className="text-gray-600 font-semibold">근로자 연락처</span>
                      <input type="tel" value={editing.form_data.worker_phone || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, worker_phone: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-gray-600 font-semibold">유지 기간(년)</span>
                      <input type="number" value={editing.form_data.duration_years || 3}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, duration_years: Number(e.target.value) } })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                  </div>
                  <label className="text-xs block"><span className="text-gray-600 font-semibold">비밀정보 범위</span>
                    <textarea value={editing.form_data.confidential_scope || ""} rows={2}
                      onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, confidential_scope: e.target.value } })}
                      className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                  </label>
                  <label className="text-xs block"><span className="text-gray-600 font-semibold">위반 시 제재</span>
                    <input type="text" value={editing.form_data.penalty || ""}
                      onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, penalty: e.target.value } })}
                      className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                  </label>
                </div>
              )}

              {/* v3.20.21: 사직서 자동 폼 */}
              {editing.contract_type === "resignation" && editing.form_data && (
                <div className="no-print border-2 border-orange-100 rounded-lg p-3 bg-orange-50/30 space-y-2">
                  <div className="text-xs font-bold text-orange-800 mb-2">📝 사직서 필드</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <label className="text-xs"><span className="text-gray-600 font-semibold">연락처</span>
                      <input type="tel" value={editing.form_data.worker_phone || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, worker_phone: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-gray-600 font-semibold">생년월일</span>
                      <input type="date" value={editing.form_data.birth_date || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, birth_date: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-gray-600 font-semibold">입사일</span>
                      <input type="date" value={editing.form_data.hire_date || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, hire_date: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-gray-600 font-semibold">마지막 근무일</span>
                      <input type="date" value={editing.form_data.last_work_date || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, last_work_date: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                    <label className="text-xs md:col-span-2"><span className="text-gray-600 font-semibold">퇴사 사유</span>
                      <input type="text" value={editing.form_data.reason || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, reason: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                  </div>
                  <label className="text-xs block"><span className="text-gray-600 font-semibold">인수인계 계획</span>
                    <textarea value={editing.form_data.handover_notes || ""} rows={2}
                      onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, handover_notes: e.target.value } })}
                      className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                  </label>
                </div>
              )}

              {/* v3.20.21: 시말서 자동 폼 */}
              {editing.contract_type === "incident" && editing.form_data && (
                <div className="no-print border-2 border-red-100 rounded-lg p-3 bg-red-50/30 space-y-2">
                  <div className="text-xs font-bold text-red-800 mb-2">⚠️ 시말서 필드</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label className="text-xs"><span className="text-gray-600 font-semibold">연락처</span>
                      <input type="tel" value={editing.form_data.worker_phone || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, worker_phone: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-gray-600 font-semibold">사건 발생일</span>
                      <input type="date" value={editing.form_data.incident_date || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, incident_date: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                    </label>
                  </div>
                  <label className="text-xs block"><span className="text-gray-600 font-semibold">사건 경위</span>
                    <textarea value={editing.form_data.incident_desc || ""} rows={3}
                      onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, incident_desc: e.target.value } })}
                      className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                  </label>
                  <label className="text-xs block"><span className="text-gray-600 font-semibold">원인 및 반성</span>
                    <textarea value={editing.form_data.cause || ""} rows={2}
                      onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, cause: e.target.value } })}
                      className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                  </label>
                  <label className="text-xs block"><span className="text-gray-600 font-semibold">서약 사항</span>
                    <input type="text" value={editing.form_data.pledge || ""}
                      onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, pledge: e.target.value } })}
                      className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                  </label>
                </div>
              )}

              {/* ✨ v3.33.0: 통합 회원이용계약서(4페이지) - 요금제 라디오 + 기본정보 + 4페이지 동의 */}
              {editing.contract_type === "member_unified" && editing.form_data && (
                <div className="no-print border-2 border-purple-200 rounded-2xl p-4 bg-gradient-to-br from-purple-50 via-fuchsia-50/40 to-blue-50/40 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-purple-900">
                    <span className="text-lg">📋</span> 통합 회원이용계약서
                    <span className="text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-full ml-1">4페이지 자동 구성</span>
                  </div>

                  {/* ✅ v3.39.3: 수중재활 계약서 회원권 UI를 지상재활과 동일한 카드형으로 통일 */}
                  <div className="bg-white rounded-xl p-3 border border-purple-200">
                    <div className="text-xs font-bold text-slate-700 mb-2">🎯 회원권 선택 (필수) <span className="text-[10px] text-slate-500 font-normal">/settings/catalog에 등록된 수중재활 회원권 자동 로드 · 수동 편집 가능</span></div>

                    <select
                      value={editing.form_data._selected_plan_id || ""}
                      onChange={(e) => {
                        const planId = e.target.value;
                        if (!planId) {
                          setEditing({ ...editing, form_data: { ...editing.form_data, _selected_plan_id: "" } });
                          return;
                        }
                        const pl = plans.find((pp: any) => pp.id === planId);
                        if (!pl) return;
                        const sess = Number(pl.total_sessions || 4);
                        const totalAmt = Number(pl.price || 0);
                        const perAmt = sess > 0 ? Math.round(totalAmt / sess) : 0;
                        // 회원권별 권장 유효기간 자동 매핑
                        const vm = sess <= 5 ? 2 : sess <= 10 ? 3 : sess <= 20 ? 6 : 12;
                        setEditing({
                          ...editing,
                          form_data: {
                            ...editing.form_data,
                            _selected_plan_id: planId,
                            plan: pl.name || "",
                            plan_name: pl.name || "",
                            per_session_amount: perAmt,
                            sessions: sess,
                            sessions_per_week: pl.sessions_per_week || (pl.name?.includes("주2") ? 2 : 1),
                            total_amount: totalAmt,
                            valid_months: vm,
                          }
                        });
                      }}
                      className="w-full px-3 py-2 border-2 border-purple-300 rounded-lg text-sm bg-white focus:border-purple-500 focus:outline-none mb-2">
                      <option value="">-- 등록된 수중재활 회원권 선택 --</option>
                      {plans.filter((p: any) => (p.category || "aqua") === "aqua").map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {Number(p.total_sessions || 0)}회 · ₩{Number(p.price || 0).toLocaleString()}
                        </option>
                      ))}
                    </select>
                    <div className="text-[10px] text-slate-500 mb-3">
                      💡 회원권 선택 시 회원권명·회당 단가·총 회수·결제금액·유효기간이 자동 바인딩됩니다. 아래 입력란에서 수동 수정 가능합니다.
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">회원권명</span>
                        <input type="text" value={editing.form_data.plan_name || editing.form_data.plan || ""}
                          onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, plan_name: e.target.value, plan: e.target.value } })}
                          placeholder="예: STANDARD / 주2회권 / VIP"
                          className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                      </label>
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">총 회수</span>
                        <input type="number" min={1} value={editing.form_data.sessions || 0}
                          onChange={e => {
                            const sess = Number(e.target.value) || 0;
                            const perAmt = Number(editing.form_data.per_session_amount || 0);
                            const vm = sess <= 5 ? 2 : sess <= 10 ? 3 : sess <= 20 ? 6 : 12;
                            setEditing({ ...editing, form_data: { ...editing.form_data, sessions: sess, total_amount: perAmt * sess, valid_months: vm } });
                          }}
                          className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                      </label>
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">회당 단가 ₩</span>
                        <input type="number" min={0} step={1000} value={editing.form_data.per_session_amount || 0}
                          onChange={e => {
                            const perAmt = Number(e.target.value) || 0;
                            const sess = Number(editing.form_data.sessions || 0);
                            setEditing({ ...editing, form_data: { ...editing.form_data, per_session_amount: perAmt, total_amount: perAmt * sess } });
                          }}
                          className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                      </label>
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">총 결제금액</span>
                        <input type="number" min={0} step={1000} value={editing.form_data.total_amount || 0}
                          onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, total_amount: Number(e.target.value) || 0 } })}
                          className="w-full mt-1 px-2 py-1.5 border-2 border-purple-300 rounded-lg text-sm font-bold text-purple-700 bg-white" />
                      </label>
                    </div>
                  </div>

                  {/* ✅ v3.39.3: 유효기간 · 계약일 · 만료일 자동 계산 (지상재활과 동일 로직) */}
                  <div className="bg-white rounded-xl p-3 border border-purple-200">
                    <div className="text-xs font-bold text-slate-700 mb-2">📅 이용 기한 (계약일 + 유효기간 = 만료일 자동 계산)</div>
                    <div className="text-[10px] text-slate-500 mb-2">💡 회원권별 권장 유효기간: 5회권 2개월 · 10회권 3개월 · 20회권 6개월 (자동 매핑, 수동 수정 가능)</div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">계약일 (시작일)</span>
                        <input type="date" value={editing.form_data.period_start || ""}
                          onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, period_start: e.target.value } })}
                          className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                      </label>
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">유효기간 (개월)</span>
                        <select value={editing.form_data.valid_months || 3}
                          onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, valid_months: Number(e.target.value) } })}
                          className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm">
                          {[1,2,3,4,5,6,9,12].map(m => (
                            <option key={m} value={m}>{m}개월</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">만료일 (자동)</span>
                        <div className="w-full mt-1 px-2 py-1.5 border-2 border-purple-300 rounded-lg text-sm font-bold text-purple-700 bg-purple-50">
                          {(() => {
                            const startStr = editing.form_data.period_start;
                            const months = Number(editing.form_data.valid_months) || 3;
                            if (!startStr) return "-";
                            try {
                              const d = new Date(startStr);
                              if (isNaN(d.getTime())) return "-";
                              d.setMonth(d.getMonth() + months);
                              d.setDate(d.getDate() - 1);
                              const y = d.getFullYear();
                              const m = String(d.getMonth() + 1).padStart(2, "0");
                              const dd = String(d.getDate()).padStart(2, "0");
                              return `${y}-${m}-${dd}`;
                            } catch { return "-"; }
                          })()}
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* 계약 기간 · 회수 · 금액 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <label className="text-xs"><span className="text-slate-600 font-semibold">계약 시작일</span>
                      <input type="date" value={editing.form_data.period_start || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, period_start: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-slate-600 font-semibold">계약 종료일</span>
                      <input type="date" value={editing.form_data.period_end || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, period_end: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-slate-600 font-semibold">총 회수</span>
                      <input type="number" min={1} max={100} value={editing.form_data.sessions || 4}
                        onChange={e => {
                          const sess = Number(e.target.value) || 0;
                          const perAmt = Number(editing.form_data.per_session_amount || 130000);
                          setEditing({ ...editing, form_data: { ...editing.form_data, sessions: sess, total_amount: perAmt * sess } });
                        }}
                        className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-slate-600 font-semibold">총 결제금액</span>
                      <div className="w-full mt-1 px-2 py-1.5 border-2 border-purple-300 rounded-lg text-sm font-bold text-purple-700 bg-white">
                        ₩{Number(editing.form_data.total_amount || 0).toLocaleString()}
                      </div>
                    </label>
                  </div>

                  {/* 보호자 · 연락처 · 주소 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <label className="text-xs"><span className="text-slate-600 font-semibold">보호자</span>
                      <input type="text" value={editing.form_data.guardian || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, guardian: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-slate-600 font-semibold">관계</span>
                      <input type="text" placeholder="모·부·본인 등" value={editing.form_data.guardian_relation || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, guardian_relation: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-slate-600 font-semibold">연락처</span>
                      <input type="tel" value={editing.form_data.phone || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, phone: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-slate-600 font-semibold">생년월일</span>
                      <input type="date" value={editing.form_data.birth || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, birth: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                    </label>
                  </div>
                  <label className="text-xs block"><span className="text-slate-600 font-semibold">주소</span>
                    <input type="text" value={editing.form_data.address || ""}
                      onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, address: e.target.value } })}
                      className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                  </label>

                  {/* 응급 이송 · 건강정보 */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <label className="text-xs"><span className="text-slate-600 font-semibold">기저질환</span>
                      <input type="text" value={editing.form_data.health_note || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, health_note: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-slate-600 font-semibold">복용 약물</span>
                      <input type="text" value={editing.form_data.medications || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, medications: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-slate-600 font-semibold">알레르기</span>
                      <input type="text" value={editing.form_data.allergies || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, allergies: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs"><span className="text-slate-600 font-semibold">응급 연락처</span>
                      <input type="tel" value={editing.form_data.emergency_contact || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, emergency_contact: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                    </label>
                    <label className="text-xs"><span className="text-slate-600 font-semibold">응급연락 관계</span>
                      <input type="text" value={editing.form_data.emergency_relation || ""}
                        onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, emergency_relation: e.target.value } })}
                        className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                    </label>
                  </div>

                  {/* ✨ v3.34.0: 동의 체크박스는 본문 아래로 이동 - 여기서는 안내만 */}
                  <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-sky-800">
                    💡 <b>이용 안내:</b><br/>
                    <b>1단계</b> 위 정보 입력 (회원/요금제/계약정보/기저질환) →
                    <b>2단계</b> 아래 계약 본문(4페이지 전문) 정독 →
                    <b>3단계</b> 본문 마지막에서 동의 체크 및 서명 진행
                    <br/><br/>
                    본 통합 계약서는 <b>4페이지 자동 구성</b>으로 인쇄됩니다.
                    <span className="font-semibold">P1</span> 이용계약서 · <span className="font-semibold">P2</span> 개인정보 · <span className="font-semibold">P3</span> 안전·입수 · <span className="font-semibold">P4</span> 수중재활 응급처치
                  </div>
                </div>
              )}

              {/* ✅ v3.39.2: 지상재활·디바이스케어 계약서 전용 편집 UI */}
              {editing.contract_type === "ground_care" && editing.form_data && (
                <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 space-y-3 mb-4 no-print">
                  <div className="text-sm font-bold text-emerald-900 mb-1">🏋️‍♂️ 지상재활·디바이스케어 계약 정보 입력</div>

                  {/* 회원권 가변 선택 */}
                  <div className="bg-white rounded-xl p-3 border border-emerald-200">
                    <div className="text-xs font-bold text-slate-700 mb-2">🎯 회원권 선택 <span className="text-[10px] text-slate-500 font-normal">/settings/catalog에 등록된 지상재활 회원권 자동 로드 · 수동 편집 가능</span></div>

                    <select
                      value={editing.form_data._selected_plan_id || ""}
                      onChange={(e) => {
                        const planId = e.target.value;
                        if (!planId) {
                          setEditing({ ...editing, form_data: { ...editing.form_data, _selected_plan_id: "" } });
                          return;
                        }
                        const pl = plans.find((pp: any) => pp.id === planId);
                        if (!pl) return;
                        const sess = Number(pl.total_sessions || 10);
                        const totalAmt = Number(pl.price || 0);
                        const perAmt = sess > 0 ? Math.round(totalAmt / sess) : 0;
                        // 회원권별 권장 유효기간 자동 매핑
                        const vm = sess <= 5 ? 2 : sess <= 10 ? 3 : sess <= 20 ? 6 : 12;
                        setEditing({
                          ...editing,
                          form_data: {
                            ...editing.form_data,
                            _selected_plan_id: planId,
                            plan_name: pl.name || "",
                            sessions: sess,
                            per_session_amount: perAmt,
                            total_amount: totalAmt,
                            valid_months: vm,
                          }
                        });
                      }}
                      className="w-full px-3 py-2 border-2 border-emerald-300 rounded-lg text-sm bg-white focus:border-emerald-500 focus:outline-none mb-2">
                      <option value="">-- 등록된 지상재활 회원권 선택 --</option>
                      {plans.filter((p: any) => {
                        const c = (p.category || "").toLowerCase();
                        return c === "ground" || c === "device";
                      }).map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {Number(p.total_sessions || 0)}회 · ₩{Number(p.price || 0).toLocaleString()}
                        </option>
                      ))}
                    </select>
                    <div className="text-[10px] text-slate-500 mb-3">
                      💡 회원권 선택 시 회원권명·회당 단가·총 회수·결제금액·유효기간이 자동 바인딩됩니다. 아래 입력란에서 수동 수정 가능합니다.
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">회원권명</span>
                        <input type="text" value={editing.form_data.plan_name || ""}
                          onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, plan_name: e.target.value } })}
                          placeholder="예: 지상재활 10회권"
                          className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                      </label>
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">총 회수</span>
                        <input type="number" min={1} value={editing.form_data.sessions || 0}
                          onChange={e => {
                            const sess = Number(e.target.value) || 0;
                            const perAmt = Number(editing.form_data.per_session_amount || 0);
                            const vm = sess <= 5 ? 2 : sess <= 10 ? 3 : sess <= 20 ? 6 : 12;
                            setEditing({ ...editing, form_data: { ...editing.form_data, sessions: sess, total_amount: perAmt * sess, valid_months: vm } });
                          }}
                          className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                      </label>
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">회당 단가 ₩</span>
                        <input type="number" min={0} step={1000} value={editing.form_data.per_session_amount || 0}
                          onChange={e => {
                            const perAmt = Number(e.target.value) || 0;
                            const sess = Number(editing.form_data.sessions || 0);
                            setEditing({ ...editing, form_data: { ...editing.form_data, per_session_amount: perAmt, total_amount: perAmt * sess } });
                          }}
                          className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                      </label>
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">총 결제금액</span>
                        <input type="number" min={0} step={1000} value={editing.form_data.total_amount || 0}
                          onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, total_amount: Number(e.target.value) || 0 } })}
                          className="w-full mt-1 px-2 py-1.5 border-2 border-emerald-300 rounded-lg text-sm font-bold text-emerald-700 bg-white" />
                      </label>
                    </div>
                  </div>

                  {/* 유효기간 · 계약일 · 만료일 자동 계산 */}
                  <div className="bg-white rounded-xl p-3 border border-emerald-200">
                    <div className="text-xs font-bold text-slate-700 mb-2">📅 이용 기한 (계약일 + 유효기간 = 만료일 자동 계산)</div>
                    <div className="text-[10px] text-slate-500 mb-2">💡 회원권별 권장 유효기간: 5회권 2개월 · 10회권 3개월 · 20회권 6개월 (자동 매핑, 수동 수정 가능)</div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">계약일 (시작일)</span>
                        <input type="date" value={editing.form_data.period_start || ""}
                          onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, period_start: e.target.value } })}
                          className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                      </label>
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">유효기간 (개월)</span>
                        <select value={editing.form_data.valid_months || 3}
                          onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, valid_months: Number(e.target.value) } })}
                          className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm">
                          {[1,2,3,4,5,6,9,12].map(m => (
                            <option key={m} value={m}>{m}개월</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">만료일 (자동)</span>
                        <div className="w-full mt-1 px-2 py-1.5 border-2 border-emerald-300 rounded-lg text-sm font-bold text-emerald-700 bg-emerald-50">
                          {(() => {
                            const startStr = editing.form_data.period_start;
                            const months = Number(editing.form_data.valid_months) || 3;
                            if (!startStr) return "-";
                            try {
                              const d = new Date(startStr);
                              if (isNaN(d.getTime())) return "-";
                              d.setMonth(d.getMonth() + months);
                              d.setDate(d.getDate() - 1);
                              const y = d.getFullYear();
                              const m = String(d.getMonth() + 1).padStart(2, "0");
                              const dd = String(d.getDate()).padStart(2, "0");
                              return `${y}-${m}-${dd}`;
                            } catch { return "-"; }
                          })()}
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* ✅ v3.39.3: 이용 프로그램 - 관리자 설정 페이지(/settings/programs) 자동 로드 */}
                  <div className="bg-white rounded-xl p-3 border border-emerald-200">
                    <div className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
                      <span>🎯 이용 프로그램 <span className="text-[10px] text-slate-500 font-normal">/settings/catalog에서 관리 · 지상+디바이스+공통 자동 표시</span></span>
                      <div className="flex items-center gap-1">
                        <a href="/settings/catalog?tab=programs" target="_blank"
                          className="px-2 py-1 bg-slate-100 text-slate-700 text-[10px] rounded hover:bg-slate-200 border border-slate-300">
                          ⚙️ 관리
                        </a>
                        <button type="button"
                          onClick={() => {
                            // 관리자 페이지에서 새로 등록된 항목 즉시 반영 (지상/디바이스/공통 카테고리 필터)
                            const filtered = servicePrograms.filter((sp: any) => {
                              const c = (sp.category || "").toLowerCase();
                              return c === "ground" || c === "device" || c === "common";
                            });
                            const cur = Array.isArray(editing.form_data.programs) ? editing.form_data.programs : [];
                            const existingKeys = new Set(cur.map((p: any) => p.key));
                            const additions = filtered
                              .filter((sp: any) => !existingKeys.has(sp.key))
                              .map((sp: any) => ({ key: sp.key, label: sp.label, checked: false }));
                            if (additions.length === 0) {
                              alert("관리자 페이지의 프로그램이 모두 이미 표시되고 있습니다.");
                              return;
                            }
                            setEditing({ ...editing, form_data: { ...editing.form_data, programs: [...cur, ...additions] } });
                            alert(`관리자 페이지에서 ${additions.length}건의 신규 프로그램을 불러왔습니다.`);
                          }}
                          className="px-2 py-1 bg-teal-500 text-white text-[10px] rounded hover:bg-teal-600">
                          🔄 관리 페이지 동기화
                        </button>
                        <button type="button"
                          onClick={() => {
                            const cur = Array.isArray(editing.form_data.programs) ? editing.form_data.programs : [];
                            const label = prompt("추가할 프로그램명을 입력하세요 (일회성)");
                            if (!label || !label.trim()) return;
                            setEditing({ ...editing, form_data: { ...editing.form_data, programs: [...cur, { key: `custom_${Date.now()}`, label: label.trim(), checked: true }] } });
                          }}
                          className="px-2 py-1 bg-emerald-500 text-white text-[10px] rounded hover:bg-emerald-600">
                          + 임시 추가
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {(Array.isArray(editing.form_data.programs) ? editing.form_data.programs : []).map((prog: any, idx: number) => (
                        <div key={prog.key || idx} className="flex items-center gap-2">
                          <input type="checkbox" checked={!!prog.checked}
                            onChange={e => {
                              const progs = [...(editing.form_data.programs || [])];
                              progs[idx] = { ...progs[idx], checked: e.target.checked };
                              setEditing({ ...editing, form_data: { ...editing.form_data, programs: progs } });
                            }}
                            className="w-4 h-4 accent-emerald-600" />
                          <input type="text" value={prog.label || ""}
                            onChange={e => {
                              const progs = [...(editing.form_data.programs || [])];
                              progs[idx] = { ...progs[idx], label: e.target.value };
                              setEditing({ ...editing, form_data: { ...editing.form_data, programs: progs } });
                            }}
                            className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs" />
                          <button type="button"
                            onClick={() => {
                              const progs = [...(editing.form_data.programs || [])];
                              progs.splice(idx, 1);
                              setEditing({ ...editing, form_data: { ...editing.form_data, programs: progs } });
                            }}
                            className="text-rose-500 hover:text-rose-700 text-xs px-1.5 py-0.5 rounded hover:bg-rose-50">
                            ✕
                          </button>
                        </div>
                      ))}
                      {(!Array.isArray(editing.form_data.programs) || editing.form_data.programs.length === 0) && (
                        <div className="text-[11px] text-slate-500 py-3 text-center bg-slate-50 rounded">
                          아직 프로그램이 없습니다.<br/>
                          <b>🔄 관리 페이지 동기화</b>를 눌러 관리자 페이지의 프로그램을 자동으로 불러오거나, <b>+ 임시 추가</b>로 이번 계약서에만 사용할 항목을 등록할 수 있습니다.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 회원 개인정보 */}
                  <div className="bg-white rounded-xl p-3 border border-emerald-200">
                    <div className="text-xs font-bold text-slate-700 mb-2">👤 회원 개인정보</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">생년월일</span>
                        <input type="date" value={editing.form_data.birth || ""}
                          onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, birth: e.target.value } })}
                          className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                      </label>
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">연락처</span>
                        <input type="tel" value={editing.form_data.phone || ""}
                          onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, phone: e.target.value } })}
                          className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                      </label>
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">보호자명</span>
                        <input type="text" value={editing.form_data.guardian_name || editing.form_data.guardian || ""}
                          onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, guardian_name: e.target.value, guardian: e.target.value } })}
                          className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                      </label>
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">주소</span>
                        <input type="text" value={editing.form_data.address || ""}
                          onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, address: e.target.value } })}
                          className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                      </label>
                    </div>
                  </div>

                  {/* 건강 정보 */}
                  <div className="bg-white rounded-xl p-3 border border-emerald-200">
                    <div className="text-xs font-bold text-slate-700 mb-2">🩺 건강 정보 (미입력 시 계약서에 "없음"으로 표시)</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">기저질환</span>
                        <input type="text" value={editing.form_data.health_note || ""}
                          onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, health_note: e.target.value } })}
                          placeholder="없음"
                          className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                      </label>
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">복용 약물</span>
                        <input type="text" value={editing.form_data.medications || ""}
                          onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, medications: e.target.value } })}
                          placeholder="없음"
                          className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                      </label>
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">알레르기</span>
                        <input type="text" value={editing.form_data.allergies || ""}
                          onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, allergies: e.target.value } })}
                          placeholder="없음"
                          className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                      </label>
                      <label className="text-xs">
                        <span className="text-slate-600 font-semibold">응급 연락처</span>
                        <input type="tel" value={editing.form_data.emergency_contact || ""}
                          onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, emergency_contact: e.target.value } })}
                          placeholder="없음"
                          className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
                      </label>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                    💡 <b>안내:</b> 위 정보를 입력하면 계약 본문의 <b>제1조 기본정보</b>, <b>제2조 회원권/프로그램</b>, <b>제5조 건강 상태 고지</b>에 자동으로 반영됩니다.
                  </div>
                </div>
              )}

              {/* ✅ v3.20.17: 뉴 모드 토글 (편집 / 실계약서 미리보기) */}
              <div className="no-print flex items-center gap-2">
                <span className="text-xs text-gray-600 font-semibold">📄 계약 본문</span>
                <div className="ml-auto flex bg-gray-100 rounded-lg p-0.5 text-[11px]">
                  <button type="button" onClick={() => setEditing({ ...editing, _view: "edit" })}
                    className={`px-3 py-1 rounded ${(editing._view || "edit") === "edit" ? "bg-white shadow font-bold text-gray-900" : "text-gray-500"}`}>
                    ✏️ 편집
                  </button>
                  <button type="button" onClick={() => setEditing({ ...editing, _view: "preview" })}
                    className={`px-3 py-1 rounded ${editing._view === "preview" ? "bg-white shadow font-bold text-gray-900" : "text-gray-500"}`}>
                    👁️ 계약서로 보기
                  </button>
                </div>
              </div>

              {(editing._view || "edit") === "edit" ? (
                <>
                  <textarea value={editing.body}
                    onChange={e => {
                      setEditing({ ...editing, body: e.target.value });
                      // auto-resize (프린트 시 본문 잘림 방지)
                      const el = e.target as HTMLTextAreaElement;
                      el.style.height = "auto";
                      el.style.height = Math.max(400, el.scrollHeight) + "px";
                    }}
                    rows={20}
                    ref={(el) => {
                      if (el && (!el.style.height || el.style.height === "auto")) {
                        requestAnimationFrame(() => {
                          el.style.height = "auto";
                          el.style.height = Math.max(400, el.scrollHeight) + "px";
                        });
                      }
                    }}
                    className="contract-body w-full mt-1 px-4 py-3 border border-gray-200 rounded-lg bg-white"
                    placeholder="계약서 본문을 입력하세요..." />

                  {/* ✨ v3.34.0: 본문 최하단 동의 체크박스 (통합 계약서 전용) */}
                  {editing.contract_type === "member_unified" && editing.form_data && (
                    <div className="mt-4 aqu-card bg-gradient-to-br from-emerald-50 via-white to-teal-50 border-2 border-emerald-300 rounded-2xl p-4 shadow-md">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-emerald-200">
                        <span className="text-xl">📝</span>
                        <div>
                          <div className="font-bold text-emerald-900 text-sm">3단계 · 최종 동의 및 서명</div>
                          <div className="text-[10px] text-emerald-700">상기 4페이지 본문을 정독하셨다면, 아래 동의 항목을 체크해 주세요</div>
                        </div>
                      </div>
                      <div className="bg-white border-2 border-emerald-200 rounded-xl p-3">
                        <div className="text-xs font-bold text-emerald-800 mb-2">✅ 4페이지 동의 항목 (서명 전 체크)</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs">
                          {[
                            { k: "agree_contract", label: "Page 1 · 이용계약 전체 조항 동의 (필수)", required: true },
                            { k: "agree_privacy_required", label: "Page 2 · 개인정보 수집·이용 (필수)", required: true },
                            { k: "agree_privacy_optional", label: "Page 2 · 사진·영상 홍보 사용 (선택)", required: false },
                            { k: "agree_safety", label: "Page 3 · 안전·입수 관련 사항 동의 (필수)", required: true },
                            { k: "agree_aqua_risk", label: "Page 4 · 수중재활 위험 인지 (필수)", required: true },
                            { k: "agree_emergency", label: "Page 4 · 응급처치 및 구급차 이송 동의 (필수)", required: true },
                          ].map(({ k, label, required }) => (
                            <label key={k} className={`flex items-start gap-1.5 cursor-pointer rounded-lg px-2 py-1.5 border transition ${
                              editing.form_data[k]
                                ? "bg-emerald-100 border-emerald-400"
                                : required
                                  ? "bg-rose-50 border-rose-200 hover:bg-rose-100"
                                  : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                            }`}>
                              <input type="checkbox" checked={!!editing.form_data[k]}
                                onChange={e => setEditing({ ...editing, form_data: { ...editing.form_data, [k]: e.target.checked } })}
                                className="w-4 h-4 accent-emerald-600 mt-0.5" />
                              <span className="text-slate-800">{label}</span>
                            </label>
                          ))}
                        </div>
                        <div className="mt-3 pt-2 border-t border-emerald-100 text-[11px] text-emerald-700 flex items-center gap-2">
                          <span>🔏</span>
                          <span>필수 5항목 모두 체크 시 서명 및 저장이 활성화됩니다.</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* ✅ v3.20.18: 실계약서 A4 종이 스타일 + 서명·직인 실시간 반영 */
                <div className="contract-body mt-1 px-8 py-10 md:px-12 md:py-14 bg-white border border-gray-300 shadow-sm rounded"
                  style={{ minHeight: "600px" }}>
                  <div className="text-center mb-6 pb-4 border-b-2 border-gray-800">
                    <div className="text-lg font-bold">{editing.title || "계약서"}</div>
                    <div className="text-[10px] text-gray-500 mt-1">위례아쿠수중운동센터 · 계약일 {editing.contract_date}</div>
                  </div>
                  {/* v3.20.30: 대상자 + form_data 실시간 100% 치환 */}
                  <div className="whitespace-pre-wrap">{applyTemplateVars(editing?.body || "", editing)}</div>

                  {/* v3.20.31: 서명·직인 - inline-flex 레이아웃으로 (인) 오른쪽에 깔끔정렬 */}
                  <div className="contract-sign-area grid grid-cols-2 gap-4 mt-6 pt-3 border-t border-gray-200">
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 mb-1">
                        {editing?.subject_kind === "staff" ? "근로자" : "회원(보호자)"}
                      </div>
                      <div className="text-[11px] text-gray-800 mb-1">
                        연락처: {editing?.form_data?.worker_phone || editing?.form_data?.phone || "-"}
                      </div>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 4, lineHeight: 1, whiteSpace: "nowrap" }}>
                        <span className="text-[13px] font-semibold text-gray-800">{editing?.subject_name || "대상자"}</span>
                        <span className="text-[11px] text-gray-400">(인/서명)</span>
                        {editing?.signature && (
                          <img src={editing.signature} alt="sign"
                            style={{ display: "inline-block", verticalAlign: "middle", height: 35, maxWidth: 96, objectFit: "contain", mixBlendMode: "multiply", marginLeft: 2 }} />
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 mb-1">사업주</div>
                      <div className="text-[11px] text-gray-800 mb-1">
                        사업체명: <b>위례아쿠수중운동센터</b>
                      </div>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 4, lineHeight: 1, whiteSpace: "nowrap" }}>
                        <span className="text-[13px] font-semibold text-gray-800">하유정</span>
                        <span className="text-[11px] text-gray-400">(인)</span>
                        {editing?.counter_signature === "seal" && (
                          <span style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 2 }}>
                            <CenterSeal size={48} />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* v3.21.2: 계약서 양식별 동의 체크박스 (양식마다 맞춤형) */}
              {(() => {
                // 양식별 동의 항목 매핑 – 각 계약서 유형에 맞는 체크박스만 표시
                const CONTRACT_CONSENTS: Record<string, { key: string; label: string; required: boolean }[]> = {
                  member_service: [
                    { key: "agree_contract", label: "본인은 위 계약 내용을 충분히 이해하였으며, <b>제8조(계약 해지·환불·위약금)</b> 조항에 대해 명확히 설명을 듣고 <b>동의합니다</b>.", required: true },
                    { key: "agree_privacy",  label: "개인정보 및 민감정보 수집·이용에 <b>동의합니다</b>.", required: true },
                    { key: "agree_safety",   label: "<b>제7조(안전 관리 및 책임 범위)</b> 조항을 이해하고 <b>동의합니다</b>.", required: true },
                    { key: "agree_photo",    label: "(선택) 교육·활동 기록 목적의 사진·영상 촬영에 <b>동의합니다</b>.", required: false },
                  ],
                  privacy: [
                    { key: "agree_privacy",     label: "개인정보 및 민감정보 <b>수집·이용에 동의</b>합니다.", required: true },
                    { key: "agree_third_party", label: "(선택) 제3자 정보 제공(공공기관·연구기관)에 동의합니다.", required: false },
                    { key: "agree_retention",   label: "개인정보 보유 및 이용기간(회원 탈퇴 후 5년)에 동의합니다.", required: true },
                  ],
                  safety: [
                    { key: "agree_risk",      label: "수중활동의 <b>상해 위험을 사전에 고지</b> 받았음을 확인합니다.", required: true },
                    { key: "agree_emergency", label: "응급 상황 발생 시 센터의 <b>초기 대응 및 응급의료조치</b>에 동의합니다.", required: true },
                    { key: "agree_health",    label: "본인/자녀의 <b>건강상태(질환·복용약 등)</b>를 사실대로 고지하였음을 확인합니다.", required: true },
                  ],
                  aqua_safety: [
                    { key: "agree_water_risk", label: "수중재활 프로그램의 <b>특성과 위험요소</b>를 이해하고 참여합니다.", required: true },
                    { key: "agree_first_aid",  label: "응급처치 및 <b>CPR·AED 사용</b>에 대해 사전 동의합니다.", required: true },
                    { key: "agree_health_disclose", label: "심혈관 질환·경련·감염성 질환 등 <b>수중활동 금기 질환을 고지</b>하였음을 확인합니다.", required: true },
                  ],
                  portrait: [
                    { key: "agree_feedback",  label: "<b>[필수]</b> 세션 피드백·상담용 사진·영상 촬영에 동의합니다.", required: true },
                    { key: "agree_promotion", label: "(선택) 센터 <b>홍보 및 교육</b>(SNS·블로그·홈페이지) 활용에 동의합니다.", required: false },
                    { key: "agree_research",  label: "(선택) 대학·연구기관 <b>학술 연구·발표</b> 목적 활용에 동의합니다.", required: false },
                  ],
                  research: [
                    { key: "agree_participate", label: "본 연구 참여 목적과 방법을 이해하고 <b>자발적으로 참여</b>에 동의합니다.", required: true },
                    { key: "agree_withdraw",    label: "언제든지 <b>참여 철회가 가능</b>함을 안내받았습니다.", required: true },
                    { key: "agree_data_use",    label: "연구 데이터의 익명 처리 및 <b>학술 목적 활용</b>에 동의합니다.", required: true },
                  ],
                  nda: [
                    { key: "agree_confidential", label: "센터의 <b>기밀정보(회원정보·운영정보)를 외부에 누설하지 않을 것</b>을 서약합니다.", required: true },
                    { key: "agree_no_competing", label: "재직 중 및 <b>퇴직 후 2년간 동종업무 겸직 금지</b>에 동의합니다.", required: true },
                    { key: "agree_return",       label: "퇴직 시 회사 자료·기기·회원정보를 <b>즉시 반납</b>할 것을 서약합니다.", required: true },
                  ],
                  privacy_staff: [
                    { key: "agree_member_info", label: "회원 <b>개인정보·치료기록의 비밀유지</b>를 서약합니다.", required: true },
                    { key: "agree_no_leak",     label: "제3자에게 회원정보를 <b>제공·유출하지 않을 것</b>을 서약합니다.", required: true },
                  ],
                  employment: [
                    { key: "agree_terms",   label: "본 근로계약의 <b>임금·근로시간·업무내용</b>을 이해하고 동의합니다.", required: true },
                    { key: "agree_privacy", label: "인사·급여 목적의 <b>개인정보 처리</b>에 동의합니다.", required: true },
                  ],
                  employment_fixed: [
                    { key: "agree_terms",     label: "본 <b>기간제 근로계약</b>의 조건을 이해하고 동의합니다.", required: true },
                    { key: "agree_end_date",  label: "계약 종료일과 <b>재계약 여부는 별도 협의</b>임을 확인합니다.", required: true },
                  ],
                  employment_daily: [
                    { key: "agree_hourly", label: "<b>시급·일급 근로조건</b>을 이해하고 동의합니다.", required: true },
                  ],
                  apology: [
                    { key: "agree_facts",   label: "본 시말서에 기재된 <b>사실관계를 인정</b>합니다.", required: true },
                    { key: "agree_measure", label: "향후 <b>재발 방지 및 회사 방침 준수</b>를 서약합니다.", required: true },
                  ],
                  resignation: [
                    { key: "agree_voluntary", label: "본 사직서는 <b>본인의 자유의사</b>로 작성되었음을 확인합니다.", required: true },
                    { key: "agree_handover",  label: "잔여 업무 인수인계 및 <b>자료 반납</b>을 성실히 이행하겠습니다.", required: true },
                  ],
                  summary: [
                    { key: "agree_summary", label: "본 요약서 내용을 이해하였으며, 상세 조항은 <b>본 계약서 원본을 참조</b>합니다.", required: true },
                  ],
                  other: [
                    { key: "agree_general", label: "본 계약(서약) 내용을 충분히 이해하고 <b>동의합니다</b>.", required: true },
                  ],
                };
                const consents = CONTRACT_CONSENTS[editing.contract_type] || null;
                if (!consents || consents.length === 0) return null;
                const isMember = editing.subject_kind === "member";
                const toneCls  = isMember
                  ? "border-emerald-100 bg-emerald-50/40"
                  : "border-blue-100 bg-blue-50/40";
                const headerCls = isMember ? "text-emerald-800" : "text-blue-800";
                return (
                  <div className={`border-2 ${toneCls} rounded-lg p-3 mt-3 space-y-1.5`}>
                    <div className={`text-xs font-bold ${headerCls} mb-1`}>
                      ✅ {typeLabel(editing.contract_type).replace(/^[^ ]+ /, "")} 동의 항목
                    </div>
                    {consents.map((c) => (
                      <label key={c.key} className={`flex items-start gap-2 text-[12px] cursor-pointer ${c.required ? "" : "text-gray-600"}`}>
                        <input type="checkbox" className="mt-0.5"
                          checked={!!editing.form_data?.[c.key]}
                          onChange={e => setEditing({ ...editing, form_data: { ...(editing.form_data || {}), [c.key]: e.target.checked } })} />
                        <span dangerouslySetInnerHTML={{ __html: (c.required ? "<b class='text-rose-600'>[필수]</b> " : "") + c.label }} />
                      </label>
                    ))}
                  </div>
                );
              })()}

              <div className="no-print">
                <label className="text-xs">
                  <span className="text-gray-600 font-semibold">비고</span>
                  <input type="text" value={editing.note || ""}
                    onChange={e => setEditing({ ...editing, note: e.target.value })}
                    placeholder="내부 메모 (계약 상대방에게 노출되지 않음)"
                    className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm" />
                </label>
              </div>

              {/* ✅ v3.20.17: 서명·직인 좀 더 컴팩트하게 좌우 배치 (글자 안 잘리게) */}
              {/* v3.20.31: 서명 패드 + 직인 체크박스 입력 영역 - 전체 no-print 처리 (인쇄/PDF 완전 제외) */}
              <div className="no-print grid grid-cols-2 gap-2 mt-4" data-noprint="true">
                {/* 좌: 근로자/회원 서명 입력 */}
                <div className="border border-gray-200 rounded-lg p-2 bg-white">
                  <div className="text-[10px] font-bold text-gray-500 mb-1">
                    ✏️ {editing?.subject_kind === "staff" ? "근로자" : "회원(보호자)"} 서명 입력
                  </div>
                  <div className="space-y-0.5 text-[11px] text-gray-800 mb-1.5">
                    <div>연락처: {editing?.form_data?.worker_phone || editing?.form_data?.phone || "-"}</div>
                    <div>이  름: <b>{editing?.subject_name || "-"}</b></div>
                  </div>
                  <ContractSignaturePad
                    label="서명"
                    value={editing?.signature || ""}
                    onChange={(dataUrl) => setEditing({ ...editing, signature: dataUrl })}
                    width={240}
                    height={70}
                  />
                </div>
                {/* 우: 직인 체크박스 입력 */}
                <div className="border border-gray-200 rounded-lg p-2 bg-white">
                  <div className="text-[10px] font-bold text-gray-500 mb-1">🪧 사업주 직인 설정</div>
                  <div className="space-y-0.5 text-[11px] text-gray-800 mb-1.5">
                    <div>사업체명: <b>위례아쿠수중운동센터</b></div>
                    <div>대표자: <b>하유정</b></div>
                  </div>
                  <div className="flex items-center justify-center h-[70px] border border-gray-100 rounded bg-gray-50/40">
                    {editing?.counter_signature === "seal"
                      ? <CenterSeal size={64} />
                      : <span className="text-[10px] text-gray-400">직인 표시를 체크하세요</span>}
                  </div>
                  <label className="flex items-center gap-1 mt-1 text-[10px] text-gray-600">
                    <input type="checkbox" checked={editing?.counter_signature === "seal"}
                      onChange={e => setEditing({ ...editing, counter_signature: e.target.checked ? "seal" : "" })} />
                    생성/프린트 시 직인 표시
                  </label>
                </div>
              </div>
            </div>

            <div className="no-print px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50 flex-wrap gap-2">
              <div className="text-[11px] text-gray-500">
                💡 서명 후 저장하면 PDF·프린트·이메일 발송 가능
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setEditing(null)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>
                {/* ✅ v3.20.18: PDF 저장 (브라우저 프린트 다이얼로그→PDF로 저장)
                    계약서는 모두 contracts 테이블에 자동 저장되며,
                    회원/직원 상세 페이지에 자동으로 노출됩니다. */}
                <button onClick={handlePrint}
                  className="px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm flex items-center gap-1">
                  <Download className="w-4 h-4" /> PDF 저장
                </button>
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
