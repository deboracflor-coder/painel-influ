# Painel Influ

Dashboard de performance de redes sociais (Instagram, TikTok, YouTube, Facebook) e de marcas parceiras: entregas contratadas x entregues, valor estimado (EMV) com parâmetros configuráveis, portal por marca, relatório e alertas.

- **Sem Supabase configurado**, o site abre a **demonstração com dados fictícios** (perfil "Perfil Demo", marcas Aurora, Trilha e Nimbus).
- **Com Supabase configurado**, exige login por e-mail e mostra só os dados reais do banco, recortados pelo perfil de cada pessoa.

Regras do projeto: métrica que a API não fornece fica em branco (nunca zero); dado importado ou digitado aparece como "Dado manual"; EMV só existe quando há parâmetro cadastrado com metodologia; tokens das redes ficam no Supabase Vault e nunca chegam ao navegador.

## Como está organizado

| Pasta | O que tem |
|---|---|
| `app/` | Next.js (App Router): página do painel, login, Cadastros, Acessos e rotas de API |
| `public/painel/` | Interface do painel e toda a lógica de cálculo (`lib/calc.js`), filtros e permissões (`lib/query.js`), insights, importador e gráficos. É o mesmo código do protótipo, com modo produção |
| `lib/` | Leitura dos dados do banco (`data.ts`), sessão e papéis (`auth.ts`), conexão com as redes (`oauth.ts`) |
| `supabase/migrations/` | Banco completo com regras de acesso por marca (RLS), Vault e agendamento |
| `supabase/functions/sync-runner/` | Rotina que coleta Instagram, TikTok, YouTube e Facebook |
| `tests/` | Testes de cálculo/importação (`npm test`) e de navegador (`npm run test:e2e`) |

## Rodar no computador

```bash
npm install
npm run dev        # http://localhost:3000 em modo demonstração
npm test           # cálculos, importação, permissões
```

Para o modo real, copie `.env.example` para `.env.local` e preencha.

## Colocar no ar

1. **Supabase**: crie um projeto (região São Paulo). Em *SQL Editor*, rode os dois arquivos de `supabase/migrations/` na ordem. Antes do segundo, guarde no Vault a URL do projeto e a service role (instruções no topo do bloco "Agendamento").
2. **Rotina de coleta**: com o Supabase CLI, `supabase link` e `supabase functions deploy sync-runner`. Em *Edge Functions > Secrets*, cadastre `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (para renovar tokens).
3. **Login**: em *Authentication > URL Configuration*, coloque o endereço do site em *Site URL* e `https://SEU-SITE/auth/callback` em *Redirect URLs*.
4. **Vercel**: importe este repositório e cadastre as variáveis de `.env.example`. Cada atualização na branch `main` publica sozinha.
5. **Primeiro acesso**: entre com o e-mail de `OWNER_EMAIL`. O painel cria o workspace e você vira administradora. Outras pessoas entram pela tela **Acessos**.
6. **Redes**: crie os apps de desenvolvedor e cadastre como endereço de retorno:
   - Meta: `https://SEU-SITE/api/connect/meta/callback`
   - TikTok: `https://SEU-SITE/api/connect/tiktok/callback`
   - Google: `https://SEU-SITE/api/connect/google/callback`

   Depois, em **Integrações**, clique em Conectar em cada rede.

## Automação

| Quando | O quê |
|---|---|
| A cada 3 h | Seguidores e posts dos últimos 30 dias |
| A cada 1 h | Stories do Instagram (expiram em 24 h) |
| Todo dia 04:30 (Brasília) | Série diária das contas |
| Todo dia 03:00 (Brasília) | Renovação de tokens do TikTok e Google; se falhar, alerta "reconectar" |
| Botão "Atualizar dados" | Tudo na hora, só para o seu workspace |

## Limitações conhecidas

- Os conectores ainda **não foram executados contra as APIs reais**: dependem dos apps aprovados e das suas contas.
- TikTok: salvamentos por vídeo não vêm na API usada (Display API); entram por importação como "Dado manual".
- YouTube não fornece alcance. Instagram não fornece cliques por post (use links com UTM ou importação).
- App do Google em "modo de teste" expira o acesso a cada 7 dias; publique o app para uso contínuo.
- LinkedIn exige aprovação da Community Management API; por enquanto, só por importação.
