/**
 * ═══════════════════════════════════════════════════════════════
 * 📊 v3.45.2 - 리포트 6축 Fallback 엔진
 * ═══════════════════════════════════════════════════════════════
 * "수치를 안 적고 태그만 찍어도 리포트 차트가 예쁘게 나오도록"
 *
 * 계산 우선순위:
 *   ① 실측 수치 있음 → 정규화 (0-100)
 *   ② 없음 + 태그 있음 → 태그 카운트 × 강도 가중 → 정규화
 *   ③ 태그도 없음 → 등급 근사값 (computed_level × 25) or 최소 15
 * ═══════════════════════════════════════════════════════════════
 */

// 6축 정의 (v3.46.0 레이더 차트와 완전 동일)
export type RadarAxis = "respiration" | "strength" | "balance" | "flexibility" | "social" | "cognitive";

export const RADAR_AXIS_META: Record<RadarAxis, {
  label: string;
  color: string;
  tagPatterns: RegExp[];
  weight: number;  // 태그 1개당 점수 (0-100 스케일)
}> = {
  respiration: {
    label: "호흡·적응",
    color: "#38BDF8",
    tagPatterns: [/얼굴 침수|버블|리드믹|숨 참기|잠수|호흡|물속 이름|눈 뜨기/],
    weight: 10,
  },
  strength: {
    label: "근력",
    color: "#818CF8",
    tagPatterns: [/근력|MMT|덤벨|프레스|플랭크|코어|체간|악력|러닝|런지|스쿼트|킥/],
    weight: 12,
  },
  balance: {
    label: "균형",
    color: "#34D399",
    tagPatterns: [/균형|밸런스|한 발|정적|동적|반응성|난류|밸런스 워크|징검다리/],
    weight: 12,
  },
  flexibility: {
    label: "유연성",
    color: "#F472B6",
    tagPatterns: [/스트레칭|WATSU|롤링|림프|ROM|가동범위|굴곡|신전|외전|와츠/],
    weight: 15,
  },
  social: {
    label: "사회성·지시수행",
    color: "#FBBF24",
    tagPatterns: [/농구|링 토스|볼링|릴레이|술래잡기|보물찾기|순서|팀|또래|집단/],
    weight: 12,
  },
  cognitive: {
    label: "인지·의사소통",
    color: "#A78BFA",
    tagPatterns: [/지시|주의|인지|눈맞춤|규칙|의사소통|자기표현|이름 말하기|색깔|숫자/],
    weight: 15,
  },
};

// ─── 세션에서 실측 수치를 축별로 매핑 ───
function extractMeasured(session: any): Partial<Record<RadarAxis, number>> {
  const out: Partial<Record<RadarAxis, number>> = {};

  if (session.berg_score != null) {
    out.balance = Math.min(100, Number(session.berg_score) * 25);   // 0-4 → 0-100
  }
  if (session.breath_hold_sec != null) {
    out.respiration = Math.min(100, (Number(session.breath_hold_sec) / 60) * 100);  // 60초 = 100
  }
  if (session.gait_distance_m != null) {
    // 보행 거리 → 유연성/균형 통합 지수 (30m 이상 = 100)
    out.balance = Math.max(out.balance ?? 0, Math.min(100, (Number(session.gait_distance_m) / 30) * 100));
  }
  if (session.mmt_score != null) {
    out.strength = Math.min(100, Number(session.mmt_score) * 20);   // 0-5 → 0-100
  }
  if (session.rom_angle != null) {
    out.flexibility = Math.min(100, (Number(session.rom_angle) / 180) * 100);  // 180° = 100
  }
  return out;
}

// ─── 세션 태그를 축별로 카운트 ───
function countTagsByAxis(session: any): Record<RadarAxis, number> {
  const counts: Record<RadarAxis, number> = {
    respiration: 0, strength: 0, balance: 0, flexibility: 0, social: 0, cognitive: 0,
  };
  const labels: string[] = session.labels || session.activities || [];
  for (const l of labels) {
    (Object.keys(RADAR_AXIS_META) as RadarAxis[]).forEach(axis => {
      if (RADAR_AXIS_META[axis].tagPatterns.some(p => p.test(l))) counts[axis]++;
    });
  }
  return counts;
}

// ═══════════════════════════════════════════════════════════════
// 🎯 CORE: 세션 목록 → 6축 종합 점수 (Fallback 포함)
// ═══════════════════════════════════════════════════════════════
export interface RadarScore {
  axis: RadarAxis;
  label: string;
  color: string;
  score: number;         // 0-100 최종 점수
  source: "measured" | "tag" | "default";  // 데이터 출처 표시
  measuredDays: number;  // 실측 있는 세션 수
  tagCount: number;      // 태그 카운트 합
}

export function computeRadarScores(
  sessions: any[],
  fallbackLevel: number = 2  // 회원 등급 (1-4)
): RadarScore[] {
  const measuredSums: Record<RadarAxis, { sum: number; count: number }> = {
    respiration: { sum: 0, count: 0 }, strength: { sum: 0, count: 0 },
    balance:     { sum: 0, count: 0 }, flexibility: { sum: 0, count: 0 },
    social:      { sum: 0, count: 0 }, cognitive:   { sum: 0, count: 0 },
  };
  const tagTotals: Record<RadarAxis, number> = {
    respiration: 0, strength: 0, balance: 0, flexibility: 0, social: 0, cognitive: 0,
  };

  for (const s of sessions) {
    const measured = extractMeasured(s);
    (Object.keys(measured) as RadarAxis[]).forEach(axis => {
      const v = measured[axis];
      if (v != null) {
        measuredSums[axis].sum += v;
        measuredSums[axis].count++;
      }
    });
    const tagCnt = countTagsByAxis(s);
    (Object.keys(tagCnt) as RadarAxis[]).forEach(axis => {
      tagTotals[axis] += tagCnt[axis];
    });
  }

  const defaultScore = Math.max(15, Math.min(60, fallbackLevel * 20));

  return (Object.keys(RADAR_AXIS_META) as RadarAxis[]).map(axis => {
    const meta = RADAR_AXIS_META[axis];
    const measured = measuredSums[axis];
    const tag = tagTotals[axis];

    let score: number;
    let source: "measured" | "tag" | "default";

    if (measured.count > 0) {
      // ① 실측 있음 → 평균값 우선. 태그 카운트로 약간 보정 (+0~15%)
      const base = measured.sum / measured.count;
      const tagBoost = Math.min(15, tag * 1.5);
      score = Math.min(100, base + tagBoost);
      source = "measured";
    } else if (tag > 0) {
      // ② 태그만 있음 → 태그 카운트 × 강도 가중
      score = Math.min(100, tag * meta.weight);
      source = "tag";
    } else {
      // ③ 아무것도 없음 → 등급 근사값
      score = defaultScore;
      source = "default";
    }

    return {
      axis,
      label: meta.label,
      color: meta.color,
      score: Math.round(score * 10) / 10,
      source,
      measuredDays: measured.count,
      tagCount: tag,
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// 🎯 시계열 라인 그래프 (LOCF + 태그 추정 Fallback)
// ═══════════════════════════════════════════════════════════════
export interface TimeSeriesPoint {
  bucket: string;         // "YYYY-MM" 또는 "YYYY"
  respiration: number;
  strength: number;
  balance: number;
  flexibility: number;
  social: number;
  cognitive: number;
  hasMeasured: Record<RadarAxis, boolean>;  // 각 축이 실측인지 추정인지
}

export function buildFilledTimeSeries(
  sessions: any[],
  mode: "month" | "year",
  fallbackLevel: number = 2,
  rangeStart?: string,  // ✅ v3.46.9: YYYY-MM-DD, 강제 시작
  rangeEnd?: string     // ✅ v3.46.9: YYYY-MM-DD, 강제 종료
): TimeSeriesPoint[] {
  // 1) 세션들을 버킷별로 그룹핑
  const buckets = new Map<string, any[]>();
  for (const s of sessions) {
    const date = s.session_date || s.date || s.created_at?.slice(0, 10);
    if (!date) continue;
    const bucket = mode === "month" ? date.slice(0, 7) : date.slice(0, 4);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket)!.push(s);
  }

  // ✅ v3.46.9: mode="year" + rangeStart/End 있으면 다년(예: 2024,2025,2026) 강제 포함
  if (rangeStart && rangeEnd) {
    const sy = parseInt(rangeStart.slice(0, 4));
    const ey = parseInt(rangeEnd.slice(0, 4));
    if (mode === "year") {
      for (let y = sy; y <= ey; y++) {
        const k = String(y);
        if (!buckets.has(k)) buckets.set(k, []);
      }
    } else {
      // month 모드: 시작월~종료월 사이 모든 YYYY-MM 버킷 채우기
      const start = new Date(rangeStart);
      const end = new Date(rangeEnd);
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cur <= end) {
        const k = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
        if (!buckets.has(k)) buckets.set(k, []);
        cur.setMonth(cur.getMonth() + 1);
      }
    }
  }

  if (buckets.size === 0) return [];

  // 2) 정렬된 버킷 배열
  const sortedBuckets = Array.from(buckets.keys()).sort();
  const defaultScore = Math.max(15, Math.min(60, fallbackLevel * 20));

  // 3) 각 버킷마다 6축 점수 계산 + LOCF 처리
  const carryForward: Record<RadarAxis, number> = {
    respiration: defaultScore, strength: defaultScore, balance: defaultScore,
    flexibility: defaultScore, social: defaultScore, cognitive: defaultScore,
  };

  const points: TimeSeriesPoint[] = [];
  for (const bucket of sortedBuckets) {
    const bucketSessions = buckets.get(bucket)!;
    const scores = computeRadarScores(bucketSessions, fallbackLevel);

    const point: TimeSeriesPoint = {
      bucket,
      respiration: 0, strength: 0, balance: 0, flexibility: 0, social: 0, cognitive: 0,
      hasMeasured: {
        respiration: false, strength: false, balance: false,
        flexibility: false, social: false, cognitive: false,
      },
    };

    for (const s of scores) {
      if (s.source === "measured" || s.source === "tag") {
        // 실측 또는 태그 기반 → 값 사용 + LOCF 갱신
        point[s.axis] = s.score;
        carryForward[s.axis] = s.score;
        point.hasMeasured[s.axis] = s.source === "measured";
      } else {
        // 아무것도 없는 버킷 → 직전 값 유지 (LOCF)
        point[s.axis] = carryForward[s.axis];
        point.hasMeasured[s.axis] = false;
      }
      // ✅ v3.46.4: 한글 라벨 필드도 함께 저장 (Recharts dataKey 매칭)
      (point as any)[RADAR_AXIS_META[s.axis].label] = point[s.axis];
    }
    // ✅ v3.46.4: label 필드 추가 (X축 표시용)
    (point as any).label = bucket;
    points.push(point);
  }

  return points;
}

// ═══════════════════════════════════════════════════════════════
// 🎯 영역별 활동량 (스택바용) - 태그만으로 100% 렌더링
// ═══════════════════════════════════════════════════════════════
export interface ActivityVolumePoint {
  bucket: string;
  respiration: number;
  strength: number;
  balance: number;
  flexibility: number;
  social: number;
  cognitive: number;
  totalSessions: number;
}

export function buildActivityVolume(
  sessions: any[],
  mode: "month" | "year"
): ActivityVolumePoint[] {
  const buckets = new Map<string, ActivityVolumePoint>();
  for (const s of sessions) {
    const date = s.session_date || s.date || s.created_at?.slice(0, 10);
    if (!date) continue;
    const bucket = mode === "month" ? date.slice(0, 7) : date.slice(0, 4);
    if (!buckets.has(bucket)) {
      buckets.set(bucket, {
        bucket,
        respiration: 0, strength: 0, balance: 0,
        flexibility: 0, social: 0, cognitive: 0,
        totalSessions: 0,
      });
    }
    const entry = buckets.get(bucket)!;
    entry.totalSessions++;
    const tagCnt = countTagsByAxis(s);
    (Object.keys(tagCnt) as RadarAxis[]).forEach(axis => {
      entry[axis] += tagCnt[axis];
      // ✅ v3.46.4: 한글 라벨 필드 병기
      (entry as any)[RADAR_AXIS_META[axis].label] = entry[axis];
    });
  }
  // ✅ v3.46.4: 각 entry에 label 필드 추가 + 한글 필드 최종 동기화
  const result = Array.from(buckets.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
  result.forEach((e: any) => {
    e.label = e.bucket;
    (Object.keys(RADAR_AXIS_META) as RadarAxis[]).forEach(axis => {
      e[RADAR_AXIS_META[axis].label] = e[axis];
    });
  });
  return result;
}

// ═══════════════════════════════════════════════════════════════
// 🎯 리포트 헤더용 KPI 요약
// ═══════════════════════════════════════════════════════════════
export interface ReportSummary {
  totalSessions: number;
  measuredSessions: number;
  measuredRatio: number;  // 실측 세션 비율 (%)
  attendanceDays: number;
  dominantAxis: { label: string; count: number } | null;
  weakestAxis: { label: string; score: number } | null;
  strongestAxis: { label: string; score: number } | null;
}

export function computeReportSummary(sessions: any[], fallbackLevel: number = 2): ReportSummary {
  const totalSessions = sessions.length;
  const measuredSessions = sessions.filter(s =>
    s.berg_score != null || s.breath_hold_sec != null || s.gait_distance_m != null ||
    s.mmt_score != null || s.rom_angle != null
  ).length;

  const uniqueDates = new Set<string>();
  sessions.forEach(s => {
    const d = s.session_date || s.date;
    if (d) uniqueDates.add(d);
  });

  const radar = computeRadarScores(sessions, fallbackLevel);
  const sorted = [...radar].sort((a, b) => b.score - a.score);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];

  // 가장 많이 수행된 영역
  const dominant = [...radar].sort((a, b) => b.tagCount - a.tagCount)[0];

  return {
    totalSessions,
    measuredSessions,
    measuredRatio: totalSessions > 0 ? Math.round((measuredSessions / totalSessions) * 100) : 0,
    attendanceDays: uniqueDates.size,
    dominantAxis: dominant && dominant.tagCount > 0 ? { label: dominant.label, count: dominant.tagCount } : null,
    weakestAxis: weakest ? { label: weakest.label, score: weakest.score } : null,
    strongestAxis: strongest ? { label: strongest.label, score: strongest.score } : null,
  };
}
