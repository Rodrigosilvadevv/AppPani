import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Minus, Plus, MapPin, ShoppingBag, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Av, HorariosView, Logo, Spinner, StatusBadge, btn, btn2, inp } from '../ui';
import { money, statusAgora } from '../lib/util';

// Página pública do cardápio: /c/:slug  (não precisa de login)
// - Chapa e bebidas: o cliente na mesa monta o pedido e envia
// - Balcão: somente visualização (sem botão de pedido)
const SECOES = [
  ['chapa', 'Na chapa', true],
  ['bebida', 'Bebidas', true],
  ['balcao', 'No balcão (somente ver)', false],
];

function Item({ it, qtd, mudar, pedido }) {
  return (
    <div className="flex gap-3 py-3 border-b border-stone-100">
      {it.img_url
        ? <img src={it.img_url} alt={it.nome} loading="lazy" className="w-24 h-24 rounded-xl object-cover shrink-0" />
        : <div className="w-24 h-24 rounded-xl bg-red-50 flex items-center justify-center text-3xl shrink-0">{it.tipo === 'bebida' ? '🥤' : it.tipo === 'chapa' ? '🍔' : '🥖'}</div>}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="font-semibold text-sm">{it.nome}</div>
        {it.descricao && <div className="text-xs text-stone-500 mt-0.5 line-clamp-3">{it.descricao}</div>}
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-sm font-semibold">{money(it.preco)}</span>
          {pedido && (qtd > 0
            ? <span className="flex items-center gap-3 border border-stone-300 rounded-full px-2 py-1">
                <button onClick={() => mudar(it, -1)} aria-label="Menos"><Minus size={16} /></button>
                <b className="text-sm w-4 text-center">{qtd}</b>
                <button onClick={() => mudar(it, 1)} aria-label="Mais"><Plus size={16} /></button>
              </span>
            : <button onClick={() => mudar(it, 1)} className="bg-red-600 text-white rounded-full px-3 py-1 text-xs font-semibold flex items-center gap-1"><Plus size={14} />Adicionar</button>)}
        </div>
      </div>
    </div>
  );
}

export default function Cardapio() {
  const { slug } = useParams();
  const [p, setP] = useState(undefined);
  const [itens, setItens] = useState([]);
  const [cart, setCart] = useState({});
  const [abrir, setAbrir] = useState(false);
  const [f, setF] = useState({ mesa: '', cliente: '', obs: '' });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('panis').select('*').eq('slug', slug).maybeSingle();
      setP(data);
      if (data) {
        const r = await supabase.from('cardapio_itens').select('*').eq('pani_id', data.id).eq('ativo', true).order('created_at');
        setItens(r.data || []);
      }
    })();
  }, [slug]);

  const mudar = (it, d) => setCart((c) => {
    const q = Math.max(0, (c[it.id] || 0) + d);
    const n = { ...c };
    q ? (n[it.id] = q) : delete n[it.id];
    return n;
  });
  const linhas = useMemo(() => itens.filter((i) => cart[i.id]).map((i) => ({ id: i.id, nome: i.nome, preco: Number(i.preco) || 0, qtd: cart[i.id] })), [itens, cart]);
  const total = linhas.reduce((a, l) => a + l.preco * l.qtd, 0);
  const qtdTotal = linhas.reduce((a, l) => a + l.qtd, 0);

  if (p === undefined) return <Spinner />;
  if (p === null) return <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-8 text-center"><Logo /><p className="text-sm text-stone-600">Cardápio não encontrado.</p></div>;

  const aberto = statusAgora(p).aberto;

  const enviar = async () => {
    if (!f.mesa.trim()) return setErro('Informe o número da mesa.');
    setBusy(true); setErro('');
    const { error } = await supabase.from('pedidos').insert({
      pani_id: p.id, mesa: f.mesa.trim(), cliente: f.cliente.trim(), obs: f.obs.trim(), itens: linhas, total,
    });
    setBusy(false);
    if (error) return setErro('Não foi possível enviar o pedido. Chame o atendente.');
    setFeito(f.mesa.trim()); setCart({}); setAbrir(false);
  };

  if (feito) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-8 text-center">
        <CheckCircle2 size={56} className="text-green-600" />
        <h1 className="font-bold text-lg">Pedido enviado!</h1>
        <p className="text-sm text-stone-600">A chapa já recebeu o pedido da mesa {feito}. Em breve sai.</p>
        <button onClick={() => setFeito(null)} className={btn}>Fazer outro pedido</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 flex justify-center">
      <div className="w-full max-w-md bg-white min-h-screen pb-28">
        <div className="p-4 flex gap-4 items-center">
          <Av src={p.foto_url} emoji={p.emoji} size={72} />
          <div className="text-sm flex-1">
            <h1 className="font-bold text-lg leading-tight">{p.nome}</h1>
            <StatusBadge p={p} />
            {p.endereco && <div className="text-xs text-stone-500 mt-1 flex items-center gap-1"><MapPin size={12} />{p.endereco}</div>}
          </div>
        </div>
        <details className="mx-4 mb-2 border border-stone-200 rounded-xl px-3 py-2">
          <summary className="text-sm font-semibold cursor-pointer">Horário de funcionamento</summary>
          <div className="mt-2"><HorariosView p={p} /></div>
        </details>
        {!aberto && <p className="mx-4 my-2 text-xs bg-red-50 text-red-700 rounded-lg px-3 py-2">Estamos fechados agora. Os pedidos pela mesa ficam disponíveis durante o horário de funcionamento.</p>}

        {SECOES.map(([tipo, titulo, pedido]) => {
          const L = itens.filter((i) => i.tipo === tipo);
          if (!L.length) return null;
          return (
            <section key={tipo} className="px-4 mt-4">
              <h2 className="font-bold">{titulo}</h2>
              {L.map((it) => <Item key={it.id} it={it} qtd={cart[it.id] || 0} mudar={mudar} pedido={pedido && aberto} />)}
            </section>
          );
        })}
        {itens.length === 0 && <p className="text-center text-sm text-stone-500 px-8 py-10">Cardápio em montagem. Volte já!</p>}
        <p className="text-center text-xs text-stone-400 mt-8">Cardápio digital por <Link to="/" className="underline">AppPani</Link></p>
      </div>

      {qtdTotal > 0 && !abrir && (
        <div className="fixed bottom-0 inset-x-0 flex justify-center p-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button onClick={() => setAbrir(true)} className="w-full max-w-md bg-red-600 text-white rounded-xl py-3 px-4 font-semibold flex items-center justify-between shadow-lg">
            <span className="flex items-center gap-2"><ShoppingBag size={18} />Ver pedido ({qtdTotal})</span><span>{money(total)}</span>
          </button>
        </div>
      )}

      {abrir && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={() => setAbrir(false)}>
          <div className="w-full max-w-md bg-white rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <h2 className="font-bold mb-2">Seu pedido</h2>
            {linhas.map((l) => (
              <div key={l.id} className="flex justify-between text-sm py-1"><span>{l.qtd}× {l.nome}</span><span>{money(l.preco * l.qtd)}</span></div>
            ))}
            <div className="flex justify-between font-bold border-t border-stone-200 mt-2 pt-2"><span>Total</span><span>{money(total)}</span></div>
            <div className="flex flex-col gap-2 mt-3">
              <input className={inp} inputMode="numeric" placeholder="Número da mesa *" value={f.mesa} onChange={(e) => setF({ ...f, mesa: e.target.value })} maxLength={20} />
              <input className={inp} placeholder="Seu nome (opcional)" value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} maxLength={60} />
              <input className={inp} placeholder="Observações (ex.: sem cebola)" value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} maxLength={300} />
              {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
              <button onClick={enviar} disabled={busy} className={btn}>{busy ? 'Enviando…' : 'Enviar para a chapa'}</button>
              <button onClick={() => setAbrir(false)} className={btn2}>Continuar escolhendo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
