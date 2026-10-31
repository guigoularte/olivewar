// UI compartilhada do Oliver: layout desktop (sidebar "cockpit" escura) + rodapé.
// Roda em todas as telas internas; os links e as permissões (podeVer) valem para
// todos os perfis (master, consultoria, cliente). Visual alinhado ao cockpit.
(function () {
    // ---- Estilos do modo desktop (>=1024px) ----
    var css = `
    .oliver-sidebar{display:none;}
    @media (min-width:1024px){
      body.oliver-dt{align-items:stretch !important;justify-content:flex-start !important;background:#f1f5f9 !important;}
      body.oliver-dt > .oliver-card{
        max-width:1100px !important;width:100% !important;flex:0 0 auto !important;
        min-height:100vh !important;border:0 !important;border-radius:0 !important;
        box-shadow:none !important;background:#f1f5f9 !important;
      }
      body.oliver-dt .border-t.px-8{display:none !important;}
      body.oliver-dt .oliver-hide-dt{display:none !important;}
      body.oliver-dt .px-6.mt-6.space-y-4{display:grid !important;grid-template-columns:repeat(2,minmax(0,1fr)) !important;gap:1rem !important;}
      body.oliver-dt .px-6.mt-6.space-y-4 > *{margin-top:0 !important;}
      .oliver-sidebar{display:flex !important;}
    }
    .oliver-mascote{position:fixed;right:16px;bottom:16px;z-index:60;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-family:Inter,system-ui,sans-serif;}
    .oliver-mascote-btn{width:88px;background:none;border:0;cursor:pointer;padding:0;transition:transform .15s;filter:drop-shadow(0 8px 12px rgba(0,0,0,.2));}
    .oliver-mascote-btn:hover{transform:scale(1.05);}
    .oliver-mascote-btn img{width:100%;height:auto;display:block;pointer-events:none;}
    .oliver-balao{max-width:240px;background:#fff;border:1px solid #e2e8f0;box-shadow:0 12px 30px rgba(0,0,0,.14);border-radius:16px;padding:12px 14px;position:relative;}
    .oliver-balao-x{position:absolute;top:6px;right:9px;color:#94a3b8;font-size:14px;background:none;border:0;cursor:pointer;}
    @media (max-width:1023px){.oliver-mascote{bottom:78px;right:12px;}.oliver-mascote-btn{width:58px;}}`;

    // Links: sec = seção (null = topo). icon = Font Awesome. Mantém as regras de permissão.
    var LINKS = [
        { href: "app.html", label: "Cockpit Principal", icon: "fa-compass", always: true, sec: null },

        { href: "dashboard.html", label: "Dashboard", icon: "fa-chart-pie", key: "relatorios", padrao: false, sec: "Gestão" },
        { href: "meus_clientes.html", label: "Meus Clientes", icon: "fa-user-group", consultoria: true, sec: "Gestão" },
        { href: "crm.html", label: "CRM", icon: "fa-handshake", key: "relatorios", padrao: false, sec: "Gestão" },
        { href: "agenda.html", label: "Agenda / Tarefas", icon: "fa-calendar-days", key: "relatorios", padrao: false, sec: "Gestão" },
        { href: "organizacoes.html", label: "Organizações", icon: "fa-sitemap", orgLink: true, sec: "Gestão" },
        { href: "rotinas.html", label: "Rotinas de Gestão", icon: "fa-clipboard-check", orgLink: true, sec: "Gestão" },
        { href: "itens_resolver.html", label: "Itens para Resolver", icon: "fa-list-check", key: "itensResolver", padrao: true, sec: "Gestão" },
        { href: "indicadores.html", label: "Meus Indicadores", icon: "fa-gauge-high", clienteOnly: true, sec: "Gestão" },

        { href: "fluxo_caixa.html", label: "Fluxo de Caixa", icon: "fa-chart-line", key: "fluxoCaixa", padrao: true, sec: "Financeiro & Caixa" },
        { href: "notas.html", label: "Notas & Comprovantes", icon: "fa-receipt", key: "notasFiscais", padrao: false, tag: "OCR em breve", sec: "Financeiro & Caixa" },
        { href: "fechamento.html", label: "Fechamento de Caixa", icon: "fa-cash-register", key: "fechamentoCaixa", padrao: false, sec: "Financeiro & Caixa" },
        { href: "calculo_margem.html", label: "Margens & CMV", icon: "fa-calculator", key: "calculoMargem", padrao: false, sec: "Financeiro & Caixa" },
        { href: "cvl.html", label: "Margem Completo", icon: "fa-chart-column", key: "cvlCompleto", padrao: false, sec: "Financeiro & Caixa" },
        { href: "produtos.html", label: "Produtos / Serviços", icon: "fa-box", key: "produtos", padrao: true, sec: "Financeiro & Caixa" },
        { href: "vendas.html", label: "Vendas", icon: "fa-arrow-trend-up", key: "vendas", padrao: true, sec: "Financeiro & Caixa" },

        { href: "relatorios.html", label: "Escrever Relatórios", icon: "fa-pen-to-square", key: "relatorios", padrao: false, sec: "Relatórios" },
        { href: "relatorios_view.html", label: "Relatórios & DRE", icon: "fa-file-invoice", key: "relatoriosHistorico", padrao: true, sec: "Relatórios" },
        { href: "relatorio_semanal.html", label: "Relatório Semanal", icon: "fa-calendar-week", key: "fechamentoCaixa", padrao: false, sec: "Relatórios" },
        { href: "notas_recebidas.html", label: "Notas Recebidas", icon: "fa-inbox", key: "relatorios", padrao: false, sec: "Relatórios" },

        { href: "admin.html", label: "Painel Master", icon: "fa-shield-halved", master: true, sec: "Sistema" },
        { href: "perfil.html", label: "Perfil", icon: "fa-user", always: true, sec: "Sistema" },
        { href: "configuracoes.html", label: "Configurações", icon: "fa-gear", always: true, sec: "Sistema" }
    ];
    var SECOES = ["Gestão", "Financeiro & Caixa", "Relatórios", "Sistema"];

    function perms() {
        try { return JSON.parse(localStorage.getItem("oliverPerms")) || { master: false, func: {} }; }
        catch (e) { return { master: false, func: {} }; }
    }
    function podeVer(l, p) {
        if (l.always) return true;
        if (l.master) return !!p.master;
        if (l.orgLink) return !!(p.master || (p.func && p.func.relatorios) || p.org);
        if (l.consultoria) return !!(p.master || (p.func && p.func.relatorios));
        if (l.clienteOnly) return !(p.master || (p.func && p.func.relatorios));
        if (l.key) return p.master || ((l.key in (p.func || {})) ? p.func[l.key] : l.padrao);
        return true;
    }

    function linkHTML(l, atual, pendItens) {
        var ativo = (l.href === atual);
        var bg = ativo
            ? "background:#ea580c;color:#fff;box-shadow:0 4px 12px rgba(234,88,12,.3);"
            : "color:#94a3b8;";
        var right = "";
        if (l.href === "itens_resolver.html" && pendItens > 0)
            right = '<span style="margin-left:auto;background:#f43f5e;color:#fff;font-size:10px;font-weight:700;padding:1px 7px;border-radius:999px">' + pendItens + '</span>';
        else if (l.tag)
            right = '<span style="margin-left:auto;background:rgba(16,185,129,.18);color:#34d399;font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px">' + l.tag + '</span>';
        var hover = ativo ? "" :
            ' onmouseover="this.style.background=\'#1e293b\';this.style.color=\'#e2e8f0\'" onmouseout="this.style.background=\'transparent\';this.style.color=\'#94a3b8\'"';
        return '<a href="' + l.href + '"' + hover +
            ' style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;font-size:13px;font-weight:600;text-decoration:none;margin-bottom:2px;' + bg + '">' +
            '<i class="fa-solid ' + l.icon + '" style="width:18px;text-align:center"></i><span>' + l.label + '</span>' + right + '</a>';
    }

    function montarSidebar() {
        var p = perms();
        var atual = (location.pathname.split("/").pop() || "app.html");
        var nome = localStorage.getItem("oliverNome") || "Usuário";
        var pendItens = parseInt(localStorage.getItem("oliverItensPendentes") || "0", 10) || 0;
        var marcaNome = "";
        try { marcaNome = (JSON.parse(localStorage.getItem("oliverBranding") || "{}").nome) || ""; } catch (e) {}

        var visiveis = LINKS.filter(function (l) { return podeVer(l, p); });
        var nav = "";
        // Topo (sem seção)
        visiveis.filter(function (l) { return !l.sec; }).forEach(function (l) { nav += linkHTML(l, atual, pendItens); });
        // Seções
        SECOES.forEach(function (sec) {
            var itens = visiveis.filter(function (l) { return l.sec === sec; });
            if (!itens.length) return;
            nav += '<div style="padding:14px 12px 4px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.07em">' + sec + '</div>';
            itens.forEach(function (l) { nav += linkHTML(l, atual, pendItens); });
        });

        var seletor = marcaNome ? (
            '<div style="padding:12px">' +
              '<div style="background:rgba(30,41,59,.8);border:1px solid rgba(51,65,85,.6);border-radius:12px;padding:10px;display:flex;align-items:center;gap:10px">' +
                '<div style="width:28px;height:28px;border-radius:8px;background:rgba(249,115,22,.2);color:#fb923c;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-store"></i></div>' +
                '<div style="overflow:hidden"><p style="margin:0;color:#fff;font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + marcaNome + '</p><p style="margin:0;color:#34d399;font-size:10px">● Consultoria ativa</p></div>' +
              '</div>' +
            '</div>') : "";

        var aside = document.createElement("aside");
        aside.className = "oliver-sidebar";
        aside.style.cssText =
            "width:256px;flex-shrink:0;position:sticky;top:0;height:100vh;color:#fff;flex-direction:column;" +
            "justify-content:space-between;background:#0f172a;overflow:hidden;font-family:Inter,system-ui,sans-serif;";

        aside.innerHTML =
            '<div style="overflow-y:auto">' +
              '<div style="padding:18px;border-bottom:1px solid #1e293b;display:flex;align-items:center;gap:12px">' +
                '<div style="width:36px;height:36px;border-radius:12px;background:linear-gradient(to top right,#ea580c,#f97316);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:18px">O</div>' +
                '<div><p style="margin:0;color:#fff;font-weight:700;font-size:17px;line-height:1">Oliver</p><p style="margin:2px 0 0;color:#64748b;font-size:10px">Gestão & Caixa</p></div>' +
              '</div>' +
              seletor +
              '<nav style="padding:4px 10px 14px">' + nav + '</nav>' +
            '</div>' +
            '<div style="padding:12px;border-top:1px solid #1e293b;display:flex;align-items:center;gap:10px">' +
              '<div style="width:32px;height:32px;border-radius:10px;background:#334155;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">' + (nome[0] || "U").toUpperCase() + '</div>' +
              '<div style="line-height:1.2"><div style="color:#fff;font-size:12px;font-weight:700">' + nome + '</div>' +
              '<a href="#" id="oliver-sair" style="color:#64748b;font-size:10px;text-decoration:none">Sair</a></div>' +
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

    function waDaConsultoria() {
        var tel = "";
        try { tel = (JSON.parse(localStorage.getItem("oliverBranding") || "{}").telefone) || ""; } catch (e) {}
        var dig = String(tel).replace(/\D/g, "");
        if (dig.length < 10) dig = "5551989286351"; else if (dig.length <= 11) dig = "55" + dig;
        return "https://wa.me/" + dig + "?text=" + encodeURIComponent("Olá! Estou no app Oliver e gostaria de ajuda.");
    }

    // Abre o vídeo especial de Halloween em tela cheia
    function abrirHalloween() {
        if (document.getElementById("oliver-hw-modal")) return;
        var m = document.createElement("div");
        m.id = "oliver-hw-modal";
        m.style.cssText = "position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;";
        m.innerHTML =
            '<video src="Mascote/halloween.mp4" autoplay controls playsinline style="max-width:100%;max-height:82vh;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.6)"></video>' +
            '<button id="oliver-hw-x" style="margin-top:16px;background:linear-gradient(to right,#7c3aed,#f97316);color:#fff;font-weight:800;border:0;border-radius:12px;padding:10px 22px;cursor:pointer">Fechar 🎃</button>';
        document.body.appendChild(m);
        var fechar = function () { var v = m.querySelector("video"); if (v) { try { v.pause(); } catch (e) {} } m.remove(); };
        m.querySelector("#oliver-hw-x").addEventListener("click", fechar);
        m.addEventListener("click", function (e) { if (e.target === m) fechar(); });
    }

    // Ajudante Oliver flutuante — em todas as telas internas (desktop e celular)
    function montarMascoteGlobal() {
        if (document.querySelector(".oliver-mascote")) return;
        var hoje = new Date();
        var ehHalloween = (hoje.getMonth() === 9 && hoje.getDate() === 31); // 31 de outubro
        var halloweenBtn = ehHalloween
            ? '<button class="oliver-hw-btn" style="display:block;width:100%;margin-top:10px;background:linear-gradient(to right,#7c3aed,#f97316);color:#fff;font-weight:800;border:0;border-radius:10px;padding:9px;cursor:pointer;font-size:12px">🎃 Especial de Halloween</button>'
            : '';
        var el = document.createElement("div");
        el.className = "oliver-mascote";
        el.innerHTML =
            '<div class="oliver-balao" style="display:none">' +
                '<button class="oliver-balao-x" aria-label="Fechar">✕</button>' +
                '<p style="font-weight:800;font-size:13px;color:#1e293b;margin:0 0 4px">Oi, eu sou o Oliver ' + (ehHalloween ? '🎃' : '👋') + '</p>' +
                '<p style="font-size:12px;color:#475569;margin:0;line-height:1.4">' + (ehHalloween ? 'Feliz Halloween! Tenho uma surpresa pra você:' : 'Precisa de ajuda? Fale com a sua consultoria.') + '</p>' +
                halloweenBtn +
                '<a href="' + waDaConsultoria() + '" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:12px;font-weight:700;color:#16a34a;text-decoration:none">💬 Falar com a consultoria</a>' +
            '</div>' +
            '<button class="oliver-mascote-btn" aria-label="Ajuda do Oliver" title="Ajuda do Oliver">' +
                '<img src="Mascote/oliver_ajuda.png" alt="Oliver">' +
            '</button>';
        document.body.appendChild(el);
        var btn = el.querySelector(".oliver-mascote-btn");
        var balao = el.querySelector(".oliver-balao");
        btn.addEventListener("click", function () { balao.style.display = (balao.style.display === "none" ? "block" : "none"); });
        el.querySelector(".oliver-balao-x").addEventListener("click", function () { balao.style.display = "none"; });
        var hw = el.querySelector(".oliver-hw-btn");
        if (hw) hw.addEventListener("click", abrirHalloween);
        try { if (!sessionStorage.getItem("oliverBalaoVisto")) { balao.style.display = "block"; sessionStorage.setItem("oliverBalaoVisto", "1"); } } catch (e) {}
    }

    function aplicarModo() {
        document.body.classList.toggle("oliver-dt", window.innerWidth >= 1024);
    }

    document.addEventListener("DOMContentLoaded", function () {
        var style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);

        // Garante os ícones (Font Awesome) em todas as telas
        if (!document.querySelector('link[href*="font-awesome"]')) {
            var fa = document.createElement("link");
            fa.rel = "stylesheet";
            fa.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css";
            document.head.appendChild(fa);
        }

        // Marca o cartão principal (a "moldura")
        var card = document.querySelector('body > div[class*="max-w-sm"], body > div[class*="max-w-none"]');
        if (card) card.classList.add("oliver-card");

        // Sidebar só nas telas internas (não no login/boas-vindas nem na raiz "/")
        var pagina = location.pathname.split("/").pop();
        var semSidebar = (pagina === "" || pagina === "login.html" || pagina === "index.html");
        if (card && !semSidebar) {
            montarSidebar();
            aplicarModo();
            window.addEventListener("resize", aplicarModo);
            montarMascoteGlobal();
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
