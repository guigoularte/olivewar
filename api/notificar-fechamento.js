// Push + sino: quando um cliente fecha o caixa, avisa os membros da consultoria.
// Chamado pelo app (POST) com o ID token do Firebase no header Authorization.
const admin = require('firebase-admin');
const { enviarPushUsuario, pushConfigurado } = require('../lib/push');

if (!admin.apps.length) {
  try { admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}')) }); } catch (e) { console.error(e.message); }
}
const db = admin.firestore();
const brl = (n) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'método não permitido' });
  if (!admin.apps.length) return res.status(500).json({ error: 'firebase-admin não configurado' });
  if (!pushConfigurado()) return res.status(200).json({ ok: true, aviso: 'push não configurado' });

  const authz = req.headers['authorization'] || '';
  const idToken = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!idToken) return res.status(401).json({ error: 'sem token' });
  let uid;
  try { uid = (await admin.auth().verifyIdToken(idToken)).uid; } catch (e) { return res.status(401).json({ error: 'token inválido' }); }

  try {
    const uSnap = await db.collection('usuarios').doc(uid).get();
    const u = uSnap.exists ? uSnap.data() : {};
    // Se quem fechou é da equipe (consultor/master), não notifica (é staff).
    const ehEquipe = u.role === 'master' || u.role === 'empresa_admin' || (u.funcionalidades && u.funcionalidades.relatorios === true);
    if (ehEquipe) return res.status(200).json({ ok: true, aviso: 'quem fechou é da equipe' });

    let empresaId = u.empresaId || '';
    let nomeLoja = u.nome || 'Um cliente';
    if (u.orgId) {
      const o = await db.collection('organizacoes').doc(u.orgId).get();
      if (o.exists) { empresaId = o.data().empresaId || empresaId; nomeLoja = o.data().nome || nomeLoja; }
    }
    if (!empresaId) return res.status(200).json({ ok: true, aviso: 'usuário sem empresa' });

    let resumo = '';
    try {
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const total = Number(b && b.total || 0);
      const pedidos = parseInt(b && b.pedidos || 0, 10) || 0;
      resumo = brl(total) + (pedidos ? ' · ' + pedidos + ' pedido' + (pedidos > 1 ? 's' : '') : '');
    } catch (e) {}

    const membros = await db.collection('usuarios').where('empresaId', '==', empresaId).get();
    let enviados = 0;
    for (const m of membros.docs) {
      if (m.id === uid) continue;
      const md = m.data();
      const ehMembro = md.role === 'master' || md.role === 'empresa_admin' || (md.funcionalidades && md.funcionalidades.relatorios === true);
      if (!ehMembro) continue;
      try { const r = await enviarPushUsuario(db, m.id, { title: 'Caixa fechado', body: nomeLoja + ' fechou o caixa' + (resumo ? ': ' + resumo : '') + '.', url: 'relatorio_semanal.html', tag: 'fechamento-' + uid }); enviados += (r.enviados || 0); }
      catch (e) { console.error('push fechamento ' + m.id + ':', e.message); }
    }
    return res.status(200).json({ ok: true, enviados });
  } catch (e) { console.error(e); return res.status(500).json({ error: e.message }); }
};
