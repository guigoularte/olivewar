// Home do CLIENTE (dono do negócio) — painel orientado a tarefas.
// Usada pela app.html:
//  - Desktop: painel completo (resumo financeiro, envio de nota, fila de
//    conciliação e extrato recente), no estilo do mockup aprovado.
//  - Celular: faixa compacta e dinâmica acima dos atalhos de navegação.
//
// Ciclo nota -> caixa (Fase 1): o envio da foto grava a nota para a consultoria
// E cria um PRÉ-LANÇAMENTO em Contas a Pagar (status "pre_lancamento"), que o
// cliente concilia com 1 clique ("Aprovar e lançar" -> vira conta a pagar).
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; };
// Data LOCAL (evita o bug de fuso do toISOString, que à noite joga para o dia seguinte)
const ymdLocal = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const mesAnterior = (mes) => { const [a, m] = mes.split("-").map(Number); const d = new Date(a, m - 2, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };

const WA_MSG = "Olá Guilherme! Vim pelo app Oliver e gostaria de falar com você.";
const WA_URL = "https://wa.me/5551989286351?text=" + encodeURIComponent(WA_MSG);

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

// renderHomeCliente({ db, uid, empresaId, orgId, func, mount, isDesktop, nome, consultoriaNome })
export async function renderHomeCliente(opts) {
    const { db, uid, empresaId, func, mount, isDesktop } = opts;
    const nome = opts.nome || (localStorage.getItem("oliverNome") || "");
    const consultoriaNome = opts.consultoriaNome || "";
    const temNotas = !!(func && func.notasFiscais) && !!empresaId;
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
            // realizado (pago/recebido)
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
            preLanc, extrato: realizados.slice(0, 6), itensPend
        };
    }

    // ---------- Pedaços de HTML comuns ----------
    // Cartão de conciliação (editável — sem OCR ainda; os mesmos data-attrs servem aos dois layouts)
    function cartaoPreLanc(m) {
        const venc = m.vencimento || ymdLocal();
        return `<div class="bg-white border border-slate-200 rounded-xl p-3.5 hover:border-orange-300 transition-all" data-pre="${m.id}">
            <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center shrink-0 mt-0.5"><i class="fa-solid fa-file-invoice-dollar"></i></div>
                <div class="flex-1 min-w-0">
                    <input data-f="descricao" value="${esc(m.descricao || "")}" placeholder="Fornecedor / descrição" class="w-full font-bold text-sm text-slate-800 bg-transparent border-0 border-b border-transparent hover:border-slate-200 focus:border-orange-400 outline-none px-0 py-0.5">
                    <div class="grid grid-cols-3 gap-2 mt-2">
                        <div><label class="text-[10px] text-slate-400">Valor R$</label><input data-f="valor" type="number" step="0.01" value="${m.valor ? num(m.valor) : ""}" class="w-full p-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-orange-300"></div>
                        <div><label class="text-[10px] text-slate-400">Vencimento</label><input data-f="vencimento" type="date" value="${venc}" class="w-full p-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-orange-300"></div>
                        <div><label class="text-[10px] text-slate-400">Categoria</label><input data-f="categoria" list="cats-pre" value="${esc(m.categoria || "Fornecedor")}" class="w-full p-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-orange-300"></div>
                    </div>
                </div>
            </div>
            <div class="flex items-center justify-end gap-2 mt-3">
                <button data-a="descartar" class="text-slate-400 hover:text-rose-600 text-xs px-2 py-2 rounded-lg"><i class="fa-solid fa-trash"></i></button>
                <button data-a="confirmar" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-sm flex items-center gap-1"><i class="fa-solid fa-check"></i><span>Aprovar e lançar</span></button>
            </div>
        </div>`;
    }

    const datalist = `<datalist id="cats-pre"><option>Fornecedor</option><option>Aluguel</option><option>Salários</option><option>Impostos</option><option>Energia/Água</option><option>Serviços</option><option>Outros</option></datalist>`;

    // ======================= LAYOUT DESKTOP =======================
    function htmlDesktop(d) {
        const trend = d.trend === null ? "" :
            `<p class="text-[11px] mt-1 font-medium flex items-center ${d.trend >= 0 ? "text-emerald-600" : "text-rose-600"}"><i class="fa-solid fa-arrow-trend-${d.trend >= 0 ? "up" : "down"} mr-1"></i>${d.trend >= 0 ? "+" : ""}${d.trend.toFixed(0)}% vs. mês passado</p>`;
        const cardSaldo = `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div><p class="text-xs font-medium text-slate-500">Saldo em caixa</p><h3 class="text-2xl font-bold ${d.saldoAtual >= 0 ? "text-slate-800" : "text-rose-600"} mt-1">${brl(d.saldoAtual)}</h3>${trend}</div>
            <div class="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl"><i class="fa-solid fa-wallet"></i></div>
        </div>`;
        const avisoVenc = d.vencemHoje > 0
            ? `<p class="text-[11px] text-amber-600 mt-1 font-medium flex items-center"><i class="fa-solid fa-triangle-exclamation mr-1"></i>${d.vencemHoje} vence(m) hoje</p>`
            : (d.vencidas > 0 ? `<p class="text-[11px] text-rose-600 mt-1 font-medium flex items-center"><i class="fa-solid fa-circle-exclamation mr-1"></i>${d.vencidas} vencida(s)</p>` : `<p class="text-[11px] text-slate-400 mt-1">nada vence hoje</p>`);
        const cardPagar = `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div><p class="text-xs font-medium text-slate-500">A pagar na semana</p><h3 class="text-2xl font-bold text-rose-600 mt-1">${brl(d.aPagarSemana)}</h3>${avisoVenc}</div>
            <div class="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl"><i class="fa-solid fa-calendar-xmark"></i></div>
        </div>`;
        const cardNotas = `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between border-l-4 border-l-orange-500">
            <div><p class="text-xs font-medium text-slate-500">Notas para conciliar</p><h3 class="text-2xl font-bold text-orange-600 mt-1">${d.preLanc.length} nota(s)</h3><p class="text-[11px] text-slate-500 mt-1">Aguardando sua confirmação</p></div>
            <div class="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center text-xl"><i class="fa-solid fa-file-invoice-dollar"></i></div>
        </div>`;

        const upload = temNotas ? `
            <div class="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div class="flex items-center justify-between mb-2">
                    <h3 class="font-bold text-slate-800 text-base flex items-center gap-2"><i class="fa-solid fa-cloud-arrow-up text-orange-600"></i><span>Enviar nota fiscal</span></h3>
                    <span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-semibold">leitura automática em breve</span>
                </div>
                <p class="text-xs text-slate-500 mb-4">Fotografe a nota: ela vai para a sua consultoria e já entra como conta a pagar para você confirmar.</p>
                <label data-el="drop" class="block border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-orange-500 transition-colors bg-slate-50 cursor-pointer group">
                    <input type="file" data-el="foto" accept="image/*" capture="environment" class="hidden">
                    <div class="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform"><i class="fa-solid fa-receipt text-xl"></i></div>
                    <p class="text-xs font-semibold text-slate-700" data-el="drop-label">Arraste a foto aqui ou <span class="text-orange-600 underline">clique para selecionar</span></p>
                    <p class="text-[10px] text-slate-400 mt-1">PNG, JPG (foto do cupom/nota)</p>
                </label>
                <img data-el="preview" class="hidden w-full max-h-48 object-contain rounded-lg border border-slate-100 mt-3">
                <div data-el="campos" class="hidden mt-3 space-y-2">
                    <input data-el="fornecedor" placeholder="Fornecedor / loja (opcional)" class="w-full p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400">
                    <input data-el="valor" type="number" step="0.01" placeholder="Valor R$ (opcional)" class="w-full p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400">
                    <button data-el="enviar" class="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl text-sm">Enviar nota fiscal</button>
                </div>
                <p data-el="status" class="text-[11px] text-slate-500 text-center mt-2"></p>
            </div>` : "";

        const cartoes = d.preLanc.map(cartaoPreLanc).join("");
        const filaVazia = `<div class="text-center py-10 text-sm text-slate-400"><i class="fa-regular fa-circle-check text-3xl text-slate-300 mb-2"></i><p>Nenhuma nota aguardando.${temNotas ? " Envie uma nota ao lado para começar." : ""}</p></div>`;
        const fila = `
            <div class="${temNotas ? "lg:col-span-7" : "lg:col-span-12"} bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <h3 class="font-bold text-slate-800 text-base flex items-center gap-2"><i class="fa-solid fa-list-check text-orange-600"></i><span>Itens para resolver (conciliação rápida)</span></h3>
                        <p class="text-xs text-slate-500">Confira os dados da nota e lance no fluxo de caixa com 1 clique.</p>
                    </div>
                    <span class="bg-orange-100 text-orange-700 font-bold text-xs px-2.5 py-1 rounded-full border border-orange-200">${d.preLanc.length} pendente(s)</span>
                </div>
                <div class="space-y-3 mt-4 max-h-[360px] overflow-y-auto pr-1">${cartoes || filaVazia}</div>
            </div>`;

        // Extrato recente
        const linhas = d.extrato.map((m) => {
            const entrada = m.tipo === "entrada";
            const origem = m.origem === "nota" ? `<span class="bg-orange-50 text-orange-700 text-[10px] px-2 py-0.5 rounded font-medium">Nota conciliada</span>`
                : (entrada ? `<span class="bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded font-medium">Venda / Entrada</span>` : `<span class="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded font-medium">Lançamento</span>`);
            return `<tr>
                <td class="py-3 px-3 font-medium whitespace-nowrap">${m.data ? m.data.split("-").reverse().join("/") : ""}</td>
                <td class="py-3 px-3 font-semibold text-slate-800">${esc(m.descricao || "")}</td>
                <td class="py-3 px-3">${origem}</td>
                <td class="py-3 px-3">${esc(m.categoria || "—")}</td>
                <td class="py-3 px-3 text-right font-bold ${entrada ? "text-emerald-600" : "text-rose-600"} whitespace-nowrap">${entrada ? "+" : "-"} ${brl(m.valor)}</td>
            </tr>`;
        }).join("");
        const extrato = `
            <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <div class="flex items-center justify-between gap-2 mb-4">
                    <div><h3 class="font-bold text-slate-800 text-base">Extrato recente do fluxo de caixa</h3><p class="text-xs text-slate-500">Últimas movimentações já lançadas.</p></div>
                    <a href="fluxo_caixa.html" class="px-3 py-1.5 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium">Abrir fluxo de caixa</a>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs text-slate-600">
                        <thead class="bg-slate-50 uppercase text-[10px] text-slate-400 font-bold border-b border-slate-200"><tr>
                            <th class="py-2.5 px-3">Data</th><th class="py-2.5 px-3">Descrição</th><th class="py-2.5 px-3">Origem</th><th class="py-2.5 px-3">Categoria</th><th class="py-2.5 px-3 text-right">Valor</th>
                        </tr></thead>
                        <tbody class="divide-y divide-slate-100">${linhas || `<tr><td colspan="5" class="text-center text-slate-400 py-8">Nenhum lançamento ainda.</td></tr>`}</tbody>
                    </table>
                </div>
            </div>`;

        const badge = consultoriaNome ? `<span class="bg-orange-100 text-orange-700 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-orange-200"><i class="fa-solid fa-building mr-1"></i>${esc(consultoriaNome)}</span>` : "";
        return `
            <div class="mb-5">
                <div class="flex items-center gap-2 flex-wrap"><h2 class="text-xl font-bold text-slate-800">Olá, ${esc(nome || "bem-vindo")}</h2>${badge}</div>
                <p class="text-xs text-slate-500 mt-0.5">Acompanhe seu caixa, envie notas e resolva pendências em um só lugar.</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">${cardSaldo}${cardPagar}${cardNotas}</div>
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6 items-start">${upload}${fila}</div>
            ${extrato}
            ${datalist}`;
    }

    // ======================= LAYOUT CELULAR =======================
    function htmlMobile(d) {
        const card = (rotulo, valor, cor) =>
            `<a href="fluxo_caixa.html" class="flex-1 bg-white rounded-2xl border border-slate-200 p-3 text-center hover:border-orange-400 transition">
                <div class="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">${rotulo}</div>
                <div class="font-black ${cor} text-[13px] mt-1">${valor}</div></a>`;
        const resumo = `<div class="flex gap-2 mb-3">
            ${card("Saldo", brl(d.saldoAtual), d.saldoAtual >= 0 ? "text-emerald-600" : "text-rose-600")}
            ${card("A pagar", brl(d.aPagarSemana), d.aPagarSemana > 0 ? "text-rose-600" : "text-slate-500")}
            ${card("Conciliar", d.preLanc.length + "", d.preLanc.length > 0 ? "text-orange-600" : "text-slate-500")}
        </div>`;
        const envio = temNotas ? `
            <div class="bg-white rounded-2xl border border-slate-200 p-4 mb-3">
                <p class="text-sm font-black text-blue-950 mb-1">📷 Envio rápido de nota</p>
                <p class="text-[11px] text-slate-500 mb-3">A nota vai para a consultoria e já entra como conta a pagar para você confirmar.</p>
                <label data-el="drop" class="block text-center border-2 border-dashed border-orange-200 bg-orange-50/60 text-orange-700 font-bold py-5 rounded-xl cursor-pointer hover:bg-orange-100 transition">
                    <span data-el="drop-label">Tirar / escolher foto da nota</span>
                    <input type="file" data-el="foto" accept="image/*" capture="environment" class="hidden">
                </label>
                <img data-el="preview" class="hidden w-full max-h-48 object-contain rounded-lg border border-slate-100 mt-2">
                <div data-el="campos" class="hidden mt-2 space-y-2">
                    <input data-el="fornecedor" placeholder="Fornecedor / loja (opcional)" class="w-full p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400">
                    <input data-el="valor" type="number" step="0.01" placeholder="Valor R$ (opcional)" class="w-full p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400">
                    <button data-el="enviar" class="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl text-sm">Enviar nota fiscal</button>
                </div>
                <p data-el="status" class="text-[11px] text-slate-500 text-center mt-2"></p>
            </div>` : "";
        const partes = d.preLanc.map(cartaoPreLanc);
        if (d.itensPend > 0) partes.push(`<a href="itens_resolver.html" class="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 hover:border-green-400 transition"><div><p class="text-sm font-bold text-slate-800">✅ Itens para resolver</p><p class="text-[11px] text-slate-500">Pendências do seu acompanhamento</p></div><span class="bg-red-500 text-white text-xs font-black rounded-full min-w-[26px] h-7 px-2 flex items-center justify-center">${d.itensPend}</span></a>`);
        const fila = `<p class="text-xs font-bold text-slate-600 mb-2">Fila de ação</p><div class="space-y-2">${partes.length ? partes.join("") : `<div class="bg-white border border-slate-200 rounded-xl p-5 text-center text-sm text-slate-400">Tudo em dia por aqui ✅</div>`}</div>`;
        return `${resumo}${envio}${fila}${datalist}`;
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
                    <a href="${WA_URL}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:12px;font-weight:700;color:#16a34a;text-decoration:none">💬 Falar com a consultoria</a>
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
            ? `Você tem ${d.preLanc.length} nota(s) para conciliar. Revise o valor e toque em “Aprovar e lançar”.`
            : (d.itensPend > 0 ? `Há ${d.itensPend} item(ns) para resolver no seu acompanhamento.`
                : (temNotas ? `Envie a foto de uma nota no quadro “Enviar nota fiscal” e eu lanço no seu caixa.`
                    : `Acompanhe seu saldo e contas aqui. Precisa de algo? É só chamar a consultoria.`));
    }

    // ---------- Monta e religa eventos ----------
    async function montar() {
        const d = await carregarDados();
        mount.innerHTML = isDesktop ? htmlDesktop(d) : htmlMobile(d);
        wire();
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
                } catch (e) { bConf.disabled = false; bConf.innerHTML = '<i class="fa-solid fa-check"></i><span>Aprovar e lançar</span>'; alert("Erro: " + e.message); }
            });
            if (bDesc) bDesc.addEventListener("click", async () => {
                if (!confirm("Descartar este pré-lançamento? A nota enviada à consultoria não é afetada.")) return;
                try { await deleteDoc(doc(db, "usuarios", uid, "fluxo_caixa", id)); await montar(); }
                catch (e) { alert("Erro: " + e.message); }
            });
        });
    }

    await montar();
}
