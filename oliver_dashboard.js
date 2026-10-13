// Dashboard da consultoria — renderização reutilizável.
// Usado pela home (app.html) no desktop e pela página dashboard.html no celular.
// Requer Chart.js já carregado (window.Chart) para os gráficos.
import { collection, getDocs, getDoc, doc, setDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const TEMPLATE = `
<div data-dash>
  <div class="flex items-center justify-end mb-2">
    <button data-el="sync" class="hidden text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-lg">🔄 Sincronizar histórico</button>
  </div>
  <div data-el="vazio" class="hidden mb-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800">
    Ainda não há relatórios registrados. Eles aparecem conforme novos relatórios forem enviados — ou clique em <b>🔄 Sincronizar histórico</b> para trazer os já enviados.
  </div>
  <div class="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
    <div class="bg-white rounded-xl border border-slate-200 p-3 text-center"><div class="text-[10px] text-slate-400 font-semibold">Relatórios no mês</div><div data-el="kpi-mes" class="text-2xl font-black text-indigo-600">0</div></div>
    <div class="bg-white rounded-xl border border-slate-200 p-3 text-center"><div class="text-[10px] text-slate-400 font-semibold">Últimos 7 dias</div><div data-el="kpi-7" class="text-2xl font-black text-indigo-600">0</div></div>
    <div class="bg-white rounded-xl border border-slate-200 p-3 text-center"><div class="text-[10px] text-slate-400 font-semibold">Vistorias no mês</div><div data-el="kpi-vist" class="text-2xl font-black text-orange-600">0</div></div>
    <div data-el="card-pend" class="bg-white rounded-xl border border-slate-200 p-3 text-center"><div class="text-[10px] text-slate-400 font-semibold">Pendências vencidas</div><div data-el="kpi-pend" class="text-2xl font-black text-red-600">0</div></div>
    <div data-el="card-receber" class="bg-white rounded-xl border border-slate-200 p-3 text-center"><div class="text-[10px] text-slate-400 font-semibold">A receber</div><div data-el="kpi-receber" class="text-sm font-black text-emerald-600 mt-2">R$ 0,00</div></div>
  </div>
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
    <div class="bg-white rounded-xl border border-slate-200 p-3 lg:col-span-2">
      <p class="text-xs font-bold text-slate-700 mb-2">Relatórios por semana (últimas 8)</p>
      <div style="height:200px"><canvas data-el="g-semanas"></canvas></div>
    </div>
    <div class="bg-white rounded-xl border border-slate-200 p-3">
      <p class="text-xs font-bold text-slate-700 mb-2">Por tipo</p>
      <div style="height:200px"><canvas data-el="g-tipos"></canvas></div>
    </div>
  </div>
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
    <div class="bg-white rounded-xl border border-slate-200 p-3"><p class="text-xs font-bold text-slate-700 mb-1">🏆 Empresas mais visitadas</p><div data-el="mais"></div></div>
    <div class="bg-white rounded-xl border border-slate-200 p-3"><p class="text-xs font-bold text-slate-700 mb-1">⏱ A revisitar (há mais tempo)</p><div data-el="revisitar"></div></div>
    <div data-el="card-func" class="bg-white rounded-xl border border-slate-200 p-3"><p class="text-xs font-bold text-slate-700 mb-1">👷 Relatórios por funcionário</p><div data-el="func"></div></div>
  </div>
</div>`;

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const diaMes = (iso) => { const d = new Date(iso); return isNaN(d) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); };
const diasDesde = (iso) => { const d = new Date(iso); if (isNaN(d)) return null; return Math.floor((Date.now() - d.getTime()) / 86400000); };
function segunda(d) { const x = new Date(d); const dia = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - dia); return x; }

// Agrupa por cliente: { nome: { total, ultima } }
function porCliente(logs) {
    const m = {};
    logs.forEach(l => {
        const nome = l.clienteNome || "(sem nome)";
        if (!m[nome]) m[nome] = { total: 0, ultima: "" };
        m[nome].total++;
        if ((l.data || "") > m[nome].ultima) m[nome].ultima = l.data;
    });
    return m;
}

// renderDashboard({ db, empresaId, isMaster, mount, restrito, meuUid })
// restrito=true (funcionário): mostra só os relatórios do próprio funcionário e esconde
// os números da empresa (A receber, Pendências e o ranking por funcionário).
export async function renderDashboard(opts) {
    const { db, empresaId, isMaster, mount, restrito, meuUid } = opts;
    mount.innerHTML = TEMPLATE;
    const $ = (n) => mount.querySelector(`[data-el="${n}"]`);
    let chartSem = null, chartTipo = null;

    if (restrito) {
        ["card-receber", "card-pend", "card-func"].forEach(n => { const el = $(n); if (el) el.classList.add("hidden"); });
    }
    if (isMaster) {
        const btn = $("sync");
        btn.classList.remove("hidden");
        btn.onclick = () => sincronizar(db, empresaId, btn, () => carregar());
    }

    async function carregar() {
        let logs = [], pend = [], fin = [];
        try {
            const [sl, sp, sf] = await Promise.all([
                getDocs(collection(db, "empresas", empresaId, "relatorios_log")),
                getDocs(collection(db, "empresas", empresaId, "crm_pendencias")),
                getDocs(collection(db, "empresas", empresaId, "crm_financeiro"))
            ]);
            logs = sl.docs.map(d => d.data()).filter(l => l.data);
            if (restrito && meuUid) logs = logs.filter(l => l.funcionarioUid === meuUid);
            pend = sp.docs.map(d => d.data());
            fin = sf.docs.map(d => d.data());
        } catch (e) {
            console.error("Dashboard:", e);
            mount.querySelector("[data-dash]").insertAdjacentHTML("afterbegin",
                '<p class="text-xs text-red-500 mb-2">Erro ao carregar o dashboard: ' + esc(e.message) + ' (as regras do Firestore foram republicadas?)</p>');
            return;
        }

        // KPIs
        const mesAtual = new Date().toISOString().slice(0, 7);
        const h7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        const hojeStr = new Date().toISOString().slice(0, 10);
        $("kpi-mes").innerText = logs.filter(l => (l.data || "").slice(0, 7) === mesAtual).length;
        $("kpi-7").innerText = logs.filter(l => (l.data || "").slice(0, 10) >= h7).length;
        $("kpi-vist").innerText = logs.filter(l => l.tipo === "vistoria" && (l.data || "").slice(0, 7) === mesAtual).length;
        $("kpi-pend").innerText = pend.filter(p => p.status !== "feito" && p.prazo && p.prazo < hojeStr).length;
        const aReceber = fin.filter(f => f.tipo === "receber" && f.status !== "quitado").reduce((s, f) => s + (Number(f.valor) || 0), 0);
        $("kpi-receber").innerText = aReceber.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

        // Gráfico por semana
        if (window.Chart) {
            const base = segunda(new Date());
            const semanas = [];
            for (let i = 7; i >= 0; i--) { const d = new Date(base); d.setDate(d.getDate() - i * 7); semanas.push(d); }
            const contagem = semanas.map(() => 0);
            logs.forEach(l => { const s = segunda(new Date(l.data)); const idx = semanas.findIndex(w => w.getTime() === s.getTime()); if (idx >= 0) contagem[idx]++; });
            if (chartSem) chartSem.destroy();
            chartSem = new window.Chart($("g-semanas"), {
                type: 'bar',
                data: { labels: semanas.map(diaMes), datasets: [{ label: 'Relatórios', data: contagem, backgroundColor: '#6366f1', borderRadius: 6 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
            });

            const tipos = { vistoria: 0, primeira_visita: 0, checklist: 0 };
            logs.forEach(l => { if (l.tipo in tipos) tipos[l.tipo]++; });
            if (chartTipo) chartTipo.destroy();
            chartTipo = new window.Chart($("g-tipos"), {
                type: 'doughnut',
                data: { labels: ['Vistoria', '1ª Visita', 'Checklist'], datasets: [{ data: [tipos.vistoria, tipos.primeira_visita, tipos.checklist], backgroundColor: ['#f97316', '#3b82f6', '#10b981'] }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }
            });
        }

        // Rankings
        const m = porCliente(logs);
        const mais = Object.entries(m).map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.total - a.total).slice(0, 8);
        $("mais").innerHTML = mais.length ? mais.map(c => `
            <div class="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                <span class="text-xs text-slate-700 truncate pr-2">${esc(c.nome)}</span>
                <span class="text-xs font-bold text-indigo-600 shrink-0">${c.total} <span class="text-[10px] text-slate-400 font-normal">· últ. ${diaMes(c.ultima)}</span></span>
            </div>`).join('') : '<p class="text-xs text-slate-400 py-3">Sem dados ainda.</p>';

        const rev = Object.entries(m).map(([nome, v]) => ({ nome, dias: diasDesde(v.ultima) })).filter(c => c.dias != null).sort((a, b) => b.dias - a.dias).slice(0, 8);
        $("revisitar").innerHTML = rev.length ? rev.map(c => `
            <div class="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                <span class="text-xs text-slate-700 truncate pr-2">${esc(c.nome)}</span>
                <span class="text-xs font-bold ${c.dias > 30 ? 'text-red-600' : 'text-slate-600'} shrink-0">${c.dias} dias</span>
            </div>`).join('') : '<p class="text-xs text-slate-400 py-3">Sem dados ainda.</p>';

        const mf = {};
        logs.forEach(l => { const n = l.funcionarioNome || "(sem nome)"; mf[n] = (mf[n] || 0) + 1; });
        const func = Object.entries(mf).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
        const max = func.length ? func[0].total : 1;
        $("func").innerHTML = func.length ? func.map(f => `
            <div class="py-1.5">
                <div class="flex items-center justify-between text-xs"><span class="text-slate-700 truncate pr-2">${esc(f.nome)}</span><span class="font-bold text-slate-600 shrink-0">${f.total}</span></div>
                <div class="h-1.5 bg-slate-100 rounded mt-1"><div class="h-1.5 bg-indigo-500 rounded" style="width:${Math.round(f.total / max * 100)}%"></div></div>
            </div>`).join('') : '<p class="text-xs text-slate-400 py-3">Sem dados ainda.</p>';

        if (logs.length === 0) $("vazio").classList.remove("hidden"); else $("vazio").classList.add("hidden");
    }

    await carregar();
}

// Backfill do relatorios_log a partir dos relatorios_enviados (master). Idempotente (id hist_<id>).
async function sincronizar(db, empresaId, btn, aoFim) {
    if (!confirm("Importar o histórico de relatórios já enviados para o dashboard? Pode levar alguns segundos.")) return;
    btn.disabled = true; const txt = btn.innerText; btn.innerText = "Sincronizando...";
    try {
        const usnap = await getDocs(query(collection(db, "usuarios"), where("empresaId", "==", empresaId)));
        let n = 0;
        for (const u of usnap.docs) {
            const ud = u.data();
            const ehFunc = ud.role === "master" || (ud.funcionalidades && ud.funcionalidades.relatorios);
            if (!ehFunc) continue;
            const rs = await getDocs(collection(db, "usuarios", u.id, "relatorios_enviados"));
            for (const r of rs.docs) {
                const rd = r.data();
                await setDoc(doc(db, "empresas", empresaId, "relatorios_log", "hist_" + r.id), {
                    tipo: rd.tipo || "", clienteNome: rd.clienteNome || "", clienteId: rd.clienteId || "", orgId: rd.orgId || "",
                    funcionarioNome: rd.funcionario || ud.nome || "", funcionarioUid: u.id, data: rd.data || ""
                });
                n++;
            }
        }
        alert(n + " relatório(s) importado(s) para o dashboard.");
        if (aoFim) await aoFim();
    } catch (e) { alert("Erro ao sincronizar: " + e.message); }
    finally { btn.disabled = false; btn.innerText = txt; }
}
