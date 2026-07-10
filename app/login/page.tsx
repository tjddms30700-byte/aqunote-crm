"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Waves, Lock, Mail, LogIn, UserPlus } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
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
        setMsg({ type: "ok", text: "로그인 성공! 이동합니다..." });
        setTimeout(() => router.push("/dashboard"), 800);
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg({ type: "ok", text: "회원가입 완료! 로그인 해주세요." });
        setMode("login");
      }
    } catch (e: any) {
      setMsg({ type: "err", text: e.message || "오류 발생" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <Waves className="w-10 h-10 text-aqu-600" />
            <h1 className="text-4xl font-bold text-aqu-900">AQUNOTE</h1>
          </div>
          <p className="text-sm text-gray-500">위례아쿠수중운동센터 CRM</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-aqu-100 p-8">
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
            <div>
              <label className="text-xs text-gray-600">이메일</label>
              <div className="relative mt-1">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-aqu-200 text-sm"
                  placeholder="director@aqunote.com" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-600">비밀번호</label>
              <div className="relative mt-1">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-aqu-200 text-sm"
                  placeholder="8자 이상" />
              </div>
            </div>

            {msg && (
              <div className={`text-sm p-3 rounded-lg ${
                msg.type === "err" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
              }`}>{msg.text}</div>
            )}

            <button onClick={handleAuth} disabled={loading || !email || !password}
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
