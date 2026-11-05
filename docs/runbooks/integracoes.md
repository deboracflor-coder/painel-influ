# Ligar as integrações (Meta e Google)

O código das integrações está pronto e testado. Para conectar contas reais, faça os passos
abaixo **no projeto Supabase de desenvolvimento primeiro** e repita em produção.
Nenhum desses valores vai para o GitHub nem para a Vercel.

Endereço de retorno (use o mesmo nos dois provedores):

```
https://<ID-DO-PROJETO>.supabase.co/functions/v1/oauth-callback
```

## 1. Meta (Instagram e Facebook)

1. Em developers.facebook.com, **Meus apps → Criar app**, tipo **Empresa**, ligado ao Business
   Manager da agência.
2. Adicione o produto **Login do Facebook para Empresas** (ou **Login do Facebook**). Em
   *Configurações*, cadastre o endereço de retorno acima em **URIs de redirecionamento do OAuth válidos**.
3. Em **Configurações → Básico**, preencha a URL da **Política de Privacidade** e a de
   **Exclusão de dados** (páginas do site da agência). Sem isso a Meta não aprova o app.
4. Peça **acesso avançado** (Análise do app) para:
   `pages_show_list`, `pages_read_engagement`, `read_insights`, `business_management`,
   `instagram_basic`, `instagram_manage_insights`.
   A Meta exige **verificação da empresa** e um vídeo mostrando o uso. Enquanto a análise não sai,
   o app funciona em modo de desenvolvimento só para quem tem papel no app (admin, desenvolvedor,
   testador), com as páginas dessas pessoas.
5. Copie o **ID do app** e a **Chave secreta do app**.

Requisito das contas: Instagram **profissional** (empresa ou criador) ligado a uma **Página do
Facebook**; quem conecta precisa ter acesso de administração à Página.

## 2. Google (YouTube)

1. Em console.cloud.google.com, crie um projeto e ative **YouTube Data API v3** e
   **YouTube Analytics API**.
2. **Tela de consentimento OAuth**: tipo *Externo*, nome do app, e-mail de suporte, domínio autorizado
   e URL da política de privacidade. Escopos: `youtube.readonly` e `yt-analytics.readonly`.
   Esses escopos são sensíveis: para sair do modo *Teste* o Google faz uma verificação.
   **Atenção:** em modo *Teste*, o acesso concedido vence em 7 dias; a conta aparece como
   “Acesso expirado” e precisa ser reconectada. Para uso contínuo, publique o app e conclua a verificação.
3. **Credenciais → Criar ID do cliente OAuth → Aplicativo da Web**, com o endereço de retorno acima.
4. Copie o **ID do cliente** e a **Chave secreta do cliente**.

## 3. Segredos das Edge Functions

Gere um segredo aleatório para o agendador (ex.: `openssl rand -hex 32`) e rode, na pasta do projeto:

```bash
npx supabase secrets set \
  META_APP_ID=... META_APP_SECRET=... \
  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
  APP_URL=https://SEU-SITE \
  SYNC_CRON_SECRET=<segredo-aleatório>
npx supabase functions deploy
```

`APP_URL` aceita mais de um endereço separado por vírgula (ex.: o da Vercel e o domínio próprio).
Só esses endereços recebem a pessoa de volta depois da autorização.

## 4. Agendador (coleta a cada 15 minutos)

No **SQL Editor** do projeto, uma única vez:

```sql
select vault.create_secret('https://<ID-DO-PROJETO>.supabase.co/functions/v1/sync-worker', 'sync_worker_url');
select vault.create_secret('<o mesmo segredo aleatório do passo 3>', 'sync_cron_secret');
```

Sem esses dois segredos o agendador não chama nada (e não dá erro). Para conferir:
`select * from cron.job_run_details order by start_time desc limit 5;`

## 5. Conferir

1. Entre como administrador, abra **Contas conectadas**, escolha o cliente e clique em
   **Conectar Instagram e Facebook**. Na tela da Meta, selecione só as páginas desse cliente.
2. A conta aparece como **Conectada**. Clique em **Coletar agora** e veja o resultado no
   **Histórico de coleta**.
3. Faça o mesmo com **Conectar YouTube**.
