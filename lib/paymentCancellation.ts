// v3.73.3: 잘못 등록한 회원권을 삭제할 때 결제 연결을 끊지 않고 등록 취소로 함께 보존한다.
import { supabase } from "@/lib/supabase";
const cancelledStates = new Set(["cancelled", "canceled", "refunded", "void", "cancel"]);
export function isPaymentCancelled(p: any, memberships: any[] = []): boolean {
  if (!p) return false;
  if (p.deleted_at || p.cancelled_at || p.canceled_at || p.is_cancelled === true || cancelledStates.has(String(p.status || "").trim().toLowerCase())) return true;
  if (String(p.refund_status || "").toLowerCase() === "full") return true;
  const amount = Number(p.amount || 0);
  if (amount > 0 && Number(p.refunded_amount || 0) >= amount) return true;
  const related = [p.memberships, ...(memberships || []).filter(m => m.id === p.membership_id || m.payment_id === p.id)].flat().filter(Boolean);
  return related.some(m => m.deleted_at || m.cancelled_at || m.canceled_at || cancelledStates.has(String(m.status || "").trim().toLowerCase()));
}
export async function cancelMembershipRegistration(id: string): Promise<void> {
  const result = await supabase.from("memberships").select("*").eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  const ms = result.data;
  if (!ms) throw new Error("회원권을 찾을 수 없습니다. 새로고침 후 다시 확인해주세요.");
  const pr = await supabase.from("payments").select("*").eq("member_id", ms.member_id);
  if (pr.error) throw pr.error;
  const related = (pr.data || []).filter(p => p.membership_id === id || (ms.payment_id && p.id === ms.payment_id));
  const active = related.filter(p => !isPaymentCancelled(p));
  if (active.some(p => p.member_id !== ms.member_id)) throw new Error("회원권과 결제의 회원이 다릅니다. 변경하지 않았습니다.");
  const now = new Date().toISOString();
  const changed: any[] = [];
  let membershipChanged = false;
  try {
    for (const p of active) {
      let q = supabase.from("payments").update({ status: "cancelled", cancelled_at: now, cancelled_reason: "잘못 등록한 회원권 삭제 — 등록 내역 취소(실제 카드 환불 아님)" }).eq("id", p.id);
      q = p.status == null ? q.is("status", null) : q.eq("status", p.status);
      q = p.membership_id == null ? q.is("membership_id", null) : q.eq("membership_id", p.membership_id);
      if (p.updated_at) q = q.eq("updated_at", p.updated_at);
      const r = await q.select("id");
      if (r.error) throw r.error;
      if (r.data?.length !== 1) throw new Error("결제가 다른 화면에서 변경되었습니다. 새로고침 후 확인해주세요.");
      changed.push(p);
    }
    let q = supabase.from("memberships").update({ status: "cancelled", cancelled_at: now, cancelled_reason: "잘못 등록한 회원권 삭제(등록 내역 취소)", deleted_at: now }).eq("id", id);
    if (ms.updated_at) q = q.eq("updated_at", ms.updated_at);
    const r = await q.select("id");
    if (r.error) throw r.error;
    if (r.data?.length !== 1) throw new Error("회원권이 다른 화면에서 변경되었습니다. 새로고침 후 확인해주세요.");
    membershipChanged = true;
    // 상태/연결을 재조회해 실패를 성공으로 알리지 않는다.
    const check = await supabase.from("payments").select("*").eq("member_id", ms.member_id);
    if (check.error) throw check.error;
    if (active.some(p => !(check.data || []).some(x => x.id === p.id && x.membership_id === p.membership_id && isPaymentCancelled(x)))) throw new Error("연결 결제 취소 결과를 확인할 수 없습니다.");
  } catch (error: any) {
    const failed: string[] = [];
    if (membershipChanged) {
      const r = await supabase.from("memberships").update({ status: ms.status, cancelled_at: ms.cancelled_at || null, cancelled_reason: ms.cancelled_reason || null, deleted_at: ms.deleted_at || null }).eq("id", id).eq("cancelled_at", now).select("id");
      if (r.error || r.data?.length !== 1) failed.push("회원권");
    }
    for (const p of changed.reverse()) {
      const r = await supabase.from("payments").update({ status: p.status, cancelled_at: p.cancelled_at || null, cancelled_reason: p.cancelled_reason || null }).eq("id", p.id).eq("cancelled_at", now).select("id");
      if (r.error || r.data?.length !== 1) failed.push("결제");
    }
    throw new Error((error?.message || String(error)) + (failed.length ? `\n${failed.join("·")} 복구 확인이 필요합니다. 다시 삭제하지 말고 관리자에게 알려주세요.` : "\n저장을 중단하고 변경한 상태를 복원했습니다."));
  }
  // 출석/시간표/사용횟수·서명은 건드리지 않는다. 실제 환불은 별도 환불 절차다.
}
