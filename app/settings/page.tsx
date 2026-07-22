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
  const [newAcct, setNewAcct] = useState<any>({ staff_id: "", login_id: "", email: "", password: "", permission: "general", branch_id: "", is_master: false });

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
      // ✅ localStorage 즉시 업데이트로 깜빡임 제거
      try {
        const cacheUrl = publicUrl + (publicUrl.includes("?") ? "&" : "?") + "v=" + Date.now();
        window.localStorage.setItem("aqu_logo_url_v2", cacheUrl);
      } catch {}
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
    // ✅ localStorage 캐시 즉시 정리 + 전체 페이지 기본 로고로 즉시 전환 (깜빡임 없음)
    try {
      window.localStorage.removeItem("aqu_logo_url_v2");
      window.localStorage.setItem("aqu_logo_url_v2", "DEFAULT");
    } catch {}
    window.dispatchEvent(new CustomEvent("logo-reset"));
    window.dispatchEvent(new CustomEvent("logo-updated"));
    alert("✅ 기본 로고로 되돌렸습니다");
  }

  // ═══ 센터 정보 저장 ═══
  async function saveOrg() {
    if (!org?.id) { alert("센터 정보를 불러오지 못했습니다"); return; }
    setSaving(true);

    // 이미 존재하는 컬럼만 업데이트하도록 방어적으로 처리 (스키마에 없는 컬럼은 자동 스킵)
    const candidateFields: Record<string, any> = {
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
    };

    // 유효성 필터링 (undefined 제거)
    const payload: Record<string, any> = {};
    for (const [k, v] of Object.entries(candidateFields)) {
      if (v !== undefined) payload[k] = v;
    }

    // 순차적으로 시도 → 실패 컬럼 자동 제거 후 재시도 (최대 12번)
    let attempt = 0;
    let lastErr: any = null;
    let selectRes: any = null;
    while (attempt < 12) {
      attempt++;
      const { data, error } = await supabase.from("organizations").update(payload).eq("id", org.id).select();
      if (!error) {
        selectRes = data;
        lastErr = null;
        break;
      }
      lastErr = error;
      // 'column X does not exist' 또는 'Could not find the X column' 패턴 자동 제거
      const m = error.message.match(/'([^']+)' column|column "([^"]+)"/);
      const missing = m?.[1] || m?.[2];
      if (missing && missing in payload) {
        delete payload[missing];
        continue;
      }
      break;
    }

    setSaving(false);
    if (lastErr) {
      alert("저장 실패: " + lastErr.message + "\n\n💡 AQUNOTE_V37_FIX2.sql을 Supabase에 실행해 주세요.");
      return;
    }
    // 업데이트된 행이 0개면 RLS 문제 가능성
    if (Array.isArray(selectRes) && selectRes.length === 0) {
      alert("⚠️ 저장이 무시되었습니다 (0행 업데이트).\n\nRLS(보안 정책) 때문입니다. AQUNOTE_V37_FIX2.sql을 실행하면 UPDATE 정책이 자동 생성됩니다.");
      return;
    }
    alert("✅ 저장되었습니다");
    loadAll();
  }

  // ═══ 지점 추가/삭제 ═══
  async function addBranch() {
    if (!newBranch.name.trim()) { alert("지점명을 입력하세요"); return; }
    const bt = newBranch.branch_type || "branch";
    const isHead = bt === "head";
    // 본점은 1개만 존재 가능: 이미 다른 head가 있으면 direct로 자동 전환
    if (isHead) {
      const existingHead = branches.find(b => b.branch_type === "head");
      if (existingHead) {
        if (!confirm(`이미 본점(${existingHead.name})이 있습니다.\n새 지점을 본점으로 지정하면 기존 본점은 직영점으로 변경됩니다. 계속할까요?`)) return;
        await supabase.from("branches").update({ branch_type: "direct", is_main: false }).eq("id", existingHead.id);
      }
    }
    const { error } = await supabase.from("branches").insert({
      org_id: org.id,
      name: newBranch.name.trim(),
      address: newBranch.address.trim() || null,
      phone: newBranch.phone.trim() || null,
      manager_name: newBranch.manager_name.trim() || null,
      branch_type: bt,
      is_main: isHead || branches.length === 0,
      is_active: true,
    });
    if (error) { alert("추가 실패: " + error.message + "\n(SQL 마이그레이션 미적용 시 AQUNOTE_V310_BRANCH_MASTER.sql 실행 필요)"); return; }
    setNewBranch({ name: "", address: "", phone: "", manager_name: "", branch_type: "branch" });
    loadAll();
  }

  async function updateBranchType(b: any, newType: string) {
    // head로 변경 시 기존 head를 direct로 자동 전환
    if (newType === "head") {
      const existingHead = branches.find(x => x.branch_type === "head" && x.id !== b.id);
      if (existingHead) {
        await supabase.from("branches").update({ branch_type: "direct", is_main: false }).eq("id", existingHead.id);
      }
      await supabase.from("branches").update({ branch_type: "head", is_main: true }).eq("id", b.id);
    } else {
      await supabase.from("branches").update({ branch_type: newType, is_main: false }).eq("id", b.id);
    }
    loadAll();
  }

  async function toggleMain(b: any) {
    // 다른 모든 지점의 is_main → false, 현재만 true (+ branch_type head로 자동 지정)
    await supabase.from("branches").update({ is_main: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("branches").update({ branch_type: "direct" }).eq("branch_type", "head");
    await supabase.from("branches").update({ is_main: true, branch_type: "head" }).eq("id", b.id);
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

    const insertPayload: any = {
      staff_id: newAcct.staff_id,
      org_id: org.id,
      login_id: newAcct.login_id.trim(),
      email: newAcct.email?.trim() || null,
      auth_user_id: authUserId,
      permission: newAcct.permission,
      is_active: true,
    };
    // ✅ v3.10: branch_id + is_master 추가 (마이그레이션 적용 시)
    if (newAcct.branch_id) insertPayload.branch_id = newAcct.branch_id;
    if (newAcct.is_master) insertPayload.is_master = true;
    let { error } = await supabase.from("staff_accounts").insert(insertPayload);
    // branch_id/is_master 컴럼 미존재 시 재시도
    if (error && (error.message.includes("branch_id") || error.message.includes("is_master"))) {
      delete insertPayload.branch_id;
      delete insertPayload.is_master;
      const retry = await supabase.from("staff_accounts").insert(insertPayload);
      error = retry.error;
      if (!error) alert("⚠️ 지점/마스터 설정은 저장되지 않았습니다. AQUNOTE_V310_BRANCH_MASTER.sql을 먼저 실행해주세요.");
    }
    if (error) { alert("계정 생성 실패: " + error.message); return; }
    setNewAcct({ staff_id: "", login_id: "", email: "", password: "", permission: "general", branch_id: "", is_master: false });
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
    // 마스터로 승격 시 is_master도 함께 설정
    await supabase.from("staff_accounts").update({ permission: next, is_master: next === "master" }).eq("id", a.id);
    loadAll();
  }

  // ✅ 계정의 지점 변경
  async function updateAccountBranch(a: any, branchId: string) {
    await supabase.from("staff_accounts").update({ branch_id: branchId || null }).eq("id", a.id);
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
              {/* ✅ 지점 유형 선택 버튼 */}
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">지점 유형</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { k: "head",   label: "🏢 본점",   desc: "마스터·1개만",  color: "from-yellow-400 to-amber-500" },
                    { k: "direct", label: "🏪 직영점", desc: "직접 운영",  color: "from-blue-500 to-indigo-500" },
                    { k: "branch", label: "🏬 지점",   desc: "일반 지점",  color: "from-gray-400 to-slate-500" },
                  ].map(t => (
                    <button key={t.k} type="button"
                      onClick={() => setNewBranch({ ...newBranch, branch_type: t.k })}
                      className={`px-3 py-2.5 rounded-lg border-2 text-sm text-left transition ${
                        newBranch.branch_type === t.k
                          ? `bg-gradient-to-br ${t.color} text-white border-transparent shadow`
                          : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}>
                      <div className="font-bold">{t.label}</div>
                      <div className="text-[10px] opacity-80 mt-0.5">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
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
                {branches.map(b => {
                  const typeMeta: any = {
                    head:   { icon: "🏢", label: "본점",   color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
                    direct: { icon: "🏪", label: "직영점", color: "bg-blue-100 text-blue-700 border-blue-200" },
                    branch: { icon: "🏬", label: "지점",   color: "bg-gray-100 text-gray-700 border-gray-200" },
                  };
                  const tm = typeMeta[b.branch_type] || typeMeta.branch;
                  return (
                  <div key={b.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:border-blue-200 transition">
                    <div className="flex items-center gap-3">
                      <MapPin className={`w-5 h-5 ${b.branch_type === "head" ? "text-yellow-500" : b.branch_type === "direct" ? "text-blue-500" : "text-gray-400"}`} />
                      <div>
                        <div className="font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
                          {b.name}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${tm.color}`}>
                            {tm.icon} {tm.label}
                          </span>
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
                      {/* ✅ 지점 유형 변경 드롭다운 */}
                      <select value={b.branch_type || "branch"} onChange={e => updateBranchType(b, e.target.value)}
                        className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white">
                        <option value="head">🏢 본점</option>
                        <option value="direct">🏪 직영점</option>
                        <option value="branch">🏬 지점</option>
                      </select>
                      <button onClick={() => deleteBranch(b)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="삭제">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  );
                })}
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
              {/* ✅ 지점 선택 */}
              <div>
                <label className="text-xs text-gray-600 block mb-1">🏬 소속 지점</label>
                <select value={newAcct.branch_id} onChange={e => setNewAcct({ ...newAcct, branch_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg">
                  <option value="">-- 지점 선택 --</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.branch_type === "head" ? "🏢" : b.branch_type === "direct" ? "🏪" : "🏬"} {b.name}
                    </option>
                  ))}
                </select>
              </div>
              {/* ✅ 마스터 계정 체크박스 */}
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg hover:bg-yellow-50">
                  <input type="checkbox" checked={newAcct.is_master}
                    onChange={e => setNewAcct({ ...newAcct, is_master: e.target.checked, permission: e.target.checked ? "master" : newAcct.permission })}
                    className="w-4 h-4 accent-yellow-500" />
                  <span className="font-semibold text-yellow-700">👑 메인 마스터 계정</span>
                  <span className="text-[10px] text-gray-500">(전체 지점 접근 가능)</span>
                </label>
              </div>
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
                      <th className="py-2">🏬 지점</th>
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
                        <td className="py-2.5 text-xs">
                          <select value={a.branch_id || ""} onChange={e => updateAccountBranch(a, e.target.value)}
                            className="px-1.5 py-1 text-xs border border-gray-200 rounded bg-white">
                            <option value="">—</option>
                            {branches.map(b => (
                              <option key={b.id} value={b.id}>
                                {b.branch_type === "head" ? "🏢" : b.branch_type === "direct" ? "🏪" : "🏬"} {b.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 text-center">
                          <button onClick={() => togglePermission(a)}
                            className={`text-[10px] px-2 py-1 rounded-full font-semibold ${
                              (a.permission === "master" || a.is_master) ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                            }`}>
                            {(a.permission === "master" || a.is_master) ? "👑 메인마스터" : "👤 일반"}
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
