# Colocar no ar (site, banco e notificações)

## 1. Supabase

```sql
-- SQL Editor → cole e rode, nesta ordem:
-- 1) supabase/migrations/0001_schema.sql
-- 2) supabase/migrations/0002_delivery.sql   (delivery, capa, Instagram/WhatsApp, kg, segurança dos pedidos)
```

> Já tinha rodado o 0001 de uma versão anterior? Rode só o 0002. Ele corrige também a leitura de pedidos e de
> perfis (antes qualquer pessoa logada conseguia ler) e passa a calcular o valor do pedido no servidor.

Depois, em **Database → Replication** (ou **Realtime**), confira se a tabela `pedidos` está marcada.
É isso que faz o pedido aparecer na hora para a pani e o status mudar sozinho na tela do cliente.

Depois, em **Authentication → URL Configuration**:

| Campo | Valor |
|---|---|
| Site URL | `https://SEU-DOMINIO` |
| Redirect URLs | `https://SEU-DOMINIO/**`, `http://localhost:5173/**`, `app.apppani.mobile://**` |

A última linha é o que faz o login com Google/Apple **voltar para o app nativo**. Sem ela, o usuário fica
preso no navegador depois de entrar.

Em **Authentication → Providers**:
- **Email**: ligado. *Confirm email* desligado deixa o cadastro instantâneo (ligado, o usuário precisa confirmar).
- **Google**: crie as credenciais OAuth no Google Cloud e cole Client ID e Secret.
  O *Authorized redirect URI* é o que o Supabase mostra na tela (`https://SEU-PROJETO.supabase.co/auth/v1/callback`).
- **Apple**: necessário para a App Store se o Google estiver ligado (veja `docs/LOJAS.md`).

Em **Authentication → Emails**, traduza os modelos para português. No de recuperação de senha, use:
`{{ .SiteURL }}/redefinir-senha#access_token={{ .Token }}` só se você mudar o fluxo — com a configuração padrão
do projeto (`flowType: 'implicit'`) o link que o Supabase já manda funciona.

---

## 2. Site

Qualquer hospedagem de arquivos estáticos serve. O importante é **mandar todas as rotas para `index.html`**
(o app usa rotas de navegador, como `/c/padaria-do-ze` e `/pedido/…`).

O projeto já traz:
- `public/.htaccess` — hospedagem com cPanel/Apache (Hostinger, HostGator, Locaweb, KingHost…)
- `vercel.json` — Vercel
- `public/_redirects` — Netlify, Cloudflare Pages

### Hospedagem com cPanel (Hostinger, HostGator, Locaweb…)

1. No seu computador: preencha o `.env` (as variáveis abaixo) e rode `npm run build`.
2. No Gerenciador de Arquivos, abra `public_html/` e envie **o conteúdo** de `dist/` (não a pasta em si).
   Ative “mostrar arquivos ocultos” para conferir que o `.htaccess` foi junto.
3. Ative o **SSL grátis** (Let's Encrypt) no painel. Sem https não tem notificação nem login com Google.
4. Abra `https://seudominio.com.br/c/algum-slug` direto na barra: se abrir o app (e não erro 404), as rotas estão certas.

> A hospedagem só serve os arquivos do site. Banco, login, fotos e notificações ficam no Supabase —
> não precisa de banco MySQL nem de PHP.

```bash
npm run build     # gera dist/
```

Variáveis de ambiente no painel da hospedagem (as mesmas do `.env`):

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_VAPID_PUBLIC_KEY
VITE_APP_URL
VITE_SUPORTE_EMAIL
VITE_EMPRESA
VITE_APPLE_LOGIN
```

> Elas entram no build. Mudou alguma? Rode o deploy de novo.

---

## 3. Notificações

```bash
npm i -g supabase
supabase login
supabase link --project-ref SEU-PROJECT-REF
supabase functions deploy send-push

npx web-push generate-vapid-keys        # guarde as duas chaves
```

Secrets (Supabase → Edge Functions → Secrets):

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:suporte@seudominio.com
APP_URL=https://SEU-DOMINIO
FCM_SERVICE_ACCOUNT={"type":"service_account", ...}
```

`VAPID_PUBLIC_KEY` também vai no `.env` do site como `VITE_VAPID_PUBLIC_KEY`.
`FCM_SERVICE_ACCOUNT` só é necessário para o app das lojas (veja `docs/LOJAS.md`).

Testar:

```bash
curl -X POST https://SEU-PROJETO.supabase.co/functions/v1/send-push \
  -H "Authorization: Bearer SUA_ANON_KEY" \
  -H "content-type: application/json" \
  -d '{"fornada_id":"UUID_DE_UMA_FORNADA"}'
```

A resposta traz `{ enviados, aparelhos, nativos, web, removidos }`.

> A função confere quem chama: só o dono da pani dispara aviso de fornada e de status do pedido
> (o teste com a anon key acima responde `sem permissao` — é o esperado; teste pelo app).
> Mudou a função? Rode `supabase functions deploy send-push` de novo.

---

## 4. Primeiro administrador

```sql
update public.profiles set role = 'adm'
 where id = (select id from auth.users where email = 'voce@exemplo.com');
```

Administração: `https://SEU-DOMINIO/panipani`.

---

## 5. Cadastrar uma panificadora

A pani se cadastra sozinha no app escolhendo **"Sou panificadora"** — o banco cria o registro e o link
`/c/nome-da-pani` automaticamente. Para criar na mão:

```sql
insert into public.panis (owner, nome, slug)
values ((select id from auth.users where email = 'pani@exemplo.com'), 'Padaria do Zé', 'padaria-do-ze');

update public.profiles set role = 'pani'
 where id = (select id from auth.users where email = 'pani@exemplo.com');
```

---

## 6. Manutenção

| Tarefa | Onde |
|---|---|
| Ver erros do app | console do navegador / Logs da hospedagem |
| Ver erros das notificações | Supabase → Edge Functions → send-push → Logs |
| Fila de denúncias | `/panipani` → Moderar (analise em até 24 h) |
| Backup | Supabase → Database → Backups (diário no plano pago) |
| Limpar pedidos antigos | `delete from pedidos where created_at < now() - interval '90 days';` |
| Pedidos de delivery do dia | `select * from pedidos where tipo = 'delivery' and created_at > current_date;` |
