"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";

// v3.20.22: 바디맵 좀들 (멤버 상세 페이지와 동일 좌표)
const BODY_PARTS = [
  { key: "neck", label: "목", x: 100, y: 40 },
  { key: "shoulder_l", label: "어깨(좌)", x: 65, y: 65 },
  { key: "shoulder_r", label: "어깨(우)", x: 135, y: 65 },
  { key: "arm_l", label: "팔(좌)", x: 45, y: 110 },
  { key: "arm_r", label: "팔(우)", x: 155, y: 110 },
  { key: "chest", label: "가슴", x: 100, y: 100 },
  { key: "back", label: "허리", x: 100, y: 160 },
  { key: "hip", label: "고관절", x: 100, y: 200 },
  { key: "knee_l", label: "무릎(좌)", x: 80, y: 260 },
  { key: "knee_r", label: "무릎(우)", x: 120, y: 260 },
  { key: "ankle_l", label: "발목(좌)", x: 80, y: 330 },
  { key: "ankle_r", label: "발목(우)", x: 120, y: 330 },
];

function BodyMapSvg({ painMap, sensationMap }: { painMap: Record<string, number>; sensationMap: Record<string, string> }) {
  return (
    <svg viewBox="0 0 200 400" style={{ width: "38mm", height: "76mm" }}>
      <ellipse cx={100} cy={45} rx={22} ry={28} fill="#f8fafc" stroke="#0891b2" strokeWidth={1.5} />
      <rect x={75} y={70} width={50} height={90} rx={20} fill="#f8fafc" stroke="#0891b2" strokeWidth={1.5} />
      <path d="M75 90 L45 130 L45 190" fill="none" stroke="#0891b2" strokeWidth={1.5} />
      <path d="M125 90 L155 130 L155 190" fill="none" stroke="#0891b2" strokeWidth={1.5} />
      <rect x={75} y={160} width={50} height={80} fill="#f8fafc" stroke="#0891b2" strokeWidth={1.5} />
      <path d="M80 240 L75 340 L70 380" fill="none" stroke="#0891b2" strokeWidth={1.5} />
      <path d="M120 240 L125 340 L130 380" fill="none" stroke="#0891b2" strokeWidth={1.5} />
      {BODY_PARTS.map((p) => {
        const pain = (painMap || {})[p.key] || 0;
        const sens = (sensationMap || {})[p.key];
        const size = 6 + pain * 1.1;
        const color = pain === 0
          ? (sens === "sensitive" ? "#a78bfa" : sens === "dull" ? "#94a3b8" : sens === "numb" ? "#64748b" : "#e5e7eb")
          : pain <= 3 ? "#fbbf24" : pain <= 6 ? "#fb923c" : "#dc2626";
        return <circle key={p.key} cx={p.x} cy={p.y} r={size} fill={color} stroke="#334155" strokeWidth={0.5} opacity={0.85} />;
      })}
    </svg>
  );
}

// v3.20.21: 상담차트 A4 프린트 (아동/성인 최적화)
export default function ChartPrintPage() {
  const params = useParams();
  const id = params?.id as string;
  const [member, setMember] = useState<any>(null);
  const [chart, setChart] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const { data: m } = await supabase.from("members").select("*").eq("id", id).maybeSingle();
      setMember(m);
      const { data: c } = await supabase.from("consultation_charts")
        .select("*").eq("member_id", id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      setChart(c);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="p-8 text-center">로딩중...</div>;

  const isChild = member?.member_type === "child";
  const F = chart || {};
  const extra = F.extra || {};
  const get = (k: string) => F[k] || extra[k] || member?.[k] || member?.extra?.[k] || "-";

  return (
    <>
      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css');
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap');
        @media print {
          @page { size: A4; margin: 8mm 10mm 8mm 10mm; }
          .no-print { display: none !important; visibility: hidden !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .chart-a4 { box-shadow: none !important; border: none !important; padding: 0 !important; width: 100% !important; }
          .chart-section { page-break-inside: avoid !important; margin-bottom: 2mm !important; }
          .chart-a4 h1 { font-size: 14pt !important; margin: 0 0 3mm 0 !important; padding-bottom: 2px !important; }
          .chart-a4 h2 { font-size: 9.5pt !important; margin: 2mm 0 1mm 0 !important; }
          .chart-a4 table { font-size: 8.2pt !important; }
          .chart-a4 th, .chart-a4 td { padding: 2px 4px !important; }
        }
        .chart-a4 {
          font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Nanum Gothic', sans-serif;
          font-size: 9.2pt; line-height: 1.38; color: #111;
          width: 190mm; margin: 0 auto; background: white; word-break: keep-all;
          letter-spacing: -0.025em;
        }
        .chart-a4 h1 { font-size: 13pt; font-weight: 800; text-align: center; border-bottom: 1.5px solid #0284c7; padding-bottom: 3px; margin: 0 0 4mm 0; }
        .chart-a4 h2 { font-size: 9.5pt; font-weight: 700; color: #0369a1; border-left: 3px solid #0284c7; padding-left: 5px; margin: 3mm 0 1.5mm 0; }
        .chart-a4 table { width: 100%; border-collapse: collapse; font-size: 8.6pt; margin-bottom: 2mm; }
        .chart-a4 th, .chart-a4 td { border: 1px solid #cbd5e1; padding: 2px 5px; }
        .chart-a4 th { background: #f1f5f9; font-weight: 700; width: 22%; }
      `}</style>

      <div className="no-print flex items-center justify-between p-3 bg-white border-b sticky top-0 z-10">
        <Link href={`/members/${id}`} className="text-sm text-blue-600 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> 회원 상세로
        </Link>
        <button onClick={() => window.print()} className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2">
          <Printer className="w-4 h-4" /> A4 인쇄
        </button>
      </div>

      <div className="chart-a4 p-4">
        <h1>🌊 아쿠수중운동센터 {isChild ? "아동" : "성인"} 상담차트</h1>

        <div className="chart-section">
          <h2>1. 기본 정보</h2>
          <table>
            <tbody>
              <tr><th>이름</th><td>{member?.name || "-"}</td><th>성별 / 나이</th><td>{member?.gender || "-"} / {member?.age || get("age")}</td></tr>
              <tr><th>연락처</th><td>{member?.phone || "-"}</td><th>상담일</th><td>{F.consult_date || "-"}</td></tr>
              {isChild && <tr><th>보호자</th><td>{member?.guardian_name || "-"}</td><th>관계</th><td>{get("guardian_relation")}</td></tr>}
              <tr><th>진단명</th><td colSpan={3}>{get("diagnosis")}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="chart-section">
          <h2>2. 의학적 정보 및 주의사항</h2>
          <table>
            <tbody>
              <tr><th>주 증상</th><td colSpan={3}>{get("main_symptom")}</td></tr>
              <tr><th>수술력</th><td>{get("surgery_history")}</td><th>복용약</th><td>{get("medication")}</td></tr>
              <tr><th>통증 부위 / 강도</th><td>{get("pain_area")} / {get("pain_scale")}</td><th>주의도 등급</th><td>{get("attention_level")}</td></tr>
              <tr><th>기저 질환</th><td colSpan={3}>{get("underlying_disease")}</td></tr>
            </tbody>
          </table>
        </div>

        {isChild ? (
          <>
            <div className="chart-section">
              <h2>3. 발달·기능 평가 (아동)</h2>
              <table>
                <tbody>
                  <tr><th>키 / 체중</th><td>{get("height")} / {get("weight")}</td><th>보행 수준</th><td>{get("walking_level")}</td></tr>
                  <tr><th>현재 기관</th><td>{get("institution")}</td><th>형제자매</th><td>{get("sibling")}</td></tr>
                  <tr><th>방문 이유</th><td colSpan={3}>{get("visit_reason")}</td></tr>
                  <tr><th>물 반응</th><td>{get("water_reaction") || F.water_reaction || "-"}</td><th>정서</th><td>{get("emotion")}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="chart-section">
              <h2>4. 감각·정서 반응</h2>
              <table>
                <tbody>
                  <tr><th>좋아하는 것</th><td colSpan={3}>{extra.likes || "-"}</td></tr>
                  <tr><th>싫어하는 것</th><td colSpan={3}>{extra.dislikes || "-"}</td></tr>
                  <tr><th>특별 유의사항</th><td colSpan={3}>{get("special_notes")}</td></tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="chart-section">
              <h2>3. 통증 상세 평가 (성인)</h2>
              <table>
                <tbody>
                  <tr><th>통증 시작 시기</th><td>{get("pain_start")}</td><th>악화 요인</th><td>{get("pain_worsening")}</td></tr>
                  <tr><th>치료 이력</th><td colSpan={3}>{get("treatment_history")}</td></tr>
                  <tr><th>운동 이력</th><td colSpan={3}>{extra.exercise_history || "-"}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="chart-section">
              <h2>4. 건강 위험 평가</h2>
              <table>
                <tbody>
                  <tr><th>혈압 / 심장</th><td>{extra.blood_pressure || "-"}</td><th>당뇨</th><td>{extra.diabetes || "-"}</td></tr>
                  <tr><th>수면 상태</th><td>{extra.sleep || "-"}</td><th>스트레스</th><td>{extra.stress || "-"}</td></tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="chart-section">
          <h2>5. 본인·보호자 니즈</h2>
          <table>
            <tbody>
              <tr><th>피하고 싶은 상황</th><td colSpan={3}>{extra.avoid_situations || "-"}</td></tr>
              <tr><th>기대 변화</th><td colSpan={3}>{get("expected_change")}</td></tr>
              <tr><th>희망 일정</th><td colSpan={3}>{extra.wish_schedule_text || (F.wish_days || []).join(", ") + " " + (F.wish_time_slots || []).join(", ")}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="chart-section" style={{ marginTop: 10 }}>
          <h2>6. AQU BODY MAP (통증·감각 지도)</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div style={{ border: "1px solid #cbd5e1", padding: 4, borderRadius: 4 }}>
              <BodyMapSvg
                painMap={F.pain_map || member?.extra?.pain_map || {}}
                sensationMap={F.sensation_map || member?.extra?.sensation_map || {}}
              />
            </div>
            <div style={{ flex: 1, fontSize: "9pt" }}>
              <div style={{ marginBottom: 4, fontWeight: 700 }}>메모</div>
              <div style={{ minHeight: 40, border: "1px solid #cbd5e1", padding: 4, whiteSpace: "pre-wrap", marginBottom: 6 }}>
                {F.body_map_notes || "-"}
              </div>
              <div style={{ fontSize: "8pt", color: "#475569" }}>
                <b>통증강도</b>: 노랑 1–3 · 주황 4–6 · 빨간 7–9 · 진한빨간 10<br />
                <b>감각</b>: 보라색 과민 · 회색 둘 · 진회색 무감각
              </div>
            </div>
          </div>
        </div>

        <div className="chart-section" style={{ marginTop: 10 }}>
          <h2>7. 상담 메모</h2>
          <div style={{ minHeight: 50, border: "1px solid #cbd5e1", padding: 6, whiteSpace: "pre-wrap" }}>
            {F.memo || member?.memo || ""}
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: "9pt", textAlign: "right", color: "#64748b" }}>
          위례아쿠수중운동센터 · 대표자 하유정 · 사업자등록번호 680-04-03475<br />
          출력일: {new Date().toISOString().slice(0,10)}
        </div>
      </div>
    </>
  );
}
