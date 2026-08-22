import { NextRequest, NextResponse } from "next/server";

/**
 * ═══════════════════════════════════════════════════════════════
 * 🔀 v3.45.5 - AI 통합 라우터 (Vercel Hobby 12개 제한 대응)
 * ═══════════════════════════════════════════════════════════════
 * 5개 API를 하나로 통합: ?action=<memo|message|clinical|analyze|send>
 *
 * POST /api/ai?action=memo     → 회원 종합 요약
 * POST /api/ai?action=message  → 학부모용 상담 메시지
 * POST /api/ai?action=clinical → 4단계 임상 노트
 * POST /api/ai?action=analyze  → IEP/행동중재 분석
 * POST /api/ai?action=send     → 카톡/SMS 발송
 * ═══════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════
// ── ai-memo 로직 ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════


async function handleAiMemo(req: Request) {
  try {
    const body = await req.json();
    const { member, ext, skills, painMap, sensationMap } = body || {};

    if (!member) return NextResponse.json({ error: "member 필수" }, { status: 400 });

    const age = member.birth ? calcAge(member.birth) : null;
    const isChild = member.member_type === "child";

    // 1) 프로필 요약
    const profile: string[] = [];
    profile.push(`**${member.name}** (${isChild ? "아동" : "성인"}${age ? `, ${age}세` : ""})`);
    if (member.diagnosis) profile.push(`진단: ${member.diagnosis}`);
    if (member.source) profile.push(`유입: ${member.source}`);

    // 2) 상세정보 요약
    const details: string[] = [];
    if (ext?.current_status) details.push(`- **현재 상태**: ${ext.current_status}`);
    if (ext?.main_symptom) details.push(`- **주 증상**: ${ext.main_symptom}`);
    if (ext?.medication) details.push(`- **복용 약**: ${ext.medication}`);
    if (ext?.treatment_history) details.push(`- **치료 이력**: ${ext.treatment_history}`);
    if (ext?.expected_change) details.push(`- **기대 변화**: ${ext.expected_change}`);
    if (ext?.special_notes) details.push(`- **특이사항**: ${ext.special_notes}`);

    // 3) 수영 스킬 요약
    let skillsSummary = "";
    if (skills && Object.keys(skills).length > 0) {
      const avg = Object.values<any>(skills).reduce((a: number, b: any) => a + (Number(b) || 0), 0) / Object.keys(skills).length;
      const strong = Object.entries<any>(skills).filter(([_, v]) => Number(v) >= 4).map(([k]) => k);
      const weak = Object.entries<any>(skills).filter(([_, v]) => Number(v) <= 1 && Number(v) > 0).map(([k]) => k);
      skillsSummary = `수중 능력 평균 **${avg.toFixed(1)}/5**${strong.length ? `, 강점: ${strong.join(", ")}` : ""}${weak.length ? `, 보완 필요: ${weak.join(", ")}` : ""}`;
    }

    // 4) 통증/감각 요약
    const painParts = painMap ? Object.entries<any>(painMap).filter(([_, v]) => Number(v) > 0).map(([k, v]) => `${k}(${v})`) : [];
    const sensationParts = sensationMap ? Object.entries<any>(sensationMap).filter(([_, v]) => v).map(([k, v]) => `${k}: ${v}`) : [];

    // 5) 종합 판단 & 프로그램 방향 (규칙 기반)
    const direction: string[] = [];
    if (isChild) {
      if (ext?.main_symptom?.includes("발달") || member.diagnosis?.includes("발달")) {
        direction.push("발달 지연 프로파일에 맞춰 **감각통합 + 대근육 순차 발달** 프로그램 권장.");
      }
      if (ext?.main_symptom?.includes("자폐") || member.diagnosis?.includes("자폐") || member.diagnosis?.includes("ASD")) {
        direction.push("자폐 스펙트럼 특성 고려 **예측 가능한 루틴 + 감각 조절 활동** 우선.");
      }
      if (ext?.main_symptom?.includes("주의") || ext?.main_symptom?.includes("ADHD")) {
        direction.push("주의력 조절을 위한 **짧은 세션 반복 + 강화 스케줄** 적용.");
      }
      direction.push("보호자와 **주간 진도 공유** 및 가정 연계 놀이 3가지 제안.");
    } else {
      if (painParts.length > 0) {
        direction.push(`통증 부위(${painParts.slice(0, 2).join(", ")}) 부하 최소화하며 **점진적 저항 운동** 진행.`);
      }
      if (ext?.main_symptom?.includes("허리") || ext?.main_symptom?.includes("요통")) {
        direction.push("요추 안정화를 위한 **수중 코어 강화 + 부력 활용 이완** 세션 추천.");
      }
      direction.push("**주 2회 정기 세션** 유지 시 4-6주 이내 뚜렷한 개선 예상.");
    }

    // 6) 최종 문서 조합 (마크다운)
    const summary = [
      `# 📋 ${member.name} 님 종합 프로필`,
      ``,
      `## 기본 정보`,
      profile.map(p => `- ${p}`).join("\n"),
      details.length ? `\n## 상세 정보\n${details.join("\n")}` : "",
      skillsSummary ? `\n## 평가 요약\n- ${skillsSummary}` : "",
      painParts.length ? `- 통증 부위: ${painParts.join(", ")}` : "",
      sensationParts.length ? `- 감각 특성: ${sensationParts.join(", ")}` : "",
      `\n## 🎯 프로그램 방향`,
      direction.map(d => `- ${d}`).join("\n"),
      `\n---`,
      `_최종 정리: ${new Date().toLocaleString("ko-KR")}_`,
    ].filter(Boolean).join("\n");

    return NextResponse.json({ success: true, summary });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}



// ═══════════════════════════════════════════════════════════════
// ── ai-message 로직 ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════


/**
 * POST /api/ai-message
 * body: { member, session, water_skills, pain_map, sensation_map, prev_labels }
 *
 * 단계적 사고 흐름으로 상담 메시지 생성:
 * 1) 인사 & 오늘 활동 소개
 * 2) 관찰 기반 오늘의 모습 (성장중심)
 * 3) 강점 · 잘한 점
 * 4) 개선점 (부드럽게)
 * 5) 다음 회차 계획
 * 6) 집에서 할 놀이/스트레칭
 * 7) 어머님 협력 유도 + 기대/격려 마무리
 */

// ═══════════════════════════════════════════════════════════════════
// 활동 → 전문 설명 (물리치료·작업치료·감각통합·재활·수중재활)
// ═══════════════════════════════════════════════════════════════════
const ACTIVITY_DETAILS: Record<string, { pro: string; observe: string; muscle: string }> = {
  // 수중재활
  "부력적응": {
    pro: "부력을 활용한 물 적응 훈련은 중력 부담을 30% 이상 경감시켜 안전한 움직임 학습에 이상적입니다",
    observe: "물결 흔들림 속에서도 상체 정렬을 유지하며 안정감을 찾아가는 모습",
    muscle: "코어 심부근(복횡근·다열근) 활성화",
  },
  "물 적응 · 호흡 조절": {
    pro: "정수압이 흉곽을 부드럽게 감싸주어 호흡근(횡격막·늑간근) 강화에 효과적입니다",
    observe: "숨을 참는 시간이 조금씩 길어지고, 물에 얼굴을 담그는 것에 대한 두려움이 옅어지는 모습",
    muscle: "호흡근군 · 흉쇄유돌근",
  },
  "수중 걷기": {
    pro: "수중 보행은 부력으로 관절 부하를 60~70% 낮추면서도 저항으로 근력을 자연스럽게 강화할 수 있는 재활 기법입니다",
    observe: "보폭이 조금씩 넓어지고 팔 스윙과 다리 움직임의 리듬이 자연스러워지는 모습",
    muscle: "대퇴사두근 · 둔근 · 하퇴삼두근",
  },
  "부력 활용 이완": {
    pro: "누워서 부력으로 지지되는 자세는 척추 신전근을 이완시키고 부교감신경을 활성화하여 심신 안정에 도움을 줍니다",
    observe: "온몸의 힘을 풀고 물에 몸을 맡기는 시간이 길어지는 모습",
    muscle: "척추기립근 · 승모근 이완",
  },
  "와츠(WATSU) 요법": {
    pro: "따뜻한 물속에서의 수동적 스트레칭과 지지는 감각 방어를 낮추고 근긴장도 조절에 도움을 줍니다",
    observe: "치료사의 지지에 몸을 맡기고 편안한 표정을 짓는 모습",
    muscle: "전신 근막 이완",
  },
  "할리윅(Halliwick) 10단계": {
    pro: "할리윅 10단계는 물 적응부터 균형·회전·이동까지 단계적으로 진행하는 국제 표준 수중재활 프로그램입니다",
    observe: "수직·수평 회전 조절이 부드러워지고 균형 회복 반응이 빨라지는 모습",
    muscle: "전신 협응근",
  },
  "킥판 활용 발차기": {
    pro: "킥판으로 상체를 지지하며 진행하는 발차기는 하지 근력과 심폐 지구력을 안전하게 향상시킵니다",
    observe: "무릎을 곧게 편 상태로 부드럽게 발차기를 이어가는 모습",
    muscle: "대둔근 · 대퇴사두근 · 비복근",
  },
  "숨 참기 · 잠수 놀이": {
    pro: "짧은 잠수는 폐활량 증가와 함께 물에 대한 자신감을 키우는 놀이 기반 접근입니다",
    observe: "숨 참는 시간이 5초→10초로 늘어나고 눈을 뜬 채 물속을 즐기는 모습",
    muscle: "호흡근 · 심박 조절",
  },
  "배영 · 자유형 기초": {
    pro: "기초 영법은 좌우 교차 협응과 어깨·엉덩이 회전 통합을 요구하여 전신 협응력 발달에 큰 도움이 됩니다",
    observe: "팔과 다리의 좌우 리듬이 점차 맞춰지는 모습",
    muscle: "광배근 · 삼각근 · 대흉근",
  },
  "수중 스트레칭": {
    pro: "물의 부력이 관절을 지지해주기 때문에 육상보다 훨씬 안전하게 큰 가동범위의 스트레칭이 가능합니다",
    observe: "어깨·고관절 가동범위가 자연스럽게 늘어나는 모습",
    muscle: "슬굴곡근 · 광배근 · 대흉근",
  },
  "부력봉 활용 근력 훈련": {
    pro: "부력봉(누들)을 활용하면 물의 저항을 조절하며 안전하게 근력 훈련이 가능합니다",
    observe: "저항에 맞서 팔·다리를 조절하는 힘이 강해지는 모습",
    muscle: "이두근 · 삼두근 · 광배근",
  },
  "음파 · 물결 저항 활용": {
    pro: "물결의 변화하는 저항은 예측 불가능한 자극을 통해 균형 반응 능력을 향상시킵니다",
    observe: "물결 변화에도 흔들림 없이 자세를 유지하는 모습",
    muscle: "코어 심부근 · 하지 안정근",
  },
  // 물리치료
  "관절가동범위(ROM) 훈련": {
    pro: "관절가동범위 훈련은 굳어있는 관절 주변 조직을 부드럽게 풀어주며 통증 없는 움직임 회복이 목표입니다",
    observe: "이전 회차보다 각도가 조금씩 넓어지는 모습",
    muscle: "관절 주변 인대 · 근막 유연성",
  },
  "근력 강화 운동": {
    pro: "점진적 저항 훈련으로 근력을 안전하게 향상시킵니다",
    observe: "동작을 유지하는 시간이 길어지고 저항에 대한 조절력이 좋아지는 모습",
    muscle: "표적 근군의 근섬유 활성화",
  },
  "스트레칭 · 유연성 개선": {
    pro: "정적·동적 스트레칭을 결합하여 근육 길이 회복과 유연성 향상을 목표로 합니다",
    observe: "굳어있던 근육이 부드러워지고 가동범위가 넓어지는 모습",
    muscle: "타깃 근육 근막 이완",
  },
  "균형 잡기 훈련": {
    pro: "고유수용감각과 시각·전정감각 통합을 통해 자세 조절 능력을 키웁니다",
    observe: "한 발 서기 시간이 늘어나고 흔들림에 빠르게 반응하는 모습",
    muscle: "종아리·발목 안정근",
  },
  "보행 훈련": {
    pro: "정상 보행 패턴 회복을 위한 단계적 훈련을 진행합니다",
    observe: "발꿈치-발가락 착지 순서가 자연스러워지고 보폭이 균일해지는 모습",
    muscle: "장요근 · 대퇴사두근 · 전경골근",
  },
  "자세 교정": {
    pro: "일상 자세 분석을 통해 근육 불균형을 조정합니다",
    observe: "어깨와 골반 정렬이 좌우 대칭에 가까워지는 모습",
    muscle: "심부 자세 유지근",
  },
  "코어 안정화 운동": {
    pro: "몸의 중심축을 지지하는 심부 코어근을 활성화하여 모든 움직임의 기반을 다집니다",
    observe: "복부에 안정적으로 힘이 들어가고 몸통 흔들림이 줄어드는 모습",
    muscle: "복횡근 · 다열근 · 골반저근",
  },
  // 작업치료
  "소근육 조작 활동": {
    pro: "손가락 미세 근육 조절 능력을 놀이 형태로 훈련합니다",
    observe: "손끝의 정교함이 늘어나고 도구 조작이 부드러워지는 모습",
    muscle: "손 내재근 · 굴곡근",
  },
  "양측 협응 훈련": {
    pro: "양손을 다르게 사용하는 활동으로 좌·우뇌 통합을 촉진합니다",
    observe: "양손의 동시 다른 동작 수행이 매끄러워지는 모습",
    muscle: "양측 팔·손 근육 협응",
  },
  "시지각 · 눈-손 협응": {
    pro: "눈으로 본 정보를 손 움직임으로 전환하는 능력을 키웁니다",
    observe: "목표물을 정확히 잡고 조작하는 반응 속도가 빨라지는 모습",
    muscle: "안구운동근 + 손 조작근",
  },
  // 감각통합
  "전정감각 자극": {
    pro: "회전·흔들림 자극을 통해 균형과 공간 지각의 기반이 되는 전정감각을 발달시킵니다",
    observe: "회전 후 균형 회복이 빨라지고 어지러움에 덜 예민해지는 모습",
    muscle: "속귀 전정기관 → 자세근 반사",
  },
  "고유수용감각 활동": {
    pro: "관절·근육에서 오는 감각을 통해 자기 몸 인식을 강화하는 훈련입니다",
    observe: "몸의 위치를 감각으로 정확히 인지하는 능력이 향상되는 모습",
    muscle: "근·건 고유수용기 활성화",
  },
  "촉각 둔감화 · 예민화 조절": {
    pro: "다양한 질감 자극으로 촉각 방어를 낮추거나 저반응을 활성화합니다",
    observe: "새로운 질감에 대한 거부감이 줄어들거나 감각 인식이 명확해지는 모습",
    muscle: "피부 감각수용기 조절",
  },
  // 재활기법
  "신경발달치료(NDT)": {
    pro: "정상 움직임 패턴을 촉진하고 비정상 반응을 억제하는 신경계 재활 접근법입니다",
    observe: "자세와 움직임의 질이 부드럽고 자연스러워지는 모습",
    muscle: "신경-근 연결 재조직화",
  },
  "PNF 고유수용성 신경근 촉진": {
    pro: "대각선 방향의 저항 움직임으로 신경-근 연결을 강화합니다",
    observe: "저항에 맞서는 조절력이 향상되는 모습",
    muscle: "다관절 협응근",
  },
};

// ═══════════════════════════════════════════════════════════════════
// 카테고리별 강점 표현 (다양성을 위해 여러 개 준비)
// ═══════════════════════════════════════════════════════════════════
const STRENGTH_PHRASES = [
  "오늘 특히 인상 깊었던 점은",
  "무엇보다 눈에 띄었던 것은",
  "오늘 마음이 참 예뻤던 부분은",
  "칭찬해 드리고 싶은 부분은",
  "오늘 자랑하고 싶은 모습은",
];

// 개선점을 부드럽게 표현하는 방식
const IMPROVEMENT_PHRASES = [
  "앞으로 함께 더 다듬어가면 좋을 부분은",
  "다음 단계로 가기 위해 살짝 더 도전해볼 부분은",
  "천천히 발전시키면 좋을 부분은",
  "함께 조금씩 성장시켜 나갈 영역은",
];

// 집에서 할 수 있는 놀이 (카테고리별)
const HOME_PLAY_TIPS: Record<string, string[]> = {
  aquatic: [
    "🛁 목욕 시간에 얼굴에 물 뿌리기 놀이 → 물에 대한 자신감 자연스럽게 UP",
    "🥤 컵으로 물 옮겨 담기 놀이 → 손 조절과 물 감각에 익숙해지기",
    "🎈 욕조에서 풍선 띄우고 손으로 밀기 → 부력 감각 익히기",
  ],
  physical: [
    "🐾 거실에서 곰 걷기 (네 발로 걷기) 3분 → 어깨·코어 안정성 발달",
    "🌉 브릿지 자세 10초 3세트 → 엉덩이·허리 근력 강화",
    "🦩 한 발 서기 챌린지 (양치할 때) → 균형 감각 발달",
    "🧘 잠자기 전 무릎 안고 흔들기 → 허리 이완",
  ],
  occupational: [
    "✂️ 스티커 붙였다 떼기 놀이 → 손끝 힘 조절 훈련",
    "🥢 콩 옮기기 젓가락 놀이 (숟가락도 OK) → 소근육 발달",
    "🎨 큰 붓으로 벽에 물칠하기 (밖에서) → 어깨·팔 움직임 통합",
    "📎 빨래집게 집었다 놓기 3분 → 손아귀 힘 기르기",
  ],
  sensory: [
    "🍚 쌀·콩·모래 만지기 감각놀이 → 촉각 다양성 경험",
    "🎢 이불 그네 (양쪽에서 잡고 흔들기) → 전정감각 자극",
    "🤗 꼭 안아주기 · 담요로 감싸주기 → 고유수용감각 안정화",
    "🎵 리듬 따라 몸 흔들기 (아이가 좋아하는 음악) → 청각-운동 통합",
  ],
  rehab: [
    "🚶 계단 오르내리기 천천히 (손잡이 잡고) → 하지 근력 유지",
    "🪑 의자에서 앉았다 일어나기 10회 → 대퇴사두근 강화",
    "🤸 벽에 손 대고 팔굽혀펴기 5회 → 상지 근력",
  ],
  general: [
    "🌟 오늘 잘한 점 자기 전에 이야기 나누기 → 자존감 UP",
    "📖 함께 그림책 읽기 (물·바다 주제) → 다음 수업 기대감 UP",
  ],
};

// 활동명 → 카테고리 매핑 (라벨 이름으로 카테고리 추정)
function guessCategory(label: string): string {
  if (label.match(/수중|물|부력|잠수|영법|배영|자유형|킥판|와츠|할리윅|음파|물결|숨/)) return "aquatic";
  if (label.match(/근력|관절|스트레칭|균형|보행|자세|코어|심폐|통증/)) return "physical";
  if (label.match(/소근육|양측|시지각|눈-손|일상|과제|놀이 활용/)) return "occupational";
  if (label.match(/전정|고유수용|촉각|청각|시각|감각/)) return "sensory";
  if (label.match(/NDT|보바스|PNF|트레드밀/)) return "rehab";
  return "general";
}



// ═══════════════════════════════════════════════════════════════════
// 메인 생성 로직 (단계별 사고)
// ═══════════════════════════════════════════════════════════════════
async function handleAiMessage(req: Request) {
  try {
    const { member, session, water_skills, pain_map, sensation_map, prev_labels } = await req.json();
    if (!member || !session) {
      return NextResponse.json({ error: "member, session 필수" }, { status: 400 });
    }

    const isChild = member.type === "child";
    const name = member.name || "회원";
    const guardianName = member.guardian || (isChild ? "어머님" : name);
    const age = member.birth ? calcAge(member.birth) : null;
    const labels: string[] = session.labels || [];

    // ─── 1단계: 오늘 활동을 카테고리별 정리 ───
    const activitiesByCategory: Record<string, string[]> = {};
    labels.forEach(l => {
      const cat = guessCategory(l);
      if (!activitiesByCategory[cat]) activitiesByCategory[cat] = [];
      activitiesByCategory[cat].push(l);
    });

    // ─── 2단계: 첫 라벨에 대한 전문 관찰 문구 ───
    const primary = labels[0];
    const primaryDetail = primary && ACTIVITY_DETAILS[primary];

    // ─── 3단계: 강점 관찰 (이전 세션과 비교) ───
    const isNewActivity = primary && (!prev_labels || !prev_labels.includes(primary));
    const strengthOpener = pick(STRENGTH_PHRASES);
    const strengthText = primaryDetail
      ? `${primaryDetail.observe}이었습니다`
      : "활동에 집중하며 하나하나 열심히 따라와 주는 태도";

    // ─── 4단계: 개선점 (부드럽게) ───
    const improvementOpener = pick(IMPROVEMENT_PHRASES);
    const improvementText = isChild
      ? `호흡 리듬을 좀 더 안정적으로 이어가는 부분입니다. 조급해하지 않으셔도 되고, 자연스럽게 시간이 필요한 영역이에요`
      : `한 동작을 좀 더 오래 유지하며 근지구력을 키우는 부분입니다. 한 회기 한 회기 축적되는 시간이니 마음 편히 임해주세요`;

    // ─── 5단계: 다음 회차 계획 ───
    let nextPlan = "";
    if (primary && primaryDetail) {
      nextPlan = isNewActivity
        ? `이번에 새로 도입한 「${primary}」를 자연스럽게 정착시키면서, 반응을 보며 강도를 조금씩 올려볼 예정입니다`
        : `「${primary}」의 완성도를 한 단계 높이는 방향으로 진행하며, 새로운 자극도 하나 추가해볼 계획입니다`;
    } else {
      nextPlan = "오늘의 흐름을 이어가면서 반응이 좋았던 활동을 심화시켜 볼 예정입니다";
    }

    // ─── 6단계: 집에서 할 수 있는 놀이 (오늘 활동 카테고리 기반) ───
    const cats = Object.keys(activitiesByCategory);
    const homeTipsPool: string[] = [];
    cats.forEach(c => {
      (HOME_PLAY_TIPS[c] || []).forEach(t => homeTipsPool.push(t));
    });
    if (homeTipsPool.length === 0) HOME_PLAY_TIPS.general.forEach(t => homeTipsPool.push(t));
    // 랜덤하게 2개 뽑되 중복 없이
    const shuffled = homeTipsPool.sort(() => Math.random() - 0.5);
    const homeTips = shuffled.slice(0, 2);

    // ─── 7단계: 통증/감각 언급 (성인 or 아동 감각 이슈) ───
    let painNote = "";
    if (pain_map && Object.keys(pain_map).length > 0) {
      const painful = Object.entries(pain_map).filter(([, v]) => (v as number) > 0);
      if (painful.length > 0) {
        painNote = `\n오늘 진행 중 이전에 언급 주셨던 통증 부위(${painful.length}곳)에 무리 없도록 강도를 조절하였으며, 반응이 안정적이었습니다.`;
      }
    }
    let sensationNote = "";
    if (sensation_map && Object.keys(sensation_map).length > 0) {
      const sensitives = Object.values(sensation_map).filter(v => v === "sensitive").length;
      const dulls = Object.values(sensation_map).filter(v => v === "dull" || v === "numb").length;
      if (sensitives > 0) sensationNote += ` 예민 반응 부위는 부드러운 자극 위주로,`;
      if (dulls > 0) sensationNote += ` 감각 저하 부위는 조금 더 명확한 자극으로 접근했습니다.`;
      if (sensationNote) sensationNote = "\n감각 프로파일에 맞춰" + sensationNote;
    }

    // ─── 8단계: 어머님 협력 요청 (부드럽게) ───
    const collaborationLine = isChild
      ? `혹시 집에서 ${name} 어린이가 물 관련해서 특별히 좋아하는/불편해하는 반응이 있다면 다음 시간에 살짝 말씀해 주시면 수업에 큰 도움이 됩니다`
      : `일상에서 특별히 통증이 심한 순간이 있으시면 언제든 편하게 공유해 주세요. 다음 회차 프로그램에 반영하겠습니다`;

    // ─── 9단계: 활동 상세 리스트 문자열 ───
    const activityLines = labels.map(l => {
      const d = ACTIVITY_DETAILS[l];
      if (d) return `  · ${l}\n    → ${d.pro}\n    → 오늘 활성화된 부위: ${d.muscle}`;
      return `  · ${l}`;
    }).join("\n");

    // ─── 최종 조합 ───
    const targetPhrase = isChild ? `${name} 어린이` : `${name}님`;
    const ageNote = isChild && age ? ` (${age}세)` : "";

    const message = `안녕하세요 ${guardianName}, 아쿠수중운동센터입니다 🌊

오늘 ${targetPhrase}${ageNote}의 수업이 잘 마무리되어 오늘 진행한 내용과 관찰한 모습을 정성껏 전해드리려고 해요.

━━━━━━━━━━━━━━
📋 오늘 진행한 활동
━━━━━━━━━━━━━━
${activityLines}

${primaryDetail ? `💡 ${primaryDetail.pro}` : ""}${painNote}${sensationNote}

━━━━━━━━━━━━━━
🌟 오늘의 성장 포인트
━━━━━━━━━━━━━━
${strengthOpener} ${strengthText}. ${isChild ? `한 회기 한 회기 조금씩 자기 몸을 이해하고 조절해 가는 여정이 느껴져 참 기쁩니다.` : `꾸준함이 만들어내는 변화가 몸에 새겨지고 있는 것이 보입니다.`}

${session.memo ? `\n💬 세션 중 관찰: ${session.memo}\n` : ""}

━━━━━━━━━━━━━━
🌱 함께 다듬어갈 부분
━━━━━━━━━━━━━━
${improvementOpener} ${improvementText}. ${isChild ? "아이의 페이스에 맞춰 조급하지 않게 진행하고 있으니 편안한 마음으로 지켜봐 주시면 됩니다." : "몸이 준비되는 만큼 자연스럽게 따라와 주실 거예요."}

━━━━━━━━━━━━━━
🎯 다음 회차 계획
━━━━━━━━━━━━━━
${nextPlan}.

━━━━━━━━━━━━━━
🏠 집에서 함께해 보시면 좋을 활동
━━━━━━━━━━━━━━
부담 없이 놀이처럼 접근해 주세요. 하루 5분이면 충분합니다:
${homeTips.map(t => "  " + t).join("\n")}

${collaborationLine}.

━━━━━━━━━━━━━━

${isChild
  ? `${name} 어린이가 물 안에서 조금씩 자신감을 찾아가는 이 여정을 함께해 주셔서 진심으로 감사드립니다. 저희도 아이의 속도에 맞춰 세심하게 살피며 즐거운 시간을 만들어 가겠습니다. 다음 시간에도 반갑게 맞이할게요 😊`
  : `${name}님의 회복 여정을 함께할 수 있어 감사드립니다. 몸이 보내는 신호에 귀 기울이며 안전하고 효과적으로 진행하겠습니다. 다음 세션 때 뵐게요. 편안한 하루 되세요 😊`}

- 아쿠수중운동센터`;

    return NextResponse.json({
      success: true,
      message: message.trim(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


// ═══════════════════════════════════════════════════════════════
// ── ai-clinical-note 로직 ────────────────────────────────────
// ═══════════════════════════════════════════════════════════════


/**
 * ═══════════════════════════════════════════════════════════════
 * 🩺 v3.44.0 - AI 세션기록 4단계 임상 템플릿 생성
 * POST /api/ai-clinical-note
 * ═══════════════════════════════════════════════════════════════
 * 요청 body: { member, session, water_skills, pain_map, sensation_map, prev_labels, iep_goals }
 *
 * 응답: {
 *   success: true,
 *   sections: {
 *     condition:  "① 당일 컨디션 및 입수 적응 상태",
 *     activities: "② 주요 진행 프로그램 및 활동 반응",
 *     progress:   "③ 기능적 성과 및 긍정적 변화",
 *     homeGuide:  "④ 가정 연계 및 다음 세션 가이드"
 *   },
 *   full_text: "4단계 종합 임상 노트 (담당 선생님 편집 초안)"
 * }
 * ═══════════════════════════════════════════════════════════════
 */

// ─── 활동 → 임상 관찰 & 근거 ───
const CLINICAL_ACTIVITY: Record<string, { observation: string; muscle: string; benefit: string }> = {
  "얼굴 침수": {
    observation: "초기 얼굴 침수 저항 반응 감소, 3초 이상 지속 가능",
    muscle: "호흡근 · 안면 근육 이완",
    benefit: "촉각 방어 감소, 물 적응력 확보",
  },
  "버블 만들기": {
    observation: "입·코를 활용한 조절된 날숨 5초 이상 유지",
    muscle: "횡격막 · 늑간근",
    benefit: "역호흡 감소 및 호기 조절 학습",
  },
  "리드믹 브리딩": {
    observation: "담그기-방울-호흡의 리듬 5회 연속 유지",
    muscle: "호흡근군 협응",
    benefit: "수중 호흡 자동화 진입",
  },
  "잠수 링 통과": {
    observation: "1개 링 완전 통과 후 자세 복귀 가능",
    muscle: "체간 심부근 · 견갑대",
    benefit: "3차원 공간 이동 능력",
  },
  "배면 뜨기": {
    observation: "킥판 지지로 30초 배면 자세 유지",
    muscle: "척추 신전근군 · 코어",
    benefit: "부력 인지 및 수평 자세 확립",
  },
  "체간 롤링": {
    observation: "좌우 180° 회전 유연성 개선",
    muscle: "체간 회전근 · 복사근",
    benefit: "홀티윅 3~4단계 진입 (횡축·회전 조절)",
  },
  "한 발 서기": {
    observation: "수중 한 발 서기 3~5초 유지",
    muscle: "고관절 외전근 · 발목 안정근",
    benefit: "정적 균형 향상",
  },
  "밸런스 패드": {
    observation: "밸런스 패드 위 자세 조절 능력 향상",
    muscle: "심부 안정근군",
    benefit: "동적 균형 및 반응성 균형 향상",
  },
  "난류 저항": {
    observation: "중강도 파도에 30초 자세 유지",
    muscle: "체간 · 하지 반응성 안정근",
    benefit: "예측 불가 자극에 대한 반응 개선",
  },
  "앞으로 걷기": {
    observation: "5m 독립 보행 성공",
    muscle: "대퇴사두근 · 둔근",
    benefit: "보행 지구력 및 자세 정렬 개선",
  },
  "백워드 보행": {
    observation: "후방 3m 보행 시 균형 유지",
    muscle: "슬굴곡근 · 후방 사슬",
    benefit: "후방 감각 · 균형 통합",
  },
  "수중 러닝": {
    observation: "30초 러닝 후 호흡 안정 회복",
    muscle: "심폐계 · 하지 근군",
    benefit: "심폐 지구력 향상",
  },
  "덤벨 프레스": {
    observation: "수중 덤벨 12회 프레스 수행",
    muscle: "삼각근 · 이두박근 · 상완삼두근",
    benefit: "상지 근력 강화",
  },
  "수중 농구": {
    observation: "근·중거리 슛 성공률 60% 이상",
    muscle: "상지 조절근 · 어깨 회전근",
    benefit: "상지 협응 및 목표 지향 조작",
  },
  "링 토스": {
    observation: "가라앉는 링 5개 중 3개 이상 회수",
    muscle: "잠수 근군 · 상지 조작근",
    benefit: "잠수-회수 순차 과제 수행",
  },
  "징검다리": {
    observation: "5개 부표 위 발딛기 성공",
    muscle: "하지 안정근 · 심부 코어",
    benefit: "동적 균형 및 순차 계획",
  },
  "WATSU": {
    observation: "수동적 지지 하 근긴장 이완",
    muscle: "전신 근막 이완",
    benefit: "심리적 안정 · 감각 방어 완화",
  },
};

// ─── 감정/컨디션 관찰 어휘 ───
const CONDITION_OPENERS = [
  "당일 등원 시 안색이 밝고 활력이 좋은 상태였습니다",
  "다소 긴장한 표정으로 입수하였으나 워밍업 후 안정 상태로 전환되었습니다",
  "차분한 컨디션으로 세션에 참여하였으며 초기 물 적응 저항이 낮았습니다",
  "활발한 표정과 자발적 발화가 관찰되어 컨디션 양호로 판단하였습니다",
];

const ADAPTATION_NOTES = [
  "얼굴에 물이 튀어도 놀람 반응 없이 활동을 지속함",
  "입수 후 3분 이내 안정 자세를 확보하고 지시 따르기가 가능함",
  "초기 벽 잡기 요구가 있었으나 5분 경과 후 자립 자세로 전환됨",
  "수온·수압에 대한 저항 반응 없이 자연스럽게 세션에 진입함",
];

const PROGRESS_MARKERS = [
  "이전 세션 대비 수행 정확도가 향상되었으며",
  "동일 과제의 성공률이 지난 회차보다 확연히 상승하였고",
  "새로 도입한 활동에 대한 학습 곡선이 안정적으로 나타나고 있으며",
  "지시 이해도 및 수행 시간이 점진적으로 개선되고 있으며",
];



// 활동명 부분 매칭 (라벨에 키워드가 포함되는지)
function findClinicalDetail(label: string) {
  for (const key of Object.keys(CLINICAL_ACTIVITY)) {
    if (label.includes(key) || key.includes(label.slice(0, 4))) {
      return CLINICAL_ACTIVITY[key];
    }
  }
  return null;
}

async function handleAiClinical(req: Request) {
  try {
    const body = await req.json();
    const { member, session, water_skills, pain_map, sensation_map, prev_labels, iep_goals } = body || {};

    if (!member || !session) {
      return NextResponse.json({ error: "member, session 필수" }, { status: 400 });
    }

    const isChild = member.type === "child" || member.member_type === "child";
    const name = member.name || "회원";
    const age = member.birth ? calcAge(member.birth) : null;
    const labels: string[] = session.labels || session.activities || [];
    const sessionDate = session.session_date || new Date("2026-08-22").toISOString().slice(0, 10);

    // ══════════ ① 당일 컨디션 및 입수 적응 상태 ══════════
    const condOpener = pick(CONDITION_OPENERS);
    const adaptNote = pick(ADAPTATION_NOTES);

    let sensationLine = "";
    if (sensation_map && Object.keys(sensation_map).length > 0) {
      const sens = Object.values(sensation_map).filter(v => v === "sensitive").length;
      const dull = Object.values(sensation_map).filter(v => v === "dull" || v === "numb").length;
      if (sens > 0) sensationLine += ` 예민 반응 부위 ${sens}곳은 부드러운 접근으로 조절하였으며,`;
      if (dull > 0) sensationLine += ` 감각 저하 부위 ${dull}곳은 명확한 자극으로 접근하였습니다.`;
    }

    let painLine = "";
    if (pain_map && Object.keys(pain_map).length > 0) {
      const painful = Object.entries(pain_map).filter(([, v]) => (v as number) > 0);
      if (painful.length > 0) {
        painLine = ` 사전 통증 부위 ${painful.length}곳에 대한 강도 조절을 적용하였고 세션 중 통증 호소는 없었습니다.`;
      }
    }

    const condition = `${condOpener}. ${adaptNote}.${sensationLine}${painLine}`;

    // ══════════ ② 주요 진행 프로그램 및 활동 반응 ══════════
    let activityBlock = "";
    if (labels.length === 0) {
      activityBlock = "세션 태그가 등록되지 않아 상세 활동 기록이 제한적입니다. 태그 추가 후 재분석 권장.";
    } else {
      const lines: string[] = [];
      labels.forEach((l, i) => {
        const detail = findClinicalDetail(l);
        if (detail) {
          lines.push(`${i + 1}) **${l}** — ${detail.observation}. (활성 근군: ${detail.muscle})`);
        } else {
          lines.push(`${i + 1}) **${l}** — 활동 참여 및 지시 수행 관찰됨.`);
        }
      });
      activityBlock = lines.join("\n");

      // 참여도 종합 코멘트
      const isNewCount = prev_labels ? labels.filter(l => !prev_labels.includes(l)).length : 0;
      if (isNewCount > 0) {
        activityBlock += `\n\n※ 신규 도입 활동 ${isNewCount}건 포함. 학습 초기 반응 관찰 필요.`;
      }
    }

    // ══════════ ③ 기능적 성과 및 긍정적 변화 ══════════
    const progressOpener = pick(PROGRESS_MARKERS);
    const progressLines: string[] = [];
    progressLines.push(`${progressOpener}, 다음과 같은 기능적 성과가 확인되었습니다:`);

    // 세션 태그 기반 성과 요약
    const highlights: string[] = [];
    if (labels.some(l => l.match(/얼굴 침수|버블|리드믹|호흡/))) {
      highlights.push("• 호흡 조절 및 물 적응력 향상 (수중 대면 지속 시간 증가)");
    }
    if (labels.some(l => l.match(/한 발|밸런스|균형/))) {
      highlights.push("• 정적/동적 균형 유지 능력 개선 (자세 유지 시간 연장)");
    }
    if (labels.some(l => l.match(/걷기|보행|워크/))) {
      highlights.push("• 독립 보행 거리 및 안정성 확대 (좌우 대칭 개선)");
    }
    if (labels.some(l => l.match(/체간|롤링|코어|플랭크/))) {
      highlights.push("• 체간 안정성 및 회전 조절 능력 향상 (홀티윅 진입 단계 상승)");
    }
    if (labels.some(l => l.match(/농구|링|볼링|보물|놀이|릴레이|징검다리/))) {
      highlights.push("• 목표 지향적 조작 및 사회적 상호작용 증진");
    }
    if (labels.some(l => l.match(/덤벨|프레스|스쿼트|런지|러닝/))) {
      highlights.push("• 근력 및 심폐 지구력 향상 (수행 반복 횟수 증가)");
    }
    if (highlights.length === 0) {
      highlights.push("• 세션 지속 참여 및 지시 이해도 유지");
    }
    progressLines.push(...highlights);

    // IEP 목표 연계
    if (iep_goals && Array.isArray(iep_goals) && iep_goals.length > 0) {
      progressLines.push("");
      progressLines.push(`📌 등록 IEP 목표 대비 진행도:`);
      iep_goals.slice(0, 3).forEach((g: any) => {
        progressLines.push(`  · ${g.title} — 진행중`);
      });
    }

    const progress = progressLines.join("\n");

    // ══════════ ④ 가정 연계 및 다음 세션 가이드 ══════════
    const homeTips: string[] = [];
    if (labels.some(l => l.match(/호흡|버블|얼굴 침수/))) {
      homeTips.push("🛁 목욕 시 볼에 물 담아 후~ 불기 5회 (호흡 리듬 유지)");
    }
    if (labels.some(l => l.match(/균형|한 발|밸런스/))) {
      homeTips.push("🧍 양치 시 한 발 서기 30초 도전 (하루 2회)");
    }
    if (labels.some(l => l.match(/보행|걷기|런지/))) {
      homeTips.push("🚶 계단 오르내리기 천천히 (손잡이 활용, 하지 근력 유지)");
    }
    if (labels.some(l => l.match(/체간|코어|플랭크/))) {
      homeTips.push("🤸 이불 위 무릎 플랭크 20초 (코어 유지)");
    }
    if (labels.some(l => l.match(/농구|놀이|링|볼링/))) {
      homeTips.push("🎯 종이컵 던져 넣기 놀이 (상지 협응 · 즐거움 유지)");
    }
    if (homeTips.length === 0) {
      homeTips.push("🌟 오늘 활동 사진 · 영상 함께 보며 회기 강화 대화");
      homeTips.push("📖 물·바다 주제 그림책 읽기 (다음 회기 기대감 UP)");
    }

    const nextGoal = labels[0]
      ? `다음 세션에서는 「${labels[0]}」 과제의 완성도를 강화하고, 한 단계 상위 활동을 순차적으로 도입할 예정입니다.`
      : "다음 세션에서는 활동 태그를 명확히 하여 성과 추적 가능하도록 진행 예정입니다.";

    const homeGuide = `【가정 연계 활동】
${homeTips.slice(0, 3).map(t => "  " + t).join("\n")}

【다음 세션 목표】
${nextGoal}

${isChild ? `보호자께서 관찰하신 특이 반응(수면·식이·감정 등)이 있다면 다음 회기 전 공유해 주시면 프로그램 조정에 반영하겠습니다.` : `일상 중 통증·피로 변화가 있으시면 편하게 공유해 주세요. 다음 회차 프로그램에 반영하겠습니다.`}`;

    // ══════════ 최종 조합 (풀 텍스트) ══════════
    const fullText = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 세션 임상 기록 (${sessionDate})
회원: ${name}${age ? ` · ${age}세` : ""} · ${isChild ? "아동" : "성인"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

① 당일 컨디션 및 입수 적응 상태
─────────────────────────────
${condition}

② 주요 진행 프로그램 및 활동 반응
─────────────────────────────
${activityBlock}

③ 기능적 성과 및 긍정적 변화
─────────────────────────────
${progress}

④ 가정 연계 및 다음 세션 가이드
─────────────────────────────
${homeGuide}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
※ 본 기록은 AI가 세션 태그·평가 데이터를 기반으로 생성한 초안입니다.
   담당 선생님께서 검토·수정 후 최종 저장해 주세요.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    return NextResponse.json({
      success: true,
      version: "v3.44.0",
      sections: {
        condition,
        activities: activityBlock,
        progress,
        homeGuide,
      },
      full_text: fullText.trim(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


// ═══════════════════════════════════════════════════════════════
// ── analyze 로직 ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════


/**
 * POST /api/analyze
 * 두 가지 유형 분석:
 *   type: 'iep_goal'    → IEP 목표 진도 분석
 *   type: 'behavior'    → 문제행동 패턴 분석
 */

async function handleAnalyze(req: Request) {
  try {
    const body = await req.json();
    const { type } = body;

    if (type === "iep_goal") {
      return NextResponse.json({ analysis: analyzeIEP(body) });
    }
    if (type === "behavior") {
      return NextResponse.json({ analysis: analyzeBehavior(body) });
    }
    return NextResponse.json({ error: "unknown type" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/* ═════ IEP 목표 분석 ═════ */
function analyzeIEP({ member, goal, records }: any) {
  const name = member?.name || "회원";
  const isChild = member?.type === "child" || member?.member_type === "child";
  const subject = isChild ? `${name} 어린이` : `${name}님`;

  if (!records || records.length === 0) {
    return `📊 「${goal.title}」 분석

아직 진도 기록이 없어 정확한 분석은 어렵습니다. 다음을 제안드립니다:

1️⃣ **초기 베이스라인 측정 (3~5회)**
   - 어떠한 촉구도 주지 않은 상태에서 아이가 얼마나 수행할 수 있는지 관찰
   - 자연스러운 상황에서의 반응을 기록하세요

2️⃣ **성취 기준 재확인**
   - 현재 기준: ${goal.target_criteria || "미설정"}
   - ${subject}의 현재 수준에 맞는지 검토가 필요합니다

3️⃣ **교육 방법 세분화**
   - 큰 목표를 3~5개의 작은 단계로 분해 (과제 분석)
   - 각 단계별 촉구 수준을 미리 계획해두면 좋습니다

📌 첫 기록 후 다시 분석을 요청해 주세요.`;
  }

  // 통계 계산
  const rates = records.map((r: any) => Number(r.success_rate) || 0);
  const avgRate = rates.reduce((a: number, b: number) => a + b, 0) / rates.length;
  const recent5 = records.slice(0, 5);
  const older5 = records.slice(5, 10);
  const recentAvg = recent5.length > 0
    ? recent5.reduce((s: number, r: any) => s + Number(r.success_rate || 0), 0) / recent5.length
    : 0;
  const olderAvg = older5.length > 0
    ? older5.reduce((s: number, r: any) => s + Number(r.success_rate || 0), 0) / older5.length
    : recentAvg;
  const trend = recentAvg - olderAvg;

  // 촉구 수준 분포
  const promptCounts: Record<string, number> = {};
  records.forEach((r: any) => {
    if (r.prompt_level) promptCounts[r.prompt_level] = (promptCounts[r.prompt_level] || 0) + 1;
  });
  const mostPrompt = Object.entries(promptCounts).sort(([,a],[,b]) => (b as number) - (a as number))[0]?.[0];
  const promptLabel: Record<string, string> = {
    independent: "독립수행", gestural: "몸짓촉구", verbal: "언어촉구", physical: "신체촉구",
  };

  // 판정
  let status = "";
  let recommendation = "";
  if (avgRate >= 85) {
    status = "🎯 **거의 마스터** — 성취 기준에 매우 근접했습니다";
    recommendation = `**다음 단계 제안**:
   ✅ 이 목표는 3~5회 더 확인 후 「달성 완료」로 마감 가능합니다
   ✅ 다음 단계 목표를 준비해주세요 (난이도 한 단계 UP)
   ✅ 유지·일반화 단계로 전환: 다른 환경/사람/시간대에서도 수행되는지 확인`;
  } else if (avgRate >= 60) {
    status = "📈 **꾸준한 성장** — 안정적으로 진행되고 있습니다";
    recommendation = `**현재 방향 유지 + 미세 조정**:
   ✅ 지금의 교육 방법을 계속 이어가되, 성공률을 80%까지 끌어올리는 데 집중
   ✅ 실패 상황을 자세히 관찰: 특정 자극/시간대/촉구 없을 때 유독 어려운 부분이 있는지 체크
   ✅ 강화(칭찬·보상)를 성공 직후 즉시 제공하여 학습 정착 촉진`;
  } else if (avgRate >= 30) {
    status = "🌱 **초기 학습 단계** — 아직 도움이 많이 필요합니다";
    recommendation = `**과제 난이도 재검토**:
   ⚠️ 목표가 현재 수준보다 조금 높을 수 있습니다
   ✅ 목표를 3~4개의 작은 단계로 분해해보세요 (Task Analysis)
   ✅ 촉구 수준을 한 단계 강화 (예: 언어촉구 → 신체촉구)
   ✅ 성공 경험을 늘려 자신감을 먼저 쌓기`;
  } else {
    status = "🔴 **재검토 필요** — 현재 방법으로는 어렵습니다";
    recommendation = `**전략 전환 필요**:
   🔄 목표 자체가 발달 순서상 너무 앞선 것은 아닌지 검토
   🔄 선행 기술이 부족한지 확인 (예: 두 발 점프 이전에 제자리 뛰기 가능한지)
   🔄 교육 방법을 완전히 다르게 접근 (놀이 기반·다른 감각 채널·환경 변경)
   🔄 이 목표는 일시 중단하고 하위 목표로 전환하는 것도 고려하세요`;
  }

  // 추세 코멘트
  let trendMsg = "";
  if (records.length >= 3) {
    if (trend > 15) trendMsg = `📈 **상승 추세**: 최근 5회 평균이 이전 대비 ${trend.toFixed(0)}%p 상승했습니다. 매우 긍정적입니다!`;
    else if (trend > 5) trendMsg = `↗️ **완만한 상승**: 최근 5회 평균이 이전 대비 ${trend.toFixed(0)}%p 조금씩 오르고 있습니다.`;
    else if (trend < -15) trendMsg = `📉 **하락 추세**: 최근 5회 평균이 이전 대비 ${Math.abs(trend).toFixed(0)}%p 하락했습니다. 원인 파악이 필요합니다 (컨디션·환경 변화·과제 반복으로 인한 지루함 등).`;
    else if (trend < -5) trendMsg = `↘️ **약한 하락**: 최근 5회 평균이 이전 대비 ${Math.abs(trend).toFixed(0)}%p 소폭 하락. 주의 깊게 관찰이 필요합니다.`;
    else trendMsg = `➡️ **안정 유지**: 성공률이 안정적으로 유지되고 있습니다.`;
  }

  // 촉구 수준 코멘트
  let promptMsg = "";
  if (mostPrompt) {
    promptMsg = `\n🎯 **촉구 수준**: 주로 「${promptLabel[mostPrompt]}」 상태에서 수행 중입니다.`;
    if (mostPrompt === "physical") promptMsg += " → 몸짓/언어촉구로 페이드아웃 시도 시점입니다.";
    else if (mostPrompt === "independent") promptMsg += " → 이미 독립 수행 가능. 유지·일반화 단계로.";
  }

  return `📊 「${goal.title}」 진도 분석

**${subject}** · 기록 ${records.length}회 · 평균 성공률 **${avgRate.toFixed(1)}%**

${status}

━━━━━━━━━━━━━━
📈 추세 분석
━━━━━━━━━━━━━━
${trendMsg}${promptMsg}

━━━━━━━━━━━━━━
💡 다음 회차 지도 방향
━━━━━━━━━━━━━━
${recommendation}

━━━━━━━━━━━━━━
🏠 부모님과 공유할 포인트
━━━━━━━━━━━━━━
${isChild
  ? avgRate >= 60
    ? `${subject}이 지금 「${goal.title}」에서 꾸준히 성장하고 있다는 점을 격려로 전해드리면 좋겠습니다. 집에서 자연스러운 상황에 노출시켜 주시면 일반화에 큰 도움이 됩니다.`
    : `${subject}이 새로운 도전에 임하고 있는 시기입니다. 실패에 좌절하지 않도록 시도 자체를 칭찬해주시는 방향으로 안내드리면 좋겠습니다.`
  : `${subject}의 현재 진행 상황과 다음 단계 계획을 공유하여 회복 여정에 대한 신뢰를 유지하세요.`}`;
}

/* ═════ 문제행동 분석 ═════ */
function analyzeBehavior({ member, behavior, records }: any) {
  const name = member?.name || "회원";
  const behName = behavior?.name || "문제행동";

  if (!records || records.length === 0) {
    return `📊 「${behName}」 초기 분석

기록이 없어 상세 분석은 어렵지만, 다음 접근을 권장합니다:

1️⃣ **베이스라인 (1주일)**
   - 하루에 몇 회 발생하는지 그대로 기록 (개입 없이)
   - 발생 시간대, 상황을 함께 기록

2️⃣ **ABC 관찰 (최소 5건)**
   - Antecedent(전에 무슨 일이): 요구/전이/특정 자극/거절 등
   - Behavior(어떤 행동): 조작적 정의대로 기록
   - Consequence(후에 무슨 결과): 주의 획득/과제 회피/물건 획득/감각 자극

3️⃣ **기능 가설 세우기**
   ABC 데이터가 쌓이면 이 행동의 기능(왜 발생하는가?)을 파악할 수 있습니다:
   - 🎯 주의 획득 · 🚪 과제 회피 · 🎁 물건 획득 · 🌀 감각 자극

📌 5건 이상 기록 후 다시 분석을 요청해 주세요.`;
  }

  // 통계
  const now = new Date();
  const d7 = new Date(now); d7.setDate(now.getDate() - 7);
  const d14 = new Date(now); d14.setDate(now.getDate() - 14);
  const d30 = new Date(now); d30.setDate(now.getDate() - 30);

  const last7 = records.filter((r: any) => new Date(r.record_date) >= d7);
  const prev7 = records.filter((r: any) => new Date(r.record_date) >= d14 && new Date(r.record_date) < d7);
  const last30 = records.filter((r: any) => new Date(r.record_date) >= d30);

  const sumFreq = (arr: any[]) => arr.reduce((s, r) => s + (r.frequency || 1), 0);
  const last7Count = sumFreq(last7);
  const prev7Count = sumFreq(prev7);
  const totalCount = sumFreq(records);

  // ABC 패턴 추출
  const antecedents = records.filter((r: any) => r.antecedent).map((r: any) => r.antecedent);
  const consequences = records.filter((r: any) => r.consequence).map((r: any) => r.consequence);

  // 기능 추정 (매우 러프하게)
  const funcHints = {
    attention: 0,
    escape: 0,
    tangible: 0,
    sensory: 0,
  };
  const acText = (antecedents.join(" ") + " " + consequences.join(" ")).toLowerCase();
  if (acText.match(/무시|혼자|관심|바쁘|안봐|칭찬|말건네/)) funcHints.attention += 2;
  if (acText.match(/과제|요구|시켜|하기 싫|힘들|어려|끝나|피하|거절/)) funcHints.escape += 2;
  if (acText.match(/원하|가지고|장난감|먹|음식|주|사탕/)) funcHints.tangible += 2;
  if (acText.match(/흔들|손|반복|자극|소리|빙|불안|긴장/)) funcHints.sensory += 2;

  const topFunc = Object.entries(funcHints).sort(([,a],[,b]) => b - a)[0];
  const funcLabel: Record<string, string> = {
    attention: "🎯 주의 획득 (관심 끌기)",
    escape: "🚪 회피/도피 (과제·상황에서 벗어나기)",
    tangible: "🎁 물건/활동 획득",
    sensory: "🌀 감각 자극 (자기자극)",
  };
  const funcResponse: Record<string, string> = {
    attention: `🔄 **대체행동 훈련**: "저 좀 봐주세요" 같은 적절한 관심 요청 방법 가르치기
🔄 **차별강화(DRA)**: 문제행동은 무시하고, 대체행동/친사회적 행동에 즉시 관심 제공
🔄 **선행사건 관리**: 문제행동 발생 전 미리 관심을 자주 제공하여 예방`,
    escape: `🔄 **거절 표현 지도**: "이거 어려워요" "쉬고 싶어요" 카드나 말로 표현하도록
🔄 **과제 조정**: 난이도를 낮추거나 짧게 쪼개기 (Task Interspersal)
🔄 **선택권 제공**: "A할래? B할래?" 통제감을 느끼게 하여 회피 욕구 감소
🔄 **점진적 노출**: 싫어하는 활동을 조금씩 늘려가며 강화 병행`,
    tangible: `🔄 **적절한 요청 훈련**: 손 들기/카드 사용/말로 요청하는 방법 명시적 지도
🔄 **일정 안내**: "이거 하면 곧 놀 수 있어" 시각적 스케줄 활용
🔄 **차별강화(DRO)**: 문제행동 없는 시간 동안 원하는 것 얻기`,
    sensory: `🔄 **감각 대체**: 같은 감각을 채워주는 안전한 대체 도구 제공 (스퀴즈 볼, 진동 자극 등)
🔄 **감각 식이(Sensory Diet)**: 하루 중 규칙적으로 감각 자극 제공하여 갈망 감소
🔄 **환경 조정**: 자극 과부하 상태라면 조용한 공간·낮은 조도 제공`,
  };

  // 심각도 판정 & 추세
  const diff = last7Count - prev7Count;
  let trendMsg = "";
  if (prev7Count === 0 && last7Count > 0) trendMsg = "이번 주 새로 관찰되었습니다 (이전 7일 0회)";
  else if (diff <= -3) trendMsg = `📉 **감소 추세**: 이전 7일 대비 ${Math.abs(diff)}회 감소했습니다. 현재 중재가 효과적입니다!`;
  else if (diff <= 0) trendMsg = `➡️ **안정 유지**: 이전 7일과 유사한 수준입니다.`;
  else if (diff <= 3) trendMsg = `↗️ **소폭 증가**: 이전 7일 대비 ${diff}회 증가했습니다. 원인 파악이 필요합니다.`;
  else trendMsg = `⚠️ **급증**: 이전 7일 대비 ${diff}회 급격히 증가. 즉각적인 재검토가 필요합니다.`;

  // 중재 효과 평균
  const effRecords = records.filter((r: any) => r.effectiveness);
  const avgEff = effRecords.length > 0
    ? effRecords.reduce((s: number, r: any) => s + r.effectiveness, 0) / effRecords.length
    : 0;

  return `📊 「${behName}」 행동 패턴 분석

**${name}** · 총 기록 ${records.length}건 · 지난 30일 발생 ${sumFreq(last30)}회

━━━━━━━━━━━━━━
📈 발생 추이
━━━━━━━━━━━━━━
• 최근 7일: **${last7Count}회**
• 이전 7일: ${prev7Count}회
• ${trendMsg}

━━━━━━━━━━━━━━
🎯 기능 가설 (Function of Behavior)
━━━━━━━━━━━━━━
${topFunc && topFunc[1] > 0
  ? `데이터 상 가장 유력한 기능: **${funcLabel[topFunc[0]]}**\n\n💡 이 기능에 맞춘 중재 전략:\n${funcResponse[topFunc[0]]}`
  : `아직 기능을 뚜렷하게 파악하기 어렵습니다.\n\n📌 ABC 관찰 기록을 5건 이상 쌓아주세요. 선행사건과 후속결과 패턴이 명확해집니다.`}

━━━━━━━━━━━━━━
💊 중재 효과 평가
━━━━━━━━━━━━━━
${effRecords.length > 0
  ? `평균 효과성: **${avgEff.toFixed(1)}/5.0** (${effRecords.length}회 기록)
${avgEff >= 4 ? "→ 현재 중재가 효과적입니다. 유지하세요." :
  avgEff >= 2.5 ? "→ 부분적으로 효과가 있으나 개선 여지가 있습니다. 강화 스케줄이나 대체행동 훈련을 재점검해보세요." :
  "→ 현재 중재가 큰 효과를 보이지 못하고 있습니다. 완전히 다른 접근이 필요합니다."}`
  : "중재 효과 평가가 아직 없습니다. 매 기록마다 효과성 별점을 남겨주시면 분석이 정확해집니다."}

━━━━━━━━━━━━━━
🚦 다음 단계 우선순위
━━━━━━━━━━━━━━
${last7Count >= 10 ? "🔴 **긴급**: 발생 빈도가 매우 높습니다. 심리·의료적 자문을 함께 고려하세요.\n" : ""}${topFunc && topFunc[1] > 0
  ? `1. 위 기능 가설에 맞춘 대체행동 지도 시작
2. 매 세션 ABC 형식으로 상세 기록 (최소 주 3회)
3. 2주 후 재분석하여 효과 검증`
  : `1. **ABC 관찰 기록**을 최소 5건 이상 축적하세요
2. 발생 시간대·상황을 함께 기록해 패턴 파악
3. 그 후 다시 분석을 요청해주세요`}

━━━━━━━━━━━━━━
💌 학부모 안내 포인트
━━━━━━━━━━━━━━
${diff <= 0
  ? `${name} 어린이의 「${behName}」이 안정적으로 관리되고 있음을 안내드리고, 가정에서도 일관된 반응(무시 or 대체행동 강화)을 유지해 주시길 요청하면 좋겠습니다.`
  : `발생 빈도가 늘고 있어 원인 탐색이 필요한 시기임을 부드럽게 공유하고, 최근 가정 환경의 변화(수면·식사·형제관계·이사 등)가 있었는지 여쭤보시면 도움이 됩니다.`}`;
}


// ═══════════════════════════════════════════════════════════════
// ── send 로직 ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════


/**
 * POST /api/send
 * body: { channel: 'sms'|'kakao'|'email', to: string, message: string }
 * 
 * MVP 버전: 실제 발송 대신 로그 저장.
 * 향후 Solapi, NHN Cloud 알림톡 API, EmailJS 등 연동 가능.
 */
async function handleSend(req: Request) {
  try {
    const { channel, to, message, name } = await req.json();
    if (!channel || !to || !message) {
      return NextResponse.json({ error: "channel, to, message 필수" }, { status: 400 });
    }

    // TODO: 실제 발송 로직 연동
    // 예시 - SMS: fetch('https://api.solapi.com/messages/v4/send', {...})
    // 예시 - 카카오톡: fetch('https://kakaoapi.aligo.in/akv10/send/', {...})

    console.log(`[${channel.toUpperCase()}] → ${name || ""} (${to}): ${message.slice(0, 80)}`);

    return NextResponse.json({
      success: true,
      channel,
      to,
      preview: message.slice(0, 100),
      note: "MVP: 실제 발송은 API 키 연동 후 활성화됩니다. 지금은 콘솔에 기록만 저장됩니다.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


// ═══════════════════════════════════════════════════════════════
// ── 통합 진입점 ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";

  switch (action) {
    case "memo":     return handleAiMemo(req);
    case "message":  return handleAiMessage(req);
    case "clinical": return handleAiClinical(req);
    case "analyze":  return handleAnalyze(req);
    case "send":     return handleSend(req);
    case "growth-report": return handleGrowthReport(req);   // ✅ v3.46.0
    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}. Use ?action=memo|message|clinical|analyze|send|growth-report` },
        { status: 400 }
      );
  }
}

// ═══════════════════════════════════════════════════════════════
// 🔧 통합 헬퍼 (v3.45.6: 중복 제거)
// ═══════════════════════════════════════════════════════════════
function calcAge(birth: string): number {
  if (!birth) return 0;
  const b = new Date(birth);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ═══════════════════════════════════════════════════════════════
// ✅ v3.46.5 - 성장 종합보고서 AI 코멘트 (대폭 확장: 9섹션)
// POST /api/ai?action=growth-report
// Body: { memberName, period, summary, radar, sessionCount }
// ═══════════════════════════════════════════════════════════════
async function handleGrowthReport(req: Request) {
  try {
    const body = await req.json();
    const { memberName, period, summary, radar, sessionCount } = body || {};

    if (!memberName) {
      return NextResponse.json({ error: "memberName 필수" }, { status: 400 });
    }

    const totalSessions = summary?.totalSessions || 0;
    const measuredRatio = Math.round((summary?.measuredRatio || 0) * 100);
    const attendanceDays = summary?.attendanceDays || 0;
    const dominantLabel = summary?.dominantAxis?.label || "균형";
    const strongLabel = summary?.strongestAxis?.label || "";
    const strongScore = summary?.strongestAxis?.score || 0;
    const weakLabel = summary?.weakestAxis?.label || "";
    const weakScore = summary?.weakestAxis?.score || 0;
    const noshowCount = summary?.noshowCount || 0;

    // ─── 1. 인사말 & 종합 개관 (2~3문장) ───
    const openings = [
      `안녕하세요, 학부모님. ${memberName} 회원의 ${period} 수중운동 활동을 종합하여 성장 보고를 드립니다.`,
      `${memberName} 회원과 함께한 ${period} 동안의 여정을 정리하여 학부모님께 전해드립니다.`,
      `${memberName} 회원의 ${period} 성장 스토리를 6개 영역 데이터로 종합 분석한 결과를 공유드립니다.`,
    ];
    const opening = openings[Math.floor(Math.random() * openings.length)];
    const overview = `
이 기간 동안 총 ${totalSessions}회의 수중 세션에 참여하였으며, ${attendanceDays}일간 규칙적으로 출석하여 매우 성실한 참여 태도를 보였습니다. 물이라는 특수 환경 속에서 진행되는 개별화 프로그램은 회원님의 신체·정서·인지 발달에 다각적인 자극을 제공하며, 안전하고 즐거운 분위기 속에서 진행되었습니다.`;

    // ─── 2. 핵심 성과 하이라이트 (3~4문장) ───
    let highlight = "

【💫 이번 기간 핵심 성과】
";
    if (strongLabel && strongScore >= 70) {
      highlight += `${memberName} 회원은 특히 ${strongLabel} 영역에서 ${strongScore}점의 탁월한 성취를 보였습니다. 이는 해당 영역의 신체·정서적 준비도가 상당히 성숙했음을 의미하며, 앞으로의 프로그램에서도 이 강점을 활용하여 자신감을 유지·확장해 나갈 수 있을 것으로 기대됩니다. `;
    } else if (strongLabel) {
      highlight += `${strongLabel} 영역에서 ${strongScore}점을 기록하며, 해당 영역의 기초 능력이 안정적으로 자리 잡고 있음을 확인할 수 있었습니다. 지속적인 반복 훈련을 통해 다음 단계로의 진전이 가능한 시점입니다. `;
    }
    highlight += `주력 활동은 「${dominantLabel}」 영역으로, 세션 중 가장 활발한 참여와 몰입도를 관찰할 수 있었습니다. 학부모님께서도 가정에서 이 영역과 관련된 활동을 자연스럽게 연결해 주시면 시너지 효과를 기대할 수 있습니다.`;

    // ─── 3. 집중 개선 영역 (3~4문장) ───
    let improvement = "

【📈 다음 기간 집중 개선 영역】
";
    if (weakLabel && weakScore < 50) {
      improvement += `${weakLabel} 영역이 ${weakScore}점으로 상대적으로 발달의 여지가 크게 남아 있습니다. 이는 결코 부정적인 신호가 아니라, 앞으로의 성장 잠재력이 가장 큰 영역이라는 의미로 해석하실 수 있습니다. 다음 기간 프로그램에서는 해당 영역에 특화된 활동을 30% 이상 늘려 집중 개입하겠습니다. 물의 부력·저항·수온 특성을 활용한 맞춤형 접근으로 안정적인 향상을 유도하겠습니다.`;
    } else if (weakLabel) {
      improvement += `모든 영역에서 균형 잡힌 발달을 보이고 있어 특정 영역의 급격한 개선보다는 전체적인 심화가 필요한 시점입니다. 다음 기간에는 각 영역의 난이도를 한 단계씩 올려 도전 과제를 제공하겠습니다.`;
    } else {
      improvement += `현재 데이터로는 특별히 부진한 영역이 관찰되지 않아, 전 영역의 균형 있는 심화 훈련을 진행하겠습니다.`;
    }

    // ─── 4. 출석 및 참여도 (2~3문장) ───
    let attend = "

【📅 출석 및 참여 태도】
";
    if (noshowCount === 0) {
      attend += `${period} 동안 결석·취소 없이 완벽한 출석률(100%)을 기록하여 매우 훌륭한 참여 태도를 보였습니다. 규칙적인 참여는 수중운동의 효과를 극대화하는 가장 중요한 요소이며, 이러한 성실함이 지금의 성과를 만들어낸 원동력입니다. 학부모님의 지속적인 관심과 지원에 깊이 감사드립니다. 🎉`;
    } else if (noshowCount <= 2) {
      attend += `총 ${noshowCount}건의 노쇼·취소가 있었으나 전반적으로 안정적인 출석률을 유지했습니다. 수중운동은 주 2회 이상 규칙적인 참여가 이루어질 때 신체 적응과 학습 효과가 극대화됩니다. 부득이한 사정으로 결석이 발생할 경우 사전에 알려주시면 보강 일정을 유연하게 조율해 드리겠습니다.`;
    } else {
      attend += `이번 기간 노쇼·취소가 ${noshowCount}건 발생하여 규칙적인 참여율에 다소 아쉬움이 있었습니다. 수중운동은 신체가 물 환경에 적응하는 시간이 필요하므로, 최소 주 1회 이상 규칙적인 참여가 성장에 매우 중요합니다. 다음 기간에는 스케줄 관리에 조금 더 신경 써 주시면 그동안 쌓아온 성과를 유지·발전시킬 수 있을 것입니다.`;
    }

    // ─── 5. 정밀 측정 데이터 (2~3문장) ───
    let measure = "

【🔬 정밀 측정 데이터】
";
    if (measuredRatio >= 50) {
      measure += `전체 ${totalSessions}회 세션 중 ${measuredRatio}%에 해당하는 세션에서 Berg 균형 척도, 호흡 지속시간, 독립 보행 거리, MMT 근력, ROM 관절 가동범위 등의 정밀 수치가 기록되었습니다. 이는 신뢰도 높은 성장 추이 분석을 가능하게 하며, 객관적 데이터 기반의 프로그램 조정을 지원합니다. 앞으로도 이러한 수치 기록 문화를 지속하여 더욱 정교한 개별화 접근을 이어가겠습니다.`;
    } else if (measuredRatio >= 20) {
      measure += `이번 기간 정밀 수치 기록률은 ${measuredRatio}% 수준입니다. 태그 기반 활동 지수와 병행하여 성장 추이를 분석하고 있으나, 객관적 수치 데이터의 축적이 더욱 정밀한 개별화 프로그램 설계에 결정적인 역할을 합니다. 다음 기간에는 정밀 측정 빈도를 50% 이상으로 높여 신뢰도 높은 데이터를 확보할 계획입니다.`;
    } else {
      measure += `이번 기간에는 정밀 수치 기록보다 태그 기반 활동 관찰이 중심이 되었습니다. 다음 기간에는 Berg 균형·호흡 지속시간·MMT·ROM 등 핵심 지표를 세션당 1~2개씩 정기적으로 측정하여, 회원님의 신체 변화를 정량적으로 추적하고자 합니다. 이를 통해 학부모님께 더욱 객관적인 성장 리포트를 제공하겠습니다.`;
    }

    // ─── 6. 6축 종합 프로파일 해설 (2~3문장) ───
    let profile = "

【🎯 6축 성장 프로파일 해설】
";
    profile += `호흡·적응, 근력, 균형, 유연성, 사회성·지시수행, 인지·의사소통의 6개 축으로 구성된 성장 프로파일은 수중운동을 통해 발달하는 회원님의 전인적 성장을 시각화한 것입니다. 각 축은 단독으로 발달하지 않고 상호 연결되어 있으며, 예를 들어 호흡 조절 능력이 향상되면 자연스럽게 심리적 안정감(사회성)과 집중력(인지)에도 긍정적 영향을 미칩니다. 따라서 어느 한 영역만 집중적으로 훈련하기보다 6축 전체의 유기적 발달을 목표로 프로그램을 설계하고 있습니다.`;

    // ─── 7. 가정 연계 제안 (3~4문장) ───
    const homeTips = [
      "일상에서 심호흡 놀이(풍선 불기, 촛불 끄기 흉내)를 활용해 호흡 조절 능력을 자연스럽게 강화해 주세요.",
      "목욕 시간에 물놀이 요소(스펀지 짜기, 물장구, 잠수 놀이)를 5분씩 추가하시면 수중 감각이 지속적으로 유지됩니다.",
      "가정에서 균형감각 놀이(외발서기, 라인워킹)를 하루 5분씩 진행해 주시면 균형 축이 급속히 성장합니다.",
      "간단한 스트레칭(팔 뻗기, 다리 벌리기)을 취침 전 습관화하시면 유연성 축의 진전이 두드러집니다.",
      "일상 대화 중 간단한 지시 따르기 놀이(빨간 공 가져오기, 신발 정리하기)를 반복하시면 사회성·지시수행 축이 강화됩니다.",
      "그림책 읽기 후 간단한 질문(주인공 이름, 다음에 무슨 일이 있었지?)을 나누시면 인지·의사소통 축이 자연스럽게 발달합니다.",
    ];
    const pickedTips = homeTips.sort(() => Math.random() - 0.5).slice(0, 3);
    let home = "

【🏠 가정 연계 실천 제안】
";
    home += `수중운동의 효과는 센터에서만 이루어지는 것이 아니라 가정에서의 일상 활동과 연계될 때 극대화됩니다. 다음 세 가지 활동을 다음 기간 동안 시도해 보시길 권해 드립니다:
• ${pickedTips[0]}
• ${pickedTips[1]}
• ${pickedTips[2]}
이러한 활동은 특별한 도구나 시간 없이 일상 속에서 자연스럽게 통합할 수 있으며, 부모님과 함께하는 순간이 회원님에게 가장 소중한 학습 자원이 됩니다.`;

    // ─── 8. 다음 기간 목표 설정 (2~3문장) ───
    let goal = "

【🎯 다음 기간 프로그램 방향】
";
    goal += `다음 기간에는 ${dominantLabel} 영역의 강점을 유지하면서 ${weakLabel || "전 영역"}의 심화 훈련을 병행하는 균형 잡힌 커리큘럼을 준비하겠습니다. 세션마다 명확한 소목표를 설정하고, 회원님의 컨디션과 흥미도에 맞춰 유연하게 조정하겠습니다. 매 세션 종료 후에는 간단한 성취 피드백을 드려, 학부모님께서도 성장 과정을 실시간으로 함께 확인하실 수 있도록 하겠습니다.`;

    // ─── 9. 마무리 인사 (2~3문장) ───
    const closings = [
      `

${memberName} 회원의 잠재력을 이끌어내는 여정에 함께해 주셔서 진심으로 감사드립니다. 학부모님의 신뢰와 협조가 저희 치료사들에게 가장 큰 힘이 됩니다. 다음 기간에도 안전하고 즐거운 수중운동을 통해 회원님의 성장을 지원하겠습니다. 궁금하신 점이나 건의사항이 있으시면 언제든지 편하게 말씀해 주세요. 감사합니다. 🌊✨`,
      `

${memberName} 회원과 함께하는 매 세션은 저희에게도 소중한 배움의 시간입니다. 물이라는 특별한 환경 속에서 회원님이 보여주는 작은 변화 하나하나를 놓치지 않고 관찰하며, 개별화된 접근을 이어가겠습니다. 학부모님의 지속적인 관심과 지원에 다시 한번 깊이 감사드립니다. 🌊✨`,
    ];
    const closing = closings[Math.floor(Math.random() * closings.length)];

    const comment = opening + overview + highlight + improvement + attend + measure + profile + home + goal + closing;

    return NextResponse.json({
      success: true,
      comment,
      metadata: {
        totalSessions, measuredRatio, attendanceDays, dominantLabel,
        sectionsCount: 9,
        length: comment.length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "성장보고서 AI 코멘트 생성 실패" }, { status: 500 });
  }
}

