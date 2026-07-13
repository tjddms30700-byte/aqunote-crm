import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/analyze
 * 두 가지 유형 분석:
 *   type: 'iep_goal'    → IEP 목표 진도 분석
 *   type: 'behavior'    → 문제행동 패턴 분석
 */

export async function POST(req: NextRequest) {
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
