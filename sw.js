// Service worker do Oliver (PWA).
// Estratégia: arquivos do app = network-first (sempre pega a versão nova; cai no cache offline);
// CDNs (Tailwind, Font Awesome, Chart.js, SDK do Firebase, fontes) = cache-first;
// APIs do Firebase (Firestore/Auth) = passam direto, nunca são cacheadas.
const CACHE = "oliver-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then((ks) => Promise.all(ks.map((k) => (k !== CACHE ? caches.delete(k) : null))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (e) => {
    const req = e.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);

    // Nunca cachear chamadas de API (Firestore/Auth/Realtime)
    if (/googleapis\.com$/.test(url.hostname) || /firebaseio|firebasedatabase|identitytoolkit/.test(url.hostname)) return;

    if (url.origin === self.location.origin) {
        // Arquivos do app: network-first (fresco), cache como fallback offline
        e.respondWith(
            fetch(req).then((r) => {
                if (r && r.ok) { const c = r.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)); }
                return r;
            }).catch(() => caches.match(req).then((m) => m || caches.match("app.html")))
        );
    } else {
        // CDNs e SDKs (versionados/estáveis): cache-first
        e.respondWith(
            caches.match(req).then((m) => m || fetch(req).then((r) => {
                if (r && r.ok) { const c = r.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)); }
                return r;
            }))
        );
    }
});
