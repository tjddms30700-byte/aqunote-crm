"use client";

/**
 * ═══════════════════════════════════════════════════════════════
 * 🏋️‍♂️ v3.42.0 지상재활 전용 상담차트 (수중 완전 분리)
 * ═══════════════════════════════════════════════════════════════
 * 렌더링 조건: member.service_track === 'ground'
 *
 * 수중 항목 완전 제거:
 *   ❌ 물 반응, 정서, 수중 기대효과, 특이행동/기피, 이용기관/학교
 *
 * 지상 전용 7개 섹션 (신청폼 1:1 매핑):
 *   ① 기본정보 (성명·연락처·생년월일·회원유형·주소)
 *   ② 통증/불편 부위 (Visual Body Map + 직접입력)
 *   ③ 일상 불편도 (NRS 1~10)
 *   ④ 통증 분석 (발생시기·조건·상세·양상)
 *   ⑤ 교정/재활 목적 (복수)
 *   ⑥ 안전 사전 체크
 *   ⑦ 라이프스타일 (운동·취미)
 *
 * 자동채우기: leads_inbox / consultations / member.extra.consult_form 폴백
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import GroundBodyMap from "./GroundBodyMap";
import { Sparkles, Save, RefreshCw } from "lucide-react";

interface Props {
  memberId: string;
  member: any;
}

interface GroundChart {
  // ① 기본정보
  name: string;
  phone: string;
  birth: string;
  gender: string;
  member_type: "adult" | "child";
  address: string;
  guardian_name?: string;
  guardian_phone?: string;
  // ② 통증 부위
  pain_areas: string[];
  pain_area_other: string;
  // ③ NRS
  nrs_score: number;
  // ④ 통증 분석
  pain_onset: string;
  pain_triggers: string[];
  pain_trigger_detail: string;
  pain_quality: string[];
  // ⑤ 재활 목적
  rehab_purposes: string[];
  // ⑥ 안전 사전 체크
  safety_checks: string[];
  // ⑦ 라이프스타일
  lifestyle: string[];
  lifestyle_hobby: string;
  // 메모
  memo: string;
}

const EMPTY_CHART: GroundChart = {
  name: "", phone: "", birth: "", gender: "", member_type: "adult", address: "",
  guardian_name: "", guardian_phone: "",
  pain_areas: [], pain_area_other: "",
  nrs_score: 5,
  pain_onset: "", pain_triggers: [], pain_trigger_detail: "", pain_quality: [],
  rehab_purposes: [],
  safety_checks: [],
  lifestyle: [], lifestyle_hobby: "",
  memo: "",
};

const PAIN_ONSET_OPTIONS = ["1개월 미만", "1~6개월", "6개월 이상"];
const PAIN_TRIGGER_OPTIONS = [
  "가만히 있을 때도 통증", "특정 동작/움직임 시 통증",
  "체중을 실을 때 통증", "자고 일어났을 때 통증", "자고 있을 때 통증",
];
const PAIN_QUALITY_OPTIONS = [
  "뻐근함·결림", "찌릿함·날카로움", "관절 소리/불안정", "부종·피로감", "이외의 통증",
];
const REHAB_PURPOSE_OPTIONS = [
  "체형 교정", "만성 통증 완화", "근력 강화", "부상 재활",
  "움직임 범위 개선", "자세 개선", "운동 수행능력 향상",
  "산후 회복", "노인성 근감소증 예방", "기타",
];
const SAFETY_OPTIONS = [
  "해당 없음", "최근 수술 이력", "금속 핀/체내 삽입물",
  "디스크 진단", "골절 회복 중", "임신 중",
];
const LIFESTYLE_OPTIONS = [
  "장시간 좌식", "서서 근무", "무거운 물건 들기", "특정 운동 반복",
];

export default function GroundConsultChart({ memberId, member }: Props) {
  const [chart, setChart] = useState<GroundChart>(EMPTY_CHART);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autofilling, setAutofilling] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string>("");

  const isLead = !!(member as any)?._isLead;

  // 최초 로드: DB에서 차트 조회 → 없으면 member.extra 에서 초기화
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: existing } = await supabase
          .from("consultation_charts")
          .select("*")
          .eq("member_id", memberId.startsWith("lead_") ? memberId.replace("lead_", "") : memberId)
          .maybeSingle();

        if (existing && existing.chart_data) {
          setChart({ ...EMPTY_CHART, ...(existing.chart_data as any) });
        } else {
          // 폴백: member 정보로 채우기
          const rp = (member?.extra?.consult_form || member?.extra || {}) as any;
          setChart({
            ...EMPTY_CHART,
            name: member?.name || rp.name || "",
            phone: member?.phone || rp.phone || "",
            birth: member?.birth || rp.birth || "",
            gender: member?.gender || rp.gender || "",
            member_type: (member?.member_type || rp.member_type || "adult") as any,
            address: member?.address || rp.address || "",
            guardian_name: member?.guardian_name || rp.guardian_name || "",
            guardian_phone: rp.guardian_phone || "",
            pain_areas: member?.pain_areas || rp.pain_areas || [],
            pain_area_other: rp.pain_area_other || "",
            nrs_score: (member?.nrs_score ?? rp.nrs_score ?? 5) as number,
            pain_onset: rp.pain_onset || "",
            pain_triggers: rp.pain_triggers || [],
            pain_trigger_detail: rp.pain_trigger_detail || "",
            pain_quality: rp.pain_quality || [],
            rehab_purposes:
              rp.rehab_purposes ||
              (rp.rehab_purpose ? [rp.rehab_purpose] : []) ||
              (member?.rehab_purpose ? [member.rehab_purpose] : []),
            safety_checks: rp.safety_checks || [],
            lifestyle: rp.lifestyle || [],
            lifestyle_hobby: rp.lifestyle_hobby || "",
            memo: member?.memo || rp.memo || "",
          });
        }
      } catch (e) {
        console.warn("[v3.42.0] 지상재활 차트 로드 실패:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId]);

  // 자동채우기: 지상 신청폼 → 차트 전량 주입
  async function autoFillFromGroundForm(overwrite = false) {
    setAutofilling(true);
    try {
      const pureId = memberId.startsWith("lead_") ? memberId.replace("lead_", "") : memberId;
      let rp: any = null;
      let source = "";

      // 1) member.extra.consult_form
      if (member?.extra?.consult_form && Object.keys(member.extra.consult_form).length > 0) {
        rp = member.extra.consult_form;
        source = "member.extra.consult_form";
      }

      // 2) leads_inbox (promoted_member_id or id 매칭)
      if (!rp) {
        const { data: lead } =
          (await supabase
            .from("leads_inbox")
            .select("raw_payload, consult_form")
            .eq("promoted_member_id", pureId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()) as any;
        if (lead) {
          rp = lead.raw_payload || lead.consult_form || null;
          if (rp) source = "leads_inbox";
        }
      }

      // 3) 원본 lead_ 접두어면 id 직접 매칭
      if (!rp && memberId.startsWith("lead_")) {
        const { data: lead } = await supabase
          .from("leads_inbox")
          .select("raw_payload, consult_form")
          .eq("id", pureId)
          .maybeSingle();
        if (lead) {
          rp = (lead as any).raw_payload || (lead as any).consult_form || null;
          if (rp) source = "leads_inbox (직접)";
        }
      }

      // 4) phone 기반 조회
      if (!rp && member?.phone) {
        const { data: lead } = await supabase
          .from("leads_inbox")
          .select("raw_payload, consult_form, phone")
          .eq("phone", member.phone)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lead) {
          rp = (lead as any).raw_payload || (lead as any).consult_form || null;
          if (rp) source = "leads_inbox (phone)";
        }
      }

      if (!rp) {
        alert("⚠️ 지상재활 신청폼 데이터를 찾을 수 없습니다.\n/consultation/ground 에서 새로 접수받거나, 상담·매칭 관리에서 리드 정보를 확인해주세요.");
        return;
      }

      console.log(`[v3.42.0] 지상 자동채우기 소스: ${source}, 필드 ${Object.keys(rp).length}개`);

      const filled: GroundChart = {
        name: rp.name || chart.name,
        phone: rp.phone || chart.phone,
        birth: rp.birth || chart.birth,
        gender: rp.gender || chart.gender,
        member_type: (rp.member_type || chart.member_type) as any,
        address: rp.address || chart.address,
        guardian_name: rp.guardian_name || chart.guardian_name || "",
        guardian_phone: rp.guardian_phone || chart.guardian_phone || "",
        pain_areas:
          Array.isArray(rp.pain_areas) && rp.pain_areas.length > 0 ? rp.pain_areas : chart.pain_areas,
        pain_area_other: rp.pain_area_other || chart.pain_area_other,
        nrs_score: rp.nrs_score ?? chart.nrs_score,
        pain_onset: rp.pain_onset || chart.pain_onset,
        pain_triggers:
          Array.isArray(rp.pain_triggers) && rp.pain_triggers.length > 0
            ? rp.pain_triggers
            : chart.pain_triggers,
        pain_trigger_detail: rp.pain_trigger_detail || chart.pain_trigger_detail,
        pain_quality:
          Array.isArray(rp.pain_quality) && rp.pain_quality.length > 0
            ? rp.pain_quality
            : chart.pain_quality,
        rehab_purposes:
          Array.isArray(rp.rehab_purposes) && rp.rehab_purposes.length > 0
            ? rp.rehab_purposes
            : rp.rehab_purpose
            ? [rp.rehab_purpose]
            : chart.rehab_purposes,
        safety_checks:
          Array.isArray(rp.safety_checks) && rp.safety_checks.length > 0
            ? rp.safety_checks
            : chart.safety_checks,
        lifestyle:
          Array.isArray(rp.lifestyle) && rp.lifestyle.length > 0 ? rp.lifestyle : chart.lifestyle,
        lifestyle_hobby: rp.lifestyle_hobby || chart.lifestyle_hobby,
        memo: rp.memo || chart.memo,
      };

      // overwrite=false 이면 기존 값 있는 필드는 유지
      if (!overwrite) {
        (Object.keys(filled) as (keyof GroundChart)[]).forEach((k) => {
          const cur = chart[k];
          const isEmpty =
            cur === null ||
            cur === undefined ||
            cur === "" ||
            (Array.isArray(cur) && cur.length === 0);
          if (!isEmpty) (filled as any)[k] = cur;
        });
      }

      setChart(filled);
      setSaveStatus(`✅ ${source} 에서 자동 채우기 완료`);
      setTimeout(() => setSaveStatus(""), 3000);
    } catch (e: any) {
      console.error("[v3.42.0] 자동채우기 실패:", e);
      alert("자동채우기 실패: " + (e?.message || String(e)));
    } finally {
      setAutofilling(false);
    }
  }

  async function saveChart() {
    if (isLead) {
      alert("⚠️ 신규 리드는 정식 회원으로 승격 후 저장 가능합니다.\n상담·매칭 관리에서 카드를 대기중으로 이동해주세요.");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        member_id: memberId,
        chart_data: chart,
        chart_type: "ground",
        updated_at: new Date().toISOString(),
      };
      const orgId = (member as any)?.org_id;
      if (orgId) payload.org_id = orgId;

      // upsert (있으면 update, 없으면 insert)
      const { data: existing } = await supabase
        .from("consultation_charts")
        .select("id")
        .eq("member_id", memberId)
        .maybeSingle();

      let error: any = null;
      if (existing?.id) {
        const r = await supabase
          .from("consultation_charts")
          .update({ chart_data: chart, chart_type: "ground", updated_at: payload.updated_at })
          .eq("id", existing.id);
        error = r.error;
      } else {
        const r = await supabase.from("consultation_charts").insert(payload);
        error = r.error;
      }

      if (error) {
        // consultation_charts 테이블이 없으면 members.extra.ground_chart 에 폴백 저장
        console.warn("[v3.42.0] consultation_charts 저장 실패, extra 폴백:", error.message);
        const curExtra = (member?.extra || {}) as any;
        const { error: e2 } = await supabase
          .from("members")
          .update({
            extra: { ...curExtra, ground_chart: chart, ground_chart_updated_at: payload.updated_at },
          })
          .eq("id", memberId);
        if (e2) throw e2;
      }
      setSaveStatus("✅ 지상재활 차트 저장됨");
      setTimeout(() => setSaveStatus(""), 3000);
    } catch (e: any) {
      console.error("[v3.42.0] 저장 실패:", e);
      setSaveStatus("❌ 저장 실패: " + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  }

  function toggleArr(field: keyof GroundChart, value: string) {
    setChart((c) => {
      const cur = (c[field] as string[]) || [];
      // safety_checks 는 "해당 없음" 배타
      if (field === "safety_checks") {
        if (value === "해당 없음")
          return { ...c, [field]: cur.includes(value) ? [] : ["해당 없음"] } as GroundChart;
        const next = cur.includes(value)
          ? cur.filter((v) => v !== value)
          : [...cur.filter((v) => v !== "해당 없음"), value];
        return { ...c, [field]: next } as GroundChart;
      }
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...c, [field]: next } as GroundChart;
    });
  }

  function togglePainArea(key: string) {
    setChart((c) => ({
      ...c,
      pain_areas: c.pain_areas.includes(key)
        ? c.pain_areas.filter((k) => k !== key)
        : [...c.pain_areas, key],
    }));
  }

  if (loading) return <div className="text-center py-10 text-slate-400">로딩 중...</div>;

  const nrsColor = (score: number) => {
    if (score <= 3) return "bg-emerald-500";
    if (score <= 6) return "bg-amber-500";
    if (score <= 8) return "bg-orange-500";
    return "bg-red-500";
  };
  const nrsLabel = (score: number) => {
    if (score <= 3) return "경증";
    if (score <= 6) return "중등도";
    if (score <= 8) return "중증";
    return "심각";
  };

  return (
    <div className="space-y-5">
      {/* 헤더 + 자동채우기 + 저장 */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border border-emerald-200">
        <div>
          <div className="text-lg font-bold text-emerald-900">🏋️‍♂️ 지상재활 전용 상담차트</div>
          <div className="text-xs text-emerald-700 mt-0.5">
            수중 전용 항목은 표시되지 않습니다 · 지상재활 신청폼과 1:1 매핑
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => autoFillFromGroundForm(false)}
            disabled={autofilling || isLead}
            className="px-3 py-2 rounded-lg text-xs font-bold bg-white text-emerald-700 border-2 border-emerald-500 hover:bg-emerald-50 disabled:opacity-50 flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {autofilling ? "채우는 중..." : "✨ 지상 상담폼 자동채우기"}
          </button>
          <button
            onClick={() => autoFillFromGroundForm(true)}
            disabled={autofilling || isLead}
            className="px-3 py-2 rounded-lg text-xs font-bold bg-white text-orange-700 border-2 border-orange-400 hover:bg-orange-50 disabled:opacity-50 flex items-center gap-1"
            title="기존 입력값을 상담폼 값으로 모두 덮어쓰기"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            전체 덮어쓰기
          </button>
          <button
            onClick={saveChart}
            disabled={saving || isLead}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
      {saveStatus && (
        <div className="px-3 py-2 rounded-lg text-xs bg-slate-50 border border-slate-200 text-slate-700">
          {saveStatus}
        </div>
      )}
      {isLead && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900">
          🆕 신규 리드는 읽기 전용입니다. 상담·매칭에서 대기중으로 이동해 정식 회원으로 승격하면 저장 가능합니다.
        </div>
      )}

      {/* ① 기본정보 */}
      <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 mb-3">① 기본정보</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="성명">
            <input type="text" value={chart.name} onChange={(e) => setChart({ ...chart, name: e.target.value })}
              className="input" />
          </Field>
          <Field label="연락처">
            <input type="tel" value={chart.phone} onChange={(e) => setChart({ ...chart, phone: e.target.value })}
              className="input" />
          </Field>
          <Field label="생년월일">
            <input type="date" value={chart.birth} onChange={(e) => setChart({ ...chart, birth: e.target.value })}
              className="input" />
          </Field>
          <Field label="성별">
            <select value={chart.gender} onChange={(e) => setChart({ ...chart, gender: e.target.value })}
              className="input">
              <option value="">선택</option>
              <option value="female">여성</option>
              <option value="male">남성</option>
            </select>
          </Field>
          <Field label="회원유형">
            <div className="flex gap-2">
              <button type="button" onClick={() => setChart({ ...chart, member_type: "adult" })}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border-2 ${chart.member_type === "adult" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-600 border-slate-200"}`}>🧑 성인</button>
              <button type="button" onClick={() => setChart({ ...chart, member_type: "child" })}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border-2 ${chart.member_type === "child" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-600 border-slate-200"}`}>👶 아동</button>
            </div>
          </Field>
          <Field label="주소">
            <input type="text" value={chart.address} onChange={(e) => setChart({ ...chart, address: e.target.value })}
              className="input" />
          </Field>
          {chart.member_type === "child" && (
            <>
              <Field label="보호자 성함">
                <input type="text" value={chart.guardian_name || ""} onChange={(e) => setChart({ ...chart, guardian_name: e.target.value })} className="input" />
              </Field>
              <Field label="보호자 연락처">
                <input type="tel" value={chart.guardian_phone || ""} onChange={(e) => setChart({ ...chart, guardian_phone: e.target.value })} className="input" />
              </Field>
            </>
          )}
        </div>
      </section>

      {/* ② 통증/불편 부위 (Visual Body Map) */}
      <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 mb-1">② 통증/불편 부위</h3>
        <p className="text-xs text-slate-500 mb-3">그림 위 점 또는 아래 라벨을 클릭해 부위를 선택하세요</p>
        <GroundBodyMap selectedKeys={chart.pain_areas} onToggle={togglePainArea} />
        <div className="mt-3">
          <label className="text-xs font-semibold text-slate-600 block mb-1.5">✏️ 기타/상세 부위 직접 입력</label>
          <textarea rows={2} value={chart.pain_area_other}
            onChange={(e) => setChart({ ...chart, pain_area_other: e.target.value })}
            placeholder="목록에 없는 부위나 특정 근육 부위를 적어주세요."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-500 focus:outline-none resize-none" />
        </div>
      </section>

      {/* ③ 일상 불편도 (NRS) */}
      <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 mb-1">③ 일상 불편도 (NRS 통증 점수)</h3>
        <p className="text-xs text-slate-500 mb-3">1점(경증) ~ 10점(심각) 척도</p>
        <div className="grid grid-cols-10 gap-1.5 mb-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => (
            <button key={score} type="button" onClick={() => setChart({ ...chart, nrs_score: score })}
              className={`py-2 rounded-lg text-sm font-bold border-2 transition ${chart.nrs_score === score ? `${nrsColor(score)} text-white border-transparent shadow` : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>
              {score}
            </button>
          ))}
        </div>
        <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold text-white ${nrsColor(chart.nrs_score)}`}>
          현재 {chart.nrs_score}점 · {nrsLabel(chart.nrs_score)}
        </div>
      </section>

      {/* ④ 통증 분석 */}
      <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 mb-3">④ 통증 분석</h3>

        <Sub label="📅 발생 시기 (단일 선택)">
          <div className="flex flex-wrap gap-2">
            {PAIN_ONSET_OPTIONS.map((o) => (
              <button key={o} type="button" onClick={() => setChart({ ...chart, pain_onset: chart.pain_onset === o ? "" : o })}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 ${chart.pain_onset === o ? "bg-purple-500 text-white border-purple-600" : "bg-white text-slate-600 border-slate-200 hover:border-purple-300"}`}>
                {o}
              </button>
            ))}
          </div>
        </Sub>

        <Sub label="🎬 발생 조건 (복수 선택)">
          <div className="flex flex-wrap gap-2">
            {PAIN_TRIGGER_OPTIONS.map((o) => (
              <button key={o} type="button" onClick={() => toggleArr("pain_triggers", o)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold ${chart.pain_triggers.includes(o) ? "bg-orange-500 text-white shadow" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {o}
              </button>
            ))}
          </div>
          <textarea rows={2} value={chart.pain_trigger_detail}
            onChange={(e) => setChart({ ...chart, pain_trigger_detail: e.target.value })}
            placeholder="구체적인 통증 발생 상황을 적어주세요 (예: 계단 내려갈 때 무릎 시큰, 오래 앉았다 일어날 때 허리 뻐근)"
            className="mt-2 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-orange-500 focus:outline-none resize-none" />
        </Sub>

        <Sub label="💭 느낌/양상 (복수 선택)">
          <div className="flex flex-wrap gap-2">
            {PAIN_QUALITY_OPTIONS.map((o) => (
              <button key={o} type="button" onClick={() => toggleArr("pain_quality", o)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold ${chart.pain_quality.includes(o) ? "bg-pink-500 text-white shadow" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {o}
              </button>
            ))}
          </div>
        </Sub>
      </section>

      {/* ⑤ 재활 목적 */}
      <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 mb-1">⑤ 교정/재활 목적</h3>
        <p className="text-xs text-slate-500 mb-3">복수 선택 · 선택 {chart.rehab_purposes.length}개</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {REHAB_PURPOSE_OPTIONS.map((o) => (
            <button key={o} type="button" onClick={() => toggleArr("rehab_purposes", o)}
              className={`py-2 px-3 rounded-lg text-sm font-semibold border-2 ${chart.rehab_purposes.includes(o) ? "bg-emerald-500 text-white border-emerald-500 shadow" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"}`}>
              {chart.rehab_purposes.includes(o) ? "☑ " : ""}{o}
            </button>
          ))}
        </div>
      </section>

      {/* ⑥ 안전 사전 체크 */}
      <section className="p-5 rounded-2xl bg-red-50 border-2 border-red-200 shadow-sm">
        <h3 className="text-base font-bold text-red-900 mb-1">⑥ ⚠️ 안전 사전 체크 <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full ml-2">필수</span></h3>
        <p className="text-xs text-red-700 mb-3">기저질환, 수술 이력, 체내 삽입물, 임신 등을 반드시 체크해주세요</p>
        <div className="flex flex-wrap gap-2">
          {SAFETY_OPTIONS.map((o) => (
            <button key={o} type="button" onClick={() => toggleArr("safety_checks", o)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 ${chart.safety_checks.includes(o)
                ? o === "해당 없음"
                  ? "bg-emerald-500 text-white border-emerald-600 shadow"
                  : "bg-red-500 text-white border-red-600 shadow"
                : "bg-white text-slate-700 border-slate-200 hover:border-red-300"}`}>
              {chart.safety_checks.includes(o) ? "☑ " : "☐ "}{o}
            </button>
          ))}
        </div>
        {chart.safety_checks.length > 0 && chart.safety_checks[0] !== "해당 없음" && (
          <div className="mt-3 p-3 bg-red-100 rounded-lg text-xs text-red-900 border border-red-300">
            🚨 <b>주의:</b> {chart.safety_checks.join(", ")} — 강도 조절 및 케어 방식 사전 협의 필요
          </div>
        )}
      </section>

      {/* ⑦ 라이프스타일 & 운동/취미 */}
      <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 mb-1">⑦ 라이프스타일 & 운동/취미</h3>
        <p className="text-xs text-slate-500 mb-3">근본 원인 분석 및 예방 계획 수립에 활용됩니다</p>
        <Sub label="🏃 생활 습관 (복수 선택)">
          <div className="flex flex-wrap gap-2">
            {LIFESTYLE_OPTIONS.map((o) => (
              <button key={o} type="button" onClick={() => toggleArr("lifestyle", o)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold ${chart.lifestyle.includes(o) ? "bg-teal-500 text-white shadow" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {o}
              </button>
            ))}
          </div>
        </Sub>
        <Sub label="🏃‍♂️ 평소 하고 있는 운동 및 취미">
          <textarea rows={3} value={chart.lifestyle_hobby}
            onChange={(e) => setChart({ ...chart, lifestyle_hobby: e.target.value })}
            placeholder="예) 주 3회 헬스 · 스쿼트 위주 / 등산 월 1회 / 사무직 · 요가 주 2회"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-500 focus:outline-none resize-none" />
        </Sub>
      </section>

      {/* 상담 메모 */}
      <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 mb-3">📝 상담 메모</h3>
        <textarea rows={4} value={chart.memo}
          onChange={(e) => setChart({ ...chart, memo: e.target.value })}
          placeholder="상담 중 특이사항, 회원의 개별 요청사항 등을 자유롭게 기록"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-500 focus:outline-none resize-none" />
      </section>

      {/* 하단 저장 버튼 */}
      <div className="flex justify-end">
        <button onClick={saveChart} disabled={saving || isLead}
          className="px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 shadow-md flex items-center gap-2">
          <Save className="w-4 h-4" />
          {saving ? "저장 중..." : "지상재활 차트 저장"}
        </button>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          outline: none;
          background: white;
        }
        .input:focus {
          border-color: #10b981;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-600 block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Sub({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-xs font-semibold text-slate-600 mb-2">{label}</div>
      {children}
    </div>
  );
}
