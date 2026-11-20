// Cockpit do CONSULTOR (home desktop da consultoria): KPIs, fila de execução do dia,
// cadência de prospects e agenda — lê o CRM da empresa (crm_contatos / crm_compromissos / crm_pendencias).
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ymdLocal = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const brDate = (s) => (s || "").slice(0, 10).split("-").reverse().join("/");
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
    const pendVenc = pend.filter(p => p.status !== "feito" && p.prazo && p.prazo < hoje)
        .sort((a, b) => (a.prazo || "").localeCompare(b.prazo || ""));
    const compsHoje = comps.filter(c => c.status !== "concluido" && c.data && c.data.slice(0, 10) === hoje)
        .sort((a, b) => (a.data || "").localeCompare(b.data || ""));
    const leadsAtivos = leads.filter(c => { const e = c.estagio_funil || ESTAGIOS[0]; return e !== "5. Fechado" && e !== "6. Perdido"; }).length;

    // ---- Fila de execução do dia (pendências vencidas + compromissos de hoje + follow-ups atrasados) ----
    const fila = [];
    pendVenc.forEach(p => fila.push({
        grupo: "Atrasado", cls: "bg-rose-100 text-rose-700",
        cliente: p.contatoNome || p.clienteNome || "—", titulo: p.titulo || p.descricao || "Pendência",
        resp: p.responsavel || p.funcionarioNome || "", prazo: "Venceu " + brDate(p.prazo), ordem: 0, link: "crm.html"
    }));
    compsHoje.forEach(c => fila.push({
        grupo: c.tipo === "visita" ? "Visita" : "Hoje", cls: c.tipo === "visita" ? "bg-indigo-100 text-indigo-700" : "bg-orange-100 text-orange-700",
        cliente: c.contatoNome || "—", titulo: c.titulo || "Compromisso",
        resp: c.funcionarioNome || c.responsavel || "", prazo: (c.data || "").slice(11, 16) || "Hoje", ordem: 1, link: "agenda.html"
    }));
    followAtrasados.forEach(c => fila.push({
        grupo: "Follow-up", cls: "bg-amber-100 text-amber-700",
        cliente: c.nome || "—", titulo: "Retomar contato (" + (c.estagio_funil || "Prospecção").replace(/^\d+\.\s/, "") + ")",
        resp: c.responsavel || "", prazo: "Previsto " + brDate(c.proximo_contato), ordem: 2, link: "crm.html"
    }));
    fila.sort((a, b) => a.ordem - b.ordem);

    const responsaveis = [...new Set(fila.map(f => f.resp).filter(Boolean))];
    const pills = ["Todos", ...responsaveis];

    const linhaFila = (f, i) => `
        <div class="fila-row grid grid-cols-[110px_150px_1fr_110px_120px] items-center gap-3 px-3 py-2.5 border border-slate-200 rounded-lg text-[13px] hover:bg-slate-50 transition" data-resp="${esc(f.resp)}">
            <span class="text-[11px] font-bold uppercase text-center px-2 py-1 rounded-md ${f.cls}">${esc(f.grupo)}</span>
            <strong class="truncate text-slate-800">${esc(f.cliente)}</strong>
            <span class="truncate text-slate-600">${esc(f.titulo)}</span>
            <span class="text-[11px] font-semibold text-center text-slate-600 bg-slate-100 rounded-md px-2 py-1 truncate">${esc(f.resp) || "—"}</span>
            <a href="${f.link}" class="text-[12px] text-slate-500 text-right hover:text-indigo-600">${esc(f.prazo)}</a>
        </div>`;

    const filaHtml = fila.length
        ? fila.map(linhaFila).join("")
        : `<div class="border border-slate-200 rounded-lg p-5 text-center text-sm text-slate-400">Nada na fila de hoje. Tudo em dia.</div>`;

    const pillsHtml = pills.map((p, i) => `
        <button class="fila-pill px-3 py-1.5 text-[12px] font-semibold rounded-md transition ${i === 0 ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}" data-filter="${esc(p)}">${esc(p)}</button>`).join("");

    // ---- Cadência de prospects (CRM) ----
    const cadencia = leads
        .filter(c => c.estagio_funil !== "5. Fechado" && c.estagio_funil !== "6. Perdido")
        .sort((a, b) => (a.proximo_contato || "9999").localeCompare(b.proximo_contato || "9999"))
        .slice(0, 6);
    const cadHtml = cadencia.length ? cadencia.map(c => {
        const atrasado = c.proximo_contato && c.proximo_contato < hoje;
        const wa = waLink(c.telefone, `Olá! Aqui é ${nome || "da consultoria"}. Podemos retomar nossa conversa?`);
        return `<div class="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
            <div class="min-w-0">
                <strong class="text-[13px] text-slate-800 truncate block">${esc(c.nome) || "(sem nome)"}</strong>
                <div class="text-[11px] text-slate-500">${esc(c.responsavel || "—")}${c.proximo_contato ? " · Próx: <b class='" + (atrasado ? "text-rose-600" : "text-slate-600") + "'>" + brDate(c.proximo_contato) + "</b>" : ""}</div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                ${wa ? `<a href="${wa}" target="_blank" rel="noopener" class="text-[11px] font-bold text-emerald-600 hover:text-emerald-700">WhatsApp</a>` : ""}
                <span class="text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md">${esc((c.estagio_funil || "1. Prospecção").replace(/^\d+\.\s/, ""))}</span>
            </div>
        </div>`;
    }).join("") : `<div class="py-4 text-center text-sm text-slate-400">Nenhum prospect ativo.</div>`;

    // ---- Agenda de hoje ----
    const agendaHtml = compsHoje.length ? compsHoje.map(c => `
        <div class="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
            <div class="min-w-0">
                <strong class="text-[13px] text-slate-800 truncate block">${esc(c.titulo)}</strong>
                <div class="text-[11px] text-slate-500">${(c.data || "").slice(11, 16) || "—"} · ${esc(c.tipo || "tarefa")}${c.contatoNome ? " · " + esc(c.contatoNome) : ""}</div>
            </div>
            <a href="agenda.html" class="text-[11px] font-bold text-indigo-600 shrink-0">ver</a>
        </div>`).join("") : `<div class="py-4 text-center text-sm text-slate-400">Nada agendado para hoje.</div>`;

    const kpi = (rot, val, cor, sub) => `<div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="text-[12px] text-slate-500 font-medium">${rot}</div>
        <div class="text-2xl font-extrabold ${cor} mt-1">${val}</div>${sub ? `<div class="text-[11px] text-slate-400 mt-1">${sub}</div>` : ""}</div>`;

    mount.innerHTML = `
        <div class="flex items-center justify-between flex-wrap gap-3 mb-5">
            <div>
                <h2 class="text-xl font-bold text-slate-800">Cockpit${nome ? " — " + esc(nome) : ""}</h2>
                <p class="text-[13px] text-slate-500">Cobrança, prospecção comercial e fila operacional num só lugar</p>
            </div>
            <div class="flex gap-2">
                <a href="agenda.html" class="px-3.5 py-2 rounded-lg text-[13px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">Agenda</a>
                <a href="crm.html" class="px-3.5 py-2 rounded-lg text-[13px] font-semibold bg-orange-500 text-white hover:bg-orange-600">Novo lead</a>
            </div>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            ${kpi("Follow-ups atrasados", followAtrasados.length, followAtrasados.length > 0 ? "text-rose-600" : "text-slate-700", followAtrasados.length > 0 ? "retomar contato" : "em dia")}
            ${kpi("Visitas na semana", visitas + " / " + META_VISITAS, visitas >= META_VISITAS ? "text-emerald-600" : "text-orange-500", "meta 2 por sócio")}
            ${kpi("Pendências vencidas", pendVenc.length, pendVenc.length > 0 ? "text-rose-600" : "text-slate-700", "itens para resolver")}
            ${kpi("Leads ativos", leadsAtivos, "text-indigo-600", "no funil")}
        </div>

        <div class="bg-white border border-slate-200 rounded-xl p-5 mb-5">
            <div class="flex items-center justify-between flex-wrap gap-3 mb-4">
                <p class="text-[15px] font-bold text-slate-800">Fila de Execução do Dia</p>
                <div class="flex gap-1 bg-slate-100 p-1 rounded-lg">${pillsHtml}</div>
            </div>
            <div class="flex flex-col gap-2" id="fila-exec">${filaHtml}</div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div class="bg-white border border-slate-200 rounded-xl p-5">
                <div class="flex items-center justify-between mb-2">
                    <p class="text-[15px] font-bold text-slate-800">Cadência de Prospects</p>
                    <a href="crm.html" class="text-[11px] font-bold text-indigo-600">CRM →</a>
                </div>
                <div>${cadHtml}</div>
            </div>
            <div class="bg-white border border-slate-200 rounded-xl p-5">
                <div class="flex items-center justify-between mb-2">
                    <p class="text-[15px] font-bold text-slate-800">Agenda de hoje</p>
                    <a href="agenda.html" class="text-[11px] font-bold text-indigo-600">Agenda →</a>
                </div>
                <div>${agendaHtml}</div>
            </div>
        </div>`;

    // Filtro por responsável na fila de execução
    const pillEls = mount.querySelectorAll(".fila-pill");
    const rowEls = mount.querySelectorAll(".fila-row");
    pillEls.forEach(btn => btn.addEventListener("click", () => {
        const f = btn.getAttribute("data-filter");
        pillEls.forEach(p => { p.classList.remove("bg-white", "text-slate-800", "shadow-sm"); p.classList.add("text-slate-500"); });
        btn.classList.add("bg-white", "text-slate-800", "shadow-sm"); btn.classList.remove("text-slate-500");
        rowEls.forEach(r => { r.style.display = (f === "Todos" || r.getAttribute("data-resp") === f) ? "" : "none"; });
    }));
}
