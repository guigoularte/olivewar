// Cockpit do CONSULTOR (home da consultoria): fila de follow-ups, visitas da semana,
// pendências e funil — lê o CRM da empresa (crm_contatos / crm_compromissos / crm_pendencias).
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ymdLocal = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
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
    let contatos = [], comps = [], pend = [];
    try {
        const [sc, sco, sp] = await Promise.all([
            getDocs(collection(db, "empresas", empresaId, "crm_contatos")),
            isAdmin ? getDocs(collection(db, "empresas", empresaId, "crm_compromissos"))
                : getDocs(query(collection(db, "empresas", empresaId, "crm_compromissos"), where("funcionarioUid", "==", uid))),
            getDocs(collection(db, "empresas", empresaId, "crm_pendencias"))
        ]);
        contatos = sc.docs.map(d => ({ id: d.id, ...d.data() }));
        comps = sco.docs.map(d => ({ id: d.id, ...d.data() }));
        pend = sp.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { console.error("cockpit consultor:", e); mount.innerHTML = ""; return; }

    const hoje = ymdLocal();
    const [ini, fim] = semanaStr();
    const leads = contatos.filter(c => tipoDe(c) === "Lead");
    const followAtrasados = leads.filter(c => c.proximo_contato && c.proximo_contato < hoje)
        .sort((a, b) => (a.proximo_contato || "").localeCompare(b.proximo_contato || ""));
    const visitas = comps.filter(c => c.tipo === "visita" && c.data && c.data.slice(0, 10) >= ini && c.data.slice(0, 10) <= fim).length;
    const pendVenc = pend.filter(p => p.status !== "feito" && p.prazo && p.prazo < hoje);
    const compsHoje = comps.filter(c => c.status !== "concluido" && c.data && c.data.slice(0, 10) === hoje)
        .sort((a, b) => (a.data || "").localeCompare(b.data || ""));
    const leadsAtivos = leads.filter(c => { const e = c.estagio_funil || ESTAGIOS[0]; return e !== "5. Fechado" && e !== "6. Perdido"; }).length;

    const kpi = (rot, val, cor, sub) => `<div class="bg-white rounded-xl border border-slate-200 p-3">
        <div class="text-[10px] text-slate-400 font-semibold">${rot}</div>
        <div class="text-2xl font-black ${cor} mt-0.5">${val}</div>${sub ? `<div class="text-[10px] text-slate-400 mt-0.5">${sub}</div>` : ""}</div>`;

    const cartaoFollow = (c) => {
        const wa = waLink(c.telefone, `Olá! Aqui é ${nome || "da consultoria"}. Podemos retomar nossa conversa?`);
        return `<div class="bg-white border border-red-200 rounded-xl p-3">
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <div class="font-bold text-sm text-slate-800 truncate">${esc(c.nome) || "(sem nome)"}</div>
                    <div class="text-[11px] text-slate-500 truncate">${esc(c.estagio_funil || "1. Prospecção")}${c.responsavel ? " · " + esc(c.responsavel) : ""}</div>
                    <div class="text-[11px] text-red-600 font-semibold">⚠ Contato previsto: ${(c.proximo_contato || "").split("-").reverse().join("/")}</div>
                </div>
                <div class="shrink-0 flex flex-col gap-1 items-end">
                    ${wa ? `<a href="${wa}" target="_blank" rel="noopener" class="text-[11px] font-bold text-green-600 hover:text-green-700">💬 WhatsApp</a>` : ""}
                    <a href="crm.html" class="text-[11px] font-bold text-indigo-600 hover:text-indigo-800">Abrir CRM</a>
                </div>
            </div>
        </div>`;
    };

    const filaFollow = followAtrasados.length
        ? followAtrasados.slice(0, 8).map(cartaoFollow).join("")
        : `<div class="bg-white border border-slate-200 rounded-xl p-4 text-center text-sm text-slate-400">Nenhum follow-up atrasado 🎉</div>`;

    const agenda = compsHoje.length
        ? compsHoje.map(c => `<div class="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-2.5">
            <div class="min-w-0"><p class="text-sm font-bold text-slate-800 truncate">${esc(c.titulo)}</p><p class="text-[11px] text-slate-500">${(c.data || "").slice(11, 16)} · ${esc(c.tipo || "tarefa")}${c.contatoNome ? " · " + esc(c.contatoNome) : ""}</p></div>
            <a href="crm.html" class="text-[11px] font-bold text-indigo-600 shrink-0">ver</a></div>`).join("")
        : `<div class="bg-white border border-slate-200 rounded-xl p-4 text-center text-sm text-slate-400">Nada agendado para hoje.</div>`;

    // funil
    const porEstagio = {}; ESTAGIOS.forEach(e => porEstagio[e] = 0);
    leads.forEach(c => { const e = c.estagio_funil || ESTAGIOS[0]; if (e in porEstagio) porEstagio[e]++; });
    const funilChips = ESTAGIOS.slice(0, 5).map(e => `<span class="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg">${e.replace(/^\d+\.\s/, "")}: <b>${porEstagio[e]}</b></span>`).join("");

    mount.innerHTML = `
        <div class="mb-4">
            <h2 class="text-xl font-bold text-slate-800">Olá, ${esc(nome || "consultor")} 👋</h2>
            <p class="text-xs text-slate-500">Sua semana comercial e operacional num olhar.</p>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            ${kpi("Follow-ups atrasados", followAtrasados.length, followAtrasados.length > 0 ? "text-red-600" : "text-slate-700")}
            ${kpi("Visitas na semana", visitas + "/" + META_VISITAS, visitas >= META_VISITAS ? "text-emerald-600" : "text-amber-600", "meta " + META_VISITAS + " (2/sócio)")}
            ${kpi("Pendências vencidas", pendVenc.length, pendVenc.length > 0 ? "text-red-600" : "text-slate-700")}
            ${kpi("Leads ativos", leadsAtivos, "text-indigo-600", "no funil")}
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 items-start">
            <div>
                <div class="flex items-center justify-between mb-2"><p class="text-sm font-extrabold text-slate-800">🔴 Follow-ups atrasados</p><a href="crm.html" class="text-[11px] font-bold text-indigo-600">CRM →</a></div>
                <div class="space-y-2">${filaFollow}</div>
            </div>
            <div>
                <div class="flex items-center justify-between mb-2"><p class="text-sm font-extrabold text-slate-800">🗓️ Agenda de hoje</p><a href="agenda.html" class="text-[11px] font-bold text-indigo-600">Agenda →</a></div>
                <div class="space-y-2">${agenda}</div>
                <div class="mt-3"><p class="text-xs font-bold text-slate-600 mb-1">Funil de leads</p><div class="flex flex-wrap gap-1.5">${funilChips}</div></div>
            </div>
        </div>`;
}
