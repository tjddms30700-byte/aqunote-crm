"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { X, Phone, MessageSquare, MessageCircle, Save, Calendar, User } from "lucide-react";

/**
 * v3.19.0: 연락 응대 로그 모달
 * - 대상 회원에 대한 응대 이력 기록 (전화/문자/카카오톡/기타)
 * - 응대 날짜, 채널, 응대 결과 상태, 메모 기록
 * - contact_logs 테이블에 저장 (없으면 members.extra.contact_logs로 fallback)
 */

const CHANNELS = [
  { key: "call",   label: "📞 전화",     color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { key: "sms",    label: "💬 문자",     color: "bg-blue-100 text-blue-700 border-blue-300" },
  { key: "kakao",  label: "💛 카카오톡", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  { key: "other",  label: "📝 기타",     color: "bg-gray-100 text-gray-700 border-gray-300" },
];

const RESULTS = [
  { key: "answered",    label: "✅ 통화됨/응답",      color: "bg-emerald-50 text-emerald-700" },
  { key: "no_answer",   label: "❌ 부재중",           color: "bg-red-50 text-red-700" },
  { key: "reschedule",  label: "🔄 재연락 예정",      color: "bg-blue-50 text-blue-700" },
  { key: "trial_booked",label: "📅 체험 예약",        color: "bg-purple-50 text-purple-700" },
  { key: "declined",    label: "🚫 거절",              color: "bg-gray-50 text-gray-700" },
];

export default function ContactLogModal({ member, onClose, onSaved }: any) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [channel, setChannel] = useState("call");
  const [result, setResult] = useState("answered");
  const [memo, setMemo] = useState("");
  const [nextContactDate, setNextContactDate] = useState("");
  const [logs, setLogs] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // 기존 로그 로드
  useEffect(() => { loadLogs(); }, [member?.id]);

  async function loadLogs() {
    if (!member?.id) return;
    setLoading(true);
    // 1) contact_logs 테이블 시도
    const { data, error } = await supabase.from("contact_logs")
      .select("*").eq("member_id", member.id).order("contact_at", { ascending: false });
    if (!error && data) {
      setLogs(data);
    } else {
      // 2) fallback: members.extra.contact_logs
      const extraLogs = member?.extra?.contact_logs || [];
      setLogs(Array.isArray(extraLogs) ? extraLogs : []);
    }
    setLoading(false);
  }

  async function save() {
    if (!memo.trim()) return alert("응대 메모를 입력해주세요");
    setSaving(true);
    const contactAt = `${date}T${time}:00`;
    const record = {
      member_id: member.id,
      contact_at: contactAt,
      channel,
      result,
      memo: memo.trim(),
      next_contact_date: nextContactDate || null,
    };

    // 1) contact_logs 테이블 INSERT 시도
    const { error } = await supabase.from("contact_logs").insert(record);

    if (error) {
      // 2) fallback: members.extra.contact_logs에 추가
      const prev = Array.isArray(member?.extra?.contact_logs) ? member.extra.contact_logs : [];
      const newExtra = {
        ...(member.extra || {}),
        contact_logs: [record, ...prev].slice(0, 100), // 최근 100건 유지
      };
      const { error: ue } = await supabase.from("members").update({ extra: newExtra }).eq("id", member.id);
      if (ue) {
        setSaving(false);
        return alert("저장 실패: " + ue.message);
      }
    }

    setSaving(false);
    setMemo("");
    setNextContactDate("");
    await loadLogs();
    if (onSaved) onSaved();
    alert("✅ 응대 기록이 저장되었습니다");
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-lg">📞</div>
            <div>
              <div className="text-lg font-bold text-slate-900">응대 기록</div>
              <div className="text-xs text-gray-600 flex items-center gap-1">
                <User className="w-3 h-3" /> {member?.name}
                {member?.phone && <span className="ml-1 font-mono">· {member.phone}</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/70 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 새 응대 기록 폼 */}
          <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4">
            <div className="text-sm font-bold text-emerald-800 mb-3">➕ 새 응대 기록</div>

            {/* 날짜/시간 */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-[10px] text-gray-600 font-semibold">응대 날짜</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white" />
              </div>
              <div>
                <label className="text-[10px] text-gray-600 font-semibold">응대 시간</label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white" />
              </div>
            </div>

            {/* 응대 채널 */}
            <div className="mb-3">
              <label className="text-[10px] text-gray-600 font-semibold block mb-1">응대 채널</label>
              <div className="flex flex-wrap gap-1.5">
                {CHANNELS.map(c => (
                  <button key={c.key} type="button" onClick={() => setChannel(c.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition ${channel === c.key ? c.color : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 응대 결과 */}
            <div className="mb-3">
              <label className="text-[10px] text-gray-600 font-semibold block mb-1">응대 결과</label>
              <div className="flex flex-wrap gap-1.5">
                {RESULTS.map(r => (
                  <button key={r.key} type="button" onClick={() => setResult(r.key)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${result === r.key ? r.color + " border-current" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 메모 */}
            <div className="mb-3">
              <label className="text-[10px] text-gray-600 font-semibold block mb-1">응대 메모 *</label>
              <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={3}
                placeholder="응대 내용을 상세히 기록하세요 (예: 연락 취지, 회원 반응, 다음 조치사항)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-400 focus:outline-none" />
            </div>

            {/* 재연락 예정일 */}
            <div className="mb-3">
              <label className="text-[10px] text-gray-600 font-semibold block mb-1">🔄 재연락 예정일 (선택)</label>
              <input type="date" value={nextContactDate} onChange={e => setNextContactDate(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white" />
            </div>

            <button onClick={save} disabled={saving || !memo.trim()}
              className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg font-semibold text-sm hover:shadow-md disabled:opacity-40 flex items-center justify-center gap-1.5">
              <Save className="w-4 h-4" /> {saving ? "저장 중..." : "응대 기록 저장"}
            </button>
          </div>

          {/* 이전 응대 이력 */}
          <div>
            <div className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <Calendar className="w-4 h-4" /> 이전 응대 이력 ({logs.length}건)
            </div>
            {loading ? (
              <div className="text-center text-xs text-gray-400 py-4">로드 중...</div>
            ) : logs.length === 0 ? (
              <div className="text-center text-xs text-gray-400 py-6 bg-gray-50 rounded-lg border border-dashed">아직 응대 기록이 없습니다</div>
            ) : (
              <div className="space-y-2 max-h-[240px] overflow-y-auto">
                {logs.map((log: any, i: number) => {
                  const ch = CHANNELS.find(c => c.key === log.channel) || CHANNELS[3];
                  const rs = RESULTS.find(r => r.key === log.result) || RESULTS[0];
                  const dt = log.contact_at || log.created_at || "";
                  return (
                    <div key={i} className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-sm transition">
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${ch.color}`}>{ch.label}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${rs.color}`}>{rs.label}</span>
                        </div>
                        <span className="text-[10px] text-gray-500">{dt.slice(0, 16).replace("T", " ")}</span>
                      </div>
                      <div className="text-xs text-slate-700 whitespace-pre-wrap">{log.memo}</div>
                      {log.next_contact_date && (
                        <div className="mt-1.5 text-[10px] text-blue-600 font-semibold">🔄 재연락 예정: {log.next_contact_date}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
