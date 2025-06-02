// sw.js - Service Worker
const CACHE_NAME = 'bjj-diary-cache-v1.2'; // キャッシュ名を変更すると新しいSWがインストールされます
const urlsToCache = [
  './', // ルートパス (index.htmlを指すことが多い)
  './index.html',
  // 注意: Tailwind CSSやFontAwesomeのようなCDN経由のリソースは、
  // このシンプルなService Workerでは積極的にキャッシュしていません。
  // Firebase SDKも同様に、ブラウザキャッシュやSDK自体のオンライン/オフライン挙動に任せています。
  // このService Workerは主にアプリの「シェル」（HTML本体）をキャッシュします。
];

// installイベント: アプリのシェル（基本的なファイル）をキャッシュに保存します
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Opened cache:', CACHE_NAME);
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.error('[SW] Failed to cache urls:', err);
      })
  );
});

// fetchイベント: リクエストを傍受し、キャッシュにあればキャッシュから、なければネットワークから返します
self.addEventListener('fetch', (event) => {
  // GETリクエスト以外はキャッシュ対象外 (Firebase通信などはPOSTが多い)
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Firebase関連のURLは常にネットワークから取得 (キャッシュを妨害しないように)
  if (event.request.url.includes('firebase') || 
      event.request.url.includes('googleapis.com') || 
      event.request.url.includes('gstatic.com')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // 上記以外の場合、キャッシュ優先戦略
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          // キャッシュにヒットした場合
          // console.log('[SW] Found in cache:', event.request.url);
          return response;
        }
        // キャッシュになかった場合、ネットワークから取得
        // console.log('[SW] Not in cache, fetching from network:', event.request.url);
        return fetch(event.request).then(
          (networkResponse) => {
            // オプション: ネットワークから取得したリソースを動的にキャッシュに追加することも可能
            // (このバージョンでは、インストール時に指定されたものだけをキャッシュ)
            return networkResponse;
          }
        ).catch(error => {
          console.error('[SW] Fetching from network failed:', event.request.url, error);
          // オフラインページなどを返すことも可能
          throw error;
        });
      })
  );
});

// activateイベント: 古いキャッシュを削除します
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  const cacheWhitelist = [CACHE_NAME]; // 有効なキャッシュ名リスト
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            // ホワイトリストに含まれないキャッシュは削除
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // 新しいService Workerがすぐにページをコントロールできるようにする
  return self.clients.claim();
});