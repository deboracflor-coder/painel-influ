# 0002 — Fase 2: fundação técnica

- Data: 2026-11-05
- Status: implementada, aguardando validação

## Decisões

1. **Versão anterior preservada na branch `legado/v0-nextjs`** (o proxy do ambiente bloqueou o envio de tags).
2. **Papéis**: `org_admin`, `org_analyst` (só clientes atribuídos em `client_assignments`) e `client_viewer`.
   O papel `client_admin`, citado no diagnóstico, ficou de fora: o pedido não prevê que o cliente gerencie
   usuários. Volta se for pedido.
3. **Isolamento por chaves compostas**: posts, métricas, sincronizações e erros referenciam
   `(conta, cliente, organização)` juntos, então o banco recusa uma linha com conta de um cliente e
   `client_id` de outro, mesmo vinda do backend.
4. **Privilégio mínimo**: `revoke all` de `anon` e `authenticated` em tabelas, sequências e funções;
   `grant` coluna a coluna. O Supabase concede `EXECUTE` em funções novas por um default global que o
   revoke por schema não remove, por isso há um revoke explícito no fim da migração.
5. **Funções de permissão no schema `private`**, que a API REST não expõe.
6. **Escrita de dados coletados só pela service role** (Edge Functions na Fase 4). O navegador só lê.
7. **Cadastro aberto desligado** (`enable_signup = false`): acesso só por convite da agência.
8. **Login por e-mail e senha** com recuperação por link. Mensagens de erro não revelam se o e-mail existe.
9. **Snapshots sem particionamento por enquanto**: índices por cliente e data bastam no volume inicial;
   particionar quando o volume justificar (a chave única `(post_id, collected_at)` já permite).
10. **Atualização da tela a cada 60 s** via TanStack Query (`refetchInterval`), sem relação com a coleta.
11. **Tokens OAuth**: gravação e leitura só pela service role (`store_account_token`, `read_account_token`);
    `revoke_account_connection` apaga o segredo do Vault e para a coleta. A coluna `token_secret_id` não é
    legível pelo navegador nem entra na auditoria.
