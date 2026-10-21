// Correção ÚNICA: conserta o campo `data` dos fechamentos que ficaram com +1 dia
// (bug de fuso UTC). Usa o `diaSemana` (que foi gravado correto) como verdade.
// Uso: /api/corrigir-datas?secret=SEU_CRON_SECRET            -> modo TESTE (só mostra o que mudaria)
//      /api/corrigir-datas?secret=SEU_CRON_SECRET&aplicar=1  -> aplica de verdade

const admin = require('firebase-admin');
if (!admin.apps.length) {
  try { admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}')) }); } catch (e) { console.error(e.message); }
}
const db = admin.firestore();

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
function weekdayOf(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
function menosUmDia(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() - 1); return dt.toISOString().slice(0, 10); }

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const q = (req.query && req.query.secret) || '';
  const auth = req.headers['authorization'] || '';
  if (secret && auth !== 'Bearer ' + secret && q !== secret) return res.status(401).json({ error: 'não autorizado' });
  if (!admin.apps.length) return res.status(500).json({ error: 'firebase-admin não configurado' });

  const aplicar = (req.query && req.query.aplicar === '1');
  try {
    const orgs = await db.collection('organizacoes').get();
    let corrigidos = 0, jaCorretos = 0, semReferencia = 0; const detalhes = [];
    for (const o of orgs.docs) {
      const fs = await db.collection('organizacoes').doc(o.id).collection('fechamentos').get();
      for (const f of fs.docs) {
        const d = f.data(); const data = d.data; const dia = d.diaSemana;
        if (!data || !dia || DIAS.indexOf(dia) < 0) { semReferencia++; continue; }
        const alvo = DIAS.indexOf(dia);
        if (weekdayOf(data) === alvo) { jaCorretos++; continue; }  // já está certo
        const novo = menosUmDia(data);
        if (weekdayOf(novo) !== alvo) { detalhes.push({ org: o.data().nome, id: f.id, data, dia, nota: 'nao bateu com -1 dia (pulado)' }); continue; }
        if (aplicar) await f.ref.update({ data: novo });
        corrigidos++;
        if (detalhes.length < 100) detalhes.push({ org: o.data().nome, de: data, para: novo, dia });
      }
    }
    return res.status(200).json({ ok: true, aplicado: aplicar, corrigidos, jaCorretos, semReferencia, detalhes });
  } catch (e) { console.error(e); return res.status(500).json({ error: e.message }); }
};
