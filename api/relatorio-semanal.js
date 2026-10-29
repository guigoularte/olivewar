// Vercel Serverless Function — gera o relatório semanal do fechamento de caixa
// de cada organização, salva no Firestore e (se configurado) envia por e-mail.
// Disparado pelo Vercel Cron (toda segunda) ou por um cron externo com o segredo.

const admin = require('firebase-admin');
const { enviarEmail, emailConfigurado } = require('../lib/email');

// Inicializa o Firebase Admin uma vez (credencial via variável de ambiente)
if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}')) });
  } catch (e) { console.error('Falha ao iniciar firebase-admin:', e.message); }
}
const db = admin.firestore();

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ymd = (d) => d.toISOString().slice(0, 10);
// segunda-feira (UTC) da semana de uma data
function segundaDe(d) { const x = new Date(d); const dia = (x.getUTCDay() + 6) % 7; x.setUTCHours(0, 0, 0, 0); x.setUTCDate(x.getUTCDate() - dia); return x; }

async function somaFechamentos(orgId, iniStr, fimStr) {
  const fs = await db.collection('organizacoes').doc(orgId).collection('fechamentos')
    .where('data', '>=', iniStr).where('data', '<=', fimStr).get();
  const soma = (k) => fs.docs.reduce((s, d) => s + (Number(d.data()[k]) || 0), 0);
  const faturamento = soma('faturamentoTotal');
  const pedidos = soma('quantidadePedidos');
  return {
    faturamento, pedidos, ticket: pedidos > 0 ? faturamento / pedidos : 0,
    dinheiro: soma('dinheiro'), credito: soma('credito'), debito: soma('debito'), pix: soma('pix'), ifood: soma('ifood'),
    dias: fs.size
  };
}

module.exports = async (req, res) => {
  // Protege o endpoint: Vercel Cron manda "Authorization: Bearer <CRON_SECRET>";
  // um cron externo pode mandar ?secret=<CRON_SECRET>.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'] || '';
  const q = (req.query && req.query.secret) || '';
  if (secret && auth !== 'Bearer ' + secret && q !== secret) {
    return res.status(401).json({ error: 'não autorizado' });
  }
  if (!admin.apps.length) return res.status(500).json({ error: 'firebase-admin não configurado (FIREBASE_SERVICE_ACCOUNT)' });

  try {
    // Por padrão: semana PASSADA (seg a dom anteriores). ?semana=atual = semana corrente (para testes).
    const estaSeg = segundaDe(new Date());
    const ini = new Date(estaSeg);
    if (!(req.query && req.query.semana === 'atual')) ini.setUTCDate(ini.getUTCDate() - 7);
    const fim = new Date(ini); fim.setUTCDate(fim.getUTCDate() + 6);
    const iniStr = ymd(ini), fimStr = ymd(fim);
    // semana anterior a essa (para comparativo)
    const iniA = new Date(ini); iniA.setUTCDate(iniA.getUTCDate() - 7);
    const fimA = new Date(ini); fimA.setUTCDate(fimA.getUTCDate() - 1);

    const orgsSnap = await db.collection('organizacoes').get();
    const resultados = []; let emails = 0;

    for (const orgDoc of orgsSnap.docs) {
      const org = orgDoc.data(); const orgId = orgDoc.id;
      const ind = await somaFechamentos(orgId, iniStr, fimStr);
      if (ind.dias === 0) continue; // sem fechamentos na semana → pula

      const ds = await db.collection('organizacoes').doc(orgId).collection('fechamento_despesas')
        .where('data', '>=', iniStr).where('data', '<=', fimStr).get();
      const despesas = ds.docs.reduce((s, d) => s + (Number(d.data().valor) || 0), 0);
      const saldo = ind.faturamento - despesas;
      const ant = await somaFechamentos(orgId, ymd(iniA), ymd(fimA));
      const varPct = ant.faturamento > 0 ? ((ind.faturamento - ant.faturamento) / ant.faturamento) * 100 : null;

      // Salva o relatório semanal (id = segunda da semana)
      await db.collection('organizacoes').doc(orgId).collection('relatorios_semanais').doc(iniStr)
        .set({ inicio: iniStr, fim: fimStr, ...ind, despesas, saldo, faturamentoAnterior: ant.faturamento, variacaoPct: varPct, geradoEm: new Date().toISOString() }, { merge: true });

      // E-mail para a consultoria dona (se configurado)
      let emailDest = '';
      if (org.empresaId) { const emp = await db.collection('empresas').doc(org.empresaId).get(); if (emp.exists) emailDest = emp.data().emailRelatorio || ''; }
      if (emailConfigurado() && emailDest) {
        const row = (r, v) => `<tr><td style="padding:4px 8px;color:#555">${r}</td><td style="padding:4px 8px;font-weight:700;text-align:right">${v}</td></tr>`;
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:520px">
            <h2 style="color:#1b5e3f">Relatório Semanal — ${org.nome || 'Organização'}</h2>
            <p style="color:#555">Semana de ${iniStr} a ${fimStr}</p>
            <table style="width:100%;border-collapse:collapse;background:#f8f9fa;border-radius:8px">
              ${row('Faturamento total', brl(ind.faturamento))}
              ${varPct !== null ? row('Variação vs. semana anterior', (varPct >= 0 ? '▲ +' : '▼ ') + varPct.toFixed(0) + '% (' + brl(ant.faturamento) + ')') : ''}
              ${row('Pedidos', ind.pedidos)}
              ${row('Ticket médio', brl(ind.ticket))}
              ${row('Despesas', brl(despesas))}
              ${row('Saldo', brl(saldo))}
              ${row('Dinheiro / Crédito / Débito', brl(ind.dinheiro) + ' / ' + brl(ind.credito) + ' / ' + brl(ind.debito))}
              ${row('PIX / iFood', brl(ind.pix) + ' / ' + brl(ind.ifood))}
            </table>
            <p style="color:#999;font-size:12px;margin-top:16px">Gerado automaticamente pelo OliverApp · https://olivewar.vercel.app</p>
          </div>`;
        try { await enviarEmail(emailDest, `Relatório semanal — ${org.nome || 'Organização'} (${iniStr} a ${fimStr})`, html); emails++; }
        catch (e) { console.error('Falha e-mail ' + orgId + ':', e.message); }
      }
      resultados.push({ org: org.nome, faturamento: ind.faturamento, emailPara: emailDest || '(sem e-mail)' });
    }
    return res.status(200).json({ ok: true, semana: iniStr + ' a ' + fimStr, organizacoes: resultados.length, emailsEnviados: emails, resultados });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
};
