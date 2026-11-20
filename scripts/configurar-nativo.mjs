#!/usr/bin/env node
/**
 * Confere e ajusta o que os projetos nativos precisam para ir às lojas.
 * Rode depois de `npx cap add android` / `npx cap add ios`:
 *
 *    npm run nativo:config
 *
 * O script só ACRESCENTA o que falta (e guarda um .bak antes de mexer).
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = process.cwd();
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const aviso = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const erro = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const titulo = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

const ler = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const gravar = (p, txt) => { copyFileSync(p, `${p}.bak`); writeFileSync(p, txt); };

/* ---------------- .env ---------------- */
titulo('1. Variáveis de ambiente');
const env = ler(resolve(raiz, '.env'));
const precisa = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_APP_URL', 'VITE_VAPID_PUBLIC_KEY'];
if (!env) erro('.env não existe. Copie o .env.example para .env e preencha.');
else precisa.forEach((k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'));
  if (!m || !m[1].trim()) aviso(`${k} está vazio`);
  else ok(`${k} preenchido`);
});

const appUrl = (env?.match(/^VITE_APP_URL=(.*)$/m)?.[1] || '').trim().replace(/\/$/, '');
const dominio = appUrl.replace(/^https?:\/\//, '');

/* ---------------- capacitor ---------------- */
titulo('2. Capacitor');
const cfg = JSON.parse(ler(resolve(raiz, 'capacitor.config.json')) || '{}');
ok(`appId: ${cfg.appId}`);
ok(`appName: ${cfg.appName}`);
if (!existsSync(resolve(raiz, 'dist'))) aviso('a pasta dist/ ainda não existe — rode `npm run build`');

/* ---------------- ícones ---------------- */
titulo('3. Ícones e splash');
['assets/icon.png', 'assets/splash.png'].forEach((f) => (existsSync(resolve(raiz, f)) ? ok(f) : erro(`${f} não encontrado`)));
console.log('     gere os tamanhos nativos com: npm run icones');

/* ---------------- Android ---------------- */
titulo('4. Android');
const andDir = resolve(raiz, 'android');
if (!existsSync(andDir)) {
  aviso('projeto Android ainda não existe. Rode: npx cap add android');
} else {
  const gs = resolve(andDir, 'app/google-services.json');
  existsSync(gs) ? ok('google-services.json presente (push via Firebase)')
    : erro('falta android/app/google-services.json — baixe no console do Firebase');

  const manPath = resolve(andDir, 'app/src/main/AndroidManifest.xml');
  const man = ler(manPath);
  if (!man) erro('AndroidManifest.xml não encontrado');
  else if (man.includes('android.intent.action.VIEW') && man.includes(dominio)) {
    ok('deep link (App Links) já configurado');
  } else if (dominio) {
    const filtro = `
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="${dominio}" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${cfg.appId}" />
            </intent-filter>
`;
    const marca = '</activity>';
    if (man.includes(marca)) {
      gravar(manPath, man.replace(marca, `${filtro}        ${marca}`));
      ok(`deep link adicionado para ${dominio} (backup em AndroidManifest.xml.bak)`);
    } else aviso('não consegui achar onde inserir o deep link; faça manualmente');
  }

  const strings = resolve(andDir, 'app/src/main/res/values/strings.xml');
  const s = ler(strings);
  if (s && !s.includes('<string name="app_name">AppPani</string>')) {
    aviso('confira o nome do app em android/app/src/main/res/values/strings.xml');
  }
}

/* ---------------- iOS ---------------- */
titulo('5. iOS');
const iosDir = resolve(raiz, 'ios');
if (!existsSync(iosDir)) {
  aviso('projeto iOS ainda não existe. Rode: npx cap add ios  (precisa de um Mac)');
} else {
  const gi = resolve(iosDir, 'App/App/GoogleService-Info.plist');
  existsSync(gi) ? ok('GoogleService-Info.plist presente (push via Firebase/APNs)')
    : erro('falta ios/App/App/GoogleService-Info.plist — baixe no console do Firebase');

  const plistPath = resolve(iosDir, 'App/App/Info.plist');
  const plist = ler(plistPath);
  const textos = {
    NSCameraUsageDescription: 'O AppPani usa a câmera para você fotografar fornadas e produtos.',
    NSPhotoLibraryUsageDescription: 'O AppPani acessa suas fotos para você escolher a imagem da fornada.',
    NSPhotoLibraryAddUsageDescription: 'O AppPani salva o QR code do cardápio nas suas fotos.',
    NSLocationWhenInUseUsageDescription: 'Usamos sua localização para mostrar as panificadoras mais perto de você.',
  };
  if (!plist) erro('Info.plist não encontrado');
  else {
    const faltando = Object.keys(textos).filter((k) => !plist.includes(k));
    if (!faltando.length) ok('textos de permissão (Info.plist) completos');
    else {
      const bloco = faltando.map((k) => `\t<key>${k}</key>\n\t<string>${textos[k]}</string>`).join('\n');
      gravar(plistPath, plist.replace(/<\/dict>\s*<\/plist>\s*$/, `${bloco}\n</dict>\n</plist>\n`));
      ok(`adicionados ao Info.plist: ${faltando.join(', ')} (backup em Info.plist.bak)`);
    }
  }
  console.log('     No Xcode, em Signing & Capabilities, adicione: Push Notifications e Background Modes → Remote notifications.');
  if (dominio) console.log(`     Para abrir links do site dentro do app: Associated Domains → applinks:${dominio}`);
}

/* ---------------- checklist ---------------- */
titulo('6. Antes de enviar para as lojas');
[
  'Política de privacidade publicada em ' + (appUrl ? `${appUrl}/privacidade` : '/privacidade'),
  'Termos de uso publicados em ' + (appUrl ? `${appUrl}/termos` : '/termos'),
  'Exclusão de conta funcionando dentro do app (Ajustes → Excluir conta)',
  'Login social testado no aparelho de verdade',
  'Conteúdo de usuário: denúncia, bloqueio e moderação testados',
  'Capturas de tela nos tamanhos pedidos por Apple e Google',
].forEach((t) => console.log(`  □ ${t}`));
console.log('\n  Detalhes passo a passo: docs/LOJAS.md\n');
