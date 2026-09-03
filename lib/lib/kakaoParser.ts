/* ============================================================
   v3.15.1 - 카카오톡 대화 파일 파서
   - PC 카카오톡 export .txt 파일 파싱
   - 회원별 세션 활동/특이사항 자동 분류
============================================================ */

export interface ParsedSession {
  date: string;              // YYYY-MM-DD
  weekday: string;           // 월|화|수|목|금|토|일
  status: "attended" | "cancelled" | "sick" | "absent" | "makeup";
  activities: string[];      // 자동 매핑된 라벨
  memo: string;              // 세션 메모 (자동 요약)
  parent_messages: string[]; // 원본 발화 (참고용)
  tags: string[];            // 자동 태그 (컨디션저하, 긍정반응 등)
  raw_body: string;          // 원본 대화 (전체)
}

export interface ParseResult {
  member_name?: string;       // 파일명에서 추출
  period_start: string;
  period_end: string;
  total_days: number;
  sessions: ParsedSession[];
  summary: {
    attended: number;
    cancelled: number;
    sick: number;
    absent: number;
  };
}

// 대화 내용 → 활동 자동 매핑
const ACTIVITY_KEYWORDS: Record<string, string[]> = {
  "물 적응·호흡 조절":       ["물 적응", "호흡", "물무서", "물 익숙", "숨참"],
  "부력 활용 이완":          ["이완", "누워", "부력", "떠", "편안"],
  "부력봉 활용 근력 훈련":   ["부력봉", "근력"],
  "수중 걷기":               ["수중 걷", "걷기", "걸음"],
  "수중 스트레칭":           ["스트레칭", "유연"],
  "숨 참기·잠수 놀이":        ["잠수", "숨참", "숨 참"],
  "와츠(WATSU) 요법":         ["와츠", "watsu", "WATSU"],
  "음파·물결 지향 활용":     ["음파", "물결"],
  "킥판 활용 발차기":         ["킥판", "발차기", "킥"],
  "할리윅(Halliwick) 10단계": ["할리윅", "halliwick"],
  "배영·자유형 기초":         ["배영", "자유형", "수영"],
  // 물리치료
  "관절가동범위(ROM) 훈련":  ["ROM", "가동범위", "관절"],
  "균형 잡기 훈련":           ["균형"],
  "근력 강화 운동":           ["근력", "힘"],
  "보행 훈련":                ["보행", "걷기"],
  "자세 교정":                ["자세", "교정"],
  "코어 안정화 운동":         ["코어", "복근"],
  "심폐 지구력 훈련":         ["심폐", "지구력"],
  // 작업치료
  "놀이 활용 상호작용":       ["놀이", "게임", "물고기", "장난감", "재미"],
  "과제 집중력 훈련":         ["집중", "과제"],
  "소근육 조작 활동":         ["소근육", "손"],
  "시지각·눈-손 협응":         ["시지각", "눈-손", "협응"],
  "양측 협응 훈련":           ["양측", "양손"],
  // 감각통합
  "감각 방어 완화":           ["감각방어", "예민", "민감"],
  "고유수용감각 활동":         ["고유수용"],
  "시각 추적 훈련":           ["시각", "추적"],
  "전정감각 자극":            ["전정", "회전"],
  "청각 자극 조절":           ["청각", "소리"],
  "촉각 둔감화·예민화 조절":   ["촉각", "둔감", "만짐"],
  // 재활기법
  "PNF 고유수용성 신경근 촉진": ["PNF"],
  "보바스 접근":              ["보바스", "bobath"],
  "신경발달치료(NDT)":        ["NDT", "신경발달"],
};

// 대화 내용 → 자동 태그
function autoTags(body: string): string[] {
  const tags: string[] = [];
  if (/취소|노쇼|결석/.test(body)) tags.push("취소/결석");
  if (/변경|연기|보강/.test(body)) tags.push("일정변경");
  if (/감기|열이|고열|아프|기침|콧물|병원|응급실|입원/.test(body)) tags.push("컨디션 저하");
  if (/피부|아토피|발진|봉합/.test(body)) tags.push("피부/외상");
  if (/기저귀|대변|소변/.test(body)) tags.push("배변/기저귀");
  if (/잘했|좋아|즐거|재밌|재미|적응|웃|칭찬/.test(body)) tags.push("긍정반응");
  if (/울|거부|무서워|불안|싫어/.test(body)) tags.push("저항/거부");
  if (/늦|지각/.test(body)) tags.push("지각");
  if (/션트|수두증|뇌압|수술/.test(body)) tags.push("의료 이벤트");
  return Array.from(new Set(tags));
}

// 대화 내용 → 세션 상태 자동 판정
function detectStatus(body: string, tags: string[]): ParsedSession["status"] {
  const bodyLower = body.toLowerCase();
  if (/(감기|열|아프|병원|응급실|입원|고열|중이염|장염|봉합).*(못 갈|힘들|쉬어야|어려울|안 될|안될)/.test(body)
      || /(수술|입원|응급실)/.test(body)) return "sick";
  if (/오늘.*(못 갈|힘들|안 갈|안될|어려울)|수업.*(못 갈|힘들|어려울)|쉬어야/.test(body)) {
    if (tags.includes("컨디션 저하")) return "sick";
    return "cancelled";
  }
  if (/보강|대체 수업/.test(body)) return "makeup";
  return "attended";
}

// 활동 자동 매핑
function detectActivities(body: string): string[] {
  const found = new Set<string>();
  for (const [activity, kws] of Object.entries(ACTIVITY_KEYWORDS)) {
    for (const kw of kws) {
      if (body.toLowerCase().includes(kw.toLowerCase())) {
        found.add(activity);
        break;
      }
    }
  }
  return Array.from(found);
}

// 세션 메모 자동 생성 (어머님 발화 + 요약)
function generateMemo(body: string, tags: string[], status: string): string {
  const parentMsgs: string[] = [];
  for (const line of body.split("\n")) {
    if (line.includes("어머님") || line.includes("어머니")) {
      const m = line.match(/\]\s*(.+?)$/);
      if (m) {
        const msg = m[1].trim();
        if (msg.length > 8 && msg.length < 300) parentMsgs.push(msg);
      }
    }
  }

  let memo = "";
  if (tags.length > 0) memo += `[자동 태그] ${tags.join(", ")}\n`;
  if (status === "sick") memo += `⚠️ 병결 처리 (건강 이슈)\n`;
  else if (status === "cancelled") memo += `❌ 취소/결석\n`;
  else if (status === "makeup") memo += `🔄 보강 수업\n`;

  if (parentMsgs.length > 0) {
    memo += `\n[보호자 메시지]\n`;
    memo += parentMsgs.slice(0, 3).map((m) => `• ${m.slice(0, 200)}`).join("\n");
  }
  return memo.trim();
}

// 파일명에서 회원명 추출
function extractMemberName(filename: string): string | undefined {
  // "KakaoTalk_..._손민오어머님(21.03.31).txt" 패턴
  const m = filename.match(/([가-힣]{2,4})(어머님|어머니|아버님|아버지|보호자|님)?/);
  return m?.[1];
}

/* ============================================================
   메인 파서
============================================================ */
export function parseKakaoTalk(content: string, filename?: string): ParseResult {
  const memberName = filename ? extractMemberName(filename) : undefined;

  // 날짜 구분선으로 분리: --- YYYY년 M월 D일 요일 ---
  const sections = content.split(
    /-{5,}\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*([월화수목금토일])요일\s*-{5,}/
  );

  const sessions: ParsedSession[] = [];
  for (let i = 1; i < sections.length; i += 5) {
    if (i + 4 >= sections.length) break;
    const y = sections[i];
    const m = sections[i + 1];
    const d = sections[i + 2];
    const w = sections[i + 3];
    const body = (sections[i + 4] || "").trim();

    if (!body) continue;

    const tags = autoTags(body);
    const status = detectStatus(body, tags);
    const activities = status === "attended" ? detectActivities(body) : [];
    const memo = generateMemo(body, tags, status);

    const parentMsgs: string[] = [];
    for (const line of body.split("\n")) {
      if (line.includes("어머님") || line.includes("어머니")) {
        const mm = line.match(/\]\s*(.+?)$/);
        if (mm) parentMsgs.push(mm[1].trim());
      }
    }

    sessions.push({
      date: `${y}-${String(Number(m)).padStart(2, "0")}-${String(Number(d)).padStart(2, "0")}`,
      weekday: w,
      status,
      activities,
      memo,
      parent_messages: parentMsgs.slice(0, 5),
      tags,
      raw_body: body.slice(0, 2000), // 참고용 원본 (2000자 제한)
    });
  }

  const summary = {
    attended: sessions.filter((s) => s.status === "attended" || s.status === "makeup").length,
    cancelled: sessions.filter((s) => s.status === "cancelled").length,
    sick: sessions.filter((s) => s.status === "sick").length,
    absent: sessions.filter((s) => s.status === "absent").length,
  };

  return {
    member_name: memberName,
    period_start: sessions[0]?.date || "",
    period_end: sessions[sessions.length - 1]?.date || "",
    total_days: sessions.length,
    sessions,
    summary,
  };
}
