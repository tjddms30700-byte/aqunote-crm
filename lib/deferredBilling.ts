// v3.74.0: 발급과 수납을 분리. 무료/후불 발급 시 payments를 생성하지 않는다.
import { supabase } from "@/lib/supabase";
import { isPaymentCancelled } from "@/lib/paymentCancellation";
export const BILLING_PREFIX = "AQUNOTE_BILLING_V1:";
export function readBillingMetadata(m: any): any | null {
  const notes = String(m?.notes || "");
  if (!notes.startsWith(BILLING_PREFIX)) return null;
  try { const v = JSON.parse(notes.slice(BILLING_PREFIX.length)); return v.version === 1 ? v : null; } catch { return null; }
}
export function encodeBillingMetadata(v: any): string { return BILLING_PREFIX + JSON.stringify({ ...v, version: 1 }); }
export function registrationMode(f: any): "prepaid" | "free" | "deferred" {
  if (String(f.plan_name || "").replace(/\s/g, "") === "무료체험") return "free";
  return f.billing_mode === "deferred" ? "deferred" : "prepaid";
}
export function validateNonPaymentIssue(f: any, mode: string): void {
  if (!f.member_id || !String(f.plan_name || "").trim()) throw new Error("회원과 회원권을 선택해주세요.");
  if (!Number.isInteger(Number(f.sessions)) || Number(f.sessions) < 1) throw new Error("발급할 기본 횟수를 1회 이상 입력해주세요.");
  if (!Number.isInteger(Number(f.extra_sessions || 0)) || Number(f.extra_sessions || 0) < 0) throw new Error("서비스 횟수를 확인해주세요.");
  if (!Number.isFinite(Number(f.amount)) || Number(f.amount) < 0) throw new Error("예정 금액은 0원 이상이어야 합니다.");
  if (mode === "free" && (registrationMode(f) !== "free" || Number(f.amount) !== 0)) throw new Error("무료체험은 금액 0원으로 등록해주세요.");
  if (mode === "deferred" && /체험|trial/i.test(String(f.plan_name || ""))) throw new Error("유료체험권은 결제 후 발급해주세요. 무료체험은 무료체험 상품을 선택해주세요.");
  if (mode === "deferred" && !String(f.payer_name || "").trim()) throw new Error("후불 결제처를 입력해주세요. 예: 밀알복지재단");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.paid_at || "")) throw new Error("수업 시작일을 입력해주세요.");
}
export async function issueWithoutPayment(f: any, category: string, orgId?: string, branchId?: string | null): Promise<any> {
  const mode = registrationMode(f);
  if (mode === "prepaid") throw new Error("일반 결제는 결제 등록을 이용해주세요.");
  validateNonPaymentIssue(f, mode);
  const end = new Date(f.paid_at + "T00:00:00Z");
  if (!Number.isFinite(end.getTime())) throw new Error("수업 시작일을 확인해주세요.");
  const validDays = Number(f.valid_days);
  if (!Number.isInteger(validDays) || validDays <= 0) throw new Error("유효기간을 1일 이상 입력해주세요.");
  end.setUTCDate(end.getUTCDate() + validDays);
  const meta = { mode, state: mode === "free" ? "free" : "unpaid", expectedAmount: Number(f.amount || 0), payer: mode === "free" ? "" : String(f.payer_name).trim(), memo: f.memo || "", registeredAt: new Date().toISOString() };
  const payload: any = { ...(orgId ? { org_id: orgId } : {}), ...(branchId && branchId !== "ALL" ? { branch_id: branchId } : {}), member_id: f.member_id, plan_id: f.plan_id || null, plan_name: f.plan_name,
    total_sessions: Number(f.sessions) + Number(f.extra_sessions || 0), used_sessions: 0, adjustment: 0, price: mode === "free" ? 0 : Number(f.amount || 0),
    start_date: f.paid_at, end_date: end.toISOString().slice(0, 10), status: "active", category, notes: encodeBillingMetadata(meta) };
  const r = await supabase.from("memberships").insert(payload).select("*").single();
  if (r.error) throw r.error;
  if (!r.data?.id) throw new Error("회원권 발급 결과를 확인할 수 없습니다. 다시 발급하지 말고 목록을 확인해주세요.");
  return r.data;
}
export async function settleDeferredMembership(id: string, f: any): Promise<void> {
  const amount = Number(f.amount);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("실제로 받은 결제금액을 입력해주세요.");
  if (Number(f.unpaid || 0) || Number(f.discount || 0)) throw new Error("후불 수납은 이번에 전액 수납한 금액으로 입력해주세요. 부분수납·할인은 별도 정산 확인이 필요합니다.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.paid_at || "")) throw new Error("실제 결제일을 입력해주세요.");
  const parts = [f.pay_card, f.pay_cash, f.pay_transfer, f.pay_other].map(v => Number(v || 0));
  if (parts.some(v => !Number.isInteger(v) || v < 0)) throw new Error("결제수단 금액을 확인해주세요.");
  const sum = parts.reduce((a,b) => a+b,0);
  if (sum !== 0 && sum !== amount) throw new Error("결제수단별 합계와 실제 결제금액이 다릅니다.");
  const mr = await supabase.from("memberships").select("*").eq("id", id).maybeSingle();
  if (mr.error) throw mr.error;
  const m = mr.data, meta = readBillingMetadata(m);
  if (!m || m.member_id !== f.member_id || m.deleted_at || m.status === "cancelled" || meta?.mode !== "deferred" || meta.state !== "unpaid") throw new Error("수납 가능한 후불 회원권이 아닙니다. 새로고침 후 확인해주세요.");
  if (Number(meta.expectedAmount) > 0 && Number(meta.expectedAmount) !== amount) throw new Error("예정금액과 다릅니다. 전액 수납만 지원하므로 정산금액을 확인해주세요.");
  const pr = await supabase.from("payments").select("*").eq("membership_id", id);
  if (pr.error) throw pr.error;
  if ((pr.data || []).some(p => !isPaymentCancelled(p))) throw new Error("이미 연결된 결제가 있습니다. 중복 수납하지 않았습니다.");
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const lockedNotes = encodeBillingMetadata({ ...meta, state: "settling", token });
  const lock = await supabase.from("memberships").update({ notes: lockedNotes }).eq("id", id).eq("notes", m.notes).select("id");
  if (lock.error) throw lock.error;
  if (lock.data?.length !== 1) throw new Error("다른 관리자가 수납 처리 중입니다. 새로고침 후 확인해주세요.");
  let pay: any = null;
  try {
    const payload: any = { ...(m.org_id ? { org_id: m.org_id } : {}), ...(m.branch_id ? { branch_id: m.branch_id } : {}), member_id: m.member_id, membership_id: id, category: m.category,
      amount, gross_amount: amount, method: f.method || "card", paid_at: f.paid_at, paid_time: f.paid_time || null, status: "active", description: m.plan_name,
      memo: `[후불수납] ${meta.payer}${f.memo ? " / " + f.memo : ""}`, unpaid_amount: 0, discount_amount: 0,
      pay_card: sum ? parts[0] : (f.method === "card" ? amount : 0), pay_cash: sum ? parts[1] : (f.method === "cash" ? amount : 0), pay_transfer: sum ? parts[2] : (f.method === "transfer" ? amount : 0), pay_other: sum ? parts[3] : (f.method === "other" ? amount : 0),
      approval_no: f.approval_no || null, card_issuer: f.card_issuer || null, receipt_no: f.receipt_no || null };
    const p = await supabase.from("payments").insert(payload).select("*").single();
    if (p.error) throw p.error;
    pay = p.data;
    if (!pay?.id) throw new Error("수납 결과를 확인할 수 없습니다. 다시 결제하지 말고 관리자에게 확인해주세요.");
    const notes = encodeBillingMetadata({ ...meta, state: "settled", receivedAmount: amount, paidAt: f.paid_at, paymentId: pay.id, token: undefined });
    // 사용회차/총회차/시작일/만료일을 업데이트하지 않는다.
    const done = await supabase.from("memberships").update({ notes, price: amount }).eq("id", id).eq("notes", lockedNotes).select("id");
    if (done.error) throw done.error;
    if (done.data?.length !== 1) throw new Error("후불 정산 완료 상태를 저장할 수 없습니다.");
  } catch (error: any) {
    if (pay?.id) {
      // 결제 기록이 만들어졌다면 잠금을 풀거나 같은 결제를 재시도하지 않는다.
      throw new Error((error?.message || String(error)) + "\n결제 이력은 저장되어 있습니다. 중복 결제하지 말고 관리자에게 정산 상태 확인을 요청해주세요.");
    }
    const undo = await supabase.from("memberships").update({ notes: m.notes }).eq("id", id).eq("notes", lockedNotes).select("id");
    if (undo.error || undo.data?.length !== 1) throw new Error("수납 실패 후 잠금 복구 확인이 필요합니다. 다시 결제하지 말고 관리자에게 알려주세요.");
    throw error;
  }
}
