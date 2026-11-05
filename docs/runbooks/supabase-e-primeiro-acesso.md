# Criar os projetos Supabase e o primeiro administrador

Faça isto duas vezes: um projeto de **desenvolvimento** e outro de **produção**.

1. Em supabase.com, crie o projeto na região **South America (São Paulo)**. Guarde a senha do banco
   num gerenciador de senhas (não no chat, não no GitHub).
2. **Authentication → Sign In / Providers**: deixe **Allow new users to sign up** desligado.
3. **Authentication → URL Configuration**: em *Site URL*, o endereço do site (ex.: o da Vercel); em
   *Redirect URLs*, `https://SEU-SITE/redefinir-senha`.
4. **Aplicar as migrações** (no computador, na pasta do projeto):
   ```bash
   npx supabase login
   npx supabase link --project-ref <ID-DO-PROJETO>
   npx supabase db push
   ```
5. **Primeiro administrador**: em *Authentication → Users → Add user*, crie o usuário com e-mail e
   senha. Copie o *User UID* e rode no *SQL Editor*:
   ```sql
   select public.bootstrap_organization('Nome da agência', '<USER UID>');
   ```
6. **Função de convites**: `npx supabase functions deploy admin-users`. Ela usa a service role que o
   próprio Supabase injeta no servidor; não é preciso cadastrar segredo nenhum.
7. **Vercel**: cadastre só `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
   (*Project Settings → API*). A *service role* nunca vai para a Vercel.
8. **E-mail**: o envio padrão do Supabase tem limite baixo. Antes de liberar acesso a clientes,
   configure um SMTP próprio em *Authentication → Emails → SMTP Settings*.
