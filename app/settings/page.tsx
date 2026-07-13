"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Settings, Upload, Image as ImageIcon, Trash2, Save, Building2 } from "lucide-react";
import HomeButton from "@/components/HomeButton";

export default function SettingsPage() {
  const [org, setOrg] = useState<any>(null);
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [saving, setSaving] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const { data } = await supabase.from("organizations").select("*").limit(1).single();
    if (data) {
      setOrg(data);
      setLogoUrl(data.logo_url || "");
      setOrgName(data.name || "");
    }
    const { data: b } = await supabase.from("branches").select("*").order("created_at");
    setBranches(b || []);
  }

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("이미지 파일만 업로드 가능합니다"); return; }
    if (file.size > 5 * 1024 * 1024) { alert("5MB 이하 파일만 업로드 가능합니다"); return; }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const filePath = `logos/logo_${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage.from("documents").upload(filePath, file, { upsert: true });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from("documents").getPublicUrl(filePath);
      const publicUrl = data.publicUrl;

      const { error: dbErr } = await supabase.from("organizations").update({ logo_url: publicUrl }).eq("id", org.id);
      if (dbErr) throw dbErr;

      setLogoUrl(publicUrl);
      alert("✅ 로고가 변경되었습니다! 홈페이지에서 확인하세요");
      // 즉시 반영을 위해 다른 페이지도 새로고침 유도
      window.dispatchEvent(new CustomEvent("logo-updated"));
    } catch (err: any) {
      alert("업로드 실패: " + err.message);
    } finally {
      setUploading(false);
      (e.target as HTMLInputElement).value = "";
    }
  }

  async function resetLogo() {
    if (!confirm("기본 고래 로고로 되돌립니다")) return;
    await supabase.from("organizations").update({ logo_url: null }).eq("id", org.id);
    setLogoUrl("");
    alert("✅ 기본 로고로 되돌렸습니다");
  }

  async function saveOrgName() {
    setSaving(true);
    await supabase.from("organizations").update({ name: orgName }).eq("id", org.id);
    setSaving(false);
    alert("✅ 저장되었습니다");
    loadAll();
  }

  return (
    <main className="max-w-4xl mx-auto px-3 md:px-6 py-6 md:py-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl md:text-3xl font-bold text-aqu-900 flex items-center gap-2">
          <Settings className="w-6 h-6 md:w-7 md:h-7 text-slate-500" /> 설정
        </h1>
        <HomeButton />
      </div>

      <div className="space-y-6">
        {/* 로고 설정 */}
        <section className="bg-white rounded-2xl shadow-md border border-aqu-100 p-5 md:p-6">
          <h2 className="text-base md:text-lg font-bold text-aqu-900 mb-4 flex items-center gap-2">
            <ImageIcon className="w-5 h-5" /> 로고 설정
          </h2>

          <div className="flex flex-col md:flex-row items-start gap-6">
            {/* 현재 로고 */}
            <div className="flex flex-col items-center">
              <div className="w-40 h-40 bg-gradient-to-br from-aqu-50 to-blue-50 rounded-2xl p-3 border-2 border-aqu-200 flex items-center justify-center">
                <img src={logoUrl || "/logo-whale.png"}
                  alt="Current logo"
                  className="max-w-full max-h-full object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).src = "/logo-whale.png"; }} />
              </div>
              <div className="text-xs text-gray-500 mt-2 text-center">
                {logoUrl ? "커스텀 로고" : "기본 고래 로고"}
              </div>
            </div>

            {/* 업로드 */}
            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">새 로고 업로드</label>
                <input type="file" accept="image/*" onChange={uploadLogo} disabled={uploading}
                  className="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-aqu-600 file:text-white file:hover:bg-aqu-700 file:cursor-pointer disabled:opacity-50" />
                {uploading && <div className="mt-2 text-xs text-aqu-600">📤 업로드 중...</div>}
                <p className="text-xs text-gray-500 mt-2">
                  📌 권장: 정사각형 · PNG 배경 투명 · 512px 이상<br/>
                  📌 최대 5MB · JPG/PNG/WEBP/SVG
                </p>
              </div>

              {logoUrl && (
                <button onClick={resetLogo}
                  className="text-xs px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5" /> 기본 로고로 되돌리기
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 p-3 bg-aqu-50/50 border border-aqu-100 rounded-xl text-xs text-aqu-800">
            💡 로고는 홈 화면 · 각 페이지 상단 · 로그인 화면에 표시됩니다. 변경 후 새로고침하면 즉시 반영됩니다.
          </div>
        </section>

        {/* 센터 정보 */}
        <section className="bg-white rounded-2xl shadow-md border border-aqu-100 p-5 md:p-6">
          <h2 className="text-base md:text-lg font-bold text-aqu-900 mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5" /> 센터 정보
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">센터명</label>
              <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-aqu-400 focus:outline-none" />
            </div>
            <button onClick={saveOrgName} disabled={saving}
              className="px-4 py-2 bg-aqu-600 hover:bg-aqu-700 text-white rounded-lg text-sm flex items-center gap-1">
              <Save className="w-4 h-4" /> {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </section>

        {/* 지점 목록 */}
        <section className="bg-white rounded-2xl shadow-md border border-aqu-100 p-5 md:p-6">
          <h2 className="text-base md:text-lg font-bold text-aqu-900 mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5" /> 지점 관리
          </h2>
          <div className="text-xs text-gray-500 mb-3">
            💡 여러 지점 운영 시 각 지점별로 회원 · 시간표 · 매출을 분리 관리할 수 있습니다 (v2.9에서 지점별 로그인 UI 추가 예정)
          </div>
          <div className="space-y-2">
            {branches.map(b => (
              <div key={b.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium">{b.name}</span>
                  {b.is_main && <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-aqu-100 text-aqu-700 rounded">본점</span>}
                </div>
                <span className="text-xs text-gray-500">{b.address || "주소 없음"}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
