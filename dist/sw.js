// Dali Court Offline Service Worker
const CACHE_NAME = 'dali-court-offline-v2';

// 預先快取核心資源
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg'
];

// 安裝 Service Worker 並快取基礎頁面
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 正在建立離線快取...');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 啟動階段清理舊版快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => {
          console.log('[SW] 清理舊快取:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 攔截請求：快取優先 (Cache First)，若有網路則動態更新快取
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 僅處理 GET 請求與同源資源
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // 背景嘗試更新快取
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, networkResponse.clone());
            });
          }
        }).catch(() => {
          // 離線時忽略網路失敗
        });

        return cachedResponse;
      }

      // 快取中沒有，透過網路獲取並寫入快取
      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // 若為頁面跳轉且離線，回退到快取的首頁
        if (request.mode === 'navigate') {
          return caches.match('/index.html') || caches.match('/');
        }
      });
    })
  );
});
