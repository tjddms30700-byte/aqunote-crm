"use client";
export const dynamic = "force-dynamic";

// v3.21.0: 💧 수질·안전 관리 (Phase 4 – 관공서/보건소 제출용 디지털 관리대장)
// 일일 체크리스트: 수온(℃) · pH · 잔류염소(ppm) · 여과기 압력 · 비상장비 점검
// 이상 수치 자동 경고 + 월간 PDF/Excel(CSV) 다운로드

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import HomeButton from "@/components/HomeButton";
import DirectorOnly from "@/components/DirectorOnly";
import { Droplet, Download, Plus, X, Save, AlertTriangle, CheckCircle2, Thermometer, Gauge, ShieldCheck, Waves } from "lucide-react";

// 관공서 권장 기준 (수영장 수질 관리 기준 · 체육시설의 설치·이용에 관한 법률 시행규칙)
// ✨ v3.32.3: 아쿠 수중운동센터 실제 운영 온도(재활·수중운동 특화) 반영 - 수온 31~35℃
const STANDARDS = {
  temperature: { min: 31, max: 35, label: "수온(℃)", unit: "℃" },
  ph_level:    { min: 5.8, max: 8.6, label: "pH", unit: "" },
  chlorine_ppm:{ min: 0.4, max: 3.0, label: "잔류염소(ppm)", unit: "ppm" },
  pressure:    { min: 0.5, max: 2.5, label: "여과기 압력(bar)", unit: "bar" },
} as const;

type LogRow = {
  id?: string;
  check_date: string;
  check_time?: string;
  temperature?: number | null;
  ph_level?: number | null;
  chlorine_ppm?: number | null;
  pressure?: number | null;
  safety_equipment_status?: boolean;
  emergency_exit_ok?: boolean;
  aed_ok?: boolean;
  first_aid_ok?: boolean;
  inspector_name?: string | null;
  note?: string | null;
  created_at?: string;
};

function todayStr() { return new Date().toISOString().slice(0, 10); }
function nowTimeStr() { return new Date().toTimeString().slice(0, 5); }

function checkAbnormal(v: number | null | undefined, key: keyof typeof STANDARDS) {
  if (v === null || v === undefined || isNaN(Number(v))) return false;
  const s = STANDARDS[key];
  return Number(v) < s.min || Number(v) > s.max;
}

export default function FacilityPage() {
  return (
    <DirectorOnly>
      <FacilityPageInner />
    </DirectorOnly>
  );
}

function FacilityPageInner() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  // ✅ v3.26.10: hydration mismatch 방지
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  useEffect(() => { setSelectedMonth(todayStr().slice(0, 7)); }, []);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<LogRow>({
    check_date: todayStr(),
    check_time: nowTimeStr(),
    temperature: 29,
    ph_level: 7.2,
    chlorine_ppm: 0.8,
    pressure: 1.2,
    safety_equipment_status: true,
    emergency_exit_ok: true,
    aed_ok: false, // ✨ v3.32.3: AED는 필수 아님 - 기본값 false (미보유 상태)
    first_aid_ok: true,
    inspector_name: "",
    note: "",
  });

  useEffect(() => { loadLogs(); }, []);

  async function loadLogs() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("facility_water_logs")
        .select("*")
        .order("check_date", { ascending: false })
        .order("check_time", { ascending: false })
        .limit(200);
      if (error) {
        // 테이블이 없는 경우: 조용히 무시하고 안내
        console.warn("facility_water_logs 조회 실패(테이블 미존재 가능):", error.message);
        setLogs([]);
      } else {
        setLogs(data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function saveLog() {
    try {
      if (!form.check_date) { alert("점검일자를 입력해 주세요"); return; }
      if (!form.inspector_name) { alert("점검자명을 입력해 주세요"); return; }

      // 이상 수치 사전 경고
      const abnormals: string[] = [];
      (["temperature", "ph_level", "chlorine_ppm", "pressure"] as (keyof typeof STANDARDS)[]).forEach((k) => {
        const v = (form as any)[k];
        if (checkAbnormal(v, k)) {
          const s = STANDARDS[k];
          abnormals.push(`${s.label}: ${v}${s.unit} (기준 ${s.min}~${s.max})`);
        }
      });
      if (abnormals.length > 0) {
        const ok = confirm(`⚠️ 다음 항목이 기준을 벗어났습니다.\n\n${abnormals.join("\n")}\n\n그래도 저장할까요?`);
        if (!ok) return;
      }

      const payload: any = { ...form };
      // 숫자 필드 형변환
      ["temperature", "ph_level", "chlorine_ppm", "pressure"].forEach((k) => {
        if (payload[k] !== null && payload[k] !== undefined && payload[k] !== "") {
          payload[k] = Number(payload[k]);
        }
      });

      // 삽입 (누락 컬럼 자동 폴백 최대 5회)
      let tryPayload = { ...payload };
      let err: any = null;
      let inserted: any = null;
      for (let i = 0; i < 5; i++) {
        const r = await supabase.from("facility_water_logs").insert(tryPayload).select().single();
        err = r.error;
        inserted = r.data;
        if (!err) break;
        const msg = String(err.message || "");
        if (/row-level security|policy|permission denied/i.test(msg)) {
          throw new Error(`권한 오류(RLS): facility_water_logs 테이블 INSERT 정책이 필요합니다.\n\n상세: ${msg}`);
        }
        const m = /'([^']+)' column|column "([^"]+)"/.exec(msg);
        const missing = m?.[1] || m?.[2];
        if (missing && missing in tryPayload) {
          const { [missing]: _drop, ...rest } = tryPayload;
          tryPayload = { ...rest };
          continue;
        }
        if (/relation.*facility_water_logs.*does not exist/i.test(msg)) {
          throw new Error("facility_water_logs 테이블이 없습니다. SQL 마이그레이션을 먼저 실행해 주세요.");
        }
        throw new Error(msg);
      }
      if (err) throw err;

      if (inserted) setLogs((prev) => [inserted, ...prev]);
      setShowModal(false);
      alert("✅ 수질·안전 점검 로그가 저장되었습니다.");
      await loadLogs();
    } catch (e: any) {
      alert("저장 실패: " + (e?.message || e));
      console.error(e);
    }
  }

  async function deleteLog(id?: string) {
    if (!id) return;
    if (!confirm("이 로그를 삭제할까요?")) return;
    const { error } = await supabase.from("facility_water_logs").delete().eq("id", id);
    if (error) alert("삭제 실패: " + error.message);
    else loadLogs();
  }

  // 월간 필터
  const monthLogs = useMemo(
    () => logs.filter((l) => l.check_date?.startsWith(selectedMonth)),
    [logs, selectedMonth]
  );

  const kpi = useMemo(() => {
    const total = monthLogs.length;
    let abnormalCount = 0;
    monthLogs.forEach((l) => {
      (["temperature", "ph_level", "chlorine_ppm", "pressure"] as (keyof typeof STANDARDS)[]).forEach((k) => {
        if (checkAbnormal((l as any)[k], k)) abnormalCount++;
      });
    });
    const safetyOk = monthLogs.filter((l) => l.safety_equipment_status !== false).length;
    return { total, abnormalCount, safetyOk };
  }, [monthLogs]);

  // CSV(Excel 호환) 다운로드
  function downloadCsv() {
    const BOM = "\uFEFF";
    const header = ["점검일자", "점검시각", "수온(℃)", "pH", "잔류염소(ppm)", "여과기 압력(bar)", "비상구", "AED", "구급함", "안전장비 종합", "점검자", "특이사항"];
    const rows = monthLogs.map((l) => [
      l.check_date || "",
      l.check_time || "",
      l.temperature ?? "",
      l.ph_level ?? "",
      l.chlorine_ppm ?? "",
      l.pressure ?? "",
      l.emergency_exit_ok ? "정상" : "이상",
      l.aed_ok ? "정상" : "이상",
      l.first_aid_ok ? "정상" : "이상",
      l.safety_equipment_status ? "정상" : "이상",
      l.inspector_name || "",
      l.note || "",
    ]);
    const csv = BOM + [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `수질안전관리대장_${selectedMonth}_위례아쿠수중운동센터.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // PDF 다운로드 (인쇄 → PDF 저장)
  function downloadPdf() {
    window.print();
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white pb-16">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .print-page { padding: 12mm; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      <div className="max-w-6xl mx-auto px-4 pt-6 print-page">
        <div className="no-print flex items-center justify-between mb-4">
          <HomeButton />
          <Link href="/" className="text-xs text-slate-500 hover:underline">← 대시보드</Link>
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-600 flex items-center justify-center shadow-md">
            <Droplet className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900">💧 수질·안전 관리</h1>
            <p className="text-xs text-slate-500">일일 수질·안전 점검 · 관공서/보건소 제출용 월간 관리대장</p>
          </div>
        </div>

        {/* Action Bar */}
        <div className="no-print flex flex-wrap items-center justify-between gap-2 mt-5 mb-4">
          <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-2 rounded-lg border border-sky-200 text-sm bg-white" />
          <div className="flex flex-wrap gap-2">
            <button onClick={downloadCsv}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-emerald-700 shadow-sm">
              <Download className="w-4 h-4" /> 📥 월간 대장 Excel
            </button>
            <button onClick={downloadPdf}
              className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-slate-900 shadow-sm">
              <Download className="w-4 h-4" /> 📥 월간 대장 PDF
            </button>
            <button onClick={() => { setForm({ ...form, check_date: todayStr(), check_time: nowTimeStr() }); setShowModal(true); }}
              className="px-3 py-1.5 bg-sky-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-sky-700 shadow-sm">
              <Plus className="w-4 h-4" /> 일일 점검 입력
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KpiCard icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />} label={`${selectedMonth} 점검 건수`} value={`${kpi.total}건`} tone="emerald" />
          <KpiCard icon={<AlertTriangle className="w-5 h-5 text-amber-500" />} label="이상 수치 감지" value={`${kpi.abnormalCount}회`} tone="amber" />
          <KpiCard icon={<ShieldCheck className="w-5 h-5 text-blue-500" />} label="안전장비 정상" value={`${kpi.safetyOk}/${kpi.total}`} tone="blue" />
          <KpiCard icon={<Waves className="w-5 h-5 text-cyan-500" />} label="관공서 기준" value="PH 5.8~8.6 · 염소 0.4~3.0" tone="cyan" small />
        </div>

        {/* 기준 안내 */}
        <div className="no-print bg-sky-50/60 border border-sky-200 rounded-xl p-3 mb-4 text-[11px] text-slate-700">
          <b className="text-sky-800">📋 아쿠 수중운동센터 운영 기준</b> · 수온 31~35℃ · pH 5.8~8.6 · 잔류염소 0.4~3.0ppm · 여과기 압력 0.5~2.5bar
          <span className="ml-2 text-slate-500">(체육시설의 설치·이용에 관한 법률 시행규칙)</span>
        </div>

        {/* 월간 관리대장 표 */}
        <div className="bg-white rounded-2xl shadow-md border border-sky-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-sky-100 bg-gradient-to-r from-sky-50 to-white flex items-center justify-between">
            <div className="text-sm font-bold text-slate-800">📊 {selectedMonth} 수질·안전 관리 대장</div>
            <div className="text-[11px] text-slate-500">위례아쿠수중운동센터 · 대표 하유정</div>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">불러오는 중...</div>
          ) : monthLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              {selectedMonth} 점검 이력이 아직 없습니다.
              <div className="mt-2 text-[11px]">최초 사용 시 SQL 마이그레이션이 필요합니다 (facility_water_logs 테이블).</div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-sky-50/60 text-[11px] text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2">일자</th>
                  <th className="text-left px-3 py-2">시각</th>
                  <th className="text-right px-3 py-2">수온</th>
                  <th className="text-right px-3 py-2">pH</th>
                  <th className="text-right px-3 py-2">염소</th>
                  <th className="text-right px-3 py-2">압력</th>
                  <th className="text-center px-3 py-2">안전장비</th>
                  <th className="text-left px-3 py-2">점검자</th>
                  <th className="text-left px-3 py-2 hidden md:table-cell">특이사항</th>
                  <th className="no-print w-8"></th>
                </tr>
              </thead>
              <tbody>
                {monthLogs.map((l) => (
                  <tr key={l.id} className="border-t border-sky-50 hover:bg-sky-50/30">
                    <td className="px-3 py-2 text-xs">{l.check_date}</td>
                    <td className="px-3 py-2 text-xs">{l.check_time || "-"}</td>
                    <NumericCell v={l.temperature} k="temperature" />
                    <NumericCell v={l.ph_level} k="ph_level" />
                    <NumericCell v={l.chlorine_ppm} k="chlorine_ppm" />
                    <NumericCell v={l.pressure} k="pressure" />
                    <td className="px-3 py-2 text-center">
                      {l.safety_equipment_status !== false ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">정상</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold">이상</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{l.inspector_name || "-"}</td>
                    <td className="px-3 py-2 text-xs text-slate-600 hidden md:table-cell">{l.note || "-"}</td>
                    <td className="no-print px-2">
                      <button onClick={() => deleteLog(l.id)} className="text-rose-400 hover:text-rose-600 text-xs">삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="print-only text-[10px] text-slate-500 text-right mt-4">
          발행: {new Date().toISOString().slice(0, 10)} · 아쿠수중운동센터 (680-04-03475)
        </div>
      </div>

      {/* 일일 점검 입력 모달 */}
      {showModal && (
        <div className="no-print fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-sky-900 flex items-center gap-2"><Droplet className="w-5 h-5" /> 일일 수질·안전 점검</h3>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="점검일자 *">
                  <input type="date" value={form.check_date}
                    onChange={(e) => setForm({ ...form, check_date: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-sky-200 text-sm" />
                </Field>
                <Field label="점검시각">
                  <input type="time" value={form.check_time || ""}
                    onChange={(e) => setForm({ ...form, check_time: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-sky-200 text-sm" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <NumField label="🌡️ 수온(℃)" v={form.temperature} k="temperature"
                  onChange={(v) => setForm({ ...form, temperature: v })} />
                <NumField label="💧 pH" v={form.ph_level} k="ph_level" step="0.1"
                  onChange={(v) => setForm({ ...form, ph_level: v })} />
                <NumField label="🧪 잔류염소(ppm)" v={form.chlorine_ppm} k="chlorine_ppm" step="0.1"
                  onChange={(v) => setForm({ ...form, chlorine_ppm: v })} />
                <NumField label="⚙️ 여과기 압력(bar)" v={form.pressure} k="pressure" step="0.1"
                  onChange={(v) => setForm({ ...form, pressure: v })} />
              </div>

              <div className="bg-sky-50/60 border border-sky-100 rounded-xl p-3">
                <div className="text-xs font-bold text-sky-800 mb-2">🛡️ 안전장비 점검</div>
                <div className="grid grid-cols-2 gap-1.5 text-sm">
                  <CheckBox label="비상구 개방 상태" checked={!!form.emergency_exit_ok} onChange={(v) => setForm({ ...form, emergency_exit_ok: v })} />
                  <CheckBox label="AED (자동제세동기) · 선택" checked={!!form.aed_ok} onChange={(v) => setForm({ ...form, aed_ok: v })} hint="미보유 시 체크 해제 (필수 아님)" />
                  <CheckBox label="구급함 상태" checked={!!form.first_aid_ok} onChange={(v) => setForm({ ...form, first_aid_ok: v })} />
                  <CheckBox label="종합: 안전장비 정상" checked={!!form.safety_equipment_status} onChange={(v) => setForm({ ...form, safety_equipment_status: v })} />
                </div>
              </div>

              <Field label="점검자명 *">
                <input value={form.inspector_name || ""}
                  onChange={(e) => setForm({ ...form, inspector_name: e.target.value })}
                  placeholder="예: 하유정"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-sky-200 text-sm" />
              </Field>

              <Field label="특이사항 / 조치 내용">
                <textarea value={form.note || ""}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  rows={2}
                  placeholder="예: 잔류염소 낮음 → 소독제 0.5kg 추가 투입 완료"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-sky-200 text-sm" />
              </Field>

              <button onClick={saveLog}
                className="w-full py-2.5 bg-gradient-to-r from-sky-600 to-cyan-600 text-white rounded-lg text-sm font-bold hover:from-sky-700 hover:to-cyan-700 flex items-center justify-center gap-1 shadow-sm">
                <Save className="w-4 h-4" /> 점검 로그 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ─────────────────────── helpers ─────────────────────── */

function KpiCard({ icon, label, value, tone, small }: { icon: any; label: string; value: string; tone: string; small?: boolean }) {
  const map: any = {
    emerald: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
    amber:   "border-amber-200 bg-gradient-to-br from-amber-50 to-white",
    blue:    "border-blue-200 bg-gradient-to-br from-blue-50 to-white",
    cyan:    "border-cyan-200 bg-gradient-to-br from-cyan-50 to-white",
  };
  return (
    <div className={`p-3 rounded-2xl border shadow-sm ${map[tone] || ""}`}>
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-[11px] text-slate-500">{label}</span></div>
      <div className={`font-black text-slate-900 ${small ? "text-xs" : "text-lg"}`}>{value}</div>
    </div>
  );
}

function NumericCell({ v, k }: { v: any; k: keyof typeof STANDARDS }) {
  if (v === null || v === undefined || v === "") return <td className="px-3 py-2 text-right text-xs text-slate-400">-</td>;
  const abn = checkAbnormal(v, k);
  const s = STANDARDS[k];
  return (
    <td className={`px-3 py-2 text-right text-xs font-semibold ${abn ? "text-rose-600" : "text-slate-800"}`}>
      {abn && <AlertTriangle className="w-3 h-3 inline-block mr-0.5 text-rose-500" />}
      {v}{s.unit && <span className="text-[9px] text-slate-400 ml-0.5">{s.unit}</span>}
    </td>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function NumField({ label, v, k, step, onChange }: { label: string; v: any; k: keyof typeof STANDARDS; step?: string; onChange: (val: number) => void }) {
  const abn = checkAbnormal(v, k);
  const s = STANDARDS[k];
  return (
    <div>
      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
        {label}
        {abn && <span className="text-[9px] px-1 rounded bg-rose-100 text-rose-700 font-bold">⚠️ 기준 외</span>}
      </label>
      <input type="number" step={step || "0.1"} value={v ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${abn ? "border-rose-300 bg-rose-50" : "border-sky-200"}`} />
      <div className="text-[9px] text-slate-400 mt-0.5">기준 {s.min}~{s.max}{s.unit}</div>
    </div>
  );
}

function CheckBox({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-1.5 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-sky-600 mt-0.5" />
      <span className="text-xs text-slate-700">
        {label}
        {hint && <span className="block text-[10px] text-slate-400 mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}
