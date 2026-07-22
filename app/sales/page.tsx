"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { getActiveBranchId, useBranchWatch } from "@/lib/branchContext";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import HomeButton from "@/components/HomeButton";
import { DollarSign, ChevronLeft, ChevronRight, Search, Eye, Upload, Download, X, CheckCircle2, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function SalesPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selMonth, setSelMonth] = useState(monthKey(new Date()));
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");
  const [showImport, setShowImport] = useState(false);

  useEffect(() => { load(); }, []);
  useBranchWatch(() => load());

  async function load() {
    setLoading(true);
    const branchId = getActiveBranchId();
    let q: any = supabase.from("payments")
      .select("*, members(name, member_type, customer_no), staff(name), memberships(plan_name, total_sessions, used_sessions)");
    if (branchId) q = q.eq("branch_id", branchId);
    q = q.order("paid_at", { ascending: false });
    let { data, error } = await q;
    // branch_id 컴럼 미존재 시 폴백
    if (error && (error.code === "42703" || error.message?.includes("branch_id"))) {
      const fb = await supabase.from("payments")
        .select("*, members(name, member_type, customer_no), staff(name), memberships(plan_name, total_sessions, used_sessions)")
        .order("paid_at", { ascending: false });
      data = fb.data;
    }
    setPayments(data || []);
    setLoading(false);
  }

  // 월별 필터
  const monthPayments = useMemo(() => {
    return payments.filter(p => (p.paid_at || "").startsWith(selMonth));
  }, [payments, selMonth]);

  // 검색 필터
  const filtered = useMemo(() => {
    let list = monthPayments;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        (p.members?.name || "").toLowerCase().includes(q) ||
        (p.members?.phone || "").includes(q) ||
        (p.members?.customer_no || "").toString().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const dA = (a.paid_at || "") + " " + (a.paid_time || "");
      const dB = (b.paid_at || "") + " " + (b.paid_time || "");
      return sortBy === "newest" ? dB.localeCompare(dA) : dA.localeCompare(dB);
    });
  }, [monthPayments, search, sortBy]);

  // 총합계 (취소 제외)
  const totals = useMemo(() => {
    const active = filtered.filter(p => p.status !== "cancelled");
    return {
      gross:    active.reduce((s, p) => s + (p.gross_amount || p.amount || 0), 0),
      net:      active.reduce((s, p) => s + Math.max(0, (p.amount || 0) - (p.refunded_amount || 0)), 0),
      card:     active.reduce((s, p) => s + (p.pay_card || 0), 0),
      cash:     active.reduce((s, p) => s + (p.pay_cash || 0), 0),
      transfer: active.reduce((s, p) => s + (p.pay_transfer || 0), 0),
      unpaid:   active.reduce((s, p) => s + (p.unpaid_amount || 0), 0),
      amountPlan:  active.reduce((s, p) => s + (p.pay_amount_plan || 0), 0),
      sessionPlan: active.reduce((s, p) => s + (p.pay_session_plan || 0), 0),
      point:    active.reduce((s, p) => s + (p.pay_point || 0), 0),
      pg:       active.reduce((s, p) => s + (p.pay_pg || 0), 0),
      other:    active.reduce((s, p) => s + (p.pay_other || 0), 0),
      discount: active.reduce((s, p) => s + (p.discount_amount || 0), 0),
    };
  }, [filtered]);

  function shiftMonth(delta: number) {
    const [y, m] = selMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelMonth(monthKey(d));
  }

  return (
    <main className="max-w-full mx-auto px-3 md:px-6 py-6 md:py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HomeButton />
          <span className="text-gray-400">/</span>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-pink-500" /> 수납 · 매출 내역
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImport(true)}
            className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 flex items-center gap-1">
            <Upload className="w-4 h-4" /> 엑셀 임포트
          </button>
          <Link href="/payments" className="px-3 py-1.5 bg-aqu-600 text-white text-sm rounded-lg hover:bg-aqu-700">
            + 매출 등록
          </Link>
        </div>
      </div>

      {/* 월 선택 & 검색 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => shiftMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="px-4 py-2 bg-aqu-50 text-aqu-800 rounded-lg font-bold min-w-[140px] text-center">
            {selMonth.replace("-", "년 ")}월
          </div>
          <button onClick={() => shiftMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setSelMonth(monthKey(new Date()))} className="text-xs px-2 py-1 bg-slate-100 rounded ml-1">오늘</button>
        </div>

        <div className="flex-1 flex items-center gap-2 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="이름 · 연락처 · 고객번호 · 상품"
              className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="newest">최신순</option>
            <option value="oldest">오래된순</option>
          </select>
        </div>
      </div>

      {/* 매출 내역 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="font-bold text-slate-900">매출내역 ({filtered.length}건)</div>
          <div className="text-xs text-gray-500">가로 스크롤 가능 →</div>
        </div>
        {loading ? (
          <div className="text-center py-16 text-gray-400">로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">이 달의 매출 내역이 없습니다</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-200">
                  <th className="px-2 py-3 text-left font-bold text-slate-700 whitespace-nowrap">매출일시</th>
                  <th className="px-2 py-3 text-left font-bold text-slate-700 whitespace-nowrap">고객명</th>
                  <th className="px-2 py-3 text-left font-bold text-slate-700 whitespace-nowrap">담당자</th>
                  <th className="px-2 py-3 text-left font-bold text-slate-700 whitespace-nowrap">메뉴</th>
                  <th className="px-2 py-3 text-right font-bold text-slate-700 whitespace-nowrap">영업액</th>
                  <th className="px-2 py-3 text-right font-bold text-red-600 whitespace-nowrap">결제금액</th>
                  <th className="px-2 py-3 text-right font-bold text-blue-700 whitespace-nowrap">카드</th>
                  <th className="px-2 py-3 text-right font-bold text-green-700 whitespace-nowrap">현금</th>
                  <th className="px-2 py-3 text-right font-bold text-orange-700 whitespace-nowrap">계좌</th>
                  <th className="px-2 py-3 text-right font-bold text-red-500 whitespace-nowrap">미수</th>
                  <th className="px-2 py-3 text-right font-bold text-purple-700 whitespace-nowrap">정액권</th>
                  <th className="px-2 py-3 text-right font-bold text-indigo-700 whitespace-nowrap">횟수권</th>
                  <th className="px-2 py-3 text-right font-bold text-cyan-700 whitespace-nowrap">포인트</th>
                  <th className="px-2 py-3 text-right font-bold text-teal-700 whitespace-nowrap">페이</th>
                  <th className="px-2 py-3 text-right font-bold text-gray-700 whitespace-nowrap">기타</th>
                  <th className="px-2 py-3 text-right font-bold text-pink-700 whitespace-nowrap">할인</th>
                  <th className="px-2 py-3 text-center font-bold text-slate-700 whitespace-nowrap">보기</th>
                </tr>
                {/* 총 합계 행 */}
                <tr className="bg-slate-100 border-b-2 border-slate-300 font-bold">
                  <td colSpan={4} className="px-2 py-2 text-center text-slate-800">📊 총 합계</td>
                  <td className="px-2 py-2 text-right text-slate-800">₩{totals.gross.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-red-600">₩{totals.net.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-blue-700">₩{totals.card.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-green-700">₩{totals.cash.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-orange-700">₩{totals.transfer.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-red-500">₩{totals.unpaid.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-purple-700">₩{totals.amountPlan.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-indigo-700">₩{totals.sessionPlan.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-cyan-700">₩{totals.point.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-teal-700">₩{totals.pg.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-gray-700">₩{totals.other.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right text-pink-700">₩{totals.discount.toLocaleString()}</td>
                  <td></td>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const isCancelled = p.status === "cancelled";
                  return (
                  <tr key={p.id} className={`border-b border-gray-100 hover:bg-slate-50 ${isCancelled ? "opacity-50" : ""}`}>
                    <td className="px-2 py-2.5 text-slate-600 whitespace-nowrap">
                      {p.paid_at}
                      {p.paid_time && <div className="text-[10px] text-gray-400">{p.paid_time}</div>}
                      {isCancelled && <div className="mt-0.5 inline-block px-1 py-0.5 bg-red-500 text-white text-[9px] rounded">취소</div>}
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      {p.member_id ? (
                        <Link href={`/members/${p.member_id}`} className="text-aqu-700 hover:underline font-medium">
                          {p.members?.name || "-"}
                        </Link>
                      ) : "-"}
                    </td>
                    <td className="px-2 py-2.5 text-slate-700 whitespace-nowrap">{p.staff?.name || "-"}</td>
                    <td className="px-2 py-2.5 text-slate-800 max-w-[140px] truncate" title={p.description}>
                      {p.memberships?.plan_name || p.description || "-"}
                    </td>
                    <td className="px-2 py-2.5 text-right font-medium text-slate-800">₩{(p.gross_amount || p.amount || 0).toLocaleString()}</td>
                    <td className="px-2 py-2.5 text-right font-bold text-red-600">
                      ₩{Math.max(0, (p.amount || 0) - (p.refunded_amount || 0)).toLocaleString()}
                      {p.refunded_amount > 0 && <div className="text-[9px] text-orange-500 font-normal">-{p.refunded_amount.toLocaleString()}</div>}
                    </td>
                    <td className="px-2 py-2.5 text-right text-blue-700">{p.pay_card ? `₩${p.pay_card.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-right text-green-700">{p.pay_cash ? `₩${p.pay_cash.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-right text-orange-700">{p.pay_transfer ? `₩${p.pay_transfer.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-right text-red-500">{p.unpaid_amount ? `₩${p.unpaid_amount.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-right text-purple-700">{p.pay_amount_plan ? `₩${p.pay_amount_plan.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-right text-indigo-700">{p.pay_session_plan ? `₩${p.pay_session_plan.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-right text-cyan-700">{p.pay_point ? `₩${p.pay_point.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-right text-teal-700">{p.pay_pg ? `₩${p.pay_pg.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-right text-gray-700">{p.pay_other ? `₩${p.pay_other.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-right text-pink-700">{p.discount_amount ? `₩${p.discount_amount.toLocaleString()}` : "0"}</td>
                    <td className="px-2 py-2.5 text-center">
                      <Link href={`/members/${p.member_id}`}
                        className="inline-flex items-center gap-1 px-2 py-1 border border-gray-200 rounded text-[10px] hover:bg-gray-50">
                        <Eye className="w-3 h-3" /> 보기
                      </Link>
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 엑셀 임포트 모달 */}
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onDone={async () => { setShowImport(false); await load(); }} />
      )}
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 엑셀 임포트 모달
// ═══════════════════════════════════════════════════════════════════
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, success: 0, failed: 0, errors: [] as string[] });
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [autoCreateMember, setAutoCreateMember] = useState(true);

  async function handleFile(f: File) {
    setFile(f);
    setParsing(true);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
      if (json.length < 2) { alert("데이터가 없습니다"); setParsing(false); return; }

      // 헤더 파싱: 매출일시, 고객명, 담당자, 구분, 내용, 결제금액, 카드, 현금, 계좌, 미수, 정액권, 횟수권, 포인트
      const headerRow = json[0].map((h: any) => String(h || "").trim());
      const colIdx: Record<string, number> = {};
      headerRow.forEach((h, i) => { colIdx[h] = i; });

      const parsed: any[] = [];
      for (let i = 1; i < json.length; i++) {
        const r = json[i];
        if (!r[colIdx["매출일시"]] && !r[colIdx["고객명"]]) continue;
        parsed.push({
          rowIdx: i + 1,
          paid_datetime: String(r[colIdx["매출일시"]] || ""),
          customer_name: String(r[colIdx["고객명"]] || "").trim(),
          staff_name:    String(r[colIdx["담당자"]] || "").trim(),
          category:      String(r[colIdx["구분"]] || "").trim(),
          content:       String(r[colIdx["내용"]] || "").trim(),
          amount:        Number(String(r[colIdx["결제금액"]] || 0).replace(/[^\d.-]/g, "")) || 0,
          pay_card:      Number(String(r[colIdx["카드"]] || 0).replace(/[^\d.-]/g, "")) || 0,
          pay_cash:      Number(String(r[colIdx["현금"]] || 0).replace(/[^\d.-]/g, "")) || 0,
          pay_transfer:  Number(String(r[colIdx["계좌"]] || 0).replace(/[^\d.-]/g, "")) || 0,
          unpaid_amount: Number(String(r[colIdx["미수"]] || 0).replace(/[^\d.-]/g, "")) || 0,
          pay_amount_plan:  Number(String(r[colIdx["정액권"]] || 0).replace(/[^\d.-]/g, "")) || 0,
          pay_session_plan: Number(String(r[colIdx["횟수권"]] || 0).replace(/[^\d.-]/g, "")) || 0,
          pay_point:     Number(String(r[colIdx["포인트"]] || 0).replace(/[^\d.-]/g, "")) || 0,
        });
      }
      setRows(parsed);
      setStep("preview");
    } catch (err: any) {
      alert("파일 읽기 실패: " + err.message);
    } finally { setParsing(false); }
  }

  // "2026-07-08 19:30" 명뢹 형식 파싱
  function parseDate(s: string): { date: string; time: string } {
    if (!s) return { date: "", time: "" };
    // Excel serial number이면 (드뮘)
    const iso = s.replace(/\./g, "-").trim();
    const m = iso.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2}))?/);
    if (m) {
      const date = `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
      const time = m[4] ? `${m[4].padStart(2,"0")}:${m[5]}` : "";
      return { date, time };
    }
    return { date: "", time: "" };
  }

  async function doImport() {
    setImporting(true);
    setStep("result");
    setProgress({ done: 0, total: rows.length, success: 0, failed: 0, errors: [] });

    const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
    const orgId = org?.id;

    // 회원 & 직원 캐시 토대직
    const { data: allMembers } = await supabase.from("members").select("id, name").is("deleted_at", null);
    const { data: allStaff } = await supabase.from("staff").select("id, name");
    const memberMap: Record<string, string> = {};
    (allMembers || []).forEach((m: any) => { memberMap[m.name] = m.id; });
    const staffMap: Record<string, string> = {};
    (allStaff || []).forEach((s: any) => { staffMap[s.name] = s.id; });

    let success = 0, failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const { date, time } = parseDate(r.paid_datetime);
        if (!date) throw new Error(`날짜 형식 오류: ${r.paid_datetime}`);

        // 1) 회원 조회/생성
        let memberId = memberMap[r.customer_name];
        if (!memberId && autoCreateMember && r.customer_name) {
          const { data: newM, error: mErr } = await supabase.from("members").insert({
            org_id: orgId, name: r.customer_name, member_type: "adult", status: "regular",
          }).select().single();
          if (mErr) throw new Error(`회원 생성 실패(${r.customer_name}): ${mErr.message}`);
          memberId = newM.id;
          memberMap[r.customer_name] = memberId;
        }
        if (!memberId) throw new Error(`회원 미등록: ${r.customer_name}`);

        // 2) 담당자 조회
        const staffId = staffMap[r.staff_name] || null;

        // 3) 결제 수단 결정 (가장 큰 금액 수단)
        const methods: [string, number][] = [
          ["card", r.pay_card], ["cash", r.pay_cash], ["transfer", r.pay_transfer],
        ];
        methods.sort((a, b) => b[1] - a[1]);
        const method = methods[0][1] > 0 ? methods[0][0] : "other";

        // 4) 회원권 자동 생성 (내용에서 횟수 추출: "10회권", "20회권", "30회권")
        let membershipId: string | null = null;
        const sesM = (r.content || "").match(/(\d+)회/);
        const sessions = sesM ? Number(sesM[1]) : 1;
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 90);
        const msPayload: any = {
          org_id: orgId,
          member_id: memberId,
          plan_name: r.content || r.category || "회원권",
          total_sessions: sessions,
          used_sessions: 0,
          start_date: date,
          end_date: endDate.toISOString().slice(0, 10),
          price: r.amount,
          status: "active",
        };
        for (let att = 0; att < 10; att++) {
          const { data: ms, error: msErr } = await supabase.from("memberships").insert(msPayload).select().single();
          if (!msErr) { membershipId = ms?.id; break; }
          const m = msErr.message.match(/'([^']+)' column|column "([^"]+)"/);
          const miss = m?.[1] || m?.[2];
          if (miss && miss in msPayload) { delete msPayload[miss]; continue; }
          break;
        }

        // 5) 결제 기록
        const payload: any = {
          org_id: orgId,
          member_id: memberId,
          staff_id: staffId,
          membership_id: membershipId,
          amount: r.amount,
          gross_amount: r.amount,
          method,
          paid_at: date,
          paid_time: time || null,
          description: r.content,
          pay_card: r.pay_card,
          pay_cash: r.pay_cash,
          pay_transfer: r.pay_transfer,
          pay_amount_plan: r.pay_amount_plan,
          pay_session_plan: r.pay_session_plan,
          pay_point: r.pay_point,
          unpaid_amount: r.unpaid_amount,
          status: "active",
          memo: `[엑셀 임포트] ${r.category || ""}`,
        };
        let ok = false;
        for (let att = 0; att < 10; att++) {
          const { error } = await supabase.from("payments").insert(payload);
          if (!error) { ok = true; break; }
          const m = error.message.match(/'([^']+)' column|column "([^"]+)"/);
          const miss = m?.[1] || m?.[2];
          if (miss && miss in payload) { delete payload[miss]; continue; }
          throw new Error(error.message);
        }
        if (!ok) throw new Error("결제 insert 실패");

        success++;
      } catch (e: any) {
        failed++;
        errors.push(`행 ${r.rowIdx} (${r.customer_name}): ${e.message}`);
      }
      setProgress({ done: i + 1, total: rows.length, success, failed, errors });
    }
    setImporting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Upload className="w-5 h-5 text-emerald-600" /> 엑셀 매출내역 임포트
            </h2>
            <p className="text-xs text-gray-600 mt-0.5">
              {step === "upload" && "필수 컬럼: 매출일시, 고객명, 담당자, 구분, 내용, 결제금액, 카드, 현금, 계좌, 미수, 정액권, 횟수권, 포인트"}
              {step === "preview" && `${rows.length}건 미리보기 · 확인 후 실행`}
              {step === "result" && `임포트 진행: ${progress.done}/${progress.total}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/50 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === "upload" && (
            <div className="space-y-4">
              <label className="block border-2 border-dashed border-emerald-300 rounded-2xl p-8 text-center hover:bg-emerald-50 cursor-pointer transition">
                <input type="file" accept=".xlsx,.xls,.csv" hidden
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                <Upload className="w-12 h-12 mx-auto text-emerald-500 mb-2" />
                <div className="text-sm font-bold text-slate-800">
                  {parsing ? "파일 읽는 중..." : "엑셀 파일 선택"}
                </div>
                <div className="text-xs text-gray-500 mt-1">.xlsx, .xls, .csv 지원</div>
              </label>

              <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-700 space-y-1.5">
                <div className="font-bold text-slate-900 mb-1">📋 필수 컬럼 구조</div>
                <div>1행: 헤더 (반드시 한글명 사용)</div>
                <code className="block bg-white p-2 rounded border text-[10px] mt-1 font-mono">
                  매출일시 | 고객명 | 담당자 | 구분 | 내용 | 결제금액 | 카드 | 현금 | 계좌 | 미수 | 정액권 | 횟수권 | 포인트
                </code>
                <div className="pt-2">날짜 형식: <b>2026-07-08 19:30</b> 또는 <b>2026/07/08</b></div>
                <div>구분 예시: <b>횟수권 / 정액권 / 제품 / 기타</b></div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={autoCreateMember} onChange={e => setAutoCreateMember(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600" />
                <span>등록되지 않은 고객은 <b>자동으로 회원 등록</b> (기본: 성인 / 정기회원)</span>
              </label>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="text-sm text-slate-800">
                  총 <b className="text-emerald-600">{rows.length}건</b>이 감지되었습니다. 가져옵 30건을 미리보기:
                </div>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-x-auto max-h-96">
                <table className="min-w-full text-[10px]">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left">매출일시</th>
                      <th className="px-2 py-2 text-left">고객</th>
                      <th className="px-2 py-2 text-left">담당</th>
                      <th className="px-2 py-2 text-left">내용</th>
                      <th className="px-2 py-2 text-right">금액</th>
                      <th className="px-2 py-2 text-right">카드</th>
                      <th className="px-2 py-2 text-right">현금</th>
                      <th className="px-2 py-2 text-right">계좌</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 30).map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-1.5">{r.paid_datetime}</td>
                        <td className="px-2 py-1.5 font-medium">{r.customer_name}</td>
                        <td className="px-2 py-1.5">{r.staff_name}</td>
                        <td className="px-2 py-1.5 truncate max-w-[160px]">{r.content}</td>
                        <td className="px-2 py-1.5 text-right font-bold text-emerald-700">₩{r.amount.toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right text-blue-600">{r.pay_card ? r.pay_card.toLocaleString() : ""}</td>
                        <td className="px-2 py-1.5 text-right text-green-600">{r.pay_cash ? r.pay_cash.toLocaleString() : ""}</td>
                        <td className="px-2 py-1.5 text-right text-orange-600">{r.pay_transfer ? r.pay_transfer.toLocaleString() : ""}</td>
                      </tr>
                    ))}
                    {rows.length > 30 && (
                      <tr><td colSpan={8} className="text-center py-2 text-gray-400">... 외 {rows.length - 30}건</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === "result" && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  {importing ? (
                    <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  )}
                  <div>
                    <div className="font-bold text-slate-900">
                      {importing ? "임포트 진행 중..." : "임포트 완료"}
                    </div>
                    <div className="text-xs text-gray-600">{progress.done}/{progress.total}건 실행</div>
                  </div>
                </div>
                <div className="w-full bg-white rounded-full h-3 overflow-hidden mb-3">
                  <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all"
                    style={{ width: `${progress.total ? (progress.done / progress.total * 100) : 0}%` }}></div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-emerald-50 rounded-lg p-2">
                    <div className="text-gray-600">성공</div>
                    <div className="text-lg font-bold text-emerald-700">{progress.success}건</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-2">
                    <div className="text-gray-600">실패</div>
                    <div className="text-lg font-bold text-red-700">{progress.failed}건</div>
                  </div>
                </div>
              </div>
              {progress.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 max-h-56 overflow-y-auto">
                  <div className="text-xs font-bold text-red-700 mb-2 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> 오류 목록
                  </div>
                  {progress.errors.map((e, i) => (
                    <div key={i} className="text-[10px] text-red-700 py-0.5">{e}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 border-t border-gray-100 bg-slate-50 flex justify-end gap-2">
          {step === "upload" && (
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">취소</button>
          )}
          {step === "preview" && (
            <>
              <button onClick={() => setStep("upload")} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">다시 선택</button>
              <button onClick={doImport} disabled={rows.length === 0}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                {rows.length}건 임포트 실행 →
              </button>
            </>
          )}
          {step === "result" && !importing && (
            <button onClick={onDone} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold">
              완료 · 매출내역 새로고침
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
