# Oliver — Documento de Contexto (Handoff)

> Leia este arquivo para continuar o desenvolvimento com todo o histórico de decisões.
> O código está no Git (branch `main`) e publicado no Vercel: https://olivewar.vercel.app

## O que é o Oliver
App web (mobile-first) para viabilidade econômica de pequenos negócios e para consultorias de campo.
Usado por: o dono (master), funcionários (fazem relatórios de visita) e clientes.

## Stack
- **Front-end estático**: HTML + Tailwind via CDN (`https://cdn.tailwindcss.com`). Sem build.
- **Backend**: Firebase — **Auth** (e-mail/senha) e **Firestore**. Projeto `olivewar-1e5e2`.
- **Hospedagem**: Vercel (deploy automático a cada push na branch `main` do GitHub `guigoularte/olivewar`).
- **E-mail**: EmailJS (plano grátis = 200 e-mails/mês). Service `service_yuf3qik`, Public Key `Jwl7iLqUNND6syxRU`.
  - Template de cadastro: `template_ljx1rge`. Template de relatórios: `template_r7hf9fm`.
- **PDF**: jsPDF (CDN). Cabeçalho/rodapé de marca em `oliver_pdf.js`.

## Arquivos principais
- `index.html` — boas-vindas. `login.html` — login/cadastro + recuperação de senha + verificação de e-mail.
- `app.html` — menu principal (home). Guarda permissões em localStorage para a sidebar desktop. Auto-cria perfil ausente.
- `perfil.html`, `configuracoes.html` — perfil (editável) e config (logout).
- `admin.html` — Painel Master: abas Novos/Clientes/Funcionários, busca, ⚙️ por usuário (categoria + funcionalidades + clientes atendidos).
- `admin_relatorios.html` — master vê todos os relatórios dos funcionários.
- `admin_atividades.html` — master vê todas as atividades dos clientes (clicável, com modal de detalhes).
- `fluxo_caixa.html` — entradas/saídas + saldo, filtro por mês, CSV/PDF, venda rápida por produto, **contas a pagar** (status a_pagar + vencimento + marcar pago), modo master (?uid=).
- `produtos.html` — produtos com preço (decimal) + ingredientes; editar/excluir; importável no cálculo de margem/CVL.
- `calculo_margem.html` — margem simples (ingredientes: valor pago/peso comprado/peso usado). Importa produto.
- `cvl.html` — "Cálculo de Margem Completo" (Análise CVL, wizard 3 etapas). Importa produto. Funcionalidade paga.
- `relatorios.html` — hub "Escrever Relatórios" (só funcionário/master): 1ª Visita, Checklist, Vistoria.
- `relatorio_primeira_visita.html`, `relatorio_vistoria.html`, `checklist.html` — os 3 tipos de relatório.
  - Persistência offline (initializeFirestore + persistentLocalCache). **Salvam antes de compartilhar o PDF**.
  - **Rascunho automático** (localStorage) com banner Restaurar/Descartar.
  - Opção **"Cliente não cadastrado"** (nome atendente, empresa, WhatsApp) → e-mail de aviso de novo cliente.
- `itens_resolver.html` — cliente vê pendências enviadas, marca concluído, envia foto.
- `relatorios_view.html` — "Relatórios" (histórico read-only): funcionário vê enviados, cliente vê recebidos.
- `checklist_data.json` — 155 itens da RDC 275 (extraídos do PDF do cliente).
- `oliver_ui.js` — injetado em todas as telas: **sidebar desktop** (≥1024px, baseada em localStorage `oliverPerms`), rodapé "Desenvolvido por Guilherme Goularte" + botão WhatsApp (wa.me/5551989286351).
- `oliver_pdf.js` — cabeçalho laranja + rodapé de contato dos PDFs.
- `firestore.rules` — regras de segurança (SEMPRE republicar no Console após mudar).
- `compras.html`, `vendas.html`, `cadastro_produto.html`, `newleads.html` — legados/pouco usados (Compras foi removida do menu).

## Modelo de dados (Firestore)
`usuarios/{uid}` (id = UID do Auth):
- `nome, email, telefone, segmento, faturamento, cep, cidade, estado`
- `role`: "cliente" | "master" (master é você; definido manualmente no Console)
- `categoria`: "cliente" | "funcionario" | (ausente = "novo") — definido pelo master no painel
- `funcionalidades`: mapa { produtos, vendas, fluxoCaixa, itensResolver, relatoriosHistorico, calculoMargem, cvlCompleto, relatorios }
  - básicas default true; pagas (calculoMargem, cvlCompleto) e relatorios default false
  - `relatorios: true` = é funcionário (pode escrever relatórios e ver lista de clientes)
- `clientesPermitidos`: array de UIDs (funcionário só atende esses; vazio = todos)
- `perfilAutoCriado`: true (quando o app criou o perfil por estar faltando)
- `empresaId`: id da empresa (multiempresa; null = ainda não vinculado)
- `codigoAcesso`: código pessoal (6 chars) que o cliente informa à empresa para ser vinculado

Subcoleções de `usuarios/{uid}`:
- `fluxo_caixa` — { tipo(entrada/saida), descricao, valor, categoria, forma, data, criadoEm, status(pago/a_pagar), vencimento }
- `produtos` — { nome, preco(number), ingredientes:[{nome,unidade}], data }
- `margens` — cálculo de margem salvo
- `cvl` — análise CVL salva
- `itens_resolver` — { descricao, fotoAntes, status, fotoDepois, funcionario, data } (funcionário cria; cliente resolve)
- `relatorios` — relatórios recebidos pelo cliente (read-only p/ ele)
- `relatorios_enviados` — histórico do funcionário (todos os tipos; inclui novoCliente quando não cadastrado)

## Regras de segurança (firestore.rules) — resumo
- master lê/edita tudo. Dono lê/edita o próprio, exceto role/funcionalidades/clientesPermitidos/categoria.
- funcionário (funcionalidades.relatorios) lê usuários (p/ achar clientes) e cria em itens_resolver/relatorios do cliente,
  **apenas se o cliente estiver em clientesPermitidos** (ou lista vazia = todos).
- **IMPORTANTE**: após qualquer alteração em `firestore.rules`, republicar no Firebase Console → Firestore → Regras.

## Passos manuais no Firebase (não vêm pelo Vercel)
1. Republicar `firestore.rules` quando mudar.
2. Definir seu usuário como master: Firestore → usuarios → seu doc → `role: master`.
3. Authentication → contas de login. usuarios (Firestore) usa UID como ID do doc (não busca por e-mail direto).
4. Personalizar templates de e-mail (verificação de conta) em Authentication → Templates.

## Feito recentemente
- Confirmação de e-mail obrigatória no 1º acesso (master isento).
- Auto-criação de perfil ausente no app.html.
- Contas a pagar no fluxo de caixa.
- Rascunho automático + salvar-antes-de-compartilhar nos relatórios.

## EM ANDAMENTO: Multiempresa (SaaS para consultorias)
Decisões travadas: onboarding por **código de convite**; você = super-admin global **+** dono da sua própria empresa; migração via **empresa padrão + backfill**.

Progresso por fase:
- **Fase 0 (feito)** — coleção `empresas/{id}` = { nome, ownerUid, plano, codigoConvite, criadoEm }.
  `empresas.html` (só master, linkado no Painel Master): cria empresa, gera/renova código de convite (6 chars, sem 0/O/1/I),
  e faz **backfill** (bota todos os usuários sem `empresaId` numa empresa). Regras: `empresas` lê=autenticado, escreve=master.
- **Fase 1 (feito, fluxo revisado)** — cadastro é **LIVRE** (qualquer um cria conta). O código da empresa é **opcional** no `login.html`.
  Fluxo principal invertido: cada usuário recebe um **`codigoAcesso`** pessoal (6 chars) gerado no cadastro; o cliente **informa esse código à empresa**, e a empresa o vincula em `empresas.html` (campo "Vincular usuário pelo código", seta `empresaId`).
  `app.html` mostra um banner com o `codigoAcesso` enquanto o cliente não tiver `empresaId` (com botão Copiar); gera o código para usuários antigos sem ele. `empresaId` protegido no update do próprio usuário (regras). Se o código de empresa for digitado e inválido, apaga a conta órfã (deleteUser).
- **Fase 2 (a fazer)** — isolar por `empresaId`: `admin.html`, `admin_relatorios.html`, `admin_atividades.html`, dropdown de clientes nos relatórios, `relatorios_view.html`, `itens_resolver.html`. SÓ deployar depois do backfill.
- **Fase 3 (a fazer)** — `role: empresa_admin` com painel escopado + regras que impedem cruzar empresas + (opcional) seletor de empresa pro super-admin. Testar com 2 empresas.

PASSOS MANUAIS antes da Fase 2 (fazer nesta ordem):
1. Republicar `firestore.rules` no Firebase Console (tem regras novas de `empresas`).
2. Logar como master → Painel Master → 🏢 Empresas → criar sua empresa → clicar "Trazer usuários sem empresa".
3. Testar um cadastro novo em `login.html` com o código gerado.

### Plano original (referência)
Objetivo: cada consultoria cadastra sua conta e gerencia SEUS funcionários e SEUS clientes, isolados de outras empresas.

Plano proposto:
1. Nova coleção `empresas/{empresaId}` = { nome, ownerUid, criadoEm, plano }.
2. Todo `usuarios/{uid}` ganha `empresaId`. O dono da empresa vira `role: "empresa_admin"` (master escopado à empresa).
3. Onboarding dos membros: **código de convite** por empresa (o admin gera; novo usuário digita no cadastro e herda o `empresaId`).
   Alternativa: link de cadastro por empresa (`login.html?empresa=ID`) ou o admin cria as contas.
4. Isolamento: TODAS as listagens (painel, dropdown de clientes, atividades, relatórios) filtram por `empresaId`.
5. Regras de segurança: usuário só lê/escreve dados de usuários com o MESMO `empresaId`; empresa_admin gerencia só a sua empresa.
6. Você (dono do Oliver) = super-admin global opcional, com visão de todas as empresas.
Impacto: refactor médio/grande, principalmente nas regras e nas queries. Fazer por partes e testar isolamento com 2 empresas.

## Como continuar em outra sessão
1. Abrir o Claude Code na mesma pasta do projeto (`C:\Users\guilh\Gui\OliveWar`).
2. Pedir para ler este arquivo (`CONTEXTO_OLIVER.md`) — ele resume tudo.
3. O código completo está no Git (histórico de commits conta a evolução).
