// ════════════════════════════════════════════
//  sw.js — 旅遊分帳 Pro  Service Worker
//  版本對應 index.html 中的 APP_VER = 'v15.0'
// ════════════════════════════════════════════

const CACHE_NAME  = 'travel-split-v15.0';
const CONFIG_CACHE = 'travel-config-v1';

// 安裝時預快取的靜態資源
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './config.json',
  './icons/favicon-16x16.png',
  './icons/favicon-32x32.png',
  './icons/icon-96x96.png',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/apple-touch-icon.png'
];

// ── INSTALL：預快取所有靜態資源 ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] 預快取失敗（可忽略）:', url, err.message)
          )
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE：清除舊版本快取 ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== CONFIG_CACHE)
          .map(k => {
            console.log('[SW] 清除舊快取:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH：請求攔截策略 ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // ① 外部字型（Google Fonts）— Network First，失敗直接略過
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => new Response('', { status: 408 }))
    );
    return;
  }

  // ② 匯率 API（frankfurter / cdn.jsdelivr）— Network First，失敗回傳 504
  if (url.hostname.includes('frankfurter') ||
      url.hostname.includes('jsdelivr.net') ||
      url.hostname.includes('open.er-api.com') ||
      url.hostname.includes('exchangerate-api.com')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => new Response(JSON.stringify({ error: 'offline' }), {
          status: 504,
          headers: { 'Content-Type': 'application/json' }
        }))
    );
    return;
  }

  // ③ config.json — Network First，有網路則更新快取，離線用快取版
  if (url.pathname.endsWith('config.json')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CONFIG_CACHE).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(cached =>
            cached || new Response(JSON.stringify({
              pricing: {
                traveler: { price: 30, period: '14天' },
                globe: { price: 199, period: '一年', original: 299 }
              }
            }), { headers: { 'Content-Type': 'application/json' } })
          )
        )
    );
    return;
  }

  // ④ 同源資源（index.html、manifest、icons）— Cache First，快取沒有再抓網路
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          // 只快取 2xx 回應
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // 任何同源 HTML 請求離線時，回傳快取的 index.html
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
    );
    return;
  }

  // ⑤ 其他所有請求 — 直接通過（不快取）
  event.respondWith(fetch(event.request).catch(() => new Response('', { status: 408 })));
});
