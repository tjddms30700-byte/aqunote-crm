"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { X, RotateCcw, Save } from "lucide-react";

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);
  const [status, setStatus] = useState<"present" | "absent" | "sick" | "personal">("present");
  const [signer, setSigner] = useState<"parent" | "self" | "staff">(
    member?.member_type === "child" ? "parent" : "self"
  );
  const [saving, setSaving] = useState(false);

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

    setSaving(false);
    if (att) {
      alert("저장 일부 실패: " + (att.message || att));
    } else {
      alert("✅ 사인 출결이 저장되었습니다");
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
        </div>
      </div>
    </div>
  );
}
