/**
 * ═══════════════════════════════════════════════════════════════
 * 📊 v3.45.0 - 세션기록 & 평가 자동 집계 엔진
 * ═══════════════════════════════════════════════════════════════
 * - 세션 태그를 기능 축(balance/rom/gait/respiration/strength)으로 매핑
 * - aqua_assessments 시계열 정렬 및 월/연 버킷팅
 * - 라인차트/바차트용 데이터 포맷 통합 제공
 * ═══════════════════════════════════════════════════════════════
 */

export type MetricAxis = "balance" | "rom" | "gait" | "respiration" | "strength" | "cognitive";

export const AXIS_META: Record<MetricAxis, { label: string; color: string; unit: string; max: number }> = {
  balance:     { label: "⚖️ 균형 능력",     color: "#f59e0b", unit: "Berg 0-4", max: 4 },
  rom:         { label: "🦴 관절 가동범위", color: "#3b82f6", unit: "각도°",    max: 180 },
  gait:        { label: "🚶 독립 보행",     color: "#10b981", unit: "회/거리",  max: 100 },
  respiration: { label: "🌬 호흡 지속시간", color: "#06b6d4", unit: "초",       max: 60 },
  strength:    { label: "💪 근력 (MMT)",    color: "#ef4444", unit: "MMT 0-5",  max: 5 },
  cognitive:   { label: "🧠 인지·사회성",   color: "#a855f7", unit: "점수",     max: 100 },
};

// ─── 태그 → 축 매핑 사전 (부분 매칭) ───
const TAG_TO_AXIS: Array<{ pattern: RegExp; axis: MetricAxis }> = [
  { pattern: /균형|밸런스|한 발|정적|동적|반응성|Berg|난류/,               axis: "balance" },
  { pattern: /ROM|관절|가동범위|굴곡|신전|외전|스트레칭|어깨|고관절|무릎|발목/, axis: "rom" },
  { pattern: /보행|걷기|워크|스텝|런지|스쿼트|킥판/,                       axis: "gait" },
  { pattern: /호흡|버블|리드믹|숨 참기|잠수|얼굴 침수|물속 이름/,          axis: "respiration" },
  { pattern: /근력|MMT|덤벨|프레스|플랭크|코어|체간|악력|러닝/,           axis: "strength" },
  { pattern: /지시|주의|인지|사회|눈맞춤|규칙|순서|의사소통|자기표현/,      axis: "cognitive" },
];

// 세션 목록 → 축별 카운트
export function countSessionTagsByAxis(sessions: any[]): Record<MetricAxis, number> {
  const counts: Record<MetricAxis, number> = {
    balance: 0, rom: 0, gait: 0, respiration: 0, strength: 0, cognitive: 0,
  };
  for (const s of sessions) {
    const labels: string[] = s.labels || s.activities || [];
    for (const l of labels) {
      for (const { pattern, axis } of TAG_TO_AXIS) {
        if (pattern.test(l)) counts[axis]++;
      }
    }
  }
  return counts;
}

// aqua_assessments 레코드 → 축별 정규화 점수(0-100)
export function normalizeAssessment(a: any): Record<MetricAxis, number | null> {
  // 균형 (Berg 0-4 평균 → 0-100)
  const bergVals = [a.balance_static, a.balance_dynamic, a.balance_reactive].filter(v => v != null);
  const balance = bergVals.length > 0
    ? (bergVals.reduce((sum, v) => sum + Number(v), 0) / bergVals.length) * 25
    : null;

  // ROM (5개 항목 평균 대비 정상 범위 %)
  const romNormals = {
    rom_shoulder_flexion: 180,
    rom_shoulder_abduction: 180,
    rom_hip_flexion: 120,
    rom_knee_flexion: 135,
    rom_ankle_dorsiflexion: 20,
  };
  const romScores: number[] = [];
  for (const [k, norm] of Object.entries(romNormals)) {
    if (a[k] != null) romScores.push(Math.min(100, (Number(a[k]) / norm) * 100));
  }
  const rom = romScores.length > 0 ? romScores.reduce((s, v) => s + v, 0) / romScores.length : null;

  // 보행 (독립보행 거리 or 지속 - 기록 컬럼 여러 후보에서 우선순위)
  const gaitRaw = a.gait_independent_distance ?? a.gait_distance ?? a.walking_distance ?? null;
  const gait = gaitRaw != null ? Math.min(100, Number(gaitRaw)) : null;

  // 호흡 (지속시간 초 → 0-60초를 0-100 매핑)
  const respRaw = a.respiration_duration ?? a.breath_hold_sec ?? a.breath_duration ?? null;
  const respiration = respRaw != null ? Math.min(100, (Number(respRaw) / 60) * 100) : null;

  // 근력 MMT (4개 항목 평균 0-5 → 0-100)
  const mmtVals = [a.mmt_upper_limb, a.mmt_lower_limb, a.mmt_trunk, a.mmt_grip].filter(v => v != null);
  const strength = mmtVals.length > 0
    ? (mmtVals.reduce((s, v) => s + Number(v), 0) / mmtVals.length) * 20
    : null;

  // 인지·사회성 (선택 필드 or 등급 기반 근사)
  const cogRaw = a.cognitive_score ?? a.social_score ?? null;
  const cognitive = cogRaw != null
    ? Math.min(100, Number(cogRaw))
    : (a.computed_level ? Math.min(100, Number(a.computed_level) * 25) : null);

  return { balance, rom, gait, respiration, strength, cognitive };
}

// 시계열 포인트 타입
export interface TrendPoint {
  date: string;       // "YYYY-MM-DD"
  bucket: string;     // 월간: "YYYY-MM", 연간: "YYYY"
  balance?: number | null;
  rom?: number | null;
  gait?: number | null;
  respiration?: number | null;
  strength?: number | null;
  cognitive?: number | null;
}

// 평가 이력 → 월간/연간 시계열 포인트
export function buildTrendPoints(assessments: any[], mode: "month" | "year"): TrendPoint[] {
  // 최신 평가부터 정렬 되어 있으므로 역순 정렬 후 처리
  const sorted = [...assessments].sort((a, b) => (a.assessed_at || "").localeCompare(b.assessed_at || ""));
  const bucketMap = new Map<string, { sums: Record<MetricAxis, number>; counts: Record<MetricAxis, number>; date: string }>();

  for (const a of sorted) {
    if (!a.assessed_at) continue;
    const bucket = mode === "month" ? a.assessed_at.slice(0, 7) : a.assessed_at.slice(0, 4);
    if (!bucketMap.has(bucket)) {
      bucketMap.set(bucket, {
        sums: { balance: 0, rom: 0, gait: 0, respiration: 0, strength: 0, cognitive: 0 },
        counts: { balance: 0, rom: 0, gait: 0, respiration: 0, strength: 0, cognitive: 0 },
        date: a.assessed_at,
      });
    }
    const entry = bucketMap.get(bucket)!;
    const norm = normalizeAssessment(a);
    (Object.keys(norm) as MetricAxis[]).forEach(k => {
      if (norm[k] != null) {
        entry.sums[k] += norm[k]!;
        entry.counts[k]++;
      }
    });
    entry.date = a.assessed_at;
  }

  return Array.from(bucketMap.entries()).map(([bucket, e]) => {
    const pt: TrendPoint = { date: e.date, bucket };
    (Object.keys(e.sums) as MetricAxis[]).forEach(k => {
      pt[k] = e.counts[k] > 0 ? Math.round((e.sums[k] / e.counts[k]) * 10) / 10 : null;
    });
    return pt;
  });
}

// 최근 3회 비교용 데이터 (바차트)
export function buildRecentComparison(assessments: any[], recentN = 3): Array<{ label: string } & Record<MetricAxis, number | null>> {
  const sorted = [...assessments]
    .sort((a, b) => (b.assessed_at || "").localeCompare(a.assessed_at || ""))
    .slice(0, recentN)
    .reverse();
  return sorted.map(a => {
    const norm = normalizeAssessment(a);
    return {
      label: a.assessed_at || "-",
      balance: norm.balance,
      rom: norm.rom,
      gait: norm.gait,
      respiration: norm.respiration,
      strength: norm.strength,
      cognitive: norm.cognitive,
    };
  });
}

// 세션 태그를 월별로 카운트 (시계열 활동량 표시용)
export function buildSessionActivityTrend(sessions: any[], mode: "month" | "year"): Array<{ bucket: string } & Record<MetricAxis, number>> {
  const bucketMap = new Map<string, Record<MetricAxis, number>>();
  for (const s of sessions) {
    const date = s.session_date || s.date || s.created_at?.slice(0, 10);
    if (!date) continue;
    const bucket = mode === "month" ? date.slice(0, 7) : date.slice(0, 4);
    if (!bucketMap.has(bucket)) {
      bucketMap.set(bucket, { balance: 0, rom: 0, gait: 0, respiration: 0, strength: 0, cognitive: 0 });
    }
    const entry = bucketMap.get(bucket)!;
    const labels: string[] = s.labels || s.activities || [];
    for (const l of labels) {
      for (const { pattern, axis } of TAG_TO_AXIS) {
        if (pattern.test(l)) entry[axis]++;
      }
    }
  }
  return Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, counts]) => ({ bucket, ...counts }));
}
