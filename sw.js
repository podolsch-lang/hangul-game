// 한글 놀이터 service worker: 인터넷 없이도 열리도록 파일을 저장해 둠
const CACHE = 'hangul-game-v3';
const CORE = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-512-maskable.png', './icons/apple-touch-icon.png', './audio/index.json'];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    // 선생님 녹음 목소리도 미리 저장 (실패해도 게임은 동작)
    try {
      const j = await (await c.match('./audio/index.json')).json();
      const files = [...new Set(Object.values(j.phrases))].map(f => './audio/' + f);
      for (let i = 0; i < files.length; i += 40) await Promise.all(files.slice(i, i + 40).map(f => c.add(f).catch(() => {})));
    } catch (err) {}
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 저장본을 먼저 보여 주고(빠름·오프라인), 뒤에서 새 버전을 받아 다음 실행에 반영
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const key = req.mode === 'navigate' ? './index.html' : req;
    const cached = await cache.match(key, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res && res.ok && res.status === 200) cache.put(key, res.clone()); return res; }).catch(() => null);
    if (cached) { e.waitUntil(net); return cached; }
    return (await net) || new Response('오프라인이에요', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }));
});
