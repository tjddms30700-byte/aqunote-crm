"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import HomeButton from "@/components/HomeButton";
import { supabase } from "@/lib/supabase";
import {
  Database, Download, Cloud, Clock, Shield, CheckCircle2,
  AlertCircle, RefreshCw, FileArchive, Trash2, Play
} from "lucide-react";

/* ============================================================
   v3.15.0 - 자동 백업 관리
   - 매일 새벽 DB 스냅샷(JSON) 자동 저장 → backups 테이블
   - 수동 백업 실행 (즉시)
   - 백업 이력 조회 · 다운로드 · 삭제
   - Google Drive / S3 연동 안내
============================================================ */

// 백업 대상 테이블 (핵심 데이터)
const BACKUP_TABLES = [
  "members", "staff", "payments", "memberships", "attendance",
  "schedule_slots", "slot_matrix", "incidents", "documents",
  "consultation_charts", "iep_goals", "behavior_records",
  "aqua_assessments", "leads_inbox", "organizations", "plans",
];

export default function BackupPage() {
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);

  useEffect(() => {
    loadBackups();
    // 로컬 스케줄 확인 (브라우저가 열려있을 때 자동 실행)
    const en = localStorage.getItem("aqunote_backup_auto") === "1";
    setScheduleEnabled(en);
    if (en) startAutoSchedule();
  }, []);

  async function loadBackups() {
    setLoading(true);
    const { data, error } = await supabase
      .from("backups")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      if (error.message?.includes("does not exist") || error.code === "42P01" || error.code === "PGRST205") {
        alert("⚠️ backups 테이블이 없습니다.\nAQUNOTE_V315_BACKUP.sql을 Supabase SQL Editor에서 실행하세요.");
      }
      setBackups([]);
    } else {
      setBackups(data || []);
    }
    setLoading(false);
  }

  async function runBackup(auto = false) {
    if (running) return;
    setRunning(true);
    setProgress("백업 시작...");
    const startTime = Date.now();

    try {
      const snapshot: Record<string, any> = {};
      const counts: Record<string, number> = {};
      let totalRows = 0;

      for (const t of BACKUP_TABLES) {
        setProgress(`📦 ${t} 백업 중...`);
        const { data, error } = await supabase.from(t).select("*");
        if (error) {
          console.warn(`skip ${t}: ${error.message}`);
          continue;
        }
        snapshot[t] = data || [];
        counts[t] = (data || []).length;
        totalRows += counts[t];
      }

      const jsonStr = JSON.stringify({
        version: "3.15.0",
        created_at: new Date().toISOString(),
        counts,
        data: snapshot,
      });
      const sizeBytes = new Blob([jsonStr]).size;

      setProgress("💾 DB에 저장 중...");
      const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;

      const { error: insErr } = await supabase.from("backups").insert({
        org_id: orgId,
        backup_type: auto ? "auto" : "manual",
        table_counts: counts,
        total_rows: totalRows,
        size_bytes: sizeBytes,
        payload: snapshot,
        duration_ms: Date.now() - startTime,
        status: "success",
      });

      if (insErr) throw insErr;

      setProgress(`✅ 백업 완료: ${totalRows.toLocaleString()}행 · ${(sizeBytes / 1024).toFixed(1)}KB`);
      await loadBackups();
      setTimeout(() => setProgress(""), 3000);
    } catch (e: any) {
      setProgress(`❌ 백업 실패: ${e.message || e}`);
      alert("백업 실패: " + (e.message || e));
    } finally {
      setRunning(false);
    }
  }

  function startAutoSchedule() {
    // 매 6시간마다 자동 백업 (브라우저 열려있을 때)
    // @ts-ignore
    if (window.__aqunote_backup_timer) clearInterval(window.__aqunote_backup_timer);
    // @ts-ignore
    window.__aqunote_backup_timer = setInterval(() => {
      const last = localStorage.getItem("aqunote_backup_last");
      const now = Date.now();
      if (!last || now - Number(last) > 6 * 60 * 60 * 1000) {
        localStorage.setItem("aqunote_backup_last", String(now));
        runBackup(true);
      }
    }, 30 * 60 * 1000); // 30분마다 체크
  }

  function toggleAutoSchedule() {
    const next = !scheduleEnabled;
    setScheduleEnabled(next);
    if (next) {
      localStorage.setItem("aqunote_backup_auto", "1");
      startAutoSchedule();
      alert("✅ 브라우저 자동 백업 활성화\n(브라우저 열려있는 동안 6시간마다 자동 실행)");
    } else {
      localStorage.setItem("aqunote_backup_auto", "0");
      // @ts-ignore
      if (window.__aqunote_backup_timer) clearInterval(window.__aqunote_backup_timer);
    }
  }

  async function downloadBackup(id: string) {
    const { data, error } = await supabase.from("backups").select("*").eq("id", id).single();
    if (error) { alert("다운로드 실패: " + error.message); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aqunote_backup_${data.created_at.slice(0, 19).replace(/[:T]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function deleteBackup(id: string) {
    if (!confirm("이 백업을 삭제할까요?")) return;
    const { error } = await supabase.from("backups").delete().eq("id", id);
    if (error) alert("삭제 실패: " + error.message);
    else await loadBackups();
  }

  const totalSize = backups.reduce((s, b) => s + (b.size_bytes || 0), 0);
  const lastBackup = backups[0];
  const daysSinceLastBackup = lastBackup
    ? Math.floor((Date.now() - new Date(lastBackup.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-10">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <HomeButton />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-indigo-700 flex items-center gap-2">
              <Database className="w-7 h-7" /> 자동 백업
            </h1>
            <p className="text-xs md:text-sm text-gray-500 mt-0.5">
              데이터 손실 방지 · JSON 스냅샷 · Google Drive/S3 연동 가능
            </p>
          </div>
        </div>
        <button
          onClick={() => runBackup(false)}
          disabled={running}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-md"
        >
          {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? "백업 중..." : "지금 백업"}
        </button>
      </div>

      {/* Progress */}
      {progress && (
        <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-800 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          {progress}
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KPI title="총 백업" val={backups.length + "개"} icon="📦" color="text-indigo-600" />
        <KPI title="총 용량" val={(totalSize / 1024 / 1024).toFixed(2) + " MB"} icon="💾" color="text-purple-600" />
        <KPI
          title="최근 백업"
          val={daysSinceLastBackup === null ? "없음" : daysSinceLastBackup === 0 ? "오늘" : `${daysSinceLastBackup}일 전`}
          icon="⏱️"
          color={daysSinceLastBackup === null || daysSinceLastBackup > 7 ? "text-red-600" : "text-green-600"}
        />
        <KPI
          title="자동 백업"
          val={scheduleEnabled ? "ON" : "OFF"}
          icon={scheduleEnabled ? "🟢" : "⭕"}
          color={scheduleEnabled ? "text-green-600" : "text-gray-500"}
        />
      </div>

      {/* Auto Schedule Toggle */}
      <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 p-4 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="font-bold text-indigo-900 flex items-center gap-2">
              <Clock className="w-5 h-5" /> 브라우저 자동 백업 스케줄
            </div>
            <div className="text-xs text-gray-500 mt-1">
              활성화 시 이 브라우저가 열려있는 동안 <b>6시간마다 자동 백업</b>이 실행됩니다.<br />
              완전한 24/7 자동 백업은 아래 "Supabase Cron 설정" 참고.
            </div>
          </div>
          <button
            onClick={toggleAutoSchedule}
            className={`px-4 py-2 rounded-xl text-sm font-bold ${scheduleEnabled ? "bg-green-600 text-white" : "bg-gray-200 text-gray-700"}`}
          >
            {scheduleEnabled ? "🟢 활성화됨" : "⭕ 비활성화"}
          </button>
        </div>
      </div>

      {/* Cloud Integration Guide */}
      <details className="bg-white rounded-2xl shadow-sm border border-indigo-100 p-4 mb-4">
        <summary className="cursor-pointer font-bold text-indigo-900 flex items-center gap-2">
          <Cloud className="w-5 h-5" /> Google Drive / S3 자동 업로드 설정 가이드
        </summary>
        <div className="mt-3 text-xs text-gray-700 space-y-3 leading-relaxed">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="font-bold text-blue-800 mb-1">🎯 방법 1: Supabase pg_cron + Storage (권장)</div>
            <div className="text-blue-700">
              1. Supabase Dashboard → Database → Extensions → pg_cron 활성화<br />
              2. 매일 새벽 3시 자동 실행 SQL 등록 (AQUNOTE_V315_BACKUP.sql 하단 참고)<br />
              3. Supabase Storage 버킷 `backups` 생성 → 파일 자동 저장
            </div>
          </div>
          <div className="p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="font-bold text-green-800 mb-1">🎯 방법 2: Vercel Cron + Google Drive API</div>
            <div className="text-green-700">
              1. `/api/backup/cron` 라우트 (본 zip에 포함) 배포<br />
              2. Vercel Dashboard → Settings → Cron Jobs → `0 3 * * *` (매일 03:00)<br />
              3. 환경변수: `GOOGLE_DRIVE_TOKEN`, `GOOGLE_DRIVE_FOLDER_ID`
            </div>
          </div>
          <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
            <div className="font-bold text-orange-800 mb-1">🎯 방법 3: AWS S3</div>
            <div className="text-orange-700">
              환경변수 `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` 등록 후<br />
              `/api/backup/cron` 라우트가 자동으로 S3에 업로드합니다.
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="font-bold text-gray-800 mb-1">💡 지금 당장 사용 가능한 방법</div>
            <div className="text-gray-700">
              위 방법이 복잡하다면 → "지금 백업" 버튼을 매일 클릭 + JSON 다운로드 → Google Drive 폴더에 수동 업로드.<br />
              또는 브라우저 자동 백업 ON + 다운로드 링크를 하루 1회 확인.
            </div>
          </div>
        </div>
      </details>

      {/* Backup List */}
      <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 overflow-hidden">
        <div className="px-4 py-3 border-b bg-indigo-50 flex items-center justify-between">
          <div className="font-bold text-indigo-900 flex items-center gap-2">
            <FileArchive className="w-5 h-5" /> 백업 이력
          </div>
          <button onClick={loadBackups} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> 새로고침
          </button>
        </div>
        {loading ? (
          <div className="text-center py-16 text-gray-400">로딩 중...</div>
        ) : backups.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Database className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>아직 백업 기록이 없습니다.</p>
            <p className="text-xs mt-1">"지금 백업" 버튼으로 첫 백업을 실행하세요.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-xs text-gray-600">
              <tr>
                <th className="p-3 text-left">일시</th>
                <th className="p-3 text-left">유형</th>
                <th className="p-3 text-right hidden md:table-cell">행 수</th>
                <th className="p-3 text-right">용량</th>
                <th className="p-3 text-center hidden md:table-cell">소요</th>
                <th className="p-3 text-center">상태</th>
                <th className="p-3 text-center">액션</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id} className="border-b border-gray-100 hover:bg-indigo-50/30">
                  <td className="p-3 font-mono text-xs">
                    {b.created_at?.replace("T", " ").slice(0, 19)}
                  </td>
                  <td className="p-3">
                    {b.backup_type === "auto" ? (
                      <span className="text-[11px] px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full font-semibold">🤖 자동</span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full font-semibold">✋ 수동</span>
                    )}
                  </td>
                  <td className="p-3 text-right font-mono text-xs hidden md:table-cell">
                    {(b.total_rows || 0).toLocaleString()}행
                  </td>
                  <td className="p-3 text-right font-mono text-xs">
                    {b.size_bytes ? (b.size_bytes / 1024).toFixed(1) + " KB" : "-"}
                  </td>
                  <td className="p-3 text-center text-xs text-gray-500 hidden md:table-cell">
                    {b.duration_ms ? (b.duration_ms / 1000).toFixed(1) + "s" : "-"}
                  </td>
                  <td className="p-3 text-center">
                    {b.status === "success" ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 mx-auto" />
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => downloadBackup(b.id)}
                        className="p-1.5 hover:bg-indigo-100 rounded text-indigo-700"
                        title="JSON 다운로드">
                        <Download className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteBackup(b.id)}
                        className="p-1.5 hover:bg-red-100 rounded text-red-600"
                        title="삭제">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 안전 안내 */}
      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-800">
        <Shield className="w-4 h-4 inline mr-1" />
        <b>백업 파일은 민감정보를 포함합니다.</b> 다운로드한 JSON은 개인 클라우드(Google Drive 등)의 <b>비공개 폴더</b>에만 보관하세요.
        30일 이상 지난 자동 백업은 자동 정리됩니다 (SQL 트리거).
      </div>
    </main>
  );
}

function KPI({ title, val, icon, color }: any) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 p-3 text-center">
      <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
        <span>{icon}</span> {title}
      </div>
      <div className={`text-xl md:text-2xl font-bold ${color} mt-1`}>{val}</div>
    </div>
  );
}
