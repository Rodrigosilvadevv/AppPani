# AppPani 🥖

Rede social + delivery de padaria. O cliente segue as panificadoras, recebe aviso de **fornada saindo agora**,
curte, comenta, pede pela mesa e pede **delivery** (por unidade ou por peso) acompanhando cada passo.
A pani avisa a fornada com um toque, liga o modo delivery, administra os pedidos em tempo real,
tem capa estilo rede social, Instagram/WhatsApp no perfil, cardápio com QR code e caderno de receitas.
A administração acompanha planos, conversas e moderação.

Roda como site, como PWA e como aplicativo nativo na **App Store** e na **Google Play** (Capacitor).

---

## Começar em 5 passos

```bash
npm install
cp .env.example .env          # preencha com os dados do seu Supabase
npm run dev                   # http://localhost:5173
```

1. **Crie o projeto no Supabase** (supabase.com, plano gratuito serve para começar).
2. No **SQL Editor**, cole e rode, **nesta ordem**:
   [`supabase/migrations/0001_schema.sql`](supabase/migrations/0001_schema.sql) e depois
   [`supabase/migrations/0002_delivery.sql`](supabase/migrations/0002_delivery.sql).
   Eles criam tabelas, segurança (RLS), gatilhos, funções, delivery e o bucket de imagens.
   Já rodou o 0001 antes? Rode só o 0002. Os dois podem ser rodados de novo sem estragar nada.
3. Em **Project Settings → API**, copie `URL` e `anon key` para o `.env`.
4. Em **Authentication → Providers → Email**, desligue *Confirm email* (ou mantenha ligado e avise os usuários).
5. `npm run dev`. Crie sua conta, depois promova a si mesmo a administrador:

```sql
update public.profiles set role = 'adm'
 where id = (select id from auth.users where email = 'voce@exemplo.com');
```

A administração fica em **/panipani**.

---

## Notificações (fornada saindo)

```bash
npx supabase functions deploy send-push        # precisa da CLI do Supabase
npx web-push generate-vapid-keys               # gera o par de chaves do push web
```

Secrets da função (Supabase → Edge Functions → Secrets):

| Secret | Para quê |
|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | push no navegador e no PWA |
| `VAPID_SUBJECT` | `mailto:seu@email.com` |
| `FCM_SERVICE_ACCOUNT` | JSON da conta de serviço do Firebase — push no app nativo (iOS e Android) |
| `APP_URL` | `https://seusite.com` (link aberto ao tocar na notificação) |

A chave **pública** do VAPID também vai no `.env` como `VITE_VAPID_PUBLIC_KEY`.
Passo a passo do Firebase/APNs: [`docs/LOJAS.md`](docs/LOJAS.md).

---

## Publicar

- **Web / PWA:** `npm run build` e suba o **conteúdo** da pasta `dist/`.
  Hospedagem com cPanel/Apache (Hostinger, HostGator, Locaweb…): envie para `public_html/` — o `.htaccess`
  já vai junto e cuida das rotas e do HTTPS. Vercel/Netlify: configure as variáveis `VITE_*` (veja `docs/DEPLOY.md`).
- **App Store e Google Play:** [`docs/LOJAS.md`](docs/LOJAS.md) — passo a passo completo.

```bash
npm run build
npx cap add android && npx cap add ios   # só na primeira vez
npm run icones                           # gera ícones e splash a partir de assets/
npm run nativo:config                    # confere e ajusta o que falta nos projetos nativos
npm run android                          # abre o Android Studio
npm run ios                              # abre o Xcode (precisa de Mac)
```

---

## Como o projeto está organizado

```
src/
  config.js            nome, URLs, e-mail de suporte, chaves de funcionalidade
  main.jsx             rotas, barreira de erro, ponte com o app nativo
  ui.jsx               design system: Shell, Sheet, Toast, Confirm, botões, skeletons
  auth/                sessão, login (e-mail/telefone/Google/Apple), nova senha
  components/social.jsx curtidas, comentários, denúncia, bloqueio, menu "⋯"
  lib/
    supabase.js        cliente do banco
    util.js            tempo, dinheiro, distância, horários, upload de imagem, som de pedido
    push.js            notificações: web (VAPID) e nativo (FCM/APNs) na mesma tabela
    native.js          Capacitor: vibração, compartilhar, GPS, barra de status, splash
    hooks.js           revalidação ao voltar para o app
    moderacao.js       filtro de texto antes de publicar
  pages/
    Cliente.jsx        feed, explorar, página da pani (capa + redes), ajustes
    Delivery.jsx       lojas com delivery, sacola por unidade/peso, checkout, meus pedidos
    Pedido.jsx         /pedido/:id — acompanhar o pedido pelo link
    Pani.jsx           painel de fornada, pedidos (mesa + delivery), cardápio + QR, receitas, clientes, chat, ajustes
    Admin.jsx          panis, clientes, conversas, moderação, avisos, cards
    Cardapio.jsx       /c/:slug — cardápio público e pedido pela mesa (sem login)
    Chat.jsx           conversa pani ↔ administração, em tempo real
    Legal.jsx          privacidade e termos (exigidos pelas lojas)
supabase/
  migrations/0001_schema.sql   banco: tabelas, RLS, gatilhos, funções
  migrations/0002_delivery.sql delivery, capa, redes, kg, pedido calculado no servidor
  functions/send-push/         Edge Function de notificações
```

---

## O que já vem resolvido

**Produto**
- Feed com curtidas e comentários, seguir pani, filtro por pão/salgado/doce.
- Aviso de fornada com um toque: envia a notificação, publica no feed (ou só notifica) e já cadastra os itens no cardápio.
- Pedido pela mesa sem login, com acompanhamento do status e som + vibração na cozinha.
- Modo delivery: a pani liga em Ajustes (taxa, pedido mínimo, tempo); os pães, salgados e doces do Painel viram
  vitrine de delivery. Com o delivery ligado, preço e unidade (un ou kg) são obrigatórios.
- Cliente escolhe por unidade ou por peso (100 g, 250 g, 500 g, 1 kg… ou de 50 em 50 g), vê o total na hora,
  paga na entrega (Pix, dinheiro com troco, cartão) e acompanha: recebido → preparando → saiu → entregue.
- Selo “fresquinho”: pão 10 h, salgado 30 h, doce 3 dias.
- Capa estilo Facebook, Instagram e WhatsApp no perfil da pani e no cardápio.
- Cardápio público com QR code pronto para imprimir.
- Chat permanente entre pani e administração; avisos da pani passam por aprovação.

**Técnico**
- Segurança no banco (RLS) em todas as tabelas: ninguém lê ou escreve o que não é seu.
- Pedido montado no servidor (`fazer_pedido`): o preço vem do cardápio, não do celular — ninguém manda pedido com preço inventado.
- Gatilhos impedem que alguém mude o próprio `role`, o plano ou o contador de seguidores.
- Notificações numa tabela só, servindo navegador e app das lojas.
- Carregamento por demanda das telas grandes, skeletons, revalidação ao voltar para o app.
- Tela de erro amigável no lugar da tela branca; funciona com teclado aberto e com *notch*.

**Lojas**
- Exclusão de conta dentro do app, privacidade e termos, denúncia, bloqueio e fila de moderação.
- Deep links, ícones, splash e textos de permissão configurados por script.
