/**
 * 📋 상담폼 데이터 → 회원 기본정보 자동 매핑 유틸리티
 * ─────────────────────────────────────────────────
 * 상담폼(`member.extra.consult_form` or `leads_inbox.raw_payload`)의 다양한 필드를
 * 회원 상세페이지 "📋 상세 정보" 탭의 6개 필드로 자동 변환한다:
 *   - current_status  (🚑 현재 상태)
 *   - main_symptom    (⚠️ 주 증상)
 *   - medication      (💊 복용 약)
 *   - treatment_history (🏥 치료 이력)
 *   - expected_change (🌟 기대하는 변화)
 *   - special_notes   (📌 특이사항)
 * + diagnosis (진단명, extra.diagnosis)
 *
 * 입력 소스:
 *  A) 상담폼 form1(통합): { diagnosis, main_symptom, wish_treatment, expected_change, special_notes }
 *  B) 상담폼 아동:       { visit_reason, height_weight, likes, dislikes, water_experience,
 *                          allergy, special_notes, expected_goal, current_institution, siblings }
 *  C) 상담폼 성인:       { pain_area, pain_scale, pain_start, worsening_factor, diagnosis,
 *                          medical_history, surgery_history, medication, allergy, caution,
 *                          special_notes, requests }
 */

export type ConsultFormRaw = Record<string, any>;

export type MappedInfo = {
  current_status: string;
  main_symptom: string;
  medication: string;
  treatment_history: string;
  expected_change: string;
  special_notes: string;
  diagnosis: string;
};

/**
 * 여러 필드를 한 줄씩 합쳐 하나의 텍스트로 만드는 헬퍼
 * 각 항목은 "[라벨] 값" 형태로 조합됨
 */
function joinFields(pairs: Array<[string, any]>): string {
  const lines: string[] = [];
  for (const [label, val] of pairs) {
    if (val === null || val === undefined) continue;
    const s = String(val).trim();
    if (!s) continue;
    if (label) {
      lines.push(`[${label}] ${s}`);
    } else {
      lines.push(s);
    }
  }
  return lines.join("\n");
}

/**
 * 배열 값을 문자열로 변환
 */
function arrOrStr(v: any): string {
  if (!v) return "";
  if (Array.isArray(v)) return v.filter(x => x).join(", ");
  return String(v).trim();
}

/**
 * 상담폼 raw 데이터를 회원 기본정보 필드로 매핑
 * @param form 상담폼 원본 객체 (consult_form or raw_payload)
 * @param memberType "child" | "adult"
 * @returns 매핑된 7개 필드
 */
export function mapConsultFormToMemberInfo(
  form: ConsultFormRaw | null | undefined,
  memberType?: "child" | "adult"
): MappedInfo {
  const empty: MappedInfo = {
    current_status: "",
    main_symptom: "",
    medication: "",
    treatment_history: "",
    expected_change: "",
    special_notes: "",
    diagnosis: "",
  };
  if (!form || typeof form !== "object") return empty;

  const isChild = memberType === "child" || form.member_type === "child";
  const isAdult = memberType === "adult" || form.member_type === "adult";

  // 🩺 진단명 (모든 폼 공통)
  const diagnosis = arrOrStr(form.diagnosis);

  // 🚑 현재 상태 : 회원의 종합적인 상태 요약
  //   - 아동: 내원 사유 + 현재 기관 + 형제자매
  //   - 성인: main_symptom 중심 + 통증부위/시작시기
  //   - form1: main_symptom (이전엔 "현재 불편한 점" 필드였음)
  let current_status = "";
  if (isChild) {
    current_status = joinFields([
      ["내원 사유", form.visit_reason],
      ["현재 기관", form.current_institution || form.institution],
      ["키/체중", form.height_weight],
      ["형제 자매", form.siblings],
    ]);
  } else if (isAdult) {
    current_status = joinFields([
      ["", form.main_symptom],
      ["통증 부위", arrOrStr(form.pain_area)],
      ["통증 시작", form.pain_start],
      ["악화 요인", form.worsening_factor],
    ]);
  } else {
    // form1 통합 : 현재 상태는 방문이유/상황설명 전용 (주증상과 중복 방지)
    current_status = arrOrStr(
      form.current_status ||
      form.visit_reason ||
      form.current_condition ||
      form.chief_complaint ||
      ""
    );
  }

  // ⚠️ 주 증상
  //   - 아동: 좋아하는 것 + 싫어하는 것 + 물 반응
  //   - 성인: 통증 척도 + 통증 부위 + 시작 시기
  let main_symptom = "";
  if (isChild) {
    main_symptom = joinFields([
      ["좋아하는 것", form.likes],
      ["싫어하는 것", form.dislikes],
      ["물 반응", form.water_experience],
    ]);
  } else if (isAdult) {
    const scale = form.pain_scale ? `${form.pain_scale}/10` : "";
    main_symptom = joinFields([
      ["통증 부위", arrOrStr(form.pain_area)],
      ["통증 척도", scale],
      ["통증 시작", form.pain_start],
      ["악화 요인", form.worsening_factor],
    ]);
  } else {
    // form1 통합 : 주 증상은 main_symptom 전용
    main_symptom = arrOrStr(form.main_symptom);
  }

  // 💊 복용 약
  const medication = arrOrStr(form.medication);

  // 🏥 치료 이력 : medical_history + surgery_history
  const treatment_history = joinFields([
    ["기저질환", form.medical_history],
    ["수술 이력", form.surgery_history],
    ["이전 치료", form.previous_treatment],
  ]);

  // 🌟 기대하는 변화
  //   - 아동: expected_goal
  //   - 성인: requests / expected_change / wish_treatment
  //   - form1: expected_change + wish_treatment
  let expected_change = "";
  if (isChild) {
    expected_change = arrOrStr(form.expected_goal || form.expected_change);
  } else {
    expected_change = joinFields([
      ["", form.expected_change],
      ["원하는 치료", form.wish_treatment],
      ["요청사항", form.requests],
    ]);
  }

  // 📌 특이사항 : special_notes + allergy + caution
  const special_notes = joinFields([
    ["", form.special_notes],
    ["알레르기", form.allergy],
    ["주의사항", form.caution],
  ]);

  return {
    current_status: current_status.trim(),
    main_symptom: main_symptom.trim(),
    medication: medication.trim(),
    treatment_history: treatment_history.trim(),
    expected_change: expected_change.trim(),
    special_notes: special_notes.trim(),
    diagnosis: diagnosis.trim(),
  };
}

/**
 * 기존 값이 비어있는 필드만 상담폼 데이터로 채운다 (덮어쓰지 않음)
 * @param existing 현재 회원의 extInfo 값
 * @param mapped  상담폼에서 매핑된 값
 * @param mode    "fill_empty" (비어있는 것만) | "overwrite" (모두 덮어쓰기) | "merge" (기존값 뒤에 이어붙임)
 */
export function mergeMappedInfo(
  existing: Partial<MappedInfo>,
  mapped: MappedInfo,
  mode: "fill_empty" | "overwrite" | "merge" = "fill_empty"
): MappedInfo {
  const result: MappedInfo = {
    current_status: existing.current_status || "",
    main_symptom: existing.main_symptom || "",
    medication: existing.medication || "",
    treatment_history: existing.treatment_history || "",
    expected_change: existing.expected_change || "",
    special_notes: existing.special_notes || "",
    diagnosis: existing.diagnosis || "",
  };

  const keys: (keyof MappedInfo)[] = [
    "current_status", "main_symptom", "medication",
    "treatment_history", "expected_change", "special_notes", "diagnosis"
  ];

  for (const k of keys) {
    const newVal = mapped[k];
    if (!newVal) continue;

    if (mode === "overwrite") {
      result[k] = newVal;
    } else if (mode === "merge") {
      if (result[k]) {
        result[k] = result[k] + "\n\n[상담폼 자동추가]\n" + newVal;
      } else {
        result[k] = newVal;
      }
    } else {
      // fill_empty (기본): 비어있을 때만
      if (!result[k] || !result[k].trim()) {
        result[k] = newVal;
      }
    }
  }
  return result;
}

// ✅ v3.13.11: 상담폼 → wish_days/wish_time_slots 자동 파싱
// 해당 함수는 다양한 폼택(구글폼, 네이버폼, 자체폼)에서 수집된
// 희망 요일/시간을 members 테이블의 wish_days/wish_time_slots 배열로 변환시켜
// 대기자 시간표 매칭에 자동 반영되도록 함.

const DAYS_KO = ["월", "화", "수", "목", "금", "토", "일"];

/** 희망 요일 파싱 - "월;목", "목요일", "월・목", "월/목" 모두 지원 */
export function parseWishDaysFromForm(form: ConsultFormRaw | null | undefined): string[] {
  if (!form) return [];
  const raw: any[] = [];
  // 수집되는 모든 후보 필드
  for (const k of ["wish_days", "wish_day", "available_days", "prefer_days", "희망요일"]) {
    if (form[k]) raw.push(form[k]);
  }
  // wish_time_slots 내부에 요일명이 들어있는 경우도 수집
  if (form.wish_time_slots) raw.push(form.wish_time_slots);
  if (form.saturday_option) raw.push(form.saturday_option);

  const collected = new Set<string>();
  const walk = (v: any) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    const s = String(v);
    // 구분자로 분리
    const parts = s.split(/[;,|/\s・]+/).map(x => x.trim().replace("요일", "")).filter(Boolean);
    for (const p of parts) {
      for (const d of DAYS_KO) {
        if (p.includes(d)) { collected.add(d); break; }
      }
    }
  };
  raw.forEach(walk);

  // 월화수목금토일 순서로 정렬해서 반환
  return DAYS_KO.filter(d => collected.has(d));
}

/** 희망 시간대 파싱 - 문자열/배열/파이프 다양한 형태 지원 */
export function parseWishTimeSlotsFromForm(form: ConsultFormRaw | null | undefined): string[] {
  if (!form) return [];
  const candidates: any[] = [];
  for (const k of ["wish_time_slots", "wish_times", "wish_time", "prefer_times", "available_times", "희망시간"]) {
    if (form[k]) candidates.push(form[k]);
  }
  if (form.saturday_option) candidates.push(form.saturday_option);

  const collected = new Set<string>();
  const walk = (v: any) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    const s = String(v).trim();
    if (!s) return;
    // 파이프/세미콜론/쉬프/콤마로 분리
    const parts = s.split(/[|;,]/).map(x => x.trim()).filter(Boolean);
    for (const p of parts) {
      // 상담폼 샘플: "오전 10~12", "오후 14~17", "저녁 17~20", "점심 12~14", "밤 20~", "12~14", "14-17"
      //             "월요일 15:50", "15:50", "13:30~14:40"
      collected.add(p);
    }
  };
  candidates.forEach(walk);

  return Array.from(collected);
}

/** 파싱된 값이 비어있으면 null, 값이 있으면 배열 반환 (Supabase update payload용) */
export function extractWishFieldsForMember(form: ConsultFormRaw | null | undefined): {
  wish_days: string[] | null;
  wish_time_slots: string[] | null;
} {
  const days  = parseWishDaysFromForm(form);
  const times = parseWishTimeSlotsFromForm(form);
  return {
    wish_days: days.length > 0 ? days : null,
    wish_time_slots: times.length > 0 ? times : null,
  };
}

/* ============================================================
   v3.15.3 - 상담폼 → 상담차트(consultation_charts) 자동 매핑
============================================================ */

export type MappedChart = {
  // 기본 정보
  member_name?: string;
  gender?: string;
  birth_date?: string;
  guardian_name?: string;
  guardian_relation?: string;
  phone?: string;
  address?: string;
  source?: string;
  institution?: string;
  current_therapy?: string;
  wish_days?: string[];
  wish_time_slots?: string[];
  // 의학적
  diagnosis?: string;
  main_symptoms?: string;
  special_behavior?: string;
  physical_spec?: string;
  surgery_history?: string;
  medication?: string;
  pain_status?: string;
  attention_level?: string;
  // Body Map
  body_map_notes?: string;
  // 감각/정서
  water_reaction?: string;
  emotion_status?: string;
  // 니즈
  avoid_situations?: string;
  expected_change?: string;
  water_expected_effect?: string;
  recommended_frequency?: string;
  // 결론
  conclusion?: string;
  memo?: string;
};

const pick = (form: ConsultFormRaw, ...keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = form?.[k];
    if (v !== null && v !== undefined && String(v).trim() !== "") {
      if (Array.isArray(v)) return v.filter(Boolean).join(", ");
      return String(v).trim();
    }
  }
  return undefined;
};

const joinNonEmpty = (parts: (string | undefined)[], sep = "\n"): string | undefined => {
  const filtered = parts.filter((p) => p && p.trim());
  return filtered.length ? filtered.join(sep) : undefined;
};

/**
 * 상담폼 → 상담차트 자동 매핑
 * @param form leads_inbox.consult_form JSON
 * @param memberType "child" | "adult"
 */
export function mapConsultFormToChart(
  form: ConsultFormRaw | null | undefined,
  memberType: "child" | "adult" = "adult"
): MappedChart {
  if (!form || typeof form !== "object") return {};

  const isChild = memberType === "child";

  // 예상 결론 자동 생성 (자주 쓰는 단서들)
  const diagnosis = pick(form, "diagnosis", "disease", "condition");
  const mainSymptoms = pick(form, "main_symptom", "symptoms", "chief_complaint");
  const expectedChange = pick(form, "expected_change", "expected_goal", "goal");

  // 주의도 자동 판정
  let attentionLevel: string | undefined;
  const cautionSrc = joinNonEmpty([
    pick(form, "caution", "special_notes", "allergy"),
    pick(form, "surgery_history", "medical_history")
  ], " ");
  if (cautionSrc) {
    if (/쇼크|응급|수술|암|심각|생명|압사|발작/.test(cautionSrc)) attentionLevel = "고주의";
    else if (/알레르기|천식|고혈압|당뇨|약복용|증상/.test(cautionSrc)) attentionLevel = "주의";
  }

  // 물 반응 키워드 감지
  let waterReaction: string | undefined;
  const waterExp = pick(form, "water_experience", "water_exp");
  if (waterExp) {
    if (/매우 좋|적극|즐거|자주/.test(waterExp)) waterReaction = "매우 긍정";
    else if (/대체로|보통|좀/.test(waterExp)) waterReaction = "보통";
    else if (/긴장|무서워|불안/.test(waterExp)) waterReaction = "긴장";
    else if (/싫어|거부|공포|허종/.test(waterExp)) waterReaction = "거부";
  }

  // Body Map 메모
  const bodyMapNotes = joinNonEmpty([
    pick(form, "pain_area") && `⚠️ 통증 부위: ${pick(form, "pain_area")}`,
    pick(form, "pain_scale") && `통증 강도: ${pick(form, "pain_scale")}`,
    pick(form, "pain_start") && `시작 시기: ${pick(form, "pain_start")}`,
    pick(form, "worsening_factor") && `악화 요인: ${pick(form, "worsening_factor")}`,
    pick(form, "current_status") && `현재 상태: ${pick(form, "current_status")}`,
  ]);

  // 피해야 할 상황
  const avoidSituations = joinNonEmpty([
    pick(form, "dislikes") && `싫어하는 것: ${pick(form, "dislikes")}`,
    pick(form, "avoid") && `피해야 할 상황: ${pick(form, "avoid")}`,
    pick(form, "caution") && `주의사항: ${pick(form, "caution")}`,
  ]);

  // 종합 결론 자동 생성
  const conclusionParts: string[] = [];
  if (diagnosis) conclusionParts.push(`• 진단: ${diagnosis}`);
  if (mainSymptoms) conclusionParts.push(`• 주증상: ${mainSymptoms}`);
  if (expectedChange) conclusionParts.push(`• 기대 변화: ${expectedChange}`);
  const wishTreatment = pick(form, "wish_treatment", "requests");
  if (wishTreatment) conclusionParts.push(`• 희망 치료/요청: ${wishTreatment}`);
  if (attentionLevel === "고주의") conclusionParts.push(`⚠️ 고주의 회원 - 수업 전 안전 확인 필수`);
  const conclusion = conclusionParts.length ? conclusionParts.join("\n") : undefined;

  // 메모 (기타 상담폼 정보)
  const memo = joinNonEmpty([
    pick(form, "likes") && `💙 좋아하는 것: ${pick(form, "likes")}`,
    pick(form, "siblings") && `가족/형제: ${pick(form, "siblings")}`,
    pick(form, "visit_reason") && `내원 사유: ${pick(form, "visit_reason")}`,
  ]);

  const { wish_days, wish_time_slots } = extractWishFieldsForMember(form);

  const chart: MappedChart = {
    // 기본
    member_name: pick(form, "name", "member_name", "child_name"),
    gender: pick(form, "gender", "sex"),
    birth_date: pick(form, "birth_date", "birthdate", "birth"),
    guardian_name: pick(form, "guardian_name", "parent_name"),
    guardian_relation: pick(form, "guardian_relation", "parent_relation"),
    phone: pick(form, "phone", "guardian_phone", "contact"),
    address: pick(form, "address", "addr"),
    source: pick(form, "source", "inflow", "channel"),
    institution: pick(form, "current_institution", "school", "institution"),
    current_therapy: pick(form, "current_therapy", "ongoing_treatment"),
    wish_days: wish_days || undefined,
    wish_time_slots: wish_time_slots || undefined,
    // 의학적
    diagnosis,
    main_symptoms: mainSymptoms,
    physical_spec: isChild ? pick(form, "height_weight", "physical_spec") : undefined,
    special_behavior: isChild ? pick(form, "special_notes", "caution", "dislikes") : undefined,
    surgery_history: !isChild ? pick(form, "surgery_history", "medical_history") : undefined,
    medication: !isChild ? pick(form, "medication") : undefined,
    pain_status: !isChild ? joinNonEmpty([
      pick(form, "pain_area") && `부위: ${pick(form, "pain_area")}`,
      pick(form, "pain_scale") && `강도: ${pick(form, "pain_scale")}`,
    ], " / ") : undefined,
    attention_level: attentionLevel,
    // Body Map
    body_map_notes: bodyMapNotes,
    // 감각
    water_reaction: waterReaction,
    // 니즈
    avoid_situations: avoidSituations,
    expected_change: expectedChange,
    water_expected_effect: pick(form, "water_expected_effect", "expected_effect"),
    // 결론
    conclusion,
    memo,
  };

  // undefined 값 제거
  Object.keys(chart).forEach((k) => {
    if ((chart as any)[k] === undefined) delete (chart as any)[k];
  });

  return chart;
}

/**
 * 기존 차트와 매핑된 차트 병합 (기존 값 우선)
 * emptyOnly=true 면 기존이 빈 값일 때만 덮어씨
 */
export function mergeChartData(
  existing: Record<string, any>,
  mapped: MappedChart,
  emptyOnly = true
): { merged: Record<string, any>; filledCount: number; filledFields: string[] } {
  const merged = { ...existing };
  const filledFields: string[] = [];

  for (const [k, v] of Object.entries(mapped)) {
    if (v === undefined || v === null || v === "") continue;
    const existingVal = merged[k];
    const isEmpty =
      existingVal === null ||
      existingVal === undefined ||
      existingVal === "" ||
      (Array.isArray(existingVal) && existingVal.length === 0);

    if (!emptyOnly || isEmpty) {
      merged[k] = v;
      filledFields.push(k);
    }
  }

  return { merged, filledCount: filledFields.length, filledFields };
}

/**
 * 상담폼에서 채워질 수 있는 필드가 하나라도 있는지 확인
 */
export function hasFillableData(form: ConsultFormRaw | null | undefined): boolean {
  if (!form || typeof form !== "object") return false;
  const keys = [
    "diagnosis", "main_symptom", "medication", "medical_history", "surgery_history",
    "special_notes", "allergy", "caution", "visit_reason", "current_institution",
    "height_weight", "siblings", "likes", "dislikes", "water_experience",
    "expected_goal", "expected_change", "wish_treatment", "requests",
    "pain_area", "pain_scale", "pain_start", "worsening_factor", "current_status"
  ];
  return keys.some(k => {
    const v = form[k];
    if (Array.isArray(v)) return v.length > 0;
    return v !== null && v !== undefined && String(v).trim() !== "";
  });
}
