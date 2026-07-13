"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import HomeButton from "@/components/HomeButton";
import { FileText, Download, User, Calendar, Printer, Loader2 } from "lucide-react";

const REPORT_TYPES = [
  { v: "daily",    label: "📝 일일 수업일지",     desc: "특정 날짜의 세션·활동 요약" },
  { v: "weekly",   label: "📅 주간 리포트",       desc: "1주일 활동·출결·행동 요약" },
  { v: "iep",      label: "🎯 IEP 보고서",       desc: "회원별 목표 진도 종합" },
  { v: "behavior", label: "🚨 행동중재 보고서",   desc: "문제행동 데이터·중재 효과" },
];

function todayStr() { return new Date().toISOString().slice(0,10); }
function weekAgoStr() {
  const d = new Date(); d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0,10);
}

export default function ReportsPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [type, setType] = useState<string>("daily");
  const [selectedMember, setSelectedMember] = useState<string>("");
  const [startDate, setStartDate] = useState(weekAgoStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [generating, setGenerating] = useState(false);
  const [reportHtml, setReportHtml] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("members").select("id, name, member_type, status")
        .is("deleted_at", null).eq("status", "regular").order("name");
      setMembers(data || []);
      if (data && data.length > 0) setSelectedMember(data[0].id);
    })();
  }, []);

  async function generate() {
    if (!selectedMember) { alert("회원을 선택하세요"); return; }
    setGenerating(true);
    try {
      const member = members.find(m => m.id === selectedMember);

      // 데이터 조회
      const [sessionsRes, iepRes, progressRes, behaviorsRes, behavRecRes, attRes] = await Promise.all([
        supabase.from("members").select("extra, memo").eq("id", selectedMember).single(),
        supabase.from("iep_goals").select("*").eq("member_id", selectedMember),
        supabase.from("iep_progress_records").select("*").eq("member_id", selectedMember)
          .gte("record_date", startDate).lte("record_date", endDate),
        supabase.from("problem_behaviors").select("*").eq("member_id", selectedMember),
        supabase.from("behavior_records").select("*").eq("member_id", selectedMember)
          .gte("record_date", startDate).lte("record_date", endDate),
        supabase.from("attendance").select("*").eq("member_id", selectedMember)
          .gte("attend_date", startDate).lte("attend_date", endDate),
      ]);

      const sessions = (sessionsRes.data?.extra?.sessions || []).filter((s: any) =>
        s.date >= startDate && s.date <= endDate
      );
      const goals = iepRes.data || [];
      const progress = progressRes.data || [];
      const behaviors = behaviorsRes.data || [];
      const behRecords = behavRecRes.data || [];
      const attendance = attRes.data || [];

      const html = generateHtml(type, {
        member, sessions, goals, progress, behaviors, behRecords, attendance,
        startDate, endDate,
      });

      setReportHtml(html);

      // DB에 저장
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      await supabase.from("reports").insert({
        org_id: orgId,
        member_id: selectedMember,
        report_type: type,
        title: `${member?.name} - ${REPORT_TYPES.find(t => t.v === type)?.label} (${startDate}~${endDate})`,
        period_start: startDate,
        period_end: endDate,
        html_content: html,
      });
    } catch (e: any) {
      alert("생성 실패: " + e.message);
    } finally {
      setGenerating(false);
    }
  }

  function downloadHtml() {
    if (!reportHtml) return;
    const blob = new Blob([reportHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report_${todayStr()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printReport() {
    if (!reportHtml) return;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(reportHtml);
      w.document.close();
      setTimeout(() => w.print(), 500);
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-3 md:px-6 py-6 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
          <FileText className="w-6 h-6 md:w-7 md:h-7 text-blue-500" /> 보고서 생성
        </h1>
        <HomeButton />
      </div>

      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-5 mb-5">
        {/* 보고서 종류 */}
        <div className="mb-4">
          <label className="text-sm font-bold text-aqu-900 mb-2 block">1. 보고서 종류 선택</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {REPORT_TYPES.map(t => (
              <button key={t.v} onClick={() => setType(t.v)}
                className={`p-3 rounded-lg text-left border-2 transition ${type === t.v ? "border-aqu-500 bg-aqu-50" : "border-gray-200 hover:border-aqu-300"}`}>
                <div className="text-sm font-bold">{t.label}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 회원 & 기간 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">회원</label>
            <select value={selectedMember} onChange={e => setSelectedMember(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">시작일</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">종료일</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
        </div>

        <button onClick={generate} disabled={generating || !selectedMember}
          className="w-full py-3 bg-gradient-to-r from-aqu-500 to-blue-600 hover:from-aqu-600 hover:to-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">
          {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
          {generating ? "생성 중..." : "보고서 생성"}
        </button>
      </div>

      {/* 미리보기 */}
      {reportHtml && (
        <div className="bg-white rounded-2xl shadow-md border border-aqu-100 overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b bg-gray-50">
            <div className="text-sm font-bold text-aqu-900">📄 미리보기</div>
            <div className="flex gap-2">
              <button onClick={printReport}
                className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1">
                <Printer className="w-3.5 h-3.5" /> 인쇄
              </button>
              <button onClick={downloadHtml}
                className="text-xs px-3 py-1.5 bg-aqu-600 hover:bg-aqu-700 text-white rounded-lg flex items-center gap-1">
                <Download className="w-3.5 h-3.5" /> HTML 다운로드
              </button>
            </div>
          </div>
          <iframe srcDoc={reportHtml} className="w-full h-[600px] bg-white" />
        </div>
      )}
    </main>
  );
}

/* ═════ 보고서 HTML 생성 ═════ */
function generateHtml(type: string, data: any) {
  const { member, sessions, goals, progress, behaviors, behRecords, attendance, startDate, endDate } = data;
  const title = `${member?.name || ""} - ${REPORT_TYPES.find(t => t.v === type)?.label}`;

  const baseStyle = `
    <style>
      body { font-family: 'Noto Sans KR', -apple-system, sans-serif; padding: 30px; color: #1f2937; line-height: 1.6; max-width: 900px; margin: 0 auto; }
      h1 { color: #0891b2; border-bottom: 3px solid #06b6d4; padding-bottom: 8px; }
      h2 { color: #0e7490; border-left: 4px solid #06b6d4; padding-left: 10px; margin-top: 30px; }
      h3 { color: #164e63; margin-top: 20px; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0; }
      th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
      th { background: #ecfeff; color: #0e7490; }
      .kpi { display: inline-block; padding: 10px 20px; background: #f0f9ff; border-radius: 8px; margin: 5px; }
      .kpi-val { font-size: 24px; font-weight: bold; color: #0891b2; }
      .kpi-label { font-size: 12px; color: #6b7280; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin: 2px; }
      .badge-blue { background: #dbeafe; color: #1e40af; }
      .badge-green { background: #d1fae5; color: #065f46; }
      .badge-yellow { background: #fef3c7; color: #92400e; }
      .badge-red { background: #fee2e2; color: #991b1b; }
      .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 11px; }
      .progress-bar { width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; }
      .progress-bar > div { height: 100%; background: linear-gradient(to right, #06b6d4, #0891b2); }
    </style>
  `;

  const header = `
    <h1>${title}</h1>
    <div style="color:#6b7280;font-size:14px;margin-bottom:20px;">
      📅 기간: ${startDate} ~ ${endDate}<br/>
      👤 대상: ${member?.name} (${member?.member_type === "child" ? "아동" : "성인"})<br/>
      🌊 아쿠수중운동센터
    </div>
  `;

  let content = "";

  if (type === "daily" || type === "weekly") {
    // 세션 요약
    content += `<h2>📝 세션 활동 요약</h2>`;
    if (sessions.length === 0) {
      content += `<p style="color:#9ca3af;">이 기간에 기록된 세션이 없습니다.</p>`;
    } else {
      content += `<table><thead><tr><th>날짜</th><th>활동 라벨</th><th>메모</th></tr></thead><tbody>`;
      sessions.forEach((s: any) => {
        content += `<tr><td>${s.date}</td><td>${(s.labels || []).map((l: string) => `<span class="badge badge-blue">${l}</span>`).join("")}</td><td>${s.memo || "-"}</td></tr>`;
      });
      content += `</tbody></table>`;
    }

    // 출결
    if (attendance.length > 0) {
      content += `<h2>✓ 출결 기록</h2>`;
      const statusCount = { present: 0, absent: 0, sick: 0 };
      attendance.forEach((a: any) => { if (statusCount[a.status as keyof typeof statusCount] !== undefined) statusCount[a.status as keyof typeof statusCount]++; });
      content += `<div class="kpi"><div class="kpi-label">출석</div><div class="kpi-val">${statusCount.present}</div></div>`;
      content += `<div class="kpi"><div class="kpi-label">결석</div><div class="kpi-val">${statusCount.absent}</div></div>`;
      content += `<div class="kpi"><div class="kpi-label">병결</div><div class="kpi-val">${statusCount.sick}</div></div>`;
    }
  }

  if (type === "iep" || type === "weekly") {
    // IEP 목표
    content += `<h2>🎯 IEP 목표 현황</h2>`;
    if (goals.length === 0) {
      content += `<p style="color:#9ca3af;">등록된 IEP 목표가 없습니다.</p>`;
    } else {
      goals.forEach((g: any) => {
        const goalRecords = progress.filter((p: any) => p.goal_id === g.id);
        const avgRate = goalRecords.length > 0
          ? goalRecords.reduce((s: number, r: any) => s + Number(r.success_rate || 0), 0) / goalRecords.length
          : 0;
        content += `
          <h3>${g.title}</h3>
          <div style="margin-bottom:8px;">
            <span class="badge badge-${g.status === "achieved" ? "green" : "blue"}">${g.status === "achieved" ? "달성" : g.status === "in_progress" ? "진행중" : g.status}</span>
            <span class="badge badge-yellow">${g.goal_type === "long" ? "장기" : "단기"}</span>
            <span style="font-size:12px;color:#6b7280;">진도: ${g.progress_percent || 0}%</span>
          </div>
          <div class="progress-bar"><div style="width:${g.progress_percent || 0}%;"></div></div>
          ${g.description ? `<p style="font-size:12px;color:#6b7280;">${g.description}</p>` : ""}
          ${g.target_criteria ? `<p style="font-size:12px;"><b>성취 기준:</b> ${g.target_criteria}</p>` : ""}
          ${goalRecords.length > 0 ? `<p style="font-size:12px;"><b>기록 ${goalRecords.length}회 · 평균 성공률 ${avgRate.toFixed(1)}%</b></p>` : ""}
        `;
      });
    }
  }

  if (type === "behavior" || type === "weekly") {
    // 행동중재
    content += `<h2>🚨 행동중재 현황</h2>`;
    if (behaviors.length === 0) {
      content += `<p style="color:#9ca3af;">등록된 문제행동이 없습니다.</p>`;
    } else {
      behaviors.forEach((b: any) => {
        const recs = behRecords.filter((r: any) => r.behavior_id === b.id);
        const totalFreq = recs.reduce((s: number, r: any) => s + (r.frequency || 1), 0);
        content += `
          <h3>${b.name}</h3>
          <div style="margin-bottom:8px;">
            <span class="badge badge-${b.severity === "high" || b.severity === "crisis" ? "red" : b.severity === "medium" ? "yellow" : "blue"}">${b.severity}</span>
          </div>
          ${b.operational_definition ? `<p style="font-size:12px;"><b>조작적 정의:</b> ${b.operational_definition}</p>` : ""}
          ${b.intervention_plan ? `<p style="font-size:12px;"><b>중재 계획:</b> ${b.intervention_plan}</p>` : ""}
          <p style="font-size:12px;"><b>기간 발생: ${recs.length}건 (총 ${totalFreq}회)</b></p>
        `;
      });
    }
  }

  const footer = `
    <div class="footer">
      🌊 이 보고서는 AQUNOTE에서 자동 생성되었습니다 · 생성일: ${new Date().toLocaleString("ko-KR")}
    </div>
  `;

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title>${baseStyle}</head><body>${header}${content}${footer}</body></html>`;
}
