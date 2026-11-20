import { supabase } from './supabase';
import { ehNativo, plataforma } from './native';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const FLAG = 'apppani:push';

const ehIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalado = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const suportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const chaveParaBytes = (b64url) => {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const mesmaChave = (sub, bytes) => {
  const atual = sub.options?.applicationServerKey;
  if (!atual) return true;
  const a = new Uint8Array(atual);
  return a.length === bytes.length && a.every((v, i) => v === bytes[i]);
};

// registra (idempotente) e espera o SW ficar pronto — sem travar para sempre
async function registroSw() {
  await navigator.serviceWorker.register('/sw.js');
  const limite = new Promise((_, rej) => setTimeout(() => rej(new Error('sw-nao-pronto')), 10000));
  return Promise.race([navigator.serviceWorker.ready, limite]);
}

/* =======================================================================
 * NATIVO (iOS/Android pelas lojas) — APNs/FCM via @capacitor/push-notifications
 * O token é salvo na mesma tabela push_subscriptions, usando:
 *   endpoint = "native:ios:<token>"  ·  p256dh = plataforma  ·  auth = 'native'
 * Assim a sua Edge Function continua lendo uma tabela só. Veja supabase/migrations.
 * ======================================================================= */
let nativoPronto = false;

async function pushNativo() {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  return PushNotifications;
}

async function salvarTokenNativo(token) {
  const { error } = await supabase.rpc('salvar_push', {
    p_endpoint: `native:${plataforma()}:${token}`,
    p_p256dh: plataforma(),
    p_auth: 'native',
  });
  if (error) throw error;
  localStorage.setItem(FLAG, '1');
}

// Android 8+: o canal precisa existir para o aviso tocar som e aparecer no topo
async function canalAndroid(PN) {
  if (plataforma() !== 'android') return;
  try {
    await PN.createChannel({ id: 'fornadas', name: 'Avisos do AppPani', description: 'Fornadas, pedidos e entregas', importance: 5, visibility: 1, sound: 'default', vibration: true });
  } catch { /* já existe ou sem suporte */ }
}

async function ativarNativo() {
  const PN = await pushNativo();
  await canalAndroid(PN);
  let perm = await PN.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PN.requestPermissions();
  if (perm.receive !== 'granted') throw new Error('bloqueado');

  const token = await new Promise((ok, falha) => {
    const limite = setTimeout(() => falha(new Error('sem-token')), 15000);
    let a, b;
    PN.addListener('registration', (t) => { clearTimeout(limite); a?.remove(); b?.remove(); ok(t.value); }).then((h) => { a = h; });
    PN.addListener('registrationError', (e) => { clearTimeout(limite); a?.remove(); b?.remove(); falha(new Error(e?.error || 'sem-token')); }).then((h) => { b = h; });
    PN.register();
  });
  await salvarTokenNativo(token);
  return token;
}

/** Liga os avisos de toque/recebimento no app nativo. Chame uma vez ao abrir. */
export async function ouvirPushNativo(aoAbrir) {
  if (!ehNativo() || nativoPronto) return;
  nativoPronto = true;
  try {
    const PN = await pushNativo();
    await canalAndroid(PN);
    await PN.addListener('pushNotificationActionPerformed', (ev) => {
      const url = ev?.notification?.data?.url;
      if (url) aoAbrir?.(url);
    });
    // mantém o token em dia (ele pode ser trocado pelo sistema)
    await PN.addListener('registration', (t) => { salvarTokenNativo(t.value).catch(() => {}); });
    const p = await PN.checkPermissions();
    if (p.receive === 'granted') await PN.register();
  } catch { /* ignora */ }
}

/* ======================= estado + ligar/desligar ======================= */

// 'ativo' | 'pendente' | 'bloqueado' | 'ios-instalar' | 'sem-suporte'
export function pushStatus() {
  if (typeof window === 'undefined') return 'sem-suporte';
  if (ehNativo()) return localStorage.getItem(FLAG) === '1' ? 'ativo' : 'pendente';
  if (ehIos() && !instalado()) return 'ios-instalar';
  if (!suportado()) return 'sem-suporte';
  if (Notification.permission === 'denied') return 'bloqueado';
  if (Notification.permission === 'granted' && localStorage.getItem(FLAG) === '1') return 'ativo';
  return 'pendente';
}

export async function ativarPush() {
  try {
    if (ehNativo()) return await ativarNativo();

    if (ehIos() && !instalado()) throw new Error('ios-instalar');
    if (!suportado()) throw new Error('sem-suporte');
    if (!VAPID) throw new Error('sem-chave-vapid'); // VITE_VAPID_PUBLIC_KEY não entrou no build
    if (Notification.permission === 'denied') throw new Error('bloqueado');
    if (Notification.permission !== 'granted') {
      const r = await Notification.requestPermission();
      if (r !== 'granted') throw new Error('bloqueado');
    }

    const reg = await registroSw();
    const bytes = chaveParaBytes(VAPID);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !mesmaChave(sub, bytes)) { await sub.unsubscribe(); sub = null; } // chave VAPID mudou
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });

    const j = sub.toJSON();
    const { error } = await supabase.rpc('salvar_push', {
      p_endpoint: j.endpoint,
      p_p256dh: j.keys.p256dh,
      p_auth: j.keys.auth,
    });
    if (error) throw error;
    localStorage.setItem(FLAG, '1');
    return j.endpoint;
  } catch (e) {
    console.error('[push]', e);
    throw e;
  }
}

export async function desativarPush() {
  localStorage.removeItem(FLAG);
  try {
    if (ehNativo()) {
      const PN = await pushNativo();
      // primeiro tira do servidor (o rpc não lança erro: devolve { error })
      await supabase.rpc('remover_push_do_aparelho', { p_prefixo: `native:${plataforma()}:` });
      await PN.unregister();
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  } catch (e) {
    console.error('[push]', e);
  }
}

/** Mensagem pronta para mostrar ao usuário a partir do erro do ativarPush(). */
export const erroPush = (e) => ({
  'ios-instalar': 'No iPhone, adicione o app à Tela de Início (ou baixe na App Store) para receber avisos.',
  bloqueado: 'Permissão negada. Libere as notificações nas configurações do aparelho.',
  'sem-suporte': 'Este aparelho não suporta notificações.',
  'sem-chave-vapid': 'Faltou configurar a chave de notificações (VITE_VAPID_PUBLIC_KEY).',
  'sem-token': 'O aparelho não devolveu o código de notificação. Tente de novo.',
}[e?.message] || 'Não foi possível alterar os avisos neste aparelho.');
