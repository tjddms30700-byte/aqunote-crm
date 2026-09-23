"use client";

/**
 * ═══════════════════════════════════════════════════════════════
 * 📄 v3.68.2 교육비납입증명서 발급 페이지
 * ═══════════════════════════════════════════════════════════════
 * - 무조건 A4 한 장 안에 출력 (연간용도 12개월 1장 표 압축)
 * - 사업자 정보 고정값 (2026년 (주)아쿠 법인 기준):
 *   사업자등록번호 470-87-03982 / 상호명 (주)아쿠 · 위례아쿠수중운동센터
 *   업태·업종 전체 표기 / 사업장 소재지 고정
 * - payments 자동 집계 + 행별 수동 수정 가능
 * ═══════════════════════════════════════════════════════════════
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";

type CertMode = "year" | "month";
interface MonthRow { month: number; subject: string; count: number; unitPrice: number; }

// ✅ v3.68.2: 사업자 정보 고정 (법인 전환 후 확정값)
const BIZ = {
  number: "470-87-03982",
  name: "(주)아쿠 / 위례아쿠수중운동센터",
  uptae: ["서비스업", "정보통신업", "전문, 과학 및 기술 서비스업", "교육서비스업"],
  upjong: ["아동발달 및 수중운동", "응용 소프트웨어 개발 및 공급업", "데이터베이스 및 온라인 정보제공업", "경영 컨설팅업", "기타 스포츠 교육기관"],
  address: "경기 하남시 위례대로 190, 위례효성해링턴타워 203호 (위례아쿠수중운동센터)",
};

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

  const [org, setOrg] = useState<any>({ ceo_name: "하유정", phone: "010-8114-8275", email: "aqu8275@naver.com", logo_url: "" });
  const [guardian, setGuardian] = useState({ name: "", phone: "" });
  const [subject, setSubject] = useState("수중운동교육프로그램");
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [writer, setWriter] = useState("하유정");
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
      if (oRes.data) {
        setOrg((prev: any) => ({ ...prev, ...oRes.data }));
        if (oRes.data.cert_department) setDepartment(oRes.data.cert_department);
        if (oRes.data.cert_writer) setWriter(oRes.data.cert_writer);
      }
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

  // 결제 내역 → 월별 자동 집계
  useEffect(() => {
    const target: MonthRow[] = [];
    const monthList = mode === "year" ? [1,2,3,4,5,6,7,8,9,10,11,12] : [certMonth];
    for (const mm of monthList) {
      const prefix = `${certYear}-${String(mm).padStart(2, "0")}`;
      const monthPays = payments.filter((p: any) => String(p.paid_at || "").startsWith(prefix));
      const total = monthPays.reduce((s: number, p: any) => s + Number(p.amount || 0) - Number(p.refunded_amount || 0), 0);
      if (monthPays.length === 0 || total <= 0) {
        target.push({ month: mm, subject, count: mode === "year" ? 0 : 4, unitPrice: mode === "year" ? 0 : 100000 });
        continue;
      }
      const count = monthPays.length;
      target.push({ month: mm, subject, count, unitPrice: Math.round(total / count) });
    }
    setRows(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, certYear, certMonth, mode]);

  const grandTotal = useMemo(() => rows.reduce((s, r) => s + r.count * r.unitPrice, 0), [rows]);
  const grandCount = useMemo(() => rows.reduce((s, r) => s + r.count, 0), [rows]);
  const issueDate = new Date();
  const certNo = `AQU-EDU-${certYear}-${String(issueDate.getMonth() + 1).padStart(2, "0")}${String(issueDate.getDate()).padStart(2, "0")}${String(memberId || "").replace(/-/g, "").slice(0, 3).toUpperCase()}`;

  const setRow = (idx: number, patch: Partial<MonthRow>) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  if (loading) return <div className="p-10 text-center text-gray-500">불러오는 중…</div>;
  if (!member) return <div className="p-10 text-center text-red-500">회원 정보를 찾을 수 없습니다.</div>;

  const birth = member.birth || member.birth_date || "";
  const birthMasked = birth && String(birth).replace(/-/g, "").length >= 6
    ? `${String(birth).replace(/-/g, "").slice(0, 6)}-3******` : birth;

  return (
    <div className="min-h-screen bg-gray-100">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { background: white !important; }
          .no-print { display: none !important; }
          .cert-page { box-shadow: none !important; margin: 0 !important; }
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
          <button onClick={() => setMode("year")} className={`px-3 py-1.5 rounded font-semibold ${mode === "year" ? "bg-aqu-600 text-white" : "text-gray-600"}`}>📅 연간용</button>
          <button onClick={() => setMode("month")} className={`px-3 py-1.5 rounded font-semibold ${mode === "month" ? "bg-aqu-600 text-white" : "text-gray-600"}`}>🗓️ 월별용</button>
        </div>
        <select value={certYear} onChange={e => setCertYear(Number(e.target.value))} className="px-2 py-1.5 border rounded-lg text-sm">
          {[certYear - 3, certYear - 2, certYear - 1, certYear, certYear + 1].map(y => <option key={y} value={y}>{y}년</option>)}
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
      <div className="no-print max-w-4xl mx-auto p-4 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
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
        <div className="col-span-2 md:col-span-5 text-[11px] text-gray-500">
          💡 결제 내역 기준으로 월별 횟수·단가가 자동 채워집니다. 표 안의 숫자를 클릭하면 직접 수정할 수 있습니다. 출력은 A4 한 장으로 고정됩니다.
        </div>
      </div>

      {/* ═══ 증명서 본문 (A4 한 장 고정: 210×297mm) ═══ */}
      <div className="cert-page max-w-[210mm] mx-auto bg-white shadow-lg my-4 px-[10mm] py-[8mm] text-[10.5px] leading-snug" style={{ width: "210mm", minHeight: "297mm", maxHeight: "297mm", overflow: "hidden" }}>
        {/* 헤더 */}
        <div className="flex items-start justify-between">
          <div>
            {org.logo_url && <img src={org.logo_url} alt="logo" className="h-8 mb-0.5 object-contain" />}
            <h1 className="text-lg font-bold tracking-wide">
              {mode === "year" ? `${certYear}년 교육비납입증명서` : `${certYear}년 ${String(certMonth).padStart(2, "0")}월 교육비납입증명서`}
            </h1>
            <div className="mt-0.5 text-[10px] text-gray-600">담당부서 : {department}　　작 성 자 : {writer}　　일 자 : {fmtDate(issueDate)}</div>
          </div>
          <div className="text-[9.5px] text-gray-600 text-right">발급번호<br /><span className="font-mono font-semibold">{certNo}</span></div>
        </div>

        {/* 사업자 정보 — 고정값 */}
        <table className="w-full border-collapse mt-2 text-[10px]">
          <tbody>
            <tr>
              <td className="border border-gray-400 px-1.5 py-1 bg-gray-50 font-semibold w-[15%]">사업자등록번호</td>
              <td className="border border-gray-400 px-1.5 py-1 w-[35%]">{BIZ.number}</td>
              <td className="border border-gray-400 px-1.5 py-1 bg-gray-50 font-semibold w-[12%]">상호명</td>
              <td className="border border-gray-400 px-1.5 py-1">{BIZ.name}</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-1.5 py-1 bg-gray-50 font-semibold">업태</td>
              <td className="border border-gray-400 px-1.5 py-1 leading-tight">{BIZ.uptae.join(" · ")}</td>
              <td className="border border-gray-400 px-1.5 py-1 bg-gray-50 font-semibold">연락처</td>
              <td className="border border-gray-400 px-1.5 py-1">{org.phone}</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-1.5 py-1 bg-gray-50 font-semibold">업종</td>
              <td className="border border-gray-400 px-1.5 py-1 leading-tight" colSpan={3}>{BIZ.upjong.join(" · ")}</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-1.5 py-1 bg-gray-50 font-semibold">사업장 소재지</td>
              <td className="border border-gray-400 px-1.5 py-1" colSpan={3}>{BIZ.address}</td>
            </tr>
          </tbody>
        </table>

        {/* 납입자 정보 */}
        <div className="mt-2 font-bold text-[11px]">■ 납입자 정보</div>
        <table className="w-full border-collapse text-[10px]">
          <tbody>
            <tr>
              <td className="border border-gray-400 px-1.5 py-1 bg-gray-50 font-semibold w-[15%]">보호자 성명</td>
              <td className="border border-gray-400 px-1.5 py-1 w-[35%]">{guardian.name}</td>
              <td className="border border-gray-400 px-1.5 py-1 bg-gray-50 font-semibold w-[12%]">연락처</td>
              <td className="border border-gray-400 px-1.5 py-1">{guardian.phone}</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-1.5 py-1 bg-gray-50 font-semibold">대상자 성명</td>
              <td className="border border-gray-400 px-1.5 py-1">{member.name}</td>
              <td className="border border-gray-400 px-1.5 py-1 bg-gray-50 font-semibold">생년월일</td>
              <td className="border border-gray-400 px-1.5 py-1">{birthMasked}</td>
            </tr>
          </tbody>
        </table>

        {/* 월별 납입 내역 — 연간용도 한 장 표로 압축 */}
        <div className="mt-2 font-bold text-[11px]">■ 교육비 납입 내역 ({mode === "year" ? `${certYear}년 1월 ~ 12월` : `${certYear}년 ${certMonth}월`})</div>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-400 px-1.5 py-1 w-[10%]">월</th>
              <th className="border border-gray-400 px-1.5 py-1">과목명</th>
              <th className="border border-gray-400 px-1.5 py-1 w-[10%]">횟수</th>
              <th className="border border-gray-400 px-1.5 py-1 w-[18%]">단가(원)</th>
              <th className="border border-gray-400 px-1.5 py-1 w-[18%]">금액(원)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.month}>
                <td className="border border-gray-400 px-1.5 py-0.5 text-center font-semibold">{r.month}월</td>
                <td className="border border-gray-400 px-1.5 py-0.5">
                  <input value={r.subject} onChange={e => setRow(idx, { subject: e.target.value })}
                    className="w-full border-0 bg-transparent text-[10px] text-center focus:outline-none focus:bg-yellow-50" />
                </td>
                <td className="border border-gray-400 px-1.5 py-0.5">
                  <input type="number" value={r.count || ""} onChange={e => setRow(idx, { count: Number(e.target.value) || 0 })}
                    className="w-full border-0 bg-transparent text-[10px] text-center focus:outline-none focus:bg-yellow-50" />
                </td>
                <td className="border border-gray-400 px-1.5 py-0.5">
                  <input type="number" value={r.unitPrice || ""} onChange={e => setRow(idx, { unitPrice: Number(e.target.value) || 0 })}
                    className="w-full border-0 bg-transparent text-[10px] text-right focus:outline-none focus:bg-yellow-50" />
                </td>
                <td className="border border-gray-400 px-1.5 py-0.5 text-right font-semibold">
                  {r.count * r.unitPrice > 0 ? (r.count * r.unitPrice).toLocaleString() : "-"}
                </td>
              </tr>
            ))}
            <tr className="bg-gray-50">
              <td className="border border-gray-400 px-1.5 py-1 text-center font-bold" colSpan={2}>합 계</td>
              <td className="border border-gray-400 px-1.5 py-1 text-center font-bold">{grandCount}회</td>
              <td className="border border-gray-400 px-1.5 py-1"></td>
              <td className="border border-gray-400 px-1.5 py-1 text-right font-bold">{grandTotal.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        {/* 증명 문구 + 직인 */}
        <div className="mt-5 text-center">
          <div className="text-[12px]">위와 같이 교육비 납입을 증명함</div>
          <div className="mt-2 text-[12px] font-semibold">{fmtKoreanDate(issueDate)}</div>
          <div className="mt-4 text-[12px] font-semibold flex items-center justify-center gap-3">
            {BIZ.name} 대표 {org.ceo_name}
            <span className="w-10 h-10 border-2 border-red-400 rounded-full text-red-400 text-[9px] inline-flex items-center justify-center">(직인)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
