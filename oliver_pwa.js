// PWA do Oliver: injeta o manifesto/ícones e registra o service worker em qualquer página.
(function () {
    function temSeletor(sel) { return !!document.querySelector(sel); }
    function add(tag, attrs) {
        var el = document.createElement(tag);
        for (var k in attrs) el.setAttribute(k, attrs[k]);
        (document.head || document.documentElement).appendChild(el);
    }
    if (!temSeletor('link[rel="manifest"]')) add("link", { rel: "manifest", href: "manifest.json" });
    if (!temSeletor('meta[name="theme-color"]')) add("meta", { name: "theme-color", content: "#f97316" });
    if (!temSeletor('link[rel="apple-touch-icon"]')) add("link", { rel: "apple-touch-icon", href: "icons/icon-180.png" });
    if (!temSeletor('meta[name="apple-mobile-web-app-capable"]')) add("meta", { name: "apple-mobile-web-app-capable", content: "yes" });
    if (!temSeletor('meta[name="apple-mobile-web-app-status-bar-style"]')) add("meta", { name: "apple-mobile-web-app-status-bar-style", content: "default" });

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", function () {
            navigator.serviceWorker.register("sw.js").catch(function (e) { console.warn("SW não registrado:", e && e.message); });
        });
    }
})();
