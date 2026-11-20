// Acompanhamento ao vivo de um pedido (mesa ou delivery).
// Usado na rota /pedido/:id e dentro da aba Delivery do cliente.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Bike, Check, ChefHat, CircleX, Clock, MapPin, PackageCheck, Receipt } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { Spinner, btn2, card, useConfirm, useToast } from '../ui';
import { PAGAMENTOS, PASSOS, STATUS, codigo } from '../lib/pedidos';
import { linhaTotal, linkWhatsapp, money, precoFmt, qtdFmt, tempo } from '../lib/util';
import { abrirLink, haptic } from '../lib/native';
import { ativarPush, erroPush, pushStatus } from '../lib/push';
import { useRevalidar } from '../lib/hooks';
import { IconeWhatsapp } from './perfil';

const ROTULO = { novo: 'Pedido recebido', preparando: 'Em preparo', pronto: 'Pronto', saiu: 'Saiu para entrega', entregue: 'Entregue' };
const FINAIS = ['entregue', 'cancelado'];
export const ehUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

function Icone({ status, tipo }) {
  const cls = 'w-16 h-16 rounded-full flex items-center justify-center';
  if (status === 'cancelado') return <span className={`${cls} bg-stone-100 text-stone-500`}><CircleX size={34} /></span>;
  if (status === 'entregue') return <span className={`${cls} bg-green-100 text-green-700`}><PackageCheck size={34} /></span>;
  if (status === 'saiu') return <span className={`${cls} bg-blue-100 text-blue-700 animate-pulse`}><Bike size={34} /></span>;
  if (status === 'pronto') return <span className={`${cls} bg-green-100 text-green-700`}><Check size={34} /></span>;
  if (status === 'preparando') return <span className={`${cls} bg-orange-100 text-orange-700`}><ChefHat size={34} /></span>;
  return <span className={`${cls} bg-red-100 text-red-700`}>{tipo === 'delivery' ? <Receipt size={32} /> : <ChefHat size={34} />}</span>;
}

export function AcompanharPedido({ id, rodape }) {
  const { user } = useAuth();
  const say = useToast();
  const confirmar = useConfirm();
  const [o, setO] = useState(undefined);
  const [ps, setPs] = useState(pushStatus);
  const [cancelando, setCancelando] = useState(false);
  const anterior = useRef(null);

  const carregar = useCallback(async () => {
    if (!ehUuid(id)) return setO(null);
    const { data, error } = await supabase.rpc('acompanhar_pedido', { p_id: id });
    if (error) return; // sem rede: mantém o que já está na tela
    setO(data ?? null);
    if (data && anterior.current && anterior.current !== data.status) haptic('sucesso');
    anterior.current = data?.status ?? null;
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);
  useRevalidar(carregar, 5000);

  // tempo real para quem está logado + conferência a cada 10 s (funciona até sem login)
  const final = o && FINAIS.includes(o.status);
  useEffect(() => {
    if (!ehUuid(id) || final) return;
    const t = setInterval(carregar, 10000);
    let ch;
    if (user) {
      ch = supabase.channel(`acompanhar-${id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `id=eq.${id}` }, () => carregar())
        .subscribe();
    }
    return () => { clearInterval(t); if (ch) supabase.removeChannel(ch); };
  }, [id, user, final, carregar]);

  if (o === undefined) return <Spinner />;
  if (o === null) {
    return <p className="text-center text-sm text-stone-500 px-8 py-16">Pedido não encontrado. Confira o link ou fale com a panificadora.</p>;
  }

  const tipo = o.tipo || 'mesa';
  const passos = PASSOS[tipo];
  const atual = passos.indexOf(o.status);
  const wa = linkWhatsapp(o.pani?.whatsapp, `Olá! Sobre o meu pedido #${codigo(o.id)} no AppPani.`);

  const cancelar = async () => {
    if (!(await confirmar('A panificadora ainda não começou a preparar. Quer mesmo cancelar?', { titulo: 'Cancelar pedido?', ok: 'Cancelar pedido' }))) return;
    setCancelando(true);
    const { error } = await supabase.rpc('cancelar_meu_pedido', { p_id: o.id });
    setCancelando(false);
    if (error) return say(error.code === 'P0001' ? error.message : 'Não foi possível cancelar agora.', 'erro');
    say('Pedido cancelado'); carregar();
  };
  const ligarAvisos = async () => {
    try { await ativarPush(); setPs('ativo'); say('Pronto! Você recebe aviso a cada passo do pedido 🔔'); }
    catch (e) { setPs(pushStatus()); say(erroPush(e), 'erro'); }
  };

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <div className="flex flex-col items-center text-center gap-2">
        <Icone status={o.status} tipo={tipo} />
        <h1 className="font-bold text-lg leading-tight">{o.status === 'pronto' && tipo === 'mesa' ? 'Pronto! Já vai para a mesa' : STATUS[o.status]?.cliente || 'Pedido enviado'}</h1>
        <p className="text-sm text-stone-600">
          {o.pani?.nome}{tipo === 'mesa' ? ` · Mesa ${o.mesa}` : ` · Pedido #${codigo(o.id)}`}
        </p>
        {tipo === 'delivery' && !FINAIS.includes(o.status) && o.pani?.tempo_entrega && (
          <p className="text-xs text-stone-500 flex items-center gap-1"><Clock size={12} />Previsão de entrega: {o.pani.tempo_entrega}</p>
        )}
      </div>

      {o.status === 'cancelado' ? (
        <div className="rounded-xl bg-stone-100 p-3 text-sm text-stone-600 text-center">Este pedido foi cancelado. Se tiver dúvida, fale com a panificadora.</div>
      ) : (
        <ol className={`${card} flex flex-col gap-0`}>
          {passos.map((s, i) => {
            const feito = i <= atual;
            const agora = i === atual && !FINAIS.includes(o.status);
            return (
              <li key={s} className="flex items-start gap-3">
                <span className="flex flex-col items-center">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${feito ? 'bg-red-600 text-white' : 'bg-stone-200 text-stone-500'} ${agora ? 'ring-4 ring-red-100' : ''}`}>
                    {feito && !agora ? <Check size={14} /> : i + 1}
                  </span>
                  {i < passos.length - 1 && <span className={`w-0.5 h-6 ${i < atual ? 'bg-red-600' : 'bg-stone-200'}`} />}
                </span>
                <span className={`text-sm pt-0.5 ${feito ? 'font-semibold' : 'text-stone-400'}`}>
                  {ROTULO[s]}{agora && <span className="text-xs font-normal text-stone-500"> · {tempo(o.updated_at || o.created_at)}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {o.meu && ['ativo', 'sem-suporte', 'bloqueado'].indexOf(ps) === -1 && !FINAIS.includes(o.status) && (
        <button onClick={ligarAvisos} className={`${btn2} flex items-center justify-center gap-2`}><Bell size={16} />Avisar no celular a cada passo</button>
      )}

      <div className={`${card} text-sm`}>
        <b className="block mb-1">Seu pedido</b>
        {(o.itens || []).map((l, k) => (
          <div key={k} className="flex justify-between gap-2 py-0.5">
            <span><b>{qtdFmt(l)}</b> {l.nome}{l.unidade === 'kg' && <span className="text-xs text-stone-400"> ({precoFmt(l.preco, 'kg')})</span>}</span>
            <span className="shrink-0">{money(linhaTotal(l))}</span>
          </div>
        ))}
        {tipo === 'delivery' && (
          <>
            <div className="flex justify-between text-stone-500 border-t border-stone-100 mt-2 pt-2"><span>Produtos</span><span>{money(o.subtotal)}</span></div>
            <div className="flex justify-between text-stone-500"><span>Entrega</span><span>{Number(o.taxa_entrega) > 0 ? money(o.taxa_entrega) : 'Grátis'}</span></div>
          </>
        )}
        <div className="flex justify-between font-bold border-t border-stone-200 mt-2 pt-2"><span>Total</span><span>{money(o.total)}</span></div>
        {tipo === 'delivery' && (
          <p className="text-xs text-stone-500 mt-2">
            Pagamento na entrega: <b>{PAGAMENTOS[o.pagamento] || '—'}</b>{o.pagamento === 'dinheiro' && o.troco ? ` · troco para ${money(o.troco)}` : ''}
          </p>
        )}
        {o.endereco && <p className="text-xs text-stone-500 mt-1 flex items-start gap-1"><MapPin size={12} className="shrink-0 mt-0.5" />{o.endereco}</p>}
        {o.obs && <p className="text-xs text-stone-500 mt-1">Obs.: {o.obs}</p>}
      </div>

      <div className="flex gap-2">
        {wa && <button onClick={() => abrirLink(wa)} className={`flex-1 ${btn2} flex items-center justify-center gap-2 text-green-700`}><IconeWhatsapp size={16} />Falar com a pani</button>}
        {o.meu && o.status === 'novo' && (
          <button onClick={cancelar} disabled={cancelando} className={`flex-1 ${btn2} text-red-700`}>{cancelando ? 'Cancelando…' : 'Cancelar pedido'}</button>
        )}
      </div>

      {!FINAIS.includes(o.status) && <p className="text-xs text-stone-400 text-center">Esta tela atualiza sozinha.</p>}
      {rodape}
    </div>
  );
}
