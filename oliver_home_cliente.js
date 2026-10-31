// Home do CLIENTE (dono do negócio) — "cockpit" orientado a tarefas.
// Usada pela app.html:
//  - Desktop: cockpit completo (banner da consultoria, envio de nota, fila de
//    conciliação, extrato recente e painel de saúde do negócio), nas cores do Oliver.
//  - Celular: faixa compacta e dinâmica acima dos atalhos de navegação.
//
// IMPORTANTE: este layout segue o mockup do "cockpit", mas mantém TODAS as funções
// já criadas no Oliver (envio de nota -> pré-lançamento, conciliação, fluxo de caixa,
// itens para resolver). Nada de dado inventado: os números vêm do Firestore do cliente.
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; };
// Data LOCAL (evita o bug de fuso do toISOString, que à noite joga para o dia seguinte)
const ymdLocal = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const mesAnterior = (mes) => { const [a, m] = mes.split("-").map(Number); const d = new Date(a, m - 2, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };

// WhatsApp da consultoria (usa o telefone do branding; cai no suporte do Oliver se não houver)
function waLink(tel, msg) {
    let dig = String(tel || "").replace(/\D/g, "");
    if (dig.length < 10) dig = "5551989286351";
    else if (dig.length <= 11) dig = "55" + dig;
    return "https://wa.me/" + dig + "?text=" + encodeURIComponent(msg);
}

// Lê um arquivo como dataURL (usado para PDF).
function lerDataURL(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = (e) => resolve(e.target.result);
        r.onerror = reject; r.readAsDataURL(file);
    });
}

// Comprime a foto da nota para caber no limite do Firestore (base64).
function comprimirImagem(file, maxLado = 1200, qualidade = 0.65) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > height && width > maxLado) { height = height * maxLado / width; width = maxLado; }
                else if (height > maxLado) { width = width * maxLado / height; height = maxLado; }
                const canvas = document.createElement("canvas");
                canvas.width = width; canvas.height = height;
                canvas.getContext("2d").drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL("image/jpeg", qualidade));
            };
            img.onerror = reject; img.src = e.target.result;
        };
        reader.onerror = reject; reader.readAsDataURL(file);
    });
}

// Menu completo do app mobile (espelha a sidebar do desktop; mesma regra de permissão)
const MENU = [
    { href: "dashboard.html", label: "Dashboard", icon: "fa-chart-pie", key: "relatorios", padrao: false, sec: "Gestão" },
    { href: "crm.html", label: "CRM", icon: "fa-handshake", key: "relatorios", padrao: false, sec: "Gestão" },
    { href: "agenda.html", label: "Agenda / Tarefas", icon: "fa-calendar-days", key: "relatorios", padrao: false, sec: "Gestão" },
    { href: "organizacoes.html", label: "Organizações", icon: "fa-sitemap", orgLink: true, sec: "Gestão" },
    { href: "rotinas.html", label: "Rotinas de Gestão", icon: "fa-clipboard-check", orgLink: true, sec: "Gestão" },
    { href: "itens_resolver.html", label: "Itens para Resolver", icon: "fa-list-check", key: "itensResolver", padrao: true, sec: "Gestão" },
    { href: "indicadores.html", label: "Meus Indicadores", icon: "fa-gauge-high", clienteOnly: true, sec: "Gestão" },
    { href: "fluxo_caixa.html", label: "Fluxo de Caixa", icon: "fa-chart-line", key: "fluxoCaixa", padrao: true, sec: "Financeiro & Caixa" },
    { href: "notas.html", label: "Notas & Comprovantes", icon: "fa-receipt", key: "notasFiscais", padrao: false, sec: "Financeiro & Caixa" },
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
const MENU_SECOES = ["Gestão", "Financeiro & Caixa", "Relatórios", "Sistema"];
function podeVerMenu(l, p) {
    if (l.always) return true;
    if (l.master) return !!p.master;
    if (l.orgLink) return !!(p.master || (p.func && p.func.relatorios) || p.org);
    if (l.clienteOnly) return !(p.master || (p.func && p.func.relatorios));
    if (l.key) return p.master || ((l.key in (p.func || {})) ? p.func[l.key] : l.padrao);
    return true;
}

// renderHomeCliente({ db, uid, empresaId, orgId, func, mount, isDesktop, nome, consultoriaNome, consultoriaTel, inicialTab })
export async function renderHomeCliente(opts) {
    const { db, uid, empresaId, func, mount, isDesktop } = opts;
    const nome = opts.nome || (localStorage.getItem("oliverNome") || "");
    const consultoriaNome = opts.consultoriaNome || "";
    const consultoriaTel = opts.consultoriaTel || "";
    // Enviar nota é parte central do cockpit: liberado para todo cliente vinculado a uma consultoria.
    const temNotas = !!empresaId;
    const temMargem = !!(func && func.calculoMargem);
    let fotoPronta = "";      // dataURL da foto comprimida ou do PDF
    let arquivoTipo = "image"; // "image" | "pdf"

    // ---------- Dados do Fluxo de Caixa do próprio cliente ----------
    async function carregarDados() {
        const movs = [];
        try {
            const s = await getDocs(collection(db, "usuarios", uid, "fluxo_caixa"));
            s.forEach((d) => movs.push({ id: d.id, ...d.data() }));
        } catch (e) { console.error("home cliente: fluxo_caixa", e); }

        const hoje = ymdLocal();
        const em7 = ymdLocal(new Date(Date.now() + 7 * 86400000));
        const mes = hoje.slice(0, 7);
        const mesAnt = mesAnterior(mes);

        let entTot = 0, saiTot = 0, entMes = 0, saiMes = 0, entAnt = 0, saiAnt = 0;
        let aPagarTotal = 0, aPagarSemana = 0, vencemHoje = 0, vencidas = 0;
        const preLanc = [], realizados = [];

        movs.forEach((m) => {
            const v = num(m.valor);
            if (m.status === "pre_lancamento") { preLanc.push(m); return; }
            if (m.status === "a_pagar") {
                aPagarTotal += v;
                if (m.vencimento) {
                    if (m.vencimento < hoje) vencidas++;
                    if (m.vencimento === hoje) vencemHoje++;
                    if (m.vencimento <= em7) aPagarSemana += v;
                } else { aPagarSemana += v; }
                return;
            }
            realizados.push(m);
            if (m.tipo === "entrada") entTot += v; else saiTot += v;
            const md = (m.data || "").slice(0, 7);
            if (md === mes) { if (m.tipo === "entrada") entMes += v; else saiMes += v; }
            else if (md === mesAnt) { if (m.tipo === "entrada") entAnt += v; else saiAnt += v; }
        });

        const saldoMes = entMes - saiMes, saldoAnt = entAnt - saiAnt;
        realizados.sort((a, b) => (b.data || "").localeCompare(a.data || "") || (b.criadoEm || "").localeCompare(a.criadoEm || ""));
        preLanc.sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
        const itensPend = parseInt(localStorage.getItem("oliverItensPendentes") || "0", 10) || 0;

        return {
            saldoAtual: entTot - saiTot, entMes, saiMes, saldoMes,
            trend: saldoAnt !== 0 ? ((saldoMes - saldoAnt) / Math.abs(saldoAnt)) * 100 : null,
            aPagarTotal, aPagarSemana, vencemHoje, vencidas,
            preLanc, extrato: realizados.slice(0, 8), itensPend
        };
    }

    // ---------- Cartão de conciliação (editável; mesmos data-attrs nos 2 layouts) ----------
    function cartaoPreLanc(m) {
        const venc = m.vencimento || ymdLocal();
        return `<div class="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 hover:border-orange-300 transition-all" data-pre="${m.id}">
            <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0 mt-0.5"><i class="fa-solid fa-receipt"></i></div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <input data-f="descricao" value="${esc(m.descricao || "")}" placeholder="Fornecedor / descrição" class="font-bold text-sm text-slate-800 bg-transparent border-0 border-b border-transparent hover:border-slate-200 focus:border-orange-400 outline-none px-0 py-0.5 flex-1 min-w-[140px]">
                        <span class="bg-amber-100 text-amber-800 text-[9px] font-bold px-2 py-0.5 rounded-full">Nota enviada</span>
                    </div>
                    <div class="grid grid-cols-3 gap-2 mt-2">
                        <div><label class="text-[10px] text-slate-400">Valor R$</label><input data-f="valor" type="number" step="0.01" value="${m.valor ? num(m.valor) : ""}" class="w-full p-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-orange-300"></div>
                        <div><label class="text-[10px] text-slate-400">Vencimento</label><input data-f="vencimento" type="date" value="${venc}" class="w-full p-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-orange-300"></div>
                        <div><label class="text-[10px] text-slate-400">Categoria</label><input data-f="categoria" list="cats-pre" value="${esc(m.categoria || "Fornecedor")}" class="w-full p-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-orange-300"></div>
                    </div>
                </div>
            </div>
            <div class="flex items-center justify-end gap-2 mt-3">
                <button data-a="descartar" class="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-rose-600 text-xs font-semibold"><i class="fa-solid fa-trash"></i></button>
                <button data-a="confirmar" class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1"><i class="fa-solid fa-check"></i><span>Confirmar no caixa</span></button>
            </div>
        </div>`;
    }

    const datalist = `<datalist id="cats-pre"><option>Fornecedor</option><option>Aluguel</option><option>Salários</option><option>Impostos</option><option>Energia/Água</option><option>Serviços</option><option>Outros</option></datalist>`;

    // ======================= LAYOUT DESKTOP (cockpit) =======================
    function htmlDesktop(d) {
        const trend = d.trend === null ? "" :
            `<span class="text-[11px] font-bold ${d.trend >= 0 ? "text-emerald-200" : "text-amber-100"}">${d.trend >= 0 ? "▲ +" : "▼ "}${d.trend.toFixed(0)}% vs. mês passado</span>`;

        // Banner da consultoria (cores do Oliver: laranja -> âmbar)
        const banner = `
        <section class="bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 rounded-3xl p-5 md:p-6 text-white shadow-xl shadow-orange-500/20 relative overflow-hidden mb-6">
            <div class="absolute -right-10 -bottom-10 w-56 h-56 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
            <div class="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
                <div class="lg:col-span-8 space-y-2">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="bg-white/20 backdrop-blur text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider"><i class="fa-solid fa-hand-sparkles mr-1"></i>Bem-vindo de volta</span>
                        ${consultoriaNome ? `<span class="text-orange-50 text-xs"><i class="fa-solid fa-building mr-1"></i>${esc(consultoriaNome)}</span>` : ""}
                    </div>
                    <h2 class="text-xl md:text-2xl font-black">Olá, ${esc(nome || "bem-vindo")}!</h2>
                    <p class="text-sm font-medium leading-relaxed text-orange-50">
                        ${d.preLanc.length > 0
                            ? `Você tem <strong class="text-white underline decoration-amber-200">${d.preLanc.length} nota(s)</strong> para conciliar. Revise e lance no caixa — assim seus relatórios ficam sempre atualizados.`
                            : `Envie as notas das suas compras para manter o fluxo de caixa e os relatórios da consultoria sempre atualizados.`}
                    </p>
                    <div class="pt-1">
                        <button id="oliver-open-consultor" class="bg-white text-orange-700 hover:bg-orange-50 text-xs font-bold px-3.5 py-2 rounded-xl transition inline-flex items-center gap-2"><i class="fa-solid fa-comments"></i>Falar com a consultoria</button>
                    </div>
                </div>
                <div class="lg:col-span-4 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
                    <p class="text-xs text-orange-100 font-medium">Saldo do mês</p>
                    <h3 class="text-2xl font-black text-white mt-0.5">${brl(d.saldoMes)}</h3>
                    <div class="mt-1">${trend || `<span class="text-[11px] text-orange-100">entradas ${brl(d.entMes)}</span>`}</div>
                    <div class="mt-3 pt-3 border-t border-white/20 flex items-center justify-between text-[11px] text-orange-50">
                        <span><i class="fa-solid fa-file-invoice-dollar mr-1"></i>${d.preLanc.length} a conciliar</span>
                        <span><i class="fa-solid fa-calendar-xmark mr-1"></i>${brl(d.aPagarSemana)} a pagar</span>
                    </div>
                </div>
            </div>
        </section>`;

        // --- Coluna esquerda: envio + conciliação + extrato ---
        const upload = temNotas ? `
            <section class="bg-white rounded-3xl p-5 md:p-6 border border-slate-200/80 shadow-sm">
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <h3 class="font-extrabold text-slate-800 text-base flex items-center gap-2"><i class="fa-solid fa-cloud-arrow-up text-orange-600"></i><span>Envio rápido de notas</span></h3>
                        <p class="text-xs text-slate-500">Alimente o fluxo de caixa sem digitação manual.</p>
                    </div>
                    <span class="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-bold flex items-center gap-1"><i class="fa-solid fa-robot text-[9px]"></i>OCR em breve</span>
                </div>
                <label data-el="drop" class="block border-2 border-dashed border-orange-300 bg-orange-50/40 hover:bg-orange-50 rounded-2xl p-6 text-center cursor-pointer transition-all group">
                    <input type="file" data-el="foto" accept="image/*,application/pdf,.pdf" class="hidden">
                    <div class="w-12 h-12 bg-white text-orange-600 rounded-2xl flex items-center justify-center text-xl mx-auto shadow-md group-hover:scale-110 transition-transform"><i class="fa-solid fa-file-invoice-dollar"></i></div>
                    <p class="text-sm font-bold text-slate-800 mt-2" data-el="drop-label">Arraste a nota aqui ou <span class="text-orange-600 underline">clique para enviar</span></p>
                    <div class="flex items-center justify-center gap-2 mt-2 text-[11px] text-slate-500 flex-wrap">
                        <span class="bg-white px-2.5 py-1 rounded-lg border border-slate-200"><i class="fa-regular fa-file-code text-orange-500 mr-1"></i>XML NF-e <span class="text-slate-400">(em breve)</span></span>
                        <span class="bg-white px-2.5 py-1 rounded-lg border border-slate-200"><i class="fa-regular fa-file-pdf text-rose-500 mr-1"></i>PDF</span>
                        <span class="bg-white px-2.5 py-1 rounded-lg border border-slate-200"><i class="fa-solid fa-camera text-blue-500 mr-1"></i>Foto de cupom</span>
                    </div>
                </label>
                <img data-el="preview" class="hidden w-full max-h-48 object-contain rounded-lg border border-slate-100 mt-3">
                <div data-el="campos" class="mt-3 space-y-2">
                    <p class="text-[11px] font-semibold text-slate-600">Sempre informe o que é a nota e o valor da compra:</p>
                    <input data-el="fornecedor" placeholder="O que é esta nota? (ex.: Hortifruti, Energia) *" class="w-full p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400">
                    <input data-el="valor" type="number" step="0.01" placeholder="Valor da compra (R$) *" class="w-full p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400">
                    <button data-el="enviar" class="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl text-sm">Enviar nota fiscal</button>
                </div>
                <p data-el="status" class="text-[11px] text-slate-500 text-center mt-2"></p>
            </section>` : "";

        const cartoes = d.preLanc.map(cartaoPreLanc).join("");
        const extras = [];
        if (d.itensPend > 0) extras.push(`<a href="itens_resolver.html" class="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-green-400 transition"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-green-100 text-green-700 flex items-center justify-center"><i class="fa-solid fa-clipboard-check"></i></div><div><p class="font-bold text-sm text-slate-800">Itens para resolver</p><p class="text-xs text-slate-500">Pendências do seu acompanhamento</p></div></div><span class="bg-rose-500 text-white font-extrabold text-xs px-2.5 py-1 rounded-full">${d.itensPend}</span></a>`);
        if (d.vencidas > 0) extras.push(`<a href="fluxo_caixa.html" class="flex items-center justify-between p-4 rounded-2xl bg-rose-50 border border-rose-200 hover:border-rose-400 transition"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center"><i class="fa-solid fa-triangle-exclamation"></i></div><div><p class="font-bold text-sm text-rose-700">Contas vencidas</p><p class="text-xs text-rose-600/80">Veja no fluxo de caixa</p></div></div><span class="bg-rose-500 text-white font-extrabold text-xs px-2.5 py-1 rounded-full">${d.vencidas}</span></a>`);
        const filaVazia = `<div class="text-center py-8 text-sm text-slate-400"><i class="fa-regular fa-circle-check text-3xl text-slate-300 mb-2"></i><p>Nenhuma pendência no momento.${temNotas ? " Envie uma nota acima para começar." : ""}</p></div>`;
        const fila = `
            <section class="bg-white rounded-3xl p-5 md:p-6 border border-slate-200/80 shadow-sm">
                <div class="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                    <div>
                        <h3 class="font-extrabold text-slate-800 text-base flex items-center gap-2"><i class="fa-solid fa-list-check text-orange-600"></i><span>Pendências & conciliação</span></h3>
                        <p class="text-xs text-slate-500">Confira os dados da nota e lance no caixa com 1 clique.</p>
                    </div>
                    <span class="bg-rose-500 text-white font-extrabold text-xs px-2.5 py-1 rounded-full">${d.preLanc.length + (d.itensPend > 0 ? 1 : 0) + (d.vencidas > 0 ? 1 : 0)} pendente(s)</span>
                </div>
                <div class="space-y-3">${(cartoes + extras.join("")) || filaVazia}</div>
            </section>`;

        const linhas = d.extrato.map((m) => {
            const entrada = m.tipo === "entrada";
            const origem = m.origem === "nota" ? `<span class="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-receipt mr-1"></i>Nota</span>`
                : (entrada ? `<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-medium">Entrada</span>` : `<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-medium">Lançamento</span>`);
            return `<tr>
                <td class="py-3 font-semibold text-slate-800"><div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full ${entrada ? "bg-emerald-500" : "bg-rose-500"}"></span><span>${esc(m.descricao || "")}</span></div></td>
                <td class="py-3 text-slate-500">${esc(m.categoria || "—")}</td>
                <td class="py-3">${origem}</td>
                <td class="py-3 font-extrabold ${entrada ? "text-emerald-600" : "text-rose-600"} text-right whitespace-nowrap">${entrada ? "+" : "-"} ${brl(m.valor)}</td>
            </tr>`;
        }).join("");
        const extrato = `
            <section class="bg-white rounded-3xl p-5 md:p-6 border border-slate-200/80 shadow-sm">
                <div class="flex items-center justify-between mb-3">
                    <div><h3 class="font-extrabold text-slate-800 text-base">Fluxo de caixa recente</h3><p class="text-xs text-slate-500">Últimas entradas e saídas já lançadas.</p></div>
                    <a href="fluxo_caixa.html" class="text-xs font-bold text-orange-600 hover:underline">Ver caixa completo →</a>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs">
                        <thead><tr class="border-b border-slate-100 text-slate-400 uppercase text-[10px] tracking-wider"><th class="pb-2 font-bold">Descrição</th><th class="pb-2 font-bold">Categoria</th><th class="pb-2 font-bold">Origem</th><th class="pb-2 font-bold text-right">Valor</th></tr></thead>
                        <tbody class="divide-y divide-slate-100">${linhas || `<tr><td colspan="4" class="text-center text-slate-400 py-8">Nenhum lançamento ainda.</td></tr>`}</tbody>
                    </table>
                </div>
            </section>`;

        // --- Coluna direita: saúde do negócio (dados reais) + consultoria ---
        const kpi = (rotulo, valor, cor, sub) => `<div class="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <div class="flex items-center justify-between text-xs text-slate-500 font-medium"><span>${rotulo}</span>${sub || ""}</div>
            <div class="text-2xl font-black ${cor} mt-1">${valor}</div></div>`;
        const avisoHoje = d.vencemHoje > 0 ? `<span class="text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full">${d.vencemHoje} hoje</span>` : (d.vencidas > 0 ? `<span class="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-full">${d.vencidas} vencida(s)</span>` : "");
        const saude = `
            <section class="bg-white rounded-3xl p-5 md:p-6 border border-slate-200/80 shadow-sm space-y-4">
                <div class="border-b border-slate-100 pb-3">
                    <h3 class="font-extrabold text-slate-800 text-base flex items-center gap-2"><i class="fa-solid fa-heart-pulse text-orange-600"></i><span>Saúde do negócio</span></h3>
                    <p class="text-xs text-slate-500">Seus números, atualizados em tempo real.</p>
                </div>
                ${kpi("Saldo em caixa", brl(d.saldoAtual), d.saldoAtual >= 0 ? "text-slate-800" : "text-rose-600")}
                ${kpi("A pagar na semana", brl(d.aPagarSemana), "text-rose-600", avisoHoje)}
                ${kpi("Entradas do mês", brl(d.entMes), "text-emerald-600")}
                ${kpi("Notas a conciliar", d.preLanc.length + "", "text-orange-600")}
                <div class="grid grid-cols-1 gap-2 pt-1">
                    <a href="fluxo_caixa.html" class="w-full py-2.5 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-xs rounded-2xl border border-orange-200 transition flex items-center justify-center gap-2">Abrir fluxo de caixa <i class="fa-solid fa-arrow-right text-xs"></i></a>
                    <a href="indicadores.html" class="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-2xl border border-slate-200 transition flex items-center justify-center gap-2">Meus indicadores</a>
                    ${temMargem ? `<a href="calculo_margem.html" class="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-2xl border border-slate-200 transition flex items-center justify-center gap-2">Cálculo de margem</a>` : ""}
                </div>
            </section>`;

        const consultoriaCard = `
            <section class="bg-blue-950 text-white rounded-3xl p-5 border border-blue-900 space-y-3">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-2xl bg-orange-600 flex items-center justify-center text-lg text-white"><i class="fa-solid fa-handshake"></i></div>
                    <div><h4 class="font-bold text-sm text-white">${consultoriaNome ? esc(consultoriaNome) : "Sua consultoria"}</h4><p class="text-xs text-blue-200">Acompanhamento do seu negócio</p></div>
                </div>
                <p class="text-xs text-blue-100/90">Dúvidas sobre notas, caixa ou metas? Fale direto com quem cuida do seu negócio.</p>
                <button id="oliver-open-consultor-2" class="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl transition inline-flex items-center justify-center gap-2"><i class="fa-brands fa-whatsapp"></i>Falar com a consultoria</button>
            </section>`;

        // --- Modal "Falar com a consultoria" (envia pelo WhatsApp de verdade) ---
        const modal = `
            <div id="oliver-modal-consultor" class="hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
                <div class="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100">
                    <div class="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center"><i class="fa-solid fa-headset"></i></div>
                            <div><h3 class="font-bold text-slate-800 text-sm">Falar com a consultoria</h3><p class="text-xs text-slate-400">Abre no WhatsApp com sua mensagem pronta</p></div>
                        </div>
                        <button data-m="fechar" class="text-slate-400 hover:text-slate-600 font-bold">✕</button>
                    </div>
                    <div class="space-y-3">
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Assunto</label>
                            <select data-m="assunto" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700">
                                <option>Dúvida sobre envio de notas fiscais</option>
                                <option>Dúvida sobre o fluxo de caixa</option>
                                <option>Ajuste no acompanhamento / metas</option>
                                <option>Outros assuntos</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Mensagem</label>
                            <textarea data-m="msg" rows="3" placeholder="Escreva sua mensagem..." class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:border-orange-500"></textarea>
                        </div>
                    </div>
                    <div class="flex gap-2 pt-1">
                        <button data-m="fechar" class="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl">Cancelar</button>
                        <button data-m="enviar" class="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl inline-flex items-center justify-center gap-2"><i class="fa-brands fa-whatsapp"></i>Enviar pelo WhatsApp</button>
                    </div>
                </div>
            </div>`;

        return `
            ${banner}
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div class="lg:col-span-8 space-y-6">${upload}${fila}${extrato}</div>
                <div class="lg:col-span-4 space-y-6">${saude}${consultoriaCard}</div>
            </div>
            ${modal}${datalist}`;
    }

    // ======================= APP CELULAR (abas: Cockpit / Rotinas / Caixa / Perfil) =======================
    function htmlMobile(d) {
        const codigo = opts.codigo || "";
        const totalPend = d.preLanc.length + (d.itensPend > 0 ? 1 : 0);

        // --- Aba Cockpit ---
        const banner = `
            <div class="bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600 rounded-3xl p-4 text-white shadow-md relative overflow-hidden">
                <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
                <div class="flex justify-between items-center mb-1.5">
                    <span class="text-[10px] font-bold uppercase tracking-wider bg-black/20 px-2.5 py-1 rounded-full text-orange-100 flex items-center gap-1"><i class="fa-solid fa-hand-sparkles"></i> Bem-vindo</span>
                    ${consultoriaNome ? `<span class="text-[10px] text-orange-100 font-medium">${esc(consultoriaNome)}</span>` : ""}
                </div>
                <p class="text-sm font-bold">Olá, ${esc(nome || "bem-vindo")}!</p>
                <p class="text-xs font-medium leading-relaxed text-white/95 mt-1">${d.preLanc.length > 0 ? `Você tem <b>${d.preLanc.length} nota(s)</b> para conciliar. Confirme para manter o caixa em dia.` : `Tire foto das notas das suas compras para manter o caixa e os relatórios atualizados.`}</p>
                <div class="mt-3 pt-2.5 border-t border-white/20 flex items-center justify-between text-[11px] text-orange-50">
                    <span><i class="fa-solid fa-file-invoice-dollar mr-1"></i>${d.preLanc.length} a conciliar</span>
                    <span><i class="fa-solid fa-calendar-xmark mr-1"></i>${brl(d.aPagarSemana)} a pagar</span>
                </div>
            </div>`;
        const captura = temNotas ? `
            <div class="bg-white rounded-3xl p-3.5 border border-orange-200/80 shadow-sm space-y-2">
                <div class="flex items-center justify-between px-1">
                    <div class="text-left"><h2 class="text-xs font-extrabold text-slate-800">Captura de comprovantes</h2><p class="text-[10px] text-slate-400">A nota vira conta a pagar para você confirmar</p></div>
                    <span class="bg-slate-100 text-slate-500 text-[9px] font-bold px-2 py-0.5 rounded-full">OCR em breve</span>
                </div>
                <label data-el="drop" class="block w-full bg-gradient-to-r from-orange-500 to-orange-600 active:scale-[.98] text-white font-bold py-3.5 px-4 rounded-2xl shadow-md flex items-center justify-center gap-2.5 transition text-xs cursor-pointer">
                    <span class="w-7 h-7 bg-white/20 rounded-xl flex items-center justify-center"><i class="fa-solid fa-camera text-sm"></i></span>
                    <span data-el="drop-label">Foto ou PDF da nota / recibo</span>
                    <input type="file" data-el="foto" accept="image/*,application/pdf,.pdf" class="hidden">
                </label>
                <img data-el="preview" class="hidden w-full max-h-44 object-contain rounded-lg border border-slate-100">
                <div data-el="campos" class="space-y-2">
                    <p class="text-[11px] font-semibold text-slate-600">Sempre informe o que é a nota e o valor:</p>
                    <input data-el="fornecedor" placeholder="O que é esta nota? (ex.: Hortifruti) *" class="w-full p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400">
                    <input data-el="valor" type="number" step="0.01" placeholder="Valor da compra (R$) *" class="w-full p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400">
                    <button data-el="enviar" class="w-full bg-orange-600 text-white font-bold py-2.5 rounded-xl text-sm">Enviar nota fiscal</button>
                </div>
                <p data-el="status" class="text-[11px] text-slate-500 text-center"></p>
            </div>` : "";
        const cards = d.preLanc.map(cartaoPreLanc).join("");
        const extras = [];
        if (d.itensPend > 0) extras.push(`<a href="itens_resolver.html" class="flex items-center justify-between p-3 border border-slate-100 rounded-2xl bg-slate-50"><div class="flex items-center gap-2.5"><div class="w-8 h-8 bg-green-100 text-green-700 rounded-xl flex items-center justify-center"><i class="fa-solid fa-clipboard-check text-xs"></i></div><div><h3 class="text-xs font-bold text-slate-800">Itens do acompanhamento</h3><p class="text-[10px] text-slate-400">Pendências da consultoria</p></div></div><span class="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">${d.itensPend}</span></a>`);
        const fila = `
            <div class="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm space-y-3">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-1.5"><h2 class="text-xs font-extrabold text-slate-800 uppercase tracking-wide">Itens para resolver</h2>${totalPend > 0 ? `<span class="bg-rose-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">${totalPend}</span>` : ""}</div>
                    <span class="text-[10px] text-orange-600 font-bold">Conciliação</span>
                </div>
                <div class="space-y-2.5">${(cards + extras.join("")) || `<div class="text-center py-4"><div class="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto"><i class="fa-solid fa-circle-check"></i></div><p class="text-xs font-bold text-slate-700 mt-1">Tudo em dia!</p></div>`}</div>
            </div>`;
        const kpi = (rot, val, cor) => `<div class="bg-slate-50 p-3 rounded-2xl border border-slate-100"><p class="text-[10px] text-slate-400 font-semibold">${rot}</p><p class="text-base font-black ${cor} leading-none mt-1">${val}</p></div>`;
        const saude = `
            <div class="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm space-y-3">
                <div class="flex items-center justify-between"><h2 class="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5"><i class="fa-solid fa-chart-pie text-orange-500"></i> Saúde do negócio</h2></div>
                <div class="grid grid-cols-2 gap-2.5">
                    ${kpi("Saldo em caixa", brl(d.saldoAtual), d.saldoAtual >= 0 ? "text-slate-800" : "text-rose-600")}
                    ${kpi("A pagar (semana)", brl(d.aPagarSemana), "text-rose-600")}
                    ${kpi("Entradas (mês)", brl(d.entMes), "text-emerald-600")}
                    ${kpi("Notas a conciliar", d.preLanc.length + "", "text-orange-600")}
                </div>
            </div>`;
        const paneCockpit = `<div data-pane="cockpit" class="space-y-3.5">${banner}${captura}${fila}${saude}</div>`;

        // --- Aba Menu (todas as funções permitidas) ---
        let perms; try { perms = JSON.parse(localStorage.getItem("oliverPerms")) || { master: false, func: {} }; } catch (e) { perms = { master: false, func: {} }; }
        const menuItem = (l) => `<a href="${l.href}" class="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-200 shadow-sm active:scale-[.99]">
            <div class="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center"><i class="fa-solid ${l.icon}"></i></div>
            <span class="text-sm font-semibold text-slate-800">${l.label}</span><i class="fa-solid fa-chevron-right text-slate-300 ml-auto text-xs"></i></a>`;
        let menuHtml = "";
        MENU_SECOES.forEach((sec) => {
            const its = MENU.filter((l) => l.sec === sec && podeVerMenu(l, perms));
            if (!its.length) return;
            menuHtml += `<p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1 pt-2">${sec}</p>` + its.map(menuItem).join("");
        });
        const paneMenu = `<div data-pane="menu" class="hidden space-y-2">${menuHtml || '<p class="text-xs text-slate-400 text-center py-4">Nenhuma função disponível.</p>'}</div>`;

        // --- Aba Caixa ---
        const linhas = d.extrato.slice(0, 8).map((m) => {
            const entrada = m.tipo === "entrada";
            return `<div class="flex justify-between items-center py-2 border-b border-slate-100 last:border-0 text-xs">
                <div><p class="font-bold text-slate-800">${esc(m.descricao || "")}</p><p class="text-[10px] text-slate-400">${m.data ? m.data.split("-").reverse().join("/") : ""}${m.origem === "nota" ? " • Nota" : ""}</p></div>
                <span class="font-extrabold ${entrada ? "text-emerald-600" : "text-rose-600"}">${entrada ? "+" : "-"} ${brl(m.valor)}</span>
            </div>`;
        }).join("");
        const paneCaixa = `<div data-pane="caixa" class="hidden space-y-3">
            <div class="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm space-y-3">
                <div class="flex justify-between items-center"><h2 class="font-bold text-sm text-slate-800">Fluxo de caixa</h2><span class="text-xs font-bold ${d.saldoAtual >= 0 ? "text-emerald-600" : "text-rose-600"}">Saldo: ${brl(d.saldoAtual)}</span></div>
                <div>${linhas || `<p class="text-xs text-slate-400 text-center py-3">Nenhum lançamento ainda.</p>`}</div>
                <a href="fluxo_caixa.html" class="block text-center bg-orange-50 text-orange-700 font-bold text-xs py-2.5 rounded-xl border border-orange-200">Abrir fluxo de caixa completo</a>
            </div>
        </div>`;

        // --- Aba Perfil ---
        const panerPerfil = `<div data-pane="perfil" class="hidden space-y-3">
            <div class="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm text-center space-y-2">
                <div class="w-14 h-14 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center font-bold text-xl mx-auto">${esc((nome[0] || "U").toUpperCase())}</div>
                <h2 class="font-bold text-sm text-slate-800">${esc(nome || "Usuário")}</h2>
                <div class="pt-3 border-t border-slate-100 text-left space-y-2 text-xs">
                    ${consultoriaNome ? `<div class="flex justify-between py-1"><span class="text-slate-400">Consultoria:</span><span class="font-bold text-slate-700">${esc(consultoriaNome)}</span></div>` : ""}
                    ${codigo ? `<div class="flex justify-between py-1"><span class="text-slate-400">Seu código:</span><span class="font-mono font-bold text-orange-600">${esc(codigo)}</span></div>` : ""}
                </div>
                <div class="pt-2 space-y-2">
                    <a href="configuracoes.html" class="block text-center bg-slate-50 text-slate-700 font-bold text-xs py-2.5 rounded-xl border border-slate-200">Configurações</a>
                    <a href="#" data-m="sair" class="block text-center bg-rose-50 text-rose-600 font-bold text-xs py-2.5 rounded-xl border border-rose-100">Sair</a>
                </div>
            </div>
        </div>`;

        const navBtn = (tab, icon, label, active, badge) => `<button data-tab="${tab}" class="flex flex-col items-center gap-0.5 ${active ? "text-orange-600 font-bold" : "text-slate-400 font-medium"} relative">
            <i class="fa-solid ${icon} text-base"></i><span class="text-[9px]">${label}</span>
            ${badge ? `<span class="absolute -top-1 right-2 bg-rose-500 text-white text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold">${badge}</span>` : ""}
        </button>`;

        return `
            <header class="bg-orange-600 text-white px-4 py-3 shrink-0 shadow-md">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl bg-white text-orange-600 flex items-center justify-center font-extrabold text-xl">O</div>
                        <div><h1 class="font-bold text-base leading-none">Oliver</h1><p class="text-[10px] text-orange-100 mt-0.5">${esc(consultoriaNome || "Seu negócio")}</p></div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button data-m="consultor" class="bg-white/15 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-xl border border-white/20 flex items-center gap-1.5"><i class="fa-solid fa-comment-dots text-orange-200"></i>Consultor</button>
                        <button data-m="bell" class="relative p-2 rounded-xl bg-white/10 text-white"><i class="fa-regular fa-bell text-sm"></i></button>
                    </div>
                </div>
            </header>
            <main data-el="scroll" class="flex-1 overflow-y-auto p-3.5 space-y-4 bg-slate-50" style="-webkit-overflow-scrolling:touch">
                ${paneCockpit}${paneMenu}${paneCaixa}${panerPerfil}
            </main>
            <nav class="bg-white border-t border-slate-200 px-4 py-2.5 flex items-center justify-around shrink-0 shadow-lg">
                ${navBtn("cockpit", "fa-compass", "Cockpit", true, totalPend || null)}
                ${navBtn("menu", "fa-table-cells-large", "Menu", false)}
                <button data-tab="__cam" class="-mt-5 bg-gradient-to-tr from-orange-600 to-orange-500 active:scale-90 text-white w-12 h-12 rounded-full shadow-lg flex items-center justify-center border-4 border-slate-50"><i class="fa-solid fa-camera text-lg"></i></button>
                ${navBtn("caixa", "fa-chart-line", "Caixa", false)}
                ${navBtn("perfil", "fa-user", "Perfil", false)}
            </nav>
            ${datalist}`;
    }

    // ---------- Mascote Oliver (ajudante flutuante — só desktop) ----------
    function montarMascote(d) {
        if (!isDesktop) { const ex = document.getElementById("oliver-mascote"); if (ex) ex.remove(); return; }
        let el = document.getElementById("oliver-mascote");
        if (!el) {
            el = document.createElement("div");
            el.id = "oliver-mascote";
            el.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:60;display:flex;flex-direction:column;align-items:flex-end;gap:8px;";
            el.innerHTML = `
                <div id="oliver-balao" class="hidden" style="max-width:270px;background:#fff;border:1px solid #e2e8f0;box-shadow:0 12px 34px rgba(0,0,0,.14);border-radius:16px;padding:12px 14px;position:relative">
                    <button id="oliver-balao-x" style="position:absolute;top:6px;right:9px;color:#94a3b8;font-size:14px;background:none;border:0;cursor:pointer">✕</button>
                    <p style="font-size:13px;font-weight:800;color:#1e293b;margin-bottom:4px">Oi, eu sou o Oliver 👋</p>
                    <p id="oliver-dica" style="font-size:12px;color:#475569;line-height:1.45"></p>
                    <a id="oliver-balao-wa" href="#" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:12px;font-weight:700;color:#16a34a;text-decoration:none">💬 Falar com a consultoria</a>
                </div>
                <button id="oliver-btn" aria-label="Ajuda do Oliver" title="Ajuda do Oliver" style="background:none;border:0;cursor:pointer;padding:0;transition:transform .15s;filter:drop-shadow(0 8px 12px rgba(0,0,0,.2))">
                    <img src="Mascote/oliver_ajuda.png" alt="Oliver" style="width:100px;height:auto;display:block;pointer-events:none">
                </button>`;
            document.body.appendChild(el);
            const btn = el.querySelector("#oliver-btn");
            const balao = el.querySelector("#oliver-balao");
            btn.addEventListener("click", () => balao.classList.toggle("hidden"));
            btn.addEventListener("mouseenter", () => btn.style.transform = "scale(1.05)");
            btn.addEventListener("mouseleave", () => btn.style.transform = "scale(1)");
            el.querySelector("#oliver-balao-x").addEventListener("click", () => balao.classList.add("hidden"));
            try { if (!sessionStorage.getItem("oliverBalaoVisto")) { balao.classList.remove("hidden"); sessionStorage.setItem("oliverBalaoVisto", "1"); } } catch (e) {}
        }
        const dica = el.querySelector("#oliver-dica");
        if (dica) dica.innerText = d.preLanc.length > 0
            ? `Você tem ${d.preLanc.length} nota(s) para conciliar. Revise o valor e toque em “Confirmar no caixa”.`
            : (d.itensPend > 0 ? `Há ${d.itensPend} item(ns) para resolver no seu acompanhamento.`
                : (temNotas ? `Envie a foto de uma nota no quadro “Envio rápido” e eu lanço no seu caixa.`
                    : `Acompanhe seu saldo e contas aqui. Precisa de algo? É só chamar a consultoria.`));
        const wa = el.querySelector("#oliver-balao-wa");
        if (wa) wa.href = waLink(consultoriaTel, "Olá! Estou no app Oliver e gostaria de falar com a consultoria.");
    }

    // ---------- Toast ----------
    function showToast(titulo, desc) {
        let t = document.getElementById("oliver-toast");
        if (!t) {
            t = document.createElement("div");
            t.id = "oliver-toast";
            t.style.cssText = "position:fixed;top:18px;right:18px;z-index:80;background:#0f172a;color:#fff;padding:12px 16px;border-radius:16px;box-shadow:0 12px 30px rgba(0,0,0,.2);max-width:320px;display:none";
            document.body.appendChild(t);
        }
        t.innerHTML = `<p style="font-weight:800;font-size:13px">${esc(titulo)}</p><p style="font-size:12px;color:#cbd5e1;margin-top:2px">${esc(desc)}</p>`;
        t.style.display = "block";
        clearTimeout(t._tmr);
        t._tmr = setTimeout(() => { t.style.display = "none"; }, 3200);
    }

    // ---------- Monta e religa eventos ----------
    async function montar() {
        const d = await carregarDados();
        if (isDesktop) {
            mount.innerHTML = htmlDesktop(d);
            wire(mount);
            wireDesktop(mount);
            montarMascote(d);
        } else {
            montarAppMobile(d);
        }
    }

    // Monta o app mobile (abas) como overlay que cobre a tela toda.
    function montarAppMobile(d) {
        let ov = document.getElementById("oliver-app-mobile");
        if (!ov) {
            ov = document.createElement("div");
            ov.id = "oliver-app-mobile";
            ov.style.cssText = "position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;background:#f8fafc;font-family:Inter,system-ui,sans-serif";
            document.body.appendChild(ov);
        }
        ov.innerHTML = htmlMobile(d);
        wire(ov);
        wireMobile(ov, d);
    }

    function wireMobile(root, d) {
        const switchTab = (t) => {
            root.querySelectorAll("[data-pane]").forEach((p) => p.classList.toggle("hidden", p.getAttribute("data-pane") !== t));
            root.querySelectorAll("[data-tab]").forEach((b) => {
                const bt = b.getAttribute("data-tab"); if (bt === "__cam") return;
                const act = bt === t;
                b.classList.toggle("text-orange-600", act); b.classList.toggle("font-bold", act);
                b.classList.toggle("text-slate-400", !act); b.classList.toggle("font-medium", !act);
            });
            const sc = root.querySelector('[data-el="scroll"]'); if (sc) sc.scrollTop = 0;
        };
        root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
            const t = b.getAttribute("data-tab");
            if (t === "__cam") { switchTab("cockpit"); const f = root.querySelector('[data-el="foto"]'); if (f) f.click(); return; }
            switchTab(t);
        }));
        root.querySelectorAll('[data-m="consultor"]').forEach((b) => b.addEventListener("click", () => {
            window.open(waLink(consultoriaTel, `Olá! Sou ${nome || "cliente do Oliver"} e gostaria de falar com a consultoria.`), "_blank", "noopener");
        }));
        const bell = root.querySelector('[data-m="bell"]'); if (bell) bell.addEventListener("click", () => showToast("Avisos", "Você está em dia — sem novas notificações."));
        const sair = root.querySelector('[data-m="sair"]'); if (sair) sair.addEventListener("click", async (e) => {
            e.preventDefault();
            try { const m = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js"); await m.signOut(m.getAuth()); } catch (err) {}
            try { localStorage.removeItem("oliverPerms"); } catch (e2) {}
            location.href = "login.html";
        });
        // Aba inicial (master/consultoria abrem no Menu)
        if (opts.inicialTab && opts.inicialTab !== "cockpit") switchTab(opts.inicialTab);
    }

    function wire(root) {
        // Envio rápido
        const foto = root.querySelector('[data-el="foto"]');
        if (foto) {
            const drop = root.querySelector('[data-el="drop"]');
            const status = root.querySelector('[data-el="status"]');
            const preview = root.querySelector('[data-el="preview"]');
            const campos = root.querySelector('[data-el="campos"]');
            const processar = async (arq) => {
                if (!arq) return;
                const ehPdf = /pdf/i.test(arq.type) || /\.pdf$/i.test(arq.name || "");
                const ehImg = /^image\//.test(arq.type);
                if (!ehImg && !ehPdf) { status.innerText = "Envie uma foto (PNG/JPG) ou um PDF."; return; }
                status.innerText = ehPdf ? "Lendo PDF..." : "Processando foto...";
                try {
                    if (ehImg) {
                        fotoPronta = await comprimirImagem(arq); arquivoTipo = "image";
                        preview.src = fotoPronta; preview.classList.remove("hidden");
                    } else {
                        const dataUrl = await lerDataURL(arq); arquivoTipo = "pdf";
                        if (dataUrl.length > 1300000) { fotoPronta = ""; status.innerText = "PDF muito grande (máx ~1MB). Envie um PDF menor ou uma foto."; return; }
                        fotoPronta = dataUrl; preview.classList.add("hidden");
                    }
                    campos.classList.remove("hidden");
                    status.innerText = ehPdf ? ("PDF pronto ✓ — " + (arq.name || "arquivo")) : "Foto pronta ✓";
                } catch (e) { status.innerText = "Não foi possível processar o arquivo."; }
            };
            foto.addEventListener("change", (e) => processar(e.target.files[0]));
            if (drop) {
                ["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag-active"); }));
                ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag-active"); }));
                drop.addEventListener("drop", (e) => { if (e.dataTransfer.files && e.dataTransfer.files[0]) processar(e.dataTransfer.files[0]); });
            }
            const btn = root.querySelector('[data-el="enviar"]');
            if (btn) btn.addEventListener("click", async () => {
                if (!fotoPronta) { status.innerText = "Escolha a foto ou o PDF da nota primeiro."; return; }
                const fornecedor = root.querySelector('[data-el="fornecedor"]').value.trim();
                const valor = num(root.querySelector('[data-el="valor"]').value);
                if (!fornecedor) { status.innerText = "Diga o que é esta nota (ex.: Hortifruti, Energia)."; root.querySelector('[data-el="fornecedor"]').focus(); return; }
                if (valor <= 0) { status.innerText = "Informe o valor da compra."; root.querySelector('[data-el="valor"]').focus(); return; }
                btn.disabled = true; btn.innerText = "Enviando...";
                try {
                    const meuNome = localStorage.getItem("oliverNome") || "";
                    await addDoc(collection(db, "empresas", empresaId, "notas_fiscais"), {
                        foto: fotoPronta, arquivoTipo, fornecedor, valor, obs: "",
                        clienteNome: meuNome, clienteId: uid, orgId: opts.orgId || "",
                        enviadoPorUid: uid, enviadoPorNome: meuNome,
                        data: ymdLocal(), criadoEm: new Date().toISOString()
                    });
                    await addDoc(collection(db, "usuarios", uid, "fluxo_caixa"), {
                        tipo: "saida", status: "pre_lancamento", origem: "nota",
                        descricao: fornecedor, valor,
                        categoria: "Fornecedor", data: ymdLocal(), vencimento: ymdLocal(),
                        temFoto: true, criadoEm: new Date().toISOString()
                    });
                    fotoPronta = ""; arquivoTipo = "image";
                    await montar();
                    showToast("Nota enviada!", "Ela foi para a consultoria e entrou como nota a conciliar.");
                } catch (e) { status.innerText = "Erro ao enviar: " + e.message; btn.disabled = false; btn.innerText = "Enviar nota fiscal"; }
            });
        }

        // Conciliação: confirmar / descartar
        root.querySelectorAll("[data-pre]").forEach((card) => {
            const id = card.getAttribute("data-pre");
            const val = (k) => card.querySelector(`[data-f="${k}"]`);
            const bConf = card.querySelector('[data-a="confirmar"]');
            const bDesc = card.querySelector('[data-a="descartar"]');
            if (bConf) bConf.addEventListener("click", async () => {
                const valor = num(val("valor").value);
                const vencimento = val("vencimento").value;
                if (valor <= 0) { val("valor").focus(); return; }
                if (!vencimento) { val("vencimento").focus(); return; }
                bConf.disabled = true; bConf.innerHTML = "Lançando...";
                try {
                    await updateDoc(doc(db, "usuarios", uid, "fluxo_caixa", id), {
                        status: "a_pagar", tipo: "saida",
                        descricao: val("descricao").value.trim() || "Nota fiscal",
                        valor, vencimento, data: vencimento,
                        categoria: val("categoria").value.trim() || "Fornecedor"
                    });
                    await montar();
                    showToast("Lançado no caixa!", "A nota virou uma conta a pagar no seu fluxo de caixa.");
                } catch (e) { bConf.disabled = false; bConf.innerHTML = '<i class="fa-solid fa-check"></i><span>Confirmar no caixa</span>'; alert("Erro: " + e.message); }
            });
            if (bDesc) bDesc.addEventListener("click", async () => {
                if (!confirm("Descartar este pré-lançamento? A nota enviada à consultoria não é afetada.")) return;
                try { await deleteDoc(doc(db, "usuarios", uid, "fluxo_caixa", id)); await montar(); }
                catch (e) { alert("Erro: " + e.message); }
            });
        });
    }

    // Extras do desktop: modal "Falar com a consultoria" (abre o WhatsApp)
    function wireDesktop(root) {
        const modal = root.querySelector("#oliver-modal-consultor");
        const abrir = () => { if (modal) modal.classList.remove("hidden"); };
        const b1 = root.querySelector("#oliver-open-consultor");
        const b2 = root.querySelector("#oliver-open-consultor-2");
        if (b1) b1.addEventListener("click", abrir);
        if (b2) b2.addEventListener("click", abrir);
        if (modal) {
            modal.querySelectorAll('[data-m="fechar"]').forEach((b) => b.addEventListener("click", () => modal.classList.add("hidden")));
            modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });
            const env = modal.querySelector('[data-m="enviar"]');
            if (env) env.addEventListener("click", () => {
                const assunto = modal.querySelector('[data-m="assunto"]').value;
                const msg = modal.querySelector('[data-m="msg"]').value.trim();
                const texto = `Olá! Sou ${nome || "cliente do Oliver"}.\nAssunto: ${assunto}` + (msg ? `\n${msg}` : "");
                window.open(waLink(consultoriaTel, texto), "_blank", "noopener");
                modal.classList.add("hidden");
                showToast("Abrindo o WhatsApp...", "Sua mensagem foi preparada para envio.");
            });
        }
    }

    await montar();
}
