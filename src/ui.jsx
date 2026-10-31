import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Bell, Camera, Loader2, Star } from 'lucide-react';
import { useAuth } from './auth/AuthProvider';
import { DIAS, enviarImagem, getHorarios, statusAgora } from './lib/util';
import { ativarPush, pushStatus } from './lib/push';
import { useEffect } from 'react';

export const inp = 'w-full border border-stone-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-600 bg-white';
export const btn = 'bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold active:opacity-80 disabled:opacity-50';
export const btn2 = 'border border-stone-300 rounded-lg px-4 py-2 text-sm font-semibold active:bg-stone-100 disabled:opacity-50';

/* ---------- avisos rápidos (toast) ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const tm = useRef();
  const say = useCallback((m) => { setT(m); clearTimeout(tm.current); tm.current = setTimeout(() => setT(null), 3200); }, []);
  return (
    <ToastCtx.Provider value={say}>
      {children}
      {t && <div role="status" className="fixed top-3 inset-x-4 z-[100] max-w-md mx-auto bg-stone-900 text-white text-sm rounded-xl px-4 py-3 shadow-lg">{t}</div>}
    </ToastCtx.Provider>
  );
}

/* ---------- peças visuais ---------- */
export const Logo = () => <span className="font-serif italic font-bold text-2xl text-red-700">AppPani</span>;
export const Spinner = () => <div className="h-full w-full flex items-center justify-center py-16"><Loader2 className="animate-spin text-red-600" /></div>;
export const Vazio = ({ t }) => <p className="text-center text-sm text-stone-500 px-8 py-10">{t}</p>;
export const Av = ({ src, emoji, size = 40 }) => src
  ? <img src={src} alt="" loading="lazy" style={{ width: size, height: size }} className="rounded-full object-cover shrink-0" />
  : <span style={{ width: size, height: size, fontSize: size * 0.5 }} className="rounded-full bg-red-100 flex items-center justify-center shrink-0">{emoji}</span>;
export const Pic = ({ src, emoji, cls = '' }) => src
  ? <img src={src} alt="" loading="lazy" className={`w-full object-cover ${cls}`} />
  : <div className={`w-full flex items-center justify-center bg-red-50 text-4xl ${cls}`}>{emoji}</div>;
export const Stars = ({ v, size = 12 }) => (
  <span className="inline-flex" aria-label={`${v} de 5`}>
    {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} className={i <= Math.round(v) ? 'fill-red-500 text-red-500' : 'text-stone-300'} />)}
  </span>
);
export const Selo = ({ txt = 'Fresquinho' }) => <span className="bg-green-600 text-white text-[11px] font-semibold rounded-full px-2 py-0.5 shadow">{txt}</span>;

export const StatusBadge = ({ p }) => {
  const s = statusAgora(p);
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold ${s.aberto ? 'text-green-700' : 'text-red-700'}`}>
    <span className={`w-2 h-2 rounded-full ${s.aberto ? 'bg-green-600' : 'bg-red-600'}`} />{s.txt}
  </span>;
};

export function HorariosView({ p }) {
  const h = getHorarios(p);
  const hoje = new Date().getDay();
  return (
    <div className="text-sm divide-y divide-stone-100">
      {DIAS.map((d, i) => (
        <div key={i} className={`flex justify-between py-1.5 ${i === hoje ? 'font-semibold' : 'text-stone-600'}`}>
          <span>{d}</span><span>{h[i].aberto ? `${h[i].ini} – ${h[i].fim}` : 'Fechado'}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- estrutura: cabeçalho em cima, menu embaixo ---------- */
export const Shell = ({ top, nav, children }) => (
  <div className="fixed inset-0 bg-stone-100 flex justify-center">
    <div className="relative w-full max-w-md h-full bg-white flex flex-col sm:border-x border-stone-200">
      <header className="shrink-0 min-h-12 px-4 flex items-center gap-2 border-b border-stone-200" style={{ paddingTop: 'env(safe-area-inset-top)' }}>{top}</header>
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</main>
      <nav className="shrink-0 border-t border-stone-200 flex justify-around pt-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>{nav}</nav>
    </div>
  </div>
);
export const NavBtn = ({ icon: I, label, on, click, badge }) => (
  <button onClick={click} aria-label={label} className={`relative flex flex-col items-center gap-0.5 text-[10px] w-12 ${on ? 'text-stone-900' : 'text-stone-400'}`}>
    <I size={20} strokeWidth={on ? 2.25 : 1.5} />{label}
    {badge > 0 && <span className="absolute -top-1 right-1 bg-red-600 text-white text-[9px] rounded-full min-w-4 h-4 px-1 flex items-center justify-center">{badge}</span>}
  </button>
);

/* ---------- envio de foto (já redimensiona e sobe para o Storage) ---------- */
export function FotoBtn({ img, onUrl, label = 'Escolher foto' }) {
  const { user } = useAuth();
  const say = useToast();
  const [busy, setBusy] = useState(false);
  const change = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    try { onUrl(await enviarImagem(f, user.id)); } catch { say('Não foi possível enviar a foto. Tente de novo.'); }
    setBusy(false);
  };
  return (
    <label className="flex items-center gap-2 text-sm text-red-700 font-semibold cursor-pointer">
      {busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}{img ? 'Trocar foto' : label}
      <input type="file" accept="image/*" className="hidden" onChange={change} disabled={busy} />
      {img && <img src={img} alt="" className="w-10 h-10 rounded object-cover" />}
    </label>
  );
}

/* ---------- pedido de permissão de push (iPhone e Android) ---------- */
export function PushBanner() {
  const say = useToast();
  const [st, setSt] = useState(pushStatus);
  const [off, setOff] = useState(() => localStorage.getItem('apppani:push-off') === '1');
  useEffect(() => { if (pushStatus() === 'ativo') ativarPush().catch(() => {}); }, []); // renova a inscrição ao abrir
  if (off || ['ativo', 'sem-suporte', 'bloqueado'].includes(st)) return null;
  const dispensar = () => { localStorage.setItem('apppani:push-off', '1'); setOff(true); };
  const ativar = async () => {
    try { await ativarPush(); setSt('ativo'); say('Avisos de fornada ativados 🔔'); }
    catch (e) { setSt(pushStatus()); say(e.message === 'bloqueado' ? 'Permissão negada. Libere nas configurações do navegador.' : 'Não foi possível ativar os avisos.'); }
  };
  return (
    <div className="m-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
      <div className="flex items-center gap-2 font-semibold text-red-700"><Bell size={16} />Receba aviso de pão quentinho</div>
      {st === 'ios-instalar'
        ? <p className="mt-1 text-stone-700">No iPhone: toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>. Abra o AppPani por lá e ative os avisos.</p>
        : <p className="mt-1 text-stone-700">Ative as notificações para saber na hora quando sair uma fornada das panis que você segue.</p>}
      <div className="flex gap-2 mt-2">
        {st === 'pendente' && <button onClick={ativar} className={btn}>Ativar avisos</button>}
        <button onClick={dispensar} className={btn2}>Agora não</button>
      </div>
    </div>
  );
}
