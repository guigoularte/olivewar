// Push em tempo real: quando um cliente envia uma nota, avisa os membros da consultoria.
// Chamado pelo app (POST) com o ID token do Firebase no header Authorization.
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
    let empresaId = u.empresaId || '';
    if (!empresaId && u.orgId) { const o = await db.collection('organizacoes').doc(u.orgId).get(); empresaId = o.exists ? (o.data().empresaId || '') : ''; }
    if (!empresaId) return res.status(200).json({ ok: true, aviso: 'usuário sem empresa' });

    const nomeCliente = u.nome || 'Um cliente';
    let valorTxt = '';
    try {
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (b && b.valor) valorTxt = ' (R$ ' + Number(b.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ')';
    } catch (e) {}

    const r = await notificarResponsaveis(db, empresaId, uid, { title: 'Nova nota recebida', body: nomeCliente + ' enviou uma nota' + valorTxt + '.', url: 'notas_recebidas.html', tag: 'nota-' + uid });
    return res.status(200).json({ ok: true, enviados: r.enviados });
  } catch (e) { console.error(e); return res.status(500).json({ error: e.message }); }
};
