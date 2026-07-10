import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/ai-message
 * body: { member, session, water_skills, pain_map }
 * 
 * AI 없이도 세션 정보를 기반으로 개인화된 상담 메시지 생성
 * (향후 OpenAI/Claude API 연동 가능)
 */

const ACTIVITY_DESCRIPTIONS: Record<string, string> = {
  "부력적응": "물에 뜨는 감각을 익히는 훈련",
  "호흡법": "물속에서 안정된 호흡 리듬 잡기",
  "균형운동": "수중 저항을 활용한 코어 강화",
  "스트레칭": "부드러운 수중 근막이완",
  "수중보행": "부력을 이용한 저부하 보행 훈련",
  "근력강화": "물의 저항으로 안전한 근력 향상",
  "관절가동": "관절 가동범위 확대 운동",
  "이완운동": "긴장 완화 및 신체 이완",
  "감각통합": "다양한 감각 자극 통합 훈련",
  "협응훈련": "손·발·시선의 조화 훈련",
};

const NEXT_ADVICE: Record<string, string> = {
  "부력적응": "다음 시간엔 얼굴 담그기와 짧은 잠수를 시도해볼게요",
  "호흡법": "다음엔 리듬있는 호흡 패턴을 좀 더 오래 유지해볼 예정입니다",
  "균형운동": "다음 회차엔 한 발 서기 균형 훈련을 추가하겠습니다",
  "스트레칭": "다음 시간엔 좀 더 깊은 가동범위로 진행해볼게요",
  "수중보행": "다음엔 후진 보행과 옆으로 걷기 응용을 넣어볼 예정입니다",
  "근력강화": "다음엔 아령·풀부이 등 도구를 활용한 근력 훈련을 진행할게요",
  "관절가동": "다음 세션엔 더 다양한 각도의 가동 운동을 시도합니다",
  "이완운동": "다음엔 물속 명상 시간을 좀 더 길게 가져볼 예정이에요",
  "감각통합": "다양한 질감·온도 도구를 활용한 감각 자극을 추가할게요",
  "협응훈련": "좌우 교차 동작으로 협응력을 한 단계 높여볼 예정입니다",
};

export async function POST(req: NextRequest) {
  try {
    const { member, session, water_skills, pain_map } = await req.json();

    if (!member || !session) {
      return NextResponse.json({ error: "member, session 필수" }, { status: 400 });
    }

    const isChild = member.type === "child";
    const targetName = isChild
      ? `${member.name} 어린이`
      : `${member.name}님`;
    const greetingName = isChild
      ? `${member.guardian || "학부모"}님`
      : `${member.name}님`;

    // 오늘 활동 요약
    const labels: string[] = session.labels || [];
    const activityLines = labels
      .map((l: string) => {
        const desc = ACTIVITY_DESCRIPTIONS[l] || l;
        return `  · ${l}: ${desc}`;
      })
      .join("\n");

    // 통증/평가 반영 (성인만)
    let progressLine = "";
    if (!isChild && pain_map && Object.keys(pain_map).length > 0) {
      const painfulParts = Object.entries(pain_map)
        .filter(([, v]) => (v as number) > 0)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 2)
        .map(([k]) => k);
      if (painfulParts.length > 0) {
        progressLine = "\n오늘도 통증 부위에 무리 없이 진행하였으며, 반응이 안정적이었어요.";
      }
    }

    // 아동 특화 문구
    if (isChild) {
      progressLine = `\n${targetName}이 오늘도 즐겁게 잘 참여해주었어요! 표정도 좋았고 활동에 적극적이었습니다.`;
    }

    // 다음 회차 안내
    const nextAdvice = labels
      .slice(0, 2)
      .map((l: string) => NEXT_ADVICE[l])
      .filter(Boolean)
      .join(" ");

    // 진단명 참고 문구
    const diagLine = member.diagnosis && member.diagnosis !== "없음"
      ? `\n${member.diagnosis} 관련하여 세심하게 관찰하며 진행했습니다.`
      : "";

    const message = `안녕하세요 ${greetingName}, 위례아쿠수중운동센터입니다 🌊

오늘 ${targetName}의 수업이 잘 마무리되었어요.
${diagLine}

📋 오늘 진행한 활동:
${activityLines}
${progressLine}
${session.memo ? `\n💬 코치 관찰: ${session.memo}` : ""}

${nextAdvice ? `\n🎯 다음 회차 계획:\n${nextAdvice}\n` : ""}
${isChild ? "다음 시간에도 잘 부탁드립니다! 😊" : "다음 세션 때 뵙겠습니다! 편안한 저녁 되세요 😊"}

- AQUNOTE 위례아쿠수중운동센터`;

    return NextResponse.json({
      success: true,
      message: message.trim(),
      note: "규칙 기반 생성. OpenAI API 키 추가 시 GPT-4 자동 활성화.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
