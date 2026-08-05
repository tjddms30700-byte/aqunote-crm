"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import HomeButton from "@/components/HomeButton";
import { supabase } from "@/lib/supabase";
import { getActiveBranchId, useBranchWatch } from "@/lib/branchContext";
import { FileSignature, Printer, Search, Calendar, User, Filter, Download, ClipboardCheck, Waves, Trash2, RotateCcw } from "lucide-react";

/* 상태 라벨 */
const STATUS_LABEL: Record<string, string> = {
  present: "✅ 출석",
  absent: "🚩 결석",
  sick: "🤒 병결",
  personal: "📝 개인사정",
  noshow: "🚩 노쇼",
  done: "✅ 완료",
  cancel: "❌ 취소",
};
const SIGNER_LABEL: Record<string, string> = {
  parent: "👪 보호자",
  self: "🙋 본인",
  staff: "👤 직원 대필",
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;
}

export default function SignatureAttendanceHistoryPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // ✅ v3.26.6: hydration mismatch 방지 - 초기값은 빈 문자열, 마운트 후 useEffect에서 설정
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [filterMember, setFilterMember] = useState("");
  const [filterSigner, setFilterSigner] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");

  // ✅ v3.26.6: 클라이언트 마운트 후에만 날짜 설정 (서버 렌더링 시에는 빈 값)
  useEffect(() => {
    setFromDate(firstOfMonth());
    setToDate(todayStr());
  }, []);

  useEffect(() => {
    if (fromDate && toDate) loadAll();
  }, [fromDate, toDate]);
  useBranchWatch(() => { if (fromDate && toDate) loadAll(); });

  async function loadAll() {
    setLoading(true);
    const branchId = getActiveBranchId();

    // 회원 목록
    const mQ = supabase.from("members").select("id, name, phone, member_type, guardian_name").is("deleted_at", null);
    const { data: mData } = branchId
      ? await mQ.eq("branch_id", branchId).order("name")
      : await mQ.order("name");
    setMembers(mData || []);

    // v3.21.2: attendance 중 signature 존재하는 것만 (컬럼 자동 감지)
    // 핵심: /attendance 페이지는 attend_date 컴럼을 사용하므로 최우선 조회
    let dateColumn = "attend_date";
    let dataAll: any[] = [];
    for (const col of ["attend_date", "date", "attendance_date", "session_date", "check_date"]) {
      const { data, error } = await supabase.from("attendance")
        .select("*")
        .not("signature", "is", null)
        .gte(col, fromDate)
        .lte(col, toDate)
        .order(col, { ascending: false });
      if (!error && data) { dateColumn = col; dataAll = data; break; }
    }

    // 지점 필터 (branch_id 미존재 시 폴백)
    let filtered = dataAll;
    if (branchId) {
      filtered = dataAll.filter((r: any) => !r.branch_id || r.branch_id === branchId);
    }
    // 정규화 - _date 필드 통일 (attend_date 포함)
    filtered = filtered.map((r: any) => ({ ...r, _date: r[dateColumn] || r.attend_date || r.date || r.attendance_date || r.session_date || r.check_date }));

    // ✅ v3.31.0: 클라이언트 측 최종 재정렬 (최신 서명이 항상 상단)
    filtered.sort((a: any, b: any) => {
      // 1순위: signed_at (사인 타임)
      const sa = new Date(a.signed_at || 0).getTime();
      const sb = new Date(b.signed_at || 0).getTime();
      if (sb !== sa) return sb - sa;
      // 2순위: created_at (생성 타임)
      const ca = new Date(a.created_at || 0).getTime();
      const cb = new Date(b.created_at || 0).getTime();
      if (cb !== ca) return cb - ca;
      // 3순위: _date (출결 날짜)
      const da = new Date(a._date || 0).getTime();
      const db = new Date(b._date || 0).getTime();
      return db - da;
    });
    console.log("[v3.31.0] 사인 이력 정렬 완료:", filtered.length + "건 (최신순)");

    setRows(filtered);
    setLoading(false);
  }

  const memberMap = useMemo(() => {
    const map: Record<string, any> = {};
    members.forEach(m => map[m.id] = m);
    return map;
  }, [members]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterMember && r.member_id !== filterMember) return false;
      if (filterSigner && r.signer_role !== filterSigner) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (search) {
        const mem = memberMap[r.member_id];
        const q = search.toLowerCase();
        const nameHit = mem?.name?.toLowerCase().includes(q);
        const phoneHit = mem?.phone?.includes(q);
        if (!nameHit && !phoneHit) return false;
      }
      return true;
    });
  }, [rows, filterMember, filterSigner, filterStatus, search, memberMap]);

  const stats = useMemo(() => ({
    total: filtered.length,
    parent: filtered.filter(r => r.signer_role === "parent").length,
    self: filtered.filter(r => r.signer_role === "self").length,
    staff: filtered.filter(r => r.signer_role === "staff").length,
  }), [filtered]);

  function handlePrint() {
    window.print();
  }

  function exportCSV() {
    const header = ["날짜","회원명","전화","상태","서명자","서명시각","메모"];
    const lines = filtered.map(r => {
      const m = memberMap[r.member_id] || {};
      return [
        r._date,
        m.name || "-",
        m.phone || "-",
        STATUS_LABEL[r.status] || r.status,
        SIGNER_LABEL[r.signer_role] || "-",
        r.signed_at ? new Date(r.signed_at).toLocaleString("ko-KR") : "-",
        (r.note || "").replace(/[\r\n,]/g, " "),
      ].join(",");
    });
    const csv = "\uFEFF" + [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `사인출결_${fromDate}_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-10">
      {/* 인쇄 전용 스타일 */}
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .print-break-avoid { break-inside: avoid; page-break-inside: avoid; }
          main { max-width: 100% !important; padding: 0 !important; }
          table { font-size: 10pt; }
          img.sig { max-width: 120px !important; max-height: 40px !important; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="no-print">
        <div className="flex items-center gap-2 mb-3">
          <HomeButton />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2 mb-4">
          <FileSignature className="w-7 h-7" />
          ✍️ 회원 · 사인 출결 이력
          <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">프린트 지원</span>
        </h1>

        {/* ✅ v3.20.3: 통합 뷰 전환 */}
        <div className="flex items-center gap-2 mb-4 border-b border-gray-200 pb-2 flex-wrap">
          <Link href="/members"
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-aqu-200 text-aqu-700 hover:bg-aqu-50 flex items-center gap-1">
            <Waves className="w-4 h-4" /> 회원 DB
          </Link>
          <Link href="/attendance"
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-teal-200 text-teal-700 hover:bg-teal-50 flex items-center gap-1">
            <ClipboardCheck className="w-4 h-4" /> 출결장
          </Link>
          <Link href="/attendance/signatures"
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-sm flex items-center gap-1">
            <FileSignature className="w-4 h-4" /> ✍️ 사인 출결 이력
          </Link>
          <Link href="/schedule"
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 flex items-center gap-1">
            <Calendar className="w-4 h-4" /> 시간표
          </Link>
        </div>
      </div>

      {/* 인쇄 헤더 */}
      <div className="print-only mb-4 border-b-2 border-black pb-2">
        <div className="text-xl font-bold">사인 출결 이력 보고서</div>
        <div className="text-xs mt-1">
          기간: {fromDate} ~ {toDate} · 총 {filtered.length}건 · 출력일: {new Date().toLocaleString("ko-KR")}
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 print-break-avoid">
        <KPI label="총 서명건수" value={stats.total} icon="✍️" />
        <KPI label="보호자 서명" value={stats.parent} icon="👪" />
        <KPI label="본인 서명"   value={stats.self}   icon="🙋" />
        <KPI label="직원 대필"   value={stats.staff}  icon="👤" />
      </div>

      {/* 필터 */}
      <div className="no-print bg-white rounded-xl border border-aqu-100 p-3 md:p-4 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-gray-600">
            <Calendar className="w-3.5 h-3.5" />
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />
            <span>~</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />
          </div>
          <Filter className="w-4 h-4 text-gray-400 ml-2" />
          <select value={filterSigner} onChange={e => setFilterSigner(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs">
            <option value="">전체 서명자</option>
            <option value="parent">👪 보호자</option>
            <option value="self">🙋 본인</option>
            <option value="staff">👤 직원 대필</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs">
            <option value="">전체 상태</option>
            <option value="present">✅ 출석</option>
            <option value="absent">🚩 결석</option>
            <option value="sick">🤒 병결</option>
            <option value="personal">📝 개인사정</option>
          </select>
          <select value={filterMember} onChange={e => setFilterMember(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs min-w-[140px]">
            <option value="">전체 회원</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <div className="flex items-center gap-1 flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="회원명·전화 검색"
              className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />
          </div>
          <button onClick={handlePrint}
            className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1">
            <Printer className="w-3.5 h-3.5" /> 프린트
          </button>
          <button onClick={exportCSV}
            className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* 이력 표 */}
      <div className="bg-white rounded-xl border border-aqu-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <FileSignature className="w-10 h-10 mx-auto mb-2 opacity-30" />
            해당 기간에 사인 출결 기록이 없습니다.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">날짜</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">회원</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">전화</th>
                <th className="text-center px-3 py-2 font-semibold text-gray-700">상태</th>
                <th className="text-center px-3 py-2 font-semibold text-gray-700">서명자</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">서명시각</th>
                <th className="text-center px-3 py-2 font-semibold text-gray-700">서명</th>
                <th className="text-center px-3 py-2 font-semibold text-gray-700 no-print">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const m = memberMap[r.member_id] || {};
                return (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-aqu-50/30 print-break-avoid">
                    <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{r._date}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3 text-gray-400" />
                        <Link href={`/members/${r.member_id}`}
                          className="font-medium text-aqu-700 hover:underline no-print">
                          {m.name || "회원"}
                        </Link>
                        <span className="hidden print:inline font-medium">{m.name || "회원"}</span>
                        {m.member_type === "child" && <span className="text-[10px]">🧒</span>}
                      </div>
                      {m.guardian_name && <div className="text-[10px] text-gray-500">보호자: {m.guardian_name}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{m.phone || "-"}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="text-xs font-semibold">{STATUS_LABEL[r.status] || r.status}</span>
                    </td>
                    <td className="px-3 py-2 text-center text-xs">{SIGNER_LABEL[r.signer_role] || "-"}</td>
                    <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                      {r.signed_at ? new Date(r.signed_at).toLocaleString("ko-KR", { hour12: false }) : "-"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.signature ? (
                        <img src={r.signature} alt="signature" className="sig inline-block max-h-12 max-w-[180px] border border-gray-200 rounded bg-white" />
                      ) : (
                        <span className="text-gray-300 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center no-print">
                      <button onClick={async () => {
                        // ✅ v3.26.7: 삭제 실패 진짜 원인 노출 - count 확인 + 에러 메시지 alert로 표시
                        if (!confirm(`${m.name || "회원"} · ${r._date} 서명을 완전 삭제할까요?\n\n• attendance 기록 완전 삭제\n• 연결된 시간표 예약 상태 → scheduled 복원\n• 복구 불가`)) return;
                        console.log("🗑️ v3.26.7 삭제 시작:", { id: r.id, member_id: r.member_id, date: r._date, time_slot: r.time_slot, slot_id: r.slot_id });
                        try {
                          let totalDeleted = 0;
                          const errors: string[] = [];
                          // ✅ signature에 signature 값 직접 매칭으로 이 레코드만 정확히 지움 (가장 안전)
                          if (r.signature) {
                            const rr = await supabase.from("attendance").delete({ count: "exact" }).eq("signature", r.signature);
                            if (rr.error) errors.push("signature: " + rr.error.message);
                            else if (rr.count) totalDeleted += rr.count;
                          }
                          // 만약 signature 매칭 수 = 0 이면 id로 재시도
                          if (totalDeleted === 0 && r.id) {
                            const rr = await supabase.from("attendance").delete({ count: "exact" }).eq("id", r.id);
                            if (rr.error) errors.push("id: " + rr.error.message);
                            else if (rr.count) totalDeleted += rr.count;
                          }
                          // 만약에도 0이면 member_id + date 매칭
                          if (totalDeleted === 0 && r.member_id && r._date) {
                            for (const dateCol of ["attend_date", "date", "attendance_date", "session_date"]) {
                              try {
                                let q: any = supabase.from("attendance").delete({ count: "exact" }).eq("member_id", r.member_id).eq(dateCol, r._date);
                                if (r.time_slot) q = q.eq("time_slot", r.time_slot);
                                const rr = await q;
                                if (!rr.error && rr.count) { totalDeleted += rr.count; break; }
                                else if (rr.error) errors.push(dateCol + ": " + rr.error.message);
                              } catch (e: any) { errors.push(dateCol + ": " + (e?.message || e)); }
                            }
                          }
                          // 시간표 상태 scheduled로 복원
                          if (r.slot_id) {
                            try { await supabase.from("schedule_slots").update({ status: "scheduled" }).eq("id", r.slot_id); } catch {}
                          } else if (r.member_id && r._date) {
                            // fallback: member_id + event_date + time_slot 으로 슬롯 찾아서 복원
                            try {
                              const nextD = (() => {
                                const d = new Date(r._date + "T00:00:00Z");
                                d.setUTCDate(d.getUTCDate() + 1);
                                return d.toISOString().slice(0, 10);
                              })();
                              let sq: any = supabase.from("schedule_slots").update({ status: "scheduled" })
                                .eq("member_id", r.member_id)
                                .gte("event_date", r._date)
                                .lt("event_date", nextD)
                                .is("deleted_at", null);
                              if (r.time_slot) sq = sq.eq("time_slot", r.time_slot);
                              await sq;
                            } catch {}
                          }
                          console.log("🗑️ v3.26.7 삭제 결과:", { totalDeleted, errors });
                          if (totalDeleted === 0) {
                            const errMsg = errors.length > 0 ? "\n\n원인:\n" + errors.join("\n") : "\n\n(RLS 권한 문제일 수 있습니다)";
                            alert("⚠️ 서명 삭제에 실패했습니다." + errMsg);
                          } else {
                            alert(`✅ 서명 ${totalDeleted}건이 완전 삭제되었습니다.`);
                          }
                          await loadAll();
                        } catch (e: any) {
                          alert("삭제 오류: " + (e?.message || e));
                        }
                      }}
                        title="서명 완전 삭제"
                        className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded border border-red-200">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 인쇄용 서명 확인란 */}
      <div className="print-only mt-8 text-xs">
        <div className="mt-6 flex justify-end gap-8">
          <div>담당자 확인: ____________________</div>
          <div>센터장 확인: ____________________</div>
        </div>
      </div>
    </main>
  );
}

function KPI({ label, value, icon }: any) {
  return (
    <div className="bg-white rounded-xl border border-purple-100 p-3 md:p-4 flex items-center gap-3 print-break-avoid">
      <div className="text-2xl">{icon}</div>
      <div>
        <div className="text-[10px] text-gray-500 font-medium">{label}</div>
        <div className="text-xl md:text-2xl font-bold text-purple-700">{value}</div>
      </div>
    </div>
  );
}
