"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";

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
        @media print {
          @page { size: A4; margin: 12mm 12mm 12mm 12mm; }
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .chart-a4 { box-shadow: none !important; border: none !important; padding: 0 !important; }
          .chart-section { page-break-inside: avoid; }
        }
        .chart-a4 {
          font-family: "Nanum Myeongjo", "NanumMyeongjo", "Batang", serif;
          font-size: 10.5pt; line-height: 1.5; color: #111;
          width: 186mm; margin: 0 auto; background: white;
        }
        .chart-a4 h1 { font-size: 15pt; font-weight: 800; text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 6px; margin-bottom: 10px; }
        .chart-a4 h2 { font-size: 11pt; font-weight: 800; color: #0369a1; border-left: 3px solid #0284c7; padding-left: 6px; margin-top: 10px; margin-bottom: 4px; }
        .chart-a4 table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 6px; }
        .chart-a4 th, .chart-a4 td { border: 1px solid #cbd5e1; padding: 3px 6px; }
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

        <div className="chart-section" style={{ marginTop: 14 }}>
          <h2>6. 상담 메모</h2>
          <div style={{ minHeight: 60, border: "1px solid #cbd5e1", padding: 6, whiteSpace: "pre-wrap" }}>
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
