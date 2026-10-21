"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { saveActualAttendance } from "@/lib/actualMembershipUsage";
import { remainingOf, totalOf } from "@/lib/membershipFifo";
import { signatureMembershipDecision } from "@/lib/signatureMembership";
import { loadMemberMemberships } from "@/lib/memberMembershipQuery";
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
  // ✅ v3.25.3: 훅은 무조건 최상단에서 순서대로 호출 (React Hooks 규칙 준수)
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
  const [membershipMessage, setMembershipMessage] = useState("");
  const [membershipReload,setMembershipReload]=useState(0);

  useEffect(()=>{
    if(!member?.id)return;
    let stopped=false;
    const refresh=async()=>{
      try {
        const data=await loadMemberMemberships(member.id);if(stopped)return;
        const resolution=signatureMembershipDecision({...slot,member_id:member.id,event_date:date},data,existingRow);
        setMembership(resolution.activeMs || null);setMembershipMessage(resolution.message || "");
      }catch(error:any){if(stopped)return;setMembership(null);setMembershipMessage(error?.message || "회원권 조회 실패. 다시 조회해주세요.");}
    };
    void refresh();
    const visible=()=>{if(!document.hidden)void refresh();};
    window.addEventListener("focus",visible);document.addEventListener("visibilitychange",visible);
    return ()=>{stopped=true;window.removeEventListener("focus",visible);document.removeEventListener("visibilitychange",visible);};
  },[member?.id,date,slot?.id,slot?.lesson_name,slot?.membership_id,existingRow?.membership_id,existingRow?.deduction_mode,membershipReload]);

  // 기존 서명 조회
  useEffect(() => {
    if (!member?.id || !date) return;
    (async () => {
      let query = supabase.from("attendance").select("*").eq("member_id", member.id)
        .or(`attend_date.eq.${date},date.eq.${date},attendance_date.eq.${date},session_date.eq.${date}`);
      if (slot?.id) query = query.eq("slot_id", slot.id);
      else if (slot?.time_slot) query = query.eq("time_slot", slot.time_slot);
      const { data, error } = await query;
      const match = !error && data?.length === 1 ? data[0] : null;
      setExistingRow(match);
      if (match?.status) setStatus(match.status);
    })();
  }, [member?.id, date, slot?.id]);

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

  // ✅ v3.25.3: 모든 훅 호출 완료 후에 조건부 early return
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
    if (saving) return;
    if (!hasStroke) return alert("서명을 그려주세요");
    setSaving(true);
    try {
      const organization = (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      const result = await saveActualAttendance({ memberId: member.id, date, status, slot, existing: existingRow, signatureOnly: true, allowAutoUnique: true, deferInvalidMembership: true,
        orgId: organization, extra: { signature: canvasRef.current!.toDataURL("image/png"),
          signer_role: signer, signed_at: new Date().toISOString() } });
      alert(["✅ 사인 출결 저장 완료", result.deducted ? "선택한 회원권 1회 차감" : result.restored ? "연결 회원권 1회 복원" : "추가 차감 없음", result.warning].filter(Boolean).join("\n"));
      onSaved();
    } catch (error: any) { alert("저장 실패: " + (error?.message || error)); }
    finally { setSaving(false); }
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
            const total = totalOf(membership);
            const used  = membership.used_sessions || 0;
            const remaining = remainingOf(membership);
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
              {membershipMessage || "수업에 맞는 사용 회원권을 확인해주세요. 서명은 저장하고 차감은 관리자 확인 후 처리합니다."}
            </div>
          )}

          <button type="button" onClick={()=>setMembershipReload(x=>x+1)} className="text-[11px] text-slate-600 underline mb-2">회원권 다시 조회</button>

          {/* 동의문 */}
          <div className="mb-3 p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-[11px] text-purple-800">
            📝 <b>본 서명으로 당일 출석이 저장되고, 사용 회원권이 지정된 경우에만 차감 처리</b>되며, 서명 정보는 출석 증빙 목적으로 보관됩니다.
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
                try {
                  const result = await saveActualAttendance({ memberId: member.id, date, status: null,
                    slot, existing: existingRow, slotStatus: "scheduled" });
                  if (result.warning) alert(result.warning);
                } catch (error: any) { setSaving(false); return alert("취소 실패: " + (error?.message || error)); }
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
