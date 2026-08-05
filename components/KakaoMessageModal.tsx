"use client";
/**
 * 📱 카카오 메시지 생성 & 복사 모달
 * ─────────────────────────────
 * - 상황별 템플릿 자동 생성 (재등록/만료 임박/잔여 소진 등)
 * - 사용자가 자유롭게 편집 가능
 * - 복사 버튼 → 클립보드 → 카톡에 붙여넣기
 * - 발송 이력을 messages_log에 자동 기록
 */
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  makeRemainingLowMessage,
  makeExpireAlertMessage,
  makeReregisterMessage,
  makeAutoRenewalMessage,
  autoPickMessage,
  type MessageContext,
} from "@/lib/messageTemplates";

type Props = {
  open: boolean;
  onClose: () => void;
  member: any;                    // { id, name, phone, member_type, guardian_name }
  membership?: any;               // { plan_name, total_sessions, used_sessions, end_date }
  branchName?: string;
  centerPhone?: string;
  defaultTemplate?: "remaining_low" | "expire_alert" | "reregister" | "auto_renewal" | "auto";
};

const TEMPLATES = [
  { k: "auto",          label: "🎯 자동 선택",     desc: "상황에 맞는 템플릿을 자동으로 선택" },
  { k: "remaining_low", label: "💧 잔여 소진 임박", desc: "잔여 횟수가 적을 때 재등록 유도" },
  { k: "expire_alert",  label: "⏰ 만료 임박",     desc: "회원권 만료 7일 이내" },
  { k: "reregister",    label: "💙 재등록 안내",   desc: "종료된 회원 대상 안부 + 재등록" },
  { k: "auto_renewal",  label: "🔄 정기 갱신",     desc: "정액권 매월 자동 갱신 결제 안내" },
];

export default function KakaoMessageModal({
  open, onClose, member, membership, branchName, centerPhone, defaultTemplate = "auto",
}: Props) {
  const [template, setTemplate] = useState(defaultTemplate);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !member) return;
    regenerate(template);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member?.id, membership?.id, template]);

  function buildCtx(): MessageContext {
    const remaining = membership
      ? Math.max(0, (membership.total_sessions || 0) - (membership.used_sessions || 0))
      : undefined;
    const daysToExpire = membership?.end_date
      ? Math.floor((new Date(membership.end_date).getTime() - Date.now()) / 86400000)
      : undefined;
    return {
      memberName: member.name,
      memberType: member.member_type,
      guardianName: member.guardian_name,
      planName: membership?.plan_name,
      remaining,
      totalSessions: membership?.total_sessions,
      endDate: membership?.end_date,
      daysToExpire,
      branchName,
      centerPhone,
    };
  }

  function regenerate(t: string) {
    const ctx = buildCtx();
    let picked: { title: string; content: string };
    switch (t) {
      case "remaining_low": picked = { title: "💧 잔여 횟수 안내", content: makeRemainingLowMessage(ctx) }; break;
      case "expire_alert":  picked = { title: "⏰ 만료 임박 안내", content: makeExpireAlertMessage(ctx) }; break;
      case "reregister":    picked = { title: "💙 재등록 안내",   content: makeReregisterMessage(ctx) }; break;
      case "auto_renewal":  picked = { title: "🔄 정기 갱신 안내", content: makeAutoRenewalMessage(ctx) }; break;
      default:              picked = autoPickMessage(ctx);
    }
    setTitle(picked.title);
    setContent(picked.content);
    setCopied(false);
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      // 메시지 발송 이력 저장
      await logMessage("copy_only");
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      // 폴백: textarea 방식
      const ta = document.createElement("textarea");
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
      setCopied(true);
      await logMessage("copy_only");
      setTimeout(() => setCopied(false), 2500);
    }
  }

  async function logMessage(channel: string) {
    setSaving(true);
    try {
      await supabase.from("messages_log").insert({
        member_id: member.id,
        message_type: template === "auto" ? "custom" : template,
        channel,
        recipient_name: member.name,
        recipient_phone: member.phone,
        content,
        sent_at: new Date().toISOString(),
      });
    } catch {}
    setSaving(false);
  }

  function openKakaoTalk() {
    // 카카오톡 공유 URL (모바일에서만 동작)
    const phone = (member.phone || "").replace(/\D/g, "");
    if (phone) {
      // 우선 클립보드 복사 후 카카오톡 앱 실행
      copyToClipboard();
      // 카카오톡 앱 스킴 (모바일 전용, PC에서는 무시됨)
      window.location.href = `sms:${phone}`;
    } else {
      copyToClipboard();
      alert("전화번호가 없어 SMS 전송을 열 수 없습니다. 메시지는 복사되었으니 카카오톡에 직접 붙여넣어 주세요.");
    }
  }

  if (!open || !member) return null;

  const phoneTail = (member.phone || "").replace(/\D/g, "").slice(-4);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-yellow-50 to-amber-50 flex items-center justify-between">
          <div>
            <div className="text-lg font-bold text-slate-900 flex items-center gap-2">
              💬 메시지 전송
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              <b>{member.name}</b>
              {phoneTail && <span className="ml-2 text-amber-700 font-mono">({phoneTail})</span>}
              <span className="ml-2 text-gray-400">· {member.member_type === "child" ? "🧒 아동" : "👤 성인"}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/50 rounded-lg">
            <span className="text-xl">✕</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {/* 템플릿 선택 */}
          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-600 block mb-2">템플릿 선택</label>
            <div className="grid grid-cols-1 gap-1.5">
              {TEMPLATES.map(t => (
                <button key={t.k} type="button"
                  onClick={() => setTemplate(t.k as any)}
                  className={`px-3 py-2 rounded-lg text-left text-xs transition border ${
                    template === t.k
                      ? "bg-gradient-to-br from-yellow-400 to-amber-500 text-white border-transparent shadow"
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                  }`}>
                  <div className="font-bold">{t.label}</div>
                  <div className={`text-[10px] mt-0.5 ${template === t.k ? "opacity-90" : "opacity-60"}`}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 편집 영역 */}
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-600">메시지 내용 (편집 가능)</label>
            <button onClick={() => regenerate(template)}
              className="text-[10px] text-blue-600 hover:underline">↻ 재생성</button>
          </div>
          <textarea value={content} onChange={e => setContent(e.target.value)}
            rows={14}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-yellow-400 focus:outline-none resize-none whitespace-pre-wrap" />
          <div className="text-[10px] text-gray-400 mt-1">
            📏 {content.length}자
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-2 justify-between items-center">
          <div className="text-[10px] text-gray-500">
            {copied ? "✅ 클립보드에 복사되었습니다" : "📋 복사 후 카카오톡에 붙여넣으세요"}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-100">
              닫기
            </button>
            <button onClick={copyToClipboard} disabled={saving}
              className={`px-4 py-2 rounded-lg text-sm font-semibold shadow transition flex items-center gap-1 ${
                copied
                  ? "bg-green-500 text-white"
                  : "bg-gradient-to-br from-yellow-400 to-amber-500 text-white hover:opacity-90"
              }`}>
              {copied ? "✅ 복사 완료" : "📋 복사하기"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
