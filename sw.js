/* Service worker: lets the app open offline and be installed on phones.
   Network-first: when online you always get the newest files (no stale updates);
   when offline the last copy is used. Your data is never stored here — it stays
   encrypted in IndexedDB. */
const CACHE = 'ledger-shell-v53';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/utils.js', './js/store.js', './js/charts.js', './js/reports.js', './js/importer.js', './js/labels.js', './js/print.js', './js/dash.js', './js/guide.js', './js/ext-core.js', './js/ext-sales.js', './js/ext-stock.js', './js/ext-photos.js', './js/ext-tools.js', './js/ext-fun.js', './js/ext-voice.js', './js/ext-joy.js', './js/ext-invoice.js', './js/ext-quickadd.js', './lib/jspdf.umd.min.js', './js/celebrate.js', './js/cloud-sync.js', './firebase-config.js', './js/app.js',
  './lib/exceljs.min.js', './lib/firebase/firebase-app-compat.js', './lib/firebase/firebase-auth-compat.js', './lib/firebase/firebase-firestore-compat.js', './lib/qrcode.js', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/brand-mark.png', './icons/favicon-64.png', './fonts/pacifico.woff2'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return; // Firebase / Google go straight to the network
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html')))
  );
});
