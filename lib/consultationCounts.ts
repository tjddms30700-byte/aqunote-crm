/** Same source as the consultations summary: new stage and no first contact. */
export function consultationPendingCount(snapshot:any):number {
 const n=snapshot?.ops?.unanswered;
 if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0)throw new Error('신규 문의(미응대) 집계를 확인하지 못했습니다.');
 return n;
}
