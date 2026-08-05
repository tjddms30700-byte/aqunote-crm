import { NextResponse } from "next/server";

export async function POST(req: Request) {
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

function calcAge(birth: string): number {
  const b = new Date(birth);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}
