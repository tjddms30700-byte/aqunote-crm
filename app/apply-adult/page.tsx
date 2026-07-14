"use client";
import { useState } from "react";
import Logo from "@/components/Logo";
import { CheckCircle2, ChevronRight, ChevronLeft, Loader2, Phone, Clock, AlertCircle } from "lucide-react";

const DAYS = ["월", "화", "수", "목", "금", "토"];
const TIME_SLOTS = [
  "10:00~11:10", "11:10~12:20", "12:20~13:30", "13:30~14:40",
  "14:40~15:50", "15:50~17:00", "17:00~18:10", "18:10~19:20",
  "19:20~20:30", "20:30~21:40",
];
const BRANCHES = ["위례본점"];

export default function ApplyAdultPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState<any>({
    name: "",
    gender: "",
    birth: "",
    phone: "",
    address: "",
    // 의학 정보
    diagnosis: "",
    main_symptom: "",
    pain_area: "",
    medication: "",
    treatment_history: "",
    surgery_history: "",
    expected_change: "",
    // 희망시간
    wish_branch: "위례본점",
    wish_days: [] as string[],
    wish_time_slots: [] as string[],
    wish_start_date: "",
    source: "",
    // 동의
    agree_privacy: false,
    agree_medical: false,
  });

  function update(k: string, v: any) { setForm({ ...form, [k]: v }); }
  function toggleArray(k: string, v: string) {
    const cur = form[k] || [];
    update(k, cur.includes(v) ? cur.filter((x: string) => x !== v) : [...cur, v]);
  }

  function validateStep(): string {
    if (step === 1) {
      if (!form.name) return "성함을 입력해주세요";
      if (!form.gender) return "성별을 선택해주세요";
      if (!form.birth) return "생년월일을 입력해주세요";
      if (!form.phone) return "연락처를 입력해주세요";
      if (!/^01[0-9]-?\d{3,4}-?\d{4}$/.test(form.phone.replace(/\s/g, ""))) return "올바른 휴대폰 번호 형식이 아닙니다";
    }
    if (step === 3) {
      if (form.wish_days.length === 0) return "희망 요일을 최소 1개 선택해주세요";
      if (form.wish_time_slots.length === 0) return "희망 시간을 최소 1개 선택해주세요";
    }
    if (step === 4) {
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
  function prev() { setError(""); setStep((step - 1) as any); window.scrollTo(0, 0); }

  async function submit() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, member_type: "adult" }),
      });
      const j = await res.json();
      if (j.success) setDone(true);
      else setError("접수 실패: " + (j.error || "알 수 없는 오류"));
    } catch (e: any) {
      setError("네트워크 오류: " + e.message);
    }
    setSubmitting(false);
  }

  if (done) return <ThankYou name={form.name} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-white pb-10">
      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white p-6 pb-8 rounded-b-3xl shadow-lg">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Logo size="md" />
          <div>
            <h1 className="text-xl font-bold">🐳 아쿠수중운동센터</h1>
            <p className="text-xs opacity-90">성인 상담·체험 신청서</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-4">
        <div className="bg-white rounded-2xl shadow-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-blue-700">STEP {step} / 4</span>
            <span className="text-xs text-gray-500">{Math.round(step / 4 * 100)}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
              style={{ width: `${step / 4 * 100}%` }}></div>
          </div>
        </div>

        {step === 1 && (
          <div className="bg-white rounded-2xl p-5 mb-4 shadow-md border-l-4 border-blue-400">
            <p className="text-sm text-gray-700 leading-relaxed">
              안녕하세요 😊 아쿠수중운동센터 성인 상담·체험 신청서입니다.<br /><br />
              저희는 <strong className="text-blue-700">1:1 수중재활 전문 센터</strong>로 하루 7타임만 운영하고 있으며,
              현재 평균 대기 <strong>3~6개월</strong> 이상인 경우가 많습니다.
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-md p-6">
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-blue-900">👤 기본 정보</h2>
              <Field label="성함" required value={form.name}
                onChange={(v: string) => update("name", v)} placeholder="예: 홍길동" />
              <RadioGroup label="성별" required options={["남", "여"]}
                value={form.gender} onChange={(v: string) => update("gender", v)} />
              <Field label="생년월일" type="date" required value={form.birth}
                onChange={(v: string) => update("birth", v)} />
              <Field label="연락처" required value={form.phone}
                onChange={(v: string) => update("phone", v)} placeholder="010-0000-0000" />
              <Field label="주소" value={form.address}
                onChange={(v: string) => update("address", v)} placeholder="시/군/구까지만 입력하셔도 됩니다" />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-blue-900">
                🏥 의학·재활 관련 정보 <span className="text-xs font-normal text-gray-500">(선택입력)</span>
              </h2>
              <TextArea label="진단명" value={form.diagnosis}
                onChange={(v: string) => update("diagnosis", v)}
                placeholder="예: 요추 디스크, 오십견, 관절염, 뇌졸중 후유증 등" rows={2} />
              <TextArea label="주 증상 / 현재 상태" value={form.main_symptom}
                onChange={(v: string) => update("main_symptom", v)}
                placeholder="현재 겪고 계신 통증·불편·제한 사항을 자유롭게 적어주세요" rows={3} />
              <Field label="통증 부위" value={form.pain_area}
                onChange={(v: string) => update("pain_area", v)}
                placeholder="예: 오른쪽 무릎, 허리, 어깨 등" />
              <TextArea label="복용 중인 약물" value={form.medication}
                onChange={(v: string) => update("medication", v)}
                placeholder="현재 복용 중인 약물이 있다면 (혈압약, 진통제, 근이완제 등)" rows={2} />
              <TextArea label="치료 이력" value={form.treatment_history}
                onChange={(v: string) => update("treatment_history", v)}
                placeholder="지금까지 받은 치료 (물리치료, 도수치료, 주사 등)" rows={2} />
              <TextArea label="수술 이력" value={form.surgery_history}
                onChange={(v: string) => update("surgery_history", v)}
                placeholder="수술 받으신 적이 있다면 부위 · 시기" rows={2} />
              <TextArea label="기대하는 변화" value={form.expected_change}
                onChange={(v: string) => update("expected_change", v)}
                placeholder="수중재활을 통해 개선하고 싶은 부분" rows={2} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-blue-900">📅 희망 요일 · 시간</h2>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                ⏰ <strong>가능한 요일·시간을 최대한 많이 선택해주시면 빠른 배정이 가능합니다.</strong>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">희망 지점</label>
                <div className="flex gap-2">
                  {BRANCHES.map(b => (
                    <button key={b} type="button" onClick={() => update("wish_branch", b)}
                      className={`px-4 py-2 rounded-lg border-2 text-sm ${form.wish_branch === b ? "bg-blue-500 border-blue-500 text-white" : "border-gray-200"}`}>
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  희망 요일 <span className="text-red-500">*</span> ({form.wish_days.length}개)
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {DAYS.map(d => (
                    <button key={d} type="button" onClick={() => toggleArray("wish_days", d)}
                      className={`py-3 rounded-lg border-2 font-medium ${form.wish_days.includes(d) ? "bg-blue-500 border-blue-500 text-white" : "border-gray-200"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  희망 시간대 <span className="text-red-500">*</span> ({form.wish_time_slots.length}개)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TIME_SLOTS.map(t => (
                    <button key={t} type="button" onClick={() => toggleArray("wish_time_slots", t)}
                      className={`py-2 px-2 rounded-lg border-2 text-sm ${form.wish_time_slots.includes(t) ? "bg-blue-500 border-blue-500 text-white" : "border-gray-200"}`}>
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
                  className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none">
                  <option value="">선택해주세요</option>
                  <option value="네이버검색">네이버 검색</option>
                  <option value="구글검색">구글 검색</option>
                  <option value="블로그">블로그</option>
                  <option value="인스타그램">인스타그램</option>
                  <option value="유튜브">유튜브</option>
                  <option value="지인추천">지인 추천</option>
                  <option value="타기관추천">병원/타 기관 추천</option>
                  <option value="간판">간판/방문</option>
                  <option value="기타">기타</option>
                </select>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-blue-900">🔒 개인정보 · 의료정보 동의</h2>

              <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-700 max-h-40 overflow-y-auto">
                <h3 className="font-bold mb-2">개인정보 수집·이용 동의</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>수집 항목: 성함, 생년월일, 연락처, 주소</li>
                  <li>목적: 상담 진행, 회원 관리, 프로그램 안내</li>
                  <li>보유: 상담·수업 종료 후 3년</li>
                </ul>
              </div>
              <label className="flex items-start gap-3 p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-300">
                <input type="checkbox" checked={form.agree_privacy}
                  onChange={(e) => update("agree_privacy", e.target.checked)}
                  className="mt-1 w-5 h-5 accent-blue-500" />
                <span className="text-sm"><strong className="text-blue-700">[필수]</strong> 개인정보 수집·이용에 동의합니다.</span>
              </label>

              <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-700 max-h-40 overflow-y-auto">
                <h3 className="font-bold mb-2">민감정보(의료정보) 수집·이용 동의</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>수집 항목: 진단명, 증상, 통증부위, 복용약물, 치료·수술 이력</li>
                  <li>목적: 안전한 프로그램 설계</li>
                </ul>
              </div>
              <label className="flex items-start gap-3 p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-300">
                <input type="checkbox" checked={form.agree_medical}
                  onChange={(e) => update("agree_medical", e.target.checked)}
                  className="mt-1 w-5 h-5 accent-blue-500" />
                <span className="text-sm"><strong className="text-blue-700">[필수]</strong> 의료정보 수집·이용에 동의합니다.</span>
              </label>

              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h3 className="font-medium text-blue-900 mb-2 text-sm">📋 신청 내용 최종 확인</h3>
                <div className="text-xs space-y-1 text-gray-700">
                  <div>👤 <strong>{form.name}</strong> ({form.gender}, {form.birth})</div>
                  <div>📞 {form.phone}</div>
                  <div>📅 희망 요일: {form.wish_days.join(", ")}</div>
                  <div>🕐 희망 시간: {form.wish_time_slots.length}개 선택</div>
                  {form.diagnosis && <div>🏥 진단: {form.diagnosis}</div>}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}

          <div className="mt-8 flex gap-2">
            {step > 1 && (
              <button onClick={prev}
                className="flex-1 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 flex items-center justify-center gap-1">
                <ChevronLeft className="w-4 h-4" /> 이전
              </button>
            )}
            {step < 4 ? (
              <button onClick={next}
                className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium rounded-xl hover:from-blue-600 hover:to-cyan-600 flex items-center justify-center gap-1 shadow-md">
                다음 <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={submit} disabled={submitting}
                className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md disabled:opacity-50">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> 접수 중...</> : <>✅ 신청 접수하기</>}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">🌊 아쿠수중운동센터 · 위례본점</p>
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
        className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none" />
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
        className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none resize-none" />
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
            className={`px-4 py-2 rounded-lg border-2 text-sm font-medium ${value === opt ? "bg-blue-500 border-blue-500 text-white" : "border-gray-200 text-gray-700 hover:border-blue-300"}`}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
function ThankYou({ name }: { name: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-8 text-center">
        <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-blue-900 mb-2">🎉 신청이 접수되었습니다</h1>
        <p className="text-gray-600 mb-6">
          <strong className="text-blue-700">{name}</strong>님의 상담 신청이<br />
          정상적으로 접수되었습니다.
        </p>
        <div className="bg-blue-50 rounded-xl p-4 text-sm text-gray-700 mb-6 space-y-2">
          <div className="flex items-center gap-2 justify-center">
            <Clock className="w-4 h-4 text-blue-500" />
            <span><strong>1~3일 이내</strong>에 연락드리겠습니다</span>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <Phone className="w-4 h-4 text-blue-500" />
            <span>문의: 010-XXXX-XXXX</span>
          </div>
        </div>
        <button onClick={() => window.location.href = "/"}
          className="text-sm text-blue-600 hover:underline">
          센터 소개 페이지로 →
        </button>
      </div>
    </div>
  );
}
