// Alerta de pedido novo na tela da pani. Funciona com o site aberto no navegador
// (computador, tablet ou celular), sem instalar nada:
//   • cartão grande no topo da tela, em qualquer aba;
//   • som que repete até alguém ver (para sozinho depois de 3 minutos);
//   • título da aba piscando ("(1) Novo pedido!") quando a aba está em segundo plano;
//   • aviso do navegador, se a pani permitir;
//   • tela ligada enquanto o delivery estiver ligado (navegadores que suportam).
import { useEffect, useRef, useState } from 'react';
import { Bell, BellRing, Bike, X } from 'lucide-react';
import { beep, destravarAudio, audioLiberado, money } from '../lib/util';
import { haptic } from '../lib/native';
import { codigo } from '../lib/pedidos';
import { btn } from '../ui';

const TOQUE_MS = 3500;
const TOQUE_MAX_MS = 3 * 60 * 1000;

const temNotificacao = () => typeof window !== 'undefined' && 'Notification' in window;
const permissao = () => (temNotificacao() ? Notification.permission : 'unsupported');

/* o navegador libera o som no primeiro toque na página */
function useAudio() {
  const [ok, setOk] = useState(audioLiberado);
  useEffect(() => {
    const liberar = () => { destravarAudio(); setTimeout(() => setOk(audioLiberado()), 50); };
    document.addEventListener('pointerdown', liberar);
    document.addEventListener('keydown', liberar);
    return () => {
      document.removeEventListener('pointerdown', liberar);
      document.removeEventListener('keydown', liberar);
    };
  }, []);
  return ok;
}

const tituloDo = (o) => (o.tipo === 'delivery' ? 'Novo pedido delivery' : `Novo pedido · mesa ${o.mesa}`);
const resumoDo = (o) => {
  const n = (o.itens || []).length;
  return [o.cliente, `${n} ${n === 1 ? 'item' : 'itens'}`, money(o.total)].filter(Boolean).join(' · ');
};

async function avisoNavegador(o, aoClicar) {
  if (permissao() !== 'granted') return;
  if (!document.hidden && document.hasFocus()) return; // já está olhando para a tela
  const titulo = `${o.tipo === 'delivery' ? '🛵' : '🔔'} ${tituloDo(o)}`;
  const opcoes = { body: resumoDo(o), tag: `pedido-${o.id}`, renotify: true, requireInteraction: true, icon: '/icon-192.png', data: { url: window.location.pathname } };
  try {
    // no Android o aviso precisa sair pelo service worker
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) { await reg.showNotification(titulo, opcoes); return; }
  } catch { /* tenta do jeito simples */ }
  try {
    const n = new Notification(titulo, opcoes);
    n.onclick = () => { window.focus(); aoClicar(); n.close(); };
  } catch { /* navegador sem suporte */ }
}

/* ---------- cartão de alerta + som + título piscando ---------- */
export function AlertaPedidos({ alertas, som, ver, dispensar, manterTela }) {
  const ultimo = alertas[0];
  const idUltimo = ultimo?.id;
  const verRef = useRef(ver);
  verRef.current = ver;

  // som repetindo e vibração a cada pedido novo
  useEffect(() => {
    if (!idUltimo) return;
    haptic('forte');
    if (!som) return;
    beep();
    const inicio = Date.now();
    const t = setInterval(() => {
      if (Date.now() - inicio > TOQUE_MAX_MS) return clearInterval(t);
      beep();
    }, TOQUE_MS);
    return () => clearInterval(t);
  }, [idUltimo, som]);

  // aviso do navegador quando a aba está escondida
  useEffect(() => {
    if (ultimo) avisoNavegador(ultimo, () => verRef.current());
  }, [idUltimo]); // eslint-disable-line react-hooks/exhaustive-deps

  // título da aba piscando
  const n = alertas.length;
  useEffect(() => {
    if (!n) return;
    const original = document.title;
    let alterna = false;
    const t = setInterval(() => {
      alterna = !alterna;
      document.title = alterna ? `(${n}) 🔔 Novo pedido!` : original;
    }, 1000);
    return () => { clearInterval(t); document.title = original; };
  }, [n]);

  // mantém a tela ligada (tablet no balcão) enquanto o delivery estiver ligado
  useEffect(() => {
    if (!manterTela || !('wakeLock' in navigator)) return;
    let trava = null;
    let vivo = true;
    const pedir = async () => {
      if (document.visibilityState !== 'visible') return;
      try { trava = await navigator.wakeLock.request('screen'); } catch { /* bateria fraca ou sem permissão */ }
      if (!vivo) trava?.release().catch(() => {});
    };
    pedir();
    document.addEventListener('visibilitychange', pedir);
    return () => { vivo = false; document.removeEventListener('visibilitychange', pedir); trava?.release().catch(() => {}); };
  }, [manterTela]);

  if (!ultimo) return null;
  const delivery = ultimo.tipo === 'delivery';
  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pointer-events-none" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <div role="alert" aria-live="assertive"
        className={`pointer-events-auto w-full max-w-md rounded-2xl shadow-2xl border-2 bg-white p-4 animate-[alertaEntra_.25s_ease-out] ${delivery ? 'border-blue-600' : 'border-red-600'}`}>
        <div className="flex items-start gap-3">
          <span className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white animate-pulse ${delivery ? 'bg-blue-600' : 'bg-red-600'}`}>
            {delivery ? <Bike size={22} /> : <BellRing size={22} />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-bold">{tituloDo(ultimo)} <span className="text-stone-400 font-normal text-sm">#{codigo(ultimo.id)}</span></div>
            <div className="text-sm text-stone-600 truncate">{resumoDo(ultimo)}</div>
            {delivery && ultimo.endereco && <div className="text-xs text-stone-500 truncate mt-0.5">{ultimo.endereco}</div>}
            {n > 1 && <div className="text-xs font-semibold text-red-700 mt-1">+ {n - 1} {n - 1 === 1 ? 'outro pedido novo' : 'outros pedidos novos'}</div>}
          </div>
          <button onClick={dispensar} aria-label="Fechar alerta" className="p-1 -mr-1 text-stone-400"><X size={18} /></button>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={ver} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white ${delivery ? 'bg-blue-700' : 'bg-red-600'}`}>Ver {n > 1 ? 'pedidos' : 'pedido'}</button>
          <button onClick={dispensar} className="rounded-lg px-4 py-2.5 text-sm font-semibold border border-stone-300">Ok, vi</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- faixa para ligar os alertas desta tela ---------- */
export function AtivarAlertas({ som }) {
  const audioOk = useAudio();
  const [perm, setPerm] = useState(permissao);
  const precisaSom = som && !audioOk;
  const precisaAviso = perm === 'default';
  if (!precisaSom && !precisaAviso) return null;

  const ativar = async () => {
    destravarAudio();
    if (som) beep(); // toque de teste
    if (precisaAviso) {
      try { setPerm(await Notification.requestPermission()); } catch { setPerm(permissao()); }
    }
  };

  return (
    <div className="mx-3 mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 flex items-center gap-3 text-sm">
      <Bell size={18} className="text-amber-700 shrink-0" />
      <div className="flex-1 min-w-0">
        <b className="block">Ative os alertas desta tela</b>
        <span className="text-xs text-stone-600">
          {precisaAviso ? 'Som e aviso de pedido novo, mesmo com outra aba aberta. Não precisa instalar nada.' : 'Toque para liberar o som de pedido novo neste navegador.'}
        </span>
      </div>
      <button onClick={ativar} className={`${btn} shrink-0`}>Ativar</button>
    </div>
  );
}
