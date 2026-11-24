// Push em tempo real: quando um membro manda mensagem no chat da equipe,
// avisa os OUTROS membros da consultoria. Chamado pelo app (POST) com o ID token.
const admin = require('firebase-admin');
const { enviarPushUsuario, pushConfigurado } = require('../lib/push');

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
    const empresaId = u.empresaId || '';
    const ehEquipe = u.role === 'master' || u.role === 'empresa_admin' || (u.funcionalidades && u.funcionalidades.relatorios === true);
    if (!empresaId || !ehEquipe) return res.status(200).json({ ok: true, aviso: 'remetente não é da equipe' });
    const autor = (u.nome || 'Equipe').split(' ')[0];

    let texto = '';
    try {
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      texto = String(b && b.texto || '').slice(0, 120);
    } catch (e) {}

    const membros = await db.collection('usuarios').where('empresaId', '==', empresaId).get();
    let enviados = 0;
    for (const m of membros.docs) {
      if (m.id === uid) continue;
      const md = m.data();
      const ehMembro = md.role === 'master' || md.role === 'empresa_admin' || (md.funcionalidades && md.funcionalidades.relatorios === true);
      if (!ehMembro) continue;
      try { const r = await enviarPushUsuario(db, m.id, { title: 'Mensagem de ' + autor, body: texto || 'Nova mensagem da equipe', url: 'mensagens.html', tag: 'chat-equipe' }); enviados += (r.enviados || 0); }
      catch (e) { console.error('push msg ' + m.id + ':', e.message); }
    }
    return res.status(200).json({ ok: true, enviados });
  } catch (e) { console.error(e); return res.status(500).json({ error: e.message }); }
};
