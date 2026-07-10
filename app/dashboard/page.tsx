"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import {
  Waves, Users, Calendar, ClipboardList, TrendingUp, Activity,
  MessageCircle, Send, X, Phone
} from "lucide-react";

export default function Dashboard() {
  const [stats, setStats] = useState({ child: 0, adult: 0, total: 0, timeslots: 0, activities: 0, templates: 0 });
  const [statusCount, setStatusCount] = useState<any>({});
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [sendChannel, setSendChannel] = useState<"sms" | "kakao" | "email">("kakao");
  const [sendMessage, setSendMessage] = useState("");
  const [sendResult, setSendResult] = useState<string>("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [c, a, t, l, tpl, allMembers] = await Promise.all([
      supabase.from("members").select("*", { count: "exact", head: true }).eq("member_type", "child"),
      supabase.from("members").select("*", { count: "exact", head: true }).eq("member_type", "adult"),
      supabase.from("timeslots").select("*", { count: "exact", head: true }),
      supabase.from("label_library").select("*", { count: "exact", head: true }),
      supabase.from("assessment_templates").select("*", { count: "exact", head: true }),
      supabase.from("members").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setStats({
      child: c.count || 0,
      adult: a.count || 0,
      total: (c.count || 0) + (a.count || 0),
      timeslots: t.count || 0,
      activities: l.count || 0,
      templates: tpl.count || 0,
    });
    // 상태별 카운트
    const sc: any = {};
    (allMembers.data || []).forEach((m: any) => { sc[m.status || "regular"] = (sc[m.status || "regular"] || 0) + 1; });
    setStatusCount(sc);
    // 최근 리드 5명
    setRecentLeads((allMembers.data || []).slice(0, 5));
    setLoading(false);
  }

  function openSendModal(lead: any) {
    setSelectedLead(lead);
    const template = `${lead.name}님 안녕하세요. 위례아쿠수중운동센터입니다 😊

${lead.member_type === "child" ? "아동" : "성인"} 상담/체험 안내드립니다.
원하시는 요일/시간대를 알려주시면 가능한 일정을 안내해드리겠습니다.

💰 체험비 70,000원 / 예약금 35,000원

문의: 02-XXX-XXXX
- AQUNOTE`;
    setSendMessage(template);
    setSendChannel("kakao");
    setSendResult("");
    setShowSendModal(true);
  }

  async function sendMessageNow() {
    if (!selectedLead || !sendMessage) return;
    setSendResult("발송 중...");
    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: sendChannel,
        to: selectedLead.phone || selectedLead.email || "",
        message: sendMessage,
        name: selectedLead.name,
      }),
    });
    const data = await res.json();
    if (data.success) {
      setSendResult(`✅ ${sendChannel.toUpperCase()} 발송 대기 큐에 등록됨! (${data.note})`);
    } else {
      setSendResult(`❌ ${data.error}`);
    }
  }

  const Card = ({ icon: Icon, label, value, color }: any) => (
    <div className="p-4 md:p-6 bg-white rounded-2xl shadow-md border border-aqu-100">
      <div className="flex items-center justify-between mb-2">
        <Icon className={`w-6 md:w-8 h-6 md:h-8 ${color}`} />
        <span className="text-2xl md:text-3xl font-bold text-aqu-900">{loading ? "..." : value}</span>
      </div>
      <div className="text-xs md:text-sm text-gray-500">{label}</div>
    </div>
  );

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <div className="flex items-center gap-2">
          <Waves className="w-7 md:w-8 h-7 md:h-8 text-aqu-600" />
          <h1 className="text-2xl md:text-3xl font-bold text-aqu-900">📊 대시보드</h1>
        </div>
        <Link href="/" className="text-sm text-aqu-600 hover:underline">← 홈</Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-8">
        <Card icon={Users} label="아동 회원" value={stats.child} color="text-blue-500" />
        <Card icon={Users} label="성인 회원" value={stats.adult} color="text-purple-500" />
        <Card icon={TrendingUp} label="전체 회원" value={stats.total} color="text-aqu-500" />
      </div>

      <div className="grid grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
        <Card icon={Calendar} label="시간표" value={stats.timeslots} color="text-orange-500" />
        <Card icon={Activity} label="활동 라벨" value={stats.activities} color="text-green-500" />
        <Card icon={ClipboardList} label="평가" value={stats.templates} color="text-pink-500" />
      </div>

      {/* Status pipeline */}
      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-4 md:p-6 mb-6">
        <h3 className="font-bold text-aqu-900 mb-3">🎯 상담 파이프라인</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-center">
          {[
            { k: "waiting", label: "대기중", color: "bg-yellow-50 text-yellow-700" },
            { k: "trial_scheduled", label: "체험예정", color: "bg-blue-50 text-blue-700" },
            { k: "trial_done", label: "체험완료", color: "bg-purple-50 text-purple-700" },
            { k: "regular", label: "정규", color: "bg-green-50 text-green-700" },
            { k: "paused", label: "보류", color: "bg-gray-50 text-gray-700" },
            { k: "ended", label: "종료", color: "bg-red-50 text-red-700" },
          ].map((s) => (
            <div key={s.k} className={`p-2 md:p-3 rounded-lg ${s.color}`}>
              <div className="text-xl md:text-2xl font-bold">{statusCount[s.k] || 0}</div>
              <div className="text-xs">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent leads with quick send */}
      <div className="bg-white rounded-2xl shadow-md border border-aqu-100 p-4 md:p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-aqu-900">💬 빠른 안내문 발송</h3>
          <Link href="/consultations" className="text-xs text-aqu-600 hover:underline">전체 리드 →</Link>
        </div>
        <div className="space-y-2">
          {recentLeads.map((l) => (
            <div key={l.id} className="flex items-center justify-between p-2 md:p-3 bg-aqu-50/30 rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 ${l.member_type === "child" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                  {l.member_type === "child" ? "아동" : "성인"}
                </span>
                <span className="font-medium text-sm text-aqu-900 truncate">{l.name}</span>
                <span className="text-xs text-gray-500 truncate hidden sm:inline">{l.phone || "-"}</span>
              </div>
              <button
                onClick={() => openSendModal(l)}
                className="text-xs px-2 py-1 bg-aqu-600 text-white rounded hover:bg-aqu-700 flex items-center gap-1 flex-shrink-0"
              >
                <Send className="w-3 h-3" /> 발송
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-6 bg-gradient-to-r from-aqu-500 to-aqu-700 text-white rounded-2xl shadow-lg">
        <h2 className="text-lg md:text-xl font-bold mb-2">🌊 AQUNOTE v1.1</h2>
        <p className="text-aqu-100 text-xs md:text-sm">
          회원 상세 · 상담 칸반 · 로그인 · 자동발송 · 모바일 대응 - 5가지 기능 완성!
        </p>
      </div>

      {/* Send Modal */}
      {showSendModal && selectedLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
             onClick={() => setShowSendModal(false)}>
          <div className="bg-white rounded-2xl p-5 md:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-aqu-900">💬 {selectedLead.name}님께 발송</h3>
              <button onClick={() => setShowSendModal(false)}>
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-600">채널 선택</label>
                <div className="flex gap-2 mt-1">
                  {[
                    { k: "kakao", label: "카톡", emoji: "💛" },
                    { k: "sms", label: "SMS", emoji: "📱" },
                    { k: "email", label: "이메일", emoji: "✉️" },
                  ].map((ch) => (
                    <button key={ch.k}
                      onClick={() => setSendChannel(ch.k as any)}
                      className={`flex-1 py-2 rounded-lg text-sm ${sendChannel === ch.k ? "bg-aqu-600 text-white" : "bg-gray-100"}`}>
                      {ch.emoji} {ch.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600">받는 사람</label>
                <div className="mt-1 px-3 py-2 rounded-lg bg-gray-50 text-sm">
                  <Phone className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
                  {selectedLead.phone || "연락처 없음"}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600">메시지</label>
                <textarea value={sendMessage} onChange={(e) => setSendMessage(e.target.value)}
                  rows={8}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-aqu-200 text-sm font-mono" />
                <div className="text-xs text-gray-400 mt-1">{sendMessage.length}자</div>
              </div>
              {sendResult && (
                <div className={`text-xs p-3 rounded-lg ${sendResult.startsWith("✅") ? "bg-green-50 text-green-700" : sendResult.startsWith("❌") ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
                  {sendResult}
                </div>
              )}
              <button onClick={sendMessageNow}
                disabled={!sendMessage || !selectedLead.phone}
                className="w-full py-2.5 bg-aqu-600 text-white rounded-lg text-sm font-medium hover:bg-aqu-700 disabled:bg-gray-300 flex items-center justify-center gap-1">
                <Send className="w-4 h-4" /> 지금 발송
              </button>
              <div className="text-xs text-gray-400 text-center">
                💡 MVP 버전: 발송 큐에 저장됩니다. 실제 API 연동 예정.
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
