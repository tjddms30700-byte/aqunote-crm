// ═══════════════════════════════════════════════════════════════
// AQUNOTE 수중기능평가 4단계 등급 자동 산정 (특허 반영)
// ═══════════════════════════════════════════════════════════════
// 등급 정의:
//  1등급 (중증)      - 강사 지지 필수, 소극적 이완/부력적응 중심
//  2등급 (중등증)   - 부분 지지, 기초 수중 보행·호흡 훈련
//  3등급 (경증)      - 자립 수행 가능, 근력·지구력·협응 훈련
//  4등급 (정상근접) - 유지·강화, 고강도·응용 훈련
// ═══════════════════════════════════════════════════════════════

export type AssessmentInput = {
  rom_shoulder_flexion?: number | null;
  rom_hip_flexion?: number | null;
  mmt_upper_limb?: number | null;
  mmt_lower_limb?: number | null;
  mmt_trunk?: number | null;
  balance_static?: number | null;
  balance_dynamic?: number | null;
  pain_score?: number | null;
  sensory_hypersensitive?: boolean | null;
  buoyancy_adaptation?: number | null;
  breath_control?: number | null;
  aquatic_gait?: number | null;
  endurance?: number | null;
  cognition_instruction?: number | null;
  behavior_compliance?: number | null;
};

export type GradeResult = {
  level: 1 | 2 | 3 | 4;
  confidence: "낮음" | "보통" | "높음";
  rationale: string[];
  score: number;              // 종합 점수 (0-100)
};

/** 각 항목을 0-100 정규화 후 가중평균 → 등급 산정 */
export function computeAquaGrade(a: AssessmentInput): GradeResult {
  const rationale: string[] = [];
  let filled = 0;
  let sumScore = 0;
  let sumWeight = 0;

  const push = (key: string, raw: number | null | undefined, max: number, weight: number, label: string) => {
    if (raw == null) return;
    filled++;
    const norm = Math.max(0, Math.min(100, (raw / max) * 100));
    sumScore += norm * weight;
    sumWeight += weight;
    return norm;
  };

  // 관절가동범위 (정상값 대비 %)
  push("rom_shoulder", a.rom_shoulder_flexion, 180, 1.0, "어깨 굴곡");
  push("rom_hip",      a.rom_hip_flexion,     120, 1.0, "고관절 굴곡");

  // 근력 MMT 0-5
  push("mmt_upper", a.mmt_upper_limb, 5, 1.2, "상지 근력");
  push("mmt_lower", a.mmt_lower_limb, 5, 1.5, "하지 근력");
  push("mmt_trunk", a.mmt_trunk,      5, 1.2, "체간 근력");

  // 균형 0-4
  push("bal_static",  a.balance_static,  4, 1.2, "정적 균형");
  push("bal_dynamic", a.balance_dynamic, 4, 1.5, "동적 균형");

  // 수중 기본 기능 0-5
  push("buoyancy", a.buoyancy_adaptation, 5, 1.5, "부력적응");
  push("breath",   a.breath_control,      5, 1.2, "호흡조절");
  push("gait",     a.aquatic_gait,        5, 1.5, "수중보행");
  push("endur",    a.endurance,           5, 1.0, "지구력");

  // 인지/순응 0-4
  push("cog_inst",  a.cognition_instruction, 4, 0.8, "지시수행");
  push("behavior",  a.behavior_compliance,   4, 0.8, "순응도");

  // 감점 요인
  let penalty = 0;
  if (a.pain_score != null) {
    // 통증 VAS 0-10, 5 이상이면 감점
    if (a.pain_score >= 7) { penalty += 15; rationale.push(`통증 ${a.pain_score}/10 (심함) → 등급 하향`); }
    else if (a.pain_score >= 4) { penalty += 8; rationale.push(`통증 ${a.pain_score}/10 (보통) → 등급 하향`); }
  }
  if (a.sensory_hypersensitive) { penalty += 8; rationale.push("감각 과민 있음 → 등급 하향"); }

  if (filled < 3) {
    return {
      level: 2,
      confidence: "낮음",
      rationale: ["평가 항목이 부족합니다. 최소 3개 이상 입력해 주세요.", ...rationale],
      score: 0,
    };
  }

  const rawScore = sumWeight > 0 ? (sumScore / sumWeight) : 0;
  const score = Math.max(0, Math.min(100, rawScore - penalty));

  // 등급 산정 (룰 기반)
  let level: 1 | 2 | 3 | 4;
  if (score < 30)      level = 1;
  else if (score < 55) level = 2;
  else if (score < 80) level = 3;
  else                 level = 4;

  // 특수 조건 오버라이드
  // - 부력적응 ≤ 1이면 무조건 1등급
  if ((a.buoyancy_adaptation ?? 5) <= 1) {
    level = 1;
    rationale.push("부력적응 ≤ 1 → 1등급 강제");
  }
  // - 하지 근력 = 0이면 최대 2등급
  if (a.mmt_lower_limb === 0 && level > 2) {
    level = 2;
    rationale.push("하지 근력 0 → 최대 2등급");
  }
  // - 지시수행 = 0이고 순응도 ≤ 1이면 최대 2등급
  if (a.cognition_instruction === 0 && (a.behavior_compliance ?? 5) <= 1 && level > 2) {
    level = 2;
    rationale.push("지시수행/순응도 매우 낮음 → 최대 2등급");
  }

  // 신뢰도
  const confidence: GradeResult["confidence"] =
    filled >= 10 ? "높음" : filled >= 6 ? "보통" : "낮음";

  rationale.unshift(`종합 점수 ${score.toFixed(1)}/100 · 입력 항목 ${filled}개`);

  return { level, confidence, rationale, score };
}

/** 등급별 표시 정보 */
export const LEVEL_INFO = {
  1: {
    label: "1등급",
    subtitle: "중증 · 소극적 적응",
    description: "강사의 직접 지지가 필요합니다. 부력 적응, 감각 노출, 무저항 움직임 위주로 진행하세요.",
    color: "from-red-500 to-orange-500",
    bg: "bg-red-50",
    text: "text-red-700",
    ring: "ring-red-200",
  },
  2: {
    label: "2등급",
    subtitle: "중등증 · 기초 훈련",
    description: "부력 도구 활용 하에 기초 수중 보행·호흡·균형 훈련이 가능합니다.",
    color: "from-orange-500 to-amber-500",
    bg: "bg-orange-50",
    text: "text-orange-700",
    ring: "ring-orange-200",
  },
  3: {
    label: "3등급",
    subtitle: "경증 · 자립 훈련",
    description: "대체로 자립 수행이 가능하며, 근력·지구력·협응 훈련을 강화하세요.",
    color: "from-green-500 to-emerald-500",
    bg: "bg-green-50",
    text: "text-green-700",
    ring: "ring-green-200",
  },
  4: {
    label: "4등급",
    subtitle: "정상 근접 · 유지·강화",
    description: "고강도 응용 훈련, 스포츠형·인터벌 훈련까지 가능합니다.",
    color: "from-blue-500 to-cyan-500",
    bg: "bg-blue-50",
    text: "text-blue-700",
    ring: "ring-blue-200",
  },
} as const;
