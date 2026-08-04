"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { X, RotateCcw, Save, Trash2 } from "lucide-react";

/**
 * v3.20.1: 시간표에서 재사용 가능한 사인 출결 모달
 * - 캔버스 서명 + 상태(present/absent/sick/personal) + 서명자 역할 저장
 * - attendance 테이블 UPSERT + schedule_slots.status 동기화
 */
export default function SignatureAttendanceModal({
  slot, member, date, onClose, onSaved,
}: {
  slot: any;
  member: any;
  date: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  // ✅ v3.25.1: 태블릿 사인입장 런타임 에러 방지 - member가 null/undefined이면 모달 렌더링 안함
  if (!member || !member.id || !date) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
          <div className="text-center">
            <p className="text-gray-700 mb-4">⚠️ 회원 정보가 없어 서명을 진행할 수 없습니다.</p>
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">닫기</button>
          </div>
        </div>
      </div>
    );
  }
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);
  const [status, setStatus] = useState<"present" | "absent" | "sick" | "personal">("present");
  const [signer, setSigner] = useState<"parent" | "self" | "staff">(
    member?.member_type === "child" ? "parent" : "self"
  );
  const [saving, setSaving] = useState(false);
  // ✅ v3.20.4: 기존 서명 존재 여부
  const [existingRow, setExistingRow] = useState<any | null>(null);
  // ✅ v3.20.16: 회원권 자동 조회
  const [membership, setMembership] = useState<any | null>(null);

  // 회원권 조회 (목달 생성 순 · 유효기간 내)
  useEffect(() => {
    if (!member?.id) return;
    (async () => {
      const { data } = await supabase.from("memberships")
        .select("*")
        .eq("member_id", member.id)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false });
      const today = new Date().toISOString().slice(0, 10);
      const active = (data || []).find((m: any) =>
        (!m.start_date || m.start_date <= today) &&
        (!m.end_date || m.end_date >= today)
      ) || (data || [])[0];
      setMembership(active || null);
    })();
  }, [member?.id]);

  // 기존 서명 조회
  useEffect(() => {
    if (!member?.id || !date) return;
    (async () => {
      const { data } = await supabase.from("attendance")
        .select("*").eq("member_id", member.id)
        .or(`date.eq.${date},attendance_date.eq.${date},session_date.eq.${date}`)
        .not("signature", "is", null)
        .maybeSingle();
      if (data) setExistingRow(data);
    })();
  }, [member?.id, date]);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPos = (e: any) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const scaleX = c.width / rect.width;
    const scaleY = c.height / rect.height;
    if (e.touches && e.touches[0]) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  function startDraw(e: any) {
    e.preventDefault();
    const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
    setDrawing(true);
  }
  function moveDraw(e: any) {
    if (!drawing) return;
    e.preventDefault();
    const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y); ctx.stroke();
    setHasStroke(true);
  }
  function endDraw() { setDrawing(false); }

  function clearCanvas() {
    const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    setHasStroke(false);
  }

  async function save() {
    if (!hasStroke) return alert("서명을 그려주세요");
    setSaving(true);
    const signature = canvasRef.current!.toDataURL("image/png");
    const orgId = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;

    // 1) attendance UPSERT
    const dateCol = "date"; // 기본 date 컬럼 사용, 실패 시 폴백
    let att: any = null;
    const { data: existing } = await supabase.from("attendance")
      .select("*").eq("member_id", member.id)
      .or(`date.eq.${date},attendance_date.eq.${date},session_date.eq.${date}`)
      .maybeSingle();
    if (existing) {
      const r = await supabase.from("attendance").update({
        status, signature, signer_role: signer, signed_at: new Date().toISOString(),
        slot_id: slot?.id || null,
      }).eq("id", existing.id);
      att = r.error;
    } else {
      const payload: any = {
        org_id: orgId, member_id: member.id, status,
        signature, signer_role: signer, signed_at: new Date().toISOString(),
        slot_id: slot?.id || null,
      };
      payload[dateCol] = date;
      const r = await supabase.from("attendance").insert(payload);
      // 컬럼명 다른 경우 폴백
      if (r.error && /Could not find the '(date|attendance_date|session_date)' column/.test(r.error.message)) {
        for (const alt of ["date", "attendance_date", "session_date"]) {
          const p: any = { ...payload }; delete p.date; delete p.attendance_date; delete p.session_date;
          p[alt] = date;
          const r2 = await supabase.from("attendance").insert(p);
          if (!r2.error) { att = null; break; }
        }
      } else att = r.error;
    }

    // 2) schedule_slots 상태 동기화
    if (slot?.id) {
      const slotStatus = status === "present" ? "done"
        : status === "absent" ? "noshow"
        : status === "sick" ? "sick"
        : "personal";
      await supabase.from("schedule_slots").update({ status: slotStatus }).eq("id", slot.id);
    }

    // ✅ v3.21.5: 회원권 잔여횟수 자동 차감/복원 (근본 해결)
    // - present/absent(완료·노쇼) → -1회 차감
    // - sick/personal(병결·개인) → 차감 없음
    // - 이전 상태와 비교하여 중복 차감/누락 복원 방지
    try {
      const shouldDeductNow = status === "present" || status === "absent";
      const prevStatus = existing?.status;
      const wasDeducted = prevStatus === "present" || prevStatus === "absent";

      // 회원의 활성 회원권 조회 (가장 최근 시작한 것)
      const { data: activeMs } = await supabase.from("memberships")
        .select("id, used_sessions, total_sessions, adjustment, start_date, end_date, status")
        .eq("member_id", member.id)
        .neq("status", "cancelled")
        .order("start_date", { ascending: false })
        .limit(5);

      if (activeMs && activeMs.length > 0) {
        // 유효기간·잔여회수 우선순위: 활성 + 기간 내 + 잔여 있는 회원권
        const today = new Date().toISOString().slice(0, 10);
        const priority = activeMs.find((m: any) => {
          const remaining = (m.total_sessions || 0) + (m.adjustment || 0) - (m.used_sessions || 0);
          const inRange = (!m.end_date || m.end_date >= today) && (!m.start_date || m.start_date <= today);
          return remaining > 0 && inRange && m.status === "active";
        }) || activeMs[0];

        if (shouldDeductNow && !wasDeducted) {
          // 신규 차감
          const newUsed = (priority.used_sessions || 0) + 1;
          await supabase.from("memberships").update({ used_sessions: newUsed }).eq("id", priority.id);
        } else if (!shouldDeductNow && wasDeducted) {
          // 복원 (병결/개인사정으로 변경)
          const newUsed = Math.max(0, (priority.used_sessions || 0) - 1);
          await supabase.from("memberships").update({ used_sessions: newUsed }).eq("id", priority.id);
        }
        // 상태 변경 없음 (present ↔ absent) 또는 같은 상태 재저장 → 중복 차감 방지
      }
    } catch (deductErr: any) {
      console.warn("회원권 차감 실패(무시하고 진행):", deductErr?.message);
    }

    setSaving(false);
    if (att) {
      alert("저장 일부 실패: " + (att.message || att));
    } else {
      alert("✅ 사인 출결이 저장되었습니다" + (status === "present" || status === "absent" ? "\n💳 회원권 -1회 자동 차감" : "\n💚 회원권 차감 없음"));
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-pink-50 flex items-center justify-between">
          <div>
            <div className="text-lg font-bold text-slate-900">✍️ 사인 출결</div>
            <div className="text-xs text-gray-600">
              {member?.name} · {date} {slot?.time_slot ? `· ${slot.time_slot}` : ""}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/70 rounded"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4">
          {/* ✅ v3.20.16: 회원권 정보 (몇회권 중 몇회수업 · 남은 회수) */}
          {membership ? (() => {
            const total = (membership.total_sessions || 0) + (membership.adjustment || 0);
            const used  = membership.used_sessions || 0;
            const remaining = Math.max(0, total - used);
            const currentSessionNo = used + 1; // 본 수업이 바로 몇 회수업인지
            const lowStock = remaining <= 2;
            return (
              <div className={`mb-3 p-3 rounded-lg border-2 ${lowStock ? "bg-red-50 border-red-300" : "bg-aqu-50 border-aqu-200"}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-bold text-slate-900">🎯 {membership.plan_name || "회원권"}</div>
                  <div className="text-[11px] text-gray-600">{membership.start_date} ~ {membership.end_date}</div>
                </div>
                <div className="text-[13px] text-gray-800">
                  전체 <b className="text-aqu-700">{total}회권</b> 중
                  <b className="text-purple-700 mx-1">{status === "present" ? currentSessionNo : used}회 수업</b>
                  · 남은 회수 <b className={lowStock ? "text-red-600" : "text-emerald-700"}>{status === "present" ? remaining - 1 : remaining}회</b>
                </div>
                {lowStock && (
                  <div className="mt-2 p-2 bg-red-100 border border-red-400 rounded text-[12px] font-bold text-red-800 flex items-center gap-1">
                    ⚠️ 남은 회수가 {remaining}회입니다! 결제 안내가 필요합니다.
                  </div>
                )}
                {remaining === 0 && (
                  <div className="mt-2 p-2 bg-red-200 border-2 border-red-500 rounded text-[12px] font-bold text-red-900">
                    🚨 회원권 소진! 지금 결제 안내해 주세요.
                  </div>
                )}
              </div>
            );
          })() : (
            <div className="mb-3 p-2 bg-yellow-50 border border-yellow-300 rounded text-[11px] text-yellow-800">
              ⚠️ 활성 회원권이 없습니다. 결제 등록을 먼저 진행해 주세요.
            </div>
          )}

          {/* 동의문 */}
          <div className="mb-3 p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-[11px] text-purple-800">
            📝 <b>본 서명으로 당일 출석 및 세션 차감이 처리</b>되며, 서명 정보는 출석 증빙 목적으로 보관됩니다.
          </div>

          {/* 상태 선택 */}
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {[
              { v: "present",  l: "✓ 출석",   c: "bg-green-100 text-green-800 border-green-400" },
              { v: "absent",   l: "✗ 결석",   c: "bg-gray-100 text-gray-600 border-gray-300" },
              { v: "sick",     l: "🏥 병결",  c: "bg-gray-100 text-gray-600 border-gray-300" },
              { v: "personal", l: "📝 개인",  c: "bg-gray-100 text-gray-600 border-gray-300" },
            ].map(o => (
              <button key={o.v} onClick={() => setStatus(o.v as any)}
                className={`px-2 py-1.5 rounded-lg text-xs font-semibold border-2 transition ${status === o.v ? o.c : "bg-white text-gray-500 border-gray-200"}`}>
                {o.l}
              </button>
            ))}
          </div>

          {/* 서명자 */}
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {[
              { v: "parent", l: "👪 보호자" },
              { v: "self",   l: "👤 본인" },
              { v: "staff",  l: "👨‍⚕️ 직원 대필" },
            ].map(o => (
              <button key={o.v} onClick={() => setSigner(o.v as any)}
                className={`px-2 py-1.5 rounded-lg text-xs font-semibold border-2 transition ${signer === o.v ? "bg-purple-500 text-white border-purple-500" : "bg-white text-gray-500 border-gray-200"}`}>
                {o.l}
              </button>
            ))}
          </div>

          {/* 캔버스 */}
          <div className="relative border-2 border-purple-300 rounded-xl overflow-hidden bg-white">
            <canvas ref={canvasRef} width={500} height={200}
              className="w-full touch-none block"
              onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={endDraw} />
            {!hasStroke && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-gray-300 text-sm">
                이 영역에 서명해주세요
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-3">
            <button onClick={clearCanvas}
              className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1">
              <RotateCcw className="w-3.5 h-3.5" /> 지우기
            </button>
            <button onClick={save} disabled={saving || !hasStroke}
              className="flex-[2] py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1">
              <Save className="w-3.5 h-3.5" /> {saving ? "저장 중..." : "사인 저장 & 출결 처리"}
            </button>
          </div>

          {/* ✅ v3.20.4: 기존 서명이 있을 때 취소 버튼 노출 */}
          {existingRow && (
            <div className="mt-3 p-3 border-2 border-red-200 bg-red-50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold text-red-700">⚠️ 이미 서명된 기록이 있습니다</div>
                <div className="text-[10px] text-red-600">
                  {existingRow.signed_at ? new Date(existingRow.signed_at).toLocaleString("ko-KR", { hour12: false }) : ""}
                </div>
              </div>
              {existingRow.signature && (
                <img src={existingRow.signature} alt="prev" className="h-12 max-w-[220px] bg-white border border-red-200 rounded mb-2" />
              )}
              <button onClick={async () => {
                if (!confirm("이 서명을 취소하고 예약 상태로 되돌릴까요?\n\n• 서명 이미지 삭제\n• attendance 기록 삭제\n• 시간표 슬롯 상태 → scheduled(예약)")) return;
                setSaving(true);
                // v3.21.5: 서명 취소 시 회원권 복원 (차감된 경우만)
                try {
                  const wasDeducted = existingRow.status === "present" || existingRow.status === "absent";
                  if (wasDeducted) {
                    const { data: msList } = await supabase.from("memberships")
                      .select("id, used_sessions").eq("member_id", member.id).neq("status", "cancelled")
                      .order("start_date", { ascending: false }).limit(5);
                    if (msList && msList.length > 0) {
                      const target = msList[0];
                      await supabase.from("memberships").update({
                        used_sessions: Math.max(0, (target.used_sessions || 0) - 1)
                      }).eq("id", target.id);
                    }
                  }
                } catch (e: any) { console.warn("회원권 복원 실패:", e?.message); }

                // 1) attendance 삭제
                const { error: delErr } = await supabase.from("attendance").delete().eq("id", existingRow.id);
                if (delErr) { setSaving(false); return alert("취소 실패: " + delErr.message); }
                // 2) schedule_slots 상태 되돌리기
                if (slot?.id) {
                  await supabase.from("schedule_slots").update({ status: "scheduled" }).eq("id", slot.id);
                }
                setSaving(false);
                alert("✅ 서명 취소 완료");
                setExistingRow(null);
                onSaved();
              }}
                className="w-full py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-1">
                <Trash2 className="w-3.5 h-3.5" /> 서명 취소 · 예약으로 되돌리기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
