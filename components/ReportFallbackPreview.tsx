"use client";

/**
 * ═══════════════════════════════════════════════════════════════
 * 🔍 v3.45.2 - 리포트 Fallback 엔진 검증용 프리뷰
 * ═══════════════════════════════════════════════════════════════
 * 세션기록 탭 하단에 접이식으로 배치.
 * 태그만 있는 날/수치까지 있는 날 모두 6축 레이더가 채워지는지 시각적으로 즉시 확인.
 * (v3.46.0 리포트 탭 본격 렌더링 전 검증 목적)
 * ═══════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  computeRadarScores, buildFilledTimeSeries, buildActivityVolume, computeReportSummary,
  RADAR_AXIS_META, RadarAxis,
} from "@/lib/reportMetrics";

interface Props {
  sessions: any[];
  memberLevel?: number;
}

const AXES: RadarAxis[] = ["respiration", "strength", "balance", "flexibility", "social", "cognitive"];

export default function ReportFallbackPreview({ sessions, memberLevel = 2 }: Props) {
  const [mode, setMode] = useState<"month" | "year">("month");
  const [expanded, setExpanded] = useState(false);

  const radar = useMemo(() => computeRadarScores(sessions, memberLevel), [sessions, memberLevel]);
  const timeSeries = useMemo(() => buildFilledTimeSeries(sessions, mode, memberLevel), [sessions, mode, memberLevel]);
  const activity = useMemo(() => buildActivityVolume(sessions, mode), [sessions, mode]);
  const summary = useMemo(() => computeReportSummary(sessions, memberLevel), [sessions, memberLevel]);

  const radarData = radar.map(r => ({
    axis: r.label,
    score: r.score,
    fullMark: 100,
  }));

  return (
    <div className="bg-gradient-to-br from-indigo-50 via-sky-50 to-emerald-50 border border-indigo-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/40 transition">
        <div className="text-left">
          <div className="text-sm font-bold text-indigo-900 flex items-center gap-1.5">
            🔍 리포트 그래프 미리보기 <span className="text-[10px] font-normal text-indigo-600">(v3.46.0 성장 종합보고서에 자동 반영)</span>
          </div>
          <div className="text-[11px] text-indigo-700 mt-0.5">
            총 {summary.totalSessions}세션 · 실측 {summary.measuredSessions}건({summary.measuredRatio}%) · 출석 {summary.attendanceDays}일
            {summary.dominantAxis && ` · 주력: ${summary.dominantAxis.label}(${summary.dominantAxis.count}회)`}
          </div>
        </div>
        <div className="text-xl text-indigo-500">{expanded ? "▲" : "▼"}</div>
      </button>

      {expanded && (
        <div className="p-4 border-t border-indigo-200 bg-white/60 backdrop-blur space-y-4">
          {/* 월간/연간 토글 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 p-1 bg-white rounded-lg shadow-sm">
              <button onClick={() => setMode("month")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
                  mode === "month" ? "bg-indigo-600 text-white shadow" : "text-slate-500 hover:text-slate-700"
                }`}>
                📅 월간
              </button>
              <button onClick={() => setMode("year")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
                  mode === "year" ? "bg-indigo-600 text-white shadow" : "text-slate-500 hover:text-slate-700"
                }`}>
                📆 연간
              </button>
            </div>
            <div className="text-[10px] text-indigo-600">
              💡 태그만 있어도 자동 계산됨
            </div>
          </div>

          {sessions.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500 bg-white rounded-lg">
              세션 기록이 없어 미리보기가 비어있습니다. 위에서 첫 세션을 추가해보세요.
            </div>
          ) : (
            <>
              {/* ═══ 6축 레이더 차트 (Fallback 100% 채움) ═══ */}
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <h5 className="text-xs font-bold text-slate-800 mb-2">🕸 6축 성장 레이더 (Fallback 적용)</h5>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={radarData} margin={{ top: 8, right: 40, bottom: 8, left: 40 }}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: "#334155" }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: "#94a3b8" }} />
                    <Radar name="성장 점수" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
                    <Tooltip formatter={(v: any) => `${v}점`} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  </RadarChart>
                </ResponsiveContainer>

                {/* 축별 데이터 출처 배지 */}
                <div className="grid grid-cols-3 gap-1.5 mt-2">
                  {radar.map(r => {
                    const badgeColor = r.source === "measured"
                      ? "bg-emerald-100 text-emerald-700"
                      : r.source === "tag"
                      ? "bg-sky-100 text-sky-700"
                      : "bg-slate-100 text-slate-500";
                    const badgeLabel = r.source === "measured"
                      ? `실측 ${r.measuredDays}회`
                      : r.source === "tag"
                      ? `태그 ${r.tagCount}회`
                      : "기본값";
                    return (
                      <div key={r.axis} className="flex items-center justify-between text-[10px] px-2 py-1 bg-slate-50 rounded">
                        <span className="font-semibold" style={{ color: r.color }}>{r.label}</span>
                        <div className="flex items-center gap-1">
                          <span className={`px-1 py-0.5 rounded ${badgeColor}`}>{badgeLabel}</span>
                          <b className="text-slate-700">{r.score}</b>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ═══ 시계열 라인 (LOCF Fallback) ═══ */}
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <h5 className="text-xs font-bold text-slate-800 mb-2">
                  📈 {mode === "month" ? "월별" : "연도별"} 성장 추이 (LOCF Fallback)
                </h5>
                {timeSeries.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={timeSeries} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#64748b" }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: any) => `${v}점`} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      {AXES.map(a => (
                        <Line key={a} type="monotone" dataKey={a}
                          name={RADAR_AXIS_META[a].label}
                          stroke={RADAR_AXIS_META[a].color} strokeWidth={2}
                          dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-6 text-xs text-slate-400">시계열 데이터 없음</div>
                )}
                <div className="text-[10px] text-slate-500 mt-1">
                  💡 수치 없는 날은 직전 값을 유지(LOCF) + 태그 지수로 보간되어 <b>선이 절대 끊기지 않습니다</b>.
                </div>
              </div>

              {/* ═══ 활동량 스택바 (태그만으로 100% 렌더링) ═══ */}
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <h5 className="text-xs font-bold text-slate-800 mb-2">
                  🎯 {mode === "month" ? "월별" : "연도별"} 영역별 활동량 (태그 기반)
                </h5>
                {activity.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={activity} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: any) => `${v}회`} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      {AXES.map(a => (
                        <Bar key={a} dataKey={a} stackId="axis"
                          name={RADAR_AXIS_META[a].label}
                          fill={RADAR_AXIS_META[a].color} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-6 text-xs text-slate-400">활동 태그 없음</div>
                )}
              </div>

              {/* ═══ 요약 카드 ═══ */}
              <div className="grid grid-cols-2 gap-2">
                {summary.strongestAxis && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="text-[10px] font-bold text-emerald-700">💪 강점 영역</div>
                    <div className="text-sm font-black text-emerald-900 mt-0.5">
                      {summary.strongestAxis.label} <span className="text-xs">({summary.strongestAxis.score}점)</span>
                    </div>
                  </div>
                )}
                {summary.weakestAxis && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="text-[10px] font-bold text-amber-700">🎯 집중 영역</div>
                    <div className="text-sm font-black text-amber-900 mt-0.5">
                      {summary.weakestAxis.label} <span className="text-xs">({summary.weakestAxis.score}점)</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
