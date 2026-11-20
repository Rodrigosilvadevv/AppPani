// Topo da pani no estilo rede social: capa de fundo, foto por cima e contatos.
import { Av } from '../ui';
import { abrirLink } from '../lib/native';
import { linkInstagram, linkWhatsapp } from '../lib/util';

export const IconeInstagram = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
  </svg>
);

export const IconeWhatsapp = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
  </svg>
);

/** Capa (estilo Facebook) com a foto da pani sobreposta. Sem capa: faixa no degradê da marca. */
export function Capa({ p, altura = 'h-36', children }) {
  return (
    <div className="relative">
      {p.capa_url
        ? <img src={p.capa_url} alt="" className={`w-full ${altura} object-cover bg-stone-200`} decoding="async" />
        : <div className={`w-full ${altura} bg-gradient-to-br from-red-600 via-red-500 to-orange-400`} aria-hidden="true" />}
      <div className="absolute left-4 -bottom-9 rounded-full ring-4 ring-white bg-white">
        <Av src={p.foto_url} emoji={p.emoji} size={76} />
      </div>
      {children && <div className="absolute right-3 bottom-3 flex gap-2">{children}</div>}
    </div>
  );
}

/** Botões de Instagram e WhatsApp (só aparecem se a pani cadastrou). */
export function Redes({ p, texto, className = '' }) {
  const ig = linkInstagram(p.instagram);
  const wa = linkWhatsapp(p.whatsapp, texto || `Olá, ${p.nome}! Vi vocês no AppPani.`);
  if (!ig && !wa) return null;
  const cls = 'flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-semibold active:bg-stone-100';
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {wa && <button type="button" onClick={() => abrirLink(wa)} className={`${cls} text-green-700`}><IconeWhatsapp size={15} />WhatsApp</button>}
      {ig && <button type="button" onClick={() => abrirLink(ig)} className={`${cls} text-pink-700`}><IconeInstagram size={15} />@{p.instagram}</button>}
    </div>
  );
}
