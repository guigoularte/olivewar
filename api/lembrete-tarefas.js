// Vercel Serverless + Cron (diário): envia a cada membro da equipe um e-mail
// com as tarefas dele para HOJE. Dados: empresas/{id}/crm_compromissos.

const admin = require('firebase-admin');
const { enviarEmail, emailConfigurado } = require('../lib/email');
const { enviarPushUsuario, pushConfigurado } = require('../lib/push');

if (!admin.apps.length) {
  try { admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}')) }); } catch (e) { console.error(e.message); }
}
const db = admin.firestore();
const hojeBRT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const q = (req.query && req.query.secret) || '';
  const auth = req.headers['authorization'] || '';
  if (secret && auth !== 'Bearer ' + secret && q !== secret) return res.status(401).json({ error: 'não autorizado' });
  if (!admin.apps.length) return res.status(500).json({ error: 'firebase-admin não configurado' });
  if (!emailConfigurado()) return res.status(200).json({ ok: true, aviso: 'EmailJS não configurado (EMAILJS_PRIVATE_KEY/EMAILJS_TEMPLATE) — nada enviado.' });

  const hoje = hojeBRT();
  try {
    const empresas = await db.collection('empresas').get();
    let enviados = 0, pushEnviados = 0; const detalhes = [];
    for (const emp of empresas.docs) {
      const cs = await db.collection('empresas').doc(emp.id).collection('crm_compromissos').get();
      // tarefas de hoje, não concluídas, agrupadas por responsável
      const porResp = {};
      cs.docs.forEach(d => {
        const t = d.data();
        if ((t.data || '').slice(0, 10) !== hoje) return;
        if (t.status === 'concluido') return;
        const uid = t.responsavelUid || t.funcionarioUid; if (!uid) return;
        (porResp[uid] = porResp[uid] || []).push(t);
      });
      for (const uid of Object.keys(porResp)) {
        const us = await db.collection('usuarios').doc(uid).get();
        if (!us.exists) continue;
        const email = us.data().email; const nome = (us.data().nome || '').split(' ')[0] || '';
        if (!email) continue;
        const itens = porResp[uid].sort((a, b) => (a.data || '').localeCompare(b.data || ''));
        const linhas = itens.map(t => {
          const h = (t.data || '').length >= 16 ? (t.data.slice(11, 16) + ' · ') : '';
          const criador = t.criadoPorNome && t.criadoPorUid !== uid ? ` <span style="color:#999">(de ${t.criadoPorNome})</span>` : '';
          return `<li style="margin:6px 0"><b>${h}${t.titulo || 'Tarefa'}</b>${criador}${t.descricao ? `<br><span style="color:#666;font-size:13px">${t.descricao}</span>` : ''}</li>`;
        }).join('');
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:520px">
            <h2 style="color:#1b2a4a">Suas tarefas de hoje${nome ? ', ' + nome : ''} 📋</h2>
            <p style="color:#555">${new Date(hoje + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
            <ul style="padding-left:18px">${linhas}</ul>
            <p style="color:#999;font-size:12px;margin-top:16px">Abra o Oliver em <a href="https://olivewar.vercel.app/agenda.html">Agenda / Tarefas</a> · OliverApp</p>
          </div>`;
        try { await enviarEmail(email, `Suas tarefas de hoje (${itens.length})`, html); enviados++; detalhes.push({ para: email, tarefas: itens.length }); }
        catch (e) { console.error('email ' + email + ':', e.message); detalhes.push({ para: email, erro: e.message }); }
      }

      // --- Push "Bom dia": resumo do dia para cada membro da consultoria ---
      try {
        if (pushConfigurado()) {
          const [ps, cts, cbs] = await Promise.all([
            db.collection('empresas').doc(emp.id).collection('crm_pendencias').get(),
            db.collection('empresas').doc(emp.id).collection('crm_contatos').get(),
            db.collection('empresas').doc(emp.id).collection('cobrancas').get()
          ]);
          const pendVenc = ps.docs.filter(d => { const p = d.data(); return p.status !== 'feito' && p.prazo && p.prazo < hoje; }).length;
          const followAtr = cts.docs.filter(d => { const c = d.data(); const tipo = c.tipo_cadastro || (c.usuarioUid ? 'Cliente' : 'Lead'); return tipo === 'Lead' && c.proximo_contato && c.proximo_contato < hoje; }).length;
          const cobrAlerta = cbs.docs.filter(d => { const c = d.data(); return c.status !== 'pago' && c.vencimento && c.vencimento <= hoje; }).length;

          const membros = await db.collection('usuarios').where('empresaId', '==', emp.id).get();
          for (const m of membros.docs) {
            const md = m.data();
            const ehMembro = md.role === 'empresa_admin' || md.role === 'master' || (md.funcionalidades && md.funcionalidades.relatorios === true);
            if (!ehMembro) continue;
            const tarefasHoje = (porResp[m.id] || []).length;
            const partes = [];
            if (tarefasHoje) partes.push(`${tarefasHoje} tarefa(s)/visita(s)`);
            if (followAtr) partes.push(`${followAtr} follow-up(s) atrasado(s)`);
            if (pendVenc) partes.push(`${pendVenc} pendência(s) vencida(s)`);
            if (cobrAlerta) partes.push(`${cobrAlerta} cobrança(s) a cobrar`);
            if (!partes.length) continue;
            try { const r = await enviarPushUsuario(db, m.id, { title: 'Bom dia! Seu dia no Oliver', body: partes.join(' · '), url: 'app.html', tag: 'resumo-dia' }); pushEnviados += (r.enviados || 0); }
            catch (e) { console.error('push ' + m.id + ':', e.message); }
          }
        }
      } catch (e) { console.error('pushDigest ' + emp.id + ':', e.message); }
    }
    return res.status(200).json({ ok: true, dia: hoje, emailsEnviados: enviados, pushEnviados, detalhes });
  } catch (e) { console.error(e); return res.status(500).json({ error: e.message }); }
};
