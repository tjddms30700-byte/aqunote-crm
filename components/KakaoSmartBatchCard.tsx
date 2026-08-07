"use client";
/* ============================================================
 * ✨ v3.34.0: 카톡 스마트 배치 입력 카드
 * - 여러 날짜의 카톡 내용을 한 화면에서 붙여넣기
 * - 텍스트 분석 → 활동 태그 자동 감지
 * - 지정 날짜(session_date)로 개별 세션 자동 저장
 * - 저장된 기록은 세션 히스토리 체인으로 자동 연동
 * ============================================================ */
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Sparkles, Plus, Trash2, Loader2, ClipboardPaste, Calendar } from "lucide-react";

interface Props {
  memberId: string;
  memberName: string;
  onSaved: () => void;
}

// 태그 매핑 규칙 (키워드 → 활동명)
const KEYWORD_MAP: { keywords: string[]; activity: string; category: string }[] = [
  // 수중재활
  { keywords: ["물 적응", "물적응", "적응", "물놀이"], activity: "물 적응·호흡 조절", category: "수중재활" },
  { keywords: ["호흡", "숨 쉬기", "호흡법"], activity: "물 적응·호흡 조절", category: "수중재활" },
  { keywords: ["배영", "자유형", "영법"], activity: "배영·자유형 기초", category: "수중재활" },
  { keywords: ["부력", "부력봉", "누들"], activity: "부력 활용 이완", category: "수중재활" },
  { keywords: ["부력 근력", "부력봉 근력"], activity: "부력봉 활용 근력 훈련", category: "수중재활" },
  { keywords: ["수중 걷기", "물속 걷기", "물 걷기"], activity: "수중 걷기", category: "수중재활" },
  { keywords: ["수중 스트레칭", "물속 스트레칭"], activity: "수중 스트레칭", category: "수중재활" },
  { keywords: ["잠수", "숨참기", "숨 참기"], activity: "숨 참기·잠수 놀이", category: "수중재활" },
  { keywords: ["와츠", "WATSU", "watsu"], activity: "와츠(WATSU) 요법", category: "수중재활" },
  { keywords: ["음파", "물살", "저항"], activity: "음파·물살 저항 활용", category: "수중재활" },
  { keywords: ["킥판", "발차기", "kick"], activity: "킥판 활용 발차기", category: "수중재활" },
  { keywords: ["할리윅", "Halliwick", "halliwick"], activity: "할리윅(Halliwick) 10단계", category: "수중재활" },
  // 물리치료
  { keywords: ["ROM", "관절", "가동범위", "관절가동"], activity: "관절가동범위(ROM) 훈련", category: "물리치료" },
  { keywords: ["균형", "밸런스"], activity: "균형 잡기 훈련", category: "물리치료" },
  { keywords: ["근력", "근육 강화", "근 강화"], activity: "근력 강화 운동", category: "물리치료" },
  { keywords: ["보행", "걷기 훈련"], activity: "보행 훈련", category: "물리치료" },
  { keywords: ["스트레칭", "유연성"], activity: "스트레칭·유연성 개선", category: "물리치료" },
  { keywords: ["심폐", "지구력", "유산소"], activity: "심폐 지구력 훈련", category: "물리치료" },
  { keywords: ["자세 교정", "자세"], activity: "자세 교정", category: "물리치료" },
  { keywords: ["코어", "복근", "체간"], activity: "코어 안정화 운동", category: "물리치료" },
  { keywords: ["통증", "아파", "쑤셔"], activity: "통증 완화 접근", category: "물리치료" },
  // 작업치료
  { keywords: ["집중력", "과제"], activity: "과제 집중력 훈련", category: "작업치료" },
  { keywords: ["놀이", "상호작용"], activity: "놀이 활용 상호작용", category: "작업치료" },
  { keywords: ["소근육", "손 조작"], activity: "소근육 조작 활동", category: "작업치료" },
  { keywords: ["눈-손", "협응", "시각협응"], activity: "사지각·눈-손 협응", category: "작업치료" },
  { keywords: ["양측 협응", "양손"], activity: "양측 협응 훈련", category: "작업치료" },
  { keywords: ["ADL", "일상생활"], activity: "일상생활동작(ADL) 훈련", category: "작업치료" },
  // 감각통합
  { keywords: ["감각 방어", "감각 예민", "감각방어"], activity: "감각 방어 완화", category: "감각통합" },
  { keywords: ["고유수용", "고유감각"], activity: "고유수용감각 활동", category: "감각통합" },
  { keywords: ["시각 추적", "눈 추적"], activity: "시각 추적 훈련", category: "감각통합" },
  { keywords: ["전정", "vestibular", "회전"], activity: "전정감각 자극", category: "감각통합" },
  { keywords: ["청각", "소리 자극"], activity: "청각 자극 조절", category: "감각통합" },
  { keywords: ["촉각", "만지는", "촉감"], activity: "촉각 둔감화·예민함 조절", category: "감각통합" },
  // 재활기법
  { keywords: ["PNF", "고유수용성"], activity: "PNF 고유수용성 신경근 촉진", category: "재활기법" },
  { keywords: ["보바스", "Bobath"], activity: "보바스 접근", category: "재활기법" },
  { keywords: ["NDT", "신경발달"], activity: "신경발달치료(NDT)", category: "재활기법" },
  { keywords: ["트레드밀", "러닝머신"], activity: "트레드밀 트레이닝", category: "재활기법" },
];

// 텍스트 분석 → 활동 태그 자동 감지
function analyzeText(text: string): { activities: string[]; matched: { keyword: string; activity: string }[] } {
  if (!text || !text.trim()) return { activities: [], matched: [] };
  const found = new Set<string>();
  const matched: { keyword: string; activity: string }[] = [];
  for (const rule of KEYWORD_MAP) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        if (!found.has(rule.activity)) {
          found.add(rule.activity);
          matched.push({ keyword: kw, activity: rule.activity });
        }
        break;
      }
    }
  }
  return { activities: Array.from(found), matched };
}

// 상태 자동 감지
function detectStatus(text: string): string {
  if (/병결|아파서|열|감기|컨디션 저조|몸살|고열/.test(text)) return "sick";
  if (/개인사정|불참|가족행사|여행|일이 있어/.test(text)) return "personal";
  if (/노쇼|안 왔|안왔|결석/.test(text)) return "absent";
  if (/보강|추가 수업|메이크업/.test(text)) return "makeup";
  if (/출석|참석|잘 했|잘했|완료|수업.*완료/.test(text)) return "present";
  return "present";
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

interface EntryRow {
  id: string;
  date: string;
  text: string;
  detected?: { activities: string[]; matched: { keyword: string; activity: string }[]; status: string };
}

export default function KakaoSmartBatchCard({ memberId, memberName, onSaved }: Props) {
  const [rows, setRows] = useState<EntryRow[]>([
    { id: crypto.randomUUID(), date: todayStr(), text: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(true);

  function addRow() {
    setRows([...rows, { id: crypto.randomUUID(), date: todayStr(), text: "" }]);
  }

  function removeRow(id: string) {
    setRows(rows.filter(r => r.id !== id));
  }

  function updateRow(id: string, patch: Partial<EntryRow>) {
    setRows(rows.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }

  // 실시간 분석 (텍스트 변경 시)
  function updateText(id: string, text: string) {
    const analyzed = analyzeText(text);
    const status = detectStatus(text);
    updateRow(id, { text, detected: { activities: analyzed.activities, matched: analyzed.matched, status } });
  }

  async function saveAll() {
    const valid = rows.filter(r => r.text.trim().length > 0 && r.date);
    if (valid.length === 0) {
      alert("저장할 카톡 내용을 하나 이상 입력해 주세요.");
      return;
    }
    // ✨ v3.34.1: 무더기 세션 분할 방지 - 사용자 확인 안내
    console.log(`[v3.34.1] 🔒 카톡 배치 저장: ${valid.length}개 텍스트 → 정확히 ${valid.length}개 세션만 생성 (텍스트 내 시간/줄바꿈 분할 없음)`);
    setSaving(true);
    let ok = 0, fail = 0;
    const errors: string[] = [];
    try {
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      // ✨ v3.34.1: 정확히 rows.length만큼만 INSERT (1행 = 1세션 원칙)
      for (const r of valid) {
        // ⚠️ r.text 통째로 저장 (텍스트 내 시간/줄바꿈으로 절대 분할하지 않음)
        const fullText = r.text.trim();
        const analyzed = analyzeText(fullText); // 전체 텍스트에서 활동 태그만 감지
        const status = detectStatus(fullText);
        const payload: any = {
          org_id: orgId,
          member_id: memberId,
          session_date: r.date,
          session_time: "00:00",
          duration_min: 30,
          activities: analyzed.activities,
          tags: [status, ...analyzed.activities].filter(Boolean),
          memo: fullText, // 💡 통째로 저장 (오후 6:24 등 시간 표기 그대로 유지)
          status,
          source: "kakao_batch_v3341_single",
        };
        let tryPayload = { ...payload };
        let saved = false;
        for (let i = 0; i < 8; i++) {
          const resp = await supabase.from("sessions").insert(tryPayload);
          if (!resp.error) { saved = true; break; }
          const msg = String(resp.error.message || "");
          const m = msg.match(/'([^']+)' column|column "([^"]+)"|column ([\w_]+) of|find the '([^']+)'/i);
          const missing = m?.[1] || m?.[2] || m?.[3] || m?.[4];
          if (missing && missing in tryPayload) {
            const { [missing]: _d, ...rest } = tryPayload;
            tryPayload = rest;
            continue;
          }
          errors.push(`${r.date}: ${msg}`);
          break;
        }
        if (saved) ok++; else fail++;
      }
      alert(`✅ 카톡 배치 저장 완료\n\n· 성공: ${ok}건\n· 실패: ${fail}건${errors.length > 0 ? "\n\n오류:\n" + errors.slice(0, 3).join("\n") : ""}\n\n저장된 기록은 다음 세션 작성 시 '이전 수업 기록'으로 자동 연동됩니다.`);
      // 성공한 항목 제거, 실패는 유지
      if (fail === 0) {
        setRows([{ id: crypto.randomUUID(), date: todayStr(), text: "" }]);
      }
      onSaved();
    } catch (e: any) {
      alert("저장 중 오류: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  const totalDetected = rows.reduce((sum, r) => sum + (r.detected?.activities?.length || 0), 0);
  const totalValid = rows.filter(r => r.text.trim()).length;

  return (
    <div className="mb-4 aqu-card bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 border-2 border-amber-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ClipboardPaste className="w-5 h-5 text-amber-700" />
          <div>
            <div className="font-bold text-amber-900 text-sm">💬 카톡 스마트 입력 (배치)</div>
            <div className="text-[10px] text-amber-700">카톡 대화를 날짜별로 붙여넣으면 자동으로 활동 태그를 분류하고 세션을 저장합니다</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalDetected > 0 && (
            <span className="text-[10px] font-bold bg-emerald-500 text-white px-2 py-1 rounded-full">
              🔍 {totalDetected}개 태그 감지
            </span>
          )}
          <button onClick={() => setExpanded(!expanded)}
            className="text-xs px-2 py-1 bg-white border border-amber-300 rounded-full text-amber-800 hover:bg-amber-50">
            {expanded ? "접기 ▲" : "펼치기 ▼"}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {rows.map((row, idx) => (
              <div key={row.id} className="bg-white rounded-xl border border-amber-200 p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">#{idx + 1}</span>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-600" />
                    <input
                      type="date"
                      value={row.date}
                      onChange={(e) => updateRow(row.id, { date: e.target.value })}
                      className="text-xs px-2 py-1 border border-amber-200 rounded-lg focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex-1" />
                  {row.detected && row.detected.activities.length > 0 && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      ✓ {row.detected.activities.length}개 감지
                    </span>
                  )}
                  {rows.length > 1 && (
                    <button onClick={() => removeRow(row.id)}
                      className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                      title="이 행 제거">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <textarea
                  value={row.text}
                  onChange={(e) => updateText(row.id, e.target.value)}
                  placeholder="복사한 카톡 대화 내용을 붙여넣으세요.&#10;예) 오늘은 물 적응이랑 킥판 발차기 했어요. 컨디션 좋았고 잠수도 5초 성공!"
                  rows={4}
                  className="w-full text-xs p-2 rounded-lg border border-amber-100 focus:border-amber-400 focus:outline-none bg-amber-50/30 resize-none"
                />

                {row.detected && row.detected.matched.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="text-[10px] text-slate-500 font-semibold">🏷️ 자동 감지된 태그:</span>
                    {row.detected.matched.map((m, i) => (
                      <span key={i}
                        className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-semibold border border-emerald-300"
                        title={`키워드 "${m.keyword}"에서 감지`}>
                        {m.activity}
                      </span>
                    ))}
                    <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-full font-semibold">
                      상태: {row.detected.status}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={addRow}
              className="text-xs px-3 py-2 bg-white border-2 border-amber-300 hover:border-amber-500 hover:bg-amber-50 rounded-lg font-semibold text-amber-800 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> 날짜/대화 추가
            </button>
            <div className="flex-1" />
            <span className="text-[11px] text-slate-600">
              {totalValid > 0 && <><b>{totalValid}건</b> 저장 대기 · </>}
              {totalDetected > 0 && <>총 <b>{totalDetected}개</b> 태그 감지</>}
            </span>
            <button
              onClick={saveAll}
              disabled={saving || totalValid === 0}
              className="text-xs px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-bold shadow-sm flex items-center gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              자동 태그 분석 및 세션 저장
            </button>
          </div>
        </>
      )}
    </div>
  );
}
