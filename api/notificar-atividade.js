// Push + sino genérico: qualquer ação de um cliente no Oliver avisa os consultores
// RESPONSÁVEIS por ele. Chamado pelo app (POST) com o ID token e { acao, url }.
const admin = require('firebase-admin');
const { notificarResponsaveis, pushConfigurado } = require('../lib/push');

if (!admin.apps.length) {
  try { admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}')) }); } catch (e) { console.error(e.message); }
}
const db = admin.firestore();

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
    // Só ações de CLIENTE geram aviso (consultor/master não notifica a si mesmo).
    const ehEquipe = u.role === 'master' || u.role === 'empresa_admin' || (u.funcionalidades && u.funcionalidades.relatorios === true);
    if (ehEquipe) return res.status(200).json({ ok: true, aviso: 'quem agiu é da equipe' });

    let empresaId = u.empresaId || '';
    let nomeCliente = u.nome || 'Um cliente';
    if (u.orgId) {
      const o = await db.collection('organizacoes').doc(u.orgId).get();
      if (o.exists) { empresaId = o.data().empresaId || empresaId; nomeCliente = o.data().nome || nomeCliente; }
    }
    if (!empresaId) return res.status(200).json({ ok: true, aviso: 'usuário sem empresa' });

    let acao = 'atualizou algo no Oliver', url = 'admin_atividades.html';
    try {
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (b && b.acao) acao = String(b.acao).slice(0, 140);
      if (b && b.url) url = String(b.url).slice(0, 120);
    } catch (e) {}

    const r = await notificarResponsaveis(db, empresaId, uid, {
      title: nomeCliente, body: acao, url, tag: 'atividade-' + uid
    });
    return res.status(200).json({ ok: true, enviados: r.enviados, responsaveis: r.membros });
  } catch (e) { console.error(e); return res.status(500).json({ error: e.message }); }
};
