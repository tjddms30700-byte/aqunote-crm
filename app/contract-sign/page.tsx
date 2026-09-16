"use client";

/**
 * ✅ v3.61.0: 공개 전자서명 페이지 (링크 기반 계약서 동의·서명)
 * - /contract-sign?type=member_unified&member={id} 또는 &staff={id}
 * - 한글 라벨 + 등록된 회원권 선택(자동 바인딩) + 회원/직원 정보 자동입력
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CONTRACT_TYPES, TEMPLATES, typeLabel, buildContractTitle } from "@/lib/contractTemplates";
import ContractSignaturePad from "@/components/ContractSignaturePad";
import { FileSignature, CheckCircle2, Loader2 } from "lucide-react";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function extractVars(body: string): string[] {
  const set = new Set<string>();
  const re = /\{\{([a-z_0-9]+)\}\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body || "")) !== null) set.add(m[1].toLowerCase());
  return Array.from(set);
}

// ✅ v3.61.0: 변수 → 한글 라벨 (영문 변수명 노출 방지)
const VAR_META: Record<string, { label: string; type?: string; placeholder?: string }> = {
  name: { label: "성명", placeholder: "홍길동" },
  member_name: { label: "회원 성명" },
  staff_name: { label: "직원 성명" },
  phone: { label: "연락처", placeholder: "010-0000-0000" },
  birth: { label: "생년월일", type: "date" },
  birth_date: { label: "생년월일", type: "date" },
  staff_birth: { label: "생년월일", type: "date" },
  rrn: { label: "주민등록번호", placeholder: "000000-0000000" },
  address: { label: "주소" },
  start_date: { label: "시작일(이용/근로 개시일)", type: "date" },
  end_date: { label: "종료일", type: "date" },
  hire_date: { label: "입사일", type: "date" },
  resign_date: { label: "퇴사 예정일", type: "date" },
  resign_reason: { label: "퇴사 사유" },
  apology_reason: { label: "시말 사유" },
  position: { label: "직위·직책" },
  base_salary: { label: "월 기본급(원)", type: "number" },
  meal_allowance: { label: "식대(원)", type: "number" },
  transport_allowance: { label: "교통비(원)", type: "number" },
  daily_wage: { label: "일급(원)", type: "number" },
  hourly_wage: { label: "시급(원)", type: "number" },
  workplace: { label: "근무장소" },
  duty: { label: "업무 내용" },
  weekday_hours: { label: "평일 근무시간", placeholder: "예: 13:00~22:00" },
  saturday_hours: { label: "토요일 근무시간", placeholder: "예: 10:00~14:30" },
  daily_hours: { label: "1일 근무시간", placeholder: "예: 4시간" },
  break_time: { label: "휴게시간", placeholder: "예: 19:30~20:30" },
  schedule: { label: "근무 일정" },
  weekly_count: { label: "주 근무일수", type: "number" },
  monthly_count: { label: "월 근무일수", type: "number" },
  pay_day: { label: "임금지급일", placeholder: "예: 매월 15일" },
  pay_method: { label: "지급방법", placeholder: "예: 계좌이체" },
  guardian: { label: "보호자 성명" },
  guardian_name: { label: "보호자 성명" },
  guardian_relation: { label: "보호자 관계", placeholder: "예: 모, 부" },
  relation: { label: "보호자 관계" },
  child_name: { label: "아동 성명" },
  child_birth: { label: "아동 생년월일", type: "date" },
  staff_role: { label: "직무", placeholder: "예: 재활강사" },
  health_note: { label: "건강상태 특이사항", placeholder: "없음" },
  medications: { label: "복용 약물", placeholder: "없음" },
  allergies: { label: "알레르기", placeholder: "없음" },
  emergency_contact: { label: "비상연락처" },
  emergency_relation: { label: "비상연락처 관계" },
  // 회원권 관련 (드롭다운으로 자동 채움)
  plan: { label: "회원권" },
  plan_name: { label: "회원권" },
  plan_std: { label: "스탠다드 회원권" },
  plan_adv: { label: "어드밴스 회원권" },
  plan_prm: { label: "프리미엄 회원권" },
  per_session_amount: { label: "회당 단가(원)", type: "number" },
  sessions: { label: "총 이용 횟수", type: "number" },
  total_sessions: { label: "총 이용 횟수", type: "number" },
  sessions_per_week: { label: "주 이용 횟수", type: "number" },
  total_amount: { label: "총 결제금액(원)", type: "number" },
  amount: { label: "금액(원)", type: "number" },
  valid_months: { label: "유효기간(개월)", type: "number" },
  programs_line: { label: "이용 프로그램" },
  research_org: { label: "연구 기관" },
  research_pi: { label: "연구 책임자" },
};
const HIDDEN_VARS = new Set(["contract_date", "employer_name", "employer_ceo", "center_name"]);
// 회원권 드롭다운이 대체하는 변수 (직접 입력 숨김)
const PLAN_VARS = new Set(["plan", "plan_name", "plan_std", "plan_adv", "plan_prm"]);

function ContractSignInner() {
  const sp = useSearchParams();
  const type = sp?.get("type") || "member_unified";
  const memberId = sp?.get("member") || "";
  const staffId = sp?.get("staff") || "";
  const tpl = TEMPLATES[type];
  const typeMeta = CONTRACT_TYPES.find(c => c.v === type);
  const isMember = typeMeta?.cat === "member";
  const isStaff = typeMeta?.cat === "staff";

  const [form, setForm] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [prefillName, setPrefillName] = useState("");
  const [agreeRead, setAgreeRead] = useState(false);
  const [agreeContract, setAgreeContract] = useState(false);
  const [agreeSafety, setAgreeSafety] = useState(false);
  const [agreeRefund, setAgreeRefund] = useState(false);
  const [signature, setSignature] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const allVars = useMemo(() => extractVars(tpl || "").filter(v => !HIDDEN_VARS.has(v)), [tpl]);
  // 회원권 관련 변수는 드롭다운으로 대체 (회원용 계약서일 때)
  const hasPlanField = allVars.some(v => PLAN_VARS.has(v));
  const planCategory = type === "ground_care" ? "ground" : "aqua";
  const planOptions = useMemo(
    () => plans.filter((p: any) => (p.category || "aqua") === planCategory || (planCategory === "aqua" && (p.category || "aqua") === "aqua")),
    [plans, planCategory]
  );
  const inputVars = useMemo(() => allVars.filter(v => !(hasPlanField && PLAN_VARS.has(v))), [allVars, hasPlanField]);

  // 회원권 로드
  useEffect(() => {
    if (!isMember || !hasPlanField) return;
    supabase.from("membership_plans").select("*").eq("is_active", true).order("sort_order", { ascending: true })
      .then(({ data }) => setPlans(data || []));
  }, [isMember, hasPlanField]);

  // 회원/직원 정보 자동입력
  useEffect(() => {
    (async () => {
      if (memberId) {
        const { data: m } = await supabase.from("members").select("*").eq("id", memberId).single();
        if (m) {
          const cf = m?.extra?.consult_form || {};
          setPrefillName(m.name || "");
          setForm(f => ({
            ...f,
            name: m.name || f.name || "",
            member_name: m.name || f.member_name || "",
            phone: m.phone || cf.phone || f.phone || "",
            birth: m.birth || cf.birth || f.birth || "",
            birth_date: m.birth || cf.birth || f.birth_date || "",
            address: m.address || cf.address || f.address || "",
            guardian_name: m.guardian_name || cf.guardian_name || f.guardian_name || "",
            guardian: m.guardian_name || cf.guardian_name || f.guardian || "",
            emergency_contact: cf.emergency_contact || m.phone || f.emergency_contact || "",
            health_note: cf.health_note || f.health_note || "",
            medications: cf.medications || f.medications || "",
            allergies: cf.allergies || cf.allergy || f.allergies || "",
          }));
        }
      } else if (staffId) {
        const { data: s } = await supabase.from("staff").select("*").eq("id", staffId).single();
        if (s) {
          setPrefillName(s.name || "");
          setForm(f => ({
            ...f,
            name: s.name || f.name || "",
            staff_name: s.name || f.staff_name || "",
            phone: s.phone || s.contact || f.phone || "",
            birth: s.birth || s.birth_date || f.birth || "",
            birth_date: s.birth || s.birth_date || f.birth_date || "",
            staff_birth: s.birth || s.birth_date || f.staff_birth || "",
            address: s.address || f.address || "",
            hire_date: s.hire_date || f.hire_date || "",
            start_date: s.hire_date || f.start_date || "",
            position: s.position || s.role || f.position || "",
            staff_role: s.role || s.position || f.staff_role || "",
            duty: s.duty || s.role || f.duty || "",
            rrn: s.rrn || s.resident_number || f.rrn || "",
          }));
        }
      }
    })();
  }, [memberId, staffId]);

  // 회원권 선택 시 자동 바인딩
  function onPlanChange(planId: string) {
    setSelectedPlan(planId);
    if (!planId) return;
    const pl = plans.find((p: any) => p.id === planId);
    if (!pl) return;
    const sess = Number(pl.sessions || pl.total_sessions || 4);
    const totalAmt = Number(pl.price || 0);
    const perAmt = sess > 0 ? Math.round(totalAmt / sess) : 0;
    const vm = sess <= 5 ? 2 : sess <= 10 ? 3 : sess <= 20 ? 6 : 12;
    setForm(f => ({
      ...f,
      plan: pl.name || "",
      plan_name: pl.name || "",
      plan_std: pl.name || "",
      plan_adv: pl.name || "",
      plan_prm: pl.name || "",
      per_session_amount: String(perAmt),
      sessions: String(sess),
      total_sessions: String(sess),
      sessions_per_week: String(pl.sessions_per_week || (pl.name?.includes("주2") ? 2 : 1)),
      total_amount: String(totalAmt),
      amount: String(totalAmt),
      valid_months: String(vm),
    }));
  }

  const filledBody = useMemo(() => {
    if (!tpl) return "";
    const numKeys = new Set(["base_salary", "meal_allowance", "transport_allowance", "daily_wage", "hourly_wage", "per_session_amount", "total_amount", "amount"]);
    return tpl.replace(/\{\{([a-z_0-9]+)\}\}/gi, (_, k: string) => {
      const key = k.toLowerCase();
      if (key === "contract_date") return todayStr();
      if (key === "employer_name" || key === "center_name") return "위례아쿠수중운동센터";
      if (key === "employer_ceo") return "하유정";
      const v = (form[key] || "").trim();
      if (!v) return "________";
      return numKeys.has(key) && !isNaN(Number(v)) ? Number(v).toLocaleString() : v;
    });
  }, [tpl, form]);

  const mainName = (form.name || form.member_name || form.staff_name || "").trim();
  const allFilled = inputVars.every(v => (form[v] || "").trim()) && (!hasPlanField || !!selectedPlan);
  const canSubmit =
    allFilled && agreeRead && agreeContract &&
    (!isMember || (agreeSafety && agreeRefund)) &&
    !!signature && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id || null;
      const title = buildContractTitle(type, mainName, todayStr());
      const payload: any = {
        org_id: orgId,
        contract_type: type,
        subject_kind: isStaff ? "staff" : "member",
        subject_id: memberId || staffId || null,
        subject_name: mainName,
        title,
        contract_date: todayStr(),
        start_date: form.start_date || form.hire_date || null,
        end_date: form.end_date || null,
        body: filledBody,
        signature,
        counter_signature: null,
        status: "signed",
        note: "전자서명 링크로 작성됨",
        form_data: {
          ...form,
          _selected_plan_id: selectedPlan || undefined,
          agree_read: agreeRead, agree_contract: agreeContract,
          agree_safety: agreeSafety, agree_refund: agreeRefund,
          _source: "contract_sign_link",
          _signed_at: new Date().toISOString(),
        },
      };
      let err: any = null;
      for (let i = 0; i < 8; i++) {
        const { error } = await supabase.from("contracts").insert(payload);
        if (!error) { err = null; break; }
        err = error;
        const m = /column "([a-z_]+)"/i.exec(error.message || "");
        if (m && m[1] in payload) { delete payload[m[1]]; continue; }
        break;
      }
      if (err) throw err;
      setDone(true);
    } catch (e: any) {
      alert(`❌ 제출 실패: ${e?.message || e}\n\n센터에 문의해 주세요.`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!tpl) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow p-8 text-center max-w-md">
          <div className="text-4xl mb-3">⚠️</div>
          <div className="font-bold text-slate-800">올바르지 않은 계약서 링크입니다</div>
          <div className="text-sm text-slate-500 mt-2">센터에서 받은 링크를 다시 확인해 주세요.</div>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow p-8 text-center max-w-md">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
          <div className="text-lg font-extrabold text-slate-900">서명이 완료되었습니다</div>
          <div className="text-sm text-slate-500 mt-2 leading-relaxed">
            계약서가 정상적으로 접수되었습니다.<br />센터에서 확인 후 안내드리겠습니다. 감사합니다.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 py-6 px-3">
      <div className="max-w-2xl mx-auto space-y-4">
        <header className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center">
              <FileSignature className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900">{typeLabel(type).replace(/^[^ ]+ /, "")} 전자서명</h1>
              <div className="text-xs text-slate-500">위례아쿠수중운동센터 · {todayStr()}{prefillName ? ` · ${prefillName}님` : ""}</div>
            </div>
          </div>
        </header>

        {/* 1. 기본정보 입력 */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <h2 className="font-bold text-slate-800 mb-3">① 기본정보 입력</h2>

          {/* ✅ v3.61.0: 등록된 회원권 선택 (회원용 계약서) */}
          {isMember && hasPlanField && (
            <div className="mb-4 bg-purple-50/70 border border-purple-100 rounded-xl p-3">
              <label className="text-xs">
                <span className="text-purple-700 font-bold">🎫 등록된 회원권 선택 *</span>
                <select
                  value={selectedPlan}
                  onChange={e => onPlanChange(e.target.value)}
                  className="mt-1 w-full border-2 border-purple-300 rounded-lg px-3 py-2 text-sm bg-white focus:border-purple-500 focus:outline-none"
                >
                  <option value="">-- 회원권을 선택하세요 --</option>
                  {planOptions.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {Number(p.sessions || p.total_sessions || 0)}회 · ₩{Number(p.price || 0).toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-[10px] text-purple-600 mt-1.5">
                💡 회원권을 선택하면 회수·단가·결제금액·유효기간이 자동으로 채워집니다.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {inputVars.map(v => {
              const meta = VAR_META[v] || { label: v };
              return (
                <label key={v} className="text-xs">
                  <span className="text-slate-600 font-semibold">{meta.label} *</span>
                  <input
                    type={meta.type || "text"}
                    value={form[v] || ""}
                    placeholder={meta.placeholder || ""}
                    onChange={e => setForm({ ...form, [v]: e.target.value })}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </label>
              );
            })}
          </div>
        </section>

        {/* 2. 계약서 본문 */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <h2 className="font-bold text-slate-800 mb-3">② 계약서 내용 확인</h2>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-96 overflow-y-auto">
            <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800 font-sans">{filledBody}</pre>
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={agreeRead} onChange={e => setAgreeRead(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-600" />
            <span>위 계약서 내용을 모두 읽고 이해하였습니다. <b className="text-rose-500">(필수)</b></span>
          </label>
        </section>

        {/* 3. 동의 체크 */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <h2 className="font-bold text-slate-800 mb-3">③ 계약 동의</h2>
          <div className="space-y-2.5">
            <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={agreeContract} onChange={e => setAgreeContract(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-600" />
              <span>본 계약서의 내용에 동의하며 계약을 체결합니다. <b className="text-rose-500">(필수)</b></span>
            </label>
            {isMember && (
              <>
                <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={agreeSafety} onChange={e => setAgreeSafety(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-600" />
                  <span>안전 관리·책임 조항에 동의합니다. <b className="text-rose-500">(필수)</b></span>
                </label>
                <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={agreeRefund} onChange={e => setAgreeRefund(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-600" />
                  <span>환불·차감 규정을 확인하였으며 이에 동의합니다. <b className="text-rose-500">(필수)</b></span>
                </label>
              </>
            )}
          </div>
        </section>

        {/* 4. 서명 */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <h2 className="font-bold text-slate-800 mb-3">④ 서명</h2>
          <div className="flex justify-center">
            <ContractSignaturePad label={`${mainName || "계약자"} 서명`} value={signature} onChange={setSignature} width={320} height={110} />
          </div>
        </section>

        <button
          onClick={submit}
          disabled={!canSubmit}
          className={`w-full py-3.5 rounded-2xl font-bold text-sm shadow transition-all ${
            canSubmit
              ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:opacity-90"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {submitting ? (
            <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 제출 중...</span>
          ) : (
            "✍️ 동의하고 서명 완료하기"
          )}
        </button>
        <p className="text-center text-[11px] text-slate-400 pb-6">
          제출된 계약서는 위례아쿠수중운동센터 계약 관리에 자동 등록됩니다.
        </p>
      </div>
    </main>
  );
}

export default function ContractSignPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">로딩중...</div>}>
      <ContractSignInner />
    </Suspense>
  );
}
