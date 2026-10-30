"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {CalendarDays,Users,ClipboardCheck,LayoutDashboard} from "lucide-react";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
export default function MobileAppShell(){const path=usePathname();const [signed,setSigned]=useState(false);
 useEffect(()=>{let live=true;void supabase.auth.getSession().then(({data})=>{if(live)setSigned(!!data.session);});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>setSigned(!!session));return()=>{live=false;subscription.unsubscribe();};},[]);
 const hidden=['/login','/apply-child','/apply-adult','/contract-sign','/consultation'].some(p=>path===p||path.startsWith(p+'/'));const visible=signed&&!hidden;
 useEffect(()=>{document.body.classList.toggle('aqu-mobile-shell',visible);return()=>document.body.classList.remove('aqu-mobile-shell');},[visible]);
 if(!visible)return null;const items=[{href:'/schedule',label:'일정',icon:CalendarDays},{href:'/members',label:'회원',icon:Users},{href:'/attendance',label:'출결',icon:ClipboardCheck},{href:'/dashboard',label:'대시보드',icon:LayoutDashboard}];
 return <nav aria-label="앱 하단 메뉴" className="aqu-mobile-nav fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white/95 shadow-lg backdrop-blur lg:hidden" style={{paddingBottom:'max(env(safe-area-inset-bottom), 8px)'}}>{items.map(({href,label,icon:Icon})=><Link key={href} href={href} aria-current={path===href||path.startsWith(href+'/')?'page':undefined} onClick={()=>window.dispatchEvent(new Event('aqunote-native-tap'))} className={"flex min-h-[60px] flex-col items-center justify-center gap-1 px-1 pt-2 text-[11px] font-semibold "+(path===href||path.startsWith(href+'/')?'text-sky-700':'text-slate-500')}><Icon className="h-5 w-5" />{label}</Link>)}</nav>;
}
