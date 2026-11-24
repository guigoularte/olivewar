// Envio de notificações push via Firebase Cloud Messaging (firebase-admin).
// Mensagens são "data-only": o service worker (sw.js) monta e exibe a notificação.
const admin = require('firebase-admin');

function pushConfigurado() { return admin.apps.length > 0; }

// Envia um push para TODOS os aparelhos (tokens) de um usuário. Remove tokens mortos.
// db = admin.firestore(); uid = id do usuário; msg = { title, body, url }
async function enviarPushUsuario(db, uid, msg) {
  if (!admin.apps.length) return { enviados: 0, aviso: 'firebase-admin não configurado' };
  const col = db.collection('usuarios').doc(uid).collection('push_tokens');
  const snap = await col.get();
  const tokens = snap.docs.map((d) => d.id).filter(Boolean);
  if (!tokens.length) return { enviados: 0 };

  const base = {
    data: {
      title: String(msg.title || 'Oliver'),
      body: String(msg.body || ''),
      url: String(msg.url || 'app.html'),
      tag: String(msg.tag || '')
    },
    webpush: { headers: { Urgency: 'high' } }
  };

  let enviados = 0;
  const invalidos = [];
  await Promise.all(tokens.map(async (token) => {
    try { await admin.messaging().send({ ...base, token }); enviados++; }
    catch (e) {
      const code = (e && e.errorInfo && e.errorInfo.code) || (e && e.code) || '';
      if (/not-registered|invalid-argument|invalid-registration-token|mismatched/i.test(code)) invalidos.push(token);
      else console.error('push ' + uid + ':', code || (e && e.message));
    }
  }));
  await Promise.all(invalidos.map((t) => col.doc(t).delete().catch(() => {})));
  return { enviados, removidos: invalidos.length };
}

module.exports = { enviarPushUsuario, pushConfigurado };
