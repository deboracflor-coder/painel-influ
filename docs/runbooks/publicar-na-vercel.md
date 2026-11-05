# Publicar na Vercel

O app é um site estático (React + Vite). Tudo o que é sensível fica no Supabase: banco com RLS,
Edge Functions e segredos. A Vercel recebe só duas variáveis públicas.

Ordem recomendada: **desenvolvimento** primeiro (homologação), depois **produção**.

## 0. Antes de começar

- Projeto Supabase criado e com as migrações aplicadas: `docs/runbooks/supabase-e-primeiro-acesso.md`.
- Edge Functions publicadas: `npx supabase functions deploy` (todas de uma vez).
- Integrações (opcional, pode ser depois): `docs/runbooks/integracoes.md`.

## 1. Criar o projeto na Vercel

1. Em vercel.com, **Add New → Project** e importe o repositório `painel-influ` do GitHub.
2. *Framework Preset*: **Vite** (o `vercel.json` já define). *Build Command*: `npm run build`.
   *Output Directory*: `dist`. A versão do Node vem do `package.json` (22).
3. **Environment Variables**: cadastre as duas, separadas por ambiente:

   | Variável | Production | Preview |
   |---|---|---|
   | `VITE_SUPABASE_URL` | URL do projeto Supabase de **produção** | URL do projeto de **desenvolvimento** |
   | `VITE_SUPABASE_ANON_KEY` | chave *anon* de produção | chave *anon* de desenvolvimento |

   Os valores ficam em *Supabase → Project Settings → API*. **Nunca** cadastre a *service role*,
   segredos da Meta ou do Google na Vercel. Se aparecer uma variável `VITE_` com `SERVICE` ou
   `SECRET` no nome, o app se recusa a abrir (o erro aparece no console do navegador).
4. **Deploy**.

## 2. Proteger as versões de teste

Cada PR gera um endereço de *Preview*. O app exige login, mas para não expor nem a tela de entrada:
*Project Settings → Deployment Protection → Vercel Authentication*: **Standard Protection**
(só quem tem conta no time da Vercel abre as versões de teste).

## 3. Domínio

*Project Settings → Domains*: adicione o domínio da agência (ex.: `painel.suaagencia.com.br`) e
siga as instruções de DNS. O HTTPS é automático.

## 4. Avisar o Supabase do endereço do site

No projeto Supabase do mesmo ambiente:

1. **Authentication → URL Configuration**: *Site URL* = endereço do site; em *Redirect URLs*,
   `https://SEU-SITE/redefinir-senha`.
2. **Segredo das Edge Functions** (para a volta da conexão com Meta, Google e Google Sheets):
   ```bash
   npx supabase secrets set APP_URL=https://SEU-SITE
   ```
   Com mais de um endereço (domínio próprio e o `.vercel.app`), separe por vírgula.

## 5. Conferir depois de publicar (5 minutos)

1. Abra `https://SEU-SITE/relatorio` sem estar logado: deve ir para a tela de entrada.
2. Entre com o administrador: a visão executiva carrega e o menu mostra a área da agência.
3. Abra uma tela qualquer e recarregue a página (F5): ela continua abrindo, sem erro 404.
4. Em *Contas conectadas*, os botões de conexão respondem (se as integrações ainda não foram
   configuradas, aparece o aviso de configuração pendente).
5. Em <https://securityheaders.com>, o site deve tirar nota **A** (cabeçalhos do `vercel.json`).

## 6. Voltar uma versão

*Deployments* → escolha a versão anterior → **Promote to Production** (ou *Instant Rollback*).
Migrações de banco não voltam sozinhas: toda migração deste projeto só acrescenta estrutura, então
a versão anterior do site continua funcionando com o banco mais novo.

## O que o `vercel.json` faz

- Toda rota cai no `index.html` (o app cuida da navegação); arquivos de `/assets` têm cache longo
  (o nome muda a cada versão).
- Cabeçalhos de segurança: CSP (só scripts do próprio site; conexões só com o Supabase), proibição
  de abrir o site dentro de outro (`frame-ancestors 'none'` e `X-Frame-Options`), HSTS,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy` e `X-Robots-Tag: noindex` (o painel não aparece
  em buscadores).
- Os testes de ponta a ponta rodam o site compilado com esses mesmos cabeçalhos
  (`vite preview`, ver `vite.config.ts`).
