// Envio de notificações push via Firebase Cloud Messaging (firebase-admin).
// Mensagens são "data-only": o service worker (sw.js) monta e exibe a notificação.
const admin = require('firebase-admin');

function pushConfigurado() { return admin.apps.length > 0; }

// Registra a notificação na "central do sino" do usuário (aparece ao abrir o app,
// mesmo sem push ativado). usuarios/{uid}/notificacoes/{id}
async function registrarNotificacao(db, uid, msg) {
  try {
    await db.collection('usuarios').doc(uid).collection('notificacoes').add({
      titulo: String(msg.title || 'Oliver'),
      corpo: String(msg.body || ''),
      url: String(msg.url || 'app.html'),
      tipo: String(msg.tag || ''),
      lida: false,
      criadoEm: new Date().toISOString()
    });
  } catch (e) { console.error('notificacao ' + uid + ':', e && e.message); }
}

// Registra no sino E envia push para todos os aparelhos do usuário. Remove tokens mortos.
// db = admin.firestore(); uid = id do usuário; msg = { title, body, url, tag }
async function enviarPushUsuario(db, uid, msg) {
  // Sempre registra a notificação (o sino mostra mesmo sem push ativo)
  await registrarNotificacao(db, uid, msg);

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

// Notifica os CONSULTORES RESPONSÁVEIS por um cliente (push + sino).
// Responsável = master / admin da empresa (veem tudo) OU funcionário cujo
// clientesPermitidos inclui o cliente (lista vazia/ausente = atende todos).
async function notificarResponsaveis(db, empresaId, clienteUid, msg) {
  if (!empresaId) return { enviados: 0, membros: 0 };
  const snap = await db.collection('usuarios').where('empresaId', '==', empresaId).get();
  let enviados = 0, alvos = 0;
  for (const m of snap.docs) {
    if (m.id === clienteUid) continue;
    const md = m.data();
    const ehMaster = md.role === 'master';
    const ehAdmin = md.role === 'empresa_admin';
    const ehFunc = !!(md.funcionalidades && md.funcionalidades.relatorios === true);
    if (!(ehMaster || ehAdmin || ehFunc)) continue;
    // Funcionário puro respeita a lista de clientes atribuídos
    if (ehFunc && !ehMaster && !ehAdmin) {
      const lista = md.clientesPermitidos;
      if (Array.isArray(lista) && lista.length > 0 && !lista.includes(clienteUid)) continue;
    }
    alvos++;
    try { const r = await enviarPushUsuario(db, m.id, msg); enviados += (r.enviados || 0); }
    catch (e) { console.error('notif resp ' + m.id + ':', e && e.message); }
  }
  return { enviados, membros: alvos };
}

module.exports = { enviarPushUsuario, registrarNotificacao, notificarResponsaveis, pushConfigurado };
