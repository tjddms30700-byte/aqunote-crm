"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { getActiveBranchId, useBranchWatch } from "@/lib/branchContext";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import ContactLogModal from "@/components/ContactLogModal";
import {
  Plus, Phone, Calendar, User, MessageCircle, ArrowRight, X, Save,
  Clock, Users, RefreshCw, Search, Lock, Unlock, ChevronRight,
  AlertCircle, TrendingUp, CheckCircle2, Target
} from "lucide-react";

/* ─────────────── 타입 & 상수 ─────────────── */

type Member = {
  id: string;
  name: string;
  member_type: "child" | "adult";
  phone: string | null;
  status: string | null;
  extra: any;
  memo: string | null;
  source: string | null;
  created_at?: string;
  wish_days?: string[] | null;
  wish_time_slots?: string[] | null;
  wish_start_date?: string | null;
  branch_id?: string | null;
  guardian_name?: string | null;
};

type MatrixCell = {
  id?: string;
  day_of_week: number;
  time_slot: string;
  status: "open" | "fixed" | "closed";
  fixed_name?: string | null;
  member_id?: string | null;
  staff_id?: string | null; // v3.21.7: 담당강사 지정 - 상담·시간표·수당 연동 상수
  note?: string | null;
};

const COLUMNS = [
  { key: "new",             label: "🆕 신규",     bg: "bg-pink-50 border-pink-200",     accent: "text-pink-700" },
  { key: "waiting",         label: "⏳ 대기중",   bg: "bg-yellow-50 border-yellow-200", accent: "text-yellow-700" },
  { key: "trial_scheduled", label: "📅 체험예정", bg: "bg-blue-50 border-blue-200",     accent: "text-blue-700" },
  { key: "trial_done",      label: "✅ 체험완료", bg: "bg-purple-50 border-purple-200", accent: "text-purple-700" },
  { key: "regular",         label: "🎯 정규등록", bg: "bg-emerald-50 border-emerald-200", accent: "text-emerald-700" },
  { key: "ended",           label: "🛑 대기종료", bg: "bg-red-50 border-red-200",       accent: "text-red-700" },
];

const DAYS = ["월", "화", "수", "목", "금", "토"];
const TIME_SLOTS = [
  "10:00~11:10", "11:10~12:20", "12:20~13:30", "13:30~14:40",
  "14:40~15:50", "15:50~17:00", "17:00~18:10", "18:10~19:20",
  "19:20~20:30", "20:30~21:40",
];

function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(x => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

/** ✅ v3.40.1: 셀-대기자 매칭 로직 완전 재작성 (확장 버그 수정)
 * 이전 버그: "19:20"이 "19:20~20:30" 슬롯의 timeStart="19:20"에 포함되어 오매칭
 * 해결: 각 wishTime을 (범위/단일시각/키워드) 3가지로 명확히 분류 후 엄격 매칭
 */
// ✅ v3.50.1: 희망 시간에 '정확한 시각(HH:MM)'이 있는지 검사
//   요일만 있거나 완전히 비어 있으면 매트릭스 산재 표시/증발 방지용
function hasExplicitTime(wishTimesRaw: any[] | null | undefined): boolean {
  return (wishTimesRaw || []).some((t: any) => /\d{1,2}:\d{2}/.test(String(t)));
}
function hasWishInfo(m: any): boolean {
  const days = (m.wish_days || []).filter(Boolean);
  const times = (m.wish_time_slots || []).filter(Boolean);
  return days.length > 0 || times.length > 0;
}

function matchesWish(wishDaysRaw: any[] | null | undefined, wishTimesRaw: any[] | null | undefined, day: number, time: string): boolean {
  const dayName = DAYS[day - 1];
  const wishTimes = (wishTimesRaw || []).map((s: any) => String(s).trim()).filter(Boolean);
  const wishDays  = (wishDaysRaw || []).flatMap((s: any) =>
    String(s).split(/[;,|/\s]+/).map(x => x.trim().replace("요일", "")).filter(Boolean)
  );
  const cellStart = parseTimeToMinutes(time.slice(0, 5));
  const cellStartHour = Math.floor(cellStart / 60);

  let dayMatched = false;
  if (wishDays.length > 0) dayMatched = wishDays.some(d => d.includes(dayName));
  else if (wishTimes.length > 0) dayMatched = wishTimes.some(t => t.includes(dayName));
  if (!dayMatched) return false;

  // wishTimes가 아예 없으면 요일만 매칭
  if (wishTimes.length === 0) return true;

  for (const raw of wishTimes) {
    const parts = raw.split(/[|,;]/).map((p: string) => p.trim()).filter(Boolean);
    for (const p of parts) {
      // (1) HH:MM ~ HH:MM 범위 우선 (핵심 수정)
      const rangeMin = p.match(/(\d{1,2}):(\d{2})\s*[~\-]\s*(\d{1,2}):(\d{2})/);
      if (rangeMin) {
        const rS = parseInt(rangeMin[1], 10) * 60 + parseInt(rangeMin[2], 10);
        const rE = parseInt(rangeMin[3], 10) * 60 + parseInt(rangeMin[4], 10);
        // 슬롯 시작이 범위 내이면서 범위 종료 미만 (경계 슬롯 제외)
        if (cellStart >= rS && cellStart < rE) return true;
        continue; // 범위 매칭 완료 시 다음 fallback 진입 금지
      }
      // (2) 단일 HH:MM (정확히 일치)
      const singleMin = p.match(/^(\d{1,2}):(\d{2})$/);
      if (singleMin) {
        const sMin = parseInt(singleMin[1], 10) * 60 + parseInt(singleMin[2], 10);
        if (cellStart === sMin) return true;
        continue;
      }
      // (3) 숫자 시 구간 (12~14)
      const range = p.match(/^(\d{1,2})\s*[~\-]\s*(\d{1,2})$/);
      if (range) {
        const s = parseInt(range[1], 10), e = parseInt(range[2], 10);
        if (cellStartHour >= s && cellStartHour < e) return true;
        continue;
      }
      // (4) 키워드
      if (p.includes("오전") && cellStartHour < 12) return true;
      if (p.includes("점심") && cellStartHour >= 12 && cellStartHour < 14) return true;
      if (p.includes("오후") && cellStartHour >= 12 && cellStartHour < 17) return true;
      if (p.includes("저녁") && cellStartHour >= 17) return true;
    }
  }
  return false;
}

/* ─────────────── 메인 페이지 ─────────────── */

export default function ConsultationsPage() {
  const [tab, setTab] = useState<"kanban" | "match" | "dashboard" | "faq">("kanban");
  const [members, setMembers] = useState<Member[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [matrix, setMatrix] = useState<MatrixCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ day: number; time: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => { loadAll(); }, []);
  useBranchWatch(() => loadAll());

  async function loadAll() {
    setLoading(true);
    const branchId = getActiveBranchId();
    const { data: org } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
    setOrgId(org?.id || null);

    // members (지점필터 fallback)
    // ✅ v3.49.5: 지점 미배정(branch_id IS NULL) 회원도 함께 표시
    //   기존 버그: 웹신청 자동승격 회원이 branch_id 없이 생성되어 상담 파이프라인에서 사라짐
    const q = branchId
      ? supabase.from("members").select("*").is("deleted_at", null)
          .or(`branch_id.eq.${branchId},branch_id.is.null`)
          .order("created_at", { ascending: false })
      : supabase.from("members").select("*").is("deleted_at", null).order("created_at", { ascending: false });
    let { data: memData, error: memErr } = await q;
    if (memErr && (memErr.code === "42703" || memErr.message?.includes("branch_id"))) {
      const r = await supabase.from("members").select("*").is("deleted_at", null).order("created_at", { ascending: false });
      memData = r.data;
    }

    // v3.21.7: staff SELECT 컴럼 폴백 (is_resigned/is_active/resign_date 없는 DB에서도 동작)
    async function loadStaffSafe() {
      const attempts = [
        "id, name, color, role, status, is_active, is_resigned, resign_date",
        "id, name, color, role, status, is_resigned, resign_date",
        "id, name, color, role, status, resign_date",
        "id, name, color, role, status",
        "id, name, color, role",
        "id, name, color",
        "id, name",
      ];
      for (const cols of attempts) {
        const r = await supabase.from("staff").select(cols).order("name");
        if (!r.error) return r;
      }
      return { data: [], error: null } as any;
    }

    const [staffRes, matrixRes, leadsRes] = await Promise.all([
      loadStaffSafe(),
      supabase.from("slot_matrix").select("*"),
      // ✅ v3.24.3: leads_inbox의 미처리 신규 유입을 자동으로 상담 리드 신규 탭에 표시
      supabase.from("leads_inbox").select("*").eq("processed", false).order("created_at", { ascending: false }),
    ]);

    // ✅ v3.24.3: leads_inbox의 미처리 유입을 members 목록에 신규 가상 항목으로 합치기
    const rawLeads = (leadsRes.data || []) as any[];
    const existingPhones = new Set(((memData as any) || []).map((m: any) => (m.phone || "").replace(/\D/g, "")).filter(Boolean));
    const virtualLeads = rawLeads
      .filter((l: any) => {
        // 이미 members에 승격된 건은 제외 (전화번호 중복)
        if (l.member_id) return false;
        const digits = String(l.phone || "").replace(/\D/g, "");
        if (digits && existingPhones.has(digits)) return false;
        return true;
      })
      .map((l: any) => ({
        id: `lead_${l.id}`,
        _leadId: l.id,
        _isLead: true,
        org_id: orgId,
        name: l.name || "(미입력)",
        phone: l.phone,
        member_type: l.member_type || "adult",
        // ✅ v3.40.7: 희망요일/시간(자유텍스트)/성별/생년월일 폴백 매핑
        wish_days: l.wish_days || l.raw_payload?.wish_days || null,
        wish_time_slots: l.wish_time_slots
          || l.raw_payload?.wish_time_slots
          || (l.raw_payload?.wish_time_text ? [l.raw_payload.wish_time_text] : null),
        gender: (l as any).gender || l.raw_payload?.gender || null,
        birth: (l as any).birth || l.raw_payload?.birth || null,
        memo: l.memo,
        source: l.source || "신규유입",
        status: "new",
        created_at: l.created_at,
        extra: l.raw_payload || {},
        // ✅ v3.38.0: 지상재활 리드 구분
        service_track: l.service_track || l.raw_payload?.service_track || "aqua",
        pain_areas: l.pain_areas || l.raw_payload?.pain_areas || [],
        nrs_score: l.nrs_score || l.raw_payload?.nrs_score,
        rehab_purpose: l.rehab_purpose || l.raw_payload?.rehab_purpose,
        // ✅ v3.40.7: 지상재활 자유텍스트 시간대
        wish_time_text: l.raw_payload?.wish_time_text || null,
        contact_time: l.raw_payload?.contact_time || null,
      }));
    const mergedMembers = [...virtualLeads, ...((memData as any) || [])];
    setMembers(mergedMembers);
    // v3.21.7: 퇴사자 자동 배제 - 모든 필드에 대해 optional 처리
    const activeStaff = ((staffRes as any).data || []).filter((s: any) => {
      const status = String(s.status || "").toLowerCase();
      if (["resigned", "retired", "inactive", "terminated", "quit", "leave"].includes(status)) return false;
      if (s.is_active === false) return false;
      if (s.is_resigned === true) return false;
      if (s.resign_date) return false;
      return true;
    });
    setStaff(activeStaff);
    setMatrix((matrixRes.data as any) || []);
    setLoading(false);
  }

  /* ─── 회원 상태 변경 (드래그 등) ─── v3.40.2: leads_inbox.processed 자동 전환 */
  async function moveMember(id: string, newStatus: string) {
    console.log("[v3.40.2] moveMember 호출:", { id, newStatus });

    // 🔧 v3.29.2: lead_ 접두어 제거 + 소스 테이블 자동 분기
    const isLead = typeof id === "string" && id.startsWith("lead_");
    const pureId = isLead ? id.replace("lead_", "") : id;

    // UUID 형식 검증 (36자, 하이픈 4개)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(pureId)) {
      console.error("[v3.40.2] 잘못된 UUID 형식:", pureId);
      alert("❌ 잘못된 ID 형식입니다: " + pureId);
      return;
    }

    try {
      if (isLead) {
        // ✅ v3.40.8: lead 카드를 신규 이외 컬럼으로 이동 시 members 로 자동 승격
        //   v3.40.7 이전 버그: leads_inbox.processed 만 true 로 바꿔 신규 조회에서 제외되고
        //   members 에는 INSERT 되지 않아 카드가 완전히 사라짐 → 김이름(지상재활 테스트) 이슈
        //   해결: 신규→다른상태 이동 시 leads_inbox 원본을 읽어 members 로 INSERT 하고
        //         promoted_member_id 로 연결하여 뱃지·이력 정합성 유지
        const shouldPromote = newStatus !== "new";

        if (shouldPromote) {
          // 1) leads_inbox 원본 가져오기
          const { data: lead, error: fetchErr } = await supabase
            .from("leads_inbox")
            .select("*")
            .eq("id", pureId)
            .maybeSingle();
          if (fetchErr || !lead) {
            console.error("[v3.40.8] leads_inbox 원본 조회 실패:", fetchErr?.message || "not found");
            alert("❌ 리드 원본을 찾을 수 없어 승격에 실패했습니다.");
            return;
          }

          const rp = (lead as any).raw_payload || (lead as any).consult_form || {};
          const branchId = getActiveBranchId();

          // 2) 이미 승격된 이력이 있으면 그 members row 를 재사용
          let memberId: string | null = (lead as any).promoted_member_id || null;

          if (!memberId) {
            // 3) members 테이블에 신규 INSERT (extra.consult_form 중첩 + flat 병행 저장)
            const memberInsert: any = {
              org_id: orgId,
              name: (lead as any).name || rp.name || "(미입력)",
              phone: (lead as any).phone || rp.phone || null,
              birth: (lead as any).birth || rp.birth || null,
              gender: (lead as any).gender || rp.gender || null,
              address: (lead as any).address || rp.address || null,
              guardian_name: (lead as any).guardian_name || rp.guardian_name || null,
              guardian_relation: rp.guardian_relation || null,
              member_type: (lead as any).member_type || rp.member_type || "adult",
              school: rp.school || null,
              diagnosis: rp.diagnosis || null,
              wish_days: (lead as any).wish_days || rp.wish_days || null,
              wish_time_slots: (lead as any).wish_time_slots
                || rp.wish_time_slots
                || (rp.wish_time_text ? [rp.wish_time_text] : null),
              status: newStatus,
              source: (lead as any).source || rp.source || "신규유입",
              memo: (lead as any).memo || rp.memo || null,
              // v3.38.0: 지상재활 트랙 정보 보존
              service_track: (lead as any).service_track || rp.service_track || "aqua",
              pain_areas: (lead as any).pain_areas || rp.pain_areas || null,
              nrs_score: (lead as any).nrs_score || rp.nrs_score || null,
              rehab_purpose: (lead as any).rehab_purpose || rp.rehab_purpose || null,
              // service_tags 자동 부여 (수중/지상)
              service_tags: ((lead as any).service_track || rp.service_track) === "ground" ? ["ground"] : ["aqua"],
              extra: {
                consult_form: rp,
                ...rp,
                _promoted_from_lead: pureId,
                _promoted_at: new Date().toISOString(),
              },
            };
            if (branchId) memberInsert.branch_id = branchId;

            // 화이트리스트 재시도 (없는 컬럼 자동 제거)
            let attempt = { ...memberInsert };
            let insertedId: string | null = null;
            for (let i = 0; i < 15; i++) {
              const { data, error } = await supabase.from("members").insert(attempt).select().maybeSingle();
              if (!error) {
                insertedId = (data as any)?.id || null;
                break;
              }
              const m = (error.message || "").match(/column "([^"]+)"|'([^']+)' column|Could not find the '([^']+)' column/i);
              const missing = m?.[1] || m?.[2] || m?.[3];
              if (missing && missing in attempt) {
                delete attempt[missing];
                continue;
              }
              console.error("[v3.40.8] members INSERT 실패:", error.message);
              alert("승격 실패: " + error.message);
              return;
            }
            memberId = insertedId;
          } else {
            // 이미 승격된 회원이 있으면 status 만 갱신
            await supabase.from("members").update({ status: newStatus }).eq("id", memberId);
          }

          // 4) leads_inbox 원본을 processed=true + promoted_member_id 로 마감
          if (memberId) {
            // ✅ v3.40.9: leads_inbox 마감 UPDATE 3단계 재시도 (홈 뱃지 자동 감소 보장)
            //   1차: 전체 필드 UPDATE
            //   2차: 컬럼 축소 UPDATE (processed + promoted_member_id 만)
            //   3차: 최후 안전장치 - processed 만이라도 반드시 true
            let closedOk = false;
            const { error: linkErr } = await supabase
              .from("leads_inbox")
              .update({
                processed: true,
                processed_at: new Date().toISOString(),
                status: newStatus,
                promoted_member_id: memberId,
              })
              .eq("id", pureId);
            if (!linkErr) {
              closedOk = true;
            } else {
              console.warn("[v3.40.9] leads_inbox 마감 1차 실패:", linkErr.message);
              const { error: retry1 } = await supabase.from("leads_inbox")
                .update({ processed: true, promoted_member_id: memberId })
                .eq("id", pureId);
              if (!retry1) {
                closedOk = true;
              } else {
                console.warn("[v3.40.9] leads_inbox 마감 2차 실패:", retry1.message);
                const { error: retry2 } = await supabase.from("leads_inbox")
                  .update({ processed: true })
                  .eq("id", pureId);
                if (!retry2) {
                  closedOk = true;
                  console.warn("[v3.40.9] leads_inbox 마감 3차(processed만)로 성공");
                } else {
                  console.error("[v3.40.9] leads_inbox 마감 완전 실패:", retry2.message);
                }
              }
            }
            if (closedOk) {
              console.log(`[v3.40.9] ✅ lead → member 승격 + 뱃지 마감 완료: leadId=${pureId.slice(0,8)} memberId=${memberId.slice(0,8)} status=${newStatus}`);
            } else {
              // DB 마감이 실패해도 홈 뱃지가 자동 정화 로직으로 감소하도록 promoted_member_id 는 유지
              console.error("[v3.40.9] ⚠️ leads_inbox 마감 실패 - 홈 뱃지 자기정화 로직이 다음 로드시 처리");
            }
          }
        } else {
          // 신규 상태 그대로 유지 (같은 컬럼 내 정렬 등) → leads_inbox 만 status 갱신
          const { error: inboxErr } = await supabase
            .from("leads_inbox")
            .update({ status: newStatus })
            .eq("id", pureId);
          if (inboxErr) console.warn("[v3.40.8] leads_inbox status UPDATE 스킵:", inboxErr.message);
        }
      } else {
        // 정식 회원은 members 테이블 UPDATE
        console.log("[v3.40.2] members 테이블 UPDATE:", pureId);
        const { error } = await supabase.from("members").update({ status: newStatus }).eq("id", pureId);
        if (error) throw error;

        // ✅ v3.40.2: 승격된 members 라도 leads_inbox 에 연결된 원본이 있으면 함께 processed 처리
        // promoted_member_id 로 역참조하여 미처리 leads_inbox 를 자동 정리
        if (newStatus !== "new") {
          const { error: linkErr } = await supabase
            .from("leads_inbox")
            .update({ processed: true, processed_at: new Date().toISOString() })
            .eq("promoted_member_id", pureId)
            .eq("processed", false);
          if (linkErr) console.warn("[v3.40.2] promoted_member_id 링크 정리 스킵:", linkErr.message);
        }
      }
      console.log("[v3.40.2] ✅ 상태 변경 + 뱃지 동기화 완료");
      await loadAll();
    } catch (e: any) {
      console.error("[v3.40.2] 상태 변경 실패:", e);
      alert("변경 실패: " + (e?.message || String(e)));
    }
  }

  /* ─── 신규 상담 빠른 등록 ─── */
  async function quickAdd(payload: any) {
    setSaving(true);
    const branchId = getActiveBranchId();
    // ✅ v3.20.19: members 테이블에 기본정보 + 딥 필드 자동 매핑
    const memberData: any = {
      org_id: orgId,
      name: payload.name.trim(),
      phone: payload.phone.trim() || null,
      member_type: payload.member_type,
      gender: payload.gender || null,
      birth: payload.birth || null,
      address: payload.address || null,
      guardian_name: payload.guardian_name || null,
      guardian_relation: payload.guardian_relation || null,
      school: payload.school || null,
      diagnosis: payload.diagnosis || null,
      status: "new",
      source: payload.source || "직접등록",
      memo: payload.memo || null,
      wish_days: payload.wish_days?.length > 0 ? payload.wish_days : null,
      wish_time_slots: payload.wish_time_slots?.length > 0 ? payload.wish_time_slots : null,
      // ✅ v3.40.2: extra.consult_form(중첩) + flat 두 구조 병행 저장
      //   - 상담폼 탭 / 상담차트 자동채우기는 extra.consult_form 을 우선 조회
      //   - 리거시 화면은 extra.* flat 필드 사용
      //   두 소스가 항상 동기화되어 "상담폼 데이터가 없습니다" 알럿을 방지
      extra: {
        consult_form: {
          // 기본 인적사항 (자동채우기 매퍼가 요구하는 상위 필드까지 포함)
          name: payload.name,
          phone: payload.phone,
          birth: payload.birth,
          gender: payload.gender,
          address: payload.address,
          guardian_name: payload.guardian_name,
          guardian_relation: payload.guardian_relation,
          member_type: payload.member_type,
          school: payload.school,
          diagnosis: payload.diagnosis,
          source: payload.source,
          wish_days: payload.wish_days,
          wish_time_slots: payload.wish_time_slots,
          // 의료·상담 필드 (flat 과 동일 내용을 중첩으로도 유지)
          height_weight: payload.height_weight,
          body_condition: payload.body_condition,
          main_symptom: payload.main_symptom,
          surgery_history: payload.surgery_history,
          medication: payload.medication,
          allergy: payload.allergy,
          notes_medical: payload.notes_medical,
          current_therapy: payload.current_therapy,
          has_pain: payload.has_pain,
          pain_area: payload.pain_area,
          pain_scale: payload.pain_scale,
          pain_onset: payload.pain_onset,
          aggravating_factor: payload.aggravating_factor,
          walking_level: payload.walking_level,
          sitting_level: payload.sitting_level,
          comm_level: payload.comm_level,
          instruction_level: payload.instruction_level,
          water_reaction: payload.water_reaction,
          emotional_reaction: payload.emotional_reaction,
          separation_reaction: payload.separation_reaction,
          sensory_notes: payload.sensory_notes,
          likes_activities: payload.likes_activities,
          dislikes_situations: payload.dislikes_situations,
          underlying_disease: payload.underlying_disease,
          start_available_date: payload.start_available_date,
          diaper_use: payload.diaper_use,
          most_worry: payload.most_worry,
          most_improve: payload.most_improve,
          avoid_situation: payload.avoid_situation,
          expected_change: payload.expected_change,
          additional_memo: payload.additional_memo,
          agree_privacy: payload.agree_privacy,
          agree_sensitive: payload.agree_sensitive,
          // 소스 표식 (디버깅용)
          _source: "직접등록(자체폼)",
          _created_at: new Date().toISOString(),
        },
        // 리거시 flat 필드도 동시 유지 (기존 화면 호환)
        height_weight: payload.height_weight,
        body_condition: payload.body_condition,
        main_symptom: payload.main_symptom,
        surgery_history: payload.surgery_history,
        medication: payload.medication,
        allergy: payload.allergy,
        notes_medical: payload.notes_medical,
        current_therapy: payload.current_therapy,
        has_pain: payload.has_pain,
        pain_area: payload.pain_area,
        pain_scale: payload.pain_scale,
        pain_onset: payload.pain_onset,
        aggravating_factor: payload.aggravating_factor,
        walking_level: payload.walking_level,
        sitting_level: payload.sitting_level,
        comm_level: payload.comm_level,
        instruction_level: payload.instruction_level,
        water_reaction: payload.water_reaction,
        emotional_reaction: payload.emotional_reaction,
        separation_reaction: payload.separation_reaction,
        sensory_notes: payload.sensory_notes,
        likes_activities: payload.likes_activities,
        dislikes_situations: payload.dislikes_situations,
        underlying_disease: payload.underlying_disease,
        start_available_date: payload.start_available_date,
        diaper_use: payload.diaper_use,
        most_worry: payload.most_worry,
        most_improve: payload.most_improve,
        avoid_situation: payload.avoid_situation,
        expected_change: payload.expected_change,
        additional_memo: payload.additional_memo,
        agree_privacy: payload.agree_privacy,
        agree_sensitive: payload.agree_sensitive,
      },
    };
    if (branchId) memberData.branch_id = branchId;

    // 자동 컴럼 폴백 (테이블에 없는 컴럼 자동 제거)
    let memberId: string | null = null;
    const insertData = { ...memberData };
    for (let i = 0; i < 12; i++) {
      const { data, error } = await supabase.from("members").insert(insertData).select().maybeSingle();
      if (!error) {
        memberId = data?.id || null;
        break;
      }
      const m = (error.message || "").match(/column "([^"]+)"/i);
      if (m?.[1] && m[1] in insertData) { delete insertData[m[1]]; continue; }
      setSaving(false);
      alert("등록 실패: " + error.message);
      return;
    }

    // ✅ consultations 테이블에 딥 정보 기록 (있으면)
    if (memberId) {
      const consultData: any = {
        org_id: orgId, branch_id: branchId,
        member_id: memberId,
        name: payload.name, phone: payload.phone,
        member_type: payload.member_type,
        diagnosis: payload.diagnosis || null,
        main_symptom: payload.main_symptom || null,
        surgery_history: payload.surgery_history || null,
        medication: payload.medication || null,
        allergy: payload.allergy || null,
        notes_medical: payload.notes_medical || null,
        current_therapy: payload.current_therapy || null,
        height_weight: payload.height_weight || null,
        body_condition: payload.body_condition || null,
        walking_level: payload.walking_level || null,
        sitting_level: payload.sitting_level || null,
        comm_level: payload.comm_level || null,
        instruction_level: payload.instruction_level || null,
        water_reaction: payload.water_reaction || null,
        emotional_reaction: payload.emotional_reaction || null,
        separation_reaction: payload.separation_reaction || null,
        sensory_notes: payload.sensory_notes || null,
        likes_activities: payload.likes_activities || null,
        dislikes_situations: payload.dislikes_situations || null,
        has_pain: payload.has_pain || false,
        pain_area: payload.pain_area?.join(",") || null,
        pain_scale: payload.pain_scale || null,
        pain_onset: payload.pain_onset || null,
        aggravating_factor: payload.aggravating_factor?.join(",") || null,
        underlying_disease: payload.underlying_disease?.join(",") || null,
        start_available_date: payload.start_available_date || null,
        diaper_use: payload.diaper_use || null,
        most_worry: payload.most_worry || null,
        most_improve: payload.most_improve || null,
        avoid_situation: payload.avoid_situation || null,
        expected_change: payload.expected_change || null,
        additional_memo: payload.additional_memo || null,
        agree_privacy: !!payload.agree_privacy,
        agree_sensitive: !!payload.agree_sensitive,
      };
      const consultInsert = { ...consultData };
      for (let i = 0; i < 30; i++) {
        const { error } = await supabase.from("consultations").insert(consultInsert);
        if (!error) break;
        if (error.code === "42P01") break; // 테이블 없음 – 조용히 스킵
        const m = (error.message || "").match(/column "([^"]+)"/i);
        if (m?.[1] && m[1] in consultInsert) { delete consultInsert[m[1]]; continue; }
        break; // 기타 에러는 조용히 무시 (멤버 저장은 성공함)
      }
    }

    setSaving(false);
    setShowQuickAdd(false);
    await loadAll();
  }

  /* ─── 매트릭스 셀 저장 ─── */
  function getCell(day: number, time: string): MatrixCell | undefined {
    return matrix.find(c => c.day_of_week === day && c.time_slot === time);
  }
  async function saveCell(day: number, time: string, patch: Partial<MatrixCell>) {
    setSaving(true);
    const existing = getCell(day, time);
    let error: any;
    // v3.21.7: staff_id 컴럼 미존재 시 6회 폴백 (이름 변경 대응)
    let tryPatch: any = { ...patch };
    for (let i = 0; i < 6; i++) {
      let r;
      if (existing) {
        r = await supabase.from("slot_matrix").update({ ...tryPatch, updated_at: new Date().toISOString() }).eq("id", existing.id!);
      } else {
        r = await supabase.from("slot_matrix").insert({ org_id: orgId, day_of_week: day, time_slot: time, status: "closed", ...tryPatch });
      }
      if (!r.error) { error = null; break; }
      error = r.error;
      const m = /'([^']+)' column|column "([^"]+)"/.exec(r.error.message || "");
      const missing = m?.[1] || m?.[2];
      if (missing && missing in tryPatch) {
        const { [missing]: _drop, ...rest } = tryPatch;
        tryPatch = { ...rest };
        continue;
      }
      break;
    }
    if (error) alert("저장 실패: " + error.message + "\n\n💡 slot_matrix 테이블에 staff_id 컴럼이 없으면 추가 필요");
    else await loadAll();
    setSaving(false);
  }

  /* ─── 대기자(정렬된) 및 셀별 매칭 ─── */
  const fixedMemberIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of matrix) if (c.status === "fixed" && c.member_id) s.add(c.member_id);
    return s;
  }, [matrix]);

  const waiters = useMemo(() => {
    return members
      .filter(m => m.status === "waiting")
      .filter(m => !fixedMemberIds.has(m.id))
      .sort((a, b) => {
        const ca = a.created_at || ""; const cb = b.created_at || "";
        if (!ca && !cb) return 0; if (!ca) return 1; if (!cb) return -1;
        return ca.localeCompare(cb);
      });
  }, [members, fixedMemberIds]);

  function getMatchedWaiters(day: number, time: string) {
    return waiters
      .filter(w => matchesWish(w.wish_days, w.wish_time_slots, day, time))
      .map((w, i) => ({ ...w, priority: i + 1 }));
  }

  // ✅ v3.50.1: 희망 요일/시간이 없어 매트릭스 어느 칸에도 표시되지 않는 인원
  //   기존 버그: 신규 회원을 대기중으로 바꿔도 희망정보가 비어 있으면 어디에도 안 뜸
  const unmatchedWaiters = useMemo(() => {
    return members
      .filter(m => m.status === "waiting")
      .filter(m => !fixedMemberIds.has(m.id))
      .filter(m => !hasWishInfo(m))
      .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  }, [members, fixedMemberIds]);

  const unmatchedTrials = useMemo(() => {
    return members
      .filter(m => m.status === "trial_scheduled")
      .filter(m => !hasExplicitTime(m.wish_time_slots));
  }, [members]);

  // v3.21.4: 체험예정 회원 – 시간표 매트릭스 셀에 자동 표시 (이중 예약 방지)
  // ✅ v3.50.1: 정확한 시각(HH:MM)이 있는 경우에만 칸 매칭
  //   기존 버그: 요일만 있으면 해당 요일 '모든 시간대'에 중복 표시 (이예한 케이스)
  function getTrialScheduled(day: number, time: string) {
    return members
      .filter(m => m.status === "trial_scheduled")
      .filter(m => hasExplicitTime(m.wish_time_slots))  // 시각 없으면 산재 금지
      .filter(m => matchesWish(m.wish_days, m.wish_time_slots, day, time));
  }

  /* ─── 통계 ─── */
  const stats = useMemo(() => {
    const now = new Date();
    const byStatus: Record<string, number> = {};
    COLUMNS.forEach(c => byStatus[c.key] = 0);
    for (const m of members) {
      // v3.21.2: status 미설정 시 최좌측 [🆕 신규] 컸럼으로 자동 배치
      const s = m.status || "new";
      byStatus[s] = (byStatus[s] || 0) + 1;
    }

    // 매칭 통계
    let openCells = 0, fixedCells = 0, matchedOpen = 0;
    for (let d = 1; d <= 6; d++) for (const t of TIME_SLOTS) {
      const c = getCell(d, t);
      if (c?.status === "fixed") fixedCells++;
      else if (c?.status === "open") {
        openCells++;
        if (getMatchedWaiters(d, t).length > 0) matchedOpen++;
      }
    }

    // 긴급 액션
    const stale = members.filter(m => {
      if (m.status !== "waiting") return false;
      const created = m.created_at ? new Date(m.created_at) : null;
      if (!created) return false;
      return (now.getTime() - created.getTime()) / 86400000 >= 30;
    });
    const trialSoon = members.filter(m => m.status === "trial_scheduled").slice(0, 10);

    // 이번 주 신규
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const newThisWeek = members.filter(m => m.created_at && new Date(m.created_at) >= weekAgo).length;

    // 전환율 (waiting → regular)
    const total = members.length;
    const converted = byStatus["regular"] || 0;
    const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;

    return { byStatus, openCells, fixedCells, matchedOpen, stale, trialSoon, newThisWeek, conversionRate, waitersCount: waiters.length };
  }, [members, matrix, waiters]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-aqu-50 text-aqu-600">로딩 중...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-4 md:p-6">
      {/* 헤더 */}
      <div className="max-w-7xl mx-auto mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">
            🎯 상담·매칭 관리
          </h1>
          <p className="text-xs text-gray-500 mt-1">상담 리드부터 시간표 배정까지 한 곳에서 관리합니다</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowQuickAdd(true)}
            className="px-3 py-2 text-sm bg-pink-600 text-white rounded-lg hover:bg-pink-700 flex items-center gap-1 shadow-sm">
            <Plus className="w-4 h-4" /> 신규 상담
          </button>
          <button onClick={loadAll} className="px-3 py-2 text-sm bg-white border border-aqu-200 rounded-lg hover:bg-aqu-50 flex items-center gap-1">
            <RefreshCw className="w-4 h-4" />
          </button>
          <HomeButton />
        </div>
      </div>

      {/* v3.20.23: 신청폼 URL 퀵 복사 툴바 + 설정 톱니바퀴 */}
      <QuickCopyToolbar />

      {/* v3.31.1: 알약형(pill) 탭 전환 */}
      <div className="max-w-7xl mx-auto mb-5">
        <div className="pill-tab-group">
          <button onClick={() => setTab("kanban")} className={`pill-tab ${tab === "kanban" ? "pill-tab-active" : ""}`}>📋 칸반 (파이프라인)</button>
          <button onClick={() => setTab("match")} className={`pill-tab ${tab === "match" ? "pill-tab-active" : ""}`}>🗓️ 시간표 매칭</button>
          <button onClick={() => setTab("dashboard")} className={`pill-tab ${tab === "dashboard" ? "pill-tab-active" : ""}`}>📊 대시보드</button>
          <button onClick={() => setTab("faq")} className={`pill-tab ${tab === "faq" ? "pill-tab-active" : ""}`}>💬 상담 FAQ</button>
        </div>
      </div>

      {/* ─── 탭 1: 칸반 ─── */}
      {tab === "kanban" && (
        <KanbanView members={members} stats={stats} onMove={moveMember} matrix={matrix} />
      )}

      {/* ─── 탭 2: 시간표 매칭 ─── */}
      {tab === "match" && (
        <MatchView
          matrix={matrix}
          members={members}
          staff={staff}
          waiters={waiters}
          stats={stats}
          getCell={getCell}
          getMatchedWaiters={getMatchedWaiters}
          getTrialScheduled={getTrialScheduled}
          onCellClick={(day, time) => setSelectedCell({ day, time })}
        unmatchedWaiters={unmatchedWaiters} unmatchedTrials={unmatchedTrials} />
      )}

      {/* ─── 탭 3: 대시보드 ─── */}
      {tab === "dashboard" && (
        <DashboardView members={members} stats={stats} onMove={moveMember} />
      )}

      {/* ─── 탭 4: 상담 FAQ (v3.20.22) ─── */}
      {tab === "faq" && <FaqView />}

      {/* 셀 편집 모달 */}
      {selectedCell && (
        <CellEditor
          day={selectedCell.day}
          time={selectedCell.time}
          cell={getCell(selectedCell.day, selectedCell.time)}
          matchedWaiters={getMatchedWaiters(selectedCell.day, selectedCell.time)}
          searchableMembers={members}
          staffList={(staff || []).filter((s: any) => !s.is_resigned)}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          saving={saving}
          onClose={() => { setSelectedCell(null); setSearchQuery(""); }}
          onSetStatus={(s: any) => saveCell(selectedCell.day, selectedCell.time, { status: s, fixed_name: s === "fixed" ? "" : null, member_id: null })}
          onAssign={async (m: Member, staffId?: string | null) => {
            // v3.21.6: 회원 배정 + 담당강사 동시 저장
            const patch: any = { status: "fixed", fixed_name: m.name, member_id: m.id };
            if (staffId !== undefined) patch.staff_id = staffId;
            await saveCell(selectedCell.day, selectedCell.time, patch);
            if (m.status !== "regular") {
              await supabase.from("members").update({ status: "regular" }).eq("id", m.id);
            }
            // v3.21.6: 회원의 담당강사(members.staff_id)도 갱신 - 시간표·수당·출결 연동 일관성
            if (staffId !== undefined && staffId !== null) {
              await supabase.from("members").update({ staff_id: staffId }).eq("id", m.id);
            }
            setSelectedCell(null); setSearchQuery("");
            await loadAll();
          }}
          onSetStaff={async (staffId: string | null) => {
            // v3.21.6: 기존 셀에 담당 선생님만 변경 (회원 유지)
            await saveCell(selectedCell.day, selectedCell.time, { staff_id: staffId });
            const cur = getCell(selectedCell.day, selectedCell.time);
            if (cur?.member_id && staffId) {
              await supabase.from("members").update({ staff_id: staffId }).eq("id", cur.member_id);
            }
            await loadAll();
          }}
          onUnlock={async () => {
            if (!confirm("고정 배정을 해제합니다. 계속?")) return;
            await saveCell(selectedCell.day, selectedCell.time, { status: "open", fixed_name: null, member_id: null, staff_id: null });
          }}
        />
      )}

      {/* 신규 상담 등록 모달 */}
      {showQuickAdd && (
        <QuickAddModal
          onClose={() => setShowQuickAdd(false)}
          onSave={quickAdd}
          saving={saving}
        />
      )}
    </div>
  );
}

/* ─────────────── 하위 컴포넌트: 칸반 ─────────────── */

function KanbanView({ members, stats, onMove, matrix }: any) {
  // v3.20.23: 신청서 보기 모달
  const [intakeTarget, setIntakeTarget] = useState<any | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  // ✅ v3.20.0: 칸반에도 응대 로그 모달 state
  const [contactTarget, setContactTarget] = useState<any>(null);
  // ✅ v3.18.0: 검색 + 요일 필터 + 컬럼 접기
  const [q, setQ] = useState("");
  const [dayFilter, setDayFilter] = useState<string>("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ ended: true });

  function isFixedInMatrix(memberId: string): { day: number; time: string } | null {
    const cell = matrix.find((c: MatrixCell) => c.member_id === memberId && c.status === "fixed");
    if (!cell) return null;
    return { day: cell.day_of_week, time: cell.time_slot };
  }

  function passesFilter(m: Member): boolean {
    if (q.trim()) {
      const kw = q.trim().toLowerCase();
      const digits = kw.replace(/\D/g, "");
      const nameHit = (m.name || "").toLowerCase().includes(kw);
      const phoneHit = digits.length >= 2 && (m.phone || "").replace(/-/g, "").includes(digits);
      if (!nameHit && !phoneHit) return false;
    }
    if (dayFilter) {
      if (!Array.isArray(m.wish_days) || !m.wish_days.includes(dayFilter)) return false;
    }
    return true;
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* ✅ v3.20.0: 칸반 응대 로그 모달 */}
      {contactTarget && (
        <ContactLogModal member={contactTarget} onClose={() => setContactTarget(null)} onSaved={() => {}} />
      )}
      {/* 파이프라인 요약 */}
      <div className="mb-4 grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
        {COLUMNS.map(col => (
          <div key={col.key} className="kpi-card">
            <div className={`kpi-label ${col.accent}`}>{col.label}</div>
            <div className="kpi-value">{stats.byStatus[col.key] || 0}명</div>
          </div>
        ))}
      </div>

      {/* ✅ v3.18.0: 검색 + 요일 필터 */}
      <div className="mb-3 flex flex-wrap items-center gap-2 bg-white border border-aqu-100 rounded-xl p-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-aqu-500" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="이름 · 연락처 검색"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          {q && <button onClick={() => setQ("")} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-gray-500 mr-1">희망요일</span>
          <button onClick={() => setDayFilter("")} className={`px-2 py-1 text-[11px] rounded-full border ${dayFilter === "" ? "bg-aqu-600 text-white border-aqu-600" : "bg-white text-gray-600 border-gray-200 hover:border-aqu-300"}`}>전체</button>
          {["월", "화", "수", "목", "금", "토"].map(d => (
            <button key={d} onClick={() => setDayFilter(dayFilter === d ? "" : d)} className={`px-2 py-1 text-[11px] rounded-full border ${dayFilter === d ? "bg-aqu-600 text-white border-aqu-600" : "bg-white text-gray-600 border-gray-200 hover:border-aqu-300"}`}>{d}</button>
          ))}
        </div>
      </div>

      {/* 칸반 보드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {COLUMNS.map(col => {
          const isCollapsed = !!collapsed[col.key];
          // v3.21.2: 신규 접수 자동 승격 – status 미설정 시 "new" 컸럼으로 배치 (기존 "waiting" 폴백 수정)
          const cards = members.filter((m: Member) => (m.status || "new") === col.key).filter(passesFilter);
          return (
            <div key={col.key}
              className={`kanban-col ${col.bg} ${isCollapsed ? "min-h-0" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id && draggedId) onMove(id, col.key);
                setDraggedId(null);
              }}>
              <div className="kanban-col-header">
                <button onClick={() => setCollapsed({ ...collapsed, [col.key]: !isCollapsed })} className={`kanban-col-title flex items-center gap-1 ${col.accent} hover:opacity-70`}>
                  <span>{isCollapsed ? "▸" : "▾"}</span>
                  {col.label}
                </button>
                <span className="kanban-col-count">{cards.length}</span>
              </div>
              {!isCollapsed && (
                <div className="space-y-1.5 max-h-[560px] overflow-y-auto">
                  {cards.map((m: Member) => {
                    const fixed = isFixedInMatrix(m.id);
                    return (
                      <div key={m.id}
                        draggable
                        onDragStart={(e) => { setDraggedId(m.id); e.dataTransfer.setData("text/plain", m.id); }}
                        className={`member-card cursor-move ${(m as any).service_track === "ground" ? "ring-2 ring-emerald-400 ring-offset-1" : ""}`}>
                        <Link href={`/members/${m.id}`} className="block">
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-medium text-sm text-aqu-900 truncate">{m.name}</span>
                            <div className="flex items-center gap-1">
                              {/* ✅ v3.38.0: 지상재활 리드 Emerald 뭣지 */}
                              {(m as any).service_track === "ground" && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-white" title="지상재활 트랙">🏋️‍♂️ 지상</span>
                              )}
                              <span className="text-[9px] flex-shrink-0">{m.member_type === "child" ? "🧒" : "👤"}</span>
                            </div>
                          </div>
                          {/* ✅ v3.38.0: 지상재활 NRS 점수 + 목적 */}
                          {(m as any).service_track === "ground" && ((m as any).nrs_score !== undefined || (m as any).rehab_purpose) && (
                            <div className="mt-0.5 mb-1 flex items-center gap-1 flex-wrap">
                              {(m as any).nrs_score !== undefined && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">NRS {(m as any).nrs_score}</span>
                              )}
                              {(m as any).rehab_purpose && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 truncate max-w-[100px]" title={(m as any).rehab_purpose}>🎯 {(m as any).rehab_purpose}</span>
                              )}
                              {(m as any).pain_areas?.length > 0 && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">통증 {(m as any).pain_areas.length}곳</span>
                              )}
                            </div>
                          )}
                          {m.phone && <div className="text-[10px] text-gray-500 font-mono">{m.phone}</div>}
                          {(m.wish_days && m.wish_days.length > 0) && (
                            <div className="text-[10px] text-gray-600 mt-0.5">📅 {m.wish_days.join(",")}</div>
                          )}
                          {fixed && (
                            <div className="mt-1 text-[9px] inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">
                              <Lock className="w-2.5 h-2.5" /> {DAYS[fixed.day - 1]} {fixed.time.slice(0, 5)}
                            </div>
                          )}
                          {m.memo && (
                            <div className="text-[10px] text-gray-500 mt-1 truncate italic" title={m.memo}>💬 {m.memo}</div>
                          )}
                        </Link>
                        {/* v3.20.23: [NEW] 컬럼은 신청서 보기 + 1-Click 승격 버튼 */}
                        {col.key === "new" ? (
                          <>
                            <div className="flex items-center gap-1 mt-1.5">
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500 text-white animate-pulse">
                                ⚠️ 미확인
                              </span>
                              {m?.extra?.is_new_intake && (
                                <span className="text-[9px] font-semibold text-pink-600">📝 신청서 도착</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-gray-100">
                              <button onClick={e => { e.stopPropagation(); setIntakeTarget(m); }}
                                className="flex-1 text-[10px] px-1 py-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 font-bold">
                                📝 신청서
                              </button>
                              <button onClick={e => { e.stopPropagation(); onMove(m.id, "waiting"); }}
                                className="flex-1 text-[10px] px-1 py-1 rounded bg-yellow-100 text-yellow-700 hover:bg-yellow-200 font-bold"
                                title="대기중으로 이동">
                                ⏳ 대기
                              </button>
                              <button onClick={e => { e.stopPropagation(); onMove(m.id, "trial_scheduled"); }}
                                className="flex-1 text-[10px] px-1 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-bold"
                                title="체험예정으로 이동">
                                📅 체험
                              </button>
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                              <button onClick={e => { e.stopPropagation(); setContactTarget(m); }}
                                className="flex-1 flex items-center justify-center gap-1 text-[10px] px-1.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold">
                                <Phone className="w-2.5 h-2.5" /> 응대
                              </button>
                              <Link href={`/schedule?member=${m.id}`} onClick={e => e.stopPropagation()} className="flex-1 flex items-center justify-center gap-1 text-[10px] px-1.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold">
                                <Calendar className="w-2.5 h-2.5" /> 예약
                              </Link>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-gray-100">
                            <button onClick={e => { e.stopPropagation(); setContactTarget(m); }}
                              className="flex-1 flex items-center justify-center gap-1 text-[10px] px-1.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold"
                              title="응대 기록 (전화/문자/카카오톡/메모)">
                              <Phone className="w-2.5 h-2.5" /> 응대
                            </button>
                            <Link href={`/schedule?member=${m.id}`} onClick={e => e.stopPropagation()} className="flex-1 flex items-center justify-center gap-1 text-[10px] px-1.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold">
                              <Calendar className="w-2.5 h-2.5" /> 예약
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {cards.length === 0 && (
                    <div className="text-center text-[10px] text-gray-400 py-8 italic">비어있음</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 text-[11px] text-gray-500 text-center">
        💡 카드를 드래그해서 상태를 변경하거나 <b>[NEW 신규]</b> 컬럼의 ⏳ 대기 · 📅 체험 버튼으로 1-Click 이동할 수 있습니다
      </div>

      {/* v3.20.23: 신청서 보기 모달 */}
      {intakeTarget && <IntakeDetailModal member={intakeTarget} onClose={() => setIntakeTarget(null)} onMove={onMove} />}
    </div>
  );
}

// v3.20.23: 신청서 상세 보기 모달
function IntakeDetailModal({ member, onClose, onMove }: any) {
  const f = member?.extra?.consult_form || {};
  const isChild = member?.member_type === "child";
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-pink-50 to-rose-50">
          <div>
            <div className="text-xs text-pink-700 font-bold">📝 신규 유입 신청서</div>
            <div className="text-lg font-bold text-gray-900">{member.name} <span className="text-xs text-gray-500">({isChild ? "아동" : "성인"})</span></div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">✕</button>
        </div>
        <div className="p-4 space-y-2 text-sm">
          <Row label="연락처" value={member.phone} />
          {isChild && (() => {
            const gName = member.guardian_name || f.guardian_name || "";
            const gRel = f.guardian_relation || member.guardian_relation || "";
            const guardianDisplay = gName
              ? (gRel ? `${gName} (${gRel})` : gName)
              : (gRel || "-");
            return <Row label="보호자" value={guardianDisplay} />;
          })()}
          {f.birth && <Row label="생년월일" value={f.birth} />}
          {f.gender && <Row label="성별" value={f.gender} />}
          {f.height_weight && <Row label="키/체중" value={f.height_weight} />}
          {f.address && <Row label="주소" value={f.address} />}
          {f.institution && <Row label="이용기관" value={f.institution} />}
          {f.diagnosis && <Row label="진단명" value={f.diagnosis} />}
          {f.main_symptom && <Row label="주 증상" value={f.main_symptom} />}
          {f.pain_area && <Row label="통증부위" value={f.pain_area} />}
          {(member.wish_days?.length > 0) && <Row label="희망 요일" value={(member.wish_days || []).join(", ")} />}
          {(member.wish_time_slots?.length > 0) && <Row label="희망 시간" value={(member.wish_time_slots || []).join(", ")} />}
          {f.wish_start_date && <Row label="희망 시작일" value={f.wish_start_date} />}
          {member.memo && <div className="mt-2 p-2 bg-gray-50 rounded text-[11px] text-gray-600 whitespace-pre-wrap">{member.memo}</div>}
        </div>
        <div className="p-4 border-t flex flex-wrap gap-2">
          <button onClick={() => { onMove(member.id, "waiting"); onClose(); }}
            className="flex-1 px-3 py-2 bg-yellow-100 text-yellow-700 rounded-lg text-sm font-bold hover:bg-yellow-200">⏳ 대기 등록</button>
          <button onClick={() => { onMove(member.id, "trial_scheduled"); onClose(); }}
            className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-bold hover:bg-blue-200">📅 체험 예약</button>
          <Link href={`/members/${member.id}`} className="flex-1 px-3 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm font-bold hover:bg-purple-200 text-center">신청서 상세</Link>
        </div>
      </div>
    </div>
  );
}
function Row({ label, value }: any) {
  return (
    <div className="flex gap-2 text-xs">
      <div className="w-20 flex-shrink-0 font-semibold text-gray-500">{label}</div>
      <div className="flex-1 text-gray-800">{value || "-"}</div>
    </div>
  );
}

/* ─────────────── 하위 컴포넌트: 매칭 ─────────────── */

function MatchView({ matrix, members, staff, waiters, stats, getCell, getMatchedWaiters, getTrialScheduled, onCellClick, unmatchedWaiters = [], unmatchedTrials = [] }: any) {
  const staffMap = useMemo(() => {
    const m: any = {};
    staff.forEach((s: any) => { m[s.id] = s; });
    return m;
  }, [staff]);
  const memberMap = useMemo(() => {
    const m: any = {};
    members.forEach((mm: Member) => { m[mm.id] = mm; });
    return m;
  }, [members]);

  // ✅ v3.18.0: 담당 선생님 필터
  const [staffFilter, setStaffFilter] = useState<string>("");

  return (
    <div className="max-w-7xl mx-auto">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 text-xs">
        <StatCard color="from-emerald-500 to-teal-500" label="🔒 고정 배정" value={`${stats.fixedCells}칸`} />
        <StatCard color="from-blue-500 to-cyan-500" label="🟢 빈자리(OPEN)" value={`${stats.openCells}칸`} />
        <StatCard color="from-orange-500 to-amber-500" label="⭐ 매칭 가능" value={`${stats.matchedOpen}칸`} />
        <StatCard color="from-purple-500 to-pink-500" label="⏳ 대기자" value={`${stats.waitersCount}명`} />
      </div>

      {/* ✅ v3.18.0: 담당 선생님 필터 */}
      <div className="mb-3 flex items-center gap-2 flex-wrap bg-white border border-aqu-100 rounded-xl p-2">
        <span className="text-xs text-gray-600 font-semibold px-1">👨‍⚕️ 담당 선생님</span>
        <button onClick={() => setStaffFilter("")} className={`px-2.5 py-1 text-[11px] rounded-full border ${staffFilter === "" ? "bg-aqu-600 text-white border-aqu-600" : "bg-white text-gray-600 border-gray-200 hover:border-aqu-300"}`}>전체</button>
        {staff.filter((s: any) => !s.is_resigned).map((s: any) => {
          const isSel = staffFilter === s.id;
          const color = s.color || "#3b82f6";
          return (
            <button key={s.id} onClick={() => setStaffFilter(isSel ? "" : s.id)}
              style={isSel ? { backgroundColor: color, borderColor: color, color: "#fff" } : { borderColor: color, color: color }}
              className="px-2.5 py-1 text-[11px] rounded-full border-2 font-semibold hover:shadow flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isSel ? "#fff" : color }} />
              {s.name}
            </button>
          );
        })}
      </div>

      {/* ✅ v3.50.1: 희망시간 미설정 인원 패널 (매트릭스 증발 방지) */}
      {(unmatchedWaiters.length > 0 || unmatchedTrials.length > 0) && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div className="text-xs font-bold text-amber-800 mb-1.5">
            ⚠️ 희망 시간 미설정 — 매트릭스에 표시되지 않는 인원 ({unmatchedWaiters.length + unmatchedTrials.length}명)
          </div>
          <div className="text-[11px] text-amber-700 mb-2">회원 카드에서 희망 요일·시간을 입력하면 아래 시간표에 자동 표시됩니다.</div>
          <div className="flex flex-wrap gap-1.5">
            {unmatchedWaiters.map((w: any) => (
              <span key={w.id} className="px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-semibold border border-yellow-300">
                ⏳ {w.name}
              </span>
            ))}
            {unmatchedTrials.map((w: any) => (
              <span key={w.id} className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold border border-blue-300">
                📅 {w.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ✨ v3.32.0: 매트릭스 - aqu-card + 라운드 격자 */}
      <div className="aqu-card bg-white overflow-hidden shadow-md border border-aqu-100" style={{ borderRadius: "16px" }}>
        <div className="bg-gradient-to-r from-aqu-500 via-cyan-500 to-teal-500 text-white px-5 py-3 flex items-center justify-between">
          <div className="font-bold text-sm flex items-center gap-2">
            <span className="text-lg">📋</span> 주간 시간표 매트릭스
          </div>
          <div className="text-[11px] opacity-90 bg-white/20 px-2.5 py-1 rounded-full">셀 클릭 → 상태 변경 · 회원 배정</div>
        </div>
        <div className="overflow-x-auto p-2 bg-gradient-to-br from-slate-50/40 to-white">
          <table className="min-w-full text-xs border-separate" style={{ borderSpacing: "4px" }}>
            <thead>
              <tr className="text-slate-700">
                <th className="w-20 p-2 rounded-lg bg-gradient-to-br from-sky-100 to-cyan-100 font-bold text-aqu-800">시간대</th>
                {DAYS.map((d, i) => (
                  <th key={d} className={`p-2 rounded-lg font-bold ${i === 5 ? "bg-gradient-to-br from-orange-50 to-amber-50 text-orange-700" : "bg-gradient-to-br from-sky-50 to-cyan-50 text-aqu-800"}`}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map(time => (
                <tr key={time}>
                  <td className="p-2 rounded-lg font-semibold text-aqu-700 bg-gradient-to-br from-sky-50/60 to-white text-[11px] text-center">{time}</td>
                  {DAYS.map((_, idx) => {
                    const day = idx + 1;
                    const cell = getCell(day, time);
                    const status: any = cell?.status || "closed";
                    // ✨ v3.33.1: OPEN + 고정 배정 셀 모두 대기자 조회 (이전은 open만)
                    const matched = (status === "open" || status === "fixed") ? getMatchedWaiters(day, time) : [];
                    // v3.21.4: 체험예정 회원 자동 표시 (open 셀에서만)
                    const trialScheduled = (status === "open" && getTrialScheduled) ? getTrialScheduled(day, time) : [];
                    const member = cell?.member_id ? memberMap[cell.member_id] : null;
                    // v3.21.5: staffColor 우선순위 근본 개선 - cell.staff_id → member.staff_id 순차 확인
                    const effectiveStaffId = cell?.staff_id || member?.staff_id || null;
                    const effectiveStaff = effectiveStaffId ? staffMap[effectiveStaffId] : null;
                    const staffColor = effectiveStaff?.color || null;
                    const staffName = effectiveStaff?.name || null;
                    return (
                      <td key={`${day}-${time}`}
                        onClick={() => onCellClick(day, time)}
                        className={`p-2 rounded-xl align-top cursor-pointer min-w-[110px] transition-all hover:shadow-md hover:-translate-y-0.5
                          ${status === "fixed" && !staffColor ? "bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 hover:from-emerald-100 hover:to-teal-100" : ""}
                          ${status === "open" && !staffColor ? "bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-200 hover:from-blue-100 hover:to-sky-100" : ""}
                          ${status === "closed" ? "bg-slate-100 border border-slate-200 hover:bg-slate-200" : ""}
                          ${staffFilter && effectiveStaffId !== staffFilter && status !== "closed" ? "opacity-30" : ""}`}
                        style={staffColor && status !== "closed" ? {
                          background: `linear-gradient(135deg, ${staffColor}18, ${staffColor}08)`,
                          borderLeft: `3px solid ${staffColor}`,
                          borderRadius: "12px",
                        } : {}}
                      >
                        {status === "fixed" && (
                          <div className="text-[11px]">
                            {/* 상단: 기존 배정 회원 정보 */}
                            <div className="flex items-center gap-0.5 font-bold" style={{ color: staffColor || "#065f46" }}>
                              <Lock className="w-3 h-3" /> {cell?.fixed_name || "고정"}
                            </div>
                            {staffName && (
                              <div className="text-[9px] mt-0.5 font-semibold" style={{ color: staffColor || "#059669" }}>👨‍⚕️ {staffName}</div>
                            )}
                            {/* ✨ v3.33.1: 하단 – 대기자 1~3위 (고정 셀에도 노출) */}
                            {matched.length > 0 && (
                              <div className="mt-1 pt-1 border-t border-emerald-200/70">
                                <div className="text-[9px] font-bold text-purple-700 mb-0.5 flex items-center gap-0.5">
                                  ⏳ 대기 {matched.length}명
                                </div>
                                <div className="space-y-0.5">
                                  {matched.slice(0, 3).map((w: any, i: number) => (
                                    <div key={w.id} className="flex items-center gap-1 text-[9px]">
                                      <span className={`inline-block w-3.5 h-3.5 rounded-full text-white text-[8px] text-center font-bold leading-[14px] ${
                                        i === 0 ? "bg-red-500" : i === 1 ? "bg-orange-500" : "bg-amber-500"
                                      }`}>{w.priority}</span>
                                      <span className="truncate text-slate-700">{w.name}</span>
                                    </div>
                                  ))}
                                  {matched.length > 3 && (
                                    <div className="text-purple-500 text-[8px] font-semibold text-right">+{matched.length - 3}명</div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {status === "open" && (
                          <div className="text-[10px]">
                            {/* v3.21.4: 체험예정 회원 상단 배치 (이중 예약 방지) */}
                            {trialScheduled.length > 0 && (
                              <div className="mb-1 bg-blue-100 border border-blue-300 rounded px-1 py-0.5">
                                <div className="text-blue-800 font-bold text-[9px] flex items-center gap-0.5">📅 체험예정</div>
                                {trialScheduled.slice(0, 2).map((t: any) => (
                                  <div key={t.id} className="text-blue-700 text-[9px] truncate font-semibold">• {t.name}</div>
                                ))}
                                {trialScheduled.length > 2 && <div className="text-blue-500 text-[8px]">+{trialScheduled.length - 2}명</div>}
                              </div>
                            )}
                            {matched.length === 0 && trialScheduled.length === 0 ? (
                              <>
                                <div className="text-blue-700 font-bold">🟢 OPEN</div>
                                <div className="text-gray-400 italic text-[9px]">대기자 없음</div>
                              </>
                            ) : matched.length > 0 ? (
                              <>
                                <div className="text-blue-700 font-bold mb-0.5">🟢 OPEN (대기 {matched.length}명)</div>
                                <div className="space-y-0.5">
                                  {matched.slice(0, 2).map((w: any, i: number) => (
                                    <div key={w.id} className="flex items-center gap-1">
                                      <span className={`inline-block w-3.5 h-3.5 rounded-full text-white text-[8px] text-center font-bold leading-[14px] ${i === 0 ? "bg-red-500" : "bg-orange-500"}`}>{w.priority}</span>
                                      <span className="truncate">{w.name}</span>
                                    </div>
                                  ))}
                                  {matched.length > 2 && <div className="text-gray-500 text-[9px]">+{matched.length - 2}명</div>}
                                </div>
                              </>
                            ) : (
                              <div className="text-blue-700 font-bold text-[9px]">🟢 OPEN</div>
                            )}
                          </div>
                        )}
                        {status === "closed" && (
                          <div className="text-[9px] text-gray-400 text-center py-1">⬛</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-gray-500 flex flex-wrap gap-3 justify-center">
        <span>🔒 고정 — 배정 완료</span>
        <span>🟢 OPEN — 빈자리, 대기자 자동 매칭</span>
        <span>⬛ 운영 안함</span>
        <span>1·2·3순위 — 신청 순서</span>
      </div>
    </div>
  );
}

/* ─────────────── 하위 컴포넌트: 대시보드 ─────────────── */

function DashboardView({ members, stats, onMove }: any) {
  // ✅ v3.19.0: 응대 로그 모달 state
  const [contactTarget, setContactTarget] = useState<any>(null);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {contactTarget && (
        <ContactLogModal member={contactTarget} onClose={() => setContactTarget(null)} onSaved={() => {}} />
      )}
      {/* 상단 KPI 4개 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-pink-500 to-rose-500 rounded-xl p-4 text-white shadow">
          <div className="flex items-center gap-1 text-xs opacity-90"><TrendingUp className="w-3.5 h-3.5" /> 이번 주 신규</div>
          <div className="text-2xl font-bold mt-1">{stats.newThisWeek}명</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl p-4 text-white shadow">
          <div className="flex items-center gap-1 text-xs opacity-90"><CheckCircle2 className="w-3.5 h-3.5" /> 정규 전환율</div>
          <div className="text-2xl font-bold mt-1">{stats.conversionRate}%</div>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl p-4 text-white shadow">
          <div className="flex items-center gap-1 text-xs opacity-90"><Clock className="w-3.5 h-3.5" /> 대기자</div>
          <div className="text-2xl font-bold mt-1">{stats.waitersCount}명</div>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl p-4 text-white shadow">
          <div className="flex items-center gap-1 text-xs opacity-90"><Target className="w-3.5 h-3.5" /> 매칭 가능</div>
          <div className="text-2xl font-bold mt-1">{stats.matchedOpen}칸</div>
        </div>
      </div>

      {/* 긴급 액션 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 30일↑ 대기자 */}
        <div className="bg-white rounded-xl border border-red-200 p-4">
          <h3 className="text-sm font-bold text-red-800 flex items-center gap-1.5 mb-3">
            <AlertCircle className="w-4 h-4" /> ⏰ 30일 이상 대기 중
            <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{stats.stale.length}명</span>
          </h3>
          {stats.stale.length === 0 ? (
            <div className="text-center text-xs text-gray-400 py-6">🎉 30일 이상 대기 중인 회원이 없습니다</div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {stats.stale.slice(0, 8).map((m: Member) => {
                const days = m.created_at ? Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86400000) : 0;
                // ✅ v3.18.0: D+400 장기 대기자는 빨간 배경으로 강조
                const critical = days >= 400;
                return (
                  <div key={m.id}
                    className={`flex items-center justify-between rounded-lg p-2 border ${critical ? "bg-red-100 border-red-300" : "bg-red-50 border-red-100"}`}>
                    <Link href={`/members/${m.id}`} className="flex items-center gap-2 min-w-0 flex-1 hover:underline">
                      <span className="text-xs">{m.member_type === "child" ? "🧒" : "👤"}</span>
                      <span className="text-sm font-medium truncate">{m.name}</span>
                      {m.phone && <span className="text-[10px] text-gray-500 font-mono flex-shrink-0">{m.phone}</span>}
                      <span className={`text-xs font-bold flex-shrink-0 ${critical ? "text-red-800" : "text-red-600"}`}>D+{days}</span>
                    </Link>
                    {/* ✅ v3.18.0: 장기 대기자 즉시 처리 버튼 (D+400이상 특별 강조) */}
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      {/* ✅ v3.19.0: 응대 로그 모달을 여는 연락 버튼 (날짜·채널·메모 기록) */}
                      <button
                        onClick={() => setContactTarget(m)}
                        className="text-[10px] px-2 py-1 bg-emerald-500 text-white rounded hover:bg-emerald-600 font-semibold flex items-center gap-0.5"
                        title="응대 기록 (전화/문자/카카오톡/메모)">
                        <Phone className="w-2.5 h-2.5" /> 연락
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`${m.name} 님을 대기종료 상태로 변경하시겠습니까?`)) onMove(m.id, "ended");
                        }}
                        className="text-[10px] px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 font-semibold"
                        title="대기종료 전환">
                        대기종료
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 체험 예정자 */}
        <div className="bg-white rounded-xl border border-blue-200 p-4">
          <h3 className="text-sm font-bold text-blue-800 flex items-center gap-1.5 mb-3">
            <Calendar className="w-4 h-4" /> 📅 체험 예정
            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{stats.trialSoon.length}명</span>
          </h3>
          {stats.trialSoon.length === 0 ? (
            <div className="text-center text-xs text-gray-400 py-6">체험 예정자가 없습니다</div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {stats.trialSoon.map((m: Member) => (
                <div key={m.id} className="flex items-center justify-between bg-blue-50 rounded-lg p-2 border border-blue-100">
                  <Link href={`/members/${m.id}`} className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xs">{m.member_type === "child" ? "🧒" : "👤"}</span>
                    <span className="text-sm font-medium truncate">{m.name}</span>
                    {m.phone && <span className="text-[10px] text-gray-500 font-mono">{m.phone}</span>}
                  </Link>
                  <button onClick={() => onMove(m.id, "trial_done")}
                    className="text-[10px] px-2 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 flex-shrink-0">
                    체험완료 ▶
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 상태 분포 시각화 */}
      <div className="bg-white rounded-xl border border-aqu-100 p-4">
        <h3 className="text-sm font-bold text-aqu-900 mb-3">📊 회원 상태 분포</h3>
        <div className="space-y-2">
          {COLUMNS.map(col => {
            const cnt = stats.byStatus[col.key] || 0;
            const total = members.length;
            const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
            return (
              <div key={col.key} className="flex items-center gap-2 text-xs">
                <span className="w-20 flex-shrink-0">{col.label}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden relative">
                  <div className={`h-full ${col.bg.replace("50", "400").replace("bg-", "bg-")} transition-all`}
                    style={{ width: `${pct}%` }} />
                </div>
                <span className="w-16 text-right font-mono">{cnt}명 ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── 하위 컴포넌트: 셀 편집 모달 ─────────────── */

function CellEditor(props: any) {
  const { day, time, cell, matchedWaiters, searchableMembers, staffList, searchQuery, setSearchQuery, saving, onClose, onSetStatus, onAssign, onUnlock, onSetStaff } = props;
  const status = cell?.status || "closed";
  const dayName = DAYS[day - 1];
  // v3.21.6: 담당 선생님 지정용 state (원클릭 배정 시 이 값이 함께 저장됨)
  const [pendingStaffId, setPendingStaffId] = useState<string | null>(cell?.staff_id || null);
  useEffect(() => { setPendingStaffId(cell?.staff_id || null); }, [cell?.id]);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return searchableMembers.slice(0, 30);
    return searchableMembers.filter((m: any) =>
      m.name.toLowerCase().includes(q) || (m.phone && m.phone.includes(q))
    ).slice(0, 30);
  }, [searchableMembers, searchQuery]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-gradient-to-r from-aqu-500 to-cyan-500 text-white px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold">📍 {dayName}요일 {time}</h2>
            <p className="text-xs opacity-90 mt-0.5">
              현재: <span className="font-semibold">
                {status === "fixed" ? `🔒 ${cell?.fixed_name || "고정"}` : status === "open" ? "🟢 OPEN (빈자리)" : "⬛ 운영 안함"}
              </span>
            </p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {/* 상태 전환 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">① 셀 상태</h3>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => onSetStatus("open")} disabled={saving || status === "open"}
                className={`px-3 py-2 text-sm rounded-lg border ${status === "open" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-blue-700 border-blue-200 hover:bg-blue-50"} disabled:opacity-50`}>
                🟢 OPEN
              </button>
              <button onClick={() => onSetStatus("closed")} disabled={saving || status === "closed"}
                className={`px-3 py-2 text-sm rounded-lg border ${status === "closed" ? "bg-gray-500 text-white border-gray-500" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"} disabled:opacity-50`}>
                ⬛ 운영 안함
              </button>
              {status === "fixed" && (
                <button onClick={onUnlock} disabled={saving}
                  className="px-3 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center gap-1">
                  <Unlock className="w-4 h-4" /> 해제
                </button>
              )}
            </div>
          </section>

          {/* v3.21.6: 담당 선생님 지정 UI - 닫힌 추가 */}
          {status !== "closed" && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                👨‍⚕️ 담당 선생님 지정
                {pendingStaffId && (
                  <span className="text-[10px] text-gray-500">(회원 배정 시 함께 저장)</span>
                )}
              </h3>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => { setPendingStaffId(null); if (status === "fixed" && onSetStaff) onSetStaff(null); }}
                  className={`px-2.5 py-1.5 text-xs rounded-lg border-2 font-semibold ${!pendingStaffId ? "bg-gray-500 text-white border-gray-500" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                  미지정
                </button>
                {(staffList || []).map((s: any) => {
                  const isSel = pendingStaffId === s.id;
                  const color = s.color || "#3b82f6";
                  return (
                    <button key={s.id}
                      onClick={() => {
                        setPendingStaffId(s.id);
                        // 이미 fixed 상태면 담당강사 즉시 변경
                        if (status === "fixed" && onSetStaff) onSetStaff(s.id);
                      }}
                      style={isSel ? { backgroundColor: color, borderColor: color, color: "#fff" } : { borderColor: color, color: color }}
                      className="px-2.5 py-1.5 text-xs rounded-lg border-2 font-semibold hover:shadow flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isSel ? "#fff" : color }} />
                      {s.name}
                    </button>
                  );
                })}
              </div>
              {(staffList || []).length === 0 && (
                <div className="text-[11px] text-gray-400 mt-1">등록된 재직 강사가 없습니다 → /staff 에서 먼저 등록하세요</div>
              )}
            </section>
          )}

          {/* 대기자 순위 */}
          {status === "open" && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <Users className="w-4 h-4" /> ② 이 시간대 대기자
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{matchedWaiters.length}명</span>
              </h3>
              {matchedWaiters.length === 0 ? (
                <div className="p-3 text-xs text-gray-500 text-center bg-gray-50 rounded-lg">이 시간을 희망한 대기자가 없습니다</div>
              ) : (
                <div className="space-y-1.5">
                  {matchedWaiters.map((w: any, i: number) => (
                    <div key={w.id} className="flex items-center justify-between p-2.5 bg-orange-50 border border-orange-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold ${i === 0 ? "bg-red-500" : i === 1 ? "bg-orange-500" : "bg-gray-400"}`}>
                          {w.priority}
                        </span>
                        <span className="text-sm font-medium">{w.name}</span>
                        <span className="text-[10px] text-gray-500">{w.member_type === "child" ? "🧒 아동" : "👤 성인"}</span>
                      </div>
                      <button onClick={() => onAssign(w, pendingStaffId)} disabled={saving}
                        className="px-3 py-1 text-xs bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50">
                        🔒 이 회원으로 고정 (정규 등록)
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 회원 검색 */}
          {status !== "closed" && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">③ 다른 회원 검색·배정</h3>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="회원 이름/전화번호 검색..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-aqu-500" />
              </div>
              <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-lg divide-y">
                {filteredMembers.length === 0 && (
                  <div className="p-3 text-xs text-gray-500 text-center">검색 결과 없음</div>
                )}
                {filteredMembers.map((m: any) => (
                  <button key={m.id} onClick={() => onAssign(m, pendingStaffId)} disabled={saving}
                    className="w-full px-3 py-2 text-left hover:bg-emerald-50 flex items-center justify-between disabled:opacity-50">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs">{m.member_type === "child" ? "🧒" : "👤"}</span>
                      <span className="text-sm font-medium truncate">{m.name}</span>
                      <span className="text-[10px] text-gray-500">{m.status}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="border-t px-6 py-3 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">닫기</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── 하위 컴포넌트: 신규 등록 모달 ─────────────── */

function QuickAddModal({ onClose, onSave, saving }: any) {
  // ✅ v3.20.19: 구글폼 아동/성인 7섭션 구조 반영
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<any>({
    // 섭션 1 - 기본정보
    name: "", phone: "", member_type: "adult" as "adult" | "child",
    gender: "", birth: "", address: "",
    guardian_name: "", guardian_relation: "", height_weight: "", school: "",
    // 섭션 2 - 의학·발달/통증 정보
    diagnosis: "", body_condition: "", main_symptom: "",
    surgery_history: "", medication: "", allergy: "", notes_medical: "", current_therapy: "",
    has_pain: false, pain_area: [] as string[], pain_scale: 0, pain_onset: "", aggravating_factor: [] as string[],
    // 섭션 3 - 발달·기능 평가 (아동)
    walking_level: "", sitting_level: "", comm_level: "", instruction_level: "",
    // 섭션 4 - 감각·정서 (아동) / 건강 위험 (성인)
    water_reaction: "", emotional_reaction: "", separation_reaction: "",
    sensory_notes: "", likes_activities: "", dislikes_situations: "",
    underlying_disease: [] as string[],
    // 섭션 5 - 수업 일정·니즈
    wish_days: [] as string[], wish_time_slots: [] as string[],
    start_available_date: "", diaper_use: "",
    most_worry: "", most_improve: "", avoid_situation: "", expected_change: "",
    // 섭션 6 - 마무리
    source: "직접등록", additional_memo: "", memo: "",
    // 섭션 7 - 동의
    agree_privacy: false, agree_sensitive: false,
  });

  const isChild = form.member_type === "child";
  const totalSteps = 7;

  function toggle<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  }

  function submit() {
    if (!form.name.trim()) { setStep(1); alert("이름을 입력하세요"); return; }
    if (!form.phone.trim()) { setStep(1); alert("연락처를 입력하세요"); return; }
    if (!form.agree_privacy || !form.agree_sensitive) {
      setStep(7);
      alert("개인정보·민감정보 수집 동의에 체크해 주세요");
      return;
    }
    // ✅ memo에 주요 정보 집약 (기존 스키마 호환)
    const summaryMemo = [
      form.diagnosis && `진단: ${form.diagnosis}`,
      form.main_symptom && `주증상: ${form.main_symptom}`,
      form.current_therapy && `현진행치료: ${form.current_therapy}`,
      form.has_pain && form.pain_area?.length > 0 && `통증: ${form.pain_area.join(",")} (${form.pain_scale}/10)`,
      form.additional_memo,
    ].filter(Boolean).join(" | ") || form.memo;
    onSave({ ...form, memo: summaryMemo });
  }

  const PAIN_AREAS = ["목", "어깨", "팔", "손목", "허리", "무릎", "발목", "기타"];
  const AGGRAVATE = ["움직일 때", "가만히 있을 때", "특정 자세 시", "운동 후", "기타"];
  const DISEASES = ["없음", "고혈압", "당뇨", "심장질환", "골다공증", "뇌혐관질환", "호흡기질환", "기타"];
  const SOURCES = ["소개", "검색", "인스타", "블로그", "홈페이지", "기관추천", "간판", "기타"];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-gradient-to-r from-pink-500 to-rose-500 text-white px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 className="text-lg font-bold">🆕 신규 상담 신청서 ({step}/{totalSteps})</h2>
            <div className="text-[10px] text-white/80 mt-0.5">
              {step === 1 && "기본정보"}
              {step === 2 && (isChild ? "의학·발달 정보" : "의학·통증 정보")}
              {step === 3 && (isChild ? "발달·기능 평가" : "통증 상세 평가")}
              {step === 4 && (isChild ? "감각·정서 반응" : "건강 위험 평가")}
              {step === 5 && "수업 일정·니즈"}
              {step === 6 && "마무리"}
              {step === 7 && "개인정보 동의"}
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">✕</button>
        </div>

        {/* 진행 바 */}
        <div className="h-1 bg-gray-100">
          <div className="h-full bg-gradient-to-r from-pink-500 to-rose-500 transition-all"
            style={{ width: `${(step / totalSteps) * 100}%` }} />
        </div>

        <div className="p-5 space-y-3">
          {/* ── 섭션 1: 기본정보 ── */}
          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setForm({ ...form, member_type: "adult" })}
                  className={`py-3 rounded-lg text-sm border-2 ${!isChild ? "bg-purple-100 border-purple-500 text-purple-700 font-bold" : "bg-white border-gray-200 text-gray-500"}`}>
                  👤 성인
                </button>
                <button onClick={() => setForm({ ...form, member_type: "child" })}
                  className={`py-3 rounded-lg text-sm border-2 ${isChild ? "bg-blue-100 border-blue-500 text-blue-700 font-bold" : "bg-white border-gray-200 text-gray-500"}`}>
                  🧒 아동
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <F label={isChild ? "아동 이름 *" : "성함 *"}>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </F>
                <F label="성별 *">
                  <div className="flex gap-1">
                    {["남", "여"].map(g => (
                      <button key={g} onClick={() => setForm({ ...form, gender: g })}
                        className={`flex-1 py-2 rounded-lg text-xs border ${form.gender === g ? "bg-aqu-500 text-white border-aqu-500" : "bg-white border-gray-200"}`}>{g}</button>
                    ))}
                  </div>
                </F>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <F label={isChild ? "아동 생년월일 *" : "생년월일 *"}>
                  <input type="date" value={form.birth} onChange={e => setForm({ ...form, birth: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </F>
                <F label="연락처 *">
                  <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="010-0000-0000"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono" />
                </F>
              </div>
              <F label="주소">
                <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </F>
              {isChild && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <F label="보호자 성함 *">
                      <input value={form.guardian_name} onChange={e => setForm({ ...form, guardian_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </F>
                    <F label="관계">
                      <input value={form.guardian_relation} onChange={e => setForm({ ...form, guardian_relation: e.target.value })}
                        placeholder="부/모/조부모 등"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </F>
                    <F label="키/체중 *">
                      <input value={form.height_weight} onChange={e => setForm({ ...form, height_weight: e.target.value })}
                        placeholder="103cm/17kg"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </F>
                  </div>
                  <F label="이용기관/학교">
                    <input value={form.school} onChange={e => setForm({ ...form, school: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </F>
                </>
              )}
            </>
          )}

          {/* ── 섭션 2: 의학·발달/통증 정보 ── */}
          {step === 2 && (
            <>
              <F label="진단명 *">
                <input value={form.diagnosis} onChange={e => setForm({ ...form, diagnosis: e.target.value })}
                  placeholder="병원에서 받은 진단명이 있다면 적어주세요"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </F>
              <F label={isChild ? "현재 신체·발달 상태" : "현재 신체 상태 / 추가 안내"}>
                <textarea value={form.body_condition} onChange={e => setForm({ ...form, body_condition: e.target.value })}
                  rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </F>
              <F label="주증상 *">
                <textarea value={form.main_symptom} onChange={e => setForm({ ...form, main_symptom: e.target.value })}
                  rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </F>
              <div className="grid grid-cols-2 gap-2">
                <F label="수술력">
                  <input value={form.surgery_history} onChange={e => setForm({ ...form, surgery_history: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </F>
                <F label="복용약">
                  <input value={form.medication} onChange={e => setForm({ ...form, medication: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </F>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <F label="알레르기">
                  <input value={form.allergy} onChange={e => setForm({ ...form, allergy: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </F>
                <F label={isChild ? "특이사항/주의사항" : "특이사항"}>
                  <input value={form.notes_medical} onChange={e => setForm({ ...form, notes_medical: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </F>
              </div>
              <F label={isChild ? "현재 진행 중 치료 *" : "현재 진행 중 치료"}>
                <input value={form.current_therapy} onChange={e => setForm({ ...form, current_therapy: e.target.value })}
                  placeholder="물리/작업/언어/ABA/감각통합 등"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </F>
              {!isChild && (
                <F label="통증 여부 *">
                  <div className="flex gap-2">
                    <button onClick={() => setForm({ ...form, has_pain: true })}
                      className={`flex-1 py-2 rounded-lg text-xs border ${form.has_pain ? "bg-red-100 border-red-400 text-red-700 font-bold" : "bg-white border-gray-200"}`}>통증 있음</button>
                    <button onClick={() => setForm({ ...form, has_pain: false })}
                      className={`flex-1 py-2 rounded-lg text-xs border ${!form.has_pain ? "bg-emerald-100 border-emerald-400 text-emerald-700 font-bold" : "bg-white border-gray-200"}`}>통증 없음</button>
                  </div>
                </F>
              )}
            </>
          )}

          {/* ── 섭션 3: 아동=발달·기능 / 성인=통증상세 ── */}
          {step === 3 && isChild && (
            <>
              {[
                { k: "walking_level", l: "보행 가능 여부 *", opts: ["가능", "부분가능(보조)", "어려움"] },
                { k: "sitting_level", l: "앟기/균형 *", opts: ["가능", "부분가능(보조)", "어려움"] },
                { k: "comm_level", l: "의사소통 수준 *", opts: ["또래수준", "일부단어", "표정·몸짓 위주", "무반응"] },
                { k: "instruction_level", l: "지시 수행 능력 *", opts: ["가능", "부분가능(보조)", "어려움"] },
              ].map(({ k, l, opts }) => (
                <F key={k} label={l}>
                  <div className="flex flex-wrap gap-1">
                    {opts.map(o => (
                      <button key={o} onClick={() => setForm({ ...form, [k]: o })}
                        className={`px-3 py-1.5 rounded-lg text-xs border ${form[k] === o ? "bg-aqu-500 text-white border-aqu-500" : "bg-white border-gray-200"}`}>{o}</button>
                    ))}
                  </div>
                </F>
              ))}
            </>
          )}
          {step === 3 && !isChild && (
            <>
              <F label="통증 부위 *">
                <div className="flex flex-wrap gap-1">
                  {PAIN_AREAS.map(p => (
                    <button key={p} onClick={() => setForm({ ...form, pain_area: toggle(form.pain_area, p) })}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${form.pain_area.includes(p) ? "bg-red-100 text-red-700 border-red-400 font-bold" : "bg-white border-gray-200"}`}>{p}</button>
                  ))}
                </div>
              </F>
              <F label={`통증 척도 (0~10) : ${form.pain_scale}`}>
                <input type="range" min={0} max={10} value={form.pain_scale}
                  onChange={e => setForm({ ...form, pain_scale: Number(e.target.value) })}
                  className="w-full" />
              </F>
              <F label="통증 시작 시기 *">
                <div className="flex flex-wrap gap-1">
                  {["최근 1주일", "1달", "6개월 이상", "기타"].map(o => (
                    <button key={o} onClick={() => setForm({ ...form, pain_onset: o })}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${form.pain_onset === o ? "bg-aqu-500 text-white border-aqu-500" : "bg-white border-gray-200"}`}>{o}</button>
                  ))}
                </div>
              </F>
              <F label="증상 악화 요인 *">
                <div className="flex flex-wrap gap-1">
                  {AGGRAVATE.map(o => (
                    <button key={o} onClick={() => setForm({ ...form, aggravating_factor: toggle(form.aggravating_factor, o) })}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${form.aggravating_factor.includes(o) ? "bg-orange-100 text-orange-700 border-orange-400 font-bold" : "bg-white border-gray-200"}`}>{o}</button>
                  ))}
                </div>
              </F>
            </>
          )}

          {/* ── 섭션 4: 감각·정서(아동) / 건강위험(성인) ── */}
          {step === 4 && isChild && (
            <>
              <F label="물에 대한 반응 *">
                <div className="flex flex-wrap gap-1">
                  {["매우긍정", "보통", "긴장", "거부"].map(o => (
                    <button key={o} onClick={() => setForm({ ...form, water_reaction: o })}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${form.water_reaction === o ? "bg-cyan-500 text-white border-cyan-500" : "bg-white border-gray-200"}`}>{o}</button>
                  ))}
                </div>
              </F>
              <F label="정서 반응 *">
                <div className="flex flex-wrap gap-1">
                  {["안정", "약간 긴장", "회피"].map(o => (
                    <button key={o} onClick={() => setForm({ ...form, emotional_reaction: o })}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${form.emotional_reaction === o ? "bg-aqu-500 text-white border-aqu-500" : "bg-white border-gray-200"}`}>{o}</button>
                  ))}
                </div>
              </F>
              <F label="보호자와 분리 반응">
                <div className="flex flex-wrap gap-1">
                  {["가능", "부분 가능", "어려움"].map(o => (
                    <button key={o} onClick={() => setForm({ ...form, separation_reaction: o })}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${form.separation_reaction === o ? "bg-aqu-500 text-white border-aqu-500" : "bg-white border-gray-200"}`}>{o}</button>
                  ))}
                </div>
              </F>
              <F label="감각 특이사항">
                <input value={form.sensory_notes} onChange={e => setForm({ ...form, sensory_notes: e.target.value })}
                  placeholder="촉각/소리/빛 예민·둘감 등"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </F>
              <div className="grid grid-cols-2 gap-2">
                <F label="좋아하는 것">
                  <input value={form.likes_activities} onChange={e => setForm({ ...form, likes_activities: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </F>
                <F label="싫어하는 것">
                  <input value={form.dislikes_situations} onChange={e => setForm({ ...form, dislikes_situations: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </F>
              </div>
            </>
          )}
          {step === 4 && !isChild && (
            <F label="기저질환 *">
              <div className="flex flex-wrap gap-1">
                {DISEASES.map(o => (
                  <button key={o} onClick={() => setForm({ ...form, underlying_disease: toggle(form.underlying_disease, o) })}
                    className={`px-3 py-1.5 rounded-lg text-xs border ${form.underlying_disease.includes(o) ? "bg-purple-100 text-purple-700 border-purple-400 font-bold" : "bg-white border-gray-200"}`}>{o}</button>
                ))}
              </div>
            </F>
          )}

          {/* ── 섭션 5: 수업 일정·니즈 ── */}
          {step === 5 && (
            <>
              <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-[11px] text-yellow-800">
                현재 평균 대기 3~6개월 이상으로, 가능한 요일을 많이 선택하실수록 빠른 안내에 도움이 됩니다.
              </div>
              <F label="희망 요일 *">
                <div className="flex flex-wrap gap-1">
                  {DAYS.map(d => (
                    <button key={d} onClick={() => setForm({ ...form, wish_days: toggle(form.wish_days, d) })}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${form.wish_days.includes(d) ? "bg-blue-500 text-white border-blue-500" : "bg-white border-gray-200"}`}>{d}</button>
                  ))}
                </div>
              </F>
              <F label="희망 시간 *">
                <div className="grid grid-cols-2 gap-1">
                  {TIME_SLOTS.map(t => (
                    <button key={t} onClick={() => setForm({ ...form, wish_time_slots: toggle(form.wish_time_slots, t) })}
                      className={`px-2 py-1.5 rounded-lg text-[11px] border ${form.wish_time_slots.includes(t) ? "bg-cyan-500 text-white border-cyan-500" : "bg-white border-gray-200"}`}>{t}</button>
                  ))}
                </div>
              </F>
              <div className="grid grid-cols-2 gap-2">
                <F label="가능한 시작일 *">
                  <input type="date" value={form.start_available_date}
                    onChange={e => setForm({ ...form, start_available_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </F>
                {isChild && (
                  <F label="방수 기저귀 *">
                    <div className="flex gap-1">
                      {["사용함", "사용 안함", "해당없음"].map(o => (
                        <button key={o} onClick={() => setForm({ ...form, diaper_use: o })}
                          className={`flex-1 py-2 rounded-lg text-[10px] border ${form.diaper_use === o ? "bg-aqu-500 text-white border-aqu-500" : "bg-white border-gray-200"}`}>{o}</button>
                      ))}
                    </div>
                  </F>
                )}
              </div>
              <F label={isChild ? "가장 걱정되는 점 *" : "가장 걱정되는 점 *"}>
                <textarea value={form.most_worry} onChange={e => setForm({ ...form, most_worry: e.target.value })}
                  rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </F>
              {isChild && (
                <F label="가장 개선되었으면 하는 점 *">
                  <textarea value={form.most_improve} onChange={e => setForm({ ...form, most_improve: e.target.value })}
                    rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </F>
              )}
              <F label="피하고 싶은 상황">
                <textarea value={form.avoid_situation} onChange={e => setForm({ ...form, avoid_situation: e.target.value })}
                  rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </F>
              <F label={isChild ? "기대하는 변화 *" : "가장 기대하는 변화 *"}>
                <textarea value={form.expected_change} onChange={e => setForm({ ...form, expected_change: e.target.value })}
                  rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </F>
            </>
          )}

          {/* ── 섭션 6: 마무리 ── */}
          {step === 6 && (
            <>
              <F label="유입 경로 *">
                <div className="flex flex-wrap gap-1">
                  {SOURCES.map(s => (
                    <button key={s} onClick={() => setForm({ ...form, source: s })}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${form.source === s ? "bg-pink-500 text-white border-pink-500" : "bg-white border-gray-200"}`}>{s}</button>
                  ))}
                </div>
              </F>
              <F label="추가 메모">
                <textarea value={form.additional_memo} onChange={e => setForm({ ...form, additional_memo: e.target.value })}
                  rows={4} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </F>
            </>
          )}

          {/* ── 섭션 7: 개인정보 동의 ── */}
          {step === 7 && (
            <>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
                <div className="text-xs font-bold text-emerald-800">개인정보 수집·이용 동의</div>
                <div className="text-[11px] text-gray-700 leading-relaxed">
                  수집 항목: 이름, 연락처, 생년월일, 성별, 주소{isChild && ", 보호자 정보, 이용기관"}<br/>
                  이용 목적: 회원 등록 및 이용자 식별<br/>
                  보유·이용 기간: 동의 철회 시까지
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.agree_privacy}
                    onChange={e => setForm({ ...form, agree_privacy: e.target.checked })} />
                  <span className="text-xs font-bold">동의합니다</span>
                </label>
              </div>
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-2">
                <div className="text-xs font-bold text-purple-800">민감정보 수집·이용 동의</div>
                <div className="text-[11px] text-gray-700 leading-relaxed">
                  수집 항목: 진단명, {isChild ? "발달 정보, " : "통증, 수술력, "}복용약, 알레르기, 기저질환 등 의학적 정보<br/>
                  이용 목적: 안전한 운동 진행 및 상담 기록<br/>
                  보유·이용 기간: 동의 철회 시까지
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.agree_sensitive}
                    onChange={e => setForm({ ...form, agree_sensitive: e.target.checked })} />
                  <span className="text-xs font-bold">동의합니다</span>
                </label>
              </div>
              <div className="p-3 bg-pink-50 border border-pink-200 rounded-lg text-[11px] text-gray-700 leading-relaxed">
                📌 안내드릴 점<br/>
                저희는 1:1 수중재활 전문 센터로서 하루 7타임만 운영하고 있어 현재 평균 대기가 3~6개월 이상입니다. 감사합니다 🙏
              </div>
            </>
          )}
        </div>

        {/* 하단 이동 버튼 */}
        <div className="sticky bottom-0 border-t px-5 py-3 bg-white flex justify-between items-center gap-2">
          <button onClick={onClose} className="px-3 py-2 text-xs bg-gray-100 text-gray-700 rounded-lg">취소</button>
          <div className="flex gap-2">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)}
                className="px-3 py-2 text-xs bg-gray-100 text-gray-700 rounded-lg">← 이전</button>
            )}
            {step < totalSteps ? (
              <button onClick={() => setStep(step + 1)}
                className="px-4 py-2 text-xs bg-pink-500 text-white rounded-lg hover:bg-pink-600">다음 →</button>
            ) : (
              <button onClick={submit} disabled={saving}
                className="px-4 py-2 text-xs bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 flex items-center gap-1">
                <Save className="w-4 h-4" /> {saving ? "저장 중..." : "보내기"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ✅ v3.20.19: 상담폼 필드 래퍼
function F({ label, children }: { label: string; children: any }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-600 block mb-1">{label}</label>
      {children}
    </div>
  );
}

/* ─────────────── 유틸 컴포트 ─────────────── */

// v3.20.22: 상담 FAQ 뷰 – 데스크 직원 누구나 동일하게 응대할 수 있도록
const FAQ_CATEGORIES = [
  { v: "all",         label: "전체",   color: "bg-gray-100 text-gray-700" },
  { v: "payment",     label: "💰 결제/수강료", color: "bg-blue-100 text-blue-700" },
  { v: "schedule",    label: "🗓️ 시간표/대기", color: "bg-purple-100 text-purple-700" },
  { v: "refund",      label: "🔄 보강/이월/환불", color: "bg-orange-100 text-orange-700" },
  { v: "preparation", label: "🎒 준비물/안내", color: "bg-green-100 text-green-700" },
  { v: "reservation", label: "📅 체험예약", color: "bg-pink-100 text-pink-700" },
  { v: "general",     label: "ℹ️ 일반", color: "bg-slate-100 text-slate-700" },
  { v: "template",    label: "📩 카톡 템플릿", color: "bg-amber-100 text-amber-700" },
];

// v3.20.23: 신청폼 URL 퀵 복사 툴바 (상단 배너 대체)
// ✅ v3.38.2: 지상재활 URL 복사·미리보기 추가
function QuickCopyToolbar() {
  const [copied, setCopied] = useState<"child" | "adult" | "ground" | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  function copy(kind: "child" | "adult" | "ground") {
    const path = kind === "child" ? "/apply-child" : kind === "adult" ? "/apply-adult" : "/consultation/ground";
    const url = window.location.origin + path;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="max-w-7xl mx-auto mb-4">
      <div className="bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200 rounded-xl px-4 py-3 flex items-center gap-2 flex-wrap">
        <div className="text-sm font-bold text-pink-800 mr-2">🔗 신청폼 URL 퀵 복사</div>
        <button onClick={() => copy("child")}
          className={`text-xs font-bold px-3 py-2 rounded-lg transition ${copied==="child" ? "bg-green-500 text-white" : "bg-white border-2 border-pink-300 text-pink-700 hover:bg-pink-50"}`}>
          {copied === "child" ? "✓ 복사됨" : "👶 아동(수중) URL 복사"}
        </button>
        <button onClick={() => copy("adult")}
          className={`text-xs font-bold px-3 py-2 rounded-lg transition ${copied==="adult" ? "bg-green-500 text-white" : "bg-white border-2 border-pink-300 text-pink-700 hover:bg-pink-50"}`}>
          {copied === "adult" ? "✓ 복사됨" : "🧑 성인(수중) URL 복사"}
        </button>
        <button onClick={() => copy("ground")}
          className={`text-xs font-bold px-3 py-2 rounded-lg transition ${copied==="ground" ? "bg-green-500 text-white" : "bg-white border-2 border-emerald-400 text-emerald-700 hover:bg-emerald-50"}`}>
          {copied === "ground" ? "✓ 복사됨" : "🏋️‍♂️ 지상재활 URL 복사"}
        </button>
        <a href="/apply-child" target="_blank" rel="noopener noreferrer"
          className="text-xs font-bold px-3 py-2 rounded-lg bg-white border-2 border-purple-300 text-purple-700 hover:bg-purple-50">
          👁️ 아동 미리보기
        </a>
        <a href="/apply-adult" target="_blank" rel="noopener noreferrer"
          className="text-xs font-bold px-3 py-2 rounded-lg bg-white border-2 border-purple-300 text-purple-700 hover:bg-purple-50">
          👁️ 성인 미리보기
        </a>
        <a href="/consultation/ground" target="_blank" rel="noopener noreferrer"
          className="text-xs font-bold px-3 py-2 rounded-lg bg-white border-2 border-emerald-400 text-emerald-700 hover:bg-emerald-50">
          👁️ 지상재활 미리보기
        </a>
        <div className="flex-1" />
        <button onClick={() => setShowSettings(true)}
          className="w-9 h-9 rounded-lg bg-white border-2 border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 flex items-center justify-center"
          title="신규 유입 관리 · 무결성 정리">
          ⚙️
        </button>
      </div>

      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowSettings(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <div className="text-lg font-bold">⚙️ 신규 유입 관리 · URL 설정</div>
              <button onClick={() => setShowSettings(false)} className="text-gray-500 hover:text-gray-800">✕</button>
            </div>
            <div className="p-4 space-y-3">
              {/* v3.31.0: 신규 유입 목록 보기 완전 제거 - 신청폼 제출 시 바로 파이프라인 [NEW 신규] 컬럼으로 자동 생성 */}
              <button onClick={() => copy("child")}
                className="w-full text-left px-4 py-3 bg-pink-50 border border-pink-200 rounded-lg hover:bg-pink-100">
                <div className="text-sm font-bold text-pink-800">👶 아동 신청폼 URL 복사</div>
                <div className="text-xs text-pink-600 mt-0.5 break-all">{typeof window !== "undefined" && window.location.origin}/apply-child</div>
              </button>
              <button onClick={() => copy("adult")}
                className="w-full text-left px-4 py-3 bg-pink-50 border border-pink-200 rounded-lg hover:bg-pink-100">
                <div className="text-sm font-bold text-pink-800">👤 성인 신청폼 URL 복사</div>
                <div className="text-xs text-pink-600 mt-0.5 break-all">{typeof window !== "undefined" && window.location.origin}/apply-adult</div>
              </button>
              <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg p-3 leading-relaxed">
                💡 신규 유입 자동 연동이 활성화되어 있어, 신청폼 제출 시 칸반 보드의 <b>[NEW 신규]</b> 컬럼에 미처리 초쉽달 카드로 자동 생성됩니다.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FaqView() {
  const [faqs, setFaqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("consultation_faqs")
      .select("*").eq("is_active", true).order("sort_order", { ascending: true });
    if (error) {
      console.warn("FAQ load error:", error.message);
      setFaqs([]);
    } else {
      setFaqs(data || []);
    }
    setLoading(false);
  }

  async function saveFaq() {
    if (!editing?.question || !editing?.answer) return alert("질문과 답변을 모두 입력해 주세요");
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const payload: any = {
      org_id: orgId,
      sort_order: editing.sort_order ?? (faqs.length + 1),
      category: editing.category || "general",
      question: editing.question,
      answer: editing.answer,
      is_active: true,
      is_template: editing.category === "template",
      updated_at: new Date().toISOString(),
    };
    const call = editing.id
      ? supabase.from("consultation_faqs").update(payload).eq("id", editing.id)
      : supabase.from("consultation_faqs").insert(payload);
    const { error } = await call;
    if (error) return alert("저장 실패: " + error.message + "\n\n💡 AQUNOTE_V32022_AUTO_RENEW_PDF_FAQ.sql 을 Supabase에 실행해 주세요.");
    alert(editing.id ? "✅ 수정되었습니다" : "✅ 추가되었습니다");
    setEditing(null);
    load();
  }

  async function delFaq(f: any) {
    if (!confirm(`"${f.question}"\n\n이 FAQ를 삭제할까요?`)) return;
    await supabase.from("consultation_faqs").delete().eq("id", f.id);
    load();
  }

  function copyAnswer(f: any) {
    navigator.clipboard.writeText(f.answer).then(() => {
      setCopiedId(f.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  const filtered = faqs.filter(f => {
    if (cat !== "all" && f.category !== cat) return false;
    if (q) {
      const s = q.toLowerCase();
      if (!(f.question || "").toLowerCase().includes(s) && !(f.answer || "").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto">
      {/* 안내 헤더 */}
      <div className="bg-gradient-to-r from-amber-50 to-pink-50 border border-amber-200 rounded-xl p-4 mb-4">
        <div className="text-sm font-bold text-amber-900 mb-1">💬 상담 FAQ · 데스크 응대 통일 스크립트</div>
        <div className="text-xs text-gray-700 leading-relaxed">
          누구나 데스크에 앉아도 동일한 품질로 응대할 수 있도록 Q&A와 카톡 템플릿을 모아놓았습니다.
          답변 카드의 <b>복사</b> 버튼을 누르면 전체 문구가 클립보드에 복사되어 카톡·SMS에 바로 붙여넣기 가능합니다.
        </div>
      </div>

      {/* 카테고리 + 검색 */}
      <div className="flex flex-wrap gap-2 mb-3">
        {FAQ_CATEGORIES.map(c => {
          const count = c.v === "all" ? faqs.length : faqs.filter(f => f.category === c.v).length;
          return (
            <button key={c.v} onClick={() => setCat(c.v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition ${cat === c.v ? "border-pink-400 " + c.color : "border-transparent bg-white text-gray-600 hover:bg-gray-50"}`}>
              {c.label} <span className="ml-1 opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 mb-4">
        <input type="text" value={q} onChange={e => setQ(e.target.value)}
          placeholder="질문또는 답변 내용 검색"
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-pink-400 focus:outline-none" />
        <button onClick={() => setEditing({ category: cat === "all" ? "general" : cat, question: "", answer: "" })}
          className="px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg text-sm font-bold hover:from-pink-600 hover:to-rose-600">
          + FAQ 추가
        </button>
      </div>

      {/* FAQ 리스트 */}
      {loading ? (
        <div className="text-center py-10 text-gray-500">로딩중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500 bg-white rounded-xl border border-gray-200">
          {faqs.length === 0
            ? "아직 등록된 FAQ가 없습니다. AQUNOTE_V32022_AUTO_RENEW_PDF_FAQ.sql 을 먼저 실행해 주세요."
            : "검색 결과가 없습니다"}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(f => {
            const cInfo = FAQ_CATEGORIES.find(c => c.v === f.category) || FAQ_CATEGORIES[FAQ_CATEGORIES.length - 2];
            return (
              <div key={f.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition">
                <div className="p-4 border-b border-gray-100 flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${cInfo.color} mb-1.5`}>{cInfo.label}</div>
                    <div className="text-sm font-bold text-gray-900">{f.question}</div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => copyAnswer(f)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition ${copiedId === f.id ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}>
                      {copiedId === f.id ? "✓ 복사됨" : "📋 복사"}
                    </button>
                    <button onClick={() => setEditing(f)}
                      className="text-xs px-2 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">수정</button>
                    <button onClick={() => delFaq(f)}
                      className="text-xs px-2 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100">삭제</button>
                  </div>
                </div>
                <div className="p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50/50">{f.answer}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* 편집 모달 */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="text-lg font-bold">{editing.id ? "FAQ 수정" : "FAQ 추가"}</div>
              <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-gray-800">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">카테고리</label>
                <select value={editing.category || "general"}
                  onChange={e => setEditing({ ...editing, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  {FAQ_CATEGORIES.filter(c => c.v !== "all").map(c => <option key={c.v} value={c.v}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">질문 *</label>
                <input type="text" value={editing.question || ""}
                  onChange={e => setEditing({ ...editing, question: e.target.value })}
                  placeholder="예: Q1. 수강료와 수업 회차는 어떻게 되나요?"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">답변 *</label>
                <textarea value={editing.answer || ""} rows={10}
                  onChange={e => setEditing({ ...editing, answer: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">정렬 순서</label>
                <input type="number" value={editing.sort_order ?? 0}
                  onChange={e => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                  className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">취소</button>
              <button onClick={saveFaq} className="px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg text-sm font-bold">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: any) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2.5 text-sm border-b-2 transition-colors flex items-center gap-1.5 ${
        active ? "border-pink-500 text-pink-700 font-bold bg-pink-50/50" : "border-transparent text-gray-500 hover:text-gray-700"
      }`}>
      <span>{icon}</span> {label}
    </button>
  );
}

function StatCard({ color, label, value }: any) {
  return (
    <div className={`bg-gradient-to-br ${color} rounded-xl p-3 text-white shadow-sm`}>
      <div className="text-xs opacity-90">{label}</div>
      <div className="text-xl font-bold mt-0.5">{value}</div>
    </div>
  );
}
