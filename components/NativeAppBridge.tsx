"use client";
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Capacitor} from '@capacitor/core';
export default function NativeAppBridge(){const router=useRouter();const [offline,setOffline]=useState(false);
 useEffect(()=>{if(!Capacitor.isNativePlatform())return;let live=true;const handles:{remove:()=>Promise<void>}[]=[];async function keep(p:Promise<any>){const h=await p;if(live)handles.push(h);else await h.remove();}
  void import('@capacitor/app').then(({App})=>{void keep(App.addListener('backButton',({canGoBack})=>{if(canGoBack)window.history.back();else router.push('/schedule');}));void keep(App.addListener('appStateChange',({isActive})=>{if(isActive)window.dispatchEvent(new Event('focus'));}));});
  void import('@capacitor/network').then(async({Network})=>{const s=await Network.getStatus();if(live)setOffline(!s.connected);void keep(Network.addListener('networkStatusChange',s=>{if(live)setOffline(!s.connected);}));});
  const tap=()=>{void import('@capacitor/haptics').then(({Haptics,ImpactStyle})=>Haptics.impact({style:ImpactStyle.Light})).catch(()=>{});};window.addEventListener('aqunote-native-tap',tap);
  return()=>{live=false;handles.forEach(h=>void h.remove());window.removeEventListener('aqunote-native-tap',tap);};
 },[router]);
 return offline?<div role="status" className="fixed inset-x-0 top-0 z-[100] bg-amber-100 p-3 text-center text-sm text-amber-950">인터넷 연결이 없습니다. 연결 상태를 확인한 뒤 저장해주세요.</div>:null;
}
