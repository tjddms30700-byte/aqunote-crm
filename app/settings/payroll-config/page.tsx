"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import HomeButton from "@/components/HomeButton";
import DirectorOnly from "@/components/DirectorOnly";
import { DollarSign, ChevronLeft, Save, Users, Calculator, TrendingUp, ShieldCheck } from "lucide-react";

/**
 * v3.19.1: 직원 급여 · 수당 관리 (마스터/센터장 전용)
 * - 강사별 회당 단가 / 인센티브율 설정
 * - 월별 자동 수당 계산 (완료 수업 수 × 회당 단가)
 * - 급여 지급 이력 관리
 */

function PayrollConfigInner() {
  const [staff, setStaff] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [payrollHistory, setPayrollHistory] = useState<any[]>([]);
  const [slotsMonth, setSlotsMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string>("");
  const [rates, setRates] = useState<Record<string, { session_rate: number; incentive_rate: number }>>({});

  useEffect(() => { loadAll(); }, [slotsMonth]);

  async function loadAll() {
    setLoading(true);
    const [s, sl, ph] = await Promise.all([
      supabase.from("staff").select("*").is("resign_date", null).order("name"),
      supabase.from("schedule_slots").select("staff_id, status, event_date, event_type")
        .gte("event_date", slotsMonth + "-01")
        .lt("event_date", slotsMonth + "-32")
        .is("deleted_at", null),
      supabase.from("payroll_history").select("*").order("pay_year", { ascending: false }).order("pay_month", { ascending: false }).limit(50),
    ]);
    const staffData = s.data || [];
    setStaff(staffData);
    setSlots(sl.data || []);
    setPayrollHistory(ph.data || []);
    // 초기 rates 채우기
    const initRates: Record<string, any> = {};
    staffData.forEach((st: any) => {
      initRates[st.id] = {
        session_rate: Number(st.session_rate) || 30000,
        incentive_rate: Number(st.incentive_rate) || 0,
      };
    });
    setRates(initRates);
    setLoading(false);
  }

  async function saveRate(staffId: string) {
    setSavingId(staffId);
    const r = rates[staffId];
    // ✅ v3.20.11: 0원도 명시적으로 저장, 저장 성공 시 rates state 명시 유지 (loadAll이 stale 데이터 덮어쓰는 문제 방지)
    const sessionRate = Number.isFinite(Number(r.session_rate)) ? Number(r.session_rate) : 0;
    const incentiveRate = Number.isFinite(Number(r.incentive_rate)) ? Number(r.incentive_rate) : 0;
    const payload: any = { session_rate: sessionRate, incentive_rate: incentiveRate };
    let lastError: any = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { error: updErr } = await supabase.from("staff").update(payload).eq("id", staffId);
      if (updErr) {
        lastError = updErr;
        const m = updErr.message.match(/'([^']+)' column|column "([^"]+)"/);
        const missing = m?.[1] || m?.[2];
        if (missing && missing in payload) {
          delete payload[missing];
          continue;
        }
        break;
      }
      // 저장 성공 후 별도 SELECT로 실제 DB 값 검증
      const { data: check } = await supabase.from("staff").select("session_rate, incentive_rate").eq("id", staffId).maybeSingle();
      setSavingId("");
      if (check) {
        const dbRate = Number(check.session_rate);
        const dbInc = Number(check.incentive_rate);
        // ✅ 성공 여부와 무관하게 rates state를 명시 유지 (사용자 입력값 보존)
        setRates(prev => ({ ...prev, [staffId]: { session_rate: dbRate, incentive_rate: dbInc } }));
        // staff 목록의 해당 강사 정보도 즉시 반영 (loadAll 불필요)
        setStaff(prev => prev.map((st: any) => st.id === staffId ? { ...st, session_rate: dbRate, incentive_rate: dbInc } : st));
        if (dbRate === sessionRate && dbInc === incentiveRate) {
          alert(`✅ 수당 설정 저장 완료\n\n• 회당 단가: ₩${dbRate.toLocaleString()}\n• 인센티브: ${dbInc}%`);
          return;
        }
        alert(`❌ 저장 실패 (RLS 또는 트리거)\n\n• 요청: ₩${sessionRate.toLocaleString()} / ${incentiveRate}%\n• DB 값: ₩${dbRate.toLocaleString()} / ${dbInc}%\n\n💡 Supabase SQL Editor 실행:\nAQUNOTE_V32010_STAFF_RLS.sql`);
        return;
      }
      alert(`✅ 저장되었습니다`);
      return;
    }
    setSavingId("");
    alert(`❌ 저장 실패: ${lastError?.message || "알 수 없는 오류"}\n\n💡 SQL 실행:\nALTER TABLE staff ADD COLUMN IF NOT EXISTS session_rate NUMERIC DEFAULT 30000;\nALTER TABLE staff ADD COLUMN IF NOT EXISTS incentive_rate NUMERIC DEFAULT 0;`);
  }

  // 강사별 통계 계산
  function calcStats(staffId: string) {
    const mySlots = slots.filter((sl: any) => sl.staff_id === staffId && ["lesson", "trial", "makeup"].includes(sl.event_type));
    const total = mySlots.length;
    const done = mySlots.filter((sl: any) => ["done", "completed", "present"].includes((sl.status || "").toLowerCase())).length;
    const noshow = mySlots.filter((sl: any) => ["noshow", "absent"].includes((sl.status || "").toLowerCase())).length;
    const sick = mySlots.filter((sl: any) => (sl.status || "").toLowerCase() === "sick").length;
    return { total, done, noshow, sick };
  }

  // 전체 통계
  const totalDone = staff.reduce((sum, s) => sum + calcStats(s.id).done, 0);
  const totalPayout = staff.reduce((sum, s) => {
    const done = calcStats(s.id).done;
    const rate = Number(rates[s.id]?.session_rate) || 0;
    const incentive = Number(rates[s.id]?.incentive_rate) || 0;
    const base = done * rate;
    return sum + base + Math.round(base * incentive / 100);
  }, 0);

  if (loading) return <div className="p-10 text-center text-gray-400">로딩 중...</div>;

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <HomeButton />
          <span className="text-gray-300">/</span>
          <Link href="/settings" className="text-sm text-gray-500 hover:text-aqu-700 flex items-center gap-1">
            <ChevronLeft className="w-4 h-4" /> 설정
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl md:text-2xl font-bold text-aqu-900 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-indigo-500" /> 직원 급여 · 수당 관리
          </h1>
          <span className="ml-2 text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-bold">🔒 마스터/센터장 전용</span>
        </div>
        <input type="month" value={slotsMonth} onChange={e => setSlotsMonth(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-gradient-to-br from-indigo-500 to-blue-500 rounded-xl p-4 text-white shadow">
          <div className="text-xs opacity-90 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> 재직 강사</div>
          <div className="text-2xl font-bold mt-1">{staff.length}명</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl p-4 text-white shadow">
          <div className="text-xs opacity-90 flex items-center gap-1"><Calculator className="w-3.5 h-3.5" /> 이번 달 완료 수업</div>
          <div className="text-2xl font-bold mt-1">{totalDone}회</div>
        </div>
        <div className="bg-gradient-to-br from-pink-500 to-rose-500 rounded-xl p-4 text-white shadow">
          <div className="text-xs opacity-90 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> 예상 총 수당</div>
          <div className="text-2xl font-bold mt-1">₩{totalPayout.toLocaleString()}</div>
        </div>
        <div className="bg-gradient-to-br from-slate-500 to-gray-500 rounded-xl p-4 text-white shadow">
          <div className="text-xs opacity-90 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> 지급 완료</div>
          <div className="text-2xl font-bold mt-1">{payrollHistory.filter(p => `${p.pay_year}-${String(p.pay_month).padStart(2,"0")}` === slotsMonth).length}건</div>
        </div>
      </div>

      {/* 강사별 수당 설정 및 계산 */}
      <div className="bg-white rounded-2xl border border-aqu-100 shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-blue-50">
          <div className="font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-indigo-500" /> 강사별 수당 설정 및 자동 계산
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">회당 단가와 인센티브율을 변경하면 오른쪽 예상 수당이 즉시 반영됩니다</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-slate-700">
                <th className="px-3 py-2.5 text-left text-xs font-semibold">강사</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold">완료</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold">노쇼/병결</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold">회당 단가 (원)</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold">인센티브 (%)</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold">예상 수당</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold">저장</th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-6 text-gray-400">재직 강사가 없습니다</td></tr>
              ) : staff.map((s: any) => {
                const stats = calcStats(s.id);
                const r = rates[s.id] || { session_rate: 30000, incentive_rate: 0 };
                const base = stats.done * Number(r.session_rate || 0);
                const bonus = Math.round(base * Number(r.incentive_rate || 0) / 100);
                const total = base + bonus;
                const color = s.color || "#3b82f6";
                return (
                  <tr key={s.id} className="border-t border-gray-100 hover:bg-indigo-50/30">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="font-semibold text-slate-800">{s.name}</span>
                        <span className="text-[10px] text-gray-500">({s.role || "직원"})</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold text-emerald-700">{stats.done}</td>
                    <td className="px-3 py-2.5 text-center text-red-600 text-xs">{stats.noshow}/{stats.sick}</td>
                    <td className="px-3 py-2.5 text-right">
                      <input type="number" step="1000" value={r.session_rate}
                        onChange={e => setRates({ ...rates, [s.id]: { ...r, session_rate: Number(e.target.value) } })}
                        className="w-24 px-2 py-1 border border-gray-200 rounded text-sm text-right bg-white" />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <input type="number" step="0.5" value={r.incentive_rate}
                        onChange={e => setRates({ ...rates, [s.id]: { ...r, incentive_rate: Number(e.target.value) } })}
                        className="w-16 px-2 py-1 border border-gray-200 rounded text-sm text-right bg-white" />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="font-bold text-indigo-800">₩{total.toLocaleString()}</div>
                      {bonus > 0 && (
                        <div className="text-[10px] text-emerald-600">기본 ₩{base.toLocaleString()} + 보너스 ₩{bonus.toLocaleString()}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button onClick={() => saveRate(s.id)} disabled={savingId === s.id}
                        className="px-3 py-1 bg-indigo-500 text-white rounded text-xs font-semibold hover:bg-indigo-600 disabled:opacity-40 flex items-center gap-1 mx-auto">
                        <Save className="w-3 h-3" /> {savingId === s.id ? "..." : "저장"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {staff.length > 0 && (
              <tfoot className="bg-indigo-50 font-bold text-indigo-900">
                <tr>
                  <td className="px-3 py-3">합계</td>
                  <td className="px-3 py-3 text-center text-emerald-700">{totalDone}</td>
                  <td></td>
                  <td colSpan={2}></td>
                  <td className="px-3 py-3 text-right text-indigo-900">₩{totalPayout.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 급여 지급 이력 */}
      <div className="bg-white rounded-2xl border border-aqu-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-pink-50 to-rose-50 flex items-center justify-between">
          <div className="font-bold text-slate-900">💵 급여 지급 이력 (최근 50건)</div>
          <Link href="/staff" className="text-xs text-pink-600 hover:underline">기존 지급 관리 →</Link>
        </div>
        {payrollHistory.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">지급 이력이 없습니다</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-slate-700 text-xs">
                  <th className="px-3 py-2.5 text-left">지급월</th>
                  <th className="px-3 py-2.5 text-left">강사</th>
                  <th className="px-3 py-2.5 text-right">기본급</th>
                  <th className="px-3 py-2.5 text-right">인센티브</th>
                  <th className="px-3 py-2.5 text-right">지급액</th>
                  <th className="px-3 py-2.5 text-left">지급일</th>
                </tr>
              </thead>
              <tbody>
                {payrollHistory.map((p: any) => {
                  const staffP = staff.find((s: any) => s.id === p.staff_id);
                  const total = (p.base_salary || 0) + (p.incentive || 0) + (p.bonus || 0) - (p.deduction || 0);
                  return (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-slate-700">{p.pay_year}-{String(p.pay_month).padStart(2, "0")}</td>
                      <td className="px-3 py-2 font-semibold">{staffP?.name || "-"}</td>
                      <td className="px-3 py-2 text-right">₩{(p.base_salary || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">₩{(p.incentive || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-bold text-indigo-800">₩{total.toLocaleString()}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{p.paid_date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
        🔒 <b>보안 안내</b>: 이 페이지는 원장 권한이 있는 마스터/센터장만 접근 가능합니다. 일반 강사·치료사는 볼 수 없습니다.
      </div>
    </main>
  );
}

export default function PayrollConfigPage() {
  return <DirectorOnly><PayrollConfigInner /></DirectorOnly>;
}
