// Cockpit do CONSULTOR (home desktop da consultoria): KPIs financeiros/comerciais,
// fila de execução do dia (com conclusão), régua de cobrança e cadência de prospects.
// Reusa crm_contatos / crm_compromissos / crm_pendencias e a coleção cobrancas.
import { collection, getDocs, getDoc, setDoc, query, where, addDoc, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ymdLocal = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const brDate = (s) => (s || "").slice(0, 10).split("-").reverse().join("/");

// Régua de cobrança — configuração padrão (editável pela consultoria, salva em empresas/{id}/config/regua)
const REGUA_PADRAO = { ativa: true, dias: [10, 5, 2, 0], mensagem: "Olá {cliente}! 😊 Passando para lembrar do seu boleto de {valor}, com vencimento em {vencimento} ({quando}). Qualquer dúvida, estou à disposição!" };
function diasAte(venc) {
    if (!venc) return null;
    const a = new Date(venc.slice(0, 10) + "T00:00:00");
    const b = new Date(ymdLocal() + "T00:00:00");
    return Math.round((a - b) / 86400000);
}
function textoQuando(d) {
    if (d == null) return "";
    if (d > 0) return "daqui a " + d + (d > 1 ? " dias" : " dia");
    if (d === 0) return "hoje";
    return "que venceu há " + (-d) + (-d > 1 ? " dias" : " dia");
}
function msgCobranca(c, cfg) {
    return (cfg && cfg.mensagem || REGUA_PADRAO.mensagem)
        .replace(/{cliente}/g, c.clienteNome || "")
        .replace(/{valor}/g, brl(c.valor))
        .replace(/{vencimento}/g, brDate(c.vencimento))
        .replace(/{quando}/g, textoQuando(diasAte(c.vencimento)));
}
function waLinkTel(tel, msg) {
    let dig = String(tel || "").replace(/\D/g, "");
    if (dig.length < 10) return "";
    if (dig.length <= 11) dig = "55" + dig;
    return "https://wa.me/" + dig + (msg ? "?text=" + encodeURIComponent(msg) : "");
}
const META_VISITAS = 6;
const ESTAGIOS = ["1. Prospecção", "2. 1ª Visita", "3. Proposta", "4. Negociação", "5. Fechado", "6. Perdido"];
const tipoDe = (c) => c.tipo_cadastro || (c.usuarioUid ? "Cliente" : "Lead");
function waLink(tel, msg) {
    let dig = String(tel || "").replace(/\D/g, "");
    if (dig.length < 10) return "";
    if (dig.length <= 11) dig = "55" + dig;
    return "https://wa.me/" + dig + (msg ? "?text=" + encodeURIComponent(msg) : "");
}
function semanaStr() {
    const h = new Date(); const dia = (h.getDay() + 6) % 7; const seg = new Date(h); seg.setDate(h.getDate() - dia); seg.setHours(0, 0, 0, 0);
    const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
    return [ymdLocal(seg), ymdLocal(dom)];
}

// renderConsultorHome({ db, empresaId, uid, nome, isAdmin, mount })
export async function renderConsultorHome(opts) {
    const { db, empresaId, uid, isAdmin, mount } = opts;
    const nome = opts.nome || "";

    async function carregar() {
        let contatos = [], comps = [], pend = [], cobr = [], cfg = { ...REGUA_PADRAO };
        const [sc, sco, sp, scb, scfg] = await Promise.all([
            getDocs(collection(db, "empresas", empresaId, "crm_contatos")),
            isAdmin ? getDocs(collection(db, "empresas", empresaId, "crm_compromissos"))
                : getDocs(query(collection(db, "empresas", empresaId, "crm_compromissos"), where("funcionarioUid", "==", uid))),
            getDocs(collection(db, "empresas", empresaId, "crm_pendencias")),
            getDocs(collection(db, "empresas", empresaId, "cobrancas")),
            getDoc(doc(db, "empresas", empresaId, "config", "regua")).catch(() => null)
        ]);
        contatos = sc.docs.map(d => ({ id: d.id, ...d.data() }));
        comps = sco.docs.map(d => ({ id: d.id, ...d.data() }));
        pend = sp.docs.map(d => ({ id: d.id, ...d.data() }));
        cobr = scb.docs.map(d => ({ id: d.id, ...d.data() }));
        if (scfg && scfg.exists()) cfg = { ...REGUA_PADRAO, ...scfg.data() };
        return { contatos, comps, pend, cobr, cfg };
    }

    function montar(dados) {
        const { contatos, comps, pend, cobr } = dados;
        const cfg = dados.cfg || { ...REGUA_PADRAO };
        const hoje = ymdLocal();
        const [ini, fim] = semanaStr();
        const mesAtual = hoje.slice(0, 7).split("-").reverse().join("/"); // MM/AAAA
        const leads = contatos.filter(c => tipoDe(c) === "Lead");

        // ---- KPIs financeiros (cobrancas) ----
        const naoPagas = cobr.filter(c => c.status !== "pago");
        const aReceberMes = naoPagas.filter(c => (c.competencia || "") === mesAtual).reduce((s, c) => s + Number(c.valor || 0), 0);
        const faturasAbertas = naoPagas.length;
        const vencidasCobr = naoPagas.filter(c => c.vencimento && c.vencimento < hoje);
        const totalVencido = vencidasCobr.reduce((s, c) => s + Number(c.valor || 0), 0);

        // ---- KPIs comerciais / operacionais ----
        const visitas = comps.filter(c => c.tipo === "visita" && c.data && c.data.slice(0, 10) >= ini && c.data.slice(0, 10) <= fim).length;
        const pendFeitasSemana = pend.filter(p => p.status === "feito" && (p.concluidoEm || "").slice(0, 10) >= ini).length;
        const pendAbertas = pend.filter(p => p.status !== "feito").length;
        const entregasTotal = pendFeitasSemana + pendAbertas;

        // ---- Fila de execução ----
        const pendVenc = pend.filter(p => p.status !== "feito" && p.prazo && p.prazo < hoje).sort((a, b) => (a.prazo || "").localeCompare(b.prazo || ""));
        const compsHoje = comps.filter(c => c.status !== "concluido" && c.data && c.data.slice(0, 10) === hoje).sort((a, b) => (a.data || "").localeCompare(b.data || ""));
        const followAtrasados = leads.filter(c => c.proximo_contato && c.proximo_contato < hoje).sort((a, b) => (a.proximo_contato || "").localeCompare(b.proximo_contato || ""));
        const concluidasHoje = pend.filter(p => p.status === "feito" && (p.concluidoEm || "").slice(0, 10) === hoje)
            .concat(comps.filter(c => c.status === "concluido" && (c.concluidoEm || c.data || "").slice(0, 10) === hoje));

        const fila = [];
        pendVenc.forEach(p => fila.push({ id: p.id, col: "crm_pendencias", kind: "pend", grupo: "Atrasado", cls: "bg-rose-100 text-rose-700", cliente: p.contatoNome || p.clienteNome || "—", titulo: p.titulo || p.descricao || "Pendência", resp: p.responsavel || p.funcionarioNome || "", quando: brDate(p.prazo), check: true, done: false }));
        compsHoje.forEach(c => fila.push({ id: c.id, col: "crm_compromissos", kind: "comp", grupo: c.tipo === "visita" ? "Visita" : "Hoje", cls: c.tipo === "visita" ? "bg-indigo-100 text-indigo-700" : "bg-orange-100 text-orange-700", cliente: c.contatoNome || "—", titulo: c.titulo || "Compromisso", resp: c.funcionarioNome || c.responsavel || "", quando: (c.data || "").slice(11, 16) || "Hoje", check: true, done: false }));
        followAtrasados.forEach(c => fila.push({ id: c.id, col: "", kind: "follow", grupo: "Follow-up", cls: "bg-amber-100 text-amber-700", cliente: c.nome || "—", titulo: "Retomar contato (" + (c.estagio_funil || "Prospecção").replace(/^\d+\.\s/, "") + ")", resp: c.responsavel || "", quando: "Prev. " + brDate(c.proximo_contato), check: false, done: false }));
        concluidasHoje.slice(0, 3).forEach(x => fila.push({ id: x.id, col: x.titulo && x.tipo ? "crm_compromissos" : "crm_pendencias", kind: "done", grupo: "Concluído", cls: "bg-emerald-100 text-emerald-700", cliente: x.contatoNome || x.clienteNome || "—", titulo: x.titulo || x.descricao || "Item", resp: x.responsavel || x.funcionarioNome || "", quando: "Concluído", check: true, done: true }));

        const responsaveis = [...new Set(fila.filter(f => !f.done).map(f => f.resp).filter(Boolean))];

        // ---- Cadência de prospects ----
        const cadencia = leads.filter(c => c.estagio_funil !== "5. Fechado" && c.estagio_funil !== "6. Perdido")
            .sort((a, b) => (a.proximo_contato || "9999").localeCompare(b.proximo_contato || "9999")).slice(0, 6);

        // =================== HTML ===================
        const kpi = (rot, val, cor, sub) => `<div class="bg-white rounded-xl border border-slate-200 p-4">
            <div class="text-[12px] text-slate-500 font-medium">${rot}</div>
            <div class="text-2xl font-extrabold ${cor} mt-1">${val}</div>${sub ? `<div class="text-[11px] text-slate-400 mt-1">${sub}</div>` : ""}</div>`;

        const linhaFila = (f) => `
            <div class="fila-row grid grid-cols-[28px_110px_160px_1fr_120px_90px] items-center gap-3 px-3 py-2.5 border rounded-lg text-[13px] transition ${f.done ? "border-slate-100 bg-slate-50/60 opacity-60" : "border-slate-200 hover:bg-slate-50"}" data-resp="${esc(f.resp)}">
                ${f.check
                    ? `<button data-check="${f.id}" data-col="${f.col}" data-done="${f.done ? 1 : 0}" class="w-5 h-5 rounded-md border-2 ${f.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 bg-white hover:border-emerald-400"} flex items-center justify-center">${f.done ? '<i class="fa-solid fa-check text-[10px]"></i>' : ""}</button>`
                    : `<span class="w-5 h-5 rounded-md bg-amber-100 text-amber-600 flex items-center justify-center text-[9px]"><i class="fa-solid fa-bell"></i></span>`}
                <span class="text-[11px] font-bold uppercase text-center px-2 py-1 rounded-md ${f.cls}">${esc(f.grupo)}</span>
                <strong class="truncate text-slate-800 ${f.done ? "line-through" : ""}">${esc(f.cliente)}</strong>
                <span class="truncate text-slate-600 ${f.done ? "line-through" : ""}">${esc(f.titulo)}</span>
                <span class="text-[11px] font-semibold text-center text-slate-600 bg-slate-100 rounded-md px-2 py-1 truncate ${f.done ? "opacity-60" : ""}">${esc(f.resp) || "—"}</span>
                <span class="text-[12px] text-slate-500 text-right ${f.done ? "line-through" : ""}">${esc(f.quando)}</span>
            </div>`;
        const filaHtml = fila.length ? fila.map(linhaFila).join("") : `<div class="border border-slate-200 rounded-lg p-5 text-center text-sm text-slate-400">Nada na fila de hoje. Tudo em dia.</div>`;
        const pills = ["Todos", ...responsaveis];
        const pillsHtml = pills.map((p, i) => `<button class="fila-pill px-3 py-1.5 text-[12px] font-semibold rounded-md transition ${i === 0 ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}" data-filter="${esc(p)}">${esc(p)}</button>`).join("");

        // Régua de cobrança
        const linhaCobr = (c) => {
            const venc = c.vencimento || "";
            const pago = c.status === "pago";
            const atras = !pago && venc && venc < hoje;
            const d = diasAte(venc);
            const enviarHoje = cfg.ativa && !pago && Array.isArray(cfg.dias) && cfg.dias.includes(d);
            const statusTxt = pago ? "Pago" : atras ? "Vencida" : "Em aberto";
            const wa = (!pago && c.clienteTel) ? waLinkTel(c.clienteTel, msgCobranca(c, cfg)) : "";
            const btnWa = (!pago)
                ? (wa
                    ? `<a href="${wa}" target="_blank" rel="noopener" title="Cobrar no WhatsApp" class="text-[11px] font-bold px-2 py-1 rounded-md border ${enviarHoje ? "border-green-500 bg-green-500 text-white" : "border-green-500 text-green-600 bg-green-50"} hover:bg-green-600 hover:text-white transition flex items-center gap-1"><i class="fa-brands fa-whatsapp"></i>${enviarHoje ? "Cobrar" : ""}</a>`
                    : `<button data-edit="${c.id}" title="Adicionar WhatsApp do cliente" class="text-[11px] font-semibold px-2 py-1 rounded-md border border-slate-200 text-slate-400 hover:text-green-600"><i class="fa-brands fa-whatsapp"></i>+tel</button>`)
                : "";
            return `<div class="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0 ${enviarHoje ? "bg-green-50/40 -mx-2 px-2 rounded-lg" : ""}">
                <div class="min-w-0"><strong class="text-[13px] text-slate-800 block truncate">${esc(c.clienteNome || "—")}${enviarHoje ? ` <span class="text-[9px] font-bold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded">enviar hoje</span>` : ""}</strong>
                <div class="text-[11px] ${atras ? "text-rose-600" : "text-slate-500"}">Venc. ${brDate(venc)} · ${esc(statusTxt)}${!pago && d != null ? " · " + textoQuando(d) : ""}</div></div>
                <div class="flex items-center gap-1.5 shrink-0"><strong class="text-[13px] text-slate-800">${brl(c.valor)}</strong>
                ${btnWa}
                ${pago
                    ? `<span class="text-[11px] font-bold text-emerald-600">✓ PAGO</span><button data-reabrir="${c.id}" title="Reabrir cobrança" class="text-slate-400 hover:text-amber-600 text-[12px] px-1"><i class="fa-solid fa-rotate-left"></i></button>`
                    : `<button data-baixa="${c.id}" class="text-[11px] font-bold px-2 py-1 rounded-md border border-emerald-500 text-emerald-600 bg-emerald-50 hover:bg-emerald-500 hover:text-white transition">Baixa</button>`}
                <button data-edit="${c.id}" title="Editar" class="text-slate-400 hover:text-orange-600 text-[12px] px-1"><i class="fa-solid fa-pen"></i></button>
                </div></div>`;
        };
        const cobrOrd = cobr.slice().sort((a, b) => (a.status === "pago" ? 1 : 0) - (b.status === "pago" ? 1 : 0) || (a.vencimento || "").localeCompare(b.vencimento || ""));
        const aEnviarHoje = cobr.filter(c => c.status !== "pago" && cfg.ativa && Array.isArray(cfg.dias) && cfg.dias.includes(diasAte(c.vencimento))).length;
        const cobrHtml = cobrOrd.length ? cobrOrd.slice(0, 10).map(linhaCobr).join("")
            : `<div class="py-6 text-center text-sm text-slate-400">Nenhuma fatura lançada.<br><button data-nova="cobranca" class="mt-2 text-[12px] font-bold text-orange-600">+ Lançar cobrança</button></div>`;

        // Cadência
        const cadHtml = cadencia.length ? cadencia.map(c => {
            const atrasado = c.proximo_contato && c.proximo_contato < hoje;
            return `<div class="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                <div class="min-w-0"><strong class="text-[13px] text-slate-800 truncate block">${esc(c.nome) || "(sem nome)"}</strong>
                <div class="text-[11px] text-slate-500">${esc(c.responsavel || "—")}${c.proximo_contato ? " · Próx: <b class='" + (atrasado ? "text-rose-600" : "text-slate-600") + "'>" + brDate(c.proximo_contato) + "</b>" : ""}</div></div>
                <span class="text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md shrink-0">${esc((c.estagio_funil || "1. Prospecção").replace(/^\d+\.\s/, ""))}</span>
            </div>`;
        }).join("") : `<div class="py-4 text-center text-sm text-slate-400">Nenhum prospect ativo.</div>`;

        // Modal Nova Ação
        const modal = `
        <div data-el="modal" class="hidden fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div data-m="backdrop" class="absolute inset-0 bg-black/40"></div>
            <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
                <div class="flex items-center justify-between"><h3 class="text-base font-extrabold text-slate-800"><i class="fa-solid fa-bolt text-orange-500 mr-1"></i><span data-m="titulo">Nova ação</span></h3><button data-m="fechar" class="w-8 h-8 rounded-full bg-slate-100 text-slate-400 font-bold">✕</button></div>
                <div data-m="wraptipo"><label class="text-[12px] font-semibold text-slate-500">Tipo</label>
                    <select data-m="tipo" class="w-full p-2.5 border border-slate-200 rounded-xl text-sm mt-1 outline-none focus:ring-2 focus:ring-orange-300">
                        <option value="cobranca">Cobrança / fatura</option>
                        <option value="tarefa">Tarefa operacional</option>
                        <option value="visita">Visita (conta na meta)</option>
                        <option value="lead">Novo lead</option>
                    </select></div>
                <div><label class="text-[12px] font-semibold text-slate-500" data-m="lblcli">Cliente</label>
                    <input data-m="cliente" placeholder="Nome do cliente / prospect" class="w-full p-2.5 border border-slate-200 rounded-xl text-sm mt-1 outline-none focus:ring-2 focus:ring-orange-300"></div>
                <div data-m="wrapdesc"><label class="text-[12px] font-semibold text-slate-500">Descrição / próximo passo</label>
                    <input data-m="desc" placeholder="Ex.: Enviar proposta BPF" class="w-full p-2.5 border border-slate-200 rounded-xl text-sm mt-1 outline-none focus:ring-2 focus:ring-orange-300"></div>
                <div data-m="wrapvalor" class="grid grid-cols-2 gap-2">
                    <div><label class="text-[12px] font-semibold text-slate-500">Valor R$</label><input data-m="valor" type="number" step="0.01" class="w-full p-2.5 border border-slate-200 rounded-xl text-sm mt-1 outline-none focus:ring-2 focus:ring-orange-300"></div>
                    <div><label class="text-[12px] font-semibold text-slate-500">Vencimento</label><input data-m="venc" type="date" value="${hoje}" class="w-full p-2.5 border border-slate-200 rounded-xl text-sm mt-1 outline-none focus:ring-2 focus:ring-orange-300"></div>
                </div>
                <div data-m="wraptel"><label class="text-[12px] font-semibold text-slate-500"><i class="fa-brands fa-whatsapp text-green-600"></i> WhatsApp do cliente (p/ cobrança)</label>
                    <input data-m="tel" placeholder="Ex.: 47 99999-9999" class="w-full p-2.5 border border-slate-200 rounded-xl text-sm mt-1 outline-none focus:ring-2 focus:ring-orange-300"></div>
                <div data-m="wrapstatus" class="hidden"><label class="text-[12px] font-semibold text-slate-500">Status</label>
                    <select data-m="status" class="w-full p-2.5 border border-slate-200 rounded-xl text-sm mt-1 outline-none focus:ring-2 focus:ring-orange-300">
                        <option value="pendente">Em aberto</option>
                        <option value="enviado_d5">Enviado D-5</option>
                        <option value="pago">Pago</option>
                    </select></div>
                <div><label class="text-[12px] font-semibold text-slate-500">Responsável</label>
                    <input data-m="resp" value="${esc(nome)}" list="resp-cockpit" class="w-full p-2.5 border border-slate-200 rounded-xl text-sm mt-1 outline-none focus:ring-2 focus:ring-orange-300">
                    <datalist id="resp-cockpit">${responsaveis.map(r => `<option>${esc(r)}</option>`).join("")}</datalist></div>
                <div class="flex gap-2">
                    <button data-m="excluir" class="hidden px-3 py-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 font-bold text-sm"><i class="fa-solid fa-trash"></i></button>
                    <button data-m="salvar" class="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-xl text-sm">Salvar</button>
                </div>
                <p data-m="msg" class="text-[12px] text-center text-slate-500"></p>
            </div>
        </div>`;

        // Modal de configuração da Régua de Cobrança
        const cfgModal = `
        <div data-el="cfgmodal" class="hidden fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div data-cm="backdrop" class="absolute inset-0 bg-black/40"></div>
            <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
                <div class="flex items-center justify-between"><h3 class="text-base font-extrabold text-slate-800"><i class="fa-brands fa-whatsapp text-green-600 mr-1"></i>Régua de Cobrança</h3><button data-cm="fechar" class="w-8 h-8 rounded-full bg-slate-100 text-slate-400 font-bold">✕</button></div>
                <label class="flex items-center gap-2 text-sm font-semibold text-slate-700"><input data-cm="ativa" type="checkbox" class="w-4 h-4"> Régua ativa (mostra quem cobrar hoje)</label>
                <div><label class="text-[12px] font-semibold text-slate-500">Avisar quantos dias antes do vencimento</label>
                    <input data-cm="dias" placeholder="10, 5, 2, 0" class="w-full p-2.5 border border-slate-200 rounded-xl text-sm mt-1 outline-none focus:ring-2 focus:ring-green-300">
                    <p class="text-[10px] text-slate-400 mt-1">Separe por vírgula. Use <b>0</b> para o dia do vencimento (ex.: 10, 5, 2, 0).</p></div>
                <div><label class="text-[12px] font-semibold text-slate-500">Mensagem enviada ao cliente</label>
                    <textarea data-cm="mensagem" rows="4" class="w-full p-2.5 border border-slate-200 rounded-xl text-sm mt-1 outline-none focus:ring-2 focus:ring-green-300 resize-none"></textarea>
                    <p class="text-[10px] text-slate-400 mt-1">Use: <b>{cliente}</b>, <b>{valor}</b>, <b>{vencimento}</b>, <b>{quando}</b> (ex.: "daqui a 5 dias").</p></div>
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-2.5"><p class="text-[10px] text-slate-400 mb-0.5">Prévia:</p><p data-cm="previa" class="text-[12px] text-slate-700 whitespace-pre-wrap"></p></div>
                <button data-cm="salvar" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-xl text-sm">Salvar configuração</button>
                <p data-cm="msg" class="text-[12px] text-center text-slate-500"></p>
            </div>
        </div>`;

        mount.innerHTML = `
            <div class="flex items-center justify-between flex-wrap gap-3 mb-5">
                <div>
                    <h2 class="text-xl font-bold text-slate-800">Cockpit Principal${nome ? " — " + esc(nome) : ""}</h2>
                    <p class="text-[13px] text-slate-500">Visão unificada de cobranças, prospecção comercial e fila operacional</p>
                </div>
                <div class="flex gap-2">
                    <button data-el="sync" class="px-3.5 py-2 rounded-lg text-[13px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><i class="fa-solid fa-rotate"></i>Sincronizar</button>
                    <button data-nova="" class="px-3.5 py-2 rounded-lg text-[13px] font-semibold bg-orange-500 text-white hover:bg-orange-600 flex items-center gap-1.5"><i class="fa-solid fa-plus"></i>Nova Ação</button>
                </div>
            </div>

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                ${kpi("A Receber (Mês Atual)", brl(aReceberMes), "text-indigo-600", faturasAbertas + " fatura(s) aberta(s)")}
                ${kpi("Pendências Vencidas", brl(totalVencido), totalVencido > 0 ? "text-rose-600" : "text-slate-700", vencidasCobr.length + " em atraso")}
                ${kpi("Prospects Visitados (Semana)", visitas + " / " + META_VISITAS, visitas >= META_VISITAS ? "text-emerald-600" : "text-orange-500", "meta 2 por sócio")}
                ${kpi("Entregas Operacionais", pendFeitasSemana + " / " + (entregasTotal || 0), "text-emerald-600", "fila da semana")}
            </div>

            <div class="bg-white border border-slate-200 rounded-xl p-5 mb-5">
                <div class="flex items-center justify-between flex-wrap gap-3 mb-4">
                    <p class="text-[15px] font-bold text-slate-800">Fila de Execução do Dia</p>
                    <div class="flex gap-1 bg-slate-100 p-1 rounded-lg">${pillsHtml}</div>
                </div>
                <div class="flex flex-col gap-2">${filaHtml}</div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div class="bg-white border border-slate-200 rounded-xl p-5">
                    <div class="flex items-center justify-between mb-2">
                        <p class="text-[15px] font-bold text-slate-800">Régua de Cobrança</p>
                        <div class="flex items-center gap-3">
                            <button data-el="cfg-regua" class="text-[12px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"><i class="fa-solid fa-gear"></i>Configurar</button>
                            <button data-nova="cobranca" class="text-[12px] font-bold text-orange-600 hover:text-orange-700">+ Lançar</button>
                        </div>
                    </div>
                    <p class="text-[11px] mb-1 ${aEnviarHoje > 0 ? "text-green-600 font-semibold" : "text-slate-400"}">
                        ${cfg.ativa ? (aEnviarHoje > 0 ? `<i class="fa-brands fa-whatsapp"></i> ${aEnviarHoje} cobrança(s) para enviar hoje · avisar ${(cfg.dias || []).join(", ")} dias antes` : `Régua ativa · avisar ${(cfg.dias || []).join(", ")} dias antes do vencimento`) : "Régua desligada — ligue em Configurar"}
                    </p>
                    <div>${cobrHtml}</div>
                </div>
                <div class="bg-white border border-slate-200 rounded-xl p-5">
                    <div class="flex items-center justify-between mb-2">
                        <p class="text-[15px] font-bold text-slate-800">Cadência de Prospects</p>
                        <a href="crm.html" class="text-[11px] font-bold text-indigo-600">CRM →</a>
                    </div>
                    <div>${cadHtml}</div>
                </div>
            </div>
            ${modal}${cfgModal}`;

        wire(dados);
    }

    // =================== Eventos ===================
    function wire(dados) {
        // Filtro por responsável
        const pillEls = mount.querySelectorAll(".fila-pill");
        const rowEls = mount.querySelectorAll(".fila-row");
        pillEls.forEach(btn => btn.addEventListener("click", () => {
            const f = btn.getAttribute("data-filter");
            pillEls.forEach(p => { p.classList.remove("bg-white", "text-slate-800", "shadow-sm"); p.classList.add("text-slate-500"); });
            btn.classList.add("bg-white", "text-slate-800", "shadow-sm"); btn.classList.remove("text-slate-500");
            rowEls.forEach(r => { r.style.display = (f === "Todos" || r.getAttribute("data-resp") === f) ? "" : "none"; });
        }));

        // Concluir item da fila
        mount.querySelectorAll("[data-check]").forEach(btn => btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-check"); const col = btn.getAttribute("data-col"); const done = btn.getAttribute("data-done") === "1";
            if (!col || done) return; // itens já concluídos não reabrem aqui
            btn.disabled = true;
            try {
                if (col === "crm_pendencias") await updateDoc(doc(db, "empresas", empresaId, col, id), { status: "feito", concluidoEm: new Date().toISOString() });
                else await updateDoc(doc(db, "empresas", empresaId, col, id), { status: "concluido", concluidoEm: new Date().toISOString() });
                await recarregar();
            } catch (e) { btn.disabled = false; alert("Não foi possível concluir: " + e.message); }
        }));

        // Dar baixa na cobrança
        mount.querySelectorAll("[data-baixa]").forEach(btn => btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-baixa"); btn.disabled = true; btn.textContent = "...";
            try { await updateDoc(doc(db, "empresas", empresaId, "cobrancas", id), { status: "pago", dataPagamento: ymdLocal() }); await recarregar(); }
            catch (e) { btn.disabled = false; btn.textContent = "Dar Baixa"; alert("Erro ao dar baixa: " + e.message); }
        }));

        // Reabrir cobrança paga
        mount.querySelectorAll("[data-reabrir]").forEach(btn => btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-reabrir"); btn.disabled = true;
            try { await updateDoc(doc(db, "empresas", empresaId, "cobrancas", id), { status: "pendente", dataPagamento: null }); await recarregar(); }
            catch (e) { btn.disabled = false; alert("Erro ao reabrir: " + e.message); }
        }));

        // Editar cobrança
        mount.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-edit");
            const alvo = (dados.cobr || []).find(c => c.id === id);
            if (alvo) abrirModal("cobranca", alvo);
        }));

        // Sincronizar
        const sync = mount.querySelector('[data-el="sync"]');
        if (sync) sync.addEventListener("click", () => recarregar());

        // Abrir modal Nova Ação
        mount.querySelectorAll("[data-nova]").forEach(btn => btn.addEventListener("click", () => abrirModal(btn.getAttribute("data-nova") || "")));

        // Configurar a Régua de Cobrança
        const cfgBtn = mount.querySelector('[data-el="cfg-regua"]');
        if (cfgBtn) cfgBtn.addEventListener("click", () => abrirCfgModal(dados.cfg || { ...REGUA_PADRAO }));
    }

    function abrirCfgModal(cfg) {
        const modal = mount.querySelector('[data-el="cfgmodal"]'); if (!modal) return;
        modal.classList.remove("hidden");
        modal.querySelectorAll('[data-cm="fechar"], [data-cm="backdrop"]').forEach(b => b.onclick = () => modal.classList.add("hidden"));
        const ativa = modal.querySelector('[data-cm="ativa"]');
        const dias = modal.querySelector('[data-cm="dias"]');
        const mensagem = modal.querySelector('[data-cm="mensagem"]');
        const previa = modal.querySelector('[data-cm="previa"]');
        ativa.checked = cfg.ativa !== false;
        dias.value = (cfg.dias || REGUA_PADRAO.dias).join(", ");
        mensagem.value = cfg.mensagem || REGUA_PADRAO.mensagem;
        const exemplo = { clienteNome: "João", valor: 250, vencimento: ymdLocal(new Date(Date.now() + 5 * 86400000)) };
        const atualizarPrevia = () => { previa.textContent = msgCobranca(exemplo, { mensagem: mensagem.value }); };
        mensagem.oninput = atualizarPrevia; atualizarPrevia();
        const salvar = modal.querySelector('[data-cm="salvar"]');
        const msg = modal.querySelector('[data-cm="msg"]');
        salvar.onclick = async () => {
            const arr = dias.value.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
            salvar.disabled = true; msg.textContent = "Salvando..."; msg.className = "text-[12px] text-center text-slate-500";
            try {
                await setDoc(doc(db, "empresas", empresaId, "config", "regua"), {
                    ativa: ativa.checked, dias: arr.length ? arr : REGUA_PADRAO.dias, mensagem: mensagem.value, atualizadoEm: new Date().toISOString()
                }, { merge: true });
                modal.classList.add("hidden");
                await recarregar();
            } catch (e) { salvar.disabled = false; msg.textContent = "Erro: " + e.message; msg.className = "text-[12px] text-center text-rose-600"; }
        };
    }

    function abrirModal(tipoInicial, editCobr) {
        const modal = mount.querySelector('[data-el="modal"]'); if (!modal) return;
        modal.classList.remove("hidden");
        const fechar = () => modal.classList.add("hidden");
        modal.querySelectorAll('[data-m="fechar"], [data-m="backdrop"]').forEach(b => b.onclick = fechar);
        const tipo = modal.querySelector('[data-m="tipo"]');
        if (tipoInicial) tipo.value = tipoInicial;
        const wrapDesc = modal.querySelector('[data-m="wrapdesc"]');
        const wrapValor = modal.querySelector('[data-m="wrapvalor"]');
        const wrapTel = modal.querySelector('[data-m="wraptel"]');
        const wrapStatus = modal.querySelector('[data-m="wrapstatus"]');
        const wrapTipo = modal.querySelector('[data-m="wraptipo"]');
        const lblCli = modal.querySelector('[data-m="lblcli"]');
        const btnExcluir = modal.querySelector('[data-m="excluir"]');
        const titulo = modal.querySelector('[data-m="titulo"]');
        const ajustar = () => {
            const t = tipo.value;
            wrapValor.style.display = t === "cobranca" ? "grid" : "none";
            wrapTel.style.display = t === "cobranca" ? "block" : "none";
            wrapDesc.style.display = (t === "tarefa") ? "block" : "none";
            lblCli.textContent = t === "lead" ? "Nome do lead" : "Cliente";
        };
        tipo.onchange = ajustar;

        // Modo edição de cobrança
        const emEdicao = !!editCobr;
        titulo.textContent = emEdicao ? "Editar cobrança" : "Nova ação";
        wrapTipo.style.display = emEdicao ? "none" : "block";
        wrapStatus.classList.toggle("hidden", !emEdicao);
        btnExcluir.classList.toggle("hidden", !emEdicao);
        if (emEdicao) {
            tipo.value = "cobranca";
            modal.querySelector('[data-m="cliente"]').value = editCobr.clienteNome || "";
            modal.querySelector('[data-m="valor"]').value = editCobr.valor != null ? editCobr.valor : "";
            modal.querySelector('[data-m="venc"]').value = (editCobr.vencimento || "").slice(0, 10);
            modal.querySelector('[data-m="tel"]').value = editCobr.clienteTel || "";
            modal.querySelector('[data-m="status"]').value = (editCobr.status === "vencido" || !editCobr.status) ? "pendente" : editCobr.status;
        } else {
            modal.querySelector('[data-m="cliente"]').value = "";
            modal.querySelector('[data-m="desc"]').value = "";
            modal.querySelector('[data-m="valor"]').value = "";
            modal.querySelector('[data-m="tel"]').value = "";
        }
        ajustar();

        btnExcluir.onclick = async () => {
            if (!emEdicao) return;
            if (!confirm("Excluir esta cobrança de " + (editCobr.clienteNome || "") + "? Esta ação não pode ser desfeita.")) return;
            btnExcluir.disabled = true;
            try { await deleteDoc(doc(db, "empresas", empresaId, "cobrancas", editCobr.id)); modal.classList.add("hidden"); await recarregar(); }
            catch (e) { btnExcluir.disabled = false; alert("Erro ao excluir: " + e.message); }
        };

        const salvar = modal.querySelector('[data-m="salvar"]');
        salvar.onclick = async () => {
            const t = emEdicao ? "cobranca" : tipo.value;
            const cliente = modal.querySelector('[data-m="cliente"]').value.trim();
            const desc = modal.querySelector('[data-m="desc"]').value.trim();
            const valor = parseFloat(modal.querySelector('[data-m="valor"]').value || "0");
            const venc = modal.querySelector('[data-m="venc"]').value;
            const tel = modal.querySelector('[data-m="tel"]').value.trim();
            const resp = modal.querySelector('[data-m="resp"]').value.trim();
            const msg = modal.querySelector('[data-m="msg"]');
            if (!cliente) { msg.textContent = "Informe o cliente."; msg.className = "text-[12px] text-center text-rose-600"; return; }
            if (t === "cobranca" && !(valor > 0)) { msg.textContent = "Informe o valor da cobrança."; msg.className = "text-[12px] text-center text-rose-600"; return; }
            salvar.disabled = true; msg.textContent = "Salvando..."; msg.className = "text-[12px] text-center text-slate-500";
            const agora = new Date().toISOString(); const hoje = ymdLocal();
            try {
                if (emEdicao) {
                    const novoStatus = modal.querySelector('[data-m="status"]').value;
                    const comp = (venc || hoje).slice(0, 7).split("-").reverse().join("/");
                    await updateDoc(doc(db, "empresas", empresaId, "cobrancas", editCobr.id), {
                        clienteNome: cliente, clienteTel: tel, valor, vencimento: venc || hoje, competencia: comp, status: novoStatus,
                        dataPagamento: novoStatus === "pago" ? (editCobr.dataPagamento || hoje) : null
                    });
                } else if (t === "cobranca") {
                    const comp = (venc || hoje).slice(0, 7).split("-").reverse().join("/");
                    await addDoc(collection(db, "empresas", empresaId, "cobrancas"), { clienteNome: cliente, clienteTel: tel, valor, competencia: comp, vencimento: venc || hoje, status: "pendente", dataPagamento: null, criadoEm: agora });
                } else if (t === "tarefa") {
                    await addDoc(collection(db, "empresas", empresaId, "crm_pendencias"), { titulo: desc || ("Tarefa — " + cliente), contatoNome: cliente, responsavel: resp || nome, origem: "avulsa", status: "aberto", prazo: hoje, criadoEm: agora });
                } else if (t === "visita") {
                    await addDoc(collection(db, "empresas", empresaId, "crm_compromissos"), { titulo: "Visita — " + cliente, contatoNome: cliente, tipo: "visita", data: hoje + "T09:00", funcionarioUid: uid, funcionarioNome: resp || nome, status: "aberto", criadoEm: agora });
                } else {
                    await addDoc(collection(db, "empresas", empresaId, "crm_contatos"), { nome: cliente, tipo_cadastro: "Lead", estagio_funil: "1. Prospecção", responsavel: resp || nome, proximo_contato: hoje, origem_canal: "cockpit", criadoEm: agora });
                }
                modal.classList.add("hidden");
                await recarregar();
            } catch (e) { salvar.disabled = false; msg.textContent = "Erro: " + e.message; msg.className = "text-[12px] text-center text-rose-600"; }
        };
    }

    async function recarregar() {
        try { montar(await carregar()); } catch (e) { console.error("cockpit consultor:", e); }
    }

    try { montar(await carregar()); }
    catch (e) { console.error("cockpit consultor:", e); mount.innerHTML = ""; }
}
