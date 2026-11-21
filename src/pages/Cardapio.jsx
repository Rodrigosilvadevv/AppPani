import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bike, ChefHat, MapPin, Minus, Plus, Share2, ShoppingBag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { HorariosView, Logo, Sheet, Spinner, StatusBadge, Stars, btn, btn2, inp, useToast } from '../ui';
import { media, money, notaFmt, precoFmt, statusAgora } from '../lib/util';
import { compartilhar, haptic } from '../lib/native';
import { fazerPedido, pedidosRecentes } from '../lib/pedidos';
import { Capa, Redes } from '../components/perfil';
import { APP_URL } from '../config';

// Página pública do cardápio: /c/:slug  (não precisa de login)
// - Chapa e bebidas: o cliente na mesa monta o pedido e envia
// - Balcão: somente visualização (sem botão de pedido)
const SECOES = [
  ['chapa', 'Na chapa', true],
  ['bebida', 'Bebidas', true],
  ['balcao', 'No balcão', false],
];
function Item({ it, qtd, mudar, pedido }) {
  return (
    <div className="flex gap-3 py-3 border-b border-stone-100">
      {it.img_url
        ? <img src={it.img_url} alt={it.nome} loading="lazy" className="w-24 h-24 rounded-xl object-cover shrink-0 bg-stone-100" />
        : <div className="w-24 h-24 rounded-xl bg-red-50 flex items-center justify-center text-3xl shrink-0" aria-hidden="true">{it.tipo === 'bebida' ? '🥤' : it.tipo === 'chapa' ? '🍔' : '🥖'}</div>}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="font-semibold text-sm">{it.nome}</div>
        {it.descricao && <div className="text-xs text-stone-500 mt-0.5 line-clamp-3">{it.descricao}</div>}
        <div className="mt-auto flex items-center justify-between pt-1 gap-2">
          <span className="text-sm font-semibold">{precoFmt(it.preco, it.tipo === 'balcao' ? it.unidade : null)}</span>
          {pedido && (qtd > 0
            ? <span className="flex items-center gap-3 border border-stone-300 rounded-full px-2 py-1">
                <button onClick={() => mudar(it, -1)} aria-label={`Menos ${it.nome}`} className="p-1"><Minus size={16} /></button>
                <b className="text-sm w-4 text-center">{qtd}</b>
                <button onClick={() => mudar(it, 1)} aria-label={`Mais ${it.nome}`} className="p-1"><Plus size={16} /></button>
              </span>
            : <button onClick={() => mudar(it, 1)} className="bg-red-600 text-white rounded-full px-3 py-2 text-xs font-semibold flex items-center gap-1 shrink-0"><Plus size={14} />Adicionar</button>)}
        </div>
      </div>
    </div>
  );
}

export default function Cardapio() {
  const { slug } = useParams();
  const say = useToast();
  const nav = useNavigate();
  const [p, setP] = useState(undefined);
  const [itens, setItens] = useState([]);
  const [notas, setNotas] = useState([]);
  const [cart, setCart] = useState(() => { try { return JSON.parse(localStorage.getItem(`apppani:cart:${slug}`)) || {}; } catch { return {}; } });
  const [abrir, setAbrir] = useState(false);
  const [f, setF] = useState(() => ({ mesa: localStorage.getItem(`apppani:mesa:${slug}`) || '', cliente: '', obs: '' }));
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [recente] = useState(() => pedidosRecentes(3)[0]?.id || null);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('panis').select('*, comentarios(nota)').eq('slug', slug).maybeSingle();
    setP(data);
    setNotas(data?.comentarios || []);
    if (data) {
      const r = await supabase.from('cardapio_itens').select('*').eq('pani_id', data.id).eq('ativo', true).order('created_at');
      setItens(r.data || []);
    }
  }, [slug]);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    try { localStorage.setItem(`apppani:cart:${slug}`, JSON.stringify(cart)); } catch { /* ignora */ }
  }, [cart, slug]);

  const mudar = (it, d) => {
    haptic();
    setCart((c) => {
      const q = Math.max(0, Math.min(99, (c[it.id] || 0) + d));
      const n = { ...c };
      if (q) n[it.id] = q; else delete n[it.id];
      return n;
    });
  };

  const linhas = useMemo(
    () => itens.filter((i) => cart[i.id]).map((i) => ({ id: i.id, nome: i.nome, preco: Number(i.preco) || 0, qtd: cart[i.id] })),
    [itens, cart]
  );
  const total = linhas.reduce((a, l) => a + l.preco * l.qtd, 0);
  const qtdTotal = linhas.reduce((a, l) => a + l.qtd, 0);

  if (p === undefined) return <Spinner />;
  if (p === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-8 text-center">
        <Logo /><p className="text-sm text-stone-600">Cardápio não encontrado.</p>
        <Link to="/" className={btn}>Conhecer o AppPani</Link>
      </div>
    );
  }

  const aberto = statusAgora(p).aberto;

  const enviar = async () => {
    if (!f.mesa.trim()) return setErro('Informe o número da mesa.');
    if (!linhas.length) return setErro('Seu pedido está vazio.');
    setBusy(true); setErro('');
    try {
      // o banco confere os itens e calcula o total com o preço do cardápio
      const r = await fazerPedido({ pani_id: p.id, tipo: 'mesa', itens: linhas, mesa: f.mesa.trim(), cliente: f.cliente.trim(), obs: f.obs.trim() });
      haptic('sucesso');
      try { localStorage.setItem(`apppani:mesa:${slug}`, f.mesa.trim()); } catch { /* ignora */ }
      setCart({}); setAbrir(false);
      nav(`/pedido/${r.id}?volta=${encodeURIComponent(`/c/${slug}`)}`);
    } catch (e) {
      setErro(e.message || 'Não foi possível enviar o pedido. Chame o atendente.');
    } finally { setBusy(false); }
  };

  const share = async () => {
    const r = await compartilhar({ title: p.nome, text: `Cardápio da ${p.nome}`, url: `${APP_URL}/c/${p.slug}` });
    if (r === 'copiado') say('Link copiado');
  };

  return (
    <div className="min-h-screen bg-stone-100 flex justify-center">
      <div className="w-full max-w-md bg-white min-h-screen pb-28">
        <div style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <Capa p={p}>
            <button onClick={share} aria-label="Compartilhar cardápio" className="bg-white/90 rounded-full p-2 shadow text-stone-700"><Share2 size={18} /></button>
          </Capa>
        </div>
        <div className="px-4 pt-11 pb-3 text-sm">
          <h1 className="font-bold text-lg leading-tight">{p.nome}</h1>
          <StatusBadge p={p} />
          {notas.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-stone-500 mt-0.5"><Stars v={media(notas)} />{notaFmt(media(notas))} ({notas.length})</div>
          )}
          {p.endereco && <div className="text-xs text-stone-500 mt-1 flex items-center gap-1"><MapPin size={12} />{p.endereco}</div>}
          <Redes p={p} className="mt-2" />
        </div>

        {recente && (
          <Link to={`/pedido/${recente}?volta=${encodeURIComponent(`/c/${slug}`)}`} className="mx-4 mb-2 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            <ChefHat size={16} />Acompanhar seu último pedido
          </Link>
        )}
        {p.delivery && (
          <Link to={`/d/${p.slug}`} className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-blue-700 text-white px-3 py-2.5 text-sm font-semibold">
            <Bike size={16} /><span className="flex-1">Quer receber em casa? Peça delivery aqui</span>
          </Link>
        )}

        <details className="mx-4 mb-2 border border-stone-200 rounded-xl px-3 py-2">
          <summary className="text-sm font-semibold cursor-pointer py-1">Horário de funcionamento</summary>
          <div className="mt-2"><HorariosView p={p} /></div>
        </details>
        {!aberto && <p className="mx-4 my-2 text-xs bg-red-50 text-red-700 rounded-lg px-3 py-2">Estamos fechados agora. Os pedidos pela mesa ficam disponíveis durante o horário de funcionamento.</p>}

        {SECOES.map(([tipo, titulo, pedido]) => {
          const L = itens.filter((i) => i.tipo === tipo);
          if (!L.length) return null;
          return (
            <section key={tipo} className="px-4 mt-4">
              <h2 className="font-bold">{tipo === 'balcao' ? (p.delivery ? 'No balcão · peça pelo delivery' : 'No balcão (somente ver)') : titulo}</h2>
              {L.map((it) => <Item key={it.id} it={it} qtd={cart[it.id] || 0} mudar={mudar} pedido={pedido && aberto} />)}
            </section>
          );
        })}
        {itens.length === 0 && <p className="text-center text-sm text-stone-500 px-8 py-10">Cardápio em montagem. Volte já!</p>}
        <p className="text-center text-xs text-stone-400 mt-8">Cardápio digital por <Link to="/" className="underline">AppPani</Link></p>
      </div>

      {qtdTotal > 0 && !abrir && (
        <div className="fixed bottom-0 inset-x-0 flex justify-center p-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button onClick={() => setAbrir(true)} className="w-full max-w-md bg-red-600 text-white rounded-xl py-3.5 px-4 font-semibold flex items-center justify-between shadow-lg">
            <span className="flex items-center gap-2"><ShoppingBag size={18} />Ver pedido ({qtdTotal})</span><span>{money(total)}</span>
          </button>
        </div>
      )}

      <Sheet aberto={abrir} fechar={() => setAbrir(false)} titulo="Seu pedido">
        {linhas.map((l) => {
          const it = itens.find((i) => i.id === l.id);
          return (
            <div key={l.id} className="flex items-center justify-between text-sm py-1.5 gap-2">
              <span className="flex-1 min-w-0 truncate">{l.nome}</span>
              <span className="flex items-center gap-2 border border-stone-300 rounded-full px-2 py-0.5">
                <button onClick={() => mudar(it, -1)} aria-label="Menos" className="p-1"><Minus size={14} /></button>
                <b className="w-4 text-center">{l.qtd}</b>
                <button onClick={() => mudar(it, 1)} aria-label="Mais" className="p-1"><Plus size={14} /></button>
              </span>
              <span className="w-20 text-right">{money(l.preco * l.qtd)}</span>
            </div>
          );
        })}
        <div className="flex justify-between font-bold border-t border-stone-200 mt-2 pt-2"><span>Total</span><span>{money(total)}</span></div>
        <div className="flex flex-col gap-2 mt-3">
          <input className={inp} inputMode="numeric" placeholder="Número da mesa *" value={f.mesa} onChange={(e) => setF({ ...f, mesa: e.target.value })} maxLength={20} />
          <input className={inp} placeholder="Seu nome (opcional)" value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} maxLength={60} />
          <input className={inp} placeholder="Observações (ex.: sem cebola)" value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} maxLength={300} />
          {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
          <button onClick={enviar} disabled={busy || !aberto} className={btn}>{busy ? 'Enviando…' : aberto ? 'Enviar para a chapa' : 'Fechado agora'}</button>
          <button onClick={() => setAbrir(false)} className={btn2}>Continuar escolhendo</button>
        </div>
      </Sheet>
    </div>
  );
}
