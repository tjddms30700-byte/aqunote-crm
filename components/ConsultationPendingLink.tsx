"use client";
import Link from 'next/link';
import {useConsultationPendingBadge} from '@/lib/useConsultationPendingBadge';
export default function ConsultationPendingLink(){
 const {count,error}=useConsultationPendingBadge();
 if(count===0)return null;
 return <Link href="/consultations?pending=1" aria-label={error?'신규 문의 집계 확인 필요':count===null?'신규 문의 조회 중':`신규 문의 미응대 ${count}건 확인`} title={error||'상담·매칭 관리와 동일한 신규 문의(미응대) 집계'} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:border-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600">
  <span>신규 문의(미응대)</span><span aria-live="polite" className="rounded bg-sky-50 px-1.5 text-sky-700">{error?'!':count===null?'…':count}</span>
 </Link>;
}
