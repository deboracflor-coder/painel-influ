# 0004 · Fase 4: integrações com Instagram, Facebook e YouTube

Situação: entregue para validação (2026-11-05). Contas reais dependem dos apps da Meta e do Google
(veja `docs/runbooks/integracoes.md`).

## Fluxo

1. **Conectar** (`oauth-start`): só quem opera o cliente (admin, ou analista atribuído). Gera um
   estado aleatório de uso único, válido por 10 minutos, e devolve o endereço oficial de autorização.
   Google usa PKCE. O endereço de volta para o app só pode ser um dos cadastrados em `APP_URL`.
2. **Retorno** (`oauth-callback`): valida e consome o estado, troca o código por token no servidor,
   descobre as contas e grava o token no **Supabase Vault**. A pessoa volta para `/contas` sem nenhum
   token na URL.
   - Meta: um login conecta a Página do Facebook e o Instagram profissional ligado a ela. Usamos o
     token da Página (derivado de token de longa duração), que não vence por prazo.
   - Google: guardamos o refresh token; o access token é renovado antes de cada coleta.
   - Conta que já pertence a outro cliente da agência não é movida: é ignorada e avisada.
3. **Coleta** (`sync-worker` pelo pg_cron a cada 15 min, ou **Coletar agora** em `account-actions`):
   uma execução por conta (índice único impede duas ao mesmo tempo), gravação numa transação
   (`ingest_sync_batch`), registro em `sync_runs`/`sync_errors` e respostas brutas por 30 dias
   (`raw_payloads`, com tokens removidos).
4. **Desconectar**: apaga o token do Vault e para a coleta. No Google, também revoga o acesso na
   origem. A Meta não oferece revogação com token de página; a pessoa pode remover o app nas
   configurações do Facebook.

## Janela de coleta

- Primeira coleta: publicações dos últimos 180 dias.
- Depois: métricas das publicações dos últimos 45 dias, a cada coleta. Publicações mais antigas
  ficam com a última medição.
- Séries diárias de conta: últimos 28 dias a cada coleta.
- Seguidores: as APIs só dão o número atual. O painel registra um valor por dia **a partir da
  conexão**; dias anteriores ficam sem dado (não estimamos).

## Erros

| Situação | O que acontece |
|---|---|
| Token expirado ou revogado | conta fica “Acesso expirado”, coleta para até reconectar |
| Limite de uso da API / falha de rede | nova tentativa em 5, 10 min (até 3 tentativas) |
| Permissão faltando | conta fica com erro e a mensagem da rede aparece na tela |
| Métrica indisponível para um post (ex.: story com poucas visualizações) | coleta continua; aviso no histórico; métrica fica sem dado |

## Métricas (catálogo em `metric_catalog`, conferido na documentação oficial em 2026-11-05)

- Instagram: views, reach, likes, comments, shares, saved, tempo médio (reels), visitas ao perfil,
  follows, cliques no link (stories). `impressions` foi descontinuada (posts após 02/07/2024).
- Facebook: `post_media_view` e `post_total_media_view_unique` substituem `post_impressions*`
  (descontinuadas em 2025). A API não fornece salvamentos. **Compartilhamentos:** quando a API não
  devolve o campo `shares`, gravamos “sem dado”, não zero.
- YouTube: totais públicos do vídeo (views, likes, comentários) + Analytics (compartilhamentos,
  tempo de exibição, duração média; séries diárias de views e inscritos). Não existe alcance nem
  salvamentos. **Formato:** a API não informa se um vídeo é Short; todos aparecem como “Vídeo”.

## Testes

- Unitários dos coletores com respostas no formato da documentação (`tests/unit/collect.test.ts`).
- pgTAP da gravação (`supabase/tests/03_integracoes.test.sql`): idempotência, valor ausente não apaga
  valor gravado, dado manual não é sobrescrito.
- Ponta a ponta (`tests/api/integracoes.test.ts`): Edge Functions reais contra um servidor de teste
  no lugar da Meta e do Google (`supabase/functions/.env.test`, só valores de teste).

## Correção

- A Fase 3 criou um gatilho “a agência nunca fica sem administrador” que já existia desde a Fase 2.
  A migração desta fase remove a cópia; a regra continua valendo e testada.
