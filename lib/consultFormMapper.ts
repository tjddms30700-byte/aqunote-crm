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
