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
        supabase.from("payments").select("*, memberships(plan_name, total_sessions)").eq("member_id", memberId).order("paid_at", { ascending: true }), // ✅ v3.72.1: 회원권 횟수 조인
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
      // ✅ v3.72.1: 횟수 = 결제에 연결된 회원권의 total_sessions 합산 (예: 5회권 1건 결제 → 5회)
      //   회원권 연결이 없는 결제는 금액/기본단가로 역산, 그래도 없으면 결제 건수 폴백
      let count = 0;
      let fallbackPays = 0;
      let fallbackAmount = 0;
      monthPays.forEach((p: any) => {
        const ts = Number(p.memberships?.total_sessions || 0);
        if (ts > 0) { count += ts; }
        else { fallbackPays += 1; fallbackAmount += Number(p.amount || 0) - Number(p.refunded_amount || 0); }
      });
      if (count === 0) {
        count = fallbackPays; // 회원권 연결 전무 → 결제 건수 폴백
      } else if (fallbackPays > 0) {
        // 일부 결제만 회원권 연결된 경우: 연결된 결제의 평균 단가로 미연결 결제 횟수 역산
        const linkedTotal = total - fallbackAmount;
        const avgUnit = count > 0 && linkedTotal > 0 ? linkedTotal / count : 100000;
        count += Math.max(1, Math.round(fallbackAmount / avgUnit));
      }
      target.push({ month: mm, subject, count, unitPrice: count > 0 ? Math.round(total / count) : 0 });
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

  // ✅ v3.72.0: 인쇄 시 브라우저 머리글(페이지 제목)이 '회원 DB'로 찍히는 문제 수정 — 문서명으로 교체
  // ※ 참고: 인쇄 대화상자 '설정 더보기'에서 '머리글 및 바닥글' 체크 해제하면 상단 텍스트가 완전히 사라집니다
  useEffect(() => {
    const prev = document.title;
    document.title = `교육비납입증명서${member ? "_" + member.name : ""}`;
    return () => { document.title = prev; };
  }, [member]);

  if (loading) return <div className="p-10 text-center text-gray-500">불러오는 중…</div>;
  if (!member) return <div className="p-10 text-center text-red-500">회원 정보를 찾을 수 없습니다.</div>;

  // ✅ v3.68.3: 주민번호 앞자리 마스킹 — 성별·출생연도 기준으로 7번째 자리 자동 계산 (기존 "3" 하드코딩 버그 수정)
  // 규칙: 1900년대 남=1 여=2 / 2000년대 남=3 여=4. 성별 미등록 시 추측하지 않고 생년월일을 그대로 표기
  const birth = member.birth || member.birth_date || "";
  const birthDigits = String(birth).replace(/[^0-9]/g, "");
  const genderRaw = String(member.gender || member.sex || "").toLowerCase();
  const isFemale = /여|female|^f$/.test(genderRaw);
  const isMale = /남|male|^m$/.test(genderRaw);
  const birthMasked = (() => {
    if (birthDigits.length < 6) return birth;
    if (!isFemale && !isMale) return birth; // 성별 미등록 → 주민번호 형식 생성하지 않음
    const is2000s = Number(birthDigits.slice(0, 4)) >= 2000;
    const seventh = isFemale ? (is2000s ? "4" : "2") : (is2000s ? "3" : "1");
    return `${birthDigits.slice(0, 6)}-${seventh}******`;
  })();

  return (
    <div className="min-h-screen bg-gray-100">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { background: white !important; }
          .no-print { display: none !important; }
          .cert-page { box-shadow: none !important; margin: 0 !important; }
          /* ✅ v3.71.1: 인쇄 시 글로벌 헤더(회원 DB 상단바) 숨김 — 증명서만 출력 */
          /* ✅ v3.72.0: nav/aside 등 모든 앱 크롬 숨김 강화 */
          header, nav, aside { display: none !important; }
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
            {/* ✅ v3.71.1: 실제 직인 이미지 (public/seal.png) — 배경 흰색 도장 파일 */}
            <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABpCAYAAADMfIaKAAAQAElEQVR4AZS9BZwcx9H//e2eWTgQo2VJBpnZjtmOY0pijhljhpgds2Uxs8zMTDEzMzMzk2yL4e52d2b6/dXcrR7FT/L8P+9+pqa7q6urq6m6unr3zichBIO0I7R4HQxXB8P9t/iSeZn4LAlWxvKXBMPVYUna/xQ3uqoyah1gceOlZC53TfVZug5Gb1BP10OjN3ymiIUGigYL62DpJWHJsoY3OsPV45a2+JJguDpNHW84A8PXoZ6uh4a3uHe0f0J7kL8NZ7AkLs9Y4mV5BkugWLKM5RksmW/xOo3lGWRCWmhQj6fC1eMWOisksNBA2Ri900toS+Z1W0SoPM9CSxtYPLNXAsbPwJL10OIGVq+BxQ1yRmIQlKiD4XJehheo03OeIrEsYchlWZK3xS2zLqvF+d2nXt5bxLVU4esZuK9mwFc/4779jfDdTFDId4p/8yvuh9lK/0r4/jfcjHnw0yycgJ+E/3U+YcZcwuwW3JxWwtw2MJhnYQW3QPzntiqvBWYvwinOwipuUVV0iwhzFsH8CoajJcFXsva8VsUNDLeohm9LOyDBVVJcEvDVgKtlYGmLJ+CVtDxXU57RKN8JZx1hA+rVGc4gQH1Q62mfsvhjtIbPe9gighxnYQeVc27J7A4sWB2WcHpFgpxIoaVVJE8aTZ4W3uIKyFdI7bX3aR05kWzCNJLRU0gvupps1ASykWNJR08gOetssmFjSMZNVHo86TjRDBtJKlw6fDyZaLKxk0hUJhUkI0QzSrRjppBNOp9s/HlkIyZQGzyU2tAxpKOm5rhU+HTyhaRjppFOmK688dQmXUB67lXUhrXzqI1UOUF12DhqY88hnXgetdFTqSpeO+cKKuPPoTbhPCrDVN/ki8nOu47atCuojZpCMv0Sqsb3nCupnXc11XMuIVE8mX6FwitIL7iG2pRLqE2/knT6ZSRTL6E6TnJMvYja+VeSXH4zVcmSnH8d6XX3kN36ANVr7yC79ymSW+4n3PYgbdMvJbn2dpI7HqR2632Ex14kPP4yyZ2PkwqqN99P7aZ7lXc/yX2PkT7xAuH1j0iee4Psnc8Jn/1A+u0MSDU7NCL5wPi2KoXKIlgwi6h1Pu7nb/Gzf8L/+h3+l6+JhQuzviYSLpo1A/fdp0SW99sPRL99Q/TNB1pBX+G//Qj3xTv4rz9U/DOFn8DHr+M+eYPo24+Jf/ySgvhFX79L9OHr+M8+wH/xEdHXHyn8mPibT4jeeh7/zsvE332F//QD0amsaOPP38G9/aLgZfz7rxF99Db+tReIX3uW6I2XiT9+Dffqk4RnH8E//ziFd19T/kvEb79J/OaLRM89RvzSM7hH7sY9fg/uiYfgyceInn4Y/5jSTz2Cf+oBohefUP5d+IcE999J/MjtKnMn7q474PrLiP51HVx5geIXE26+lsIjd+FuvxmuvkxwPtkF08guvQhuv4Xs1ttIn3wKvv6a9NHHya68ShNmKunYYYTpEzTxztEEm8Si8y4iVLW06wMSsgTX1BlKZULSRli0kKxWIUtT6UePG7Airqz8NIGkAiFT0UigvFpNSaWrLZApLy7gXERIq4R8bSrPKy0cvijaFHxMKDdCJB5tLQTxC9UKzspnbaqjJl6iS1J8FOMKJZxzVgwXhLdyqeozxR7HEJI8P+fnHegJ5RIhUn1GY5MtXYRLK3jhXXN3XKGgcqozCkQlxeOS1EVQfY6o0IBXvguW78SuCtn8PM97pZM21ASc9JsrlnHSh15N8aoPJJ/yo559iDbfivJZZxIffgjFU04m3moHfIiI1M5I/RPN0+Se/SvqHfHyOMALxLxAaFHHaCDSYgG3+Wakm/+J2vobkW6icOmlSFZeherSA2lr6kTSow/VXktR6dGLyqCVqPZblmpDM7VCmVpZYVMzaecuJF26knTuSbVYotbQmUqpgdZyExXh0y7dqZY7UevZi3TA8tS696LauTuVxh5UO3Wm1kV5DY1UmzuTNHWh6sXblUiiAmmWkoSYVLwSDay2CnWDJ6mlpOqURL1Tc0WyUolUA1a1dKkTVRdJFpU3WYMjcyrT1FVyNZOonlqXPqS9l6XW3INaU/c8rMYNZJ26ik8Zm8TVqElt6kESdyYtNAsaSeMiSadeZJq4SVwmdTFtv/xE27zZpLUqP114IdVffyHr2oVasYFqKEj+QFAesSPu2kPD4AS0D0iII9AsdUmNLCrBzjtqZE+iYdTZFM88gcKpx1AcfialsaMpTZpEYcJoCuNHU5wyjtKEMZQmTaA4eRLxiLGC4cobQzRe8TEjiMeNJB4+hGjYmRTGjaY8dbLoxxONOIvC8DMoiU9h5NkURg8lHj2SosoVxojHhLHEI4QbOVI8RhOLlz/jNJUbgR86DD94MNFpJxCfcQbRP/+JP/lUwqGHER17FP6E44hOPJZ41BCMZzxmjGQah4Wx9sXo7NNxJxyPHyH5rL4J4yhMUn2qMxozjHjyBAoTxxGPH0c0boLS04nGTsCddgbx6FHEExQfLhmGDiEaLnmGCU49iejM04nHjMaffhqFk4+nsP0W+N5d6HPCPyhv+geiv2xGPGqo6M7KJ3GWBjJpBl8uQ+TJNCT5CqGtQqjIOtI6TKUmUpkp+RYTOZxBUQNWiHBdm4kG9sX17Snoge/ZFZrFrEdn/KCBxGutgl91EG7ZpfEDlsL364Xv35do1RWIhY9XXJZo6T7Quztu6d745ZcWn55g5Qf0VXoA8YrL4I1GdfjVV8QrzbL9iNZchWjT9fHrrEa84brEG6+HX3d1ovXXpLDtFkRbbUbDnjsRb7Mpha03p7jZBuLXX3UPIl59JaKVliNeW2XFM1pleUrb/pFovTXxg5Yhkuy5PLncfdXGfnirc/n+FNdYBbdMP6LVV6C0zeYU1lwZv/wACuuuQbyW4uuu2i7D+mvhB/UnXmNlCputT6z6SxusrT7qQtS3F66hoHb1ytsR/3EjwqCVtZKKUusRaav6P8vaVZZ1fO2HH/C2j6Rt0NYqPa2h6ngyhQZGp+jiQl6qMvt5Hiyo4BR3Mk9DS619ybVqD5Cp6lQoz5M5imhyEBNnDBeJRjPEWVpgj8UtrEOm8gYoNJzlG1jcwNDGysDiVkU9bvlL0lr691DPt/D3UOdjfJcsZ2mjXRJncaO30MBo6mBp64d8+ltCEGSG+7mziUJV/RXhtU0InT8+VBKy337FSYcSVJUeNFqLGSqiJx+IoPNHRSZf5fxrZSZeQXXkOBKZnZnMzOroKbSNmkC45l4qo6cKP51k8iUKzyEZM43a6MnUJl9AcuF1pJfeTEXmZWX0NCo33EXt3c8xga0eAxMhB72cIK9c4lZfeJOF066k+sLb2F6NEQtff4zUK2Fh9eMvWXTx9bJ0HqZ2zZ2kV91B7bIbSG5+UCbqY6R3PEr14ptJr76DxOS5QG269RGqN9xD212Pkn35Q84+nxDiaY9VV/vsOxbd+wTpLJ29hLS6FEjDJFR1fKh+8m1eLh8EZYRKjZY77mHB9beTaY8TKm9OJk2kLQyn7SJohdTpvS/GxN2kQlSbZTpZLOSttaIC1eg185MHXqBt7BTCVZfLJFQDH7uXaIYq//gdas88RHjvDfx7b1O991+52Zq98jjpY3eRvfyc8t4kvPYivPAcPPoY6cP3EX3wFvE7b+PuuJ2azje1Ox/F6eCn6lTp/zwSqz3RViN54FEKD99Fy/k61/z4K3nL+M+fhXc/SLj7brJ774G7biHcci3cLXluvYlw6w2EG6/DPXgn4Xal77wBf/dtZNdehbv1Rrj2GtqGjKT2yPPkE6JehayHlsuu1RlmGm33PURdVpsELbfcRWXkCBaNH0/4bR6WafmVF14lueIS1Xk9ydsfaUUABY/v0V3dHOMKTVR++4WQylJUlreCNJZlDbSIIJX6qRJqtRxtDF01peXCawjXXkHhmw8JRU9r/36kB/4dd+YZuNNOwZ92Kk4baXakNtSTjoWTToITT4ZTzoDjj8efrPQJJxMO+jvhwP0Ie+xK+pdtqa23DrVyA4VFcwg33UjLuGmkP/xmiyWv30vASGAhSUIiqyWW2Rq3LZQVOl857U8up6I2eHVo3GNn0h22I/nr1mTbb0fbZpsQ9tsb9tqV2sYbkmy8PumGG9K2wopkW22j9GaELbciXX0NQmMDpfm/UbvtFrKfZooz+aynWtM5bSEl7bHZLz/neHvldX72KQ1UiGst8hyoD5WR4xe0UCg00NBX+0uxMW+bsjQAmfq7SjrvJ0q9+0JcyOvwlplVKuR6XeZhRgHnojzT8tJPviK8+Axx20yZol3w//gHTVOnUj5oX22yfyDefMP2TXS7rWnYfXttrptQ2G4birvsQHHHP1PYYRvclhsT77AlhX3+Rrz3TpQO2ZfS8UdSPvtUCsMGU9tsC9D5I9ZBr/rgI1gHW2OsfgOLO5mwhc7dyaRW7Qzjm5st69/AFrbRmj4vrLwcnU7+B+VD9qFw7BE0DhtC4eD9KBy4Nw2yzkpnnUJx8Kk0jh+l8DRKowYTn3GsrL4RsNPOhKau+B+/p/b2u7k8eUWaqF4z2cvA8eqrHGcvVeiyGmg5eWJCFrA2oE/cTwZOj37U5s8jmT+rHS965s/GJa0amCrY/u3bS+S+rKylDSezV+UJ2oVDKuZKBEHa2qplZqOpxPIrUNp6C1y3TljjTe+pbozO0qLAEobP43pZngLxV1ZHwuTJy2npRmuupE47gFS2eFwsU/ngI0JbYmzU+aB9P49bhU6d4KII31DGNzW0N86YC4y1tckrbqAgL2d15U2NXT47jS4TQuMKUteus2at0qiTnRUUXXHjDQiduhC5hPSnH41VXlfQ3uq8x/lYnZnm+PrLzqsmbEiq6t92+S0v/eUX0gXziHyRdPZcQ6kj9FiHCZwrkC5aAKlJCt4o4s6dCXbS1kB4HWocEfYx4QuDliXtuxSZK+E+/47kyVcJMxfIKgPnwDrBQR5HH8MhhJ68Q6wCixtuMa3o6nHfmhLe+UTumTaqbTpN99EhqRTnZa1+kbY/6gg7Lzk1jFoCrVVj2Z6nd16Hwt8/hjcwOQws39IW1sHwS+KCDJ2wcH7O38tLsJhOEwJtzNbptmINbzJam6OmJoImCzokOm3UlpdDqKmvqnKKLiD9XMaLkEHdG7r0JHQfCA1dyLRCQseC8CaMj9XZjTpTqMIQFaBUVDE9qs317Exx7z2pagb71nmkl11A9cwhVMZOI73nKbJnXye89Snho28In/5A9uE3pG9/Svbxt/iftTeYB/m7Xwmff69N7ROyr37CvMjhw69J7346dwxmt9wiT8FCqoNWpHHv3bEG2ohYaCBJwJaUpDV3TpBaJTbJwTpSYho59rG4hQb1PMtsn3+GxZKLI0ZvrDVZ8wyj86on0mol8zibOe3UBK2QTEsraE/QxtCBhUzLOMiaci7CN3fW6v0fdRp3741zQWWDziPaK1TK5CoOHES0ylrQKuU8dwAAEABJREFU1IlCr6XwUaQcyFWWqah8hLw2FulC1yGyCWtQ3HQDGgafRU0ulVqDVMXP38Lzj8mJdiHZ5IkkI4dTG3I2yagxJCNHCUbLWzuC2lnDqZx8IrXTziQZMox09GiSs4YqbzjJqOFkV1xM9ubL1DJtbrvsRPO4kRRWWh4HOHvR/gkWCOGRZBkEJxWqTsvR9uoAozMQSY6ps7DOrsct9Mq1UOzswV5i3x4CtS80WRYtIhFR1liizjPIwMl3V+mnUNKBWLSWZ2rCBkK+GzKd44L2GWW1P2mKswFs7kY0QCuiHUvtR9Xx9mugfSX79WeCjBbLMtkIUgGeTHwdrtyILb2g3FxIRUK5iFt9EI2nnkB54lg49jjYcx/Srf5IWGct0hVXICwzkKQckzTEoBO6W6Y/meKuVw+ygid07gR9+0KPTqSVBSRSS9mmG5NpRZTGjqDhyINxPbpinacqVbs6XhE9eRwTplBQkILT0zEgi/PB0NhH2VjDwozZpPc/S9ukS8iuv5f08lupXXoTNZ1PkmvvonblbaS33k92/1Ok9z1JcttD8sDKPL7tZuK0lWrkKay8cj4gxlPznKR1kQRTG3+drc6sYAdkbTV5H1JoxNnKlf+Mjk/y4w8g90hWbSNUqx1YBTYAdhC3yWibu1afsPi8Iu0doaSB0MxzctxhrbHcOogo2LJsS4mkukpbbU35iMNkrZxMccgQSkOH5v6p0rTJlCdMpCRfT3HMKEpTJlKcOp3i9KnydU3I06UpUygJl8MQWTmyfPxyAwiSRNVQ71WLC5WLYuIEyZXOn9uebSaiBsRWwpIDgj5WTgGZ1OeicdPlJr+OglzvyU3X6ExyF+ic5O65Q2b2NfhbrodrLye7cBrhgqlw+QUEnXPcvFm0FmJKBx8qV8gqxi6v18vFE5ZbjlSzPn77dWqDR+jeZapgLPEnH+FKRYLtMcrPC9lLgxEqCzFDJO7eMx9cQ0fNnTT5NLm0RcR9B6psydB4a5QTsl1tCaeG+ijOO0IpbGLy23wqV9xC5cyh1M4eTXX4ZOyUnUy/ksrE82kbPYnsujsJdz9Ketu91K64QTPxampX36xLmodJ73qY5M4HBA/RdsPt8MJrhIeeJr3mX7SdK7oLrlEH3Uum03O47xnx0Gn6X49Su+8pknc/yxvhnFNYw8w1F5XwmoWOf/+EjqSXG6f1mpsoffWh9qZ5JOuuQzhgP9w/jiDbbnuSLf4EOpvUNtqQ6oorwaabkm2wMclaa1Hbehs45RQaJk+mvNeu0hvtTI130EpvOvZIUtEnsYfvvya8/DThpafxC37BVFbQWcNrZdVlM4uOuEyoJmRaJXW8V59b55vRENnVR2Y1gNeiIG6QhaBDj6YpdijMdC4xMVSlTp1zaZl4LtETT1L49guyL94lfPUJ4f23qOlyx73zKtFn75E8eBeJZl946hHCEw/jnn4M/+zj8PDduPvvgLvuILv7NnjoPpLrrya74ybCv27DPXwvTpdB6U3XkV19McnlF5FddRnowic5dwrzL7lMJ/hEswlcLqMETyq5nIrx+0+OkwqObVbKeVbTTCwccbjOTftQ2OUvFE84Up7sUymcfBzlUcMoTxpHPPRseZuHUZo0nobTT6Kw1WbEgwYSrGMdmgjtoChu6Z40nvVPTANw0kmE447DHXw4abfe+T7gpIpCki0eSK+rBKSOgvbmTN70uryZ92Tib/dAme6EEHOT3fqcVCZkJJWFPL7Ykugw20RD5dmX8R+8LUeYdGp/La1jjpOLeSjxiCH400/Bn3maXOFnCk6X2/tosv32gr12I1lqaZDVEZI2Ep1+Oe4fZPvshTvyCNxxx8Bhh5DuvjPZAfsrfiTZrruS7bkH2TbtszfbakvY9s8077M7aG+yTS9UtZ69tlWdhoMaye8+tv8YKtSqpPPnqxdTslIBp3sIa6yBc44QO2zm2ow3LwWRWmozvije6hHVkg+C8TJQLkJTD31DiVgHz3ibTSnvqgPwfnuT6j4HUZhFhfmpUPUGs+fqrQkl1ZUtXJTzNTnQXT++gaA7JC/XVS6DKE1Ni42RSAydhp0sLaeo8vLCXkstauxETasm2nJLSjv/lWiNlYjkBi9qJkWbbaDT+ka5O9zc4OUD9qJ4xEGEZQZpVjuTDTaTS3wnzc79dtcJ/i8UdvozxT13piy68kH7EO+1C+WjDqJ4+EGUdY9QPPlYSqefSOPZp1BSHSaO08HJOYc1WIHEcwKwt3VWDpYAgqyhvOK4UYPZjCsW87Yoi7wA5EEH+eJ4zgPyzrceUTR/MvFrue0hqnIh1a66leTiG+SYvEGq+VZaJ11Mdfw0XU9/BxGYCnLaf/KCeqW//SaTtoDmJnH3bsKQ1+cLEXZ7GTSLEnl+gwbRo/J5Y839W2zA2S2bRA+Wo0wnQC9nONnfdOlqmBxMYCtrCYtre8LSBnnaySaptWHXqF6+GsOJzWIao6uD5VncQuNjUE8bTiKol1WTIkHdlen2z6nRShrLHJRrouaQr5BKG+oJMp2cg1SFE4HxqoOS//YY/t8QSyTSeQtpuf9+wqMPkt31L+2Vt0sN342/+16iZ57C6x4+amvFq1PTlvkETd56cafV5FR5UP9lcr0oWs8ibVkA1QUkX3+FHXQz5XjrIRMmuJALT7UF2tQYZdrjTH3FNkI12c4y4YTM6RXaY3ELjcLCeoVWzheKuDQh7yXABON3nzq98TGwtIGRWdogT8tyCdbJsra83Bpm0RiN5RmNNcZCw+VOwDjWINbwUhW0/k97LN/KWGj0BhY3MB62t9ZxFhrEPbrQZdTZUsnHy2G5A2GP3altuYVCqdyddiLdbmcSO6+on3xUMFaLJ0mkSRxcQW1XD9UqeZ69nGkj63xVGnXvgdOtocklqqBOS3GFsiaUkrKwKLabYFbQfPjerBrntfQLiyuyvDqEekShMUUXUm7uAiwe5ErAeCrv94+VM5olYUkawy9ORx6vVYxO0EHqy2BxXkfE+Bk4rXhXkLrSinctLWTzFuUUxs/AK2WhgcXzMnWckHpy2S3PQE3XreIA4r9sSfnYw4iPPlSb/z+JD9+f4nGHUDjuWLJlVyHvXyOW+Ws8rLNqP8gzId9XMNDRQdXkj+/cLb+D8jpkOq16WxAmh0eNy2bPgtaFaFVJB5Zx6kDLNHBmNWgDDRqUuHcf6h/Lq8cttLQJYWFYsAgn76aTlZN1aiTSQdFofg/WWE0Q8jK/z1wibfnZvAWa7VptZj1pNqLDqpU1sHqXIMfp+jdZbqD2vRbKZpFddU1+KExufVDunifyS6j0pvvhtgdJZHrXtDekV9xGcuXtpDfdR+3au0mv0F5x4fVUzrmS6qPPgW75TA4bKavP1LqlDVzkyWxlaDBcQ6zJHedtciKM7ECskYrl8S307aeYJFWhyifvY6d0hHHm/fCacMryzjkyUys+0rLpRGqMNcIqo2w9xaJe4uwigmgVUxqTKwc6PoYPKqSH9P1PcTN+IpF6yZZeWgPSF8MbdJDngZWxyO/xhjPI8XrpIWtplVnZipPRYUalcy6v3wbVidhAQf4EWUtN/zxSKmUPqo3NhPfkb5PZzY3Xkl1+GejuhVt1YXSNDoU3X6f9QGcomeHcdiPhhqt1aXWj9opbCPfcqvPSfSy87gbCnPk5b3tZXUvWG7Q3hEWtmEC+ay9cXKD+8c3N6vNAbdbP2jMWaS0oR4PrFkiDFJTnNWF1/2JlrZ0e73Dyy7imJjKZk5HCdv2mgnpy81IrJNVpnqh95K2gsoyHBeS9rZj6SB7NH+SCuJuYhDZfoqx7EZtNyv5fj/Fxwhoo+M+PMvUQdeuK055EoYQvN+W09U7JE3oZneEUhc5NNMiKi88eTDjyaNhvb9yOO5Dt8Bey3f9G2GsP2Hsv3IEHEnbdjWzH7bQ//EV7g8zuffcm7LY72U674Pbdh6YjD5Vbp0vOtv4y2etxa7/1U1CPBE3uoP3O8oJetocQF0EGjma+MHq0GtDKIJE6VadlmvRaXMoAj3axyPSbNkynjs8WLZSD7H82Qde/Ly2NMRVdOUYDlrK6VW1e1li2x117On3zY7Jrb6Y4ewaJvJ/RtltR2GT9vEw7xb+/TWADw3awsGgO9bSFBohL3mhNDDMRZYPkdPaq87C4gdEbWLyw1iqYiV04eB+iYw7NL8aKRx1IrAu2wmF/p3DQ3hSPOZyibjpL/zyehjNPpiBTvHjUwRT/eTSlww+guNWmEDljJylMknbIEfaS2ldHCqm1q/NPkM/KqA3S+QswL4hvaMbVV45c7cE2eLnmnSAS3lSvsfLYRqMR9A2d5JXIkGbCR9KDlisobr4BzdMn0eWcyUQrLisM+SBYZd7Kzm0hfPgNFXPYTT+X+PP3qS2cQ2211Wi061okp8Ae67glwXD/DYzO8uqhxZGrOkhA51KCBLC8JSGn6XgtxitiqlTzTuciydKRNpzBv+FVVtntdIqjRJ6vuNEqEIP8yaP2EonoZRTpLsc7Tz5pNLENb/mJzhjooBps0KRKDWeLANG6SCvHa8vQBWE+u5Xpg2oNdkESK0MLxsvvgoiMYSYCUze+e1dsU8u+/Ins8x9Jnn1DHtJnqUy7TL6tUYSxY4kfkk0+dwYVJ2X1521pPO1E6NSwePDE6r/GLe//CbLxnZmwWhrZgoU6/GmDVyGTU0H+aIwWh/W4moKzhIGILW44lK7HLfw91BkZ3tSghYtxeaR9YMSG9N2PiVsWaWMXZZ+++E7tKtXIfKOsvSinUp9bKKyOEl73JsE6N2og6XCdKAev8YAokhOuRZ5GuRxatcS0STnlij211z9k0fDJVAcPJx0xinTcRMJ55xOuvpL4hWeJvv+SrHU+Sa+ecuKtTyx3SvOJx+B7dc9Z87uP8a3D77L+76QZCIvm4zQwoZNWc7F9FRuv3xe02Zy8ppX6yHOkz75J+uQrhGdfp+2Sa6ncoQOeLsnCR9+SffAVmZyX2Rsfkb0ueOW9PAxf/gwdEETD5z8RPviazPJffBvsqz4fqt0vvU167R2kl14ui2kOLQ2NNOy3J5S1qYf2AYtlZTkb/biI116Ry1pLQVuD4W2gI9sTRW953kl6bwUWzBGHLAfblDryc59Q+t03oBNoVmvF6wIgLTpqS/cm2WYrkr33wZ12GsWJEyiNHEph/TXRMBtH4/+/oM73f2UI4TrAd4QK/odPY5mk3ExVbgwbkBChGUc+6PVykt6KkOmuYt606aRTJugCbbJA4YQxFO66GXf5haRDziYdNZZk+EiSYUNIx44mGT2GdNxYsgmCIUNJh48QzQThBOOnSAuMF4wjHT8qp81GjiRMmkB6+0049Ut1pVUpn3aK3PUr5jJbR5swycIW0rYq0mJk+dI0bEam4wQiCmZI6W7IecOjrjOkVEHQDAzyUjoX4QqFPDfoXd56E5rPm0RB9xuFUSOJRg+nMG4MpTEjKZx0FIUD9yLafENCn66cKBgAABAASURBVO5gS9MKqVz9+V0SpwwDBfljcQOjq0Oe0fFajOvemfKRckju+jca/rZjR+5/DrxoGw/YB+RqD5tvStAlE39Yj2zjzXHrbULatRvZgD64FZYl691Dack+SPFlllG8G7VuyrdzTDGjqo7K+vUiXWYA2So6/K0uPj17iq6RWp/eZNtuI0frcBomjCRed418kphUJreFpa22IPvLTvhttsX37ZVPINS/obGZzAwU9XsigyrvGBXwZCoqRxcNnXEyx1xawfz69U7yikTdOhGvsAzxKstjVlc0aCBeOMla55OHTrR5RIztEWcLFkM920JDWn4d6jjjaXkGhrN0HYobrE7no+WEXHUQdZyFS9Lm/OTnatxlOxpPP5HiWSdRlIu9MHI4xdHDKAiKWjml8erAMcN1WTaV4rRJFCeMpqjZXxw3ktJExUcOoTR5HA1TxlEccYYmoNLjh1EaN0T8xlDUCixPGk/DScfh15SzVQdVk8XAZDDZTS6/Yn8aTz2KxqMPJOrS2N49yvS560SU2nOjrl2NNAdv3sYMrYpSE8FHZDLBXLmUZ/7/eamOvDIL6+VMOIN6+j+FRm80Flp+sNf/Af+v/HpRo8uUyIxxg1Z8QbVoBYdSBM1lgu1Bpiq6yhzVtXJmNJ0bYSkd7NRx5qJ33bvg+vXOae2waWVCPnkLOJ1zXLfO2J2J1aWq/uuTqWoDozMwwqjUALJmM3kz0LZhOAPvlDBAiylI0fmeS2GHxDxTL1tAxsRAJGTy41vcwPIMp/pEaRz+MzjlGqiqfEFaaHLIesVZr4mZE9T5iPzfHmVZNTluybgVzWXIc1S3Mo13Xpdl6kTsFRrvDpI8sHqMxhIqkk+kOq6OtzyrNE8bDyFyPioQbB9rqUFbkoOTEPl3yZS2PKtT5OT6qxbIy+UIjGX+ynSJFqKyxqRAOmsWRhtE45GecXZIWTQnL2i3hbkQyrTHiIIqzH6YTfr4K9TOvZKqnTmeehV0+KOD2IIlKzYTufavx0mv+he1i26g7fp75H5YABrQFl33ViecTzLhXJJpl5Ocf43gapILryaTP6mqOtLLbqR23lXCX6vD5t1kNz1AcvXtJLpKNt/TovOF//hrJL6JmYOdTdCtYuX2h3XFPJXKiPHUJl9IZfIlusu4DvtCQ7hdV8PKr914r9IPkV5/l/xWt8laupPaZbdI3ttou/ZfZD/+lvNOPviShSMmk15yM8lFN1Ibfz7VIWNpGzyK6rDxtJ01ktR+6zh6Im1nDqNtiPCTLhDdBVTHTKP1rGFUL72O5J6n5cX4EYc+mjVBFmOUtuHlCfa6VTQL2PK8sgkL1VGVRQQtadvtMztJKsMGw/aQ9NUPaBsxgeySi3BPPQR330UyfTrVcy4n6L7d6DRm5OpB5bIZc2i94Aq46QbCnbfpivYBWuVHSn+UOSmro/rII/Ccrneff5LwtOKP3gNP6Or3vjtltVyna967yO6+HR68l/CA4v+6VfjbCHfcBnfdpfxHiB64h8q5F2HfLFGV+cyzmVmRwzC75pr894TRu28RnnsG/8wTuAfvIlynAb/mKl0PXwnXXUl2leS/4VrsjiO7/Sb4l66V77hDzscbaHv+FayDap9/QfbCM4RH7iF7XG1/RTeo771J9PVnOF1jF775FJ59nML7rxN/+h7+g/dxr76u9j0Lzz9H4d13cHffqsusS2l9UHJ0CGv9SkjIsipRY1Nel2V5bIpJl/mmXvhCAz6SfszIG2gChS/lBrn+FvyMb0mWHQj77wd/2wX69VNjn6Jl+gWEBa0gYg8Y1F56naD797DmaqLfSz6h7Yh32wW7p0Z6uulEXefKV5T++a/yIW1PbfM/km3/F7K99iIccgju2BMIhx+GXemGPXcn3WVHst12It3tb9T+vLXusPeHzTeGH76l8sTzqrVd3urrH5A99Cihd0+ygw6FM88gO/xQkk03oaZTcdhwA/modiLsu6fq255kp78SDtXt5gH7CrcPHLg/6a474uTrKm26PuoGiltvTklmsT/jdLBfZw0+HT9sBP7YY/HHH49be0OdL0oE70k33hR/9NFw9OG4Y46Ev+8n2f9Gttd++IMPlF9v27xf8z3DJr0srOC1p5VK1n05eNvUnZDBDoStrTljdJKst7L2xDNavjpEbb0V5ZFnUfj73vIHHUZp1BDYZFPCW29RefJ5bCBspVi59KsvyWTpFI46lFj0hWMOpdMxh0GDNlNNjaIa2yBcw2nHUzruSBrPPo3SsUdQOvIQSvvvRWHX7SnttSsN8ieVjjokv94tH7JPHjaeckz+pe3SySfhVlyF6ltvYPuRtbT24qskctgVjhavv+9BvMXGlPfYkVgDUvUFon32oqir4sIh+1E+5VgaTzqG4v57UhRt0fxXB+1PWXcdzccdRjRQe6ka5LV5lzZbH7fZBhT+uiXRpuvhN/8D8XZb4tZdm8qPP2qip5rpGVm5MwW74t7uT8R/+2v+pfLyiUfKXD+I8t47ES+/tHWPDuGt1H75SVtEVRBo++n79jFSrjZ1p5FxUJ2naVYjlaMRndyFIfvuN2ovv0pYc1Uajz8CunQSrUrpcUv1pHjIAQSd0KvvvpvPJqFzxsi14bp0xnfvltMbL+swy/eadsmHX5G9+B7Vux7X/YTg8Zfy32Ik9z9Jqr0pefJlkqfVuc+8QfLCO9Seep309Y/JXvuI3IH53hdg+4eceFGkqaAKXJtk//Jz/MCBFDdYx6rKQX1KkOVoe2PtQ6mXHKumKszzFNYfS0u8ehJTHpo/iH0OlmE0lg6zFlK54OL8J+RhxRVJ5XIKLzxH7YkX/43W6Otg5YwHWk3eziIu0mBKZdnJXRVbvgYkqBMzbOPOEQ0NWiUWg+SDT2UBzKCw9ZZQKuStMObG1MJoYF/iddYl/e477K9BWCmzOJxcL0X5+7M7H6Kqy57KvU9pVlSwBmYz5zB/6vmk0ybDlZcQLrmQbNpEwvnTCBeeT3buuYRpU2DqFDLtU6lOw0HnhExqIxs/Vqfn0TpFDyfRmaHw4/e5K96ZMLqyzdRASmWCGmyoOkQrr0Cx/wDtaTdqg7+I9Pk3CB9/C59rZso1kn30FeHnWbhqhrXBytkEykM6PnKkukqK056ZPPAstTET4a3XSZZbjnjwGUT/OJqgPqpdf7028Cdh1gLcwqpcPe08F/MVO1dUXzY1Q6GJELwmuuJR3r3SNNJlyBNJU7e8IdlCrRSZvyonHS0fjmZgPGj5XFDrUGOc50naTBEnfc3c+YR5C60NBCOSyivIrOPue/B3aEO79BLabntQ1OC6dpY7ezOqq69CKp1eXXZ50vU3IN14I9JNNiFV56XLLku6wvIk/frASsvnJ+20b2+SAf1I+/ch69tTJ+ze0lQJmTZGE87kchYnYCKgj+HUXOK+3Yl33o5amybFk0+STZlOOmIk6bDhpCMFI4ZTO2uULKRxtN39KF6djwoHpDg++462y26ibdRkKsPHUztjKOHS8wnffIbb5i+Utbdk3ZspbLcV8cGHUJs9U1bb5aSjp9B21ggq48+hIsux8sxrBK0E45mvELuOtv3aLgN1h6Kq8sdrfYAGxXXtTijqYGS/VZDglpvN/E0XMz3wchRa+vcgmfFL9dXMSggzZ7dnC+k0S9MI0jVWxv31zxT696P2zNOkP84EHcya5G5pGDWU0rAzaZg6nuLIIYoPpjTiLG2gIyjpJF2cOJbSpLEUxo6hKD9USVcAhm/QyiqeM43iqFEkPTVgklVWJDYRfHMnMl0OWVpiWJ/mqjSTZKWd/kLpzNMJO2xHttqqVOUATPr2JencRfMxxc2fRSSrKb34Atpuvkszlbx89dmXZR7fSvzKi/hPPoSZP6lskSAfXsMpx+d7jVWS17HDtpROOAHW35Bk9kzc5+8Sv/wc/v57qVwqs14mtE0QJKCLxCNUCbrKM5Val9cj/1XIAsgFHMz0NZ+9lr8d2LKkBuUm0J6CPqISA0X0OIE9UXfNVrnvs0pr3gATDhkH1U5diE86nujEI3B//BNu0SK8wMoFvaRVcFp9zlz0scQUzhgEnZ5pKkFDEdeliWzWHLKvviXM173LogrZojZN24Ts2+9Jf/2VrGsn8ZEkmlTmj3NSAU6C6slFUQ4WR3XYRVNR/rfiqMGUp04md5PIPVKYNBF/1ulUNtmIqEsPqvffT/L1j1aU8lab4g85iHTf/Qj77IM76UTK48bTsO/uBJ3+JblNeBMdq6O8/ZaUhpyMP/FYqltsTXWzzQnb7UBp551w3bvmsjhRB6l1tBLt+2a0tuR4k9OHkGIbFzp9eplhzkywQiEncM7jbJmZSsvFW+Ll2uNO6s06wArkKL0yDXDAE6RTrRLX2EgQ71BfmoZsL774/b9QlYQ2HSrbzjib2tlD8p8xJENHUz19KMnpg8nOuwiqCYX117OqtUe1wby5+KYGkAz8h08mnCanVmmM690VG3jfsyvmp/MbrUPT0LOIDjqQdM4cah9/krOJVhhAw8F7UTpsP1lku7X/Jn7l5QjqtP9UTbA6il6GxRp0kvVYHnI6hWMOoHjATkQDe7fLqj5LdTD0MkqcZr59gUPDoJLgnTovXSj93zIX58Ru5iwdFBeCQ52otGYWzuWM0EeYPG6hkmQVdYQ6G7XUGmw4m/mZbslQxWKjy33x03y1lWhpsVNK/EVsfKyc4ZXEQoPas6/pwHY7xbZ5mrVNOAke5swk0s6R/jqDNqX9LjtRkjc3L68OSs3NrT1Q1eYyGj+vl/GzehQVH7B0Hej45HQRFDZYl9C5uwZlbp5j5YI28+TDr0l0x5K+8wnZ2x+Tvf8l6RsfyPp7j9oLb5C9/r4MBd2ZWP7L7+oS7zXSdz4imzmPMFvtlyZazFDqIZIGyUrNWjV98V174lS35Xt7RUv1gy7d1UkxvlNXnFSWtchMMxdpNonIGqDgfxpjkgphv7FGZqX5v4wm1GSxSWXZrZnTWUQk5EtTq85pxVjaxj2R6Zo89hLpA9pbHnmO9Lk3Ce98TvLqeyQPPkV6x+2UfQIrr4bf4+94O1ztspvCffH7HUT5n6fQfORBBDkKTVa0Mtwf1iVbbnl8zGI50cfksoYaWFyo//q4Hl1g042JBg3K2dJao/XS66kMG0M2drIMgRG6Qxklo2CU7kVGk44dRzZ1KumkycqfQirrKxs/HrMSk1HDSM4cTkWretFFV+PkanJOVXuP11bgSp2wleFMTQttj7dZm82b0z5dNUyhrCWvnd+kSW3DzGoW1WAZeQcEhcZYQZg9CzsE2glcSfKeAJxO/c5HeVmnvcK+5Z0ngNpL71CdOFVmrsxeWWDZBeeTnXMu6dTzyCZPJbv4Qoq/ys2icv5THTLlgkmvvwruuZNw8034p56Uf+hy2u58QLec5FUGrzl1/OF02XMP0q9+JnypA9sX35PKtM0+/VazVTP70+/Ivv9NFtIvhG9/IX1TM/hdw386zzctAAAQAElEQVRL9s0Msq9+JP1tLj1O+QeljdfJxa09+yrpYw8TlSBbaVnYYANYc3XSzmW8jAK//CDibj3IdOGU9OuNTYp0+eWpytgJy62AW6o3sS7Xsscep/bau7msmfbS6uw5UmGDcHaTWBBz2j9qBtgG46S6gro92DWjOpIIok7NhLlzCYtackY2DgaWyEPxyH75lbipUbq7USk93mH5aesigukOwBXKoKtXtIeESkbrnXfjFsyG9dch22or0OUNW/6RbKO18VtuLiNgK5K4RGp/dWjFQaT266wePUg7NVItOhJt9rEPVG6/i5o61LdXKb/aHBaecwHVwUNIhwwnGWLhUM3oMaSjxykcKRhLOmocqfaj2ujxmunjSIaOIj17BIlWQetZI6k88jz2cXolH3yoE3hRxsmxlMaNIB56GsWRsgbHjyMeP4ZIxkBrc2cSXW6VRp2tM8lJlMaPkIU4XvRjKIwcTKRrbZZeRpPhZ+sabJUU+i5NMPX6y1dksvCsLlWHR7ofbTBhwUwy3Rw6Wz71Jd+nF8ybT/r1t9QLWCGDPJ1A+vMv0KVL7rIPlqGBdWLrdRZBH6PL8q/hW1UOG8D0229wG21CYfDJFE89htIpR2PWT/mEIymccBTR3rvSJj7ZFlvSMGGk3DSDaZApXJoykYZzpqjBI4llxVAqU33z7XwmqyoNtFbMO29I1oSsucG2MHkeMrIencl69sA1FPHzfiNrnY/r1wc/oJ/OMz2l9hq0MyU4XTLFs36i9abr1e5WjHFYINpllyPecD0ZKTG2Eu0nDvRT3/TsAlJxrqgJ17M7rrGIWZCuqYzv1gksXfCqq6fSnQlzZmN95HT3HiVVsp++gjQVZCa+5AZNLhWQn8eWnDdyzWQbIyvoV1tRQqXUnnwWLZ72QpaRxyD8qKX/1VcSRALpwifPkkWWyYRGFkTeI6K1hmaa0S7/JrjTwNdguWUxs9HK1MHEMjC9mkqItLFBEqoenRlQI4OuZkOXZrLY41dcDtetK6jDVIU2zwWkr71G6N6d+KSTKE6dQGx/dkn6vKhTfWnKONxRR9EWIoJM0Gj0EArjR+r2bzTx5DEUdKsYKx123lkdN4/s51+xmWwChCjC4al/nDbo5JX3qdzxCNnDz+Nn/Ubh11lU73iQ9NnXpfrULzJprV15mdYK2axfSU0NCxEqVdKkDa9zVJBqp1NnYdsfH6RGXFNnXOfe6nOP1wnSKc86xmaQ67sUvPkWbQ89DbI2JJlywcnNUHvwcbLffqWw3vpC5A9oZXjNgKCRD5rl6BPsjFIqgSColUF7FTIETGD1u00DjNTSItdGlwin6VGzUAMipMmT03QQBW2QacsinKlX5dtPDkJbG261NeQA/APBzicyWd3yA0CzNXRpImhCVGQVuv4DcKWIfN9TnrOD74C+2PcCCptuqtWilWCXRsZXKTOnsw5ZvDb5it3LTJmMv+oqwmWXEf/2PdE3mphXXwk6tNamnAfvfanS7U/Q/hJkdabz56ltwolX3Kc/foU1cZ264ctlIdsf75wj0aaeSW2heJCfJW+zXq5vNxqPOpIgf33lymuojJkuZ+BT1O58goouapJHHtXF/8qU/7qlBhN1opjaChGg/cdp1QiDDUzWtohUexHaV7ysDOccnn//1AfHBhO5QbyWu8RQeTDL2iaK0eSlNOB2mHWFCMN7u3aWyqGLJpcIcrq8MFjcouhcZV+K9oViu6wddBJJROR8bKJkGuREG6/xDXZXpEmby43m5DMvySn6L23o3WGTDUjWX4ts7fV0+l+dRO6ebNlldQiey6Lzzif9qH1QfHMzheVWxJlskZjIaPKC7KsvCAvmksyVUSU0mnE+6IatNncWaVojsdOuRi9vgFqgh2ijNYj231uqoAvhvbdIrruOyvXXUnv/XdJVVqbxmMNBqqTeQucczn7O4LURGQNVZBaW16rwhRgnQUIkGuHtEbkFeWc4xQzQgGXBYV8mwz450iJYVh4JUq2o48ztkCM0C9EKweTPEerjjvo7kirs8LHTWCf8r48TvZCZVKALNZzvmC4KXJeumNzKpvLme4Rlls1/fWx/Ea84/CyKo4ZTHDOc8sTxOv2Pxh92IOnsX2UcPG5FyHQqz/JvMIqvZApKVz58H+bOULsTos7NefcF5/CokyKNXOZEKXRN1o/LFJeAStqgUZR/v3n0cLkQDiZsvy3okig+/miaRp5BvObK2AwTLzEHY4p9DOGNCWQyFhBPpw6knQon1aZaMEAfIzfI0+oMp47I5FJQFjZB6qHFjavNMEoN2ofidh4q6EwNasCN1sD4WVgv4xrKBE2WTAiRWxZGY2BMjG8ya7aWQQupVIzRBGJSrW6nFRlmLqD2xReUdt8JLxMXKyA5KShS9AS5fEJTkXjjP4B99Wi2DIIUeRFaSWd8D/PmaTJI+VrbxY/uPQgNTWDnPpNGbDw63XoVcj4GX6QgImwWSZpcUBFKfujfi+Lu21E66kAajj+MwlYb5VaENcQEE3l7NHLYIDtTW1ZWEHXvSWL8RRha2k3oVLNEWYufxeWFSWSjm6rwUkc5Xi+NkXLUOL2VlKmuWa7V4JdoTIYHbaYiwWRfEgyXLlhEUqngdUCVlIbKBztvn1JBEEu9eA10VCgoBZHOCVFzVyhGco7+RDp/LgWpJqOtlzNCS1uYd4JUZ3GQVJT6wCa3i7z2iWaiXn1Batg5R3GAjJoG+bZUUIopL2blvc3cqKGZuNSEU6d5Hemdcpxeos0b5hXXk+8TysLilmdxSxit4SwdtFxSuWLyruuQ2PYEbzNBqzGoE03d+GLRyMmF0aTJE3oZ30KxREHGRZB/zfhGXhl6rB6T3Gicc/goAgnnUG2mwsw8Ux1KGlk7GLEQeRXGyEeE3/3ETdn5Y3wQ3zRzeLPwVDZU24RyONAGLNWiiWSmvrKof+pxown2qiakX35GsmghQfxylSXDJtNktPYiK6v209eEH74U3wLODuMdzDya0V6br1dIWpXbeG6epXbi5rYSPv2e8Mm3oLt1//M8si91R/L1T7gvfsB980v7nyf/Wgee2Qvg13mkjzxD9O030KQB7ugcpN9jzWSHx8URTuqxvuFLXrBG0P6xaCrha1XVLbVhaRtXA6Mwubwi1gmZ1GCoZ2gioM3Xa0+0PPSyxhvaSIyP1z5WcB4nw8XSOdhL/OyxQXPe5HMELUkrlySBpMMIiPr3pbz88lRvvk0n/Rl41eFMu8jidPbn1FsTIlu4z7xI8uYbxMv2hxg1T4SySrI5swgtbaBBzWbNxMsfpztchd7EzSGP5VaFyqSybII2d0Uxa6/l8luoDh0un81YKiPGUh01ibZho6icMYS2M4eSDB1JOnKs/DWD5Y0dlnthw5WX4qotFLeQ29mTf4IGJNVmGcTfyfRFjc3PKcq1Rtug1PvF6rYZY3+Kyffsma9KoxFp/li+RYJmmbMVoVVtaVOTmagzHbjydAfDnHdHPNOMtTOS8VgMihj/nE4FbQXH1lEaWEx+yZrK4rKqkNoqbqD94ZOPSdQftZFTSSecS+Xs0SQjx1EbOZ7q8HFkV12L/fyvuK1uWsXTSTv4zjocDlyGSL63oFkVSo3Qf3nMwLEJaCIaeGxz0UzUzqWinoIubCyDCPwyfcl0Uxf6LUXauztZyeO0cdGlC2nnRh1LKgT76qmDbMEcQttCqtpY3U47Udz2j9hHWfjllqHSpyeuY1Nt1bTJGiWQCKwjFCx+jN4Go017W7ApbjmZXuo4vRc/wUObbfqlQj6znMzsRNZPulTfPG1FraOtmEFesFsXWiV76No1T9rL6jMZjNbiobFEm3xL3k7eIsiW6oOXNanFpeGGkm4G3RZbkc38hfDmy2Svv4J7/3V5et+TxpAb5K3XSEsNNJ52OvFaq4gDOGmKVuHoPzCXzYl/eb1N8MuvBtq3g/Y1B3met002nf2bVk6kvAbqZqQJWN57BxonjqI86myaxgyhPOZsGiaMoTxpJE06CTdMGk88cYxOuRMoTJmE/ZHh0mS5Nw47QHzyxZc3orzNZvQSn2DmXbfO9Bg1hNjuMdRTerC6LJRMuVDRsgNoOuIwNWh1LXewzrCIk9QG6GMdVtp9V6LVV1UKbZoxPeVn6rT7jhgTTWwiL7wgL6MKCisuS98pYymspPsMlXKCJR+RUFAndp0wCvs7v5budvTBdP37nnk7jD7q2ZXG04/DDz4Lf+YZREPOxh19POHAg/Ann0z6979TOPNk/PqrmRi5LJTj/Fs35R22yXHO3vJmpO+8DLJqvQ6xJofx97bpBNObsiq8dziZZE651giD3GVhbgutjKBVkcl/k/WQddC9C35gX9yAvvhll8JLv3pd3ESDBhA0I8TC+jAHNIudfD5S+SYKhTVXkNujEzaL63Xlg2I9IHByInb7+x5EvXuQ7wFiZvkK/ueJvTpqN4orL9/eaOW4zs04WThe8fwRc4vnoLh5EQr9+2ChJXPQy9qZgwqZe6e0ynJgBoPSqM3IW+sUN1AgLdFAcbM/EG2xEX7DtSjstj2l/XQ1sPHaNP59L+LVV8zbabQGTm0qrz5I7enejk8zsm+/gtk/gzSMU10iMVJpcy2fgnwpkQ5D3r5Sqo2xnmmhdYSFJoxXkcUghB5h2vvDaAwMYXiDf0sroXqxWWsCWqh5gBehHvIOySPkOOODQwKSlzHaHNfxMnqxzFPB/U4GpfVY8Tzf4nlELytjaQtzsJfw9ljU2rtk3GS1tJUxMBpLG1i8DrlWVcLK59BBIFS+uhbjDK8BieT9cPa3ybRnpy2ths3l9VQrZDpV0rIQ+xkCDQ2LM02AnEr+m+ydL6jZ13kefYmgy6Ts6VfJ7H9gPPsm2bNv6YLpbbIX3lT4Rv6dqvSZV0iN5vtfc37Gx1YEGlEnszB5+9PcEWc0ycvvkL3zKdmbH8KHX5C995n08a/472YSPvoG//1s3E9yL8yYg/ttHu4H4XXnwayFUrUYa+yTy/vbXNX/CsnjL+b8sxffIX3hLdJnXiN79QOYswgbzGzGbBLJZnHkF0t0T2I959Rz2Y+zcHIgWmfmgz1jFrWnXiaxb0ba/cpn38qVPhOnm0CTh5nzc3okgJXJZbERUsTSBpanbAvyg3JiLhkz7V0BcguUfPX4IB+Q79kLNAUlC/UBsbgTQ36YRWX6ZaSTpxGuvZb0wgsJUycTpkwg077B+Uqfdx5BTjWmn0OYNpVw7lSYLnpB63BZIOpw42WNt7D11vuojh5Lzufc88gmitdYWSdjxpCNGEk2fgqJ7iySMZNJdEuXTTk3t2rSkRMVTqBqX2AePpbKMMH9j5uUeUPTdz+jVbh06kQ4d4rkm4x9ryuTvNm0yVQnTmLRtXfYnGDhldcyZ/J0zKCqvfwWs88cTjbjN7KffmOW7kdqcpHY6s2++olFujvJ5EzMxowlPessUu0f6bBRJGePUnw4bacOZtE5VxIWVMjbOL+V2WW4iAAAEABJREFUeZfeSmLHAwe2yloe02ZvX+AGMlsRWiGhWMbJ2oqbpb6Ft8c7KelMB7BQ1LkhignySFoGYpSpgup1t+Jffh77Iyks1ZNk0DIksrwy+5VR927UtL+k2l+yxgaS5iaSzgLtR0mxCHJjFGf+SuuFF5F9J7+NeNqXo5OnnqYgvRx696VmYZ++KtdM0rULWb8B1HymE/Ec0raFBJ2Nqt9r9cz9lVQO0NqP3+QWXZRVxfNrKl9/ZaKS6u560QWXEP/wrVwYnajK4xDWWoN05UH5d7zCGmuQDFgK10f7XwLxwlaK1So2LdMffpT7/Gcy+wnzLzMpzPhJLvg5eTe0XHMdhe91rmrQTLY7kB7dqdlsLTkS7QHJnF9x1UVabV+DrCWvUun3P5E98iDZF5/ng48GovWGG3RY/CaX1VxJmYuIBskg0Z6daoNX15go+Mw8sHJj5+avrRJdJolnzqj2nJb+W6+TyS9jf+eqOHYk5YmjKWp1FCZNpDBpAsUJoymMGSELaziFsSMpTZ5A6ZzpoplIPFYzaJON4ZcZtNx2Ty6MCYu8y+HP21KcNpHS6BEqP1w3bOMoTx4v55ziKlcYOYTCiDOIRw4W79Fy3o0UDNUN3DDRjJGVcxqlEUNoluPTtEP2uRr7w/cka61NaeI4GmTtFUecTXnsmPabu1HDadadR9P+u0pl1LAfXcaaRDajvZySkWZp1NSMnY98YzO+U2fQwdh98z2ZzOlo8BC1dTwFcyBOnkxh3GgKE8YTa3UXp06i86jB+B4qo85Lf/0Fr4kUde6Sd3KidHH2DLDvaimf1lZqOsnjPLm60kIwtA2KD+b70UnUe4/1WCxb2TICkH7xFUG++vIpx1P6qw458uq6cgHXRQLLWnF9e8DSvWRlLa3RHqA7YllbukP2ZnktNwC3yiCKRxxMtNxyhM8+hkqm5bqIkFRlnfWDrk1EK+qw1KcHrlc3kFUVOjUQLd8fL6elW2FZ4lUH5Q5ML15+2aUp2L+oWGNFIuVHG6wly6WbiU3ytWaoNqnCTtvLvh+ou+xe5F9DKkUKI1zR4xoKeQch901mOlyz1NoZCsInGiSdpoOdANUnTqs7m6NVqsnj//AH4g3WJnTrBN07UVxB/Ht2JR40kFimdLS0zirdOmOC5PzmzFUbk/a6gKABoG0+/PyzUnoWLMD7FDo3a9UvwpdKQrY/PsyfTZilQ44NiMygYKqmPQ+vWZMtmE/tux87MGKumA2YAqs/B4ubIBYa1PMtHnXthu+zNGZREPl2Bjq5Z7PmY5tosP/UposvXwuaVeCrGTpxajaA6XdrlYPF9VD/qELTzZa0fDtPRVL6/uffdGMn9fOlZJb+d599r8kgmNOymIcd1LwOpnYAdRIJtT1oYw2yy4MdSNtaVb/0mphnkjXq3kOx/3kkoYmVQx27JC7qp8kmf1ww7SOC0NqG12TJN3Klzd6PzKL95hvislZlY9NiXlJZrXKadcqXcSYTLEh9GXMDdNuWqRm1y6+lcsVtsqDe1Mn0A12Vvk/6xkekb31MZuGbCt/8hPT9L8k++jr/Vkny2ntkb31E7epbSd97GzdoeUKMBqe3ZmyZ7K675WaYROvQ8bQNn0Bl9GRq48+hOnY6rcMn0zZqOtVxFwjOx34B1Tb5EirTrpCBcTm1y26mdfRUFg6fSvWN9yUhuM6dpGYzwk03UDvrbCpnDaXt7GHiM5aWwcOZf9pZVF96J6e1l20Dma0G1PdSWTV5dV2npnwSBnWeqXCnlWO/uUwUBtHZ4/Sy+JIg1L89UVwm6to7b6vRRz3lAip3IZLqy0Tpe/aGqESQS95pQgSbAMI7gXcycxNda6aaJTZjnQmjDBO4sIkOP1tvjX3VJzx4D7XzL8Asleq4sSTS89nEKYQp55ApnU0YQzZ2HOmYifnvtzPlh/ETyB64m0wbYcOuO+SzIFq2P077Sq11AbU3XiX59GOwXx29/hLZS89rwF8mfPyh3BFv4N94hfD80yRPPkrt8UdIHriD8ODdcOftFJ6TdfX0I7ooU3nJG6lDo0iqR97ZTLMvhKo0UxtJy3w5/Foo/fQdrVdeR/rDb6J2BKktVyrnMgX5rWw1eu2hmYycqlZF2lYjMx+WTGKnpWidZaDCNp4afPLQBgZ9LK8OtYXzCQvnCBYqR491ZlCu+lhvkHfX6QxC6zxC63zVszDnJ0q8CRWVO0kwCSnurhgrDjmPckzzkQfgD9qf1oHLkWjw6NqDmlz0tUKJVDo5iTNSeU+DLKwsa1NZNUQ8qs5Ri2OS1VenfMIx+T6TJeKrPajzycfQOGYU8UknEB9zBP6Mk+HYo0n/9jf8ScdR2H9fakTUBkjVHX4Y/h9HEesqOTrsCMJBB5Ptty/ZgQcTqUxpazkx1RLbE6ram8Jee1LQJluaPoXGCeMoDxtC4fRTCRtsRPLDN7Q+/xJOcplzz81Vh8ljHS1YSBRJNg0GSYqX5WN3JvlAaZaGDz8h0/kjSO1ls7QH/raA7Oe5hJ+k7nV+yXQO0XWrGEgQPc4aumAeQXyVJIhvEM6r/9TF+Cgm6tSVTHtV0N7i1V+GN/A+X46KyhOrkniNnjGxkbTFEuQQLO2xA83jhtE4aTTlcUNpmqyGjh8jK2MMsVlZE8YSjxtDNHKUYBjR2YMpDB0mS2QMDaOGEK+3JpIJPFZFPoBePqPi9ltR2vnPxH/amHiX7WmQ36i43db49dagosq9NujC3jtT3H0HCnvtRPHAvSkfvC/FQ/clPmR/SvvviRvYT10mvmpcQgm/zjp4uW+88H7FZXHiZX/YIN51Z7LIS03MwM5ixTVWhy+/oqIzB69pkNQpLnf5BJzc40GbvCuX8V26wZuvUxs3iTD9UtJRk6gNHqrz0GgSqcLqSSdROfV0Fl14tVZdlq8aa2wQP6QCg3WmViOFBu2jAqWDBr028ycJXQUXq0+cJrKSqItsJdno1UOnzU54Edlb4AW26Uol+B49cD174Hv1JNJ5xPfpTbz00vgBUkP9+hCvJutHjrt43TUoySqJZS05qQEnFiaphV789CAtAAm4DKxH87SiRpPp4OQltJP1J1QurIUGeQMVsVBjoBjGmsxmo/aEIFWDfWTEIAIvQuOJTt6R4pEsRKuysMNWJOusSZsGPrG6iuoszdysViURLqhDvDy0kaytUPBk3lGZ8R21uT+p41tIF8yVY2Nh7tdK58+i+tP3uRxWdRZUkforkmfZ6g5So84mvngoBy0R7XldQFoG1YMu9LwKtoM6LJMVEGlW+EjrVqHyMO7WefZvQltHT6c6ciLVwSN1DzKMliFjtGmOojZ0LNURk6hpE64Nm0D+g5ax51A75yoq486lOv48baijaLvhTrx0sfG0+oMOZa3X3M6iURPzDbs64Tyq0y8nufQmKpfdQHr/oxSl8twLr1G97m7SOx8jvf0BKlfdyqJzryC5/RHarr8LP3MuIsM+IW1TPIWC2jCvhYVTL8Z+el2bdhmtky4muf4WUs36aIUVCCrgZZp3HX4GnaZNwG20Ean9FEOD4dQXheYu+URL5s3WgfNX/MabUJo6nrJpiCkTKU6eQEFnmuLE8bl6LE+bRuezTiYUvc0tfPfuksWR3SnZH3gann5BKlFyNTerZmSCxxT7L69D6nJS+024/v3zcrlcTqZeQQekOFQ0W2ukixbgAKfy9g3vlosuw7/1Csnnn8gV8DnVT2U5vStr66N34JOPcIr7D98C3QP499+Ft1+Wb+spgu4JwivPU/z8Q5Kbrqfy5Is4MbYbttbr76B26824t9+El4R/+WXcMyrz8ANqxK3Unn9WtBnhnTdIbr2V6uWXkV5xEdkdt+kE/AjpVRfjr72MtsuuhprNdyj26SezWfG580m++VH1PS7f1UvUnnyY5NF7ST5+j4KMieJG67L4oz3Q9+2G00xGDj/DBySkIkFdZLreRwV5taX6dP4IOofRpycGfuBSRFKLTmm//DIahC7YwpAEFOQd8CutRPriS6QXXUT0xmvEuvGLtErEOt/s0x+/w839DRcXiPv2zSeJ5fnE/gLaormgZZrrPrtiVI6dW1offRK7K+HPf6Y0fDDFsaMpDx1Kw1lnEg8fTqR0uuEmtIneHfUPOP003EmnwD+OxAnCvvviDzgY17kbrQ89gqsEwvc/y9H3NFHfXhQOPFAb+9H4Y1X2sINhnz3hgAOJjjyC+LBDCX/bGbfjX4ik/6P9D8RvtSVhrdUJW28L/QeQPPsE1VfezLsw0X21yW9fBYpXG0Tz0DNwhx0kXpJlL+05J55Ap9NOAqkgiUs+OSwiSNoqWj1aXUI6DYztd07aIj+wacVlQtgwGQTRGyj4X4+K4w3bqUzzqcerL06AA/8uw2ZNalp9WYf2MUs2q7SQzZ+Li4rokIJTOePrvd1VSFeiA2HmC9hhSXk46dzk5x+x78SWDt6PeJ3VdBm0IsWN16Ow1abEG66r9Aqga8laczfibf9EvNkGeG3Qpe23pLT9NpQO2JNoH3XqppvJcTcjN5/tF1EVdV5x730o7rMLfpvN8dLnBd0pFPffI9+0S3vtSGHX7Sgesi8Nxx9OwzGHUDp0f8qnnUCXscNpOPNE4kMPg0KZVIcra4zNtCz22Bf0kM4vbrEJDbvtKINgRxqPOZTi37YjdG7Kx8zaZ42vQ7zO2vjNNwflO6m1AhWwM1lFoSw3ZCEZrU1j1ZB3ntVpfOpgaQOjyXHyYpS221IW466YcZJo847U13merp8zM4u1cWbzZ5LNnNXOU5VomxCbrAa6SvRKGVihIMeb10bpO3cmP9UKmf0ym5pc1iqHLU+hQEztCjJb1LaYKR0fo7MlnMpN4XUuwK6LtYl4mX/00tI3OhFZI7Ovf6Zy9+PUHn5WKu8N0hfeJnnudWpPSO28+j7prAUQeelpWSUq5wcOINOA0KpOU1piYJOK5sZcjuzXOSww/d2ifNUhDYQpAedE3PEY2jqwYZvN6H7Skdj0DtIYRLH0fJmaXB1OKhydU3JaR85bwX8N8wzaP3kZi6ov0cCmWolWNp2/EJf5XF3hIzJZYYa3ssI6vAYDk0YY39SsNxI+08SoYo43W2rW4IUXXcf8i6+UrobFDXNe6YSgQxT6LMYrbo11CgsN4ild7LRX2XKNJamzwVGeF0Hyyru0jZ4Al15AOG8qqVz4ydQpZNOmwHnTSceOZ+HIyaTf/awSHU81Aa1iZ6tCqER+J2tkpMEWS9qefp5Fl10Bs+bmshpO802Ualv+XuKlTM2THBEkoxpP0AqJO3clauwMv83s6J2c5N9eKoqBmmTN/be8eiI/iUsVug6r0X6P47Xq8AWcZolXG2ziGg/1ZgTa2J051sTBdeuWM3ZRTKwZ6OT19J0boaWGn/EjxTbNVHWESHO6dM5szVQve72Tof4dTFJhLHDmQJNAyTwdqGTWmn/H8MxcQOXG23AzZ+BWW51sg/VxG2xIMGtotTUIwjN71ycAABAASURBVNGzG9En79Fy6TXUN/EgE9fpAEfHuanQvSvOOczGV5X4n36hoUlyy/y0tBYXkSr0lugAW+XWEUJj0N4h4LRn0NpCvNoqRKutqRX7FOnlN8vAeJjKtfeQ3vU41X89QuWuR7WK39Ll1esyeH7GePEfPpkuAYM2dfsWvWWbivJWuTzCNhFcFw26MkwG72yKKhYqC7HMoCWkJEiXhpqWuw5LtjqCqvPFCFNPQde8Kp/PGpzXqRpchwXB7z9qZWZ2uPWEGEfqQBcrotOykbb86x6doL/Ha4MvjBlJceRwSmefQsOYYZRGDpHLfbjc8EMIq6xAJisu/eQLK4YNTFDH2R24IWpSNSZXMPNaiEyuGSfBc1C6/lgb6/F8FDoSTiLpkTdaqtcmp/iEpoiw+QbIkyK3zX2k112Ou+1G0N2Gu/Iy3NWXaUVPJ5Hp3HrNjTpQdjD7XRDJqHFRAe+tExCd+lXt9w2axA3aEhqaqH980OoI6lpntEmrPL+/tedp9nnNrigqoj7FicAa7GLwhSinyfR266xBYbM/YjePRmcgdP64/A1BOhgbaKtL+jIEjyuVoRoIn3yK691LRsC20FzCRY4g9kEmKXKd23ehIrndi3vsQZAxkLz3oaQVT3mho1hLXurQ6iw0dcZ51ajOtGqjUiec6s1d34YQmLwKEBU2QfO4Es7AmAiRqbWp9L2TkaMkpe22oTxkMGG33XF77k26o4yDP29FsumGJMsNIu2/NGH9DYk32QDUN2Jlxf4NNG+0coP2wZntdTdpAKw+yWsTBh1M6wW802nWST25qBmiBtChxmhRs4Mkzcyl4kQuHZh3LJo17QR5oxo0g7qdcDheq8fIRLn4MTLjbxU6zQjjp+IEF/CdO+m0u5Dkl18prDgIp3sQqVNUDZkKWoctDsUxXm5Z4p598kFRkkR3DJkK2CBYvflpWis3aEVbfpZWxCcDNdrSdXCKeIHGPe8cSyu5+LGfNbhYE0MrWWLgxK+4ybqy8vamcPh+lI6XSX7soZSGDqY8cawurcZQ1gGzvP2Wi3n8r4i8ybFc7E6T0Hgi1Z1274lbbhUCBdAeUi/jc6lkH4ekTe6BgO+kgVGuCWquA4olpfRomNWPOEtroITByloFYfYCHeakS595nfSDL6TWEik4zWL0MVrvSeUeCKont4o0czOlvZySaOWk8xbkg2v8jLwe5nGxsCcs0urVzPVqmNUZlcs4DYCLvGXLY7pInVci5ymMk8rJO7ehpEajwRFST6gkJB98Rdv9T5J98g3ILWRtDXrpAa1gm6BBKts4LymDimM4C/NIk/qmsQhRB9aR12X5ilozLKp5XiKVpeWbtTKEifsuQ2HDLckGLENqMy/S0hLeHt/eUa0Wx0VlmbjthUwg++2hkwow5sY9OI+3r+vPnJPLw69zqV15C21nDCGbNF7Ot8nURo3UXcVk3Ze8TySu0k44rQ4vD7F1UMitK68lnGpVqL6B/Qn2R8K++gGnirzAylkTLcxx4lOxn9W1qtP791NKj0Yl1cBK6eWdEDV1IWto1DkqVqY6RrPH1VSHBkAs7exFePszKnLtJCNHEi6YJpfPcMkqq+7dLzCaYCVNPm0aYdFCSy0GyzeoI0y+/wvqdFbG/lqS3bsHTSDDB7lp0o8/ILz/JlFBXNQ/VrfRqmcyMh1UgmZxZpaARtIykIghkyulqpmJGtjUICfi0viff6Amd0p6033Uxk6GO2+jMGcGvlcPMl1x2sEqevNlKuPHU3nwaaxDUS87LVNUsVlbToI5p71CfAubbkQmV3XloktI7nuC5KFnSB55ltpDT+X/JiJ74S2qV99CeOpxMvmCohWXywfAyzx1OnX7YllcJJ8NlurxWjl541ZZCbSqKpddSyY/WPWcK6nK58Tbr2By0G8ZbKK4t16les65JM+/hbU7yLrytr61Pxmf9NtfdRfzAskrb5N++m1+G8mPs8i+n5m73zM7l0lDML+NVPH0G1lbM2YTvv2Z8MV3JE+9LDfSa7iuXfA9e+SyJrIow5dvw3efamJWyaR+LcMWi3dxRJCFlEglhUizS/FMuU7qJHGxTNqOSxxN1/Keu1HTdWz2ynOkN98E335NVTM/2Wk3ogkTKU6ZijvjDGrrbUjWUmXRo49Ba0p15kxqLa2gTSHTQasq44FyyZqtTXNrSn/bjezTz2VaXkFy7nTSCy8gXHwx6QUXkp5zPjxwv5Z8G4Vddsb365UPSND+kdqGo4lkHdn65WfYf2S2TjT5y1tuTrpMP5I336B61ZXUHnuQzAZw192JRw3H/nRsPH4s2VZbkP46g/lXXy9Vq8npY6qZw8m/lX31My3DxmJfcUonTSEbNpxs+GjSEeOpnT1UbviRJEOGKz1BZ6Wp1M48k3TwmQrPpjpstFz0Y0guvJiCbg8bjjkO1197IOB1bNACJqjP02oL+fJF3ePAo2HJB0KCpCI0IqfMUC4Q7bIThb/K+lHaesGvsQLlU04k3Xl3ajorIKujJAHs74CEvjq/9O5OpFvGpuFnUjjhOLlTtoEGDfg6a5GsujJmNfk1VyfafQ+8rodVtSaDp3TIXkRH/4NkjbWpye5P1l5PPqs/wEqrYN94ydbdiOI//kHTXruiNuQDGbp3o7bySgQNUCb5ynvtTvGww/BLacBsVHp2penUk2GP3aiusy7Z7ntSHjWM4hEH4FdeFtenuy7N+tF48gkU5Jsr/W1HrRxPtP66uL/8FS9fG+WirMei9taYTBM3U58kBUcqD6mTEZPUFoEmRmJ//vCHr/BaVa5Qwskzkas8mbNhOa3U3XaRu2lDSSlye+vK1jX31FWGri1KzTjROeENfKYxcTq0ZeqdoP3CQHmY7m/e9c+UN1kPTWxD5WG09qqUTjyK8tBTiQ/cjWi91bAN0ecUqlC9k6ohxR23pmHnbZEap8sBe9DzlGPs+oNIJmyPE46Azs3WFhUAJx9PeedtaBh9Jo3jR9BgAzrsNJ1BhlBUWDrrBIq7bEdilz7ib4afX6Y/vcYOJbK/OB2gtMFadNpzB8wXZw1zwrlBA2k4fH86jR5O41EHQP/e+WDS8REJoRBR3GIDGtVWdQWldVel+ylH5wPBUj1oHjNYl27DiUcO02XceOJxI3UxN4po4jhKcsFHYxWfMolYFlesa+xownj8mFHEo4cRjRhMcfhpxH/dbHG9Jlti6nrZFWRlraq+i7GPyWKh1+oka10IchV4UecboRqdNygJsmRAaOzjDK+I5RnSBiFS2kIF1h6Mx+K0CnojkFnn1PBIackiIcBCy7OQ+kezzpnVUlIhnUOcrBivMNjGJxrjjeTXYobY4RpL4Ml50fHJ+TmwdqEwT5ccedhBEzpCFcV1xHOcEja5MmVYaOD69MD+nn28+kq4pXvj+vUm9OyC69UV+6K5W0ZuePuewMB+sHQfQS/8aitg9AxQuksD5MzbK7JoYZnl8VKf2J4qb0g9X9XjI81OpAcy7ReRejy9/iZazx5DdexUKsPHUh09SSfRy6hOPE8WyhTapl5M7cJraJt8Pi1jp1O5+DpqcivULr1B4U1Ur7yVNllerRdcnf8/p+rlN1K58FpdPN2Y51eUTu5+jPDo87p4epjqtf8iufsRqg8+SXL/E6RyLtbueZTavx4iue9xKnc/THjxbdKX3qV27+NkN91Neu9jZPcIXnxLdyYfkz7xAql4JM+8mn/TJXv1HcJbH2J/oSd59lVtqh+QvvURqdG/+oGsmy8ItkF/+X3+LZns5bdxH2gPe/kd0k++xi2q4isZ4be5hB9+I3n3U9Kvf9KkBadJit2h/zILN28R+TkrE956GvIBdqZSdL7TuNp8wSaDxa3DcxDC6WziZTT55k6QzzTyjw+5t9SBNvNIUzZ8+Qm89wZo447efQ1kMfH80/D849RefhKefhT36L24F56AF5+Fhx/E2b9cve8u0MaZ3nMLKB49/gjh1uvx996Kt7+/e89d6sRb8HfeDNdeo9vBKzQY8k3deiPZ1VdRvfQykssuIbv4fNIrrtDtoDZ4pbniYpKpk6hMGEuivOz6y8ku1WZ/xWWkE7VpSpXUzplGetXlJOecR9uoMbTKwGgbMZLqqNFUpkyhddwE2kYMpTppErVJE6mNHq3bzmEkNtlGjMb+I0Ki/GT8OKpmlEy9jNpF17Pg1CG0Dla5EcOpDh8lQ+MG0kkXUTltMNXTz6DltDOpnHsFyV1P4t78AvfqV/DGl7RMuYRFIyaSPfCc2iy443HCnU+Q3XyfJuWNYH3z5Xv5Idcv1Re0PznaP96UfNS9D8VeSxM3diWSpRXrdsp3qAlchOvWk6jfShSX0lLs3J1I9n7BlltZy7FY1mGyG7bSDO+1QXmNvJN+ctL5XptcFKnOOOA0E7yWalRweKkcH0dEpRjf3IWCzyj6hFjOzIJO8QXlR5HyOvcgjcSAFFcq4/osi++zDEhm33NpXLkZ36U7NHXBS+WVBy5HWWVK4lnsJLmiIsW+fSj3WIqSSylSVV2OwvIrUVx1XSJpCA9E2jQLnbpQissUopjwzTeUZs+iICuoGDlKC2drUj5B9On7OZ94/jxKoUCxuStFleGbn3BffwtffE3hw/cp2/d6X3gV99JLuHvu1sq+jnDHLfgH7iL+9AOcnKOZzN907jxsQIJkMPBZcwNpl06k8vImffqTdu9F1tSTmi9RLTWQCZf1Wko03cnU0FTHPbM2Q0H628VkWlU1H5NGTSRm2hYaqAqfOCf63lQTTyqvJrUqXvtUSBxpNdXJej52cg9S1E6D6lQmLXaRHP1wPftR6L4UlDvhBq5G3L0/UdQokb0Ok9LjcjnE62xEtPYmxGvpsmzV9Smsu4l0/Tb4dTclWmkt/Krr4VZbW+VXIFpuDdzSg8R3GdyqG+DX3Bg/aE0olYlWXAe3zGq4VdbHb/EX3FrKX2YQxVVXp7TmHyiuvRHRsirfZzmcJq1fY0OV3xS/4V90IfcnvGQM8+ajxskPOAMnf1thkC7zNNi+dx98j67YtYOXq8SrH5EJjC70fO+BmpQNeR8459S29sfHf1pfZt8JxGccT+HskyhOlIUgVVAcPpziuPEUR5yJP/rvxMceIlP2cOLBp+IHn4WTTV4YcobK/ZPo5GPxus1zJ55EdOJxlJVfPnMw8Yn/IJKZzDEnEA4+jLD3/qQylZEJ6w45jPiII+DoY+DgA+CQg2H33Um22Jhsx7+SyuTO9tmDbLP1YIetdaV7MPH++xM2+wPJCv3I+nYn6dZItsry1Ab2piYLqtK7E7UyJAN60dYp0hmpQLZsP6qdC1R6d6Ftuf5UOjVRaYhpS+bTVltARZtustKKJH17UU3bRKv86nwqbQuolbxuhBeR9O5JVffela7NtNohdtEc0k4F2mbPpDrrF1q+/ZKWLz6jOm8ObT9/R6VWoVJQHfI4V0KQfAPINtqUsN4mknct0mVWoLb0QCo63Gb9l8J3bqLwWNKNAAADE0lEQVQ+JD7Its7/fFGPLoTe3Qh9esgcG4BfZ3XNshVgoGbsoGVgUH/cCgOJ1loVLxPTr63wD2spvrbuL9bG62o3+tOGOoesh9t0fdhobcK6qxNv/UfiXbYj2m8PXbsepLPCfkQyieO9dybSNW2kzmbrTYh33V4dvivlfYTfbgviPbanuMcORH/bVte5fyXa5c8U9v2brkR3oXDAbsQH7Ex88G743beldPAeFP6+K6VDFe6/k/C703DyPyj98yidm46mcMyBMtUPp2HwPymdJvyJh1HSJCud+g+Kxx9CrPz42L9TPHJ/Sscd1M7r2AMpnn4cxTNP0sQ6jMLpx1I8+xSKpx5J4eQjdVd/APFR+2tS7U3xmAMoHrqPJu3BFI47hMIZxyg8mOjYg4mPPpD4pCNw++6Ik8yR+PsTjyQ6bF/i046h0/FHSLv4uqHVvr+bGauBzNeMjVTIY+REFs9Br9x46MhbMrAy9XQeF20qRJ2novkj9OKZYPFMWAsVkMeV0GPJHHKcYr8P8zqErz/1MhbWwcrkIOIcp5BIrzgiyATPW56nDWegTinGUmMFQXvomsoY0FDMQ4u7rlKjzVKfOmv5Tgp1eed7dZM6k2rq2gRaRWjG06VRe29zR7pZqrYROpVxXZrxS/fC69Tu+vbEqbxqrzcF7xXVXpvLanHLNBA67zzDRUrUZbe8vIHC/bcn56dMC41e0X97DGdgvC00sPjv6Q1fL7hkvI77b6HRGj+Tux639JJy1+MWLsnH0v8J/hNNHWd1GFi5Om7J0PA2OSxcEpaksbjxMDkXd7whrKCBERgYzsI6WAEDw/+eueEMjHbJ0OgMZ1CPW76B1WVQx1tYhzr9kmnDLQmWt2T693Gr4/e4/5Q2Pgb1PCtXb6fFLc/AZK3T1EPD12FJnMWtbJ2PlTU6w/8nsDyjzfMsYbAYkWP/75dVZlCnsvJWaT1teYb7v3gazZL5lq6D8bE8SxsfSxtY3OD38XraQoM6jcUN6nwsrIPh6/B7+npbDG/0dbr/Fi5JY3GDOq3F61DH/afw/wMAAP//0FWaNAAAAAZJREFUAwA824tFU4ICOQAAAABJRU5ErkJggg==" alt="직인" className="w-11 h-11 object-contain inline-block -my-1" style={{ mixBlendMode: "multiply" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
