import { supabase } from './supabase';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY;

const b64 = (s) => {
  const raw = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** 'ativo' | 'pendente' | 'bloqueado' | 'ios-instalar' | 'sem-suporte' */
export function pushStatus() {
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!ok) return isIOS() && !isStandalone() ? 'ios-instalar' : 'sem-suporte'; // iPhone só libera push com o app na Tela de Início
  if (Notification.permission === 'denied') return 'bloqueado';
  return Notification.permission === 'granted' ? 'ativo' : 'pendente';
}

/** Chame SEMPRE a partir de um toque do usuário (exigência do iOS). */
export async function ativarPush() {
  const st = pushStatus();
  if (st !== 'pendente' && st !== 'ativo') throw new Error(st);
  if (!VAPID) throw new Error('VITE_VAPID_PUBLIC_KEY ausente no .env');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('bloqueado');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID) }));
  const j = sub.toJSON();
  const { error } = await supabase.rpc('registrar_push', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
  if (error) throw error;
}

export async function desativarPush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}
