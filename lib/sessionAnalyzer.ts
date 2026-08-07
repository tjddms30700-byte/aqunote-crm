// ═══════════════════════════════════════════════════════════════
// 🧠 v3.35.0 세션기록 → IEP/행동중재 자동 연동 분석 엔진
// (2026-08-07)
// ═══════════════════════════════════════════════════════════════

export type SessionRow = {
  id?: string;
  session_date: string;
  session_time?: string;
  activities?: string[] | null;
  tags?: string[] | null;
  memo?: string | null;
  status?: string | null;
  labels?: string[] | null; // 레거시
  date?: string | null;     // 레거시
};

// ═══ 영역별 활동 태그 매핑 (수중재활·감각통합·물리치료·작업치료·재활기법) ═══
export const AREA_MAPPING: Record<string, { keywords: string[]; label: string; color: string }> = {
  aqua_rehab: {
    keywords: ["부력봉", "킥판", "물 적응", "잠수", "호흡", "발차기", "수영", "수중", "부력", "수압",
               "물 저항", "호흡 조절", "숨 참기", "잠수 놀이", "물 놀이"],
    label: "🌊 수중재활",
    color: "blue",
  },
  sensory_integration: {
    keywords: ["감각", "촉각", "시각", "청각", "전정", "고유수용", "감각통합", "감각추적", "SI",
               "촉각 둔감화", "예민화 조절", "청각 자극", "전정감각", "고유수용감각",
               "시각 추적", "감각 방어", "감각 자극"],
    label: "🧠 감각통합",
    color: "purple",
  },
  physical_therapy: {
    keywords: ["ROM", "관절", "근력", "MMT", "밸런스", "균형", "자세", "코어", "물리치료",
               "관절 가동", "근력 강화", "자세 교정", "균형 잡기", "코어 안정화"],
    label: "💪 물리치료",
    color: "emerald",
  },
  occupational_therapy: {
    keywords: ["소근육", "손", "쓰기", "그리기", "일상생활", "ADL", "작업치료", "양측", "협응",
               "소근육 조작", "시지각-눈-손 협응", "양측 협응 운동", "일상생활동작", "과제 집중력"],
    label: "✋ 작업치료",
    color: "amber",
  },
  rehab_technique: {
    keywords: ["PNF", "고유수용성 신경근", "보바스", "NDT", "신경발달치료", "트레드밀"],
    label: "🎯 재활기법",
    color: "rose",
  },
  cognitive_behavior: {
    keywords: ["주의력", "지시 수행", "순응", "인지", "행동"],
    label: "📚 인지·행동",
    color: "indigo",
  },
};

// ═══ 행동중재 키워드 매핑 (표적행동 → 대응 중재 가이드) ═══
export const BEHAVIOR_KEYWORDS: Record<string, {
  keywords: string[];
  targetBehavior: string;
  intervention: string;
  severity: "low" | "medium" | "high";
}> = {
  safety_refusal: {
    keywords: ["안전 거부", "물 무서워", "겁", "꺼려", "울음", "거부", "회피", "무서워"],
    targetBehavior: "안전 거부 (Safety Refusal)",
    intervention: "1) 점진적 노출 - 얕은 물에서 시작해 서서히 깊이 증가\n2) 안심 언어 사용 (\"선생님이 옆에 있어\")\n3) 성공 즉시 강화물(스티커·칭찬) 제공\n4) 부모 근접 지지 → 독립 시행으로 페이딩",
    severity: "medium",
  },
  sensory_sensitivity: {
    keywords: ["감각 민감", "예민", "귀 막", "눈 감", "촉각 방어", "물 튀김", "싫어"],
    targetBehavior: "감각 민감 (Sensory Sensitivity)",
    intervention: "1) 감각 프로파일 재평가\n2) 자극 강도 조절 (물 온도·소음·조명)\n3) 딥프레셔 브러싱 등 준비운동\n4) 이어플러그·고글 등 보조기구 활용",
    severity: "medium",
  },
  attention_issue: {
    keywords: ["집중", "산만", "주의 산만", "딴짓", "이탈", "돌아다"],
    targetBehavior: "주의력 부족 (Attention Deficit)",
    intervention: "1) 세션을 5분 단위 소구간으로 분할\n2) 시각적 스케줄 카드 활용\n3) 성공 시 즉시 강화\n4) 주의 지속 시간 점진적 증가",
    severity: "low",
  },
  aggressive: {
    keywords: ["공격", "때리", "물기", "밀치", "차기", "던지"],
    targetBehavior: "공격 행동 (Aggression)",
    intervention: "1) 즉시 신체 안전 확보\n2) ABC 데이터 수집 (선행-행동-결과)\n3) 대체 의사소통 훈련 (PECS·수신호)\n4) 예방적 환경 조절",
    severity: "high",
  },
  self_injury: {
    keywords: ["자해", "머리 박", "긁", "물어뜯", "때리기"],
    targetBehavior: "자해 행동 (Self-Injury)",
    intervention: "1) 즉시 안전 확보 + 물리적 차단\n2) 기능 평가 (FBA) 실시\n3) 감각 대체물 제공\n4) 전문가 협업 필수",
    severity: "high",
  },
  compliance: {
    keywords: ["지시 불이행", "지시", "말 안 들", "협조 안", "고집"],
    targetBehavior: "지시 불이행 (Non-Compliance)",
    intervention: "1) 명확·단순한 지시 (1단계)\n2) 시각적 지원 제공\n3) 순응 시 즉시 강화\n4) 선택권 부여 (\"A vs B\")",
    severity: "low",
  },
};

// ═══ IEP 목표 자동 추천 템플릿 ═══
export const IEP_GOAL_TEMPLATES: Record<string, { long: string[]; short: string[] }> = {
  aqua_rehab: {
    long: [
      "6개월 내 독립적으로 물속 30초 이상 부력 유지가 가능하다.",
      "1년 내 킥판 없이 5m 자유 이동이 가능하다.",
    ],
    short: [
      "3주 내 부력봉 지지로 10초 이상 물속 자세 유지 (성공률 80%).",
      "4주 내 얼굴 담그기 5초 이상 3회 연속 수행 (성공률 70%).",
      "6주 내 킥판 활용 발차기 5m 이동 (성공률 70%).",
    ],
  },
  sensory_integration: {
    long: [
      "6개월 내 물 튀김 등 촉각 자극에 대한 방어 반응 50% 감소.",
      "1년 내 다양한 촉각 재료 5종 이상에 자발적 탐색 가능.",
    ],
    short: [
      "4주 내 촉각 브러시 자극을 30초 이상 견디기 (성공률 80%).",
      "6주 내 3종 감각통합 활동을 순차 수행 (지시 이해도 80%).",
    ],
  },
  physical_therapy: {
    long: [
      "6개월 내 하지 근력 MMT 등급 1단계 향상.",
      "1년 내 정적 균형 30초 이상 유지.",
    ],
    short: [
      "4주 내 수중 스쿼트 10회 완수 (성공률 75%).",
      "6주 내 한 발 서기 5초 이상 (성공률 70%).",
    ],
  },
  occupational_therapy: {
    long: [
      "6개월 내 소근육 조작 활동 5종 이상 독립 수행.",
      "1년 내 일상생활동작(ADL) 3개 영역 독립 완수.",
    ],
    short: [
      "4주 내 양손 협응 활동 (물속 공 잡기) 성공률 70%.",
      "6주 내 수중 도구 조작 (스쿠퍼 등) 독립 수행률 60%.",
    ],
  },
  rehab_technique: {
    long: [
      "6개월 내 PNF 대각선 패턴 3종 이상 독립 수행.",
      "1년 내 NDT 자세 조절 반응 정상화.",
    ],
    short: [
      "4주 내 PNF 상지 D1 굴곡 패턴 10회 (질적 70%).",
      "6주 내 보바스 접근 자세 반응 유도 성공률 65%.",
    ],
  },
  cognitive_behavior: {
    long: [
      "6개월 내 3단계 지시 수행 정확도 80% 이상.",
      "1년 내 세션 내 주의 지속 15분 이상.",
    ],
    short: [
      "4주 내 1-2단계 지시 수행 정확도 75%.",
      "6주 내 세션 이탈 없이 10분 이상 유지.",
    ],
  },
};

// ═══ 세션 목록 → 영역별 활동 태그 카운트 분석 ═══
export function analyzeSessions(sessions: SessionRow[]) {
  const areaCounts: Record<string, { count: number; activities: Set<string>; label: string; color: string }> = {};
  for (const areaKey of Object.keys(AREA_MAPPING)) {
    areaCounts[areaKey] = { count: 0, activities: new Set(), label: AREA_MAPPING[areaKey].label, color: AREA_MAPPING[areaKey].color };
  }

  const memoTexts: string[] = [];
  const parentMessages: string[] = [];

  for (const s of sessions) {
    const acts: string[] = Array.isArray(s.activities) ? s.activities
      : Array.isArray(s.labels) ? s.labels
      : [];
    const memo = (s.memo || "").toString();
    if (memo.trim()) memoTexts.push(`[${s.session_date || s.date}] ${memo}`);
    // parent_messages는 memo 내부에 포함되기도 하고 별도 필드로도 저장됨
    if (memo.includes("[보호자") || memo.includes("어머니") || memo.includes("아버지")) {
      parentMessages.push(memo);
    }

    for (const act of acts) {
      const actLower = act.toLowerCase();
      for (const [areaKey, cfg] of Object.entries(AREA_MAPPING)) {
        if (cfg.keywords.some(k => actLower.includes(k.toLowerCase()) || act.includes(k))) {
          areaCounts[areaKey].count += 1;
          areaCounts[areaKey].activities.add(act);
        }
      }
    }
    // memo 내부 키워드 검색 (활동 태그로 잡히지 않은 활동)
    for (const [areaKey, cfg] of Object.entries(AREA_MAPPING)) {
      if (cfg.keywords.some(k => memo.includes(k))) {
        areaCounts[areaKey].count += 1;
      }
    }
  }

  // 정렬: 활동 많은 영역 순
  const sortedAreas = Object.entries(areaCounts)
    .map(([key, v]) => ({ key, ...v, activities: Array.from(v.activities) }))
    .filter(a => a.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    totalSessions: sessions.length,
    areas: sortedAreas,
    memoTexts,
    parentMessages,
  };
}

// ═══ 세션 목록 → 행동중재 자동 감지 ═══
export function detectBehaviors(sessions: SessionRow[]) {
  const detected: Array<{
    behaviorKey: string;
    targetBehavior: string;
    intervention: string;
    severity: string;
    occurrences: Array<{ date: string; excerpt: string }>;
  }> = [];

  for (const [behKey, cfg] of Object.entries(BEHAVIOR_KEYWORDS)) {
    const occurrences: Array<{ date: string; excerpt: string }> = [];
    for (const s of sessions) {
      const memo = (s.memo || "").toString();
      const acts: string[] = Array.isArray(s.activities) ? s.activities : [];
      const combined = memo + " " + acts.join(" ");
      const hitKeyword = cfg.keywords.find(k => combined.includes(k));
      if (hitKeyword) {
        // 문맥 발췌 (해당 키워드 앞뒤 30자)
        const idx = combined.indexOf(hitKeyword);
        const excerpt = combined.slice(Math.max(0, idx - 30), idx + hitKeyword.length + 30);
        occurrences.push({
          date: s.session_date || s.date || "",
          excerpt: excerpt.trim(),
        });
      }
    }
    if (occurrences.length > 0) {
      detected.push({
        behaviorKey: behKey,
        targetBehavior: cfg.targetBehavior,
        intervention: cfg.intervention,
        severity: cfg.severity,
        occurrences,
      });
    }
  }

  return detected;
}

// ═══ 영역별 IEP 목표 자동 추천 (활동 많은 상위 3개 영역 대상) ═══
export function recommendIepGoals(sessions: SessionRow[]) {
  const analysis = analyzeSessions(sessions);
  const topAreas = analysis.areas.slice(0, 3);

  return topAreas.map(area => ({
    area: area.key,
    areaLabel: area.label,
    sessionCount: area.count,
    activities: area.activities,
    longGoals: IEP_GOAL_TEMPLATES[area.key]?.long || [],
    shortGoals: IEP_GOAL_TEMPLATES[area.key]?.short || [],
  }));
}

// ═══ 세션 → 주간 종합 관찰 요약 (자동) ═══
export function summarizeWeekly(sessions: SessionRow[]) {
  const analysis = analyzeSessions(sessions);
  const memoSummary = analysis.memoTexts.slice(0, 5)
    .map(m => m.length > 120 ? m.slice(0, 120) + "…" : m);

  const strongestArea = analysis.areas[0];
  const activityTags = analysis.areas.flatMap(a => a.activities).slice(0, 20);

  return {
    totalSessions: analysis.totalSessions,
    strongestArea: strongestArea ? `${strongestArea.label} (${strongestArea.count}건)` : "-",
    activityTags,
    areaBreakdown: analysis.areas,
    memoSummary,
    parentMessages: analysis.parentMessages.slice(0, 3),
  };
}
