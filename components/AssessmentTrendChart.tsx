"use client";

/**
 * ═══════════════════════════════════════════════════════════════
 * 📈 v3.45.0 평가 시계열 차트
 * ═══════════════════════════════════════════════════════════════
 * - 월간/연간 토글
 * - 라인차트: 시간축 점수 변화 (6개 축 다중 라인)
 * - 바차트: 최근 3회 비교 (항목별 색상)
 * - 활동량 스택바: 세션 태그 축별 누적
 * ═══════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from "recharts";
import {
  AXIS_META, MetricAxis, TrendPoint,
  buildTrendPoints, buildRecentComparison, buildSessionActivityTrend,
} from "@/lib/sessionMetrics";

interface Props {
  assessments: any[];
  sessions: any[];
}

const ALL_AXES: MetricAxis[] = ["balance", "rom", "gait", "respiration", "strength", "cognitive"];

export default function AssessmentTrendChart({ assessments, sessions }: Props) {
  const [mode, setMode] = useState<"month" | "year">("month");
  const [selectedAxes, setSelectedAxes] = useState<Set<MetricAxis>>(new Set(ALL_AXES));

  const trendData = useMemo(() => buildTrendPoints(assessments, mode), [assessments, mode]);
  const recentBars = useMemo(() => buildRecentComparison(assessments, 3), [assessments]);
  const activityTrend = useMemo(() => buildSessionActivityTrend(sessions, mode), [sessions, mode]);

  function toggleAxis(axis: MetricAxis) {
    setSelectedAxes(prev => {
      const next = new Set(prev);
      next.has(axis) ? next.delete(axis) : next.add(axis);
      return next;
    });
  }

  const hasTrend = trendData.length > 0;
  const hasBars = recentBars.length > 0;
  const hasActivity = activityTrend.length > 0;

  return (
    <div className="space-y-5">
      {/* ═══ 상단 컨트롤: 월간/연간 토글 + 축 필터 ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
        <div className="flex items-center gap-1.5 p-1 bg-white rounded-lg shadow-sm">
          <button onClick={() => setMode("month")}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
              mode === "month" ? "bg-aqu-600 text-white shadow" : "text-slate-500 hover:text-slate-700"
            }`}>
            📅 월간 추이
          </button>
          <button onClick={() => setMode("year")}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
              mode === "year" ? "bg-aqu-600 text-white shadow" : "text-slate-500 hover:text-slate-700"
            }`}>
            📆 연간 추이
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ALL_AXES.map(a => {
            const meta = AXIS_META[a];
            const active = selectedAxes.has(a);
            return (
              <button key={a} onClick={() => toggleAxis(a)}
                style={{ borderColor: active ? meta.color : "#e2e8f0", color: active ? meta.color : "#94a3b8" }}
                className={`px-2 py-1 rounded-full text-[11px] font-semibold border-2 transition ${
                  active ? "bg-white shadow-sm" : "bg-slate-50"
                }`}>
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ 1. 라인 차트: 시간축 점수 변화 ═══ */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
          📈 {mode === "month" ? "월별" : "연도별"} 항목별 점수 추이 <span className="text-[10px] text-slate-400">(정규화 0-100)</span>
        </h4>
        {hasTrend ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                formatter={(v: any) => v != null ? `${v}점` : "-"}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {ALL_AXES.filter(a => selectedAxes.has(a)).map(a => (
                <Line key={a} type="monotone" dataKey={a} name={AXIS_META[a].label.replace(/^[^\s]+ /, "")}
                  stroke={AXIS_META[a].color} strokeWidth={2}
                  dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-8 text-sm text-slate-400">
            저장된 평가 데이터가 없어 추이를 표시할 수 없습니다
          </div>
        )}
      </div>

      {/* ═══ 2. 바 차트: 최근 3회 항목별 비교 ═══ */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
          📊 최근 {recentBars.length}회 평가 항목별 비교
        </h4>
        {hasBars ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={recentBars} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                formatter={(v: any) => v != null ? `${v}점` : "-"}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {ALL_AXES.filter(a => selectedAxes.has(a)).map(a => (
                <Bar key={a} dataKey={a} name={AXIS_META[a].label.replace(/^[^\s]+ /, "")}
                  fill={AXIS_META[a].color} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-8 text-sm text-slate-400">
            비교할 평가 데이터가 부족합니다 (최소 1회 이상 필요)
          </div>
        )}
      </div>

      {/* ═══ 3. 세션 활동량 스택바 (기능 축별 태그 카운트) ═══ */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
          🎯 {mode === "month" ? "월별" : "연도별"} 세션 활동량 (태그 기반 자동 집계)
        </h4>
        {hasActivity ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={activityTrend} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                formatter={(v: any) => `${v}회`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {ALL_AXES.filter(a => selectedAxes.has(a)).map(a => (
                <Bar key={a} dataKey={a} name={AXIS_META[a].label.replace(/^[^\s]+ /, "")}
                  stackId="activity" fill={AXIS_META[a].color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-8 text-sm text-slate-400">
            분석 가능한 세션 태그가 없습니다
          </div>
        )}
      </div>

      {/* ═══ 4. 요약 KPI 카드 ═══ */}
      {hasTrend && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {ALL_AXES.filter(a => selectedAxes.has(a)).map(a => {
            const meta = AXIS_META[a];
            const latest = trendData[trendData.length - 1]?.[a];
            const first  = trendData[0]?.[a];
            const delta  = (latest != null && first != null) ? latest - first : null;
            return (
              <div key={a} className="p-3 rounded-xl border-2" style={{ borderColor: meta.color + "40", background: meta.color + "10" }}>
                <div className="text-[11px] font-bold" style={{ color: meta.color }}>{meta.label}</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-black text-slate-800">{latest != null ? latest.toFixed(1) : "-"}</span>
                  {delta != null && (
                    <span className={`text-[11px] font-bold ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-500" : "text-slate-400"}`}>
                      {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {Math.abs(delta).toFixed(1)}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">{meta.unit} · 최초 대비</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
