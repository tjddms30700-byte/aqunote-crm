const CACHE='aqunote-pwa-static-v3790';
const SAFE=['/offline.html','/pwa-icons/icon-192.png','/pwa-icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SAFE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('aqunote-pwa-static-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin)return;
 if(SAFE.includes(u.pathname)){e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));return;}
 if(e.request.mode==='navigate'){e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match('/offline.html')));}
 // 그 밖의 HTML/API/회원/일지/사진/재무/위치는 캐시하지 않습니다.
});