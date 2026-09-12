const CACHE_NAME = 'plas-wms-v5.21.0-warehouse-complete';
const ASSETS_TO_CACHE = [
    './operations-ux.js',
    './operations-ux.css',
    './pastel-workspace.css',
    './pastel-workspace.js',
    './assets/login-warehouse-v520.png',
    './workspace-pages.js',
    './workspace-pages.css',
    './warehouse-refresh.css',
    './warehouse-ui.js',
    './warehouse-layout.css',
    './assets/warehouse-run-24.webp',
    './assets/warehouse-scan-24.webp',
    './assets/warehouse-sign-24.webp',
    './assets/warehouse-scene.webp',
    './',
    './index.html',
    './ax-copy-import.js',
    './script.js',
    './notewall-v47-last-hardfix.js',
    './features-v3.js',
    './features-v4.js',
    './intern-system.js',
    './role-system.js',
    './style.css',
    './role-themes.css',
    './tailwind-built.css',
    './plas-production-ui.css',
    './topup-sticker-printer.css',
    './topup-sticker-printer.js',
    './topup-production-v570.js',
    './topup-production-v570.css',
    './label-print-workflow.js',
    './label-print-workflow.css',
    './receiving-bulk-written.js',
    './receiving-bulk-written.css',
    './receiving-ui-v5140.js',
    './receiving-ui-v5140.css',
    './academy-league.js',
    './academy-league.css',
    './plas-game-bridge.js',
    './plas-game-bridge.css',
    './supervisor-operations.js',
    './supervisor-operations.css',
    './assets/academy/rank-1-3d.png',
    './assets/academy/rank-2-3d.png',
    './assets/academy/rank-3-3d.png',
    './assets/academy/rank-4-3d.png',
    './assets/academy/rank-5-3d.png',
    './assets/academy/rank-6-3d.png',
    './assets/academy/exp.png',
    './assets/academy/points.png',
    './assets/academy/token.png',
    './assets/academy/gem.png',
    './fzone-bridge.js',
    './fzone-module.js',
    './fzone-topup-integration.js',
    './fzone.css',
    './vendor/phosphor-icons/regular/style.css',
    './vendor/phosphor-icons/regular/phosphor.woff2',
    './vendor/phosphor-icons/fill/style.css',
    './vendor/phosphor-icons/fill/phosphor-fill.woff2',
    './assets/fonts/sarabun-thai-400-normal.woff2',
    './assets/fonts/sarabun-latin-400-normal.woff2',
    './assets/fonts/sarabun-thai-600-normal.woff2',
    './assets/fonts/sarabun-latin-600-normal.woff2',
    './assets/fonts/sarabun-thai-700-normal.woff2',
    './assets/fonts/sarabun-latin-700-normal.woff2',
    './assets/fonts/nunito-latin-700.woff2',
    './manifest.json',
    './icon-192x192.png',
    './icon-512x512.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            // กัน install ล้มทั้งชุดถ้าไฟล์ใดไฟล์หนึ่งโหลดไม่ได้
            Promise.allSettled(ASSETS_TO_CACHE.map((u) => cache.add(u)))
        )
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => Promise.all(
            keyList.map((key) => { if (key !== CACHE_NAME) return caches.delete(key); })
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;

    // สำคัญ: อย่ายุ่งกับ request ที่ไม่ใช่ same-origin
    // ปล่อยให้ browser จัดการ CDN (Tailwind, Firebase, fonts ฯลฯ) เองตามปกติ
    // การ respondWith() กับ cross-origin คือต้นเหตุของ
    //   "Failed to convert value to 'Response'" และทำให้ CDN โหลดไม่ได้
    let sameOrigin = false;
    try { sameOrigin = new URL(req.url).origin === self.location.origin; } catch (e) {}
    if (!sameOrigin) {
        return; // ไม่ respondWith -> browser ทำ network ปกติ
    }

    if (req.method !== 'GET') {
        return;
    }

    // Same-origin GET: network-first พร้อม cache fallback
    event.respondWith(
        fetch(req)
            .then((response) => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
                }
                return response;
            })
            .catch(() =>
                caches.match(req).then((cached) =>
                    cached || new Response('', { status: 504, statusText: 'Offline' })
                )
            )
    );
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
