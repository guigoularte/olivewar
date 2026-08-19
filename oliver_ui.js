// UI compartilhada do Oliver: layout desktop (sidebar) + rodapé de crédito/contato.
(function () {
    // ---- Estilos do modo desktop (>=1024px) ----
    var css = `
    .oliver-sidebar{display:none;}
    @media (min-width:1024px){
      body.oliver-dt{align-items:stretch !important;justify-content:flex-start !important;background:#FBF7F0 !important;}
      body.oliver-dt > .oliver-card{
        max-width:920px !important;width:100% !important;flex:0 0 auto !important;
        min-height:100vh !important;border:0 !important;border-radius:0 !important;
        box-shadow:none !important;background:#FBF7F0 !important;
      }
      body.oliver-dt .border-t.px-8{display:none !important;}
      body.oliver-dt .oliver-hide-dt{display:none !important;}
      body.oliver-dt .px-6.mt-6.space-y-4{display:grid !important;grid-template-columns:repeat(2,minmax(0,1fr)) !important;gap:1rem !important;}
      body.oliver-dt .px-6.mt-6.space-y-4 > *{margin-top:0 !important;}
      .oliver-sidebar{display:flex !important;}
    }`;

    var LINKS = [
        { href: "app.html", label: "Início", icon: "🏠", always: true },
        { href: "relatorios.html", label: "Escrever Relatórios", icon: "✍️", key: "relatorios", padrao: false },
        { href: "itens_resolver.html", label: "Itens para Resolver", icon: "✅", key: "itensResolver", padrao: true },
        { href: "relatorios_view.html", label: "Relatórios", icon: "📄", key: "relatoriosHistorico", padrao: true },
        { href: "fluxo_caixa.html", label: "Fluxo de Caixa", icon: "💵", key: "fluxoCaixa", padrao: true },
        { href: "produtos.html", label: "Produtos/Serviços", icon: "📦", key: "produtos", padrao: true },
        { href: "vendas.html", label: "Vendas", icon: "📈", key: "vendas", padrao: true },
        { href: "calculo_margem.html", label: "Cálculo de Margem", icon: "🧮", key: "calculoMargem", padrao: false },
        { href: "cvl.html", label: "Margem Completo", icon: "📊", key: "cvlCompleto", padrao: false },
        { href: "admin.html", label: "Painel Master", icon: "🛡️", master: true },
        { href: "perfil.html", label: "Perfil", icon: "👤", always: true },
        { href: "configuracoes.html", label: "Configurações", icon: "⚙️", always: true }
    ];

    function perms() {
        try { return JSON.parse(localStorage.getItem("oliverPerms")) || { master: false, func: {} }; }
        catch (e) { return { master: false, func: {} }; }
    }
    function podeVer(l, p) {
        if (l.always) return true;
        if (l.master) return !!p.master;
        if (l.key) return p.master || ((l.key in (p.func || {})) ? p.func[l.key] : l.padrao);
        return true;
    }

    function montarSidebar() {
        var p = perms();
        var atual = (location.pathname.split("/").pop() || "app.html");
        var nome = localStorage.getItem("oliverNome") || "Usuário";

        var aside = document.createElement("aside");
        aside.className = "oliver-sidebar";
        aside.style.cssText =
            "width:256px;flex-shrink:0;position:sticky;top:0;height:100vh;color:#fff;flex-direction:column;" +
            "background:linear-gradient(to bottom,#f97316,#f59e0b);";

        var links = LINKS.filter(function (l) { return podeVer(l, p); }).map(function (l) {
            var ativo = (l.href === atual);
            return '<a href="' + l.href + '" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:12px;' +
                'font-size:14px;font-weight:600;text-decoration:none;color:#fff;margin-bottom:2px;' +
                (ativo ? "background:rgba(255,255,255,.22);" : "") + '" ' +
                'onmouseover="this.style.background=\'rgba(255,255,255,.12)\'" ' +
                'onmouseout="this.style.background=\'' + (ativo ? "rgba(255,255,255,.22)" : "transparent") + '\'">' +
                '<span>' + l.icon + '</span>' + l.label + '</a>';
        }).join("");

        aside.innerHTML =
            '<div style="padding:22px 20px;display:flex;align-items:center;gap:12px;border-bottom:1px solid rgba(255,255,255,.2)">' +
                '<div style="width:40px;height:40px;background:rgba(255,255,255,.2);border-radius:14px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:20px">O</div>' +
                '<span style="font-size:22px;font-weight:900;letter-spacing:-.5px">Oliver</span>' +
            '</div>' +
            '<nav style="flex:1;overflow-y:auto;padding:14px 12px">' + links + '</nav>' +
            '<div style="padding:14px 16px;border-top:1px solid rgba(255,255,255,.2);display:flex;align-items:center;gap:10px">' +
                '<div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-weight:700">' + (nome[0] || "U").toUpperCase() + '</div>' +
                '<div style="font-size:12px;line-height:1.2"><div style="font-weight:700">' + nome + '</div>' +
                '<a href="#" id="oliver-sair" style="color:rgba(255,255,255,.85);text-decoration:none">Sair</a></div>' +
            '</div>';

        document.body.insertBefore(aside, document.body.firstChild);

        var sair = document.getElementById("oliver-sair");
        if (sair) sair.addEventListener("click", async function (e) {
            e.preventDefault();
            try {
                var m = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
                await m.signOut(m.getAuth());
            } catch (err) { /* ignora */ }
            localStorage.removeItem("oliverPerms");
            location.href = "login.html";
        });
    }

    function aplicarModo() {
        document.body.classList.toggle("oliver-dt", window.innerWidth >= 1024);
    }

    document.addEventListener("DOMContentLoaded", function () {
        var style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);

        // Marca o cartão principal (a "moldura")
        var card = document.querySelector('body > div[class*="max-w-sm"], body > div[class*="max-w-none"]');
        if (card) card.classList.add("oliver-card");

        // Sidebar só nas telas internas (não no login/boas-vindas)
        var pagina = (location.pathname.split("/").pop() || "app.html");
        var semSidebar = (pagina === "login.html" || pagina === "index.html" || pagina === "");
        if (card && !semSidebar) {
            montarSidebar();
            aplicarModo();
            window.addEventListener("resize", aplicarModo);
        }

        // ---- Rodapé: crédito + WhatsApp ----
        var msg = "Olá Guilherme! Vim pelo app Oliver e gostaria de falar com você.";
        var wa = "https://wa.me/5551989286351?text=" + encodeURIComponent(msg);
        var credito = document.createElement("div");
        credito.style.cssText = "text-align:center;padding:7px 10px;font-size:10px;line-height:1.5;color:#9aa0a6;";
        credito.innerHTML =
            'Desenvolvido por Guilherme Goularte<br>' +
            '<a href="' + wa + '" target="_blank" rel="noopener" ' +
            'style="display:inline-flex;align-items:center;gap:4px;margin-top:2px;color:#16a34a;font-weight:600;text-decoration:none;">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.157 5.335 5.494 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.615zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.767.967-.94 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>' +
            'Fale conosco no WhatsApp</a>';

        var nav = document.querySelector(".border-t.px-8");
        if (nav && nav.parentElement) nav.parentElement.insertBefore(credito, nav);
        else if (card) card.appendChild(credito);
        else document.body.appendChild(credito);
    });
})();
