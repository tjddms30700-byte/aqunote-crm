"use client";
import { useState } from "react";
import Logo from "@/components/Logo";
import { CheckCircle2, ChevronRight, ChevronLeft, Loader2, Phone, Clock, AlertCircle } from "lucide-react";

const DAYS = ["월", "화", "수", "목", "금", "토"];
// v3.20.26: TIME_SLOTS 유지 상태 (이미 19:20~20:30 포함됨) · 20:30~21:40 토임도 포함
const TIME_SLOTS = [
  "10:00~11:10", "11:10~12:20", "12:20~13:30", "13:30~14:40",
  "14:40~15:50", "15:50~17:00", "17:00~18:10", "18:10~19:20",
  "19:20~20:30", "20:30~21:40",
];
// v3.20.26: 미운영 타임 목록 (안내용)
const UNAVAILABLE_TIMES = ["10:00~11:10", "11:10~12:20", "12:20~13:30"];
const UNAVAILABLE_DAYS = ["토"];
const BRANCHES = ["위례본점"];

export default function ApplyAdultPage() {
  // v3.20.23: 4단계 → 8단계 확장 (URL /apply-adult 유지)
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>(1);
  const TOTAL = 8;
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState<any>({
    // 기본 정보
    name: "",
    gender: "",
    birth: "",
    phone: "",
    address: "",
    // ✅ v3.16.1: 비상연락처 추가
    emergency_contact_name: "",
    emergency_contact_relation: "",
    emergency_contact_phone: "",
    // 의학 정보
    diagnosis: "",
    main_symptom: "",
    pain_area: "",
    // ✅ v3.16.1: 통증 상세 프로파일
    pain_scale: "",             // 0~10 VAS
    pain_start: "",              // 통증 시작 시기
    pain_pattern: "",            // 지속적/간헐적/움직일 때
    worsening_factor: "",
    relieving_factor: "",
    medication: "",
    treatment_history: "",
    surgery_history: "",
    // ✅ v3.16.1: 지병/기초질환 체크
    conditions: [] as string[],  // 고혈압/당뇨/심장/호흡/암/임신 등
    allergies: "",
    // ✅ v3.16.1: 생활/활동
    activity_level: "",          // 장애/안정적/활발
    smoking_drinking: "",
    sleep_quality: "",
    water_experience: "",        // 물 경험 수준
    swim_level: "",              // 수영 실력
    // 목표
    expected_change: "",
    priority_goals: [] as string[],  // 통증완화/근력/유연성/균형/체중감량 등
    // 희망시간
    wish_branch: "위례본점",
    wish_days: [] as string[],
    wish_time_slots: [] as string[],
    wish_frequency: "주 2회",     // ✅ v3.16.1: 희망 빈도
    wish_start_date: "",
    source: "",
    // 기타
    special_notes: "",            // ✅ v3.16.1: 자유 메모
    // 동의
    agree_privacy: false,
    agree_medical: false,
    // v3.20.25: STEP 3~6 신규 필드 상수화 (undefined 방지)
    occupation: "", exercise_freq: "", exercise_history: "",
    sleep: "", stress: "", smoke_alcohol: "",
    blood_pressure: "", heart_condition: "", diabetes: "",
    pregnancy: "", allergy: "", other_health: "",
    top_goal: "", avoid_situations: "", aqua_experience: "",
    water_reaction: "",
    agree_wait_notice: false,
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
    if (step === 6) {
      if (!form.agree_wait_notice) return "운영 안내(대기·운영시간)를 확인하고 동의해주세요";
    }
    if (step === 7) {
      if (form.wish_days.length === 0) return "희망 요일을 최소 1개 선택해주세요";
      if (form.wish_time_slots.length === 0) return "희망 시간을 최소 1개 선택해주세요";
    }
    if (step === 8) {
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
            <span className="text-xs font-medium text-blue-700">STEP {step} / {TOTAL}</span>
            <span className="text-xs text-gray-500">{Math.round(step / TOTAL * 100)}% 완료</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
              style={{ width: `${step / TOTAL * 100}%` }}></div>
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

              {/* ✅ v3.16.1: 비상 연락처 */}
              <div className="bg-red-50/50 border border-red-200 rounded-xl p-3">
                <div className="text-xs font-bold text-red-800 mb-2">📞 비상 연락처 (응급상황 시)</div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="이름" value={form.emergency_contact_name}
                    onChange={(v: string) => update("emergency_contact_name", v)} placeholder="예: 배우자/자녀" />
                  <Field label="관계" value={form.emergency_contact_relation}
                    onChange={(v: string) => update("emergency_contact_relation", v)} placeholder="배우자/자녀/부모" />
                </div>
                <div className="mt-2">
                  <Field label="연락처" value={form.emergency_contact_phone}
                    onChange={(v: string) => update("emergency_contact_phone", v)} placeholder="010-0000-0000" />
                </div>
              </div>
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
              {/* ✅ v3.16.1: 통증 상세 프로파일 */}
              {form.pain_area && (
                <div className="bg-orange-50/50 border border-orange-200 rounded-xl p-3 space-y-3">
                  <div className="text-xs font-bold text-orange-800">📊 통증 상세</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="통증 강도 (0~10)" value={form.pain_scale}
                      onChange={(v: string) => update("pain_scale", v)} placeholder="예: 6/10" />
                    <Field label="시작 시기" value={form.pain_start}
                      onChange={(v: string) => update("pain_start", v)} placeholder="예: 3개월 전" />
                  </div>
                  <RadioGroup label="통증 양상" options={["지속적", "간헐적", "움직일 때만", "안정 시만"]}
                    value={form.pain_pattern} onChange={(v: string) => update("pain_pattern", v)} />
                  <Field label="악화 요인" value={form.worsening_factor}
                    onChange={(v: string) => update("worsening_factor", v)} placeholder="예: 오래 걷기, 계단, 추웄 때" />
                  <Field label="완화 요인" value={form.relieving_factor}
                    onChange={(v: string) => update("relieving_factor", v)} placeholder="예: 휴식, 따뜻한 가늨, 진통제 시" />
                </div>
              )}

              {/* ✅ v3.16.1: 기초 질환 / 알레르기 */}
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block">🩺 기초 질환 (복수 선택)</label>
                <div className="flex flex-wrap gap-1.5">
                  {["고혈압", "당뇨", "심장질환", "호흡기질환", "암 병력", "갑상선", "임신 중", "간질환", "근육계 질환", "기타"].map((c) => (
                    <button type="button" key={c}
                      onClick={() => toggleArray("conditions", c)}
                      className={`px-3 py-1.5 rounded-lg text-xs border-2 ${form.conditions?.includes(c) ? "bg-red-100 text-red-800 border-red-400 font-bold" : "bg-white border-gray-200 text-gray-600"}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="알레르기 (약/음식/기타)" value={form.allergies}
                onChange={(v: string) => update("allergies", v)} placeholder="예: 페니실린, 걱감류, 명쉼하게" />

              {/* ✅ v3.16.1: 생활 / 수영 경험 */}
              <div className="grid grid-cols-1 gap-3">
                <RadioGroup label="평소 활동량"
                  options={["거의 안 함", "가벼운 산책", "보통 종종 운동", "꾸준히 운동"]}
                  value={form.activity_level} onChange={(v: string) => update("activity_level", v)} />
                <RadioGroup label="수면 상태"
                  options={["좋음", "보통", "불량", "약 복용 중"]}
                  value={form.sleep_quality} onChange={(v: string) => update("sleep_quality", v)} />
              </div>

              <TextArea label="기대하는 변화" value={form.expected_change}
                onChange={(v: string) => update("expected_change", v)}
                placeholder="수중재활을 통해 개선하고 싶은 부분" rows={2} />
            </div>
          )}

          {/* v3.20.23: STEP 3 (구 3도 희망시간이었으나) → STEP 7로 이동 */}
          {/* STEP 3 신규: 생활 습관 / 직업 · 운동 이력 */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-blue-900">🏃 생활 습관 / 직업 · 운동 이력</h2>
              <Field label="직업" value={form.occupation || ""}
                onChange={(v: string) => update("occupation", v)} placeholder="예: 사무직, 교사, 자영업 등" />
              <RadioGroup label="평소 운동 빈도" options={["안함","주 1회","주 2~3회","주 4회 이상"]}
                value={form.exercise_freq || ""} onChange={(v: string) => update("exercise_freq", v)} />
              <TextArea label="운동 이력" value={form.exercise_history || ""}
                onChange={(v: string) => update("exercise_history", v)} placeholder="예: 수영 3년 이상, 헬스 3개월 이상" rows={2} />
              <RadioGroup label="수면 시간" options={["5시간 미만","5~7시간","7~8시간","8시간 이상"]}
                value={form.sleep || ""} onChange={(v: string) => update("sleep", v)} />
              <RadioGroup label="스트레스 수준" options={["낮음","보통","높음","매우 높음"]}
                value={form.stress || ""} onChange={(v: string) => update("stress", v)} />
              <RadioGroup label="흡연 · 음주" options={["모두 안함","음주만","흡연만","모두 함"]}
                value={form.smoke_alcohol || ""} onChange={(v: string) => update("smoke_alcohol", v)} />
            </div>
          )}

          {/* v3.20.23: STEP 4 신규 – 건강 위험 유무 */}
          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-blue-900">🩺 건강 위험 평가</h2>
              <p className="text-xs text-gray-500">안전한 수중재활 진행을 위해 사전 확인이 필요한 문항입니다.</p>
              <Field label="협압 (숫자 또는 '정상')" value={form.blood_pressure || ""}
                onChange={(v: string) => update("blood_pressure", v)} placeholder="예: 130/85, 정상" />
              <RadioGroup label="심장 질환 이력" options={["없음","있음(치료 완료)","있음(치료 중)"]}
                value={form.heart_condition || ""} onChange={(v: string) => update("heart_condition", v)} />
              <RadioGroup label="당뇨 이력" options={["없음","경계","있음(약물 복용)","있음(인슐린)"]}
                value={form.diabetes || ""} onChange={(v: string) => update("diabetes", v)} />
              <RadioGroup label="임신 여부 (해당 시)" options={["해당없음","임신 준비중","임신중","산후"]}
                value={form.pregnancy || ""} onChange={(v: string) => update("pregnancy", v)} />
              <RadioGroup label="알레르기 / 피부질환" options={["없음","경미","있음(관리 중)"]}
                value={form.allergy || ""} onChange={(v: string) => update("allergy", v)} />
              <TextArea label="기타 주의사항" value={form.other_health || ""}
                onChange={(v: string) => update("other_health", v)} rows={2} />
            </div>
          )}

          {/* v3.20.23: STEP 5 신규 – 자기 니즈 */}
          {step === 5 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-blue-900">💬 자기 니즈 · 목표</h2>
              <TextArea label="수중재활을 통해 가장 해결하고 싶은 점" value={form.top_goal || ""}
                onChange={(v: string) => update("top_goal", v)} rows={2} />
              <TextArea label="피하고 싶은 동작 / 하기 어려운 자세" value={form.avoid_situations || ""}
                onChange={(v: string) => update("avoid_situations", v)} rows={2} />
              <RadioGroup label="수중재활 경험" options={["처음","해본 경험이 있음","꾸준히 경험"]}
                value={form.aqua_experience || ""} onChange={(v: string) => update("aqua_experience", v)} />
              <RadioGroup label="물 적응도" options={["두려움","낯섬","보통","편안함"]}
                value={form.water_reaction || ""} onChange={(v: string) => update("water_reaction", v)} />
              <RadioGroup label="수영 가능 수준" options={["모름","부유도구로 물에 뜨기 가능","부유도구로도 물에 뜨기 불가능","자유형 가능"]}
                value={form.swim_level || ""} onChange={(v: string) => update("swim_level", v)} />
            </div>
          )}

          {/* v3.20.26: STEP 6 센터 이용 안내 – 수강료 안내 삭제, 문구 전면 교체 */}
          {step === 6 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-blue-900">🏢 센터 이용 안내</h2>
              <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 text-sm text-amber-900 leading-relaxed space-y-1">
                <div className="font-bold text-amber-800">⏰ 운영 시간 안내</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>평일 13:00~22:00</strong> (하루 고정 7타임만 진행)</li>
                  <li>평일 오전 타임(10:00~12:00) 및 토요일은 현재 운영하고 있지 않습니다.</li>
                  <li>일요일 및 공휴일은 휴무입니다.</li>
                </ul>
              </div>
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 text-sm text-red-900 leading-relaxed space-y-1">
                <div className="font-bold text-red-800">⚠️ 대기 시스템 안내</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>현재 주요 피크타임은 기존 회원들의 고정석으로 거의 다 찬 상태라 <strong>평균 6개월 이상의 대기</strong>가 발생하고 있습니다. (치료가 급하신 경우 다른 센터 이용을 권장드립니다.)</li>
                  <li>희망 요일 및 시간대를 대기 시스템에 먼저 등록해 주시면, <strong>공석 및 스케줄 변동이 발생하는 대로 대기 순번에 따라 최우선으로 안내</strong>해 드립니다.</li>
                  <li>일정 조율에 시간이 소요될 수 있는 점 너른 양해 부탁드리며, 정성껏 준비하여 안내 도와드리겠습니다.</li>
                </ul>
              </div>
              <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-blue-200 bg-white cursor-pointer hover:bg-blue-50">
                <input type="checkbox" checked={!!form.agree_wait_notice}
                  onChange={e => update("agree_wait_notice", e.target.checked)}
                  className="w-5 h-5 mt-0.5" />
                <div className="text-sm text-gray-800">
                  <div className="font-bold">위 운영 안내 및 대기 이용 조건을 확인하였으며, 대기 지원에 동의합니다.</div>
                  <div className="text-xs text-gray-500 mt-1">(평일 13:00~22:00 우선 안내, 오전·주말 오픈 시 추가 안내)</div>
                </div>
              </label>
            </div>
          )}

          {/* STEP 7 (구 3): 희망 요일·시간 */}
          {step === 7 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-blue-900">📅 희망 요일 · 시간</h2>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 leading-relaxed">
                ⏰ <strong>가능한 요일·시간을 최대한 많이 선택해주시면 최대한 빨리 수업이 가능한 시간으로 안내드립니다.</strong> 정규수업이 가능한 시간이 생긴 경우에만 체험이 가능합니다.
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 leading-relaxed">
                ※ 10시, 11시 10분, 12시 20분 타임과 토요일의 경우 현재 운영하고 있지 않으나 추후 오픈 시 수업을 원하시는 분만 선택해 주세요.
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
                  {DAYS.map(d => {
                    const unavailable = UNAVAILABLE_DAYS.includes(d);
                    return (
                      <button key={d} type="button" onClick={() => toggleArray("wish_days", d)}
                        className={`py-3 rounded-lg border-2 font-medium relative ${form.wish_days.includes(d) ? "bg-blue-500 border-blue-500 text-white" : unavailable ? "border-red-200 text-red-500 bg-red-50/40 hover:border-red-300" : "border-gray-200 hover:border-blue-300"}`}>
                        {d}
                        {unavailable && <span className="absolute -top-1 -right-1 text-[8px] bg-red-500 text-white rounded-full px-1">미운영</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] text-red-700 mt-1">※ 토요일은 현재 운영하지 않으나 추후 오픈 대기를 원하시면 체크 가능</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  희망 시간대 <span className="text-red-500">*</span> ({form.wish_time_slots.length}개)
                </label>
                {/* v3.20.27: 토요일 선택 시 모든 시간대 미운영 안내 표시 */}
                {form.wish_days.includes("토") && (
                  <div className="mb-2 p-2 rounded-lg bg-red-50 border-2 border-red-300 text-[11px] text-red-800 font-semibold">
                    ⚠️ 토요일은 <strong>모든 시간대가 현재 운영하고 있지 않습니다.</strong> 추후 오픈 시 수업을 원하시는 분만 시간대를 선택해 주세요.
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {TIME_SLOTS.map(t => {
                    // v3.20.27: 토요일 선택 시 모든 시간대가 미운영, 그 외에는 오전 3개 타임만 미운영
                    const satSelected = form.wish_days.includes("토") && !form.wish_days.some((d: string) => d !== "토");
                    const unavailable = UNAVAILABLE_TIMES.includes(t) || satSelected;
                    return (
                      <button key={t} type="button" onClick={() => toggleArray("wish_time_slots", t)}
                        className={`py-2 px-2 rounded-lg border-2 text-sm relative ${form.wish_time_slots.includes(t) ? "bg-blue-500 border-blue-500 text-white" : unavailable ? "border-red-200 text-red-500 bg-red-50/40 hover:border-red-300" : "border-gray-200 hover:border-blue-300"}`}>
                        {t}
                        {unavailable && <span className="absolute -top-1 -right-1 text-[8px] bg-red-500 text-white rounded-full px-1">미운영</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] text-red-700 mt-1">※ 10시, 11시 10분, 12시 20분 타임 <strong>및 토요일 전 시간대</strong>는 미운영 상태이며 추후 오픈 시 수업을 원하시는 분만 선택해 주세요.</div>
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

          {/* STEP 8 (구 4): 개인정보 동의 */}
          {step === 8 && (
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
            {step < 8 ? (
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
            <span><strong>확인 후 순차적으로</strong> 연락드리겠습니다</span>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <Phone className="w-4 h-4 text-blue-500" />
            <span>문의: 010-8114-8275</span>
          </div>
        </div>
        <a href="https://aqua-rehab.jungleweb.link/" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
          🌊 아쿠수중운동센터 소개 페이지 바로가기 →
        </a>
      </div>
    </div>
  );
}
