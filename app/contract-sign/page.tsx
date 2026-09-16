"use client";

/**
 * ✅ v3.60.0: 공개 전자서명 페이지 (링크 기반 계약서 동의·서명)
 * - /contract-sign?type=member_unified 형태로 접근 (로그인 불필요)
 * - 계약서 본문 열람 → 기본정보 입력 → 동의 체크 → 서명 → 제출
 * - 제출 시 contracts 테이블에 status='signed' 로 저장 (source='link')
 */
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CONTRACT_TYPES, TEMPLATES, typeLabel, buildContractTitle } from "@/lib/contractTemplates";
import ContractSignaturePad from "@/components/ContractSignaturePad";
import { FileSignature, CheckCircle2, Loader2 } from "lucide-react";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 템플릿에서 사용되는 {{변수}} 목록 추출
function extractVars(body: string): string[] {
  const set = new Set<string>();
  const re = /\{\{([a-z_0-9]+)\}\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body || "")) !== null) set.add(m[1].toLowerCase());
  return Array.from(set);
}

// 변수 → 입력 라벨/타입 매핑
const VAR_META: Record<string, { label: string; type?: string; placeholder?: string }> = {
  name: { label: "성명", placeholder: "홍길동" },
  member_name: { label: "회원 성명" },
  staff_name: { label: "직원 성명" },
  phone: { label: "연락처", placeholder: "010-0000-0000" },
  birth: { label: "생년월일", type: "date" },
  birth_date: { label: "생년월일", type: "date" },
  staff_birth: { label: "생년월일", type: "date" },
  address: { label: "주소" },
  start_date: { label: "시작일(근로개시일/이용시작일)", type: "date" },
  end_date: { label: "종료일", type: "date" },
  hire_date: { label: "입사일", type: "date" },
  base_salary: { label: "월 기본급(원)", type: "number" },
  meal_allowance: { label: "식대(원)", type: "number" },
  transport_allowance: { label: "교통비(원)", type: "number" },
  workplace: { label: "근무장소" },
  duty: { label: "업무 내용" },
  weekday_hours: { label: "평일 근무시간" },
  saturday_hours: { label: "토요일 근무시간" },
  pay_day: { label: "임금지급일" },
  pay_method: { label: "지급방법" },
  guardian: { label: "보호자 성명" },
  guardian_name: { label: "보호자 성명" },
  guardian_relation: { label: "보호자 관계", placeholder: "예: 모, 부" },
  relation: { label: "보호자 관계" },
  child_name: { label: "아동 성명" },
  child_birth: { label: "아동 생년월일", type: "date" },
  staff_role: { label: "직무" },
  health_note: { label: "건강상태 특이사항", placeholder: "없음" },
  medications: { label: "복용 약물", placeholder: "없음" },
  allergies: { label: "알레르기", placeholder: "없음" },
  emergency_contact: { label: "비상연락처" },
  emergency_relation: { label: "비상연락처 관계" },
};
// 본문에 자동 치환되는 변수(입력폼에서 제외)
const HIDDEN_VARS = new Set(["contract_date", "employer_name", "employer_ceo", "center_name"]);

function ContractSignInner() {
  const sp = useSearchParams();
  const type = sp?.get("type") || "member_unified";
  const tpl = TEMPLATES[type];
  const typeMeta = CONTRACT_TYPES.find(c => c.v === type);
  const isMember = typeMeta?.cat === "member";

  const [form, setForm] = useState<Record<string, string>>({});
  const [agreeRead, setAgreeRead] = useState(false);
  const [agreeContract, setAgreeContract] = useState(false);
  const [agreeSafety, setAgreeSafety] = useState(false);
  const [agreeRefund, setAgreeRefund] = useState(false);
  const [signature, setSignature] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const vars = useMemo(() => extractVars(tpl || "").filter(v => !HIDDEN_VARS.has(v)), [tpl]);

  // 본문 실시간 치환 (미입력 변수는 ____로 표시)
  const filledBody = useMemo(() => {
    if (!tpl) return "";
    const numKeys = new Set(["base_salary", "meal_allowance", "transport_allowance"]);
    return tpl.replace(/\{\{([a-z_0-9]+)\}\}/gi, (_, k: string) => {
      const key = k.toLowerCase();
      if (key === "contract_date") return todayStr();
      if (key === "employer_name" || key === "center_name") return "위례아쿠수중운동센터";
      if (key === "employer_ceo") return "하유정";
      const v = (form[key] || "").trim();
      if (!v) return "________";
      return numKeys.has(key) ? Number(v).toLocaleString() : v;
    });
  }, [tpl, form]);

  const mainName = (form.name || form.member_name || form.staff_name || "").trim();
  const allFilled = vars.every(v => (form[v] || "").trim());
  const canSubmit =
    allFilled &&
    agreeRead &&
    agreeContract &&
    (!isMember || (agreeSafety && agreeRefund)) &&
    signature &&
    !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id || null;
      const title = buildContractTitle(type, mainName, todayStr());
      const payload: any = {
        org_id: orgId,
        contract_type: type,
        subject_kind: typeMeta?.cat === "staff" ? "staff" : "member",
        subject_id: null,
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
          agree_read: agreeRead,
          agree_contract: agreeContract,
          agree_safety: agreeSafety,
          agree_refund: agreeRefund,
          _source: "contract_sign_link",
          _signed_at: new Date().toISOString(),
        },
      };
      // 컬럼 폴백 (일부 환경에 없는 컬럼 자동 제거)
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
              <div className="text-xs text-slate-500">위례아쿠수중운동센터 · {todayStr()}</div>
            </div>
          </div>
        </header>

        {/* 1. 기본정보 입력 */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <h2 className="font-bold text-slate-800 mb-3">① 기본정보 입력</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {vars.map(v => {
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
