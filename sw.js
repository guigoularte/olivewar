// Service worker do Oliver (PWA).
// Estratégia: arquivos do app = network-first (sempre pega a versão nova; cai no cache offline);
// CDNs (Tailwind, Font Awesome, Chart.js, SDK do Firebase, fontes) = cache-first;
// APIs do Firebase (Firestore/Auth) = passam direto, nunca são cacheadas.
const CACHE = "oliver-v3";

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

    // Mídia estática pesada (vídeo do splash, etc.): cache-first (baixa 1x só).
    if (url.origin === self.location.origin && /\.(mp4|webm|ogg|mov)$/i.test(url.pathname)) {
        e.respondWith(
            caches.match(req).then((m) => m || fetch(req).then((r) => {
                // Só cacheia resposta completa (200); 206/parciais do <video> não podem ir ao Cache.
                if (r && r.status === 200) { const c = r.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)); }
                return r;
            }))
        );
        return;
    }

    if (url.origin === self.location.origin) {
        // Arquivos do app: SEMPRE do servidor (bypass do cache HTTP) = nunca versão antiga;
        // cache só como fallback offline.
        e.respondWith(
            fetch(req.url, { cache: "reload" }).then((r) => {
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
