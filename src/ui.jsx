import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Bell, Camera, Loader2, Star, X } from 'lucide-react';
import { useAuth } from './auth/AuthProvider';
import { DIAS, enviarImagem, getHorarios, statusAgora } from './lib/util';
import { ativarPush, erroPush, pushStatus } from './lib/push';
import { ehNativo, haptic } from './lib/native';

/* ---------- classes reaproveitadas ---------- */
export const inp = 'w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-stone-600 bg-white disabled:bg-stone-50 disabled:text-stone-400';
export const btn = 'bg-red-600 text-white rounded-lg px-4 py-2.5 text-sm font-semibold active:opacity-80 disabled:opacity-50 min-h-11';
export const btn2 = 'border border-stone-300 rounded-lg px-4 py-2.5 text-sm font-semibold active:bg-stone-100 disabled:opacity-50 min-h-11';
export const btn3 = 'text-sm font-semibold text-red-700 active:opacity-70 px-2 py-2 min-h-11';
export const card = 'border border-stone-200 rounded-xl p-3';

/* ---------- avisos rápidos (toast) ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const tm = useRef();
  const say = useCallback((m, tipo = 'info') => {
    setT({ m, tipo });
    clearTimeout(tm.current);
    tm.current = setTimeout(() => setT(null), 3600);
  }, []);
  useEffect(() => () => clearTimeout(tm.current), []);
  return (
    <ToastCtx.Provider value={say}>
      {children}
      {t && (
        <div role="status" aria-live="polite"
          className={`fixed inset-x-4 z-[100] max-w-md mx-auto text-white text-sm rounded-xl px-4 py-3 shadow-lg ${t.tipo === 'erro' ? 'bg-red-700' : 'bg-stone-900'}`}
          style={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)' }}>
          {t.m}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

/* ---------- confirmação (substitui window.confirm, que fica feio no app nativo) ---------- */
const ConfirmCtx = createContext(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);
export function ConfirmProvider({ children }) {
  const [d, setD] = useState(null);
  const pedir = useCallback((texto, opcoes = {}) =>
    new Promise((resolve) => setD({
      texto,
      titulo: opcoes.titulo || 'Confirmar',
      ok: opcoes.ok || 'Confirmar',
      perigo: opcoes.perigo !== false,
      resolve,
    })), []);
  const fecha = (v) => { d?.resolve(v); setD(null); };
  return (
    <ConfirmCtx.Provider value={pedir}>
      {children}
      {d && (
        <div className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-6" role="dialog" aria-modal="true" onClick={() => fecha(false)}>
          <div className="w-full max-w-sm bg-white rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold">{d.titulo}</h2>
            <p className="text-sm text-stone-600 mt-1">{d.texto}</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => fecha(false)} className={`flex-1 ${btn2}`}>Cancelar</button>
              <button onClick={() => fecha(true)} className={`flex-1 ${d.perigo ? 'bg-red-600 text-white rounded-lg px-4 py-2.5 text-sm font-semibold min-h-11' : btn}`}>{d.ok}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

/* ---------- gaveta inferior (bottom sheet) ---------- */
export function Sheet({ aberto, fechar, titulo, children }) {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e) => e.key === 'Escape' && fechar();
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [aberto, fechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={titulo} onClick={fechar}>
      <div className="w-full max-w-md bg-white rounded-t-2xl max-h-[88vh] overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="sticky top-0 bg-white flex items-center gap-2 px-4 pt-3 pb-2 border-b border-stone-100">
          <h2 className="font-bold flex-1">{titulo}</h2>
          <button onClick={fechar} aria-label="Fechar" className="p-1.5 -mr-1.5"><X size={20} /></button>
        </div>
        <div className="p-4 pt-3">{children}</div>
      </div>
    </div>
  );
}

/* ---------- seletor de 2+ opções (ex.: Unidade | Kg) ---------- */
export function Segmento({ valor, opcoes, mudar, className = '', erro = false }) {
  return (
    <div role="radiogroup" className={`flex rounded-lg border ${erro ? 'border-red-500 ring-1 ring-red-500' : 'border-stone-300'} overflow-hidden shrink-0 ${className}`}>
      {opcoes.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={valor === v} onClick={() => { haptic(); mudar(valor === v ? null : v); }}
          className={`px-2.5 text-xs font-semibold min-h-10 ${valor === v ? 'bg-stone-900 text-white' : 'bg-white text-stone-600'}`}>{l}</button>
      ))}
    </div>
  );
}

/* ---------- peças visuais ---------- */
export const Logo = ({ size = 'text-2xl' }) => <span className={`font-serif italic font-bold ${size} text-red-700`}>AppPani</span>;
export const Spinner = () => <div className="h-full w-full flex items-center justify-center py-16"><Loader2 className="animate-spin text-red-600" /></div>;
export const Vazio = ({ t, acao }) => (
  <div className="text-center px-8 py-10">
    <p className="text-sm text-stone-500">{t}</p>
    {acao && <div className="mt-3 flex justify-center">{acao}</div>}
  </div>
);
export const Av = ({ src, emoji, size = 40 }) => src
  ? <img src={src} alt="" loading="lazy" decoding="async" style={{ width: size, height: size }} className="rounded-full object-cover shrink-0 bg-stone-100" />
  : <span style={{ width: size, height: size, fontSize: size * 0.5 }} className="rounded-full bg-red-100 flex items-center justify-center shrink-0">{emoji}</span>;
export const Pic = ({ src, emoji, cls = '', alt = '' }) => src
  ? <img src={src} alt={alt} loading="lazy" decoding="async" className={`w-full object-cover bg-stone-100 ${cls}`} />
  : <div className={`w-full flex items-center justify-center bg-red-50 text-4xl ${cls}`}>{emoji}</div>;
export const Stars = ({ v, size = 12 }) => (
  <span className="inline-flex" aria-label={`${v.toFixed ? v.toFixed(1) : v} de 5`}>
    {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} aria-hidden="true" className={i <= Math.round(v) ? 'fill-red-500 text-red-500' : 'text-stone-300'} />)}
  </span>
);
export const Selo = ({ txt = 'Fresquinho' }) => <span className="bg-green-600 text-white text-[11px] font-semibold rounded-full px-2 py-0.5 shadow">{txt}</span>;
export const Chip = ({ on, children, ...p }) => (
  <button type="button" {...p} className={`rounded-full px-3 py-1.5 text-xs border whitespace-nowrap ${on ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300'} ${p.className || ''}`}>{children}</button>
);
export function Switch({ on, set, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label}
      onClick={() => { haptic(); set(!on); }}
      className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${on ? 'bg-red-600' : 'bg-stone-300'}`}>
      <span className={`block w-5 h-5 rounded-full bg-white transform transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

/* ---------- esqueleto de carregamento (parece mais rápido que um spinner) ---------- */
export const SkeletonFeed = () => (
  <div className="p-3 animate-pulse" aria-hidden="true">
    {[0, 1].map((i) => (
      <div key={i} className="mb-6">
        <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-full bg-stone-200" /><div className="h-3 w-28 bg-stone-200 rounded" /></div>
        <div className="aspect-square w-full rounded-2xl bg-stone-200" />
        <div className="h-3 w-40 bg-stone-200 rounded mt-2" />
      </div>
    ))}
  </div>
);

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
          <span>{d}{i === hoje ? ' · hoje' : ''}</span><span>{h[i].aberto ? `${h[i].ini} – ${h[i].fim}` : 'Fechado'}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- estrutura: cabeçalho em cima, menu embaixo ---------- */
export const Shell = ({ top, nav, children, scrollRef }) => (
  <div className="fixed inset-0 bg-stone-100 flex justify-center">
    <div className="relative w-full max-w-md h-full bg-white flex flex-col sm:border-x border-stone-200">
      <header className="shrink-0 min-h-12 px-4 flex items-center gap-2 border-b border-stone-200" style={{ paddingTop: 'env(safe-area-inset-top)' }}>{top}</header>
      <main ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</main>
      {nav && (
        <nav className="shrink-0 border-t border-stone-200 flex justify-around pt-2 overflow-x-auto" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>{nav}</nav>
      )}
    </div>
  </div>
);
export const NavBtn = ({ icon: I, label, on, click, badge }) => (
  <button onClick={() => { haptic(); click(); }} aria-label={label} aria-current={on ? 'page' : undefined}
    className={`relative flex flex-col items-center gap-0.5 text-[10px] min-w-12 shrink-0 ${on ? 'text-stone-900' : 'text-stone-400'}`}>
    <I size={20} strokeWidth={on ? 2.25 : 1.5} aria-hidden="true" />{label}
    {badge > 0 && <span className="absolute -top-1 right-0.5 bg-red-600 text-white text-[9px] rounded-full min-w-4 h-4 px-1 flex items-center justify-center">{badge > 99 ? '99+' : badge}</span>}
  </button>
);

/* ---------- envio de foto (redimensiona e sobe para o Storage) ---------- */
export function FotoBtn({ img, onUrl, label = 'Escolher foto', max = 1280, removivel = true }) {
  const { user } = useAuth();
  const say = useToast();
  const [busy, setBusy] = useState(false);
  const change = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !user) return;
    setBusy(true);
    try { onUrl(await enviarImagem(f, user.id, max)); haptic('sucesso'); }
    catch (err) { say(err.message?.includes('imagem') ? err.message : 'Não foi possível enviar a foto. Tente de novo.', 'erro'); }
    setBusy(false);
  };
  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-red-700 font-semibold cursor-pointer py-1">
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}{busy ? 'Enviando…' : img ? 'Trocar foto' : label}
        <input type="file" accept="image/*" className="hidden" onChange={change} disabled={busy} />
      </label>
      {img && removivel && (
        <span className="relative">
          <img src={img} alt="" className="w-11 h-11 rounded-lg object-cover" />
          <button type="button" onClick={() => onUrl(null)} aria-label="Remover foto"
            className="absolute -top-1.5 -right-1.5 bg-stone-900 text-white rounded-full p-0.5"><X size={12} /></button>
        </span>
      )}
    </div>
  );
}

/* ---------- pedido de permissão de push ---------- */
export function PushBanner() {
  const say = useToast();
  const [st, setSt] = useState(pushStatus);
  const [off, setOff] = useState(() => localStorage.getItem('apppani:push-off') === '1');
  useEffect(() => { if (pushStatus() === 'ativo') ativarPush().catch(() => {}); }, []); // renova a inscrição ao abrir
  if (off || ['ativo', 'sem-suporte', 'bloqueado'].includes(st)) return null;
  const dispensar = () => { localStorage.setItem('apppani:push-off', '1'); setOff(true); };
  const ativar = async () => {
    try { await ativarPush(); setSt('ativo'); say('Avisos de fornada ativados 🔔'); haptic('sucesso'); }
    catch (e) { setSt(pushStatus()); say(erroPush(e), 'erro'); }
  };
  return (
    <div className="m-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
      <div className="flex items-center gap-2 font-semibold text-red-700"><Bell size={16} />Receba aviso de pão quentinho</div>
      {st === 'ios-instalar' && !ehNativo()
        ? <p className="mt-1 text-stone-700">No iPhone: toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>. Abra o AppPani por lá e ative os avisos.</p>
        : <p className="mt-1 text-stone-700">Ative as notificações para saber na hora quando sair uma fornada das panis que você segue.</p>}
      <div className="flex gap-2 mt-2">
        {st === 'pendente' && <button onClick={ativar} className={btn}>Ativar avisos</button>}
        <button onClick={dispensar} className={btn2}>Agora não</button>
      </div>
    </div>
  );
}

/* ---------- linha de ajuste de notificações (reutilizada em Ajustes) ---------- */
export function LinhaPush({ textoAtivo = 'Ativas', textoInativo = 'Desativadas' }) {
  const say = useToast();
  const [ps, setPs] = useState(pushStatus);
  const alterna = async () => {
    try {
      if (ps === 'ativo') {
        const { desativarPush } = await import('./lib/push');
        await desativarPush(); setPs('pendente'); say('Avisos desativados neste aparelho');
      } else { await ativarPush(); setPs('ativo'); say('Avisos ativados 🔔'); haptic('sucesso'); }
    } catch (e) { setPs(pushStatus()); say(erroPush(e), 'erro'); }
  };
  const txt = {
    ativo: textoAtivo,
    bloqueado: 'Bloqueados nas configurações do aparelho',
    'ios-instalar': 'No iPhone, instale o app para receber avisos',
    'sem-suporte': 'Sem suporte neste aparelho',
  }[ps] || textoInativo;
  return (
    <div className={`${card} text-sm flex items-center gap-3`}>
      <Bell size={18} className="text-red-600 shrink-0" />
      <div className="flex-1"><b>Notificações neste aparelho</b><div className="text-xs text-stone-500">{txt}</div></div>
      {(ps === 'ativo' || ps === 'pendente') && <Switch on={ps === 'ativo'} set={alterna} label="Notificações neste aparelho" />}
    </div>
  );
}
