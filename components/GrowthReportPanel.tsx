// ✅ v3.46.7: 차트 프리미엄화 (도넛+스플라인+파스텔)
"use client";
/**
 * ═══════════════════════════════════════════════════════════════
 * 🌊 v3.46.0 - 월간/연간 성장 종합보고서 (A4 PDF)
 * ═══════════════════════════════════════════════════════════════
 * 회원 데이터·세션 데이터를 자동 집계하여 A4 1~2장 성장보고서 생성
 *
 * 핵심 기능:
 * 1) 6축 레이더 차트 (호흡·적응, 근력, 균형, 유연성, 사회성, 인지)
 * 2) 6축 시계열 라인 그래프 (LOCF fallback - 수치 없어도 그래프 채움)
 * 3) 활동량 스택 바 차트 (5카테고리 자동 분류)
 * 4) KPI 요약 카드 (총 세션 / 실측% / 출석일 / 주력축 / 노쇼횟수)
 * 5) AI 자동 코멘트 초안 (/api/ai?action=growth-report)
 * 6) 치료사 편집 가능한 텍스트 영역
 * 7) A4 PDF 다운로드 (jsPDF + html2canvas)
 * 8) 인쇄용 CSS 최적화 (@media print)
 * ═══════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  RADAR_AXIS_META,
  computeRadarScores,
  buildFilledTimeSeries,
  buildActivityVolume,
  computeReportSummary,
  type RadarAxis,
} from "@/lib/reportMetrics";
import { FileDown, Printer, Sparkles, Loader2, X } from "lucide-react";

type Period = "monthly" | "yearly";

interface Props {
  memberId: string;
  memberName: string;
  memberLevel?: number;
  period: Period;
  startDate?: string;  // ✅ v3.46.2: 부모 페이지에서 지정한 시작일
  endDate?: string;    // ✅ v3.46.2: 부모 페이지에서 지정한 종료일
  onClose?: () => void;
}

export default function GrowthReportPanel({ memberId, memberName, memberLevel = 2, period, startDate: propStartDate, endDate: propEndDate, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [orgSettings, setOrgSettings] = useState<any>(null);

  // AI 코멘트 (편집 가능)
  const [activityView, setActivityView] = useState<"donut" | "monthly">("donut"); // ✅ v3.46.8
  // ✅ v3.46.9: 담당 치료사 선택 + 서명
  const [staffList, setStaffList] = useState<any[]>([]);
  const [therapistId, setTherapistId] = useState<string>("");
  const [therapistName, setTherapistName] = useState<string>("");
  const [therapistSignature, setTherapistSignature] = useState<string>(""); // dataURL
  const [showSignPad, setShowSignPad] = useState(false);
  const [aiComment, setAiComment] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiEdited, setAiEdited] = useState(false);

  // PDF 다운로드 로딩
  const [pdfLoading, setPdfLoading] = useState(false);

  // 인쇄 대상 ref
  const printRef = useRef<HTMLDivElement>(null);

  // ✅ v3.46.2: 부모에서 지정한 startDate/endDate가 있으면 그것을 우선 사용
  const { startDate, endDate, periodLabel } = useMemo(() => {
    // 부모가 준 날짜가 있으면 그대로 사용
    if (propStartDate && propEndDate) {
      const s = new Date(propStartDate);
      const e = new Date(propEndDate);
      const monthsBetween = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
      const label = period === "yearly" || monthsBetween >= 6
        ? `${s.getFullYear()}년 ${s.getMonth()+1}월 ~ ${e.getFullYear()}년 ${e.getMonth()+1}월`
        : `${s.getFullYear()}년 ${s.getMonth()+1}월`;
      return { startDate: propStartDate, endDate: propEndDate, periodLabel: label };
    }
    // 부모 미지정 시 기본값 (오늘 기준 2026-08-22)
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    let start: string;
    let label: string;
    if (period === "monthly") {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      start = s.toISOString().slice(0, 10);
      label = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
    } else {
      const s = new Date(now.getFullYear(), 0, 1);
      start = s.toISOString().slice(0, 10);
      label = `${now.getFullYear()}년`;
    }
    return { startDate: start, endDate: end, periodLabel: label };
  }, [period, propStartDate, propEndDate]);

  // ✅ v3.46.3: 데이터 로드 (컬럼명 자동 감지 + 안전 매칭)
  useEffect(() => {
    (async () => {
      if (!memberId || !startDate || !endDate) { setLoading(false); return; }
      setLoading(true);
      try {
        // 1) sessions - session_date 우선, 실패 시 필터 없이 전체 로드 후 클라이언트 필터
        let sessionRows: any[] = [];
        try {
          const r1 = await supabase.from("sessions")
            .select("*")
            .eq("member_id", memberId)
            .gte("session_date", startDate)
            .lte("session_date", endDate)
            .is("deleted_at", null)
            .order("session_date", { ascending: true });
          if (r1.error) throw r1.error;
          sessionRows = r1.data || [];
        } catch (e1) {
          // 컬럼명 이슈 시 members.extra.sessions JSONB 사용 (기존 v3.34.x 폴백)
          console.warn("[v3.46.3] sessions 테이블 로드 실패, extra.sessions 폴백", e1);
          try {
            const m = await supabase.from("members").select("extra").eq("id", memberId).maybeSingle();
            const arr: any[] = (m.data as any)?.extra?.sessions || [];
            sessionRows = arr.filter((s: any) => {
              const d = s.date || s.session_date;
              return d && d >= startDate && d <= endDate;
            });
          } catch {}
        }

        // 2) attendance - 컬럼명 자동 감지 (date / attend_date / attendance_date / session_date)
        let attendanceRows: any[] = [];
        const attendCols = ["attend_date", "date", "attendance_date", "session_date"];
        for (const col of attendCols) {
          try {
            const r = await supabase.from("attendance")
              .select("*")
              .eq("member_id", memberId)
              .gte(col, startDate)
              .lte(col, endDate);
            if (!r.error && r.data) {
              attendanceRows = r.data;
              break;
            }
          } catch {}
        }

        // 3) org_settings
        let orgRow = null;
        try {
          const oRes = await supabase.from("org_settings").select("*").limit(1).maybeSingle();
          orgRow = oRes.data || null;
        } catch {}

        console.log(`[v3.46.3] 성장보고서 로드: sessions=${sessionRows.length}건, attendance=${attendanceRows.length}건 (${startDate}~${endDate})`);
        setSessions(sessionRows);
        setAttendance(attendanceRows);
        setOrgSettings(orgRow);
      } catch (e) {
        console.error("[v3.46.3] 성장보고서 데이터 로드 실패:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId, startDate, endDate]);

  // ✅ v3.46.9: 치료사(직원) 목록 로드
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("staff").select("id, name, position, department").order("name");
        setStaffList(data || []);
      } catch (e) { /* silent */ }
    })();
  }, []);

  // ✅ v3.46.2: 6축 레이더 데이터 (세션이 없어도 기본 축 렌더링 보장)
  const radarData = useMemo(() => {
    const scores = computeRadarScores(sessions || [], memberLevel);
    return (Object.keys(RADAR_AXIS_META) as RadarAxis[]).map(axis => {
      const s = scores[axis];
      // 세션이 없으면 memberLevel 기반 기본값 표시 (fallback)
      const defaultScore = Math.max(15, memberLevel * 20);
      return {
        axis: RADAR_AXIS_META[axis].label,
        점수: (s && typeof s.score === "number" && s.score > 0) ? s.score : defaultScore,
        source: s?.source || "default",
      };
    });
  }, [sessions, memberLevel]);

  // ✅ v3.46.10: X축 고정 렌더링 (월간=1~12월, 연간=시작연도~현재연도)
  const timeSeriesData = useMemo(() => {
    const raw = buildFilledTimeSeries(sessions || [], period === "yearly" ? "year" : "month", memberLevel, startDate, endDate);
    const axisKeys = Object.keys(RADAR_AXIS_META) as RadarAxis[];

    // 데이터 맵 (raw 의 bucket → 점수 매핑)
    const dataMap = new Map<string, any>();
    (raw || []).forEach((d: any) => dataMap.set(d.bucket, d));

    if (period === "monthly") {
      // ── 월간: 1~12월 모두 12개 포인트 강제 렌더링
      const y = (startDate || new Date().toISOString().slice(0, 10)).slice(0, 4);
      const points: any[] = [];
      const carry: Record<string, number> = {};
      axisKeys.forEach(ax => { carry[ax] = Math.max(15, memberLevel * 20); });

      for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, "0");
        const key = `${y}-${mm}`;
        const found = dataMap.get(key);
        const point: any = { bucket: `${m}월` };
        axisKeys.forEach(ax => {
          if (found && typeof found[ax] === "number" && found[ax] > 0) {
            carry[ax] = found[ax];
            point[ax] = found[ax];
          } else {
            point[ax] = carry[ax];  // LOCF
          }
        });
        points.push(point);
      }
      return points;
    } else {
      // ── 연간: 시작연도 ~ 현재연도 고정
      const sy = parseInt((startDate || `${new Date().getFullYear()}-01-01`).slice(0, 4));
      const cy = new Date().getFullYear();
      const ey = Math.max(cy, parseInt((endDate || `${cy}-12-31`).slice(0, 4)));
      const points: any[] = [];
      const carry: Record<string, number> = {};
      axisKeys.forEach(ax => { carry[ax] = Math.max(15, memberLevel * 20); });

      for (let y = sy; y <= ey; y++) {
        const key = String(y);
        const found = dataMap.get(key);
        const point: any = { bucket: `${y}년` };
        axisKeys.forEach(ax => {
          if (found && typeof found[ax] === "number" && found[ax] > 0) {
            carry[ax] = found[ax];
            point[ax] = found[ax];
          } else {
            point[ax] = carry[ax];  // LOCF
          }
        });
        points.push(point);
      }
      return points;
    }
  }, [sessions, period, startDate, endDate, memberLevel]);

  const activityData = useMemo(() => {
    const data = buildActivityVolume(sessions || [], period === "yearly" ? "year" : "month");  // ✅ v3.46.4: mode는 month|year만
    if (!data || data.length === 0) {
      const now = new Date();
      const label = period === "yearly" ? `${now.getMonth()+1}월` : `${now.getMonth()+1}/${now.getDate()}`;
      const emptyPoint: any = { label };
      (Object.keys(RADAR_AXIS_META) as RadarAxis[]).forEach(axis => {
        emptyPoint[RADAR_AXIS_META[axis].label] = 0;
      });
      return [emptyPoint];
    }
    return data;
  }, [sessions, period]);

  // KPI 요약 (노쇼 횟수 포함)
  const summary = useMemo(() => {
    const base = computeReportSummary(sessions, memberLevel);
    // v3.45.7 취소=노쇼 로직 활용
    const noshowCount = sessions.filter(s => {
      const st = String(s?.status || "").toLowerCase();
      return st === "noshow" || st === "cancel";
    }).length;
    // ✅ v3.46.3: status='present' 없으면 전체 출석 레코드 개수로 폴백
    const presentCount = attendance.filter(a => a?.status === "present").length;
    const attendCount = presentCount > 0 ? presentCount : attendance.length;
    return { ...base, noshowCount, attendCount };
  }, [sessions, attendance, memberLevel]);

  // AI 자동 코멘트 생성
  async function generateAiComment() {
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai?action=growth-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberName,
          period: periodLabel,
          summary,
          radar: radarData,
          sessionCount: sessions.length,
        }),
      });
      const data = await res.json();
      if (data?.comment) {
        setAiComment(data.comment);
        setAiEdited(false);
      } else {
        setAiComment("AI 코멘트 생성에 실패했습니다. 직접 작성해 주세요.");
      }
    } catch (e: any) {
      setAiComment(`AI 오류: ${e.message}\n\n치료사가 직접 작성해 주세요.`);
    } finally {
      setAiLoading(false);
    }
  }

  // 데이터 로드 완료 시 AI 코멘트 초안 자동 생성
  useEffect(() => {
    if (!loading && sessions.length > 0 && !aiComment) {
      generateAiComment();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, sessions.length]);

  // PDF 다운로드 (jsPDF + html2canvas)
  async function downloadPdf() {
    if (!printRef.current) return;
    setPdfLoading(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgProps = pdf.getImageProperties(imgData);
      const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

      if (imgHeight <= pdfHeight) {
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, imgHeight);
      } else {
        // 여러 페이지 처리
        let yPos = 0;
        while (yPos < imgHeight) {
          pdf.addImage(imgData, "PNG", 0, -yPos, pdfWidth, imgHeight);
          yPos += pdfHeight;
          if (yPos < imgHeight) pdf.addPage();
        }
      }

      const filename = `${memberName}_성장보고서_${periodLabel.replace(/[년월 ]/g, "-").replace(/-+/g, "-").replace(/-$/, "")}.pdf`;
      pdf.save(filename);
    } catch (e: any) {
      alert(`PDF 생성 실패: ${e.message}`);
    } finally {
      setPdfLoading(false);
    }
  }

  function printReport() {
    window.print();
  }

  if (loading) {
    return (
      <div className="p-10 text-center text-gray-500">
        <Loader2 className="w-8 h-8 mx-auto animate-spin text-aqu-500 mb-3" />
        <div>성장보고서 데이터를 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="growth-report-container">
      {/* 상단 툴바 (인쇄 시 숨김) */}
      <div className="print:hidden print-hide flex items-center justify-between mb-4 px-4 py-3 bg-gradient-to-r from-white via-sky-50/40 to-indigo-50/30 rounded-2xl border border-slate-200/70 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-aqu-900">
            📄 {periodLabel} 성장보고서 - {memberName}
          </span>
          <span className="text-xs px-2 py-0.5 bg-aqu-100 text-aqu-700 rounded-full">
            {sessions.length}개 세션
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={generateAiComment} disabled={aiLoading}
            className="text-xs px-3 py-1.5 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-100 flex items-center gap-1 disabled:opacity-50">
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            AI 코멘트 재생성
          </button>
          {/* ✅ v3.46.11: 담당치료사 드롭다운 (툴바) */}
          <select
            value={therapistId}
            onChange={(e) => {
              const id = e.target.value;
              setTherapistId(id);
              const s = staffList.find(x => x.id === id);
              setTherapistName(s?.name || "");
            }}
            className="text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none max-w-[180px] truncate">
            <option value="">👤 담당치료사 선택</option>
            {staffList.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{s.position ? ` (${s.position})` : ""}
              </option>
            ))}
          </select>
          {/* ✅ v3.46.11: 서명 버튼 (툴바) */}
          <button onClick={() => setShowSignPad(true)}
            className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1 transition ${therapistSignature ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
            {therapistSignature ? "✓ 서명완료" : "🖊️ 서명"}
          </button>
          {therapistSignature && (
            <button onClick={() => setTherapistSignature("")}
              title="서명 삭제"
              className="text-xs px-2 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 transition">
              🗑️
            </button>
          )}
          <button onClick={printReport}
            className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1">
            <Printer className="w-3.5 h-3.5" /> 인쇄
          </button>
          <button onClick={downloadPdf} disabled={pdfLoading}
            className="text-xs px-3 py-1.5 bg-aqu-600 hover:bg-aqu-700 text-white rounded-lg flex items-center gap-1 disabled:opacity-50">
            {pdfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            {pdfLoading ? "생성 중..." : "PDF 다운로드"}
          </button>
          {onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* A4 프린트 영역 */}
      <div ref={printRef} className="growth-report-print bg-white p-8 mx-auto" style={{ maxWidth: "210mm", minHeight: "297mm" }}>
        {/* 헤더 */}
        <div className="border-b-2 border-aqu-500 pb-4 mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-aqu-900">🌊 성장 종합보고서</h1>
            <div className="text-sm text-gray-600 mt-1">{periodLabel} · {memberName} 회원</div>
            <div className="text-[10px] text-gray-400 mt-1">{startDate} ~ {endDate}</div>
          </div>
          <div className="text-right text-xs text-gray-500">
            <div className="font-bold text-aqu-800">{orgSettings?.center_name || "위례아쿠수중운동센터"}</div>
            <div>대표: {orgSettings?.ceo_name || "하유정"}</div>
            <div>{orgSettings?.phone || "010-8114-8275"}</div>
          </div>
        </div>

        {/* ✅ v3.46.8: KPI 요약 카드 프리미엄화 */}
        <div className="grid grid-cols-5 gap-2 mb-6 no-break">
          <KpiCard label="총 세션" value={summary.totalSessions} unit="회" color="sky" icon="🌊" />
          <KpiCard label="실측 세션" value={`${Math.round(summary.measuredRatio * 100)}`} unit="%" color="emerald" icon="🎯" />
          <KpiCard label="출석일" value={summary.attendanceDays} unit="일" color="indigo" icon="📅" />
          <KpiCard label="주력 축" value={summary.dominantAxis?.label || "-"} unit="" color="purple" icon="⭐" />
          <KpiCard label="노쇼/취소" value={summary.noshowCount} unit="건" color="rose" icon="🚫" />
        </div>

        {/* 6축 레이더 차트 */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-1.5">📊 6축 성장 프로필</h2>
          <div className="no-break border border-slate-200/70 rounded-2xl p-4 bg-gradient-to-br from-white to-slate-50/40 shadow-sm">
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: "#334155" }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: "#94a3b8" }} />
                <Radar name="성장 점수" dataKey="점수" stroke="#818CF8" fill="#818CF8" fillOpacity={0.35} strokeWidth={2} />
                <Tooltip formatter={(v: any) => `${v}점`} />
              </RadarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-1 mt-2 justify-center">
              {radarData.map(d => (
                <span key={d.axis} className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                  d.source === "measured" ? "bg-green-100 text-green-700" :
                  d.source === "tag" ? "bg-blue-100 text-blue-700" :
                  "bg-gray-100 text-gray-500"
                }`}>
                  {d.axis} {d.점수}점 ({d.source === "measured" ? "실측" : d.source === "tag" ? "태그" : "기본"})
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 시계열 라인 그래프 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
              📈 성장 추이
              <span className="text-[10px] font-normal text-slate-400">(LOCF 보정 · 스플라인 · 다년 비교)</span>
            </h2>
            <span className="print-hide text-[10px] text-slate-400">💡 범례 클릭 시 축 숨김</span>
          </div>
          <div className="no-break border border-slate-200/70 rounded-2xl p-4 bg-gradient-to-br from-white to-slate-50/40 shadow-sm">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart key={`ts-${period}-${startDate}-${endDate}-${timeSeriesData.length}`} data={timeSeriesData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                <defs>
                  {(Object.keys(RADAR_AXIS_META) as RadarAxis[]).map(axis => (
                    <linearGradient key={`grad-${axis}`} id={`grad-${axis}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={RADAR_AXIS_META[axis].color} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={RADAR_AXIS_META[axis].color} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="bucket"
                  type="category"
                  interval={0}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} formatter={(v: any) => `${v}점`} />
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} iconType="circle" />
                {/* ✅ v3.46.7: 스플라인 곡선(tension) + 그라디언트 채우기 */}
                {(Object.keys(RADAR_AXIS_META) as RadarAxis[]).map(axis => (
                  <Area key={axis} type="monotone" dataKey={axis}
                    name={RADAR_AXIS_META[axis].label}
                    stroke={RADAR_AXIS_META[axis].color} strokeWidth={2.5}
                    fill={`url(#grad-${axis})`}
                    dot={{ r: 3, strokeWidth: 2, fill: "#fff" }}
                    activeDot={{ r: 5, strokeWidth: 2 }}
                    connectNulls />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ✅ v3.46.8: 활동량 분포 - 도넛/월별막대 탭 전환 */}
        <div className="mb-6 no-break">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-1.5">🏊 활동량 분포</h2>
            <div className="print-hide inline-flex rounded-full bg-slate-100 p-0.5 text-[10px] font-semibold">
              <button
                onClick={() => setActivityView("donut")}
                className={`px-2.5 py-1 rounded-full transition ${activityView==="donut" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                🍩 비중
              </button>
              <button
                onClick={() => setActivityView("monthly")}
                className={`px-2.5 py-1 rounded-full transition ${activityView==="monthly" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                📊 월별
              </button>
            </div>
          </div>
          <div className="border border-slate-200/70 rounded-2xl p-4 bg-gradient-to-br from-white to-slate-50/40 shadow-sm">
            {activityView === "donut" ? (() => {
              // ✅ v3.46.7: 스택바 → 도넛 차트 (총 활동 비중 시각화)
              const axisKeys = Object.keys(RADAR_AXIS_META) as RadarAxis[];
              const donutData = axisKeys.map(axis => {
                const total = activityData.reduce((sum, row: any) => sum + (Number(row[axis]) || 0), 0);
                return { axis, name: RADAR_AXIS_META[axis].label, value: total, color: RADAR_AXIS_META[axis].color };
              }).filter(d => d.value > 0);
              const grandTotal = donutData.reduce((s, d) => s + d.value, 0);
              const isEmpty = donutData.length === 0 || grandTotal === 0;
              const displayData = isEmpty ? axisKeys.map(axis => ({
                axis, name: RADAR_AXIS_META[axis].label, value: 1, color: RADAR_AXIS_META[axis].color,
              })) : donutData;
              const displayTotal = isEmpty ? axisKeys.length : grandTotal;
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                  {/* 좌: 도넛 차트 */}
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={displayData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%" cy="50%"
                          innerRadius={60}
                          outerRadius={95}
                          paddingAngle={2}
                          cornerRadius={4}
                          stroke="#fff"
                          strokeWidth={2}
                        >
                          {displayData.map((d, i) => (
                            <Cell key={i} fill={d.color} fillOpacity={isEmpty ? 0.35 : 0.9} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                          formatter={(v: any, n: any) => isEmpty ? ["데이터 없음", n] : [`${v}회 (${Math.round((Number(v) / grandTotal) * 100)}%)`, n]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* 도넛 중앙 라벨 */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <div className="text-2xl font-bold text-slate-800">{isEmpty ? "—" : grandTotal}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">총 활동 태그</div>
                    </div>
                  </div>
                  {/* 우: 컬러 범례 + 점유율 뱃지 */}
                  <div className="flex flex-col gap-2 px-2">
                    {axisKeys.map(axis => {
                      const total = activityData.reduce((sum, row: any) => sum + (Number(row[axis]) || 0), 0);
                      const pct = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;
                      const color = RADAR_AXIS_META[axis].color;
                      return (
                        <div key={axis} className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-xs text-slate-700 flex-1 truncate">{RADAR_AXIS_META[axis].label}</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: `${color}22`, color: color }}>
                            {total}회 · {pct}%
                          </span>
                        </div>
                      );
                    })}
                    {isEmpty && (
                      <div className="text-[10px] text-slate-400 text-center mt-1">※ 세션 태그 데이터가 부족합니다</div>
                    )}
                  </div>
                </div>
              );
            })() : (
              // ✅ v3.46.8: 월별 12분할 둥근 막대 뷰
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={(() => {
                    // period 가 yearly 면 12개월, monthly 면 activityData bucket 사용
                    if (period === "yearly") {
                      const y = new Date(startDate).getFullYear();
                      const months = Array.from({ length: 12 }, (_, i) => {
                        const mm = String(i + 1).padStart(2, "0");
                        const label = `${i + 1}월`;
                        const row: any = { bucket: label };
                        (Object.keys(RADAR_AXIS_META) as RadarAxis[]).forEach(ax => (row[ax] = 0));
                        // activityData 에서 해당 월 매치
                        activityData.forEach((d: any) => {
                          const b = String(d.bucket || "");
                          if (b.includes(`-${mm}`) || b.startsWith(`${y}-${mm}`) || b.startsWith(`${i + 1}월`) || b === label) {
                            (Object.keys(RADAR_AXIS_META) as RadarAxis[]).forEach(ax => {
                              row[ax] += Number(d[ax]) || 0;
                            });
                          }
                        });
                        return row;
                      });
                      return months;
                    }
                    return activityData;
                  })()}
                  margin={{ top: 10, right: 12, left: -10, bottom: 5 }}
                  barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} formatter={(v: any) => `${v}회`} />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 6 }} iconType="circle" />
                  {(Object.keys(RADAR_AXIS_META) as RadarAxis[]).map((axis, i, arr) => (
                    <Bar key={axis} dataKey={axis} stackId="axis"
                      name={RADAR_AXIS_META[axis].label}
                      fill={RADAR_AXIS_META[axis].color}
                      radius={i === arr.length - 1 ? [8, 8, 0, 0] : [0, 0, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ✅ v3.46.9: AI 자동 코멘트 - 인쇄용 미러 div (textarea 잘림 방지) */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
            💬 치료사 종합 코멘트
            {aiEdited && (
            <span className="print-hide text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full" data-print="hide">직접 편집됨</span>
          )}
            {!aiEdited && aiComment && (
            <span className="print-hide text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full" data-print="hide">AI 초안</span>
          )}
          </h2>
          {/* 화면용 편집 textarea (인쇄 시 숨김) */}
          <textarea
            value={aiComment}
            onChange={(e) => { setAiComment(e.target.value); setAiEdited(true); }}
            className="print-hide w-full min-h-[280px] p-3.5 border border-slate-200 rounded-2xl text-sm leading-relaxed focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 focus:outline-none whitespace-pre-line bg-white"
            placeholder={aiLoading ? "AI 코멘트를 생성하는 중..." : "치료사가 종합 소견을 작성해 주세요."}
          />
          {/* 인쇄용 미러 div - 전체 텍스트 잘림 없이 표시 */}
          <div className="ai-comment-print hidden text-sm leading-relaxed whitespace-pre-line text-slate-800 mt-1">
            {aiComment || "(코멘트 없음)"}
          </div>
        </div>

        {/* ✅ v3.46.11: 하단은 인쇄용 서명 표시만 (입력 폼은 상단 툴바로 이동) */}
        <div className="border-t-2 border-slate-100 pt-4 mt-6 no-break">
          {/* ✅ v3.46.10: 발행 정보 + 서명 영역 (직인 스타일 · 박스/테두리 없음) */}
          <div className="flex justify-between items-end text-[10px] text-slate-500">
            <div>
              📅 발행일: {new Date().toISOString().slice(0, 10)}<br/>
              💧 이 보고서는 세션 태그와 정밀 수치를 자동 집계하여 생성됩니다.
            </div>
            <div className="text-right">
              {/* 서명 이미지 + "담당 치료사: 이름 (인)" 텍스트 겹침 */}
              <div className="relative inline-block pr-2" style={{ minHeight: 60 }}>
                <div className="text-[12px] font-semibold text-slate-800 whitespace-nowrap">
                  담당 치료사: <span className="mx-1">{therapistName || "__________"}</span>
                  <span className="relative inline-block align-middle" style={{ width: 22, height: 22 }}>
                    {therapistSignature ? (
                      // 서명 이미지가 (인) 자리에 겹쳐서 출력 - 배경 투명, 테두리 없음
                      <img
                        src={therapistSignature}
                        alt="서명"
                        className="absolute"
                        style={{
                          left: "50%",
                          top: "50%",
                          transform: "translate(-50%, -50%) rotate(-4deg)",
                          height: 44,
                          width: "auto",
                          maxWidth: 90,
                          mixBlendMode: "multiply",
                          filter: "contrast(1.15)",
                          pointerEvents: "none",
                        }}
                      />
                    ) : (
                      <span className="text-slate-400">(인)</span>
                    )}
                  </span>
                </div>
              </div>
              <div className="mt-1 text-[10px] text-slate-500">{orgSettings?.center_name || "위례아쿠수중운동센터"}</div>
            </div>
          </div>
        </div>

        {/* ✅ v3.46.9: 서명 캔버스 모달 */}
        {showSignPad && (
          <SignaturePadModal
            onClose={() => setShowSignPad(false)}
            onSave={(dataUrl) => { setTherapistSignature(dataUrl); setShowSignPad(false); }}
          />
        )}
      </div>

      {/* ✅ v3.46.8: 인쇄용 CSS 근본 재설계 (visibility 방식으로 백지 문제 해결) */}
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 10mm 8mm; }
          /* 전체를 숨기지 않고 visibility 로 인쇄 영역만 노출 */
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          .growth-report-print, .growth-report-print * { visibility: visible !important; }
          .growth-report-print {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            min-height: auto !important;
            padding: 12mm 10mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background: #fff !important;
          }
          /* ✅ v3.46.11: 인쇄 숨김 근본 강화 - 자식 요소까지 완전 제거 */
          .print\\:hidden,
          .print-hide,
          .print-hide *,
          .growth-report-print .print-hide,
          .growth-report-print .print-hide * {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            width: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            border: 0 !important;
            overflow: hidden !important;
          }
          /* ✅ v3.46.9: textarea 숨기고 미러 div로 대체 (잘림 근본 해결) */
          .ai-comment-print { display: block !important; visibility: visible !important; }
          textarea { display: none !important; }
          /* select, input, button 등 인쇄 부적합 요소 완전 제거 */
          .growth-report-print select,
          .growth-report-print input,
          .growth-report-print button:not(.print-keep) {
            display: none !important;
          }
          /* 서명 이미지는 반드시 인쇄 */
          img { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          /* Recharts SVG 인쇄 색상 유지 */
          svg, svg * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-break { page-break-inside: avoid !important; break-inside: avoid !important; }
        }
      `}</style>
    </div>
  );
}


// ✅ v3.46.9: 태블릿/마우스 서명 캔버스 모달
function SignaturePadModal({ onClose, onSave }: { onClose: () => void; onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    // HiDPI 지원
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 2.5;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);
    }
  }, []);

  function getPos(e: any) {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: any) {
    e.preventDefault();
    setDrawing(true);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: any) {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setEmpty(false);
  }
  function end() { setDrawing(false); }

  function clear() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const rect = c.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setEmpty(true);
  }

  function save() {
    if (!canvasRef.current || empty) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    onSave(dataUrl);
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-5 w-full max-w-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="text-base font-bold text-slate-800 flex items-center gap-2">
            🖊️ 서명 입력
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="text-[11px] text-slate-500 mb-2">태블릿에서 손가락/펜, PC에서 마우스로 서명하세요.</div>
        <div className="border-2 border-dashed border-slate-300 rounded-2xl overflow-hidden bg-white" style={{ touchAction: "none" }}>
          <canvas
            ref={canvasRef}
            className="w-full block"
            style={{ height: 220, cursor: "crosshair", touchAction: "none" }}
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          />
        </div>
        <div className="flex justify-between mt-4 gap-2">
          <button onClick={clear}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition">
            🗑️ 지우기
          </button>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 transition">
              취소
            </button>
            <button onClick={save} disabled={empty}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-600 hover:to-indigo-600 text-white transition disabled:opacity-40 shadow-md shadow-indigo-200/40">
              ✓ 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, unit, color, icon }: any) {
  // ✅ v3.46.8: 그라디언트 + 아이콘 + 프리미엄 디자인
  const gradMap: Record<string, { from: string; to: string; text: string; ring: string }> = {
    sky:     { from: "from-sky-50",     to: "to-sky-100/60",     text: "text-sky-800",     ring: "ring-sky-200" },
    emerald: { from: "from-emerald-50", to: "to-emerald-100/60", text: "text-emerald-800", ring: "ring-emerald-200" },
    indigo:  { from: "from-indigo-50",  to: "to-indigo-100/60",  text: "text-indigo-800",  ring: "ring-indigo-200" },
    purple:  { from: "from-purple-50",  to: "to-purple-100/60",  text: "text-purple-800",  ring: "ring-purple-200" },
    rose:    { from: "from-rose-50",    to: "to-rose-100/60",    text: "text-rose-800",    ring: "ring-rose-200" },
    aqu:     { from: "from-sky-50",     to: "to-cyan-100/60",    text: "text-sky-800",     ring: "ring-sky-200" },
    blue:    { from: "from-indigo-50",  to: "to-indigo-100/60",  text: "text-indigo-800",  ring: "ring-indigo-200" },
    red:     { from: "from-rose-50",    to: "to-rose-100/60",    text: "text-rose-800",    ring: "ring-rose-200" },
  };
  const g = gradMap[color] || gradMap.sky;
  return (
    <div className={`relative p-3 rounded-2xl bg-gradient-to-br ${g.from} ${g.to} ring-1 ${g.ring} shadow-sm hover:shadow-md transition-shadow overflow-hidden`}>
      {icon && (
        <div className="absolute -right-1 -top-1 text-2xl opacity-20 select-none">{icon}</div>
      )}
      <div className={`text-[10px] font-semibold ${g.text} opacity-70`}>{label}</div>
      <div className={`text-lg font-bold mt-1 ${g.text} leading-tight`}>
        {value}
        {unit && <span className="text-[11px] font-medium opacity-70 ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}
