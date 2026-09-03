"use client";

/**
 * ═══════════════════════════════════════════════════════════════
 * 🚗 v3.47.0 - 차량운행일지 (국세청 업무용승용차 운행기록부 대응)
 * ═══════════════════════════════════════════════════════════════
 * 개인/법인사업자 렌트카의 손금·경비 처리를 위한 운행기록 모듈.
 * 1) 차량 기본 정보 관리 (다중 차량)
 * 2) 운행기록 등록 (계기판 before/after → 주행거리 자동 계산, 직전 계기판 자동 로드)
 * 3) 기간별 요약 + 국세청 표준 서식 Excel 다운로드 (xlsx 라이브러리 재사용)
 * ═══════════════════════════════════════════════════════════════
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Car, Plus, X, Trash2, Download, ChevronLeft, Pencil } from "lucide-react";

function todayStr() { return new Date().toISOString().slice(0, 10); }

const PURPOSES = [
  { v: "member",   label: "회원 픽업·이동" },
  { v: "business", label: "센터 업무출장" },
  { v: "commute",  label: "출퇴근" },
  { v: "general",  label: "일반업무" },
];
const purposeLabel = (v: string) => PURPOSES.find(p => p.v === v)?.label || v || "-";

const OWNERSHIPS = [
  { v: "rent",  label: "장기렌트" },
  { v: "lease", label: "리스" },
  { v: "own",   label: "자차" },
];
const ownershipLabel = (v: string) => OWNERSHIPS.find(o => o.v === v)?.label || v || "-";

const BIZ_TYPES = [
  { v: "personal",  label: "개인사업자" },
  { v: "corporate", label: "법인사업자" },
];
const bizLabel = (v: string) => BIZ_TYPES.find(b => b.v === v)?.label || v || "-";

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // 기간 필터 (기본: 올해)
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  useEffect(() => {
    const y = new Date().getFullYear();
    setRangeStart(`${y}-01-01`);
    setRangeEnd(todayStr());
  }, []);

  // 차량 등록/수정 모달
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any>(null);
  const [vehicleForm, setVehicleForm] = useState<any>({
    plate_number: "", model: "", ownership_type: "rent", biz_type: "personal",
  });

  // 운행기록 등록 모달
  const [showLogModal, setShowLogModal] = useState(false);
  const [logForm, setLogForm] = useState<any>({
    drive_date: todayStr(), driver_staff_id: "", before_km: 0, after_km: 0,
    purpose: "member", origin: "", destination: "",
    fuel_cost: 0, toll_cost: 0, parking_cost: 0, maintenance_cost: 0,
  });

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (rangeStart && rangeEnd) loadLogs(); }, [rangeStart, rangeEnd, selectedVehicle]);

  async function loadAll() {
    setLoading(true);
    const [vRes, sRes] = await Promise.all([
      supabase.from("vehicles").select("*").order("created_at"),
      supabase.from("staff").select("id, name").order("name"),
    ]);
    const vs = (vRes.data || []).filter((v: any) => v.is_active !== false);
    setVehicles(vs);
    setStaff(sRes.data || []);
    if (vs.length > 0 && !selectedVehicle) setSelectedVehicle(vs[0].id);
    setLoading(false);
    await loadLogs();
  }

  async function loadLogs() {
    if (!rangeStart || !rangeEnd) return;
    let q = supabase.from("vehicle_logs").select("*")
      .gte("drive_date", rangeStart).lte("drive_date", rangeEnd)
      .order("drive_date", { ascending: false }).order("created_at", { ascending: false });
    if (selectedVehicle) q = q.eq("vehicle_id", selectedVehicle);
    const { data } = await q;
    setLogs(data || []);
  }

  // ── 차량 저장 ──
  async function saveVehicle() {
    if (!vehicleForm.plate_number.trim()) return alert("차량번호를 입력해 주세요");
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const payload = {
      org_id: orgId,
      plate_number: vehicleForm.plate_number.trim(),
      model: vehicleForm.model?.trim() || null,
      ownership_type: vehicleForm.ownership_type,
      biz_type: vehicleForm.biz_type,
      is_active: true,
    };
    let r;
    if (editingVehicle?.id) {
      r = await supabase.from("vehicles").update(payload).eq("id", editingVehicle.id);
    } else {
      r = await supabase.from("vehicles").insert(payload);
    }
    if (r.error) {
      if (/relation .* does not exist|Could not find the table/i.test(r.error.message)) {
        return alert("⚠️ vehicles 테이블이 아직 없습니다.\n\n패키지에 포함된 supabase_migration_v3.47.0.sql 을 Supabase SQL Editor에서 먼저 실행해 주세요.");
      }
      return alert("차량 저장 실패: " + r.error.message);
    }
    setShowVehicleModal(false);
    setEditingVehicle(null);
    setVehicleForm({ plate_number: "", model: "", ownership_type: "rent", biz_type: "personal" });
    await loadAll();
  }

  // ── 차량 비활성화(삭제) ──
  async function deleteVehicle(v: any) {
    if (!confirm(`차량 [${v.plate_number}]을 삭제할까요?\n(운행기록도 함께 삭제됩니다)`)) return;
    await supabase.from("vehicle_logs").delete().eq("vehicle_id", v.id);
    await supabase.from("vehicles").delete().eq("id", v.id);
    if (selectedVehicle === v.id) setSelectedVehicle("");
    await loadAll();
  }

  // ── 운행기록 모달 열기: 직전 최종 계기판 자동 로드 ──
  async function openLogModal() {
    if (!selectedVehicle) return alert("먼저 차량을 등록해 주세요");
    const { data } = await supabase.from("vehicle_logs").select("after_km")
      .eq("vehicle_id", selectedVehicle)
      .order("drive_date", { ascending: false }).order("created_at", { ascending: false })
      .limit(1);
    const lastKm = data && data.length > 0 ? Number(data[0].after_km || 0) : 0;
    setLogForm({
      drive_date: todayStr(), driver_staff_id: staff[0]?.id || "",
      before_km: lastKm, after_km: lastKm,
      purpose: "member", origin: "", destination: "",
      fuel_cost: 0, toll_cost: 0, parking_cost: 0, maintenance_cost: 0,
    });
    setShowLogModal(true);
  }

  // ── 운행기록 저장 ──
  async function saveLog() {
    if (!logForm.driver_staff_id) return alert("운전자를 선택해 주세요");
    const before = Number(logForm.before_km || 0);
    const after = Number(logForm.after_km || 0);
    if (after < before) return alert("주행 후 계기판이 주행 전보다 작을 수 없습니다");
    const distance = after - before;
    if (distance <= 0) return alert("주행 후 계기판을 입력해 주세요 (주행거리가 0입니다)");
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const driver = staff.find(s => s.id === logForm.driver_staff_id);
    const payload = {
      org_id: orgId,
      vehicle_id: selectedVehicle,
      drive_date: logForm.drive_date,
      driver_staff_id: logForm.driver_staff_id,
      driver_name: driver?.name || "",
      before_km: before, after_km: after, distance_km: distance,
      purpose: logForm.purpose,
      origin: logForm.origin?.trim() || null,
      destination: logForm.destination?.trim() || null,
      fuel_cost: Number(logForm.fuel_cost || 0),
      toll_cost: Number(logForm.toll_cost || 0),
      parking_cost: Number(logForm.parking_cost || 0),
      maintenance_cost: Number(logForm.maintenance_cost || 0),
    };
    const r = await supabase.from("vehicle_logs").insert(payload);
    if (r.error) {
      if (/relation .* does not exist|Could not find the table/i.test(r.error.message)) {
        return alert("⚠️ vehicle_logs 테이블이 아직 없습니다.\n\n패키지에 포함된 supabase_migration_v3.47.0.sql 을 Supabase SQL Editor에서 먼저 실행해 주세요.");
      }
      return alert("운행기록 저장 실패: " + r.error.message);
    }
    setShowLogModal(false);
    await loadLogs();
  }

  async function deleteLog(l: any) {
    if (!confirm(`${l.drive_date} 운행기록(${l.distance_km}km)을 삭제할까요?`)) return;
    await supabase.from("vehicle_logs").delete().eq("id", l.id);
    await loadLogs();
  }

  // ── 요약 집계 ──
  const summary = useMemo(() => {
    const totalKm = logs.reduce((s, l) => s + Number(l.distance_km || 0), 0);
    const businessKm = logs.filter(l => ["member", "business", "general"].includes(l.purpose))
      .reduce((s, l) => s + Number(l.distance_km || 0), 0);
    const commuteKm = logs.filter(l => l.purpose === "commute")
      .reduce((s, l) => s + Number(l.distance_km || 0), 0);
    const totalCost = logs.reduce((s, l) =>
      s + Number(l.fuel_cost || 0) + Number(l.toll_cost || 0) + Number(l.parking_cost || 0) + Number(l.maintenance_cost || 0), 0);
    const businessRatio = totalKm > 0 ? Math.round((businessKm / totalKm) * 1000) / 10 : 0;
    return { totalKm, businessKm, commuteKm, totalCost, businessRatio, count: logs.length };
  }, [logs]);

  // ── 국세청 양식 Excel 다운로드 ──
  async function downloadExcel() {
    if (logs.length === 0) return alert("다운로드할 운행기록이 없습니다");
    const XLSX = await import("xlsx");
    const vehicle = vehicles.find(v => v.id === selectedVehicle);

    const header = [
      "운행일자", "운전자", "주행 전 계기판(km)", "주행 후 계기판(km)", "주행거리(km)",
      "운행목적", "출발지", "도착지", "주유비(원)", "통행료(원)", "주차비(원)", "정비·세차비(원)", "비용합계(원)",
    ];
    const rows = [...logs].reverse().map(l => [
      l.drive_date, l.driver_name || "-",
      Number(l.before_km || 0), Number(l.after_km || 0), Number(l.distance_km || 0),
      purposeLabel(l.purpose), l.origin || "", l.destination || "",
      Number(l.fuel_cost || 0), Number(l.toll_cost || 0), Number(l.parking_cost || 0), Number(l.maintenance_cost || 0),
      Number(l.fuel_cost || 0) + Number(l.toll_cost || 0) + Number(l.parking_cost || 0) + Number(l.maintenance_cost || 0),
    ]);

    const metaRows = [
      ["업무용승용차 운행기록부 (소득세법·법인세법 시행규칙 별지 제29호의2 서식 준용)"],
      [""],
      ["차량번호", vehicle?.plate_number || "-", "차종", vehicle?.model || "-"],
      ["소유형태", ownershipLabel(vehicle?.ownership_type), "사업자 구분", bizLabel(vehicle?.biz_type)],
      ["기간", `${rangeStart} ~ ${rangeEnd}`, "총 주행거리", `${summary.totalKm.toLocaleString()} km`],
      ["업무사용 거리", `${summary.businessKm.toLocaleString()} km`, "업무사용비율", `${summary.businessRatio} %`],
      [""],
      header,
    ];

    const ws = XLSX.utils.aoa_to_sheet([...metaRows, ...rows]);
    ws["!cols"] = header.map(() => ({ wch: 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "차량운행기록부");
    const plate = (vehicle?.plate_number || "차량").replace(/\s+/g, "");
    XLSX.writeFile(wb, `업무용승용차운행기록부_${plate}_${rangeStart}_${rangeEnd}.xlsx`);
  }

  const currentVehicle = vehicles.find(v => v.id === selectedVehicle);
  const logDistance = Number(logForm.after_km || 0) - Number(logForm.before_km || 0);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">차량 정보를 불러오는 중...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center shadow">
              <Car className="w-5 h-5" />
            </span>
            차량운행일지
          </h1>
          <div className="text-xs text-slate-500 mt-1">업무용 렌트카 주행거리 기록 · 국세청 세무 증빙 (업무용승용차 운행기록부)</div>
        </div>
        <Link href="/" className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> 홈으로
        </Link>
      </div>

      {/* 차량 선택 + 등록 */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {vehicles.length === 0 ? (
              <span className="text-sm text-slate-400">등록된 차량이 없습니다. 차량을 등록해 주세요.</span>
            ) : (
              vehicles.map(v => (
                <button key={v.id} onClick={() => setSelectedVehicle(v.id)}
                  className={`px-3.5 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                    selectedVehicle === v.id
                      ? "bg-blue-500 text-white border-blue-500 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                  }`}>
                  🚗 {v.plate_number}{v.model ? ` · ${v.model}` : ""}
                </button>
              ))
            )}
          </div>
          <div className="flex gap-2">
            {currentVehicle && (
              <>
                <button onClick={() => {
                    setEditingVehicle(currentVehicle);
                    setVehicleForm({
                      plate_number: currentVehicle.plate_number, model: currentVehicle.model || "",
                      ownership_type: currentVehicle.ownership_type || "rent", biz_type: currentVehicle.biz_type || "personal",
                    });
                    setShowVehicleModal(true);
                  }}
                  className="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 flex items-center gap-1">
                  <Pencil className="w-3.5 h-3.5" /> 차량 정보 수정
                </button>
                <button onClick={() => deleteVehicle(currentVehicle)}
                  className="px-3 py-2 bg-white border border-rose-200 text-rose-600 rounded-xl text-xs font-semibold hover:bg-rose-50 flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5" /> 삭제
                </button>
              </>
            )}
            <button onClick={() => {
                setEditingVehicle(null);
                setVehicleForm({ plate_number: "", model: "", ownership_type: "rent", biz_type: "personal" });
                setShowVehicleModal(true);
              }}
              className="px-3.5 py-2 bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-xl text-xs font-bold shadow-sm hover:shadow-md flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> 차량 등록
            </button>
          </div>
        </div>
        {currentVehicle && (
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600">{ownershipLabel(currentVehicle.ownership_type)}</span>
            <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600">{bizLabel(currentVehicle.biz_type)}</span>
          </div>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="총 주행거리" value={`${summary.totalKm.toLocaleString()} km`} sub={`${summary.count}회 운행`} color="text-blue-600" />
        <SummaryCard label="업무사용 거리" value={`${summary.businessKm.toLocaleString()} km`} sub="회원픽업·출장·일반업무" color="text-emerald-600" />
        <SummaryCard label="업무사용비율" value={`${summary.businessRatio}%`} sub="세무 경비 인정 핵심 지표" color="text-indigo-600" />
        <SummaryCard label="부대비용 합계" value={`₩${summary.totalCost.toLocaleString()}`} sub="주유·통행·주차·정비" color="text-amber-600" />
      </div>

      {/* 기간 필터 + 액션 */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            <span className="text-slate-400 text-sm">~</span>
            <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={downloadExcel}
              className="px-4 py-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-xl text-sm font-bold shadow-sm hover:shadow-md flex items-center gap-1.5">
              <Download className="w-4 h-4" /> 📥 국세청 양식 Excel
            </button>
            <button onClick={openLogModal}
              className="px-4 py-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl text-sm font-bold shadow-sm hover:shadow-md flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> 운행기록 등록
            </button>
          </div>
        </div>
      </div>

      {/* 운행기록 테이블 */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs">
                <th className="px-3 py-2.5 text-left">일자</th>
                <th className="px-3 py-2.5 text-left">운전자</th>
                <th className="px-3 py-2.5 text-right">전(km)</th>
                <th className="px-3 py-2.5 text-right">후(km)</th>
                <th className="px-3 py-2.5 text-right">주행거리</th>
                <th className="px-3 py-2.5 text-left">목적</th>
                <th className="px-3 py-2.5 text-left">출발 → 도착</th>
                <th className="px-3 py-2.5 text-right">부대비용</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400 text-sm">해당 기간에 운행기록이 없습니다</td></tr>
              ) : logs.map(l => {
                const cost = Number(l.fuel_cost || 0) + Number(l.toll_cost || 0) + Number(l.parking_cost || 0) + Number(l.maintenance_cost || 0);
                return (
                  <tr key={l.id} className="border-t border-slate-50 hover:bg-sky-50/40">
                    <td className="px-3 py-2.5 font-medium text-slate-800">{l.drive_date}</td>
                    <td className="px-3 py-2.5 text-slate-700">{l.driver_name || "-"}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{Number(l.before_km || 0).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{Number(l.after_km || 0).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-blue-600">{Number(l.distance_km || 0).toLocaleString()} km</td>
                    <td className="px-3 py-2.5"><span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{purposeLabel(l.purpose)}</span></td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{l.origin || "-"} → {l.destination || "-"}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{cost > 0 ? `₩${cost.toLocaleString()}` : "-"}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => deleteLog(l)} className="text-rose-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 차량 등록/수정 모달 ── */}
      {showVehicleModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowVehicleModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">🚗 {editingVehicle ? "차량 정보 수정" : "차량 등록"}</h3>
              <button onClick={() => setShowVehicleModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">차량번호 *</label>
                <input type="text" value={vehicleForm.plate_number} onChange={e => setVehicleForm({ ...vehicleForm, plate_number: e.target.value })}
                  placeholder="예: 123하 4567" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">차종</label>
                <input type="text" value={vehicleForm.model} onChange={e => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                  placeholder="예: 카니발, 레이" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">소유 형태 *</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {OWNERSHIPS.map(o => (
                    <button key={o.v} onClick={() => setVehicleForm({ ...vehicleForm, ownership_type: o.v })}
                      className={`px-2 py-2 rounded-lg text-xs font-semibold border transition-all ${vehicleForm.ownership_type === o.v ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200"}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">사업자 구분 *</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {BIZ_TYPES.map(b => (
                    <button key={b.v} onClick={() => setVehicleForm({ ...vehicleForm, biz_type: b.v })}
                      className={`px-2 py-2 rounded-lg text-xs font-semibold border transition-all ${vehicleForm.biz_type === b.v ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200"}`}>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setShowVehicleModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50">취소</button>
                <button onClick={saveVehicle}
                  className="px-4 py-2 bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-lg text-sm font-bold shadow-sm">저장</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 운행기록 등록 모달 ── */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowLogModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">📝 운행기록 등록 — {currentVehicle?.plate_number}</h3>
              <button onClick={() => setShowLogModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">운행 일자 *</label>
                  <input type="date" value={logForm.drive_date} onChange={e => setLogForm({ ...logForm, drive_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">운전자 *</label>
                  <select value={logForm.driver_staff_id} onChange={e => setLogForm({ ...logForm, driver_staff_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    <option value="">선택하세요</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">주행 전 계기판(km) *</label>
                  <input type="number" value={logForm.before_km} onChange={e => setLogForm({ ...logForm, before_km: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-right" />
                  <div className="text-[10px] text-slate-400 mt-0.5">직전 최종 계기판이 자동 입력됩니다</div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">주행 후 계기판(km) *</label>
                  <input type="number" value={logForm.after_km} onChange={e => setLogForm({ ...logForm, after_km: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-right" />
                </div>
              </div>
              <div className={`px-3 py-2.5 rounded-xl text-sm font-bold text-center ${logDistance > 0 ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-400"}`}>
                총 주행거리: {logDistance > 0 ? `${logDistance.toLocaleString()} km` : "주행 후 계기판을 입력하세요"}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">운행 목적 *</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {PURPOSES.map(p => (
                    <button key={p.v} onClick={() => setLogForm({ ...logForm, purpose: p.v })}
                      className={`px-2 py-2 rounded-lg text-xs font-semibold border transition-all ${logForm.purpose === p.v ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-200"}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">출발지</label>
                  <input type="text" value={logForm.origin} onChange={e => setLogForm({ ...logForm, origin: e.target.value })}
                    placeholder="예: 위례 센터" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">도착지</label>
                  <input type="text" value={logForm.destination} onChange={e => setLogForm({ ...logForm, destination: e.target.value })}
                    placeholder="예: 회원 자택" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">부대비용 (선택, 원)</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { k: "fuel_cost", label: "⛽ 주유비" },
                    { k: "toll_cost", label: "🛣️ 통행료/하이패스" },
                    { k: "parking_cost", label: "🅿️ 주차비" },
                    { k: "maintenance_cost", label: "🔧 정비·세차비" },
                  ].map(f => (
                    <div key={f.k}>
                      <div className="text-[10px] text-slate-500 mb-0.5">{f.label}</div>
                      <input type="number" value={logForm[f.k]} onChange={e => setLogForm({ ...logForm, [f.k]: Number(e.target.value) })}
                        step={1000} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-right" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setShowLogModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50">취소</button>
                <button onClick={saveLog}
                  className="px-4 py-2 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-lg text-sm font-bold shadow-sm">등록하기</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-lg font-black mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}
