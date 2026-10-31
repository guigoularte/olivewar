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

// renderHomeCliente({ db, uid, empresaId, orgId, func, mount, isDesktop, nome, consultoriaNome, consultoriaTel })
export async function renderHomeCliente(opts) {
    const { db, uid, empresaId, func, mount, isDesktop } = opts;
    const nome = opts.nome || (localStorage.getItem("oliverNome") || "");
    const consultoriaNome = opts.consultoriaNome || "";
    const consultoriaTel = opts.consultoriaTel || "";
    const temNotas = !!(func && func.notasFiscais) && !!empresaId;
    const temMargem = !!(func && func.calculoMargem);
    let fotoPronta = "";

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
                    <span class="text-[10px] bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full font-bold">leitura automática em breve</span>
                </div>
                <label data-el="drop" class="block border-2 border-dashed border-orange-300 bg-orange-50/40 hover:bg-orange-50 rounded-2xl p-6 text-center cursor-pointer transition-all group">
                    <input type="file" data-el="foto" accept="image/*" capture="environment" class="hidden">
                    <div class="w-12 h-12 bg-white text-orange-600 rounded-2xl flex items-center justify-center text-xl mx-auto shadow-md group-hover:scale-110 transition-transform"><i class="fa-solid fa-file-invoice-dollar"></i></div>
                    <p class="text-sm font-bold text-slate-800 mt-2" data-el="drop-label">Arraste a nota aqui ou <span class="text-orange-600 underline">clique para enviar</span></p>
                    <p class="text-xs text-slate-400">Foto do cupom / nota (PNG, JPG)</p>
                </label>
                <img data-el="preview" class="hidden w-full max-h-48 object-contain rounded-lg border border-slate-100 mt-3">
                <div data-el="campos" class="hidden mt-3 space-y-2">
                    <input data-el="fornecedor" placeholder="Fornecedor / loja (opcional)" class="w-full p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400">
                    <input data-el="valor" type="number" step="0.01" placeholder="Valor R$ (opcional)" class="w-full p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400">
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

    // ======================= LAYOUT CELULAR (app) =======================
    function htmlMobile(d) {
        const trendTxt = d.trend === null ? "" :
            `<p class="text-[9px] ${d.trend >= 0 ? "text-emerald-600" : "text-rose-600"} font-medium mt-0.5"><i class="fa-solid fa-arrow-${d.trend >= 0 ? "up" : "down"} mr-0.5"></i>${d.trend >= 0 ? "+" : ""}${d.trend.toFixed(0)}% no mês</p>`;
        const resumo = `
            <div class="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-sm mb-3">
                <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                    <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Resumo do caixa</span>
                    <a href="fluxo_caixa.html" class="text-[10px] text-orange-600 font-bold">Ver caixa →</a>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <p class="text-[10px] text-slate-400 font-medium">Saldo atual</p>
                        <p class="text-sm font-extrabold ${d.saldoAtual >= 0 ? "text-slate-800" : "text-rose-600"} mt-0.5">${brl(d.saldoAtual)}</p>${trendTxt}
                    </div>
                    <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <p class="text-[10px] text-slate-400 font-medium">A pagar (semana)</p>
                        <p class="text-sm font-extrabold text-rose-600 mt-0.5">${brl(d.aPagarSemana)}</p>
                        <p class="text-[9px] ${d.vencemHoje > 0 ? "text-amber-600" : "text-slate-400"} font-medium mt-0.5"><i class="fa-solid fa-clock mr-0.5"></i>${d.vencemHoje > 0 ? d.vencemHoje + " vence(m) hoje" : "nada hoje"}</p>
                    </div>
                </div>
            </div>`;
        const envio = temNotas ? `
            <div class="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-sm mb-3">
                <div class="flex items-center justify-between mb-2">
                    <p class="text-sm font-black text-blue-950">📷 Envio rápido de nota</p>
                    <span class="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">auto em breve</span>
                </div>
                <label data-el="drop" class="block text-center border-2 border-dashed border-orange-200 bg-orange-50/60 text-orange-700 font-bold py-4 rounded-xl cursor-pointer hover:bg-orange-100 transition text-sm">
                    <span data-el="drop-label"><i class="fa-solid fa-camera mr-1"></i>Tirar / escolher foto</span>
                    <input type="file" data-el="foto" accept="image/*" capture="environment" class="hidden">
                </label>
                <img data-el="preview" class="hidden w-full max-h-44 object-contain rounded-lg border border-slate-100 mt-2">
                <div data-el="campos" class="hidden mt-2 space-y-2">
                    <input data-el="fornecedor" placeholder="Fornecedor / loja (opcional)" class="w-full p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400">
                    <input data-el="valor" type="number" step="0.01" placeholder="Valor R$ (opcional)" class="w-full p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400">
                    <button data-el="enviar" class="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 rounded-xl text-sm">Enviar nota fiscal</button>
                </div>
                <p data-el="status" class="text-[11px] text-slate-500 text-center mt-2"></p>
            </div>` : "";
        const totalPend = d.preLanc.length + (d.itensPend > 0 ? 1 : 0);
        const cards = d.preLanc.map(cartaoPreLanc).join("");
        const extras = [];
        if (d.itensPend > 0) extras.push(`<a href="itens_resolver.html" class="flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-3 shadow-sm"><div class="flex items-center gap-2"><div class="w-8 h-8 rounded-lg bg-green-100 text-green-700 flex items-center justify-center"><i class="fa-solid fa-clipboard-check text-xs"></i></div><div><p class="text-xs font-bold text-slate-800">Itens do acompanhamento</p><p class="text-[10px] text-slate-400">Pendências da consultoria</p></div></div><span class="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">${d.itensPend}</span></a>`);
        const feed = `
            <div class="flex items-center justify-between px-1 mb-2">
                <div class="flex items-center gap-1.5"><h3 class="font-bold text-slate-800 text-xs uppercase tracking-wide">Itens para resolver</h3>${totalPend > 0 ? `<span class="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">${totalPend}</span>` : ""}</div>
            </div>
            <div class="space-y-2 mb-3">${(cards + extras.join("")) || `<div class="bg-white border border-slate-200 rounded-2xl p-4 text-center text-xs text-slate-400">Tudo em dia por aqui ✅</div>`}</div>`;
        const linhas = d.extrato.slice(0, 3).map((m) => {
            const entrada = m.tipo === "entrada";
            return `<div class="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                <div class="flex items-center gap-2"><div class="w-6 h-6 rounded-full ${entrada ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"} flex items-center justify-center text-[10px]"><i class="fa-solid fa-arrow-${entrada ? "down" : "up"}"></i></div><div><p class="font-bold text-slate-800 text-[11px]">${esc(m.descricao || "")}</p><p class="text-[9px] text-slate-400">${m.data ? m.data.split("-").reverse().join("/") : ""}${m.origem === "nota" ? " • Nota" : ""}</p></div></div>
                <span class="font-extrabold ${entrada ? "text-emerald-600" : "text-rose-600"} text-xs">${entrada ? "+" : "-"} ${brl(m.valor)}</span>
            </div>`;
        }).join("");
        const extrato = d.extrato.length ? `
            <div class="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-sm">
                <div class="flex items-center justify-between mb-1"><h3 class="font-bold text-slate-800 text-xs uppercase tracking-wide">Últimos lançamentos</h3><a href="fluxo_caixa.html" class="text-[10px] text-orange-600 font-bold">Ver tudo →</a></div>
                ${linhas}
            </div>` : "";
        return `${resumo}${envio}${feed}${extrato}${datalist}`;
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
        mount.innerHTML = isDesktop ? htmlDesktop(d) : htmlMobile(d);
        wire();
        if (isDesktop) wireDesktop();
        montarMascote(d);
    }

    function wire() {
        // Envio rápido
        const foto = mount.querySelector('[data-el="foto"]');
        if (foto) {
            const drop = mount.querySelector('[data-el="drop"]');
            const status = mount.querySelector('[data-el="status"]');
            const preview = mount.querySelector('[data-el="preview"]');
            const campos = mount.querySelector('[data-el="campos"]');
            const processar = async (arq) => {
                if (!arq) return;
                if (!/^image\//.test(arq.type)) { status.innerText = "Por enquanto envie uma foto (PNG/JPG). PDF e XML chegam na próxima fase."; return; }
                status.innerText = "Processando foto...";
                try {
                    fotoPronta = await comprimirImagem(arq);
                    preview.src = fotoPronta; preview.classList.remove("hidden");
                    campos.classList.remove("hidden");
                    status.innerText = "Foto pronta ✓";
                } catch (e) { status.innerText = "Não foi possível processar a foto."; }
            };
            foto.addEventListener("change", (e) => processar(e.target.files[0]));
            if (drop) {
                ["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag-active"); }));
                ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag-active"); }));
                drop.addEventListener("drop", (e) => { if (e.dataTransfer.files && e.dataTransfer.files[0]) processar(e.dataTransfer.files[0]); });
            }
            const btn = mount.querySelector('[data-el="enviar"]');
            if (btn) btn.addEventListener("click", async () => {
                if (!fotoPronta) { status.innerText = "Escolha a foto da nota primeiro."; return; }
                btn.disabled = true; btn.innerText = "Enviando...";
                const fornecedor = mount.querySelector('[data-el="fornecedor"]').value.trim();
                const valor = num(mount.querySelector('[data-el="valor"]').value);
                try {
                    const meuNome = localStorage.getItem("oliverNome") || "";
                    await addDoc(collection(db, "empresas", empresaId, "notas_fiscais"), {
                        foto: fotoPronta, fornecedor, valor, obs: "",
                        clienteNome: meuNome, clienteId: uid, orgId: opts.orgId || "",
                        enviadoPorUid: uid, enviadoPorNome: meuNome,
                        data: ymdLocal(), criadoEm: new Date().toISOString()
                    });
                    await addDoc(collection(db, "usuarios", uid, "fluxo_caixa"), {
                        tipo: "saida", status: "pre_lancamento", origem: "nota",
                        descricao: fornecedor || "Nota fiscal", valor,
                        categoria: "Fornecedor", data: ymdLocal(), vencimento: ymdLocal(),
                        temFoto: true, criadoEm: new Date().toISOString()
                    });
                    fotoPronta = "";
                    await montar();
                    showToast("Nota enviada!", "Ela foi para a consultoria e entrou como nota a conciliar.");
                } catch (e) { status.innerText = "Erro ao enviar: " + e.message; btn.disabled = false; btn.innerText = "Enviar nota fiscal"; }
            });
        }

        // Conciliação: confirmar / descartar
        mount.querySelectorAll("[data-pre]").forEach((card) => {
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
    function wireDesktop() {
        const modal = mount.querySelector("#oliver-modal-consultor");
        const abrir = () => { if (modal) modal.classList.remove("hidden"); };
        const b1 = mount.querySelector("#oliver-open-consultor");
        const b2 = mount.querySelector("#oliver-open-consultor-2");
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
