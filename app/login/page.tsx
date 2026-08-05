"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Waves, Lock, Mail, LogIn, UserPlus, User, Phone, MapPin, Briefcase } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [role, setRole] = useState<"director" | "coach" | "admin">("coach");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.push("/dashboard");
    })();
  }, [router]);

  async function handleAuth() {
    setLoading(true); setMsg(null);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // ✅ v3.10: 로그인 계정의 지점 정보 저장 (지점 스위체 연동)
        try {
          const { data: acct } = await supabase
            .from("staff_accounts")
            .select("id, login_id, email, branch_id, is_master, permission")
            .eq("email", email)
            .is("deleted_at", null)
            .maybeSingle();
          if (acct) {
            const { saveLoggedInAccount } = await import("@/lib/branchContext");
            saveLoggedInAccount(acct);
          }
        } catch (e) { /* branch_id / is_master 컴럼 미존재 시 무시 */ }

        setMsg({ type: "ok", text: "로그인 성공! 이동합니다..." });
        setTimeout(() => router.push("/dashboard"), 800);
      } else {
        // 회원가입
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        // staff 테이블에 프로필 저장
        if (data.user) {
          const { data: orgs } = await supabase.from("organizations").select("id").limit(1);
          const orgId = orgs?.[0]?.id;
          
          await supabase.from("staff").insert({
            org_id: orgId,
            auth_id: data.user.id,
            name: name || email.split("@")[0],
            email,
            phone,
            address,
            role,
          });
        }

        setMsg({ type: "ok", text: "회원가입 완료! 로그인 해주세요." });
        setMode("login");
        setName(""); setPhone(""); setAddress("");
      }
    } catch (e: any) {
      setMsg({ type: "err", text: e.message || "오류 발생" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <img src="/logo-whale.png" alt="아쿠고래" className="w-12 h-12 rounded-full" />
            <h1 className="text-4xl font-bold text-aqu-900">아쿠노트</h1>
          </div>
          <p className="text-sm text-gray-500">센터 운영부터 맞춤 중재·재무까지 한 곳에서</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-aqu-100 p-6 md:p-8">
          <div className="flex gap-2 mb-6">
            <button onClick={() => setMode("login")}
              className={`flex-1 py-2 rounded-lg text-sm ${mode === "login" ? "bg-aqu-600 text-white" : "bg-gray-100 text-gray-600"}`}>
              <LogIn className="w-4 h-4 inline mr-1" /> 로그인
            </button>
            <button onClick={() => setMode("signup")}
              className={`flex-1 py-2 rounded-lg text-sm ${mode === "signup" ? "bg-aqu-600 text-white" : "bg-gray-100 text-gray-600"}`}>
              <UserPlus className="w-4 h-4 inline mr-1" /> 회원가입
            </button>
          </div>

          <div className="space-y-3">
            {/* 회원가입 전용 필드 */}
            {mode === "signup" && (
              <>
                <div>
                  <label className="text-xs text-gray-600">이름 *</label>
                  <div className="relative mt-1">
                    <User className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                    <input value={name} onChange={(e) => setName(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-aqu-200 text-sm"
                      placeholder="김원장" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-600">역할</label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {[
                      { k: "director", label: "👑 원장" },
                      { k: "coach", label: "🏊 코치" },
                      { k: "admin", label: "📋 관리자" },
                    ].map((r) => (
                      <button key={r.k} onClick={() => setRole(r.k as any)}
                        className={`py-2 rounded-lg text-xs ${role === r.k ? "bg-aqu-500 text-white" : "bg-gray-100"}`}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-600">전화번호</label>
                  <div className="relative mt-1">
                    <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                    <input value={phone} onChange={(e) => setPhone(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-aqu-200 text-sm"
                      placeholder="010-1234-5678" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-600">주소</label>
                  <div className="relative mt-1">
                    <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                    <input value={address} onChange={(e) => setAddress(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-aqu-200 text-sm"
                      placeholder="서울시 송파구..." />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="text-xs text-gray-600">이메일 *</label>
              <div className="relative mt-1">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-aqu-200 text-sm"
                  placeholder="director@aqunote.com" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-600">비밀번호 *</label>
              <div className="relative mt-1">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-aqu-200 text-sm"
                  placeholder="8자 이상" />
              </div>
            </div>

            {msg && (
              <div className={`text-sm p-3 rounded-lg ${msg.type === "err" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                {msg.text}
              </div>
            )}

            <button onClick={handleAuth} disabled={loading || !email || !password || (mode === "signup" && !name)}
              className="w-full py-2.5 bg-aqu-600 text-white rounded-lg text-sm font-medium hover:bg-aqu-700 disabled:bg-gray-300">
              {loading ? "처리중..." : mode === "login" ? "로그인" : "회원가입"}
            </button>

            <div className="text-center text-xs text-gray-500 mt-4">
              💡 첫 사용이라면 회원가입 후 로그인 하세요
            </div>
          </div>
        </div>

        <div className="text-center mt-6">
          <a href="/" className="text-sm text-aqu-600 hover:underline">← 로그인 없이 둘러보기</a>
        </div>
      </div>
    </main>
  );
}
