// Home do CLIENTE (dono do negócio) — renderização orientada a tarefas.
// Usada pela app.html: no desktop vira um painel de 3 blocos; no celular,
// uma faixa compacta e dinâmica acima dos atalhos de navegação.
//
// Blocos (Fase 1):
//  - Resumo Financeiro: Saldo do mês · A pagar · Entradas do mês (do Fluxo de Caixa).
//  - Envio Rápido: foto da nota fiscal -> envia para a consultoria E cria um
//    PRÉ-LANÇAMENTO em Contas a Pagar (status "pre_lancamento") para conciliar.
//  - Fila de Ação: pré-lançamentos a confirmar + itens para resolver pendentes.
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; };
// Data LOCAL (evita o bug de fuso do toISOString, que à noite joga para o dia seguinte)
const ymdLocal = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const dataBR = (s) => (s ? s.split("-").reverse().join("/") : "");

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

// renderHomeCliente({ db, uid, empresaId, orgId, func, mount, isDesktop })
export async function renderHomeCliente(opts) {
    const { db, uid, empresaId, func, mount, isDesktop } = opts;
    const temNotas = !!(func && func.notasFiscais) && !!empresaId;
    let fotoPronta = "";

    // ---- Carrega dados do Fluxo de Caixa do próprio cliente ----
    async function carregarDados() {
        const movs = [];
        try {
            const s = await getDocs(collection(db, "usuarios", uid, "fluxo_caixa"));
            s.forEach((d) => movs.push({ id: d.id, ...d.data() }));
        } catch (e) { console.error("home cliente: fluxo_caixa", e); }
        const mes = ymdLocal().slice(0, 7);
        const hoje = ymdLocal();
        let entradas = 0, saidas = 0, aPagar = 0, vencidas = 0;
        const preLanc = [];
        movs.forEach((m) => {
            if (m.status === "pre_lancamento") { preLanc.push(m); return; }
            if (m.status === "a_pagar") {
                aPagar += num(m.valor);
                if (m.vencimento && m.vencimento < hoje) vencidas++;
                return;
            }
            // realizado
            if ((m.data || "").startsWith(mes)) {
                if (m.tipo === "entrada") entradas += num(m.valor); else saidas += num(m.valor);
            }
        });
        preLanc.sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
        const itensPend = parseInt(localStorage.getItem("oliverItensPendentes") || "0", 10) || 0;
        return { saldo: entradas - saidas, entradas, aPagar, vencidas, preLanc, itensPend };
    }

    // ---- HTML dos blocos ----
    function blocoResumo(d) {
        const card = (rotulo, valor, cor) =>
            `<a href="fluxo_caixa.html" class="flex-1 bg-white rounded-2xl border border-slate-200 p-3 text-center hover:border-blue-400 transition">
                <div class="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">${rotulo}</div>
                <div class="font-black ${cor} ${isDesktop ? "text-xl" : "text-[13px]"} mt-1">${valor}</div>
            </a>`;
        return `<div class="flex gap-2 ${isDesktop ? "mb-4" : "mb-3"}">
            ${card("Saldo do mês", brl(d.saldo), d.saldo >= 0 ? "text-emerald-600" : "text-red-600")}
            ${card("A pagar", brl(d.aPagar), d.aPagar > 0 ? "text-red-600" : "text-slate-500")}
            ${card("Entradas (mês)", brl(d.entradas), "text-slate-700")}
        </div>`;
    }

    function blocoEnvio() {
        if (!temNotas) return "";
        return `<div class="bg-white rounded-2xl border border-slate-200 p-4 ${isDesktop ? "" : "mb-3"}">
            <p class="text-sm font-black text-blue-950 mb-1">📷 Envio rápido de nota</p>
            <p class="text-[11px] text-slate-500 mb-3">Fotografe a nota: ela vai para a sua consultoria e já entra como conta a pagar para você confirmar.</p>
            <label data-el="drop" class="block text-center border-2 border-dashed border-blue-200 bg-blue-50/60 text-blue-700 font-bold ${isDesktop ? "py-8" : "py-5"} rounded-xl cursor-pointer hover:bg-blue-100 transition">
                <span data-el="drop-label">${isDesktop ? "Arraste a foto aqui ou clique para escolher" : "Tirar / escolher foto da nota"}</span>
                <input type="file" data-el="foto" accept="image/*" capture="environment" class="hidden">
            </label>
            <img data-el="preview" class="hidden w-full max-h-48 object-contain rounded-lg border border-slate-100 mt-2">
            <div data-el="campos" class="hidden mt-2 space-y-2">
                <input data-el="fornecedor" placeholder="Fornecedor / loja (opcional)" class="w-full p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
                <input data-el="valor" type="number" step="0.01" placeholder="Valor R$ (opcional)" class="w-full p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
                <button data-el="enviar" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm">Enviar nota fiscal</button>
            </div>
            <p data-el="status" class="text-[11px] text-slate-500 text-center mt-2"></p>
        </div>`;
    }

    function cartaoPreLanc(m) {
        const venc = m.vencimento || ymdLocal();
        return `<div class="bg-amber-50 border border-amber-200 rounded-xl p-3" data-pre="${m.id}">
            <div class="flex items-center justify-between mb-2">
                <span class="text-[10px] font-black uppercase tracking-wide text-amber-700">🧾 Nota a confirmar</span>
                <span class="text-[10px] text-amber-700/70">${m.temFoto ? "foto enviada" : ""}</span>
            </div>
            <input data-f="descricao" value="${esc(m.descricao || "")}" placeholder="Fornecedor / descrição" class="w-full p-2 border border-amber-200 rounded-lg text-sm mb-2 outline-none focus:ring-2 focus:ring-amber-400">
            <div class="grid grid-cols-2 gap-2 mb-2">
                <div>
                    <label class="text-[10px] text-slate-500">Valor R$</label>
                    <input data-f="valor" type="number" step="0.01" value="${m.valor ? num(m.valor) : ""}" class="w-full p-2 border border-amber-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-400">
                </div>
                <div>
                    <label class="text-[10px] text-slate-500">Vencimento</label>
                    <input data-f="vencimento" type="date" value="${venc}" class="w-full p-2 border border-amber-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-400">
                </div>
            </div>
            <input data-f="categoria" list="cats-pre" value="${esc(m.categoria || "Fornecedor")}" placeholder="Categoria" class="w-full p-2 border border-amber-200 rounded-lg text-sm mb-2 outline-none focus:ring-2 focus:ring-amber-400">
            <div class="flex gap-2">
                <button data-a="confirmar" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 rounded-lg">✓ Confirmar e lançar</button>
                <button data-a="descartar" class="bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-bold px-3 py-2 rounded-lg">Descartar</button>
            </div>
        </div>`;
    }

    function blocoFila(d) {
        const partes = [];
        d.preLanc.forEach((m) => partes.push(cartaoPreLanc(m)));
        if (d.itensPend > 0) {
            partes.push(`<a href="itens_resolver.html" class="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 hover:border-green-400 transition">
                <div><p class="text-sm font-bold text-slate-800">✅ Itens para resolver</p><p class="text-[11px] text-slate-500">Pendências do seu último acompanhamento</p></div>
                <span class="bg-red-500 text-white text-xs font-black rounded-full min-w-[26px] h-7 px-2 flex items-center justify-center">${d.itensPend}</span>
            </a>`);
        }
        if (d.vencidas > 0) {
            partes.push(`<a href="fluxo_caixa.html" class="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl p-3 hover:border-red-400 transition">
                <div><p class="text-sm font-bold text-red-700">⚠ Contas vencidas</p><p class="text-[11px] text-red-600/80">Veja no Fluxo de Caixa</p></div>
                <span class="bg-red-500 text-white text-xs font-black rounded-full min-w-[26px] h-7 px-2 flex items-center justify-center">${d.vencidas}</span>
            </a>`);
        }
        const corpo = partes.length
            ? partes.join("")
            : `<div class="bg-white border border-slate-200 rounded-xl p-5 text-center text-sm text-slate-400">Tudo em dia por aqui ✅</div>`;
        return `<div>
            <p class="text-xs font-bold text-slate-600 mb-2 ${isDesktop ? "" : "mt-1"}">Fila de ação</p>
            <div class="space-y-2">${corpo}</div>
        </div>`;
    }

    // ---- Monta a tela ----
    async function montar() {
        const d = await carregarDados();
        const envio = blocoEnvio();
        if (isDesktop) {
            // Resumo no topo (largura total) + Envio e Fila lado a lado
            mount.innerHTML = `
                ${blocoResumo(d)}
                <div class="grid ${envio ? "grid-cols-2" : "grid-cols-1"} gap-4 items-start">
                    ${envio ? `<div>${envio}</div>` : ""}
                    <div>${blocoFila(d)}</div>
                </div>
                <datalist id="cats-pre"><option>Fornecedor</option><option>Aluguel</option><option>Salários</option><option>Impostos</option><option>Energia/Água</option><option>Serviços</option><option>Outros</option></datalist>`;
        } else {
            // Mobile: faixa compacta e dinâmica (os atalhos de navegação seguem abaixo, na app.html)
            mount.innerHTML = `
                ${blocoResumo(d)}
                ${envio}
                ${blocoFila(d)}
                <datalist id="cats-pre"><option>Fornecedor</option><option>Aluguel</option><option>Salários</option><option>Impostos</option><option>Energia/Água</option><option>Serviços</option><option>Outros</option></datalist>`;
        }
        wire(d);
    }

    // ---- Eventos ----
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
                ["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("bg-blue-100"); }));
                ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("bg-blue-100"); }));
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
                    // 1) Nota para a consultoria
                    await addDoc(collection(db, "empresas", empresaId, "notas_fiscais"), {
                        foto: fotoPronta, fornecedor, valor, obs: "",
                        clienteNome: meuNome, clienteId: uid, orgId: opts.orgId || "",
                        enviadoPorUid: uid, enviadoPorNome: meuNome,
                        data: ymdLocal(), criadoEm: new Date().toISOString()
                    });
                    // 2) Pré-lançamento em Contas a Pagar (para o cliente conciliar)
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

        // Pré-lançamentos: confirmar / descartar
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
                bConf.disabled = true; bConf.innerText = "Lançando...";
                try {
                    await updateDoc(doc(db, "usuarios", uid, "fluxo_caixa", id), {
                        status: "a_pagar", tipo: "saida",
                        descricao: val("descricao").value.trim() || "Nota fiscal",
                        valor, vencimento, data: vencimento,
                        categoria: val("categoria").value.trim() || "Fornecedor"
                    });
                    await montar();
                } catch (e) { bConf.disabled = false; bConf.innerText = "✓ Confirmar e lançar"; alert("Erro: " + e.message); }
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
