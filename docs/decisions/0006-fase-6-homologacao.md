# 0006 · Fase 6: homologação e preparação para a Vercel

Situação: entregue para validação (2026-11-05).

## Testes de ponta a ponta (Playwright)

- Rodam no **site compilado** (`vite preview`), não no modo de desenvolvimento, com os **mesmos
  cabeçalhos de segurança da Vercel** lidos do `vercel.json`. Assim, uma violação de CSP aparece no
  teste, não em produção. Só no preview local a CSP também libera o Supabase local (`http://127.0.0.1`).
- Toda página é vigiada: erro de JavaScript, violação de CSP ou erro no console reprovam o teste.
- Dados: os fictícios do `scripts/seed-local.ts` (só roda contra o Supabase local). As sessões de cada
  papel são criadas pela tela de login real.
- O teste de “Sair” usa um usuário descartável: “Sair” encerra todas as sessões da pessoa
  (comportamento padrão do Supabase, mantido por ser o mais seguro).
- Novo job no CI: “Navegador (ponta a ponta)”.

## Correções encontradas na homologação

- **Nome dos arquivos CSV**: com acento, o Chromium trocava o nome por “download”. O nome agora sai
  sem acentos (`asciiFileName`); o conteúdo continua com acentos.
- **Métricas que a rede não fornece**: em “Por rede”, alcance e salvamentos do YouTube e salvamentos do
  Facebook apareciam como “Sem dado”. Agora aparecem como **Indisponível**, como manda a regra do
  projeto (`NOT_PROVIDED` em `src/domain/metrics.ts`, igual aos coletores).
- **Dados fictícios coerentes**: o seed gerava salvamentos para o YouTube, métrica que a API não tem.

## Desempenho

- Telas carregadas sob demanda (`React.lazy`): a primeira visita baixa login, layout e visão executiva.
- `zod` saiu do app (continua nas Edge Functions): a validação das duas variáveis públicas é manual.
- Primeira visita: 205 → 174 KB comprimidos. Orçamento no CI: 200 KB na primeira visita, 100 KB por
  arquivo (`scripts/check-bundle.mjs`).
- Índices para as tabelas que crescem com a coleta (`20261109000100_homologacao_indices.sql`),
  apontados pelo advisor de desempenho do Supabase.

## Segurança

- Advisor de segurança do Supabase: sem alertas. Os avisos informativos “RLS sem política” em
  `oauth_states` e `raw_payloads` são intencionais: só o servidor (service role) acessa.
- `supabase db lint` acusa `_imp` inexistente em `import_daily_metrics`: falso positivo (tabela
  temporária criada na própria função, que o verificador estático não enxerga). Coberto pelo pgTAP.
- `npm audit`: 0 vulnerabilidades no que vai para o navegador. Há 10 moderadas só em ferramentas de
  desenvolvimento (eslint → minimatch), sem efeito no site; a correção exige trocar de versão
  principal do eslint e fica para quando sair a versão compatível.
- CI passa a barrar: dependência de produção com vulnerabilidade alta, credencial versionada,
  pacote acima do orçamento.
- Vercel: cache longo para `/assets`; versões de Preview protegidas por login da Vercel (runbook).

## Publicação

`docs/runbooks/publicar-na-vercel.md` (passo a passo) e `docs/homologacao.md` (roteiro, com o que
falta conferir com contas reais).
