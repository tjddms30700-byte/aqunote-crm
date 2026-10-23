import type {PrivateDebt} from "@/lib/privateFinance";
export function orderedDebts(debts:PrivateDebt[]) {
 return [...debts].sort((a,b)=>(a.repayment_priority||100)-(b.repayment_priority||100)||Number(a.debt_group==="contract")-Number(b.debt_group==="contract")||a.creditor.localeCompare(b.creditor,"ko"));
}
export function priorityGroups(debts:PrivateDebt[]) {
 const levels=Array.from(new Set(debts.filter(d=>Number(d.repayment_priority)>0).map(d=>Number(d.repayment_priority)))).sort((a,b)=>a-b);
 return levels.map(priority=>{const rows=orderedDebts(debts.filter(d=>d.repayment_priority===priority));const unknown=rows.filter(d=>d.balance_confirmed===false).length;const balance=rows.filter(d=>d.balance_confirmed!==false).reduce((a,d)=>a+Number(d.balance),0);return {priority,rows,unknown,balance,complete:unknown===0&&balance===0};});
}
export function nextPriorityGroup(debts:PrivateDebt[]) {return priorityGroups(debts).find(g=>!g.complete)||null;}
