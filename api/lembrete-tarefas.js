// Vercel Serverless + Cron (diário): envia a cada membro da equipe um e-mail
// com as tarefas dele para HOJE. Dados: empresas/{id}/crm_compromissos.

const admin = require('firebase-admin');
const { Resend } = require('resend');

if (!admin.apps.length) {
  try { admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}')) }); } catch (e) { console.error(e.message); }
}
const db = admin.firestore();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const hojeBRT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const q = (req.query && req.query.secret) || '';
  const auth = req.headers['authorization'] || '';
  if (secret && auth !== 'Bearer ' + secret && q !== secret) return res.status(401).json({ error: 'não autorizado' });
  if (!admin.apps.length) return res.status(500).json({ error: 'firebase-admin não configurado' });
  if (!resend || !process.env.FROM_EMAIL) return res.status(200).json({ ok: true, aviso: 'Resend/FROM_EMAIL não configurados — nada enviado.' });

  const hoje = hojeBRT();
  try {
    const empresas = await db.collection('empresas').get();
    let enviados = 0; const detalhes = [];
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
        try { await resend.emails.send({ from: process.env.FROM_EMAIL, to: email, subject: `Suas tarefas de hoje (${itens.length})`, html }); enviados++; detalhes.push({ para: email, tarefas: itens.length }); }
        catch (e) { console.error('email ' + email + ':', e.message); detalhes.push({ para: email, erro: e.message }); }
      }
    }
    return res.status(200).json({ ok: true, dia: hoje, emailsEnviados: enviados, detalhes });
  } catch (e) { console.error(e); return res.status(500).json({ error: e.message }); }
};
