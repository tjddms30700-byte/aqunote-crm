import { supabase } from "@/lib/supabase";

export type PrivateDebt = { id: string; creditor: string; principal: number; balance: number; monthly_target: number; due_date: string | null; balance_confirmed?: boolean; notes?: string; repayment_priority?: number | null; debt_group?: "priority" | "contract" | "other"; monthly_obligation?: number; known_monthly_principal?: number | null; known_monthly_interest?: number | null; principal_is_opening_balance?: boolean };
export type PrivateEntry = { flow: "income" | "expense" | "capital_in" | "capital_out"; amount: number; is_fixed: boolean; category: string; transaction_id: string };
export type PrivateTransaction = { id: string; kind: string; amount: number; occurred_on: string; category: string; note: string; debt_id: string | null; voided_at: string | null; void_reason?: string };
export type PrivateSnapshot = { debts: PrivateDebt[]; entries: PrivateEntry[]; transactions: PrivateTransaction[]; approved_center_amount: number; center_used: number; advance_balance: number; loan_balance: number };
export const PRIVATE_INCOME_CATEGORIES = ["센터 급여", "외부 자문/강의", "기타 수입"];
export const PRIVATE_EXPENSE_CATEGORIES = ["주거/생활비", "보험/저축", "개인 카드값", "기타 개인 지출"];
export const PERSONAL_KIND_LABELS: Record<string,string> = { income: "개인 수입", expense: "개인 지출", personal_repay: "개인 자금으로 채무 상환", center_pay_debt: "센터에서 개인 채무 대납", center_pay_personal: "센터에서 대표 개인 지출", center_withdrawal: "대표 가지급금 인출", owner_injection: "대표 가수금 입금", owner_return_advance: "대표 가지급금 회수", center_return_loan: "대표 가수금 상환" };
export const won = (n: unknown) => Number(n || 0).toLocaleString("ko-KR") + "원";
export function koreaToday() { return new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); }

// 기존 클라이언트의 anon Authorization 고정 헤더를 이 RPC에서만 세션 JWT로 교체합니다.
// 개인 정보나 세션 토큰은 localStorage/console/센터 CSV에 별도로 보관하지 않습니다.
export async function privateFinanceRpc(name: string, args: Record<string,unknown> = {}) {
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !data.session?.access_token) throw new Error("대표 계정으로 로그인해야 합니다. 다시 로그인해주세요.");
  const { data: result, error } = await supabase.rpc(name, args).setHeader("Authorization", `Bearer ${data.session.access_token}`);
  if (error) {
    if (["PGRST202", "42P01", "3F000", "42883"].includes(error.code)) throw new Error("개인 재무 DB 설치가 필요합니다. 동봉된 v3.77.1 SQL을 먼저 실행해주세요.");
    throw new Error(error.message || "개인 재무 요청에 실패했습니다.");
  }
  return result;
}
export function debtEstimate(debt: Pick<PrivateDebt,"balance"|"monthly_target">, today = koreaToday()) {
  const balance = Number(debt.balance), target = Number(debt.monthly_target);
  if (balance <= 0) return { months: 0, month: "완제", days: 0 };
  if (target <= 0) return null;
  const months = Math.ceil(balance / target);
  // 만기 계산 범위 밖이면 잘못된 날짜를 표시하지 않습니다.
  if (months > 1200) return { months, month: "100년 초과", days: null };
  const [y,m,d] = today.split("-").map(Number);
  const finish = new Date(Date.UTC(y, m - 1 + months, 0));
  return { months, month: `${finish.getUTCFullYear()}-${String(finish.getUTCMonth()+1).padStart(2,"0")}`, days: Math.max(0, Math.ceil((finish.getTime() - Date.UTC(y,m-1,d)) / 86400000)) };
}
export function privateKpis(s: PrivateSnapshot, today = koreaToday()) {
  const sum = (fn: (e: PrivateEntry)=>boolean) => s.entries.filter(fn).reduce((a,e)=>a+Number(e.amount),0);
  const income = sum(e=>e.flow==="income"), fixed = sum(e=>e.flow==="expense" && e.is_fixed);
  const net = income-fixed, availableCenter = Math.max(0, Number(s.approved_center_amount)-Number(s.center_used));
  const unconfirmedDebts=s.debts.filter(d=>d.balance_confirmed===false).length;
  const declaredPrincipal=s.debts.reduce((a,d)=>a+Number(d.principal||0),0);
  const active = s.debts.filter(d=>d.balance_confirmed!==false&&Number(d.balance)>0), estimates = active.map(d=>debtEstimate(d,today));
  const finish = unconfirmedDebts>0 || estimates.some(e=>e===null) ? null : estimates.reduce<ReturnType<typeof debtEstimate>>((a,e)=>!a || (e && e.months>a.months) ? e : a,{months:0,month:"완제",days:0});
  return { unconfirmedDebts, declaredPrincipal, income, fixed, net, availableCenter, available:net+availableCenter, debtBalance:active.reduce((a,d)=>a+Number(d.balance),0), monthlyTarget:active.reduce((a,d)=>a+Number(d.monthly_target),0), finish,
    cashFlow:sum(e=>e.flow==="income"||e.flow==="capital_in")-sum(e=>e.flow==="expense"||e.flow==="capital_out") };
}
export function safeCsv(rows: unknown[][]) {
  return "\uFEFF" + rows.map(row=>row.map(cell=>{
    let s=String(cell??""); if (/^[\s]*[=+\-@\t\r]/.test(s)) s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  }).join(",")).join("\r\n");
}
export async function centerFundRows(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("조회 월을 확인해주세요.");
  return ((await privateFinanceRpc("pf_center_read", {p_month:month+"-01"}))?.rows || []) as any[];
}
export const PRIVATE_FINANCE_EVENT = "aqunote-private-finance-changed";
