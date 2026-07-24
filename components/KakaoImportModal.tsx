"use client";

import { useRef, useState } from "react";
import { X, Upload, MessageSquare, CheckCircle2, AlertCircle, Loader2, FileText, Calendar } from "lucide-react";

/* ============================================================
   v3.15.1 - 카카오톡 대화 파일 업로드 → 세션 자동 생성 모달
============================================================ */

interface Props {
  memberId: string;
  memberName: string;
  staffId?: string;
  onClose: () => void;
  onImported: () => void;
}

interface ParsedSession {
  date: string;
  weekday: string;
  status: "attended" | "cancelled" | "sick" | "absent" | "makeup";
  activities: string[];
  memo: string;
  parent_messages: string[];
  tags: string[];
  raw_body: string;
}

interface ParseResult {
  member_name?: string;
  period_start: string;
  period_end: string;
  total_days: number;
  sessions: ParsedSession[];
  summary: {
    attended: number;
    cancelled: number;
    sick: number;
    absent: number;
  };
}

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  attended:   { label: "출석",  color: "bg-green-100 text-green-800 border-green-300",   icon: "✓" },
  makeup:     { label: "보강",  color: "bg-teal-100 text-teal-800 border-teal-300",       icon: "🔄" },
  sick:       { label: "병결",  color: "bg-orange-100 text-orange-800 border-orange-300", icon: "🏥" },
  cancelled:  { label: "취소",  color: "bg-red-100 text-red-800 border-red-300",         icon: "✗" },
  absent:     { label: "결석",  color: "bg-gray-100 text-gray-700 border-gray-300",       icon: "-" },
};

export default function KakaoImportModal({ memberId, memberName, staffId, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<any | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [skipDup, setSkipDup] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");

  async function handleFile(f: File) {
    setFile(f);
    setError("");
    setResult(null);
    setImported(null);
    setParsing(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch("/api/kakao/parse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "파싱 실패");
      setResult(data);
      // 기본적으로 출석/보강만 선택
      const preselect = new Set<string>();
      data.sessions.forEach((s: ParsedSession) => {
        if (s.status === "attended" || s.status === "makeup" || s.status === "sick") {
          preselect.add(s.date);
        }
      });
      setSelected(preselect);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setParsing(false);
    }
  }

  async function doImport() {
    if (!result) return;
    const chosen = result.sessions.filter((s) => selected.has(s.date));
    if (chosen.length === 0) { alert("선택된 세션이 없습니다"); return; }
    if (!confirm(`${chosen.length}개 세션을 자동 등록할까요?\n(회원: ${memberName})`)) return;

    setImporting(true);
    setError("");
    try {
      const res = await fetch("/api/kakao/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: memberId,
          sessions: chosen,
          staff_id: staffId,
          skip_duplicates: skipDup,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "임포트 실패");
      setImported(data);
      setTimeout(() => onImported(), 1500);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setImporting(false);
    }
  }

  function toggle(date: string) {
    const next = new Set(selected);
    if (next.has(date)) next.delete(date); else next.add(date);
    setSelected(next);
  }

  function toggleAll(status: string) {
    if (!result) return;
    const next = new Set(selected);
    const targets = result.sessions.filter((s) => !status || s.status === status);
    const allSelected = targets.every((t) => next.has(t.date));
    targets.forEach((t) => {
      if (allSelected) next.delete(t.date);
      else next.add(t.date);
    });
    setSelected(next);
  }

  const filteredSessions = result?.sessions.filter((s) => !filterStatus || s.status === filterStatus) || [];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 md:p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-yellow-50 to-yellow-100 sticky top-0 z-10">
          <div>
            <div className="text-lg font-bold text-yellow-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" /> 카카오톡 파일 → 세션 자동 등록
            </div>
            <div className="text-xs text-gray-600 mt-0.5">회원: <b>{memberName}</b> · PC 카카오톡에서 export한 .txt 파일 업로드</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-yellow-200 rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 파일 업로드 */}
          {!result && (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className="border-2 border-dashed border-yellow-300 rounded-2xl p-10 text-center cursor-pointer hover:bg-yellow-50 transition"
            >
              <Upload className="w-12 h-12 mx-auto text-yellow-500 mb-2" />
              <div className="font-bold text-gray-700">.txt 파일을 드래그하거나 클릭하여 업로드</div>
              <div className="text-xs text-gray-500 mt-1">
                PC 카카오톡 → 대화방 → 우측 상단 ⋮ → 대화 내용 내보내기 → 텍스트만 → .txt
              </div>
              {file && !parsing && (
                <div className="mt-3 text-sm text-yellow-800">📎 {file.name} ({(file.size / 1024).toFixed(1)} KB)</div>
              )}
              {parsing && (
                <div className="mt-3 flex items-center justify-center gap-2 text-sm text-yellow-700">
                  <Loader2 className="w-4 h-4 animate-spin" /> 파싱 중...
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          )}

          {/* 오류 */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <div>
                <b>오류:</b> {error}
                {error.includes("sessions 테이블") && (
                  <div className="mt-1 text-xs">
                    → Supabase SQL Editor에서 <code className="bg-red-100 px-1 rounded">AQUNOTE_V315_SESSIONS.sql</code> 실행 필요
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 임포트 완료 */}
          {imported && (
            <div className="p-4 bg-green-50 border-2 border-green-300 rounded-xl">
              <div className="font-bold text-green-800 flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5" /> 자동 등록 완료
              </div>
              <div className="text-sm text-green-700 space-y-1">
                <div>• 회원: <b>{imported.member_name}</b></div>
                <div>• 세션 기록: <b>{imported.inserted_sessions}건</b> 신규 등록</div>
                <div>• 출결 기록: <b>{imported.inserted_attendance}건</b> 자동 반영</div>
                {imported.skipped_duplicates > 0 && <div>• 중복 스킵: {imported.skipped_duplicates}건</div>}
                {imported.errors?.length > 0 && (
                  <div className="mt-2 p-2 bg-orange-50 rounded text-xs text-orange-800">
                    {imported.errors.map((e: string, i: number) => <div key={i}>⚠️ {e}</div>)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 파싱 결과 */}
          {result && !imported && (
            <>
              {/* 요약 */}
              <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200 rounded-2xl p-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                  <Stat title="전체 대화일" val={result.total_days + "일"} color="text-gray-700" />
                  <Stat title="✓ 출석" val={result.summary.attended} color="text-green-600" />
                  <Stat title="🏥 병결" val={result.summary.sick} color="text-orange-600" />
                  <Stat title="✗ 취소" val={result.summary.cancelled} color="text-red-600" />
                  <Stat title="- 결석" val={result.summary.absent} color="text-gray-500" />
                </div>
                <div className="text-xs text-gray-600 mt-3 flex items-center justify-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {result.period_start} ~ {result.period_end}
                  {result.member_name && <span className="ml-2">· 파일명 회원: <b>{result.member_name}</b></span>}
                </div>
              </div>

              {/* 필터 + 옵션 */}
              <div className="flex flex-wrap items-center gap-2 bg-gray-50 rounded-xl p-3">
                <span className="text-xs font-bold text-gray-700">필터:</span>
                <button onClick={() => setFilterStatus("")}
                  className={`px-2 py-1 rounded text-xs ${filterStatus === "" ? "bg-yellow-600 text-white" : "bg-white border"}`}>전체</button>
                {Object.entries(STATUS_META).map(([k, v]) => (
                  <button key={k} onClick={() => setFilterStatus(k)}
                    className={`px-2 py-1 rounded text-xs ${filterStatus === k ? "bg-yellow-600 text-white" : "bg-white border"}`}>
                    {v.icon} {v.label}
                  </button>
                ))}
                <div className="flex-1" />
                <button onClick={() => toggleAll(filterStatus)}
                  className="px-2 py-1 rounded text-xs bg-yellow-600 text-white">전체 선택/해제</button>
                <label className="flex items-center gap-1 text-xs ml-2">
                  <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
                  기존 세션 있으면 스킵
                </label>
              </div>

              {/* 세션 리스트 */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="max-h-[400px] overflow-y-auto">
                  {filteredSessions.map((s) => {
                    const meta = STATUS_META[s.status];
                    const isSelected = selected.has(s.date);
                    return (
                      <div key={s.date}
                        onClick={() => toggle(s.date)}
                        className={`p-3 border-b border-gray-100 cursor-pointer hover:bg-yellow-50 transition ${isSelected ? "bg-yellow-50/60" : "bg-white"}`}>
                        <div className="flex items-start gap-3">
                          <input type="checkbox" checked={isSelected} onChange={() => toggle(s.date)}
                            className="mt-1" onClick={(e) => e.stopPropagation()} />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-mono text-sm font-bold">{s.date}</span>
                              <span className="text-xs text-gray-500">({s.weekday})</span>
                              <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${meta.color}`}>
                                {meta.icon} {meta.label}
                              </span>
                              {s.tags.slice(0, 3).map((t) => (
                                <span key={t} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full border">{t}</span>
                              ))}
                            </div>
                            {s.activities.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {s.activities.map((a) => (
                                  <span key={a} className="text-[10px] px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded border border-teal-200">
                                    {a}
                                  </span>
                                ))}
                              </div>
                            )}
                            {s.memo && (
                              <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap bg-gray-50 rounded p-2 leading-relaxed">
                                {s.memo.slice(0, 300)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="text-xs text-gray-500 text-center">
                💡 선택된 세션: <b className="text-yellow-700">{selected.size}건</b> / 전체 {result.sessions.length}건
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t bg-gray-50 p-4 flex justify-between items-center gap-2 sticky bottom-0">
          <div className="text-xs text-gray-500">
            {result ? "선택한 세션이 회원의 세션 기록·출결에 자동 등록됩니다" : ""}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">닫기</button>
            {result && !imported && (
              <button onClick={doImport} disabled={importing || selected.size === 0}
                className="px-5 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center gap-1">
                {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> 등록 중...</> : <><Upload className="w-4 h-4" /> {selected.size}건 자동 등록</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ title, val, color }: any) {
  return (
    <div>
      <div className="text-xs text-gray-600">{title}</div>
      <div className={`text-xl font-bold ${color}`}>{val}</div>
    </div>
  );
}
