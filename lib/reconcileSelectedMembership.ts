// v3.74.4: 관리자가 선택한 실제 사용권으로 기존 완료 수업을 정산한다.
// 예약 연결 != 차감 증빙. 기존 권에 남은 다른 완료 수업의 사용량은 복원하지 않는다.
import { supabase } from "@/lib/supabase";
import { remainingOf } from "@/lib/membershipFifo";
import { matchesLessonProduct } from "@/lib/lessonProduct";
const d = (r: any) => String(r?.event_date || r?.attend_date || r?.date || r?.attendance_date || r?.session_date || "").slice(0,10);
const counted = (s: any) => ["done","completed","present","absent","noshow","cancel"].includes(String(s || ""));
const free = (s: any) => String(s?.lesson_name || "").replace(/\s/g, "") === "무료체험";
export function attributableOldUsage(used: number, otherCompleted: number, hasEvidence: boolean): number {
  return hasEvidence && used > Math.max(0, otherCompleted) ? 1 : 0;
}
export async function reconcileSelectedMembership(options: any): Promise<any> {
  const { memberId, date, status, extra = {}, selectedMembershipId } = options;
  if (!options.slot?.id || !selectedMembershipId || !counted(status)) throw new Error("수업과 실제 사용 회원권을 선택해주세요.");
  const sr = await supabase.from("schedule_slots").select("*").eq("id", options.slot.id).eq("member_id", memberId).maybeSingle();
  if (sr.error) throw sr.error;
  const slot = sr.data;
  if (!slot || slot.deleted_at || d(slot) !== date) throw new Error("정산할 수업을 찾을 수 없습니다. 새로고침 후 확인해주세요.");
  if (free(slot)) throw new Error("무료체험은 회원권에서 차감할 수 없습니다.");
  const today = new Date();
  const todayDay = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  if (date > todayDay) throw new Error("미래 예약은 미리 차감하지 않습니다.");
  const ar = await supabase.from("attendance").select("*").eq("member_id", memberId);
  const mr = await supabase.from("memberships").select("*").eq("member_id", memberId);
  const allSlots = await supabase.from("schedule_slots").select("*").eq("member_id", memberId);
  if (ar.error || mr.error || allSlots.error) throw (ar.error || mr.error || allSlots.error);
  const attendance = (ar.data || []).filter(a => !a.deleted_at);
  let matches = attendance.filter(a => a.slot_id === slot.id);
  if (!matches.length) matches = attendance.filter(a => !a.slot_id && d(a) === date && a.time_slot === slot.time_slot);
  if (matches.length > 1) throw new Error("같은 수업의 출석이 중복돼 있습니다. 중복 내역을 확인해주세요.");
  const previous = matches[0] || null;
  const oldId = previous?.membership_id || slot.membership_id;
  const target = (mr.data || []).find(m => m.id === selectedMembershipId);
  const old = (mr.data || []).find(m => m.id === oldId);
  if (!target || target.deleted_at || ["cancelled","refunded"].includes(target.status)) throw new Error("선택한 회원권을 사용할 수 없습니다.");
  if ((target.start_date && target.start_date.slice(0,10) > date)) throw new Error("선택한 회원권의 기간이 수업일과 다릅니다. 기간을 확인해주세요.");
  if (!matchesLessonProduct(slot,target,mr.data || [])) throw new Error("수업 상품과 선택한 회원권이 다릅니다. STANDARD/하프 등 실제 수업 상품을 확인해주세요.");
  const trialClass = slot.event_type === "trial" || /체험|trial/i.test(String(slot.lesson_name || ""));
  const trialTicket = /체험|trial/i.test(String(target.plan_name || ""));
  if (trialClass !== trialTicket || /무료체험/.test(String(target.plan_name || ""))) throw new Error("유료체험은 결제한 체험권만, 일반 수업은 일반 회원권만 사용할 수 있습니다.");
  if (trialTicket) {
    const pr = await supabase.from("payments").select("*").eq("membership_id", target.id);
    if (pr.error) throw pr.error;
    const paid = (pr.data || []).some(p => !p.deleted_at && !p.cancelled_at && !p.is_cancelled && p.status !== "cancelled" && Number(p.amount || 0)-Number(p.refunded_amount || 0)-Number(p.discount_amount || 0)-Number(p.unpaid_amount || 0)>0);
    if (!paid) throw new Error("결제가 확인되는 체험권만 사용할 수 있습니다.");
  }
  const evidence = !!previous?.membership_id && counted(previous.status) && (previous.deduction_mode === "auto" || !!previous.deducted_at);
  const alreadyTarget = evidence && previous.membership_id === target.id;
  const linkOnly = options.historicalHandling === "link_only" || (previous?.deduction_mode === "manual_link" && previous.membership_id === target.id);
  if (previous?.deduction_mode === "manual_link" && !linkOnly && previous.membership_id !== target.id) throw new Error("수동 정산한 수업입니다. ‘이미 수동 정산 — 연결만’으로 연결하거나 수동 조정 내역을 먼저 확인해주세요.");
  const slotsById = new Map((allSlots.data || []).map(s => [s.id,s]));
  const other = new Set<string>();
  const key = (r: any) => `${d(r)}|${r.time_slot || ""}`;
  const thisKey = `${date}|${slot.time_slot || ""}`;
  // 기존 권이 부담해야 할 다른 완료 수업은 출석/시간표를 같은 날짜·시간으로 중복 제거한다.
  for (const s of allSlots.data || []) if (!s.deleted_at && s.id !== slot.id && key(s) !== thisKey && s.membership_id === oldId && counted(s.status) && !free(s) && !["carried_over","refunded"].includes(s.noshow_action) && d(s) <= todayDay) other.add(key(s));
  for (const a of attendance) {
    if (a.id === previous?.id || a.slot_id === slot.id || key(a) === thisKey || a.membership_id !== oldId || !counted(a.status)) continue;
    const s: any = slotsById.get(a.slot_id);
    if ((s && free(s)) || (s && ["carried_over","refunded"].includes(s.noshow_action))) continue;
    if (d(a) && d(a) <= todayDay) other.add(key(a));
  }
  const different = old && old.id !== target.id;
  const legacyCovered = !evidence && old?.id === target.id && counted(slot.status) && Number(target.used_sessions || 0) > other.size;
  const needCharge = !alreadyTarget && !linkOnly && !legacyCovered;
  if (needCharge && remainingOf(target) < 1) throw new Error("선택한 회원권의 잔여 횟수가 없습니다.");
  const restoreOld = different && !linkOnly ? attributableOldUsage(Number(old.used_sessions || 0), other.size, evidence || (counted(slot.status) && !!slot.membership_id)) : 0;
  const desired = new Map<string,number>();
  if (different) desired.set(old.id, Number(old.used_sessions || 0)-restoreOld);
  desired.set(target.id, Number(target.used_sessions || 0)+(needCharge ? 1 : 0));
  const snapshots = new Map<string,any>();
  for (const id of desired.keys()) snapshots.set(id,(mr.data || []).find(m => m.id === id));
  const now = new Date().toISOString();
  const mode = linkOnly ? "manual_link" : "auto";
  const payload: any = { ...extra, member_id: memberId, attend_date: date, time_slot: slot.time_slot || null, slot_id: slot.id, status,
    membership_id: target.id, deduction_mode: mode, deducted_at: linkOnly ? null : (alreadyTarget ? previous.deducted_at || now : now) };
  if (options.orgId) payload.org_id = options.orgId;
  const nextSlotStatus = options.slotStatus || (status === "absent" ? "noshow" : "done");
  let written: any = null; let slotWritten = false;
  const changed: any[] = [];
  try {
    let q = previous ? supabase.from("attendance").update(payload).eq("id", previous.id) : supabase.from("attendance").insert(payload);
    if (previous) {
      q = previous.membership_id == null ? q.is("membership_id",null) : q.eq("membership_id",previous.membership_id);
      if (previous.updated_at) q=q.eq("updated_at",previous.updated_at);
    }
    const saved = await q.select("id").single();
    if (saved.error) throw saved.error;
    written = saved.data;
    const ss = await supabase.from("schedule_slots").update({ status: nextSlotStatus, membership_id: target.id }).eq("id",slot.id).eq("member_id",memberId).select("id").single();
    if (ss.error) throw ss.error; slotWritten=true;
    for (const [id,value] of desired) {
      const before = snapshots.get(id); const r = await supabase.from("memberships").select("*").eq("id",id).single();
      if (r.error) throw r.error;
      const actual = Number(r.data.used_sessions || 0), original = Number(before.used_sessions || 0);
      if (![original,original-1,original+1,value].includes(actual)) throw new Error("다른 화면에서 회원권이 변경되었습니다. 정산을 중단했습니다.");
      if (actual !== value) {
        let uq = supabase.from("memberships").update({ used_sessions:value }).eq("id",id).eq("member_id",memberId);
        uq = r.data.used_sessions == null ? uq.is("used_sessions",null) : uq.eq("used_sessions",actual);
        const u = await uq.select("id").single(); if (u.error) throw u.error;
        changed.push({id,value});
      }
    }
    for (const [id,value] of desired) {
      const r=await supabase.from("memberships").select("*").eq("id",id).single();
      if (r.error || Number(r.data?.used_sessions || 0)!==value) throw new Error("회원권 정산 결과 검증에 실패했습니다.");
    }
  } catch (error: any) {
    const failed: string[]=[];
    if (written?.id) {
      const q=previous ? supabase.from("attendance").update(Object.fromEntries(Object.keys(payload).map(k=>[k,previous[k] ?? null]))).eq("id",previous.id) : supabase.from("attendance").delete().eq("id",written.id);
      const r=await q; if(r.error) failed.push("출석");
    }
    if(slotWritten){const r=await supabase.from("schedule_slots").update({status:slot.status,membership_id:slot.membership_id || null}).eq("id",slot.id);if(r.error)failed.push("시간표");}
    for (const [id,value] of desired) {
      const before=snapshots.get(id),r=await supabase.from("memberships").select("*").eq("id",id).single();
      if(r.error){failed.push("회원권");continue;}
      const actual=Number(r.data.used_sessions || 0),original=Number(before.used_sessions || 0);
      if(actual===original)continue;
      if(![original-1,original+1,value].includes(actual)){failed.push("회원권(동시변경)");continue;}
      const u=await supabase.from("memberships").update({used_sessions:original}).eq("id",id).eq("used_sessions",actual).select("id");if(u.error || u.data?.length!==1)failed.push("회원권");
    }
    throw new Error((error?.message || String(error))+(failed.length ? `\n${failed.join("·")} 복구 확인이 필요합니다. 재저장하지 말고 관리자에게 알려주세요.` : "\n변경을 복원하고 정산을 중단했습니다."));
  }
  return { deducted:needCharge,restored:!!restoreOld,membershipId:target.id,warning:linkOnly ? "기존 수동 정산을 유지하고 사용 회원권 연결만 저장했습니다." : different && !restoreOld ? "기존 회원권의 사용량은 다른 완료 수업에 필요해 유지하고, 선택한 회원권에 이번 수업 1회를 반영했습니다." : "" };
}
