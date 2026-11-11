'use client';
import Link from 'next/link';
import {Bot} from 'lucide-react';
import {useOfficeAccess} from '@/lib/useOfficeAccess';
export default function OfficeNavLink(){const {context}=useOfficeAccess();if(!context)return null;return <Link href="/office" aria-label="AI 오피스 관리자 관제실" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:text-sky-700"><Bot className="h-4 w-4" aria-hidden="true"/><span>AI 오피스</span></Link>;}
