// Casca (chrome) do "Cockpit" do cliente no DESKTOP: sidebar escura + barra de topo.
// Fica como um overlay fixo cobrindo a tela; o miolo (home do cliente) é renderizado
// dentro dele por oliver_home_cliente.js. Mantém a essência do Oliver e liga cada
// item do menu às telas que já existem (o que ainda não existe fica "em breve").
//
// montarCockpit(opts) -> devolve o elemento <div> onde o miolo deve ser montado.
// opts: { nome, negocioNome, consultoriaNome, codigo, func, itensPend, consultoriaTel }

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function montarCockpit(opts) {
    const o = opts || {};
    const func = o.func || {};
    const itens = parseInt(o.itensPend || 0, 10) || 0;
    const nome = o.nome || "você";
    const negocio = o.negocioNome || o.consultoriaNome || "Seu negócio";
    const codigo = o.codigo || "";

    // Permissões (default liberado quando não informado, como no resto do app)
    const permFluxo = (("fluxoCaixa" in func) ? func.fluxoCaixa : true);
    const permNotas = !!func.notasFiscais;
    const permMargem = !!func.calculoMargem;
    const permRel = (("relatoriosHistorico" in func) ? func.relatoriosHistorico : true);

    // Monta um item de menu. Sem href => "em breve" (desabilitado, visual apagado).
    function item(icon, label, href, extra) {
        extra = extra || {};
        const active = !!extra.active;
        const disabled = !href;
        const bg = active ? "background:#ea580c;color:#fff;box-shadow:0 4px 12px rgba(234,88,12,.3);" : "color:#94a3b8;";
        let right = "";
        if (extra.badge) right = `<span style="margin-left:auto;background:#f43f5e;color:#fff;font-size:10px;font-weight:700;padding:1px 7px;border-radius:999px">${extra.badge}</span>`;
        else if (extra.tag) right = `<span style="margin-left:auto;background:rgba(16,185,129,.18);color:#34d399;font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px">${extra.tag}</span>`;
        else if (disabled) right = `<span style="margin-left:auto;background:#1e293b;color:#64748b;font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px">em breve</span>`;
        const op = disabled && !active ? "opacity:.55;" : "";
        const cursor = disabled ? "cursor:default;" : "";
        const hoverIn = (!active && !disabled) ? `onmouseover="this.style.background='#1e293b';this.style.color='#e2e8f0'" onmouseout="this.style.background='transparent';this.style.color='#94a3b8'"` : "";
        return `<a ${href ? `href="${href}"` : ""} ${hoverIn}
            style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;font-size:13px;font-weight:600;text-decoration:none;margin-bottom:2px;${bg}${op}${cursor}">
            <i class="fa-solid ${icon}" style="width:18px;text-align:center"></i><span>${esc(label)}</span>${right}</a>`;
    }
    const section = (t) => `<div style="padding:14px 12px 4px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.07em">${t}</div>`;

    const nav =
        section("Método de Gestão") +
        item("fa-compass", "Cockpit Principal", "app.html", { active: true }) +
        item("fa-bullseye", "Plano de Ação", null) +
        item("fa-list-check", "Rotinas de Gestão", "rotinas.html", itens > 0 ? { badge: itens } : {}) +
        item("fa-calculator", "Margens & CMV", permMargem ? "calculo_margem.html" : null) +
        section("Suporte Operacional") +
        item("fa-chart-line", "Fluxo de Caixa", permFluxo ? "fluxo_caixa.html" : null) +
        item("fa-receipt", "Notas & Comprovantes", permNotas ? "notas.html" : null, { tag: "OCR em breve" }) +
        item("fa-file-invoice", "Relatórios & DRE", permRel ? "relatorios_view.html" : null);

    const rodapeCodigo = codigo ? `
        <div style="background:rgba(30,41,59,.6);border-radius:12px;padding:10px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
            <div><p style="margin:0;color:#64748b;font-size:10px">Seu código</p><p style="margin:0;color:#fb923c;font-family:monospace;font-weight:700;letter-spacing:.12em">${esc(codigo)}</p></div>
            <button id="ck-copia-codigo" title="Copiar" style="background:rgba(51,65,85,.6);border:0;color:#94a3b8;padding:6px 8px;border-radius:8px;cursor:pointer"><i class="fa-regular fa-copy"></i></button>
        </div>` : "";

    const shell = document.createElement("div");
    shell.id = "oliver-cockpit";
    shell.style.cssText = "position:fixed;inset:0;z-index:40;display:flex;background:#f1f5f9;font-family:Inter,system-ui,sans-serif";
    shell.innerHTML = `
        <aside style="width:256px;flex-shrink:0;background:#0f172a;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden">
            <div style="overflow-y:auto">
                <div style="padding:18px;border-bottom:1px solid #1e293b;display:flex;align-items:center;gap:12px">
                    <div style="width:36px;height:36px;border-radius:12px;background:linear-gradient(to top right,#ea580c,#f97316);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:18px">O</div>
                    <div><p style="margin:0;color:#fff;font-weight:700;font-size:17px;line-height:1">Oliver</p><p style="margin:2px 0 0;color:#64748b;font-size:10px">Gestão & Caixa</p></div>
                </div>
                <div style="padding:12px">
                    <div style="background:rgba(30,41,59,.8);border:1px solid rgba(51,65,85,.6);border-radius:12px;padding:10px;display:flex;align-items:center;gap:10px">
                        <div style="width:28px;height:28px;border-radius:8px;background:rgba(249,115,22,.2);color:#fb923c;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-store"></i></div>
                        <div style="overflow:hidden"><p style="margin:0;color:#fff;font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(negocio)}</p><p style="margin:0;color:#34d399;font-size:10px">● Consultoria ativa</p></div>
                    </div>
                </div>
                <nav style="padding:4px 10px 14px">${nav}</nav>
            </div>
            <div style="padding:12px;border-top:1px solid #1e293b">
                ${rodapeCodigo}
                <div style="display:flex;align-items:center;gap:10px;padding:0 2px">
                    <div style="width:32px;height:32px;border-radius:10px;background:#334155;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">${esc((nome[0] || "U").toUpperCase())}</div>
                    <div style="overflow:hidden"><p style="margin:0;color:#fff;font-size:12px;font-weight:700">${esc(nome)}</p><a href="#" id="ck-sair" style="color:#64748b;font-size:10px;text-decoration:none">Sair</a></div>
                </div>
            </div>
        </aside>
        <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
            <header style="background:#fff;border-bottom:1px solid #e2e8f0;padding:12px 28px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 1px 2px rgba(0,0,0,.03)">
                <div><h2 style="margin:0;font-weight:800;font-size:17px;color:#1e293b">Cockpit do seu negócio</h2><p style="margin:2px 0 0;font-size:11px;color:#64748b">Acompanhamento Oliver • dados em tempo real</p></div>
                <div style="display:flex;align-items:center;gap:12px">
                    <button id="ck-consultor" style="background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;font-size:12px;font-weight:700;padding:8px 12px;border-radius:12px;display:flex;align-items:center;gap:8px;cursor:pointer"><span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block"></span><i class="fa-solid fa-comments"></i>Falar com a consultoria</button>
                </div>
            </header>
            <main style="flex:1;overflow-y:auto;padding:26px;background:#f1f5f9"><div id="ck-mount" style="max-width:1150px;margin:0 auto"></div></main>
        </div>`;
    document.body.appendChild(shell);

    // Botão do topo abre o modal "Falar com a consultoria" (criado pelo miolo)
    const btnC = shell.querySelector("#ck-consultor");
    if (btnC) btnC.addEventListener("click", () => { const m = document.getElementById("oliver-modal-consultor"); if (m) m.classList.remove("hidden"); });
    // Copiar código
    const btnCopia = shell.querySelector("#ck-copia-codigo");
    if (btnCopia && codigo) btnCopia.addEventListener("click", async () => { try { await navigator.clipboard.writeText(codigo); } catch (e) {} });
    // Sair
    const sair = shell.querySelector("#ck-sair");
    if (sair) sair.addEventListener("click", async (e) => {
        e.preventDefault();
        try { const m = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js"); await m.signOut(m.getAuth()); } catch (err) {}
        try { localStorage.removeItem("oliverPerms"); } catch (e) {}
        location.href = "login.html";
    });

    return shell.querySelector("#ck-mount");
}
