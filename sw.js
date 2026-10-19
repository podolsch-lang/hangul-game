// 한글 놀이터 service worker
// 화면·매니페스트·목소리 목록·버전 파일은 네트워크를 먼저 본다(최대 3초). 안 되면 저장본.
// 그림과 소리 파일은 저장본을 먼저 쓴다. 인터넷이 없어도 이어서 놀 수 있다.
// 버전 숫자는 version.js 의 APP_VERSION 한 곳만 고친다.
importScripts('./version.js');
const CACHE = 'hangul-game-' + self.APP_VERSION;
const CORE = ['./', './index.html', './version.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-512-maskable.png', './icons/apple-touch-icon.png', './audio/index.json'];
const NET_MS = 3000;

function isShell(req) {
  if (req.mode === 'navigate') return true;
  let path = '';
  try { path = new URL(req.url).pathname; } catch (e) { return false; }
  return /\/(?:index\.html|version\.js|manifest\.json)$/.test(path) || /\/audio\/index\.json$/.test(path);
}

function offline() {
  return new Response('오프라인이에요', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function putOk(cache, key, res) {
  try {
    if (res && res.ok && res.status === 200) await cache.put(key, res.clone());
  } catch (e) {}
}

function fromNetwork(req, cache, key) {
  return fetch(req).then(res => {
    putOk(cache, key, res);
    return res;
  }).catch(() => null);
}

async function networkFirst(cache, req, key) {
  const cachedP = cache.match(key, { ignoreSearch: true });
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve('timeout'), NET_MS); });
  const net = fromNetwork(req, cache, key);
  const winner = await Promise.race([net.then(r => ({ r })), timeout]);
  clearTimeout(timer);
  if (winner !== 'timeout' && winner.r && winner.r.ok) return winner.r;
  const cached = await cachedP;
  if (cached) return cached;
  const res = winner === 'timeout' ? await net : winner.r;
  return (res && (res.ok || res.status)) ? res : offline();
}

const handlesUpdate = new Set();

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    try {
      const j = await (await c.match('./audio/index.json')).json();
      const files = [...new Set(Object.values(j.phrases || {}))].map(f => './audio/' + f);
      for (let i = 0; i < files.length; i += 40) await Promise.all(files.slice(i, i + 40).map(f => c.add(f).catch(() => {})));
    } catch (err) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const old = keys.filter(k => k.startsWith('hangul-game-') && k !== CACHE);
    await Promise.all(old.map(k => caches.delete(k)));
    await self.clients.claim();
    // v4 화면은 controllerchange를 듣지 않는다. 예전 캐시가 있으면 그 화면만 한 번 다시 연다.
    // v5 이후 화면은 CLIENT_HANDLES_UPDATE를 보내므로 여기서 또 열지 않는다.
    if (!old.length) return;
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const ids = clients.map(c => c.id);
    await new Promise(r => setTimeout(r, 800));
    // navigate()를 기다리면 activate가 끝나기 전에 그 탐색의 fetch가 막혀 멈춘다.
    await Promise.all(ids.map(async id => {
      if (handlesUpdate.has(id)) return;
      const c = await self.clients.get(id);
      if (!c || !c.url || typeof c.navigate !== 'function') return;
      c.navigate(c.url).catch(() => {});
    }));
  })());
});

self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data.type === 'CLIENT_HANDLES_UPDATE' && e.source && e.source.id) handlesUpdate.add(e.source.id);
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return;
  const key = req.mode === 'navigate' ? './index.html' : req;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (isShell(req)) return networkFirst(cache, req, key);
    const cached = await cache.match(key, { ignoreSearch: true });
    if (cached) {
      e.waitUntil(fromNetwork(req, cache, key));
      return cached;
    }
    return (await fromNetwork(req, cache, key)) || offline();
  })());
});
