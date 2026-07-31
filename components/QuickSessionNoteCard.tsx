"use client";

import { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Save, Sparkles, Loader2, ClipboardPaste } from "lucide-react";

/* ============================================================
   v3.21.4 - 재활/수업 일지 (세션 노트) 원클릭 카드 (전면 재작성)
   - 날짜/시간 선택
   - 진행 활동 = 선택형 (수중재활·물리치료·작업치료·감각통합·재활기법)
   - 세션 메모 (관찰·특이사항 자유 입력)
   - 다음 수업 계획 + 학부모 알림장 → 자동 생성 (원클릭)
   - 카톡 상담(알림장) 붙여넣기 → 자동 라벨링
============================================================ */

interface Props {
  memberId: string;
  memberName: string;
  onSaved: () => void;
}

// v3.21.4: 진행 활동 라벨 (5개 카테고리 × 각 6~10개)
const ACTIVITY_GROUPS: { label: string; color: string; items: string[] }[] = [
  {
    label: "💧 수중재활",
    color: "bg-cyan-50 text-cyan-800 border-cyan-300",
    items: ["물 적응·호흡 조절", "배영·자유형 기초", "부력 활용 이완", "부력봉 활용 근력 훈련", "수중 걷기", "수중 스트레칭", "숨 참기·잠수 놀이", "와츠(WATSU) 요법", "음파·물살 저항 활용", "킥판 활용 발차기", "할리윅(Halliwick) 10단계"],
  },
  {
    label: "🦵 물리치료",
    color: "bg-blue-50 text-blue-800 border-blue-300",
    items: ["관절가동범위(ROM) 훈련", "균형 잡기 훈련", "근력 강화 운동", "보행 훈련", "스트레칭·유연성 개선", "심폐 지구력 훈련", "자세 교정", "코어 안정화 운동", "통증 완화 접근"],
  },
  {
    label: "🖐️ 작업치료",
    color: "bg-emerald-50 text-emerald-800 border-emerald-300",
    items: ["과제 집중력 훈련", "놀이 활용 상호작용", "소근육 조작 활동", "사지각·눈-손 협응", "양측 협응 훈련", "일상생활동작(ADL) 훈련"],
  },
  {
    label: "🧠 감각통합",
    color: "bg-purple-50 text-purple-800 border-purple-300",
    items: ["감각 방어 완화", "고유수용감각 활동", "시각 추적 훈련", "전정감각 자극", "청각 자극 조절", "촉각 둔감화·예민함 조절"],
  },
  {
    label: "🎯 재활기법",
    color: "bg-orange-50 text-orange-800 border-orange-300",
    items: ["PNF 고유수용성 신경근 촉진", "보바스 접근", "신경발달치료(NDT)", "트레드밀 트레이닝"],
  },
];

function todayStr() { return new Date().toISOString().slice(0, 10); }
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// v3.21.4: 카톡/문자 붙여넣기 → 자동 날짜·활동·상태 라벨링
function autoLabelFromText(text: string): { date?: string; time?: string; activities: string[]; memo: string; status?: string } {
  const activities: string[] = [];
  const allItems = ACTIVITY_GROUPS.flatMap((g) => g.items);

  // 활동 자동 감지 (부분 문자열 매칭)
  for (const item of allItems) {
    const first = item.split(/[·(\s]/)[0]; // 예: "부력봉" · "관절가동범위"
    if (first && first.length >= 2 && text.includes(first)) {
      activities.push(item);
    }
  }

  // 날짜 자동 추출 (YYYY-MM-DD, YYYY.MM.DD, MM/DD, MM월 DD일)
  let date: string | undefined;
  const y = new Date().getFullYear();
  let m: RegExpMatchArray | null;
  if ((m = text.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/))) {
    date = `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  } else if ((m = text.match(/(\d{1,2})월\s*(\d{1,2})일/))) {
    date = `${y}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  } else if ((m = text.match(/(\d{1,2})[/](\d{1,2})/))) {
    date = `${y}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  }

  // 시간 자동 추출 (HH:MM, 오전/오후 HH시)
  let time: string | undefined;
  if ((m = text.match(/(\d{1,2}):(\d{2})/))) {
    time = `${String(m[1]).padStart(2, "0")}:${m[2]}`;
  } else if ((m = text.match(/오전\s*(\d{1,2})시/))) {
    time = `${String(m[1]).padStart(2, "0")}:00`;
  } else if ((m = text.match(/오후\s*(\d{1,2})시/))) {
    const h = Number(m[1]) + 12;
    time = `${String(h).padStart(2, "0")}:00`;
  }

  // 상태 자동 감지
  let status: string | undefined;
  if (/병결|아파서|열이|감기|컨디션.*저조|몸살/.test(text)) status = "sick";
  else if (/개인사정|불참|사정|일이 있어|가족행사/.test(text)) status = "personal";
  else if (/노쇼|안오|안 오|결석|안왔/.test(text)) status = "absent";
  else if (/출석|참석|왔|수업.*완료|완료/.test(text)) status = "present";
  else if (/보강|추가 수업|메이크업/.test(text)) status = "makeup";

  return {
    date,
    time,
    activities: Array.from(new Set(activities)),
    memo: text.trim(),
    status,
  };
}

export default function QuickSessionNoteCard({ memberId, memberName, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [f, setF] = useState<any>({
    session_date: todayStr(),
    session_time: nowTime(),
    duration_min: 30,
    activities: [] as string[],
    memo: "",
    next_plan: "",
    parent_message: "",
    status: "present", // v3.21.4: 병결/출석/보강 등 선택·수정 가능
  });

  const activitiesText = useMemo(() => f.activities.join(", "), [f.activities]);

  function toggleActivity(item: string) {
    setF((prev: any) => {
      const arr = prev.activities || [];
      return arr.includes(item)
        ? { ...prev, activities: arr.filter((x: string) => x !== item) }
        : { ...prev, activities: [...arr, item] };
    });
  }

  // v3.21.4: 다음 수업 계획 + 학부모 알림장 자동 생성 (관찰 메모·진행 활동 기반)
  function generateAutoContent() {
    const acts = f.activities.join(", ") || "-";
    const memoLine = (f.memo || "").split("\n")[0]?.slice(0, 60) || "";

    // 다음 수업 계획 – 진행 활동 기반 자동 제안
    const nextPlanParts: string[] = [];
    if (f.activities.some((a: string) => a.includes("부력봉"))) nextPlanParts.push("부력봉 지지 강도 감소 시도");
    if (f.activities.some((a: string) => a.includes("호흡") || a.includes("잠수"))) nextPlanParts.push("잠수 시간 확장 (5초 → 10초)");
    if (f.activities.some((a: string) => a.includes("걷기") || a.includes("보행"))) nextPlanParts.push("수중 걷기 거리 5m 증가");
    if (f.activities.some((a: string) => a.includes("스트레칭") || a.includes("가동범위"))) nextPlanParts.push("가동범위 5도 확장 목표");
    if (f.activities.some((a: string) => a.includes("근력"))) nextPlanParts.push("저항 강도 1단계 증가");
    if (f.activities.some((a: string) => a.includes("협응") || a.includes("눈-손"))) nextPlanParts.push("양측 협응 훈련 도구 다변화");
    const nextPlan = nextPlanParts.length > 0
      ? nextPlanParts.join(" · ")
      : "오늘 활동 흐름 유지하며 반복 훈련";

    // 학부모 알림장 – 자연스러운 문장 자동 조립
    const parentMsg = [
      `안녕하세요, ${memberName} 회원님 학부모님 😊`,
      "",
      `${f.session_date} ${f.session_time} 수업이 잘 마무리되었습니다.`,
      `오늘은 ${acts} 활동을 진행했어요.`,
      memoLine ? `\n💬 오늘의 관찰:\n${f.memo}` : "",
      `\n📅 다음 수업 계획:\n${nextPlan}`,
      "",
      "궁금하신 점은 언제든 편하게 문의 주세요 🙏",
      "위례아쿠수중운동센터 드림",
    ].filter(Boolean).join("\n");

    setF((prev: any) => ({ ...prev, next_plan: nextPlan, parent_message: parentMsg }));
  }

  // v3.21.4: 카톡/문자 붙여넣기 → 자동 라벨링 적용
  function applyPasteLabels() {
    if (!pasteText.trim()) { alert("붙여넣을 카톡/알림장 내용을 입력해 주세요"); return; }
    const labels = autoLabelFromText(pasteText);
    setF((prev: any) => ({
      ...prev,
      session_date: labels.date || prev.session_date,
      session_time: labels.time || prev.session_time,
      activities: labels.activities.length > 0 ? Array.from(new Set([...(prev.activities || []), ...labels.activities])) : prev.activities,
      memo: prev.memo ? prev.memo + "\n\n" + labels.memo : labels.memo,
      status: labels.status || prev.status,
    }));
    setPasteText("");
    setPasteMode(false);
    alert(`✅ 자동 라벨링 완료\n\n· 감지된 활동: ${labels.activities.length}개\n· 날짜: ${labels.date || "감지 안됨"}\n· 시간: ${labels.time || "감지 안됨"}\n· 상태: ${labels.status || "감지 안됨"}\n\n필요시 필드를 수동 수정하세요.`);
  }

  async function save() {
    if (!f.memo && f.activities.length === 0) {
      alert("세션 메모 또는 진행 활동을 하나 이상 입력해주세요");
      return;
    }
    setSaving(true);
    try {
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      const payload: any = {
        org_id: orgId,
        member_id: memberId,
        session_date: f.session_date,
        session_time: f.session_time,
        duration_min: Number(f.duration_min) || 30,
        activities: f.activities,
        tags: [f.status, ...(f.activities || [])].filter(Boolean),
        memo: [
          f.memo,
          f.next_plan && `\n📅 다음 수업 계획: ${f.next_plan}`,
          f.parent_message && `\n💌 학부모 알림장:\n${f.parent_message}`,
        ].filter(Boolean).join("\n"),
        status: f.status,
        source: "quick_note_v3214",
      };

      // v3.21.4: 컬럼 누락 자동 폴백
      let tryPayload = { ...payload };
      let err: any = null;
      for (let i = 0; i < 8; i++) {
        const r = await supabase.from("sessions").insert(tryPayload);
        if (!r.error) { err = null; break; }
        err = r.error;
        const msg = String(r.error.message || "");
        if (r.error.code === "42P01" || /does not exist/i.test(msg)) {
          alert("⚠️ sessions 테이블이 없습니다.\nAQUNOTE_V315_SESSIONS_FIXED.sql을 Supabase에 먼저 실행해주세요.");
          return;
        }
        const m = msg.match(/'([^']+)' column|column "([^"]+)"|column ([\w_]+) of|find the '([^']+)'/i);
        const missing = m?.[1] || m?.[2] || m?.[3] || m?.[4];
        if (missing && missing in tryPayload) { const { [missing]: _d, ...rest } = tryPayload; tryPayload = rest; continue; }
        break;
      }
      if (err) { alert("저장 실패: " + err.message); return; }

      // 성공 시 초기화
      setF({
        session_date: todayStr(),
        session_time: nowTime(),
        duration_min: 30,
        activities: [],
        memo: "",
        next_plan: "",
        parent_message: "",
        status: "present",
      });
      setOpen(false);
      alert("✅ 세션 노트 저장 완료");
      onSaved();
    } catch (e: any) {
      alert("저장 오류: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full mb-4 p-4 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 border-2 border-emerald-200 rounded-2xl hover:shadow-lg transition text-left group">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition">
            <span className="text-2xl">📝</span>
          </div>
          <div className="flex-1">
            <div className="font-bold text-emerald-900 text-base flex items-center gap-2">
              재활/수업 일지 원클릭 작성
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-200 text-emerald-800 rounded-full">태블릿 최적화</span>
            </div>
            <div className="text-xs text-emerald-700 mt-0.5">
              활동 선택 + 관찰 메모 · 다음 수업 계획·학부모 알림장 자동 생성
            </div>
          </div>
          <div className="text-emerald-600 text-2xl group-hover:translate-x-1 transition">→</div>
        </div>
      </button>
    );
  }

  return (
    <div className="mb-4 bg-gradient-to-br from-emerald-50 to-cyan-50 border-2 border-emerald-300 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-emerald-900 flex items-center gap-2">
          📝 재활/수업 일지 (세션 노트)
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPasteMode(!pasteMode)}
            className="text-xs px-2 py-1 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 border border-purple-200 flex items-center gap-1">
            <ClipboardPaste className="w-3 h-3" /> 카톡 붙여넣기 자동 라벨링
          </button>
          <button onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-gray-800">접기</button>
        </div>
      </div>

      {/* v3.21.4: 카톡 붙여넣기 자동 라벨링 영역 */}
      {pasteMode && (
        <div className="mb-3 p-3 bg-purple-50 border-2 border-purple-200 rounded-xl">
          <div className="text-xs font-bold text-purple-800 mb-1.5 flex items-center gap-1">
            💬 기존 카톡 상담·알림장 붙여넣기
          </div>
          <textarea value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            placeholder={"예:\n7월 30일 오후 3시 수업 완료\n오늘 부력봉 활용 근력 훈련 잘 진행함.\n수중 걷기 5m 성공. 컨디션 좋음."}
            className="w-full p-2 border border-purple-200 rounded-lg text-xs bg-white" />
          <div className="flex gap-2 mt-2">
            <button onClick={applyPasteLabels}
              className="flex-1 px-3 py-1.5 bg-purple-500 text-white text-xs font-bold rounded-lg hover:bg-purple-600">
              🎯 자동 라벨링 적용
            </button>
            <button onClick={() => { setPasteText(""); setPasteMode(false); }}
              className="px-3 py-1.5 bg-white text-gray-600 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">취소</button>
          </div>
          <div className="text-[10px] text-purple-600 mt-1">
            💡 날짜·시간·진행 활동·상태를 자동 감지합니다 (수동 수정 가능)
          </div>
        </div>
      )}

      {/* 기본 정보 – 날짜/시간/시간(분)/상태 */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div>
          <label className="text-[10px] font-semibold text-emerald-800">📅 세션 날짜</label>
          <input type="date" value={f.session_date}
            onChange={(e) => setF({ ...f, session_date: e.target.value })}
            className="w-full mt-0.5 px-2 py-1.5 border border-emerald-200 rounded-lg text-xs" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-emerald-800">⏰ 시간</label>
          <input type="time" value={f.session_time}
            onChange={(e) => setF({ ...f, session_time: e.target.value })}
            className="w-full mt-0.5 px-2 py-1.5 border border-emerald-200 rounded-lg text-xs" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-emerald-800">⏱️ 시간(분)</label>
          <input type="number" value={f.duration_min}
            onChange={(e) => setF({ ...f, duration_min: e.target.value })}
            className="w-full mt-0.5 px-2 py-1.5 border border-emerald-200 rounded-lg text-xs" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-emerald-800">🏷️ 상태</label>
          <select value={f.status}
            onChange={(e) => setF({ ...f, status: e.target.value })}
            className="w-full mt-0.5 px-2 py-1.5 border border-emerald-200 rounded-lg text-xs bg-white">
            <option value="present">✅ 출석</option>
            <option value="absent">🚩 결석/노쇼</option>
            <option value="sick">🤒 병결</option>
            <option value="personal">📝 개인사정</option>
            <option value="makeup">🔁 보강</option>
          </select>
        </div>
      </div>

      {/* v3.21.4: 진행 활동 선택 (그룹형) */}
      <div className="mb-3">
        <label className="text-xs font-semibold text-emerald-800 mb-1 block">
          🎯 오늘 세션 활동 선택 (다중 선택) · {f.activities.length}개 선택됨
        </label>
        <div className="space-y-2 max-h-[240px] overflow-y-auto p-2 bg-white/60 rounded-lg border border-emerald-100">
          {ACTIVITY_GROUPS.map((g) => (
            <div key={g.label}>
              <div className="text-[10px] font-bold text-emerald-900 mb-0.5">{g.label}</div>
              <div className="flex flex-wrap gap-1">
                {g.items.map((it) => {
                  const on = f.activities.includes(it);
                  return (
                    <button key={it} type="button" onClick={() => toggleActivity(it)}
                      className={`px-2 py-0.5 rounded-full text-[10px] border transition ${on ? "bg-emerald-500 text-white border-emerald-500 shadow-sm" : `${g.color} hover:opacity-80`}`}>
                      {it}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {activitiesText && (
          <div className="text-[10px] text-emerald-700 mt-1">✓ 선택됨: {activitiesText}</div>
        )}
      </div>

      {/* 세션 메모 (관찰·특이사항) */}
      <div className="mb-3">
        <label className="text-xs font-semibold text-emerald-800 mb-1 block">
          💬 세션 메모 (관찰·특이사항 자유 입력)
        </label>
        <textarea value={f.memo}
          onChange={(e) => setF({ ...f, memo: e.target.value })}
          rows={3}
          placeholder="오늘 회원의 관찰 내용, 특이사항 등을 자유롭게 기록"
          className="w-full p-2 border border-emerald-200 rounded-lg text-xs bg-white" />
      </div>

      {/* v3.21.4: 다음 수업 계획 + 학부모 알림장 자동 생성 버튼 */}
      <div className="mb-3 p-3 bg-white/70 border border-emerald-200 rounded-xl">
        <button onClick={generateAutoContent}
          className="w-full mb-2 px-3 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-md">
          <Sparkles className="w-4 h-4" /> 다음 수업 계획 + 학부모 알림장 자동 생성
        </button>

        <div className="mb-2">
          <label className="text-[11px] font-semibold text-emerald-800 mb-0.5 block">📅 다음 수업 계획 (자동 생성 → 수정 가능)</label>
          <input value={f.next_plan}
            onChange={(e) => setF({ ...f, next_plan: e.target.value })}
            placeholder="자동 생성 버튼을 눌러 계획 생성"
            className="w-full p-2 border border-emerald-200 rounded-lg text-xs bg-white" />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-emerald-800 mb-0.5 block">💌 학부모 알림장 (자동 생성 → 수정 가능)</label>
          <textarea value={f.parent_message}
            onChange={(e) => setF({ ...f, parent_message: e.target.value })}
            rows={5}
            placeholder="자동 생성 버튼을 눌러 알림장 초안 생성"
            className="w-full p-2 border border-emerald-200 rounded-lg text-xs bg-white whitespace-pre-wrap" />
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-2 disabled:opacity-60">
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중...</> : <><Save className="w-4 h-4" /> 세션 노트 저장</>}
      </button>
    </div>
  );
}
