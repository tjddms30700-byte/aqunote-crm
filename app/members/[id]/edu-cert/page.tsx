"use client";

/**
 * ═══════════════════════════════════════════════════════════════
 * 📄 v3.66.0 교육비납입증명서 발급 페이지
 * ═══════════════════════════════════════════════════════════════
 * - 연간용(선택 연도 1~12월 표) / 월별용(특정 월 1장) 두 가지 모드
 * - payments 테이블에서 해당 회원 결제 내역을 월별로 자동 집계해서 채움
 *   (수동 수정 가능: 과목명/횟수/단가 행별 편집)
 * - org_settings 사업자 정보 자동 반영 (사업자번호·상호·대표·주소·연락처)
 * - A4 인쇄 / PDF 저장 (브라우저 인쇄 대화상자)
 * ═══════════════════════════════════════════════════════════════
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";

type CertMode = "year" | "month";

interface MonthRow { month: number; subject: string; count: number; unitPrice: number; }

function fmtKoreanDate(d: Date): string {
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일`;
}
function fmtDate(d: Date): string {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default function EduCertPage() {
  const params = useParams();
  const memberId = params?.id as string;

  const [member, setMember] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [mode, setMode] = useState<CertMode>("year");
  const [certYear, setCertYear] = useState(now.getFullYear());
  const [certMonth, setCertMonth] = useState(now.getMonth() + 1);

  // 사업자 정보 (org_settings 우선, 기본값은 샘플 증명서 기준)
  const [org, setOrg] = useState<any>({
    center_name: "위례아쿠수중운동센터",
    ceo_name: "하유정",
    business_number: "680-04-03475",
    address: "경기 하남시 위례대로 190, 위례효성해링턴타워 203호 (위례아쿠수중운동센터)",
    phone: "010-8114-8275",
    email: "aqu8275@naver.com",
    logo_url: "",
  });

  // 납입자 정보 (수정 가능)
  const [guardian, setGuardian] = useState({ name: "", phone: "" });
  const [subject, setSubject] = useState("수중운동교육프로그램");
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [writer, setWriter] = useState("하유정");
  // ✅ v3.66.1: 담당부서 (관리자 설정에서 수정 가능)
  const [department, setDepartment] = useState("수중재활팀");

  useEffect(() => {
    (async () => {
      if (!memberId) return;
      const [mRes, pRes, oRes] = await Promise.all([
        supabase.from("members").select("*").eq("id", memberId).maybeSingle(),
        supabase.from("payments").select("*").eq("member_id", memberId).order("paid_at", { ascending: true }),
        supabase.from("org_settings").select("*").limit(1).maybeSingle(),
      ]);
      const m = mRes.data;
      setMember(m);
      setPayments((pRes.data || []).filter((p: any) => String(p.status || "") !== "cancelled"));
      if (oRes.data) setOrg((prev: any) => ({ ...prev, ...oRes.data, business_number: oRes.data.business_number || oRes.data.business_no || prev.business_number }));
      // ✅ v3.66.1: 설정 페이지에서 저장한 증명서 문구 자동 반영
      if (oRes.data?.cert_department) setDepartment(oRes.data.cert_department);
      if (oRes.data?.cert_writer) setWriter(oRes.data.cert_writer);
      // 보호자 정보: consult_form/extra 등에 있으면 자동 채움
      if (m) {
        const extra = typeof m.extra === "string" ? safeParse(m.extra) : (m.extra || {});
        const cf = extra.consult_form || {};
        setGuardian({
          name: m.guardian_name || cf.guardian_name || cf.parent_name || "",
          phone: m.phone || cf.guardian_phone || cf.phone || "",
        });
      }
      setLoading(false);
    })();
  }, [memberId]);

  function safeParse(s: string) { try { return JSON.parse(s); } catch { return {}; } }

  // 결제 내역 → 월별 자동 집계 (연도 변경 시 재계산)
  useEffect(() => {
    const target: MonthRow[] = [];
    const monthList = mode === "year" ? [1,2,3,4,5,6,7,8,9,10,11,12] : [certMonth];
    for (const mm of monthList) {
      const prefix = `${certYear}-${String(mm).padStart(2, "0")}`;
      const monthPays = payments.filter((p: any) => String(p.paid_at || "").startsWith(prefix));
      const total = monthPays.reduce((s: number, p: any) => s + Number(p.amount || 0) - Number(p.refunded_amount || 0), 0);
      if (monthPays.length === 0 || total <= 0) {
        // 결제 없는 월: 연간용은 빈 행, 월별용은 수동 입력용 기본 행
        target.push({ month: mm, subject, count: mode === "year" ? 0 : 4, unitPrice: mode === "year" ? 0 : 100000 });
        continue;
      }
      // 횟수: payments와 연결된 memberships의 total_sessions가 있으면 사용, 없으면 결제 건수
      const count = monthPays.length;
      target.push({ month: mm, subject, count, unitPrice: Math.round(total / count) });
    }
    setRows(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, certYear, certMonth, mode]);

  const grandTotal = useMemo(() => rows.reduce((s, r) => s + r.count * r.unitPrice, 0), [rows]);
  const issueDate = new Date();
  const certNo = `AQU-EDU-${certYear}-${String(issueDate.getMonth() + 1).padStart(2, "0")}${String(issueDate.getDate()).padStart(2, "0")}${String(memberId || "").replace(/-/g, "").slice(0, 3).toUpperCase()}`;

  const setRow = (idx: number, patch: Partial<MonthRow>) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  if (loading) return <div className="p-10 text-center text-gray-500">불러오는 중…</div>;
  if (!member) return <div className="p-10 text-center text-red-500">회원 정보를 찾을 수 없습니다.</div>;

  const birth = member.birth || member.birth_date || "";
  const birthMasked = birth && birth.length >= 6 ? `${birth.replace(/-/g, "").slice(0, 6)}-3******` : birth;

  return (
    <div className="min-h-screen bg-gray-100">
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm 12mm; }
          body { background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* 상단 컨트롤 (인쇄 제외) */}
      <div className="no-print bg-white border-b shadow-sm px-4 py-3 flex flex-wrap items-center gap-3 sticky top-0 z-10">
        <Link href={`/members/${memberId}`} className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> 회원 상세
        </Link>
        <span className="text-gray-300">|</span>
        <span className="font-bold text-sm">📄 교육비납입증명서</span>
        <div className="flex bg-gray-100 rounded-lg p-1 text-xs">
          <button onClick={() => setMode("year")} className={`px-3 py-1.5 rounded font-semibold ${mode === "year" ? "bg-aqu-600 text-white" : "text-gray-600"}`}>📅 연간용 (1년치)</button>
          <button onClick={() => setMode("month")} className={`px-3 py-1.5 rounded font-semibold ${mode === "month" ? "bg-aqu-600 text-white" : "text-gray-600"}`}>🗓️ 월별용 (한 장)</button>
        </div>
        <select value={certYear} onChange={e => setCertYear(Number(e.target.value))} className="px-2 py-1.5 border rounded-lg text-sm">
          {[certYear - 2, certYear - 1, certYear, certYear + 1].map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        {mode === "month" && (
          <select value={certMonth} onChange={e => setCertMonth(Number(e.target.value))} className="px-2 py-1.5 border rounded-lg text-sm">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(mm => <option key={mm} value={mm}>{mm}월</option>)}
          </select>
        )}
        <button onClick={() => window.print()} className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-blue-700">
          <Printer className="w-4 h-4" /> 인쇄 / PDF 저장
        </button>
      </div>

      {/* 편집 패널 (인쇄 제외) */}
      <div className="no-print max-w-4xl mx-auto p-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <label className="bg-white rounded-lg border p-2">
          <span className="text-gray-500">보호자 성명</span>
          <input value={guardian.name} onChange={e => setGuardian({ ...guardian, name: e.target.value })} className="w-full mt-1 px-2 py-1 border rounded" />
        </label>
        <label className="bg-white rounded-lg border p-2">
          <span className="text-gray-500">보호자 연락처</span>
          <input value={guardian.phone} onChange={e => setGuardian({ ...guardian, phone: e.target.value })} className="w-full mt-1 px-2 py-1 border rounded" />
        </label>
        <label className="bg-white rounded-lg border p-2">
          <span className="text-gray-500">과목명</span>
          <input value={subject} onChange={e => setSubject(e.target.value)} className="w-full mt-1 px-2 py-1 border rounded" />
        </label>
        <label className="bg-white rounded-lg border p-2">
          <span className="text-gray-500">작성자</span>
          <input value={writer} onChange={e => setWriter(e.target.value)} className="w-full mt-1 px-2 py-1 border rounded" />
        </label>
        <label className="bg-white rounded-lg border p-2">
          <span className="text-gray-500">담당부서</span>
          <input value={department} onChange={e => setDepartment(e.target.value)} className="w-full mt-1 px-2 py-1 border rounded" />
        </label>
        <div className="col-span-2 md:col-span-4 text-[11px] text-gray-500">
          💡 결제 내역에서 월별 횟수·단가가 자동으로 채워집니다. 표 안의 숫자는 아래 미리보기에서 직접 수정할 수 없으니, 다르면 재무·결제 페이지의 결제 내역을 수정하거나 아래 표를 클릭해 조정하세요.
        </div>
      </div>

      {/* ═══ 증명서 본문 (A4) ═══ */}
      <div className="max-w-[210mm] mx-auto bg-white shadow-lg my-4 p-[12mm] text-[12px] leading-relaxed" style={{ minHeight: "270mm" }}>
        {/* 헤더 */}
        <div className="flex items-start justify-between">
          <div>
            {org.logo_url && <img src={org.logo_url} alt="logo" className="h-10 mb-1 object-contain" />}
            <h1 className="text-xl font-bold tracking-wide">
              {mode === "year" ? `${certYear}년 교육비납입증명서` : `${certYear}년 ${String(certMonth).padStart(2, "0")}월 교육비납입증명서`}
            </h1>
            <div className="mt-1 text-[11px] text-gray-600">담당부서 : {department}　　작 성 자 : {writer}　　일 자 : {fmtDate(issueDate)}</div>
          </div>
          <div className="text-[11px] text-gray-600">발급번호<br /><span className="font-mono font-semibold">{certNo}</span></div>
        </div>

        {/* 사업자 정보 */}
        <table className="w-full border-collapse mt-3 text-[11px]">
          <tbody>
            <tr>
              <Td label>사업자등록번호</Td><Td>{org.business_number}</Td>
              <Td label>상호명</Td><Td>{org.center_name}</Td>
            </tr>
            <tr>
              <Td label>업태</Td><Td>서비스업/교육서비스업</Td>
              <Td label>연락처</Td><Td>{org.phone}</Td>
            </tr>
            <tr>
              <Td label>업종</Td><Td>아동발달 및 수중운동 · 기타 스포츠 교육기관</Td>
              <Td label>이메일</Td><Td>{org.email}</Td>
            </tr>
            <tr>
              <Td label>사업장 소재지</Td><Td colSpan={3}>{org.address}</Td>
            </tr>
          </tbody>
        </table>

        {/* 납입자 정보 */}
        <div className="mt-3 font-bold text-[12px]">■ 납입자 정보</div>
        <table className="w-full border-collapse text-[11px]">
          <tbody>
            <tr>
              <Td label>보호자 성명</Td><Td>{guardian.name}</Td>
              <Td label>연락처</Td><Td>{guardian.phone}</Td>
            </tr>
            <tr>
              <Td label>대상자 성명</Td><Td>{member.name}</Td>
              <Td label>생년월일</Td><Td>{birthMasked}</Td>
            </tr>
          </tbody>
        </table>

        {/* 월별 납입 내역 */}
        {rows.map((r, idx) => (
          <div key={r.month} className="mt-3">
            <div className="font-bold text-[12px]">■ {certYear}년 {String(r.month).padStart(2, "0")}월</div>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-50">
                  <Th>과목명</Th><Th>횟수</Th><Th>단가(원)</Th><Th>금액(원)</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td>
                    <input value={r.subject} onChange={e => setRow(idx, { subject: e.target.value })}
                      className="w-full border-0 bg-transparent text-[11px] text-center focus:outline-none focus:bg-yellow-50" />
                  </Td>
                  <Td>
                    <input type="number" value={r.count || ""} onChange={e => setRow(idx, { count: Number(e.target.value) || 0 })}
                      className="w-full border-0 bg-transparent text-[11px] text-center focus:outline-none focus:bg-yellow-50" />
                  </Td>
                  <Td>
                    <input type="number" value={r.unitPrice || ""} onChange={e => setRow(idx, { unitPrice: Number(e.target.value) || 0 })}
                      className="w-full border-0 bg-transparent text-[11px] text-center focus:outline-none focus:bg-yellow-50" />
                  </Td>
                  <Td className="text-right font-semibold">{(r.count * r.unitPrice).toLocaleString()}</Td>
                </tr>
                <tr className="bg-gray-50">
                  <Td colSpan={3} className="text-center font-bold">총액</Td>
                  <Td className="text-right font-bold">{(r.count * r.unitPrice).toLocaleString()}</Td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}

        {/* 합계 + 직인 */}
        <div className="mt-4 flex justify-end">
          <div className="border border-gray-800 px-4 py-2 text-[13px] font-bold">
            합 계 : {grandTotal.toLocaleString()} 원
          </div>
        </div>

        <div className="mt-8 text-center">
          <div className="text-[13px]">위와 같이 교육비 납입을 증명함</div>
          <div className="mt-3 text-[13px] font-semibold">{fmtKoreanDate(issueDate)}</div>
          <div className="mt-6 text-[13px] font-semibold flex items-center justify-center gap-3">
            {org.center_name} 대표 {org.ceo_name}
            <span className="inline-block w-11 h-11 border-2 border-red-400 rounded-full text-red-400 text-[10px] flex items-center justify-center align-middle">(직인)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Td({ children, label, colSpan, className = "" }: any) {
  return (
    <td colSpan={colSpan}
      className={`border border-gray-400 px-2 py-1.5 ${label ? "bg-gray-50 font-semibold text-gray-700 w-[18%]" : ""} ${className}`}>
      {children}
    </td>
  );
}
function Th({ children }: any) {
  return <th className="border border-gray-400 px-2 py-1.5 font-semibold text-gray-700">{children}</th>;
}
