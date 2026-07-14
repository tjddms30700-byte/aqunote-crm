"use client";
import { useState } from "react";
import Logo from "@/components/Logo";
import { CheckCircle2, ChevronRight, ChevronLeft, Loader2, Phone, MapPin, Clock, AlertCircle } from "lucide-react";

const DAYS = ["월", "화", "수", "목", "금", "토"];
const TIME_SLOTS = [
  "10:00~11:10", "11:10~12:20", "12:20~13:30", "13:30~14:40",
  "14:40~15:50", "15:50~17:00", "17:00~18:10", "18:10~19:20",
];
const RELATIONS = ["부", "모", "조부", "조모", "형제", "기타"];
const BRANCHES = ["위례본점"];

export default function ApplyChildPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState<any>({
    // 1단계: 아동 정보
    child_name: "",
    birth: "",
    gender: "",
    height_weight: "",
    // 2단계: 보호자 정보
    guardian_name: "",
    guardian_relation: "",
    phone: "",
    address: "",
    institution: "",
    // 3단계: 의학 정보
    diagnosis: "",
    main_symptom: "",
    medication: "",
    treatment_history: "",
    special_notes: "",
    expected_change: "",
    // 4단계: 희망 시간
    wish_branch: "위례본점",
    wish_days: [] as string[],
    wish_time_slots: [] as string[],
    wish_start_date: "",
    source: "",
    // 5단계: 개인정보 동의
    agree_privacy: false,
    agree_medical: false,
  });

  function update(k: string, v: any) {
    setForm({ ...form, [k]: v });
  }
  function toggleArray(k: string, v: string) {
    const cur = form[k] || [];
    update(k, cur.includes(v) ? cur.filter((x: string) => x !== v) : [...cur, v]);
  }

  function validateStep(): string {
    if (step === 1) {
      if (!form.child_name) return "아동 이름을 입력해주세요";
      if (!form.birth) return "생년월일을 입력해주세요";
      if (!form.gender) return "성별을 선택해주세요";
      if (!form.height_weight) return "키/체중을 입력해주세요";
    }
    if (step === 2) {
      if (!form.guardian_name) return "보호자 성함을 입력해주세요";
      if (!form.guardian_relation) return "보호자 관계를 선택해주세요";
      if (!form.phone) return "연락처를 입력해주세요";
      if (!/^01[0-9]-?\d{3,4}-?\d{4}$/.test(form.phone.replace(/\s/g, ""))) return "올바른 휴대폰 번호 형식이 아닙니다";
    }
    if (step === 4) {
      if (form.wish_days.length === 0) return "희망 요일을 최소 1개 선택해주세요";
      if (form.wish_time_slots.length === 0) return "희망 시간을 최소 1개 선택해주세요";
    }
    if (step === 5) {
      if (!form.agree_privacy) return "개인정보 수집·이용에 동의해주세요";
      if (!form.agree_medical) return "의료정보 수집·이용에 동의해주세요";
    }
    return "";
  }

  function next() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError("");
    setStep((step + 1) as any);
    window.scrollTo(0, 0);
  }
  function prev() {
    setError("");
    setStep((step - 1) as any);
    window.scrollTo(0, 0);
  }

  async function submit() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, member_type: "child" }),
      });
      const j = await res.json();
      if (j.success) setDone(true);
      else setError("접수 실패: " + (j.error || "알 수 없는 오류"));
    } catch (e: any) {
      setError("네트워크 오류: " + e.message);
    }
    setSubmitting(false);
  }

  if (done) {
    return <ThankYou name={form.child_name} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-white pb-10">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 pb-8 rounded-b-3xl shadow-lg">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Logo size="md" />
          <div>
            <h1 className="text-xl font-bold">🐳 아쿠수중운동센터</h1>
            <p className="text-xs opacity-90">아동 상담·체험 신청서</p>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="max-w-2xl mx-auto px-4 -mt-4">
        <div className="bg-white rounded-2xl shadow-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-purple-700">STEP {step} / 5</span>
            <span className="text-xs text-gray-500">{Math.round(step / 5 * 100)}% 완료</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
              style={{ width: `${step / 5 * 100}%` }}></div>
          </div>
        </div>

        {/* 안내문 (STEP 1에서만) */}
        {step === 1 && (
          <div className="bg-white rounded-2xl p-5 mb-4 shadow-md border-l-4 border-purple-400">
            <p className="text-sm text-gray-700 leading-relaxed">
              안녕하세요 😊 아쿠수중운동센터 아동 상담·체험 신청서입니다.<br /><br />
              저희 센터는 <strong className="text-purple-700">1:1 수중재활 전문 센터</strong>로 하루 7타임만 운영하고 있으며,
              현재 평균 대기 <strong>3~6개월</strong> 이상인 경우가 많습니다.<br /><br />
              체험이 곧 정규 수업의 고정 시간표 자리가 될 가능성이 높아
              가능한 요일·시간을 최대한 많이 선택해주시면 빠른 안내에 큰 도움이 됩니다.
            </p>
          </div>
        )}

        {/* Form Body */}
        <div className="bg-white rounded-2xl shadow-md p-6">
          {/* STEP 1: 아동 정보 */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-purple-900 flex items-center gap-2">
                🧒 아동 기본 정보
              </h2>
              <Field label="아동 이름" required value={form.child_name}
                onChange={(v: string) => update("child_name", v)} placeholder="예: 홍길동" />
              <Field label="생년월일" type="date" required value={form.birth}
                onChange={(v: string) => update("birth", v)} />
              <RadioGroup label="성별" required options={["남", "여"]}
                value={form.gender} onChange={(v: string) => update("gender", v)} />
              <Field label="키 / 체중" required value={form.height_weight}
                onChange={(v: string) => update("height_weight", v)} placeholder="예: 103cm / 17kg" />
            </div>
          )}

          {/* STEP 2: 보호자 정보 */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-purple-900 flex items-center gap-2">
                👨‍👩‍👧 보호자 정보
              </h2>
              <Field label="보호자 성함" required value={form.guardian_name}
                onChange={(v: string) => update("guardian_name", v)} placeholder="예: 홍부모" />
              <RadioGroup label="아동과의 관계" required options={RELATIONS}
                value={form.guardian_relation} onChange={(v: string) => update("guardian_relation", v)} />
              <Field label="연락처" required value={form.phone}
                onChange={(v: string) => update("phone", v)} placeholder="010-0000-0000" />
              <Field label="주소" value={form.address}
                onChange={(v: string) => update("address", v)} placeholder="시/군/구까지만 입력하셔도 됩니다" />
              <Field label="이용기관 / 학교 (있을 경우)" value={form.institution}
                onChange={(v: string) => update("institution", v)}
                placeholder="재학·재원 중인 기관이 있다면" />
            </div>
          )}

          {/* STEP 3: 의학 정보 */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-purple-900 flex items-center gap-2">
                🏥 의학적 정보 <span className="text-xs font-normal text-gray-500">(선택입력, 상담 진행에 큰 도움이 됩니다)</span>
              </h2>
              <TextArea label="진단명" value={form.diagnosis}
                onChange={(v: string) => update("diagnosis", v)}
                placeholder="예: 뇌성마비, 자폐스펙트럼장애, 발달지연 등" rows={2} />
              <TextArea label="주 증상 / 현재 상태" value={form.main_symptom}
                onChange={(v: string) => update("main_symptom", v)}
                placeholder="아동의 현재 상태나 주요 증상을 자유롭게 적어주세요" rows={3} />
              <TextArea label="복용 중인 약물" value={form.medication}
                onChange={(v: string) => update("medication", v)}
                placeholder="현재 복용 중인 약물이 있다면 적어주세요 (없으면 비워두셔도 됩니다)" rows={2} />
              <TextArea label="치료 이력" value={form.treatment_history}
                onChange={(v: string) => update("treatment_history", v)}
                placeholder="지금까지 받아본 치료·재활 프로그램 (물리치료, 작업치료 등)" rows={2} />
              <TextArea label="특이사항" value={form.special_notes}
                onChange={(v: string) => update("special_notes", v)}
                placeholder="알레르기, 발작 이력, 물에 대한 반응 등 저희가 미리 알아야 할 사항" rows={2} />
              <TextArea label="기대하는 변화" value={form.expected_change}
                onChange={(v: string) => update("expected_change", v)}
                placeholder="수중재활을 통해 기대하시는 변화나 목표를 알려주세요" rows={2} />
            </div>
          )}

          {/* STEP 4: 희망 시간 */}
          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-purple-900 flex items-center gap-2">
                📅 희망 요일 · 시간
              </h2>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                ⏰ <strong>가능한 요일·시간을 최대한 많이 선택해주시면 빠른 배정이 가능합니다.</strong> 체험이 곧 정규 시간표 자리가 됩니다.
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">희망 지점</label>
                <div className="flex gap-2">
                  {BRANCHES.map(b => (
                    <button key={b} type="button" onClick={() => update("wish_branch", b)}
                      className={`px-4 py-2 rounded-lg border-2 text-sm ${form.wish_branch === b ? "bg-purple-500 border-purple-500 text-white" : "border-gray-200 text-gray-700"}`}>
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  희망 요일 <span className="text-red-500">*</span>
                  <span className="ml-2 text-xs text-gray-500">({form.wish_days.length}개 선택)</span>
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {DAYS.map(d => (
                    <button key={d} type="button" onClick={() => toggleArray("wish_days", d)}
                      className={`py-3 rounded-lg border-2 font-medium ${form.wish_days.includes(d) ? "bg-purple-500 border-purple-500 text-white" : "border-gray-200 text-gray-700 hover:border-purple-300"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  희망 시간대 <span className="text-red-500">*</span>
                  <span className="ml-2 text-xs text-gray-500">({form.wish_time_slots.length}개 선택)</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TIME_SLOTS.map(t => (
                    <button key={t} type="button" onClick={() => toggleArray("wish_time_slots", t)}
                      className={`py-2 px-2 rounded-lg border-2 text-sm ${form.wish_time_slots.includes(t) ? "bg-purple-500 border-purple-500 text-white" : "border-gray-200 text-gray-700 hover:border-purple-300"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <Field label="희망 시작일 (선택)" type="date" value={form.wish_start_date}
                onChange={(v: string) => update("wish_start_date", v)} />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">유입 경로</label>
                <select value={form.source} onChange={(e) => update("source", e.target.value)}
                  className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none">
                  <option value="">선택해주세요</option>
                  <option value="네이버검색">네이버 검색</option>
                  <option value="구글검색">구글 검색</option>
                  <option value="블로그">블로그</option>
                  <option value="인스타그램">인스타그램</option>
                  <option value="유튜브">유튜브</option>
                  <option value="지인추천">지인 추천</option>
                  <option value="타기관추천">타 기관 추천</option>
                  <option value="간판">간판/방문</option>
                  <option value="기타">기타</option>
                </select>
              </div>
            </div>
          )}

          {/* STEP 5: 개인정보 동의 */}
          {step === 5 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-purple-900 flex items-center gap-2">
                🔒 개인정보 · 의료정보 수집·이용 동의
              </h2>

              <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-700 max-h-40 overflow-y-auto">
                <h3 className="font-bold mb-2">1. 개인정보 수집·이용 동의</h3>
                <p className="mb-2">
                  아쿠수중운동센터는 상담 및 서비스 제공을 위해 아래와 같이 개인정보를 수집·이용합니다.
                </p>
                <ul className="list-disc list-inside space-y-1">
                  <li>수집 항목: 아동/보호자 성함, 생년월일, 연락처, 주소, 이용기관</li>
                  <li>수집 목적: 상담 진행, 회원 관리, 프로그램 안내</li>
                  <li>보유 기간: 상담·수업 종료 후 3년 (관계 법령에 따름)</li>
                  <li>동의 거부 시 상담 진행이 불가할 수 있습니다.</li>
                </ul>
              </div>

              <label className="flex items-start gap-3 p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-purple-300">
                <input type="checkbox" checked={form.agree_privacy}
                  onChange={(e) => update("agree_privacy", e.target.checked)}
                  className="mt-1 w-5 h-5 accent-purple-500" />
                <span className="text-sm">
                  <strong className="text-purple-700">[필수]</strong> 개인정보 수집·이용에 동의합니다.
                </span>
              </label>

              <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-700 max-h-40 overflow-y-auto">
                <h3 className="font-bold mb-2">2. 민감정보(의료정보) 수집·이용 동의</h3>
                <p className="mb-2">
                  안전한 수중재활 프로그램 진행을 위해 아래 의료정보를 수집·이용합니다.
                </p>
                <ul className="list-disc list-inside space-y-1">
                  <li>수집 항목: 진단명, 증상, 복용약물, 치료이력, 특이사항</li>
                  <li>수집 목적: 안전한 프로그램 설계, 위험 요소 사전 파악</li>
                  <li>보유 기간: 상담·수업 종료 후 3년</li>
                  <li>동의 거부 시 안전상의 이유로 프로그램 참여가 제한될 수 있습니다.</li>
                </ul>
              </div>

              <label className="flex items-start gap-3 p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-purple-300">
                <input type="checkbox" checked={form.agree_medical}
                  onChange={(e) => update("agree_medical", e.target.checked)}
                  className="mt-1 w-5 h-5 accent-purple-500" />
                <span className="text-sm">
                  <strong className="text-purple-700">[필수]</strong> 의료정보 수집·이용에 동의합니다.
                </span>
              </label>

              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <h3 className="font-medium text-purple-900 mb-2 text-sm">📋 신청 내용 최종 확인</h3>
                <div className="text-xs space-y-1 text-gray-700">
                  <div>👶 <strong>{form.child_name}</strong> ({form.gender}, {form.birth})</div>
                  <div>👨‍👩‍👧 보호자: {form.guardian_name} ({form.guardian_relation}) / {form.phone}</div>
                  <div>📅 희망 요일: {form.wish_days.join(", ")}</div>
                  <div>🕐 희망 시간: {form.wish_time_slots.length}개 선택</div>
                  {form.diagnosis && <div>🏥 진단: {form.diagnosis}</div>}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-8 flex gap-2">
            {step > 1 && (
              <button onClick={prev}
                className="flex-1 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 flex items-center justify-center gap-1">
                <ChevronLeft className="w-4 h-4" /> 이전
              </button>
            )}
            {step < 5 ? (
              <button onClick={next}
                className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium rounded-xl hover:from-purple-600 hover:to-pink-600 flex items-center justify-center gap-1 shadow-md">
                다음 <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={submit} disabled={submitting}
                className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl hover:from-emerald-600 hover:to-teal-600 flex items-center justify-center gap-2 shadow-md disabled:opacity-50">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> 접수 중...</> : <>✅ 신청 접수하기</>}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          🌊 아쿠수중운동센터 · 위례본점
        </p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, required, placeholder, type = "text" }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition-colors" />
    </div>
  );
}

function TextArea({ label, value, onChange, required, placeholder, rows = 3 }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <textarea value={value || ""} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} rows={rows}
        className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition-colors resize-none" />
    </div>
  );
}

function RadioGroup({ label, options, value, onChange, required }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt: string) => (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            className={`px-4 py-2 rounded-lg border-2 text-sm font-medium ${value === opt ? "bg-purple-500 border-purple-500 text-white" : "border-gray-200 text-gray-700 hover:border-purple-300"}`}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThankYou({ name }: { name: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-8 text-center">
        <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-purple-900 mb-2">
          🎉 신청이 접수되었습니다
        </h1>
        <p className="text-gray-600 mb-6">
          <strong className="text-purple-700">{name}</strong> 아동의 상담 신청이<br />
          정상적으로 접수되었습니다.
        </p>
        <div className="bg-purple-50 rounded-xl p-4 text-sm text-gray-700 mb-6 space-y-2">
          <div className="flex items-center gap-2 justify-center">
            <Clock className="w-4 h-4 text-purple-500" />
            <span><strong>1~3일 이내</strong>에 연락드리겠습니다</span>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <Phone className="w-4 h-4 text-purple-500" />
            <span>문의: 010-XXXX-XXXX</span>
          </div>
        </div>
        <a href="https://aqua-rehab.jungleweb.link/" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-purple-600 hover:underline">
          🌊 아쿠수중운동센터 소개 페이지 바로가기 →
        </a>
      </div>
    </div>
  );
}
