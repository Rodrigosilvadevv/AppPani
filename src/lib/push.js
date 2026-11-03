import { supabase } from './supabase';

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

// 'ativo' | 'pendente' | 'bloqueado' | 'ios-instalar' | 'sem-suporte'
export function pushStatus() {
  if (typeof window === 'undefined') return 'sem-suporte';
  if (ehIos() && !instalado()) return 'ios-instalar';
  if (!suportado()) return 'sem-suporte';
  if (Notification.permission === 'denied') return 'bloqueado';
  if (Notification.permission === 'granted' && localStorage.getItem(FLAG) === '1') return 'ativo';
  return 'pendente';
}

export async function ativarPush() {
  try {
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
  } catch (e) {
    console.error('[push]', e);
    throw e;
  }
}

export async function desativarPush() {
  localStorage.removeItem(FLAG);
  try {
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
