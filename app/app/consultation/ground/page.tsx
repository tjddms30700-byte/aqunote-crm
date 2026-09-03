"use client";

// ═══════════════════════════════════════════════════════════════
// 🏋️‍♂️ v3.42.2 지상재활 (운동재활 & 디바이스케어) 전용 신청폼
// URL: /consultation/ground
// v3.42.2: import 순서 정리 + Visual Body Map SVG 적용
// ═══════════════════════════════════════════════════════════════

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import GroundBodyMap from "@/components/GroundBodyMap";


// ✅ v3.41.0: Body Map 부위 전면 개편 - 앞면 22개 + 뒷면 9개 + 기타
const BODY_PARTS = [
  // ── 앞면 (Front) ──
  { key: "neck_front", label: "목", region: "front" },
  { key: "shoulder_l", label: "왼쪽 어깨", region: "front" },
  { key: "shoulder_r", label: "오른쪽 어깨", region: "front" },
  { key: "chest_l", label: "왼쪽 가슴", region: "front" },
  { key: "chest_r", label: "오른쪽 가슴", region: "front" },
  { key: "elbow_l", label: "왼쪽 팔꿈치", region: "front" },
  { key: "elbow_r", label: "오른쪽 팔꿈치", region: "front" },
  { key: "wrist_l", label: "왼쪽 손목", region: "front" },
  { key: "wrist_r", label: "오른쪽 손목", region: "front" },
  { key: "fingers", label: "손가락", region: "front" },
  { key: "pelvis_l", label: "왼쪽 골반", region: "front" },
  { key: "pelvis_r", label: "오른쪽 골반", region: "front" },
  { key: "hip_joint_l", label: "좌측 고관절", region: "front" },
  { key: "hip_joint_r", label: "우측 고관절", region: "front" },
  { key: "groin_l", label: "왼쪽 사타구니", region: "front" },
  { key: "groin_r", label: "오른쪽 사타구니", region: "front" },
  { key: "knee_l", label: "왼쪽 무릎", region: "front" },
  { key: "knee_r", label: "오른쪽 무릎", region: "front" },
  { key: "ankle_l", label: "왼쪽 발목", region: "front" },
  { key: "ankle_r", label: "오른쪽 발목", region: "front" },
  { key: "toes", label: "발가락", region: "front" },
  // ── 뒷면 (Back) ──
  { key: "neck_back", label: "목", region: "back" },
  { key: "shoulder_back", label: "어깨", region: "back" },
  { key: "scapula_spine", label: "날개뼈와 척추사이", region: "back" },
  { key: "upper_back", label: "등 상부", region: "back" },
  { key: "lower_back", label: "허리", region: "back" },
  { key: "buttock", label: "엉덩이", region: "back" },
  { key: "hamstring", label: "허벅지 뒤", region: "back" },
  { key: "calf", label: "종아리", region: "back" },
  { key: "sole", label: "발바닥", region: "back" },
  // ── 기타 ──
  { key: "other", label: "기타 (직접 입력)", region: "other" },
];

// ✅ v3.41.0: 교정/재활 목적 - "관절 가동범위 개선" → "움직임 범위 개선" 명칭 변경
//   + 복수 선택 가능으로 변경 (단일 → 다중)
const REHAB_PURPOSES = [
  "체형 교정",
  "만성 통증 완화",
  "근력 강화",
  "부상 재활",
  "움직임 범위 개선",
  "자세 개선",
  "운동 수행능력 향상",
  "산후 회복",
  "노인성 근감소증 예방",
  "기타",
];

// ✅ v3.39.0: 통증 양상 및 시기 옵션
const PAIN_ONSET = ["1개월 미만", "1~6개월", "6개월 이상"];
// ✅ v3.41.0: 발생 조건 - "자고 있을 때 통증" 신규 추가
const PAIN_TRIGGER = [
  "가만히 있을 때도 통증",
  "특정 동작/움직임 시 통증",
  "체중을 실을 때 통증",
  "자고 일어났을 때 통증",
  "자고 있을 때 통증",
];
// ✅ v3.41.0: 느낌/양상 - "이외의 통증" 신규 추가
const PAIN_QUALITY = [
  "뻐근함·결림",
  "찌릿함·날카로움",
  "관절 소리/불안정",
  "부종·피로감",
  "이외의 통증",
];

// ✅ v3.39.0: 안전 사전 체크 (필수)
const SAFETY_CHECKS = [
  "해당 없음",
  "최근 수술 이력",
  "금속 핀/체내 삽입물",
  "디스크 진단",
  "골절 회복 중",
  "임신 중",
];

// ✅ v3.40.7: 희망 요일 (다중 선택)
const WEEKDAYS_GROUND = [
  { key: "월", label: "월" },
  { key: "화", label: "화" },
  { key: "수", label: "수" },
  { key: "목", label: "목" },
  { key: "금", label: "금" },
  { key: "토", label: "토" },
  { key: "일", label: "일" },
];

// ✅ v3.40.7: 성별
const GENDERS = [
  { key: "female", label: "여성" },
  { key: "male", label: "남성" },
];

// ✅ v3.39.0: 생활 습관 (선택)
const LIFESTYLE = [
  "장시간 좌식",
  "서서 근무",
  "무거운 물건 들기",
  "특정 운동 반복",
];

export default function GroundConsultationPage() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    birth: "",
    gender: "" as "" | "female" | "male", // ✅ v3.40.7: 성별 필수
    address: "",
    guardian_name: "",
    guardian_phone: "",
    member_type: "adult" as "adult" | "child",
    // ✅ v3.40.7: 희망 요일(다중) + 희망 시간대(자유텍스트) + 연락 가능 시간
    //   지상재활은 시간표 미확정이라 고정 슬롯 대신 자유 텍스트로 접수
    wish_days: [] as string[],
    wish_time_text: "",       // 예: "평일 오전 10~12시", "주말 저녁 아무때나"
    contact_time: "",         // 예: "평일 오후 6시 이후 연락 가능"
    pain_areas: [] as string[],
    pain_area_other: "", // ✅ v3.39.0: 기타/상세 부위 텍스트
    nrs_score: 5,
    // ✅ v3.41.0: 재활 목적 복수 선택 (기존 rehab_purpose 단일 → rehab_purposes 배열)
    rehab_purpose: "", // 하위 호환 유지 (첫번째 선택값을 저장)
    rehab_purposes: [] as string[],
    // ✅ v3.39.0: 신규 문진 필드
    pain_onset: "", // 발생 시기 (단일 선택)
    pain_triggers: [] as string[], // 발생 조건 (복수)
    pain_trigger_detail: "", // ✅ v3.41.0: 발생 조건 상세 메모 (자유 텍스트)
    pain_quality: [] as string[], // 느낌/양상 (복수)
    safety_checks: [] as string[], // 안전 사전 체크 (복수, 필수)
    lifestyle: [] as string[], // 생활 습관 (복수)
    lifestyle_hobby: "", // ✅ v3.41.0: 운동/취미 자유 텍스트 (통증 분석용)
    memo: "",
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  function togglePainArea(key: string) {
    setForm(f => ({
      ...f,
      pain_areas: f.pain_areas.includes(key)
        ? f.pain_areas.filter(k => k !== key)
        : [...f.pain_areas, key]
    }));
  }

  // ✅ v3.41.0: 재활 목적 복수 선택 토글
  function toggleRehabPurpose(purpose: string) {
    setForm(f => {
      const cur = f.rehab_purposes;
      const next = cur.includes(purpose)
        ? cur.filter(p => p !== purpose)
        : [...cur, purpose];
      return { ...f, rehab_purposes: next, rehab_purpose: next[0] || "" };
    });
  }

  // ✅ v3.40.7: 희망 요일 다중 선택 토글
  function toggleWishDay(day: string) {
    setForm(f => ({
      ...f,
      wish_days: f.wish_days.includes(day)
        ? f.wish_days.filter(d => d !== day)
        : [...f.wish_days, day]
    }));
  }

  function toggleMulti(field: "pain_triggers" | "pain_quality" | "safety_checks" | "lifestyle", value: string) {
    setForm(f => {
      const cur = f[field] as string[];
      // "해당 없음"은 다른 항목과 배타
      if (field === "safety_checks") {
        if (value === "해당 없음") return { ...f, [field]: cur.includes(value) ? [] : ["해당 없음"] };
        const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur.filter(v => v !== "해당 없음"), value];
        return { ...f, [field]: next };
      }
      return {
        ...f,
        [field]: cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value]
      };
    });
  }

  async function submit() {
    if (!form.name.trim()) return alert("성함을 입력해주세요");
    if (!form.phone.trim()) return alert("연락처를 입력해주세요");
    // ✅ v3.40.7: 성별 필수
    if (!form.gender) return alert("성별을 선택해주세요");
    // ✅ v3.39.0: 안전 체크 필수
    if (form.safety_checks.length === 0) {
      return alert("안전 사전 체크는 필수입니다.\n해당 사항이 없으면 '해당 없음'을 선택해주세요.");
    }
    setSaving(true);

    try {
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      // ✅ v3.40.7: 성별 · 희망요일 · 희망시간(자유텍스트) · 연락가능시간 추가 저장
      //   leads_inbox 컬럼에 없을 수 있으므로 화이트리스트 재시도로 자동 제거되며
      //   raw_payload JSON 에는 반드시 동시 저장 → 상세페이지가 이 JSON에서 폴백 조회
      const payload: any = {
        org_id: orgId,
        name: form.name.trim(),
        phone: form.phone.trim(),
        birth: form.birth || null,
        gender: form.gender || null,
        address: form.address || null,
        guardian_name: form.guardian_name || null,
        guardian_phone: form.guardian_phone || null,
        member_type: form.member_type,
        wish_days: form.wish_days.length > 0 ? form.wish_days : null,
        wish_time_slots: form.wish_time_text ? [form.wish_time_text] : null,
        source: "web_ground",
        service_track: "ground",
        pain_areas: form.pain_areas,
        nrs_score: form.nrs_score,
        rehab_purpose: form.rehab_purpose,
        rehab_purposes: form.rehab_purposes, // ✅ v3.41.0: 복수 선택 배열
        memo: form.memo,
        status: "new",
        processed: false,
        raw_payload: {
          // ── 기본 인적사항 (상세페이지 폴백용 완전 백업) ──
          name: form.name.trim(),
          phone: form.phone.trim(),
          birth: form.birth || null,
          gender: form.gender || null,
          address: form.address || null,
          guardian_name: form.guardian_name || null,
          guardian_phone: form.guardian_phone || null,
          member_type: form.member_type,
          // ── 희망 스케줄 (지상은 시간표 미확정 → 자유 텍스트) ──
          wish_days: form.wish_days,
          wish_time_text: form.wish_time_text,   // 예: "평일 오전 10~12시"
          contact_time: form.contact_time,       // 예: "평일 저녁 이후 연락"
          // ── 지상재활 특화 필드 ──
          service_track: "ground",
          pain_areas: form.pain_areas,
          pain_area_other: form.pain_area_other,
          nrs_score: form.nrs_score,
          rehab_purpose: form.rehab_purpose,
          rehab_purposes: form.rehab_purposes, // ✅ v3.41.0: 복수 선택 배열
          // ✅ v3.39.0: 신규 문진 데이터 raw_payload에도 저장
          pain_onset: form.pain_onset,
          pain_triggers: form.pain_triggers,
          pain_trigger_detail: form.pain_trigger_detail, // ✅ v3.41.0
          pain_quality: form.pain_quality,
          safety_checks: form.safety_checks,
          lifestyle: form.lifestyle,
          lifestyle_hobby: form.lifestyle_hobby, // ✅ v3.41.0: 운동/취미 자유 텍스트
        },
      };

      // 화이트리스트 재시도 (없는 컬럼 자동 제거)
      let attempt = payload;
      for (let i = 0; i < 10; i++) {
        const { error } = await supabase.from("leads_inbox").insert(attempt);
        if (!error) { setDone(true); break; }
        const m = error.message.match(/Could not find the '([^']+)' column/);
        if (m && m[1] && attempt[m[1]] !== undefined) {
          const { [m[1]]: _drop, ...rest } = attempt;
          attempt = rest;
          continue;
        }
        alert("접수 실패: " + error.message);
        break;
      }
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center p-4">
        <div className="max-w-lg bg-white rounded-3xl shadow-xl p-10 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-emerald-900 mb-3">접수 완료</h1>
          <p className="text-slate-600 mb-6">지상재활 상담 신청이 접수되었습니다.<br/>담당자가 곧 연락드리겠습니다.</p>
          <div className="p-4 bg-emerald-50 rounded-xl text-sm text-emerald-800 border border-emerald-200">
            <b>{form.name}</b>님 · {form.phone}<br/>
            <span className="text-xs">통증 부위 {form.pain_areas.length}곳 · NRS {form.nrs_score}점 · 안전체크 {form.safety_checks.length}항목</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 py-6 px-4">
      <div className="max-w-2xl mx-auto">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-3xl shadow-lg p-6 mb-4 text-white">
          <h1 className="text-2xl font-bold mb-1">🏋️‍♂️ 지상재활 상담 신청</h1>
          <p className="text-sm text-emerald-50">운동재활 & 디바이스케어 (근막·소닉)</p>
        </div>

        {/* 기본 정보 */}
        <div className="bg-white rounded-3xl shadow-lg p-6 mb-4">
          <h2 className="text-lg font-bold text-slate-800 mb-4">👤 기본 정보</h2>

          <div className="flex gap-2 mb-3">
            <button onClick={() => setForm({...form, member_type: "adult"})}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold ${form.member_type === "adult" ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600"}`}>
              🧑 성인
            </button>
            <button onClick={() => setForm({...form, member_type: "child"})}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold ${form.member_type === "child" ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600"}`}>
              👶 아동
            </button>
          </div>

          <div className="space-y-3">
            <input type="text" placeholder="성함 *" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-500 focus:outline-none" />
            <input type="tel" placeholder="연락처 * (예: 010-1234-5678)" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-500 focus:outline-none" />
            <input type="date" placeholder="생년월일" value={form.birth} onChange={e => setForm({...form, birth: e.target.value})}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-500 focus:outline-none" />
            <input type="text" placeholder="주소" value={form.address} onChange={e => setForm({...form, address: e.target.value})}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-500 focus:outline-none" />

            {form.member_type === "child" && (
              <>
                <input type="text" placeholder="보호자 성함" value={form.guardian_name} onChange={e => setForm({...form, guardian_name: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-500 focus:outline-none" />
                <input type="tel" placeholder="보호자 연락처" value={form.guardian_phone} onChange={e => setForm({...form, guardian_phone: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-500 focus:outline-none" />
              </>
            )}

            {/* ✅ v3.40.7: 성별 (필수) */}
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-1.5">성별 <span className="text-red-500">*</span></div>
              <div className="flex gap-2">
                {GENDERS.map(g => (
                  <button key={g.key} type="button"
                    onClick={() => setForm({...form, gender: g.key as any})}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 ${form.gender === g.key ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"}`}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ✅ v3.40.7: 희망 스케줄 (지상재활 - 시간표 미확정 안내) */}
        <div className="bg-white rounded-3xl shadow-lg p-6 mb-4">
          <h2 className="text-lg font-bold text-slate-800 mb-2">📅 희망 스케줄</h2>
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
            💡 지상재활 트랙은 아직 정규 시간표가 확정되지 않았습니다. 원하시는 요일과 시간대를 자유롭게 알려주시면, 상담사가 확인 후 개별 연락드립니다.
          </div>

          {/* 희망 요일 (다중 선택) */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              희망 요일 (복수 선택 가능) <span className="text-slate-400">· 선택 {form.wish_days.length}개</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS_GROUND.map(d => (
                <button key={d.key} type="button"
                  onClick={() => toggleWishDay(d.key)}
                  className={`py-2 rounded-lg text-sm font-semibold border-2 ${form.wish_days.includes(d.key) ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* 희망 시간대 (자유 텍스트) */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-slate-700 mb-1.5">
              희망 시간대 <span className="text-slate-400">(자유롭게 작성)</span>
            </div>
            <input type="text"
              placeholder="예) 평일 오전 10~12시 / 주말 저녁 아무때나 / 화·목 오후 3시 이후"
              value={form.wish_time_text}
              onChange={e => setForm({...form, wish_time_text: e.target.value})}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-500 focus:outline-none" />
          </div>

          {/* 연락 가능 시간 (선택) */}
          <div>
            <div className="text-xs font-semibold text-slate-700 mb-1.5">
              연락 가능 시간 <span className="text-slate-400">(선택)</span>
            </div>
            <input type="text"
              placeholder="예) 평일 오후 6시 이후 / 언제든 가능"
              value={form.contact_time}
              onChange={e => setForm({...form, contact_time: e.target.value})}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-500 focus:outline-none" />
          </div>
        </div>

        {/* Body Map - 통증 부위 */}
        <div className="bg-white rounded-3xl shadow-lg p-6 mb-4">
          <h2 className="text-lg font-bold text-slate-800 mb-2">🎯 통증/불편 부위 (Body Map)</h2>
          <p className="text-xs text-slate-500 mb-4">해당하는 모든 부위를 선택해주세요 (복수 선택 가능)</p>

          {/* ✅ v3.42.1: Visual Body Map SVG (정적 텍스트 나열 → 실제 인체 그림 클릭 방식) */}
          <div className="mb-3">
            <GroundBodyMap
              selectedKeys={form.pain_areas}
              onToggle={togglePainArea}
              readOnly={false}
            />
          </div>

          {/* ✅ v3.42.1: 목록에 없는 기타 부위는 아래 텍스트박스로만 처리 (버튼 나열 제거) */}
          <div className="mb-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
            <div className="text-xs font-semibold text-amber-700 mb-1">✏️ 기타 (직접 입력)</div>
            <div className="text-[11px] text-amber-600">위 그림에 없는 특정 근육/부위가 있다면 아래에 자유롭게 적어주세요.</div>
          </div>

          {/* ✅ v3.39.0: 기타/상세 부위 텍스트 입력 */}
          <div className="mb-3">
            <label className="text-xs font-semibold text-slate-600 mb-2 block">✏️ 기타/상세 부위 입력</label>
            <textarea value={form.pain_area_other}
              onChange={e => setForm({...form, pain_area_other: e.target.value})}
              rows={2}
              placeholder="목록에 없는 부위나 특정 근육 부위를 적어주세요."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-500 focus:outline-none resize-none" />
          </div>

          {form.pain_areas.length > 0 && (
            <div className="mt-3 p-2 bg-rose-50 rounded-lg text-xs text-rose-800 border border-rose-200">
              선택된 부위 {form.pain_areas.length}곳: {form.pain_areas.map(k => BODY_PARTS.find(p => p.key === k)?.label).join(", ")}
              {form.pain_area_other && <><br/><b className="text-amber-700">✏️ 기타:</b> {form.pain_area_other}</>}
            </div>
          )}
        </div>

        {/* NRS 통증 점수 */}
        <div className="bg-white rounded-3xl shadow-lg p-6 mb-4">
          <h2 className="text-lg font-bold text-slate-800 mb-2">🌡️ 일상 불편도 (NRS 1~10)</h2>
          <p className="text-xs text-slate-500 mb-4">평상시 통증/불편 정도를 숫자로 표현해주세요 (0: 통증 없음 · 10: 참을 수 없는 통증)</p>

          <div className="grid grid-cols-11 gap-1 mb-3">
            {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
              <button key={n} onClick={() => setForm({...form, nrs_score: n})}
                className={`aspect-square rounded-lg text-sm font-bold transition ${
                  form.nrs_score === n
                    ? n <= 3 ? "bg-emerald-500 text-white shadow-md"
                      : n <= 6 ? "bg-amber-500 text-white shadow-md"
                      : "bg-rose-500 text-white shadow-md"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}>
                {n}
              </button>
            ))}
          </div>

          <div className="flex justify-between text-[10px] text-slate-500">
            <span>😊 통증 없음</span>
            <span>😐 견딜만함</span>
            <span>😣 매우 심함</span>
          </div>

          <div className="mt-3 p-3 rounded-lg text-sm font-semibold text-center border-2"
            style={{
              backgroundColor: form.nrs_score <= 3 ? "#ecfdf5" : form.nrs_score <= 6 ? "#fffbeb" : "#fef2f2",
              borderColor: form.nrs_score <= 3 ? "#10b981" : form.nrs_score <= 6 ? "#f59e0b" : "#ef4444",
              color: form.nrs_score <= 3 ? "#065f46" : form.nrs_score <= 6 ? "#92400e" : "#991b1b",
            }}>
            현재 선택: {form.nrs_score}점 ({form.nrs_score <= 3 ? "경증" : form.nrs_score <= 6 ? "중등도" : "중증"})
          </div>
        </div>

        {/* ✅ v3.39.0: ① 통증 양상, 시기 및 발생 조건 (선택) */}
        <div className="bg-white rounded-3xl shadow-lg p-6 mb-4">
          <h2 className="text-lg font-bold text-slate-800 mb-1">🩺 ① 통증 양상, 시기 및 발생 조건</h2>
          <p className="text-xs text-slate-500 mb-4">선택 사항 · 정확한 케어를 위한 참고 자료로 활용됩니다</p>

          {/* 발생 시기 */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-slate-600 mb-2">📅 발생 시기 (단일 선택)</div>
            <div className="flex flex-wrap gap-2">
              {PAIN_ONSET.map(o => (
                <button key={o} onClick={() => setForm({...form, pain_onset: form.pain_onset === o ? "" : o})}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    form.pain_onset === o
                      ? "bg-indigo-500 text-white shadow-md"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                  {o}
                </button>
              ))}
            </div>
          </div>

          {/* 발생 조건 */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-slate-600 mb-2">🎬 발생 조건 (복수 선택)</div>
            <div className="flex flex-wrap gap-2">
              {PAIN_TRIGGER.map(t => (
                <button key={t} onClick={() => toggleMulti("pain_triggers", t)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    form.pain_triggers.includes(t)
                      ? "bg-orange-500 text-white shadow-md"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
            {/* ✅ v3.41.0: 발생 조건 상세 메모 자유 텍스트 */}
            <textarea
              placeholder="구체적인 통증 발생 상황을 적어주세요 (예: 계단 내려갈 때 무릎이 시큰거림, 오래 앉아있다가 일어날 때 허리가 뻐근함)"
              value={form.pain_trigger_detail}
              onChange={e => setForm({...form, pain_trigger_detail: e.target.value})}
              rows={2}
              className="mt-3 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-orange-500 focus:outline-none resize-none" />
          </div>

          {/* 느낌/양상 */}
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-2">💭 느낌/양상 (복수 선택)</div>
            <div className="flex flex-wrap gap-2">
              {PAIN_QUALITY.map(q => (
                <button key={q} onClick={() => toggleMulti("pain_quality", q)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    form.pain_quality.includes(q)
                      ? "bg-pink-500 text-white shadow-md"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ✅ v3.39.0: ② 안전 사전 체크 (필수) */}
        <div className="bg-red-50 border-2 border-red-200 rounded-3xl shadow-lg p-6 mb-4">
          <h2 className="text-lg font-bold text-red-900 mb-1">⚠️ ② 안전 사전 체크 <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full ml-2">필수</span></h2>
          <p className="text-xs text-red-700 mb-4">디바이스 케어 및 강도 조절을 위한 필수 스크리닝 항목입니다</p>

          <div className="flex flex-wrap gap-2">
            {SAFETY_CHECKS.map(s => (
              <button key={s} onClick={() => toggleMulti("safety_checks", s)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition border-2 ${
                  form.safety_checks.includes(s)
                    ? s === "해당 없음"
                      ? "bg-emerald-500 text-white border-emerald-600 shadow-md"
                      : "bg-red-500 text-white border-red-600 shadow-md"
                    : "bg-white text-slate-700 border-slate-200 hover:border-red-300"
                }`}>
                {form.safety_checks.includes(s) ? "☑ " : "☐ "}{s}
              </button>
            ))}
          </div>

          {form.safety_checks.length > 0 && form.safety_checks[0] !== "해당 없음" && (
            <div className="mt-3 p-3 bg-red-100 rounded-lg text-xs text-red-900 border border-red-300">
              🚨 <b>주의:</b> 선택하신 항목({form.safety_checks.join(", ")})에 대해 담당자가 사전 상담 시 강도 조절 및 케어 방식을 협의합니다.
            </div>
          )}
        </div>

        {/* ✅ v3.39.0: ③ 생활 습관 (선택) */}
        <div className="bg-white rounded-3xl shadow-lg p-6 mb-4">
          <h2 className="text-lg font-bold text-slate-800 mb-1">🏃 ③ 생활 습관</h2>
          <p className="text-xs text-slate-500 mb-4">선택 사항 · 근본 원인 분석 및 예방 계획 수립에 활용됩니다</p>

          <div className="flex flex-wrap gap-2">
            {LIFESTYLE.map(l => (
              <button key={l} onClick={() => toggleMulti("lifestyle", l)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                  form.lifestyle.includes(l)
                    ? "bg-teal-500 text-white shadow-md"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* ✅ v3.41.0: 교정/재활 목적 - 복수 선택 가능 */}
        <div className="bg-white rounded-3xl shadow-lg p-6 mb-4">
          <h2 className="text-lg font-bold text-slate-800 mb-1">🎯 교정/재활 목적</h2>
          <p className="text-xs text-slate-500 mb-4">복수 선택 가능 · 선택 {form.rehab_purposes.length}개</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {REHAB_PURPOSES.map(p => (
              <button key={p} onClick={() => toggleRehabPurpose(p)}
                className={`py-2 px-3 rounded-lg text-sm font-semibold border-2 transition ${
                  form.rehab_purposes.includes(p)
                    ? "bg-emerald-500 text-white border-emerald-500 shadow-md"
                    : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"
                }`}>
                {form.rehab_purposes.includes(p) ? "☑ " : ""}{p}
              </button>
            ))}
          </div>
        </div>

        {/* ✅ v3.41.0: 신규 섹션 - 생활 습관 및 운동/취미 자유 텍스트 (통증 분석용) */}
        <div className="bg-white rounded-3xl shadow-lg p-6 mb-4">
          <h2 className="text-lg font-bold text-slate-800 mb-1">🏃‍♂️ 생활 습관 및 운동/취미</h2>
          <p className="text-xs text-slate-500 mb-3">평소 하고 계신 운동이나 취미를 알려주시면 통증 원인 분석에 큰 도움이 됩니다</p>
          <textarea
            placeholder="평소 하고 계신 운동 및 취미를 입력해주세요 (예: 주 3회 헬스 · 스쿼트 위주 / 등산 월 1회 / 앉아서 하는 사무직 · 요가 주 2회)"
            value={form.lifestyle_hobby}
            onChange={e => setForm({...form, lifestyle_hobby: e.target.value})}
            rows={3}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-500 focus:outline-none resize-none" />
        </div>

        {/* 기타 요청사항 */}
        <div className="bg-white rounded-3xl shadow-lg p-6 mb-4">
          <h2 className="text-lg font-bold text-slate-800 mb-2">💬 기타 요청사항</h2>
          <textarea value={form.memo} onChange={e => setForm({...form, memo: e.target.value})}
            rows={4}
            placeholder="추가 병력, 요청사항 등 자유롭게 작성해주세요"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-500 focus:outline-none resize-none" />
        </div>

        {/* 제출 버튼 */}
        <button onClick={submit} disabled={saving}
          className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-lg font-bold rounded-2xl shadow-lg hover:shadow-xl transition disabled:opacity-50">
          {saving ? "접수 중..." : "🏋️‍♂️ 지상재활 상담 신청하기"}
        </button>

        <p className="text-center text-xs text-slate-500 mt-4">
          © 아쿠수중운동센터 · 지상재활 트랙 (v3.39.0)
        </p>
      </div>
    </div>
  );
}
