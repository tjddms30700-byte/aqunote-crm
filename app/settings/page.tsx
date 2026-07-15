"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Settings, Upload, Image as ImageIcon, Trash2, Save, Building2,
  MapPin, Plus, X, Users as UsersIcon, KeyRound, ShieldCheck, Store,
} from "lucide-react";
import HomeButton from "@/components/HomeButton";

type TabKey = "org" | "branches" | "accounts" | "logo";

export default function SettingsPage() {
  const [tab, setTab] = useState<TabKey>("org");
  const [org, setOrg] = useState<any>(null);
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);

  // 센터 정보 폼
  const [orgForm, setOrgForm] = useState<any>({});
  // 지점 폼
  const [newBranch, setNewBranch] = useState<any>({ name: "", address: "", phone: "", manager_name: "" });
  // 계정 폼
  const [newAcct, setNewAcct] = useState<any>({ staff_id: "", login_id: "", email: "", password: "", permission: "general" });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const { data: o } = await supabase.from("organizations").select("*").limit(1).single();
    if (o) {
      setOrg(o);
      setLogoUrl(o.logo_url || "");
      setOrgForm(o);
    }
    const { data: b } = await supabase.from("branches").select("*").is("deleted_at", null).order("is_main", { ascending: false }).order("created_at");
    setBranches(b || []);
    const { data: s } = await supabase.from("staff").select("id,name,role,email").is("deleted_at", null).order("name");
    setStaffList(s || []);
    const { data: a } = await supabase.from("staff_accounts").select("*, staff(name, role)").is("deleted_at", null).order("created_at", { ascending: false });
    setAccounts(a || []);
  }

  // ═══ 로고 업로드 ═══
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
    window.dispatchEvent(new CustomEvent("logo-updated"));
    alert("✅ 기본 로고로 되돌렸습니다");
  }

  // ═══ 센터 정보 저장 ═══
  async function saveOrg() {
    setSaving(true);
    const { error } = await supabase.from("organizations").update({
      name: orgForm.name,
      business_no: orgForm.business_no,
      address: orgForm.address,
      business_type: orgForm.business_type,
      business_item: orgForm.business_item,
      bank_account: orgForm.bank_account,
      phone: orgForm.phone,
      email: orgForm.email,
      ceo_name: orgForm.ceo_name,
      ceo_birth: orgForm.ceo_birth || null,
      ceo_phone: orgForm.ceo_phone,
    }).eq("id", org.id);
    setSaving(false);
    if (error) { alert("저장 실패: " + error.message); return; }
    alert("✅ 저장되었습니다");
    loadAll();
  }

  // ═══ 지점 추가/삭제 ═══
  async function addBranch() {
    if (!newBranch.name.trim()) { alert("지점명을 입력하세요"); return; }
    const { error } = await supabase.from("branches").insert({
      org_id: org.id,
      name: newBranch.name.trim(),
      address: newBranch.address.trim() || null,
      phone: newBranch.phone.trim() || null,
      manager_name: newBranch.manager_name.trim() || null,
      is_main: branches.length === 0,
      is_active: true,
    });
    if (error) { alert("추가 실패: " + error.message); return; }
    setNewBranch({ name: "", address: "", phone: "", manager_name: "" });
    loadAll();
  }

  async function toggleMain(b: any) {
    // 다른 모든 지점의 is_main → false, 현재만 true
    await supabase.from("branches").update({ is_main: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("branches").update({ is_main: true }).eq("id", b.id);
    loadAll();
  }

  async function deleteBranch(b: any) {
    if (b.is_main) { alert("본점은 삭제할 수 없습니다. 먼저 다른 지점을 본점으로 지정하세요"); return; }
    if (!confirm(`"${b.name}" 지점을 삭제할까요?`)) return;
    await supabase.from("branches").update({ deleted_at: new Date().toISOString() }).eq("id", b.id);
    loadAll();
  }

  // ═══ 직원 로그인 계정 생성 ═══
  async function createAccount() {
    if (!newAcct.staff_id) { alert("직원을 선택하세요"); return; }
    if (!newAcct.login_id.trim()) { alert("로그인 아이디를 입력하세요"); return; }
    if (!newAcct.password || newAcct.password.length < 6) { alert("비밀번호는 6자 이상 입력하세요"); return; }

    // 중복 검사
    const { data: dupLogin } = await supabase.from("staff_accounts").select("id").eq("login_id", newAcct.login_id.trim()).is("deleted_at", null).maybeSingle();
    if (dupLogin) { alert("이미 사용 중인 아이디입니다"); return; }
    if (newAcct.email) {
      const { data: dupEmail } = await supabase.from("staff_accounts").select("id").eq("email", newAcct.email.trim()).is("deleted_at", null).maybeSingle();
      if (dupEmail) { alert("이미 사용 중인 이메일입니다"); return; }
    }

    // Supabase Auth 사용자 생성 시도 (실패해도 staff_accounts는 기록)
    let authUserId: string | null = null;
    try {
      const emailForAuth = newAcct.email?.trim() || `${newAcct.login_id.trim()}@aqunote.local`;
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: emailForAuth,
        password: newAcct.password,
        options: { data: { staff_id: newAcct.staff_id, permission: newAcct.permission } },
      });
      if (!authErr && authData.user) authUserId = authData.user.id;
    } catch (e) { /* Auth 실패 무시, DB 기록은 진행 */ }

    const { error } = await supabase.from("staff_accounts").insert({
      staff_id: newAcct.staff_id,
      org_id: org.id,
      login_id: newAcct.login_id.trim(),
      email: newAcct.email?.trim() || null,
      auth_user_id: authUserId,
      permission: newAcct.permission,
      is_active: true,
    });
    if (error) { alert("계정 생성 실패: " + error.message); return; }
    setNewAcct({ staff_id: "", login_id: "", email: "", password: "", permission: "general" });
    alert("✅ 로그인 계정이 생성되었습니다");
    loadAll();
  }

  async function toggleAccountActive(a: any) {
    await supabase.from("staff_accounts").update({ is_active: !a.is_active }).eq("id", a.id);
    loadAll();
  }
  async function deleteAccount(a: any) {
    if (!confirm(`"${a.login_id}" 계정을 삭제할까요?`)) return;
    await supabase.from("staff_accounts").update({ deleted_at: new Date().toISOString() }).eq("id", a.id);
    loadAll();
  }
  async function togglePermission(a: any) {
    const next = a.permission === "master" ? "general" : "master";
    await supabase.from("staff_accounts").update({ permission: next }).eq("id", a.id);
    loadAll();
  }

  return (
    <main className="max-w-5xl mx-auto px-3 md:px-6 py-6 md:py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-500 to-gray-700 flex items-center justify-center shadow">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">환경 설정</h1>
            <p className="text-xs text-gray-500">센터 정보 · 지점 · 로고 · 로그인 계정</p>
          </div>
        </div>
        <HomeButton />
      </div>

      {/* 탭 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 p-1 flex gap-1 overflow-x-auto">
        {[
          { k: "org",      label: "🏢 센터 정보", icon: Building2 },
          { k: "branches", label: "🏪 지점 관리", icon: Store },
          { k: "accounts", label: "🔑 로그인 계정", icon: KeyRound },
          { k: "logo",     label: "🖼 로고", icon: ImageIcon },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as TabKey)}
            className={`flex-1 min-w-[110px] px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
              tab === t.k ? "bg-gradient-to-br from-slate-600 to-gray-800 text-white shadow" : "text-gray-600 hover:bg-slate-50"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ [1] 센터 정보 탭 ═══ */}
      {tab === "org" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-7">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-slate-600" /> 센터 정보
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="🏢 센터명"        value={orgForm.name || ""}          onChange={(v) => setOrgForm({ ...orgForm, name: v })} />
            <Field label="📋 사업자등록번호" value={orgForm.business_no || ""}   onChange={(v) => setOrgForm({ ...orgForm, business_no: v })} placeholder="000-00-00000" />
            <Field label="📍 주소지" value={orgForm.address || ""} onChange={(v) => setOrgForm({ ...orgForm, address: v })} full />
            <Field label="🏷 업태"           value={orgForm.business_type || ""} onChange={(v) => setOrgForm({ ...orgForm, business_type: v })} placeholder="서비스업" />
            <Field label="🎯 업종"           value={orgForm.business_item || ""} onChange={(v) => setOrgForm({ ...orgForm, business_item: v })} placeholder="아동/청소년 재활, 수중치료" />
            <Field label="🏦 사업자 통장" value={orgForm.bank_account || ""} onChange={(v) => setOrgForm({ ...orgForm, bank_account: v })} placeholder="은행명 000-000000-00-000" full />
            <Field label="📞 전화번호"        value={orgForm.phone || ""}         onChange={(v) => setOrgForm({ ...orgForm, phone: v })} placeholder="02-000-0000" />
            <Field label="📧 이메일"          value={orgForm.email || ""}         onChange={(v) => setOrgForm({ ...orgForm, email: v })} placeholder="center@example.com" type="email" />

            <div className="md:col-span-2 mt-2 pt-4 border-t border-gray-100">
              <div className="text-sm font-bold text-slate-700 mb-3">👤 대표자 정보</div>
            </div>
            <Field label="👤 대표자명"        value={orgForm.ceo_name || ""}      onChange={(v) => setOrgForm({ ...orgForm, ceo_name: v })} />
            <Field label="🎂 대표자 생년월일" value={orgForm.ceo_birth || ""}     onChange={(v) => setOrgForm({ ...orgForm, ceo_birth: v })} type="date" />
            <Field label="📱 대표자 휴대폰"   value={orgForm.ceo_phone || ""}     onChange={(v) => setOrgForm({ ...orgForm, ceo_phone: v })} placeholder="010-0000-0000" full />
          </div>
          <div className="mt-6 flex justify-end">
            <button onClick={saveOrg} disabled={saving}
              className="px-5 py-2.5 bg-gradient-to-br from-slate-600 to-gray-800 text-white rounded-xl shadow font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
              <Save className="w-4 h-4" /> {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      )}

      {/* ═══ [2] 지점 관리 탭 ═══ */}
      {tab === "branches" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-slate-600" /> 새 지점 추가
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input value={newBranch.name} onChange={e => setNewBranch({ ...newBranch, name: e.target.value })}
                placeholder="지점명 (예: 위례본점)" className="px-3 py-2 border border-gray-200 rounded-lg" />
              <input value={newBranch.manager_name} onChange={e => setNewBranch({ ...newBranch, manager_name: e.target.value })}
                placeholder="지점장명" className="px-3 py-2 border border-gray-200 rounded-lg" />
              <input value={newBranch.address} onChange={e => setNewBranch({ ...newBranch, address: e.target.value })}
                placeholder="주소" className="px-3 py-2 border border-gray-200 rounded-lg md:col-span-2" />
              <input value={newBranch.phone} onChange={e => setNewBranch({ ...newBranch, phone: e.target.value })}
                placeholder="전화번호" className="px-3 py-2 border border-gray-200 rounded-lg md:col-span-2" />
            </div>
            <button onClick={addBranch}
              className="mt-3 px-5 py-2.5 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-xl shadow font-semibold hover:opacity-90 flex items-center gap-2">
              <Plus className="w-4 h-4" /> 지점 추가
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Store className="w-5 h-5 text-slate-600" /> 지점 목록 ({branches.length}개)
            </h2>
            {branches.length === 0 ? (
              <div className="text-sm text-gray-400 py-6 text-center">등록된 지점이 없습니다</div>
            ) : (
              <div className="space-y-2">
                {branches.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:border-blue-200 transition">
                    <div className="flex items-center gap-3">
                      <MapPin className={`w-5 h-5 ${b.is_main ? "text-yellow-500" : "text-gray-400"}`} />
                      <div>
                        <div className="font-semibold text-slate-900 flex items-center gap-2">
                          {b.name}
                          {b.is_main && <span className="text-[10px] px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">본점</span>}
                          {!b.is_active && <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">비활성</span>}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {b.address && <span>📍 {b.address}</span>}
                          {b.phone && <span className="ml-2">📞 {b.phone}</span>}
                          {b.manager_name && <span className="ml-2">👤 {b.manager_name}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!b.is_main && (
                        <button onClick={() => toggleMain(b)}
                          className="px-2.5 py-1.5 text-xs text-yellow-700 hover:bg-yellow-50 rounded-lg" title="본점 지정">
                          ⭐ 본점 지정
                        </button>
                      )}
                      <button onClick={() => deleteBranch(b)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="삭제">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ [3] 로그인 계정 탭 ═══ */}
      {tab === "accounts" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-slate-600" /> 로그인 계정 생성
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600 block mb-1">직원 선택 <span className="text-red-500">*</span></label>
                <select value={newAcct.staff_id} onChange={e => setNewAcct({ ...newAcct, staff_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                  <option value="">-- 직원 선택 --</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role || "직원"})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">관리 권한 <span className="text-red-500">*</span></label>
                <select value={newAcct.permission} onChange={e => setNewAcct({ ...newAcct, permission: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                  <option value="general">일반 권한 (직원)</option>
                  <option value="master">마스터 권한 (관리자)</option>
                </select>
              </div>
              <Field label="🆔 로그인 아이디" value={newAcct.login_id} onChange={v => setNewAcct({ ...newAcct, login_id: v })} placeholder="예: therapist1" />
              <Field label="📧 이메일 (선택)" value={newAcct.email} onChange={v => setNewAcct({ ...newAcct, email: v })} placeholder="user@example.com" type="email" />
              <Field label="🔒 비밀번호 (6자+)" value={newAcct.password} onChange={v => setNewAcct({ ...newAcct, password: v })} placeholder="영문·숫자 6자 이상" type="password" full />
            </div>
            <button onClick={createAccount}
              className="mt-3 px-5 py-2.5 bg-gradient-to-br from-green-600 to-emerald-600 text-white rounded-xl shadow font-semibold hover:opacity-90 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> 계정 생성
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-lg font-bold text-slate-900 mb-4">등록된 로그인 계정 ({accounts.length}개)</h2>
            {accounts.length === 0 ? (
              <div className="text-sm text-gray-400 py-6 text-center">아직 생성된 계정이 없습니다</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="py-2">직원</th>
                      <th className="py-2">로그인 아이디</th>
                      <th className="py-2">이메일</th>
                      <th className="py-2 text-center">권한</th>
                      <th className="py-2 text-center">상태</th>
                      <th className="py-2 text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map(a => (
                      <tr key={a.id} className="border-b border-gray-50 hover:bg-slate-50">
                        <td className="py-2.5 font-semibold text-slate-900">
                          {a.staff?.name || "—"}
                          <span className="text-xs text-gray-500 ml-1">({a.staff?.role || "-"})</span>
                        </td>
                        <td className="py-2.5 font-mono text-xs">{a.login_id}</td>
                        <td className="py-2.5 text-xs text-gray-600">{a.email || "—"}</td>
                        <td className="py-2.5 text-center">
                          <button onClick={() => togglePermission(a)}
                            className={`text-[10px] px-2 py-1 rounded-full font-semibold ${
                              a.permission === "master" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                            }`}>
                            {a.permission === "master" ? "👑 마스터" : "👤 일반"}
                          </button>
                        </td>
                        <td className="py-2.5 text-center">
                          <button onClick={() => toggleAccountActive(a)}
                            className={`text-[10px] px-2 py-1 rounded-full font-semibold ${
                              a.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                            }`}>
                            {a.is_active ? "활성" : "비활성"}
                          </button>
                        </td>
                        <td className="py-2.5 text-right">
                          <button onClick={() => deleteAccount(a)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ [4] 로고 탭 ═══ */}
      {tab === "logo" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-7">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-slate-600" /> 로고 관리
          </h2>
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="w-40 h-40 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center bg-slate-50 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="로고" className="w-full h-full object-contain" />
              ) : (
                <img src="/logo-whale.png" alt="기본 로고" className="w-24 h-24 object-contain opacity-50" />
              )}
            </div>
            <div className="flex-1 space-y-3">
              <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-xl shadow font-semibold hover:opacity-90 cursor-pointer">
                <Upload className="w-4 h-4" />
                {uploading ? "업로드 중..." : "로고 파일 선택 (5MB 이하)"}
                <input type="file" accept="image/*" onChange={uploadLogo} disabled={uploading} className="hidden" />
              </label>
              {logoUrl && (
                <button onClick={resetLogo}
                  className="ml-2 inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200">
                  <Trash2 className="w-4 h-4" /> 기본 로고로 되돌리기
                </button>
              )}
              <p className="text-xs text-gray-500">
                권장: 정사각형(1:1) PNG · 512x512 이상 · 투명 배경. 업로드 즉시 모든 화면(홈 · 회원관리 · 신청폼 등)에 반영됩니다.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", full }: any) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="text-xs text-gray-600 block mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none" />
    </div>
  );
}
