const CACHE='fuel-pro-anp-beta-v10-community-public';
const ASSETS=['./','./index.html','./app.js?v=20261015r3','./station_search.js','./community_feedback.js','./firebase_config.js?v=20261015r2','./firebase_reports.js','./community_public.js?v=1','./style.css?v=20261015r3','./dados.json','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('fuel-pro-anp-beta-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/__/'))return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request).then(r=>r||Response.error())));
});
