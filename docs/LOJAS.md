# Publicar na App Store e na Google Play

Passo a passo do que falta depois que o app já roda no navegador.
Dados conferidos em **17/11/2026** — Apple e Google mudam as regras todo ano, então confirme nas páginas oficiais
([Apple · Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/) e
[Google · Target API level](https://support.google.com/googleplay/android-developer/answer/11926878)).

---

## 0. O que você vai precisar

| Item | Apple | Google |
|---|---|---|
| Conta de desenvolvedor | Apple Developer Program — US$ 99/ano | Google Play Console — US$ 25, uma vez |
| Máquina | **Mac** com Xcode 26 ou mais novo (obrigatório desde 28/04/2026) | Qualquer SO, com Android Studio |
| Formato enviado | build pelo Xcode / Transporter | **AAB** (Android App Bundle) |
| Target mínimo | iOS 13 ou maior | **API 36 (Android 16)** para apps novos e atualizações, desde 31/08/2026 |
| Prazo típico de análise | 1–3 dias | 1–7 dias (+ teste fechado, veja o passo 6) |

> **Conta pessoal na Google Play criada depois de 13/11/2023** precisa rodar um **teste fechado com 12 testadores
> por 14 dias seguidos** antes de pedir acesso à produção. Conta de **organização** (empresa com CNPJ) não precisa.
> Se você tem CNPJ, abra a conta como organização: economiza duas semanas.

---

## 1. Antes de qualquer coisa: publique o site

As duas lojas exigem URL pública de privacidade. O app já tem as páginas prontas:

- `https://SEU-DOMINIO/privacidade`
- `https://SEU-DOMINIO/termos`

Revise os textos em `src/pages/Legal.jsx` (os trechos entre `[ ]` são para você preencher: CNPJ, endereço) e
preencha `VITE_EMPRESA` e `VITE_SUPORTE_EMAIL` no `.env`. Faça o deploy antes de abrir as fichas nas lojas.

---

## 2. Notificações: Firebase (serve para iOS e Android)

1. Crie um projeto em [console.firebase.google.com](https://console.firebase.google.com) (pode ser sem Analytics).
2. **Android** → adicionar app → package name **`app.apppani.mobile`** → baixe `google-services.json`
   → coloque em `android/app/google-services.json`.
3. **iOS** → adicionar app → bundle ID **`app.apppani.mobile`** → baixe `GoogleService-Info.plist`
   → coloque em `ios/App/App/GoogleService-Info.plist`.
4. No **Apple Developer → Certificates, Identifiers & Profiles → Keys**, crie uma chave **APNs** (.p8),
   anote o *Key ID* e o *Team ID*, e envie o .p8 em **Firebase → Configurações do projeto → Cloud Messaging → Apple**.
5. **Firebase → Configurações do projeto → Contas de serviço → Gerar nova chave privada** (JSON).
   Cole o JSON inteiro no secret `FCM_SERVICE_ACCOUNT` da Edge Function.

Teste o push **em aparelho de verdade**: simulador de iPhone não recebe notificação remota.

---

## 3. Gerar os projetos nativos

```bash
npm run build
npx cap add android
npx cap add ios          # só em Mac
npm run icones           # ícones e splash a partir de assets/
npm run nativo:config    # confere tudo e ajusta Manifest/Info.plist
npm run sync             # build + cópia para os projetos nativos
```

Troque `assets/icon.png` e `assets/splash.png` pela sua arte antes de rodar `npm run icones`
(os arquivos que vieram no projeto são um ponto de partida). Tamanhos: ícone 1024×1024, splash 2732×2732 com
o desenho no meio.

Toda vez que mudar o código web: `npm run sync`.

---

## 4. Android — do Android Studio à Play Store

1. `npm run android` abre o Android Studio.
2. Em `android/app/build.gradle`, confirme:
   ```gradle
   compileSdk 36
   defaultConfig {
       applicationId "app.apppani.mobile"
       targetSdk 36          // exigência do Google desde 31/08/2026
       minSdk 23
       versionCode 1         // suba 1 a cada envio
       versionName "1.0.0"
   }
   ```
3. **Build → Generate Signed Bundle / APK → Android App Bundle**. Crie a *keystore* e
   **guarde o arquivo e as senhas**: sem ela você não consegue atualizar o app nunca mais.
4. No [Play Console](https://play.google.com/console): criar app → nome, idioma pt-BR, app gratuito.
5. Preencha, na ordem em que o console pede:
   - **Painel de políticas → Conteúdo do app**: política de privacidade (URL do passo 1), anúncios, classificação
     indicativa, público-alvo, segurança de dados.
   - **Segurança de dados**: declare o que o app coleta — e-mail/telefone, nome, fotos enviadas, localização
     aproximada (apenas quando o usuário toca em "usar minha localização"), identificador de notificação. Tudo é
     criptografado em trânsito e o usuário pode pedir exclusão.
   - **Exclusão de conta**: informe que é feita dentro do app (Ajustes → Excluir conta) e informe também a URL
     `https://SEU-DOMINIO/privacidade` como canal alternativo. O Google exige os dois caminhos.
6. **Teste fechado** (conta pessoal): crie a faixa, convide 12 pessoas por e-mail, espere 14 dias com elas
   realmente usando, depois **Solicitar acesso à produção**.
7. **Produção** → enviar o AAB → revisão.

**Ficha da loja** (prepare antes): título até 30 caracteres, descrição curta até 80, descrição completa até 4000,
ícone 512×512, imagem de destaque 1024×500, no mínimo 2 capturas de tela de celular (mín. 320 px de lado).

---

## 5. iOS — do Xcode à App Store

1. `npm run ios` abre o Xcode.
2. Alvo **App** → *Signing & Capabilities*:
   - Team: sua conta paga. Bundle Identifier: `app.apppani.mobile`.
   - **+ Capability → Push Notifications**.
   - **+ Capability → Background Modes** → marque *Remote notifications*.
   - Se usar links do site dentro do app: **Associated Domains** → `applinks:SEU-DOMINIO`.
3. *General* → **Minimum Deployments: iOS 14** (pedido mínimo da Apple hoje é iOS 13).
4. Textos de permissão no `Info.plist` — o `npm run nativo:config` já coloca câmera, fotos e localização.
   Sem eles o app é rejeitado na hora.
5. **Login com Apple é obrigatório** se o app oferece login social de terceiros (o nosso oferece Google).
   Ative em `.env` com `VITE_APPLE_LOGIN=true`, habilite *Sign in with Apple* no Xcode (+ Capability)
   e configure o provedor Apple no Supabase (Authentication → Providers → Apple).
6. **Product → Archive → Distribute App → App Store Connect**.
7. Em [appstoreconnect.apple.com](https://appstoreconnect.apple.com): novo app, preencha e envie para revisão.
   - **Privacy Nutrition Labels**: mesmas informações do passo 4.5.
   - **Export Compliance**: o app só usa HTTPS padrão → responda que **não** usa criptografia não isenta
     (ou adicione `ITSAppUsesNonExemptEncryption = NO` no `Info.plist` para não perguntar toda vez).
   - **Conta de demonstração**: crie um login de cliente **e** um de panificadora com dados de exemplo e
     informe usuário e senha em *App Review Information*. Sem isso a revisão para.
   - **Suporte**: URL e e-mail que respondam de verdade.

**Capturas de tela**: 6,9" (1290×2796) obrigatórias; se marcar suporte a iPad, também 13".

---

## 6. Os motivos mais comuns de recusa (e como o app já resolve)

| Motivo | Situação aqui |
|---|---|
| Não dá para excluir a conta no app | ✅ Ajustes → Excluir conta (RPC `delete_my_account`) |
| Conteúdo de usuário sem moderação | ✅ denúncia, bloqueio, filtro de texto e fila de moderação em /panipani |
| Sem política de privacidade acessível | ✅ `/privacidade` e `/termos` no próprio app e no site |
| Login social sem "Entrar com Apple" no iPhone | ⚠️ ligue `VITE_APPLE_LOGIN=true` e configure o provedor |
| Pedir permissão sem explicar | ✅ textos de permissão prontos; o push só é pedido quando o usuário toca em "Ativar avisos" |
| "App é só um site dentro de uma casca" | ✅ push nativo, câmera, GPS, vibração, som de pedido, funciona em tela cheia |
| Conta de teste não fornecida | ⚠️ crie as duas contas de demonstração antes de enviar |

---

## 7. Atualizações depois do lançamento

```bash
# 1. mude o código
npm run sync
# 2. suba a versão
#    Android: versionCode +1 e versionName em android/app/build.gradle
#    iOS: Build +1 e Version no Xcode (General)
# 3. gere o AAB / Archive de novo e envie
```

Correções só do lado web (textos, regras do banco, Edge Function) **não** precisam passar pelas lojas:
é só fazer o deploy do site e das funções.
