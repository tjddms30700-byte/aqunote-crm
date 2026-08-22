"use client";

/**
 * ═══════════════════════════════════════════════════════════════
 * 📄 v3.43.1 직원 서류 자동 발급 모달
 * ═══════════════════════════════════════════════════════════════
 * - 재직증명서 / 경력증명서 2종 지원
 * - 퇴사자 진입 시 자동으로 경력증명서 선택 + 퇴사일 자동 입력
 * - 상단 로고 삽입 영역 (org_settings.logo_url 자동 표시 + 관리자 업로드 UI)
 * - 대표자 옆 도장 자리는 빈 원형 → 실물 도장 직접 날인
 * - 미리보기 → PDF 다운로드 / 인쇄
 * ═══════════════════════════════════════════════════════════════
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { X, FileText, Download, Printer, Upload, Image as ImageIcon } from "lucide-react";

type DocType = "employment" | "career";

interface Props {
  staff: any;
  onClose: () => void;
}

// 재직 기간 자동 계산 (예: "2년 5개월")
function calcDuration(hire: string, end?: string | null): string {
  if (!hire) return "-";
  const start = new Date(hire);
  const endDate = end ? new Date(end) : new Date("2026-08-21");
  const months = (endDate.getFullYear() - start.getFullYear()) * 12 + (endDate.getMonth() - start.getMonth());
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m}개월`;
  if (m === 0) return `${y}년`;
  return `${y}년 ${m}개월`;
}

// 한국식 날짜 표기
function fmtKoreanDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}년 ${String(date.getMonth() + 1).padStart(2, "0")}월 ${String(date.getDate()).padStart(2, "0")}일`;
}

export default function StaffCertIssueModal({ staff, onClose }: Props) {
  // ✅ v3.43.1: 퇴사자 진입 시 자동 경력증명서 선택
  const isResigned = !!staff.resign_date || staff.is_resigned;
  const [docType, setDocType] = useState<DocType>(isResigned ? "career" : "employment");

  const [orgInfo, setOrgInfo] = useState<any>({
    id: null,
    center_name: "위례아쿠수중운동센터",
    ceo_name: "하유정",
    business_number: "680-04-03475",
    address: "하남시 위례대로 190, 위례효성해링턴타워 2층 203호",
    phone: "010-8114-8275",
    logo_url: "",
  });

  // 발급 시점 수정 가능 필드
  const [form, setForm] = useState({
    position: staff.position || "",
    department: staff.department || "",
    job_description: staff.job_description || "",
    purpose: "",
  });

  const [certNumber, setCertNumber] = useState<string>("");
  const [history, setHistory] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // 조직 정보 + 발급이력 + 다음 발급번호 로드
  useEffect(() => {
    (async () => {
      const { data: org } = await supabase.from("org_settings").select("*").limit(1).maybeSingle();
      if (org) setOrgInfo(org);

      const { data: h } = await supabase
        .from("staff_certificates")
        .select("*")
        .eq("staff_id", staff.id)
        .order("issued_at", { ascending: false })
        .limit(20);
      if (h) setHistory(h);

      const yr = new Date().getFullYear();
      const { data: yearDocs } = await supabase
        .from("staff_certificates")
        .select("cert_number")
        .like("cert_number", `${yr}-%`);
      const maxSeq = (yearDocs || []).reduce((mx: number, r: any) => {
        const m = /-(\d+)$/.exec(r.cert_number || "");
        return m ? Math.max(mx, parseInt(m[1], 10)) : mx;
      }, 0);
      setCertNumber(`${yr}-${String(maxSeq + 1).padStart(4, "0")}`);
    })();
  }, [staff.id]);

  const isCareer = docType === "career";
  const today = new Date("2026-08-21");
  const duration = calcDuration(staff.hire_date, isCareer ? staff.resign_date : null);
  const docTitle = isCareer ? "경 력 증 명 서" : "재 직 증 명 서";

  // ✅ v3.43.1: 로고 업로드
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("로고 이미지는 2MB 이하만 업로드 가능합니다.");
      return;
    }
    setUploadingLogo(true);
    try {
      // Storage 업로드
      const { uploadToStorage } = await import("@/lib/storageUpload");
      const { publicUrl } = await uploadToStorage("documents", "org-logo", file);

      // org_settings 업데이트 (upsert)
      if (orgInfo.id) {
        await supabase.from("org_settings").update({ logo_url: publicUrl }).eq("id", orgInfo.id);
      } else {
        const { data: newOrg } = await supabase
          .from("org_settings")
          .insert({ ...orgInfo, logo_url: publicUrl })
          .select()
          .single();
        if (newOrg) setOrgInfo(newOrg);
      }
      setOrgInfo((prev: any) => ({ ...prev, logo_url: publicUrl }));
      alert("✅ 로고가 등록되었습니다. 이후 발급되는 모든 서류에 자동으로 삽입됩니다.");
    } catch (err: any) {
      console.error(err);
      alert("로고 업로드 실패: " + (err.message || err));
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function handleRemoveLogo() {
    if (!confirm("등록된 로고를 삭제하시겠습니까?")) return;
    if (orgInfo.id) {
      await supabase.from("org_settings").update({ logo_url: null }).eq("id", orgInfo.id);
    }
    setOrgInfo((prev: any) => ({ ...prev, logo_url: "" }));
  }

  // 발급 처리
  async function handleIssue(action: "print" | "pdf") {
    setSaving(true);
    try {
      const insertPayload: any = {
        cert_number: certNumber,
        cert_type: docType,
        staff_id: staff.id,
        staff_name: staff.name,
        staff_birth: staff.birth || null,
        staff_address: staff.address || null,
        staff_phone: staff.phone || null,
        position_at_issue: form.position || null,
        department_at_issue: form.department || null,
        job_description_at_issue: form.job_description || null,
        hire_date: staff.hire_date || null,
        resign_date: isCareer ? (staff.resign_date || null) : null,
        purpose: form.purpose || null,
        issued_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("staff_certificates").insert(insertPayload);
      if (error) console.warn("[v3.43.1] 발급 이력 저장 실패:", error);

      if (action === "print") {
        window.print();
      } else {
        const [{ default: jsPDF }, html2canvas] = await Promise.all([
          import("jspdf"),
          import("html2canvas"),
        ]);
        const el = previewRef.current;
        if (!el) return;
        const canvas = await (html2canvas as any).default(el, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
        });
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
        const filename = `${isCareer ? "경력증명서" : "재직증명서"}_${staff.name}_${certNumber}.pdf`;
        pdf.save(filename);
      }

      const { data: h } = await supabase
        .from("staff_certificates")
        .select("*")
        .eq("staff_id", staff.id)
        .order("issued_at", { ascending: false })
        .limit(20);
      if (h) setHistory(h);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cert-bg-overlay fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:bg-white print:p-0 print:block">
      <div className="cert-print-root bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[95vh] overflow-hidden flex print:max-w-full print:max-h-full print:shadow-none print:rounded-none print:block">
        {/* ═══════════ 좌측: 발급 컨트롤 ═══════════ */}
        <div className="cert-side-panel w-[400px] border-r bg-slate-50 p-5 overflow-y-auto print:hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-800">서류 발급</h2>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-lg">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          {/* 직원 정보 요약 */}
          <div className="bg-white rounded-xl p-3 mb-4 border">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-slate-500">발급 대상</div>
              {isResigned && (
                <span className="text-[10px] px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">🚪 퇴사자</span>
              )}
            </div>
            <div className="text-base font-bold text-slate-800">{staff.name}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {staff.hire_date ? `📅 ${staff.hire_date} 입사` : "입사일 미등록"}
              {isResigned && staff.resign_date ? ` · 🚪 ${staff.resign_date} 퇴사` : ""}
            </div>
          </div>

          {/* ✅ v3.43.1: 로고 관리 카드 */}
          <div className="bg-white rounded-xl p-3 mb-4 border-2 border-dashed border-indigo-300">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-indigo-800 flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5" /> 센터 로고 (양식 상단 자동 삽입)
              </div>
              {orgInfo.logo_url && (
                <button onClick={handleRemoveLogo} className="text-[10px] text-red-500 hover:underline">
                  삭제
                </button>
              )}
            </div>
            {orgInfo.logo_url ? (
              <div className="flex items-center gap-2">
                <img src={orgInfo.logo_url} alt="센터 로고" className="w-16 h-16 object-contain border rounded" />
                <div className="flex-1 text-[10px] text-slate-500">
                  ✅ 로고 등록됨. 모든 서류 상단에 자동 삽입됩니다.
                </div>
              </div>
            ) : (
              <div>
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="w-full p-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50">
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingLogo ? "업로드 중..." : "로고 이미지 업로드"}
                </button>
                <div className="text-[10px] text-slate-500 mt-1">PNG/JPG, 최대 2MB</div>
              </div>
            )}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />
          </div>

          {/* 서류 종류 선택 */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-slate-600 mb-2">1️⃣ 서류 종류</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setDocType("employment")}
                disabled={isResigned}
                className={`p-3 rounded-xl text-sm font-bold transition ${
                  docType === "employment"
                    ? "bg-emerald-500 text-white shadow-md"
                    : "bg-white border text-slate-600 hover:bg-slate-100"
                } ${isResigned ? "opacity-40 cursor-not-allowed" : ""}`}>
                📄 재직증명서
              </button>
              <button
                onClick={() => setDocType("career")}
                className={`p-3 rounded-xl text-sm font-bold transition ${
                  docType === "career"
                    ? "bg-blue-500 text-white shadow-md"
                    : "bg-white border text-slate-600 hover:bg-slate-100"
                }`}>
                📋 경력증명서
              </button>
            </div>
            {isResigned && (
              <div className="text-[11px] text-orange-700 mt-2 bg-orange-50 border border-orange-200 rounded-lg p-2">
                💡 퇴사자이므로 <b>경력증명서</b>가 자동 선택되었으며, 퇴사일이 자동 입력됩니다.
              </div>
            )}
          </div>

          {/* 발급 정보 (수정 가능) */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-slate-600 mb-2">2️⃣ 발급 정보 (수정 가능)</div>
            <div className="space-y-2">
              <div>
                <label className="text-[11px] text-slate-500">직위</label>
                <input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })}
                  placeholder="수석 강사" className="w-full p-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">소속 부서</label>
                <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}
                  placeholder="수중재활팀" className="w-full p-2 border rounded-lg text-sm" />
              </div>
              {/* ✅ v3.43.2: 담당업무는 재직·경력증명서 모두 표시 */}
              <div>
                <label className="text-[11px] text-slate-500">담당업무</label>
                <textarea value={form.job_description} onChange={e => setForm({ ...form, job_description: e.target.value })}
                  rows={3} placeholder="수중재활 프로그램 진행 및 회원 관리"
                  className="w-full p-2 border rounded-lg text-sm resize-none" />
              </div>
              {isCareer && staff.resign_date && (
                <div>
                  <label className="text-[11px] text-slate-500">퇴사일 (자동)</label>
                  <input value={staff.resign_date} readOnly
                    className="w-full p-2 border rounded-lg text-sm bg-slate-100 text-slate-700 cursor-not-allowed" />
                </div>
              )}
              <div>
                <label className="text-[11px] text-slate-500">발급 목적</label>
                <input value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })}
                  placeholder="은행 제출용" className="w-full p-2 border rounded-lg text-sm" />
              </div>
            </div>
          </div>

          {/* 발급번호 */}
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <div className="text-[11px] text-emerald-700">3️⃣ 발급번호 (자동 채번)</div>
            <div className="text-lg font-bold text-emerald-800 font-mono">{certNumber}</div>
          </div>

          {/* 액션 버튼 */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button onClick={() => handleIssue("pdf")} disabled={saving}
              className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1 disabled:opacity-50">
              <Download className="w-4 h-4" /> PDF 다운로드
            </button>
            <button onClick={() => handleIssue("print")} disabled={saving}
              className="p-3 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1 disabled:opacity-50">
              <Printer className="w-4 h-4" /> 인쇄
            </button>
          </div>

          {/* 발급 이력 */}
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
              📚 최근 발급 이력 <span className="text-[10px] text-slate-400">({history.length})</span>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {history.length === 0 && <div className="text-[11px] text-slate-400 italic">아직 발급 이력 없음</div>}
              {history.map((h) => (
                <div key={h.id} className="text-[11px] bg-white border rounded-lg p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">{h.cert_number}</span>
                    <span className={`px-1.5 py-0.5 rounded ${h.cert_type === "career" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {h.cert_type === "career" ? "경력" : "재직"}
                    </span>
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    {new Date(h.issued_at).toLocaleDateString("ko-KR")} · {h.purpose || "목적 미기재"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══════════ 우측: A4 미리보기 ═══════════ */}
        <div className="cert-preview-wrap flex-1 overflow-y-auto bg-slate-100 p-6 print:p-0 print:bg-white print:overflow-visible">
          <div ref={previewRef}
            className="cert-preview bg-white shadow-lg mx-auto print:shadow-none"
            style={{ width: "210mm", minHeight: "260mm", padding: "18mm 18mm", fontFamily: "'Malgun Gothic', 'Nanum Gothic', sans-serif" }}>

            {/* ✅ v3.43.1: 상단 로고 영역 */}
            <div className="flex items-center justify-between mb-2">
              <div className="w-24 h-24 flex items-center justify-center">
                {orgInfo.logo_url ? (
                  <img src={orgInfo.logo_url} alt="센터 로고" className="max-w-full max-h-full object-contain" crossOrigin="anonymous" />
                ) : (
                  <div className="w-24 h-24 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-[10px] text-slate-400 text-center leading-tight">
                    로고<br/>미등록
                  </div>
                )}
              </div>
              <div className="text-right text-xs text-slate-600">발급번호: {certNumber}</div>
            </div>

            {/* 제목 */}
            <h1 className="text-center text-[32px] font-bold tracking-[0.5em] mb-8 border-b-2 border-slate-800 pb-4 mt-4">
              {docTitle}
            </h1>

            {/* 인적사항 표 */}
            <table className="w-full border-collapse border border-slate-400 text-sm mb-8">
              <tbody>
                <tr>
                  <td className="border border-slate-400 bg-slate-100 p-2 w-[110px] font-semibold text-center">성  명</td>
                  <td className="border border-slate-400 p-2 w-[200px]">{staff.name || "-"}</td>
                  <td className="border border-slate-400 bg-slate-100 p-2 w-[110px] font-semibold text-center">생년월일</td>
                  <td className="border border-slate-400 p-2">{staff.birth || "-"}</td>
                </tr>
                <tr>
                  <td className="border border-slate-400 bg-slate-100 p-2 font-semibold text-center">주민등록번호</td>
                  <td className="border border-slate-400 p-2" colSpan={3}>{staff.resident_number || "-"}</td>
                </tr>
                <tr>
                  <td className="border border-slate-400 bg-slate-100 p-2 font-semibold text-center">주  소</td>
                  <td className="border border-slate-400 p-2" colSpan={3}>{staff.address || "-"}</td>
                </tr>
                <tr>
                  <td className="border border-slate-400 bg-slate-100 p-2 font-semibold text-center">연 락 처</td>
                  <td className="border border-slate-400 p-2" colSpan={3}>{staff.phone || "-"}</td>
                </tr>
                <tr>
                  <td className="border border-slate-400 bg-slate-100 p-2 font-semibold text-center">소  속</td>
                  <td className="border border-slate-400 p-2">{form.department || "-"}</td>
                  <td className="border border-slate-400 bg-slate-100 p-2 font-semibold text-center">직  위</td>
                  <td className="border border-slate-400 p-2">{form.position || "-"}</td>
                </tr>
                <tr>
                  <td className="border border-slate-400 bg-slate-100 p-2 font-semibold text-center">입 사 일</td>
                  <td className="border border-slate-400 p-2">{staff.hire_date || "-"}</td>
                  <td className="border border-slate-400 bg-slate-100 p-2 font-semibold text-center">
                    {isCareer ? "퇴 사 일" : "재직상태"}
                  </td>
                  <td className="border border-slate-400 p-2">
                    {isCareer ? (staff.resign_date || "-") : "재직중"}
                  </td>
                </tr>
                <tr>
                  <td className="border border-slate-400 bg-slate-100 p-2 font-semibold text-center">
                    {isCareer ? "근무기간" : "재직기간"}
                  </td>
                  <td className="border border-slate-400 p-2" colSpan={3}>
                    {staff.hire_date || "-"} ~ {isCareer ? (staff.resign_date || "-") : "재직중"} ({duration})
                  </td>
                </tr>
                {/* ✅ v3.43.2: 담당업무 재직증명서에도 표시 */}
                {form.job_description && (
                  <tr>
                    <td className="border border-slate-400 bg-slate-100 p-2 font-semibold text-center">담당업무</td>
                    <td className="border border-slate-400 p-2 whitespace-pre-wrap" colSpan={3} style={{ minHeight: "60px" }}>
                      {form.job_description}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* 증명 문구 */}
            <p className="text-center text-base leading-loose mb-10">
              위 사람은 본 센터의 {isCareer ? "직원으로 근무하였음을" : "재직자임을"} 증명합니다.
            </p>

            {/* 발급 목적 */}
            {form.purpose && (
              <div className="text-sm text-slate-700 mb-4">
                <span className="font-semibold">발급 목적:</span> {form.purpose}
              </div>
            )}

            {/* 발급일 */}
            <p className="text-center text-lg font-semibold mb-12 mt-10">
              {fmtKoreanDate(today)}
            </p>

            {/* 센터 정보 + 도장 자리 (v3.43.1: (인) 제거, 실물 도장 날인 공간) */}
            <div className="border-t-2 border-slate-800 pt-6 mt-8">
              <div className="flex items-start justify-between">
                <table className="text-sm flex-1">
                  <tbody>
                    <tr>
                      <td className="py-1 w-[110px] font-semibold">센 터 명</td>
                      <td className="py-1">{orgInfo.center_name}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold">대 표 자</td>
                      <td className="py-1 font-bold">{orgInfo.ceo_name}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold">사업자등록번호</td>
                      <td className="py-1">{orgInfo.business_number}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold">주  소</td>
                      <td className="py-1">{orgInfo.address}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold">연 락 처</td>
                      <td className="py-1">{orgInfo.phone}</td>
                    </tr>
                  </tbody>
                </table>

                {/* ✅ v3.43.1: 실물 도장 날인 자리 (빈 원형, 인쇄 후 직접 찍기) */}
                <div className="ml-6 flex-shrink-0 flex flex-col items-center">
                  <div
                    className="w-24 h-24 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400 text-center leading-tight print:border-slate-200"
                    style={{ marginTop: "20px" }}>
                    도장<br/>날인란
                  </div>
                  <div className="text-[9px] text-slate-400 mt-1 print:hidden">인쇄 후 직접 날인</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ v3.43.2: 인쇄 CSS 전면 재작성 - A4 전체 활용, 눌림 완전 해결 */}
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 15mm 12mm; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            width: 210mm !important;
            height: auto !important;
          }
          body > *:not(.cert-print-root),
          .print\:hidden {
            display: none !important;
          }
          .cert-print-root {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: auto !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            display: block !important;
            overflow: visible !important;
            z-index: 999999 !important;
          }
          .cert-print-root * { visibility: visible !important; }
          .cert-side-panel,
          .cert-bg-overlay::before {
            display: none !important;
          }
          .cert-preview-wrap {
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
          }
          .cert-preview {
            width: 100% !important;
            min-height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            page-break-inside: avoid;
          }
          .cert-preview table, .cert-preview tr { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
