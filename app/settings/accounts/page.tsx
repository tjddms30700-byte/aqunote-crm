"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import HomeButton from "@/components/HomeButton";
import DirectorOnly from "@/components/DirectorOnly";
import { useBranchContext, ALL_BRANCHES } from "@/lib/branchContext";  // ✅ v3.49.0
import { KeyRound, ChevronLeft, Save, Check, X, Lock, User, Mail, Phone as PhoneIcon, ShieldCheck, ShieldAlert, Plus } from "lucide-react";

/**
 * v3.20.0: 로그인 승인 · 계정 관리
 * - 신규 가입 요청 승인/거절
 * - 비밀번호 강제 재설정 (마스터 전용)
 * - 필수 정보: 이름 · 휴대폰 · 이메일 · 주민등록번호 · 아이디(이메일) · 비밀번호
 */

const ROLES = [
  { key: "director",   label: "🔒 원장(마스터)" },
  { key: "manager",    label: "👔 센터장" },
  { key: "therapist",  label: "👨‍⚕️ 치료사" },
  { key: "staff",      label: "👤 일반 직원" },
];
// ✅ v3.49.0: 센터장이 생성 가능한 역할 (치료사·일반 직원만 - 원장/센터장 생성은 대표 전용)
const MANAGER_CREATABLE_ROLES = ROLES.filter(r => ["therapist", "staff"].includes(r.key));

function AccountsInner() {
  // ✅ v3.49.0: 센터장은 소속 지점 계정만 관리, 치료사/일반직원만 생성 가능
  const { isMaster, isCenterManager, ownBranchId } = useBranchContext();
  const creatableRoles = isMaster ? ROLES : MANAGER_CREATABLE_ROLES;
  const [pending, setPending] = useState<any[]>([]);
  const [approved, setApproved] = useState<any[]>([]);
  const [tab, setTab] = useState<"pending" | "approved" | "new">("pending");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 새 계정 생성 폼
  const [nf, setNf] = useState<any>({
    name: "", phone: "", email: "", national_id: "",
    login_id: "", password: "", role: "therapist",
    branch_id: "",
  });
  const [branches, setBranches] = useState<any[]>([]);

  // 비밀번호 재설정
  const [pwEditFor, setPwEditFor] = useState<any>(null);
  const [newPw, setNewPw] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [p, a, b] = await Promise.all([
      supabase.from("staff").select("*").eq("approval_status", "pending").order("created_at", { ascending: false }),
      // ✅ v3.49.1: suspended(비활성) 계정도 목록에 포함해 재활성화 가능하게
      supabase.from("staff").select("*").in("approval_status", ["approved", "suspended", null]).is("resign_date", null).order("created_at", { ascending: false }),
      supabase.from("branches").select("*").is("deleted_at", null),
    ]);
    setPending(p.data || []);
    setApproved(a.data || []);
    setBranches(b.data || []);
    if (b.data && b.data.length > 0 && !nf.branch_id) {
      // ✅ v3.49.0: 센터장은 소속 지점으로 자동 고정, 대표는 본점 기본값
      const defaultBranch = isCenterManager && ownBranchId
        ? ownBranchId
        : (b.data.find((x: any) => x.is_main)?.id || b.data[0].id);
      setNf({ ...nf, branch_id: defaultBranch });
    }
    setLoading(false);
  }

  async function approve(id: string) {
    setSaving(true);
    const { error } = await supabase.from("staff").update({
      approval_status: "approved",
      approved_at: new Date().toISOString(),
    }).eq("id", id);
    setSaving(false);
    if (error) {
      if (error.message.includes("approval_status")) {
        alert("⚠️ staff 테이블에 approval_status 컬럼이 없습니다. SQL 마이그레이션을 먼저 실행해주세요.");
      } else {
        alert("승인 실패: " + error.message);
      }
      return;
    }
    alert("✅ 로그인이 승인되었습니다");
    loadAll();
  }

  async function reject(id: string) {
    if (!confirm("정말 거절하시겠습니까? 계정이 삭제됩니다.")) return;
    setSaving(true);
    await supabase.from("staff").delete().eq("id", id);
    setSaving(false);
    alert("❌ 가입 요청이 거절되었습니다");
    loadAll();
  }

  async function createAccount() {
    if (!nf.name || !nf.email || !nf.login_id || !nf.password) {
      return alert("이름·이메일·아이디·비밀번호는 필수입니다");
    }
    if (nf.password.length < 6) return alert("비밀번호는 6자 이상이어야 합니다");
    setSaving(true);

    // Supabase Auth signup
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: nf.email,
      password: nf.password,
    });
    if (authErr) {
      setSaving(false);
      return alert("Auth 계정 생성 실패: " + authErr.message);
    }

    // staff 테이블에 등록
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
    const payload: any = {
      org_id: orgId,
      name: nf.name,
      phone: nf.phone || null,
      email: nf.email,
      national_id: nf.national_id || null,  // 주민등록번호 (선택적으로 저장)
      login_id: nf.login_id || nf.email,
      role: nf.role,
      // ✅ v3.49.0: 센터장이 만든 계정은 무조건 소속 지점으로 고정 (타 지점 생성 불가)
      branch_id: (isCenterManager && ownBranchId) ? ownBranchId : (nf.branch_id || null),
      approval_status: "approved",
      approved_at: new Date().toISOString(),
      hire_date: new Date().toISOString().slice(0, 10),
    };
    const { error } = await supabase.from("staff").insert(payload);
    setSaving(false);
    if (error) {
      alert("staff 등록 실패: " + error.message + "\n\n(Auth 계정은 생성됨)");
      return;
    }

    alert("✅ 계정이 생성되었습니다");
    setNf({ name: "", phone: "", email: "", national_id: "", login_id: "", password: "", role: "therapist", branch_id: nf.branch_id });
    setTab("approved");
    loadAll();
  }

  // ✅ v3.49.1: 역할 변경 (대표만 다른 계정의 역할 변경 가능)
  async function changeRole(s: any) {
    if (!isMaster) return alert("역할 변경은 대표(원장) 계정만 가능합니다");
    const roleLabelMap: Record<string, string> = { director: "원장(마스터)", manager: "센터장", therapist: "치료사", staff: "일반 직원" };
    const cur = s.role || "staff";
    const options = ROLES.map(r => `${r.key} (${r.label})`).join("\n");
    const input = prompt(`[${s.name}] 역할을 변경합니다\n\n현재: ${roleLabelMap[cur] || cur}\n\n변경할 역할 key를 입력하세요:\n${options}`, cur);
    if (input === null) return;
    const newRole = input.trim().split(" ")[0].toLowerCase();
    if (!ROLES.some(r => r.key === newRole)) return alert("유효하지 않은 역할입니다: " + newRole);
    if (newRole === cur) return;
    const { error } = await supabase.from("staff").update({ role: newRole }).eq("id", s.id);
    if (error) return alert("역할 변경 실패: " + error.message);
    alert(`✅ ${s.name}님의 역할이 '${roleLabelMap[newRole]}'(으)로 변경되었습니다\n(다음 로그인부터 적용됩니다)`);
    loadAll();
  }

  // ✅ v3.49.1: 비활성화 / 재활성화 (로그인 차단 연동)
  async function toggleSuspend(s: any) {
    if (!isMaster) return alert("계정 비활성화는 대표(원장) 계정만 가능합니다");
    const isSuspended = s.approval_status === "suspended";
    if (isSuspended) {
      if (!confirm(`'${s.name}' 계정을 다시 활성화할까요?\n(로그인이 다시 가능해집니다)`)) return;
      const { error } = await supabase.from("staff").update({ approval_status: "approved" }).eq("id", s.id);
      if (error) return alert("재활성화 실패: " + error.message);
      alert(`✅ ${s.name}님 계정이 재활성화되었습니다`);
    } else {
      if (!confirm(`⛔ '${s.name}' 계정을 비활성화할까요?\n\n· 다음 로그인부터 차단됩니다\n· 데이터는 삭제되지 않으며 언제든 재활성화 가능합니다`)) return;
      const { error } = await supabase.from("staff").update({ approval_status: "suspended" }).eq("id", s.id);
      if (error) return alert("비활성화 실패: " + error.message);
      alert(`⛔ ${s.name}님 계정이 비활성화되었습니다`);
    }
    loadAll();
  }

  async function resetPassword() {
    if (!pwEditFor || !newPw) return;
    if (newPw.length < 6) return alert("비밀번호는 6자 이상이어야 합니다");
    setSaving(true);
    // Supabase는 관리자만 다른 유저 비밀번호 변경 가능 → admin API 필요
    // 여기서는 임시로 링크 발송 방식 사용
    const { error } = await supabase.auth.resetPasswordForEmail(pwEditFor.email);
    setSaving(false);
    if (error) return alert("비밀번호 재설정 링크 발송 실패: " + error.message);
    alert(`✅ ${pwEditFor.name} 님의 이메일(${pwEditFor.email})로 비밀번호 재설정 링크가 발송되었습니다.\n\n※ 관리자 직접 변경은 Supabase Service Role Key가 필요합니다.`);
    setPwEditFor(null);
    setNewPw("");
  }

  if (loading) return <div className="p-10 text-center text-gray-400">로딩 중...</div>;

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-10">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <HomeButton />
          <span className="text-gray-300">/</span>
          <Link href="/settings" className="text-sm text-gray-500 hover:text-aqu-700 flex items-center gap-1">
            <ChevronLeft className="w-4 h-4" /> 설정
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl md:text-2xl font-bold text-aqu-900 flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-indigo-500" /> 로그인 승인 · 계정 관리
          </h1>
          <span className="ml-2 text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-bold">🔒 마스터 전용</span>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 border-b border-aqu-100">
        <button onClick={() => setTab("pending")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${tab === "pending" ? "text-red-600 border-red-500" : "text-gray-500 border-transparent hover:text-red-600"}`}>
          ⏳ 승인 대기 {pending.length > 0 && <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px]">{pending.length}</span>}
        </button>
        <button onClick={() => setTab("approved")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${tab === "approved" ? "text-emerald-600 border-emerald-500" : "text-gray-500 border-transparent hover:text-emerald-600"}`}>
          ✅ 승인 완료 ({approved.length})
        </button>
        <button onClick={() => setTab("new")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${tab === "new" ? "text-blue-600 border-blue-500" : "text-gray-500 border-transparent hover:text-blue-600"}`}>
          ➕ 새 계정 생성
        </button>
      </div>

      {/* 승인 대기 */}
      {tab === "pending" && (
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-red-50/50">
            <div className="font-bold text-red-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> 로그인 승인 대기 목록
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">신규 가입자는 마스터가 승인해야 로그인이 가능합니다</div>
          </div>
          {pending.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">🎉 승인 대기 중인 요청이 없습니다</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {pending.map((s: any) => (
                <div key={s.id} className="p-4 flex items-center justify-between gap-2 hover:bg-red-50/30">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      {s.name}
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{s.role || "미지정"}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-3">
                      {s.email && <span><Mail className="w-3 h-3 inline mr-0.5" />{s.email}</span>}
                      {s.phone && <span><PhoneIcon className="w-3 h-3 inline mr-0.5" />{s.phone}</span>}
                      <span className="text-gray-400">신청: {s.created_at?.slice(0, 10)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => approve(s.id)} disabled={saving}
                      className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 flex items-center gap-1 disabled:opacity-40">
                      <Check className="w-3.5 h-3.5" /> 승인
                    </button>
                    <button onClick={() => reject(s.id)} disabled={saving}
                      className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 flex items-center gap-1 disabled:opacity-40">
                      <X className="w-3.5 h-3.5" /> 거절
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 승인 완료 (기존 계정 목록) */}
      {tab === "approved" && (
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-emerald-50/50">
            <div className="font-bold text-emerald-800 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> 활성 계정 목록
            </div>
          </div>
          {approved.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">등록된 계정이 없습니다</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {approved.map((s: any) => (
                <div key={s.id} className="p-3 flex items-center justify-between gap-2 hover:bg-emerald-50/30">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color || "#3b82f6" }} />
                      {s.name}
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{s.role || "직원"}</span>
                      {s.approval_status === "suspended" && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded font-bold">⛔ 비활성</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-3">
                      {s.email && <span><Mail className="w-3 h-3 inline mr-0.5" />{s.email}</span>}
                      {s.phone && <span><PhoneIcon className="w-3 h-3 inline mr-0.5" />{s.phone}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {/* ✅ v3.49.1: 역할 변경 (대표만) */}
                    {isMaster && (
                      <button onClick={() => changeRole(s)}
                        className="px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-xs font-semibold hover:bg-indigo-600 flex items-center gap-1">
                        🔄 역할 변경
                      </button>
                    )}
                    <button onClick={() => setPwEditFor(s)}
                      className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-semibold hover:bg-orange-600 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" /> 비밀번호 재설정
                    </button>
                    {/* ✅ v3.49.1: 비활성화 / 재활성화 (대표만) */}
                    {isMaster && (
                      <button onClick={() => toggleSuspend(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                          s.approval_status === "suspended"
                            ? "bg-emerald-500 text-white hover:bg-emerald-600"
                            : "bg-white border border-rose-300 text-rose-600 hover:bg-rose-50"
                        }`}>
                        {s.approval_status === "suspended" ? "♻️ 재활성화" : "⛔ 비활성화"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 새 계정 생성 */}
      {tab === "new" && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
          <div className="font-bold text-blue-800 mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4" /> 새 계정 직접 생성 (승인 없이 즉시 활성화)
            {/* ✅ v3.49.2: 센터장은 치료사/일반직원만, 대표는 모든 역할 생성 가능 */}
            {isCenterManager && (
              <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold">👔 센터장 권한</span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="이름 *">
              <input value={nf.name} onChange={e => setNf({ ...nf, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="홍길동" />
            </Field>
            <Field label="휴대폰 번호 *">
              <input value={nf.phone} onChange={e => setNf({ ...nf, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="010-1234-5678" />
            </Field>
            <Field label="이메일(아이디) *">
              <input type="email" value={nf.email}
                onChange={e => setNf({ ...nf, email: e.target.value, login_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="staff@aqunote.co.kr" />
            </Field>
            <Field label="주민등록번호">
              <input value={nf.national_id} onChange={e => setNf({ ...nf, national_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono" placeholder="000000-0000000" />
            </Field>
            <Field label="비밀번호 * (6자 이상)">
              <input type="password" value={nf.password} onChange={e => setNf({ ...nf, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="••••••••" />
            </Field>
            <Field label="권한">
              <select value={nf.role} onChange={e => setNf({ ...nf, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                {creatableRoles.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
              {isCenterManager && (
                <div className="text-[10px] text-blue-600 mt-1">👔 센터장 권한: 치료사·일반 직원 계정만 생성할 수 있습니다</div>
              )}
            </Field>
            <Field label="소속 지점">
              <select value={nf.branch_id} onChange={e => setNf({ ...nf, branch_id: e.target.value })}
                disabled={isCenterManager}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white disabled:bg-slate-100 disabled:text-slate-500">
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}{b.is_main && " (본점)"}</option>)}
              </select>
              {isCenterManager && (
                <div className="text-[10px] text-blue-600 mt-1">🏢 소속 지점으로 자동 배정됩니다 (타 지점 계정 생성 불가)</div>
              )}
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={createAccount} disabled={saving}
              className="px-4 py-2 bg-gradient-to-br from-blue-500 to-indigo-500 text-white rounded-lg text-sm font-semibold hover:opacity-90 flex items-center gap-1 disabled:opacity-40">
              <Save className="w-4 h-4" /> {saving ? "생성 중..." : "계정 생성"}
            </button>
          </div>
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800">
            💡 마스터가 직접 계정을 만들면 승인 절차 없이 바로 로그인이 가능합니다. 외부 회원가입은 [승인 대기] 탭에서 승인해야 로그인됩니다.
          </div>
        </div>
      )}

      {/* 비밀번호 재설정 모달 */}
      {pwEditFor && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => setPwEditFor(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-slate-900 flex items-center gap-2">
                <Lock className="w-5 h-5 text-orange-500" /> 비밀번호 재설정
              </div>
              <button onClick={() => setPwEditFor(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="text-sm text-gray-600 mb-3">
              <b>{pwEditFor.name}</b> ({pwEditFor.email})
            </div>
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-[11px] text-orange-800 mb-3">
              💡 <b>재설정 링크 발송</b>: 해당 이메일로 비밀번호 변경 링크가 전송됩니다.<br/>
              (직접 변경은 Supabase Service Role Key 설정 필요)
            </div>
            <button onClick={resetPassword} disabled={saving}
              className="w-full py-2.5 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-40">
              {saving ? "발송 중..." : "재설정 링크 발송"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({ label, children }: any) {
  return (
    <div>
      <label className="text-xs text-gray-600 font-semibold block mb-1">{label}</label>
      {children}
    </div>
  );
}

export default function AccountsPage() {
  // ✅ v3.49.0: 계정 관리는 대표 + 센터장 접근 가능 (센터장은 소속 지점·치료사/직원 계정만)
  return <DirectorOnly roles={["director", "manager"]}><AccountsInner /></DirectorOnly>;
}
