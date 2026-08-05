import { NextRequest, NextResponse } from "next/server";

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

function pick<T>(arr: T[], seed = Math.random()): T {
  return arr[Math.floor(seed * arr.length)];
}

function calcAge(birth: string): number {
  if (!birth) return 0;
  const b = new Date(birth);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

// ═══════════════════════════════════════════════════════════════════
// 메인 생성 로직 (단계별 사고)
// ═══════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
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
