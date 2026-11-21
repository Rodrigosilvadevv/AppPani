// Delivery do cliente: escolhe a pani, monta a sacola (por unidade ou por peso), fecha o pedido
// e acompanha ao vivo. O valor final é sempre recalculado no banco (fazer_pedido).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bike, ChevronLeft, ChevronRight, Clock, MapPin, Minus, Plus, Scale, Search, ShoppingBag, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { Chip, Pic, Sheet, Spinner, StatusBadge, Vazio, btn, btn2, card, inp, useToast } from '../ui';
import { Capa, Redes } from '../components/perfil';
import { AcompanharPedido } from '../components/Acompanhar';
import { ABERTOS, PAGAMENTOS, STATUS, codigo, fazerPedido } from '../lib/pedidos';
import { distKm, foneFmt, fresco, gramasFmt, kmFmt, linhaTotal, money, pn, precoFmt, soDigitos, statusAgora, tempo } from '../lib/util';
import { haptic } from '../lib/native';

const CATS = { pao: ['🥖', 'Pães'], salgado: ['🥟', 'Salgados'], doce: ['🍰', 'Doces'] };
const PESOS = [100, 200, 250, 500, 750, 1000, 1500, 2000];
const sacolaKey = (id) => `apppani:sacola:${id}`;
const lerSacola = (id) => { try { return JSON.parse(localStorage.getItem(sacolaKey(id))) || {}; } catch { return {}; } };
// quem pede pelo link sem conta: nome/telefone/endereço ficam só neste aparelho para o próximo pedido
const ENTREGA_LOCAL = 'apppani:entrega';
const lerEntregaLocal = () => { try { return JSON.parse(localStorage.getItem(ENTREGA_LOCAL)) || {}; } catch { return {}; } };

/* ---------- meus pedidos (usado também para o número no menu) ---------- */
export function useMeusPedidos(uid) {
  const [lista, setLista] = useState(null);
  const carregar = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from('pedidos')
      .select('id, pani_id, tipo, status, total, created_at, updated_at, panis(nome, foto_url, emoji)')
      .eq('user_id', uid).order('created_at', { ascending: false }).limit(20);
    if (data) setLista(data);
  }, [uid]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    if (!uid) return;
    const ch = supabase.channel(`meus-pedidos-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `user_id=eq.${uid}` }, () => carregar())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, carregar]);
  const ativos = (lista || []).filter((o) => ABERTOS.includes(o.status));
  return { lista, ativos, carregar };
}

/* ---------- escolher o peso de um item vendido por kg ---------- */
function SheetPeso({ it, gramas, salvar, fechar }) {
  const [g, setG] = useState(gramas || 500);
  const valor = linhaTotal({ unidade: 'kg', preco: it.preco, qtd: g });
  const muda = (d) => { haptic(); setG((v) => Math.max(50, Math.min(10000, v + d))); };
  return (
    <Sheet aberto fechar={fechar} titulo={it.nome}>
      <p className="text-sm text-stone-500">{precoFmt(it.preco, 'kg')} · escolha quanto quer</p>
      <div className="flex flex-wrap gap-2 my-3">
        {PESOS.map((p) => <Chip key={p} on={g === p} onClick={() => { haptic(); setG(p); }}>{gramasFmt(p)}</Chip>)}
      </div>
      <div className="flex items-center justify-center gap-5 my-4">
        <button onClick={() => muda(-50)} aria-label="Menos 50 gramas" className="w-12 h-12 rounded-full border border-stone-300 flex items-center justify-center"><Minus size={20} /></button>
        <div className="text-center min-w-28">
          <div className="text-3xl font-bold">{gramasFmt(g)}</div>
          <div className="text-sm text-stone-500">{money(valor)}</div>
        </div>
        <button onClick={() => muda(50)} aria-label="Mais 50 gramas" className="w-12 h-12 rounded-full border border-stone-300 flex items-center justify-center"><Plus size={20} /></button>
      </div>
      <p className="text-xs text-stone-400 text-center mb-3">O peso na balança pode variar um pouco. A padaria avisa se o valor mudar.</p>
      <button onClick={() => { salvar(g); fechar(); }} className={`${btn} w-full`}>{gramas ? 'Atualizar' : 'Adicionar'} · {money(valor)}</button>
      {gramas > 0 && <button onClick={() => { salvar(0); fechar(); }} className={`${btn2} w-full mt-2 text-red-700`}>Tirar da sacola</button>}
    </Sheet>
  );
}

/* ---------- item da vitrine ---------- */
function Item({ it, qtd, mudar, abrirPeso, aberto, quente }) {
  const kg = it.unidade === 'kg';
  return (
    <div className="flex gap-3 py-3 border-b border-stone-100">
      <div className="relative shrink-0">
        <Pic src={it.img_url} emoji={CATS[it.cat]?.[0] || '🥖'} cls="!w-24 h-24 rounded-xl" alt={it.nome} />
        {quente && <span className="absolute top-1 left-1 bg-green-600 text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5">Saiu agora</span>}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="font-semibold text-sm">{it.nome}</div>
        {it.descricao && <div className="text-xs text-stone-500 mt-0.5 line-clamp-2">{it.descricao}</div>}
        <div className="mt-auto flex items-center justify-between pt-1 gap-2">
          <span className="text-sm font-semibold">{precoFmt(it.preco, it.unidade)}</span>
          {!aberto ? null : kg ? (
            qtd > 0
              ? <button onClick={() => abrirPeso(it)} className="border border-red-600 text-red-700 rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1"><Scale size={13} />{gramasFmt(qtd)} · {money(linhaTotal({ unidade: 'kg', preco: it.preco, qtd }))}</button>
              : <button onClick={() => abrirPeso(it)} className="bg-red-600 text-white rounded-full px-3 py-2 text-xs font-semibold flex items-center gap-1"><Scale size={14} />Escolher peso</button>
          ) : (
            qtd > 0
              ? <span className="flex items-center gap-3 border border-stone-300 rounded-full px-2 py-1">
                  <button onClick={() => mudar(it, qtd - 1)} aria-label={`Menos ${it.nome}`} className="p-1"><Minus size={16} /></button>
                  <b className="text-sm w-4 text-center">{qtd}</b>
                  <button onClick={() => mudar(it, qtd + 1)} aria-label={`Mais ${it.nome}`} className="p-1"><Plus size={16} /></button>
                </span>
              : <button onClick={() => mudar(it, 1)} className="bg-red-600 text-white rounded-full px-3 py-2 text-xs font-semibold flex items-center gap-1"><Plus size={14} />Adicionar</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- fechar o pedido ---------- */
function Checkout({ p, linhas, subtotal, mudar, abrirPeso, fechar, feito }) {
  const { user, perfil } = useAuth();
  const say = useToast();
  const [f, setF] = useState(() => {
    const local = user ? {} : lerEntregaLocal();
    return {
      nome: perfil?.nome || local.nome || '', telefone: foneFmt(perfil?.telefone || local.telefone || ''),
      endereco: local.endereco || '', pagamento: null, troco: '', obs: '',
    };
  });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const taxa = Number(p.taxa_entrega) || 0;
  const minimo = Number(p.pedido_minimo) || 0;
  const total = Math.round((subtotal + taxa) * 100) / 100;
  const falta = Math.max(0, minimo - subtotal);
  const aberto = statusAgora(p).aberto;
  const temKg = linhas.some((l) => l.unidade === 'kg');

  // último endereço usado (só a própria pessoa enxerga)
  useEffect(() => {
    if (!user) return;
    supabase.from('dados_entrega').select('endereco, telefone').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      if (data) setF((v) => ({ ...v, endereco: v.endereco || data.endereco || '', telefone: v.telefone || foneFmt(data.telefone || '') }));
    });
  }, [user]);

  const enviar = async () => {
    setErro('');
    if (!aberto) return setErro('A panificadora está fechada agora.');
    if (falta > 0) return setErro(`Faltam ${money(falta)} para o pedido mínimo.`);
    if (!user && f.nome.trim().length < 2) return setErro('Informe seu nome.');
    if (f.endereco.trim().length < 8) return setErro('Informe o endereço completo: rua, número e bairro.');
    const fone = soDigitos(f.telefone);
    if (fone.length < 10 || fone.length > 13) return setErro('Informe um telefone com DDD.');
    if (!f.pagamento) return setErro('Escolha a forma de pagamento.');
    const troco = f.pagamento === 'dinheiro' && String(f.troco).trim() ? pn(f.troco) : null;
    if (troco != null && troco < total) return setErro(`O troco precisa ser para um valor maior que ${money(total)}.`);

    setBusy(true);
    try {
      const r = await fazerPedido({
        pani_id: p.id, tipo: 'delivery', itens: linhas.map((l) => ({ id: l.id, qtd: l.qtd })),
        cliente: f.nome.trim() || perfil?.nome || '', telefone: fone, endereco: f.endereco.trim(),
        pagamento: f.pagamento, troco, obs: f.obs.trim(),
      });
      if (!user) {
        try { localStorage.setItem(ENTREGA_LOCAL, JSON.stringify({ nome: f.nome.trim(), telefone: fone, endereco: f.endereco.trim() })); } catch { /* ignora */ }
      }
      haptic('sucesso');
      feito(r.id);
    } catch (e) {
      setErro(e.message);
      say(e.message, 'erro');
    } finally { setBusy(false); }
  };

  return (
    <Sheet aberto fechar={fechar} titulo={`Sacola · ${p.nome}`}>
      {linhas.map((l) => (
        <div key={l.id} className="flex items-center justify-between text-sm py-1.5 gap-2">
          <span className="flex-1 min-w-0 truncate">{l.nome}</span>
          {l.unidade === 'kg'
            ? <button onClick={() => abrirPeso(l.item)} className="border border-stone-300 rounded-full px-2.5 py-1 text-xs font-semibold flex items-center gap-1"><Scale size={12} />{gramasFmt(l.qtd)}</button>
            : (
              <span className="flex items-center gap-2 border border-stone-300 rounded-full px-2 py-0.5">
                <button onClick={() => mudar(l.item, l.qtd - 1)} aria-label="Menos" className="p-1">{l.qtd === 1 ? <Trash2 size={14} /> : <Minus size={14} />}</button>
                <b className="w-4 text-center">{l.qtd}</b>
                <button onClick={() => mudar(l.item, l.qtd + 1)} aria-label="Mais" className="p-1"><Plus size={14} /></button>
              </span>
            )}
          <span className="w-20 text-right">{money(l.total)}</span>
        </div>
      ))}
      <div className="border-t border-stone-200 mt-2 pt-2 text-sm flex flex-col gap-0.5">
        <div className="flex justify-between text-stone-500"><span>Produtos</span><span>{money(subtotal)}</span></div>
        <div className="flex justify-between text-stone-500"><span>Entrega</span><span>{taxa > 0 ? money(taxa) : 'Grátis'}</span></div>
        <div className="flex justify-between font-bold text-base"><span>Total</span><span>{money(total)}</span></div>
      </div>
      {falta > 0 && <p className="mt-2 text-xs rounded-lg bg-amber-50 text-amber-800 px-3 py-2">Pedido mínimo de {money(minimo)}. Faltam {money(falta)}.</p>}
      {temKg && <p className="mt-2 text-[11px] text-stone-400">Itens por kg: o peso pode variar um pouco na balança. A padaria avisa se o valor mudar.</p>}

      <div className="flex flex-col gap-2 mt-4">
        <b className="text-sm">Entrega</b>
        <input className={inp} maxLength={60} placeholder={user ? 'Seu nome' : 'Seu nome *'} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} autoComplete="name" />
        <input className={inp} type="tel" inputMode="tel" maxLength={20} placeholder="Telefone com DDD *" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} autoComplete="tel" />
        <textarea className={inp} rows={2} maxLength={300} placeholder="Endereço: rua, número, bairro e referência *" value={f.endereco} onChange={(e) => setF({ ...f, endereco: e.target.value })} autoComplete="street-address" />

        <b className="text-sm mt-2">Pagamento na entrega</b>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PAGAMENTOS).map(([k, l]) => <Chip key={k} on={f.pagamento === k} onClick={() => { haptic(); setF({ ...f, pagamento: k }); }}>{l}</Chip>)}
        </div>
        {f.pagamento === 'dinheiro' && (
          <input className={inp} inputMode="decimal" placeholder="Troco para quanto? (vazio = não precisa)" value={f.troco} onChange={(e) => setF({ ...f, troco: e.target.value })} />
        )}
        <input className={inp} maxLength={300} placeholder="Observações (ex.: pão bem moreninho)" value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} />

        {!user && <p className="text-[11px] text-stone-400">Sem cadastro: depois de pedir, você acompanha o pedido por um link. Seus dados de entrega ficam salvos só neste aparelho.</p>}
        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
        <button onClick={enviar} disabled={busy || !aberto || falta > 0 || !linhas.length} className={`${btn} mt-1`}>
          {busy ? 'Enviando…' : !aberto ? 'Fechado agora' : `Fazer pedido · ${money(total)}`}
        </button>
        <button onClick={fechar} className={btn2}>Continuar escolhendo</button>
      </div>
    </Sheet>
  );
}

/* ---------- a loja de uma pani (também usada no link público /d/:slug) ---------- */
export function Loja({ p, voltar, aoPedir }) {
  const say = useToast();
  const [itens, setItens] = useState(null);
  const [quentes, setQuentes] = useState([]);
  const [sacola, setSacola] = useState(() => lerSacola(p.id));
  const [cat, setCat] = useState(null);
  const [peso, setPeso] = useState(null);
  const [checkout, setCheckout] = useState(false);
  const aberto = statusAgora(p).aberto;

  useEffect(() => {
    (async () => {
      const desde = new Date(Date.now() - 72 * 3600000).toISOString();
      const [a, b] = await Promise.all([
        supabase.from('cardapio_itens').select('*').eq('pani_id', p.id).eq('ativo', true).eq('tipo', 'balcao')
          .not('cat', 'is', null).not('unidade', 'is', null).not('preco', 'is', null).order('nome'),
        supabase.from('fornadas').select('cat, itens, created_at').eq('pani_id', p.id).gte('created_at', desde).order('created_at', { ascending: false }).limit(30),
      ]);
      setItens(a.data || []);
      // itens que saíram numa fornada que ainda está fresquinha
      const nomes = new Set();
      (b.data || []).filter((f) => fresco(f.created_at, f.cat)).forEach((f) => (f.itens || []).forEach((n) => nomes.add(String(n).trim().toLowerCase())));
      setQuentes([...nomes]);
    })();
  }, [p.id]);

  useEffect(() => { try { localStorage.setItem(sacolaKey(p.id), JSON.stringify(sacola)); } catch { /* ignora */ } }, [sacola, p.id]);

  const mudar = (it, q) => {
    haptic();
    setSacola((s) => {
      const n = { ...s };
      const max = it.unidade === 'kg' ? 10000 : 99;
      if (q > 0) n[it.id] = Math.min(max, q); else delete n[it.id];
      return n;
    });
  };

  const linhas = useMemo(() => (itens || []).filter((i) => sacola[i.id]).map((i) => ({
    id: i.id, item: i, nome: i.nome, unidade: i.unidade, qtd: sacola[i.id], preco: Number(i.preco),
    total: linhaTotal({ unidade: i.unidade, preco: i.preco, qtd: sacola[i.id] }),
  })), [itens, sacola]);
  const subtotal = Math.round(linhas.reduce((a, l) => a + l.total, 0) * 100) / 100;
  const nItens = linhas.reduce((a, l) => a + (l.unidade === 'kg' ? 1 : l.qtd), 0);

  // se um item saiu do cardápio, ele some da sacola sozinho
  useEffect(() => {
    if (!itens) return;
    const ids = new Set(itens.map((i) => i.id));
    const sobra = Object.keys(sacola).filter((k) => !ids.has(k));
    if (sobra.length) {
      setSacola((s) => { const n = { ...s }; sobra.forEach((k) => delete n[k]); return n; });
      say('Um item da sua sacola não está mais disponível e foi retirado.');
    }
  }, [itens]); // eslint-disable-line react-hooks/exhaustive-deps

  const cats = Object.keys(CATS).filter((k) => (itens || []).some((i) => i.cat === k));
  const L = (itens || []).filter((i) => !cat || i.cat === cat);
  const taxa = Number(p.taxa_entrega) || 0;

  return (
    <div className="pb-28">
      {voltar && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-100">
          <button onClick={voltar} aria-label="Voltar" className="p-1 -ml-1"><ChevronLeft size={22} /></button>
          <span className="font-semibold text-sm truncate flex-1">Delivery · {p.nome}</span>
        </div>
      )}
      <Capa p={p} altura="h-32 sm:h-44" />
      <div className="px-4 pt-11 pb-3 text-sm">
        <h2 className="font-bold text-lg leading-tight">{p.nome}</h2>
        <StatusBadge p={p} />
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-600 mt-1">
          <span className="flex items-center gap-1"><Bike size={13} />{taxa > 0 ? `Entrega ${money(taxa)}` : 'Entrega grátis'}</span>
          <span className="flex items-center gap-1"><Clock size={13} />{p.tempo_entrega || '40–60 min'}</span>
          {Number(p.pedido_minimo) > 0 && <span>Mínimo {money(p.pedido_minimo)}</span>}
        </div>
        <Redes p={p} className="mt-2" />
      </div>
      {!aberto && <p className="mx-4 mb-2 text-xs bg-red-50 text-red-700 rounded-lg px-3 py-2">Fechada agora. Você pode olhar, mas os pedidos abrem no horário de funcionamento.</p>}

      {cats.length > 1 && (
        <div className="flex gap-2 px-4 pb-2 overflow-x-auto">
          <Chip on={!cat} onClick={() => setCat(null)}>Tudo</Chip>
          {cats.map((k) => <Chip key={k} on={cat === k} onClick={() => setCat(cat === k ? null : k)}>{CATS[k][0]} {CATS[k][1]}</Chip>)}
        </div>
      )}

      <div className="px-4">
        {itens == null ? <Spinner />
          : itens.length === 0 ? <Vazio t="Esta panificadora ainda não colocou produtos no delivery. Volte daqui a pouco!" />
          : L.map((it) => (
            <Item key={it.id} it={it} qtd={sacola[it.id] || 0} mudar={mudar} abrirPeso={setPeso} aberto={aberto}
              quente={quentes.includes(it.nome.trim().toLowerCase())} />
          ))}
      </div>

      {linhas.length > 0 && !checkout && (
        // fica grudada no fim da área rolável: funciona com a barra de baixo (celular) e com o menu lateral (computador)
        <div className="sticky bottom-0 z-20 px-3 pt-4 pb-3 bg-gradient-to-t from-white via-white/95 to-transparent">
          <button onClick={() => setCheckout(true)} className="w-full bg-red-600 text-white rounded-xl py-3.5 px-4 font-semibold flex items-center justify-between shadow-lg">
            <span className="flex items-center gap-2"><ShoppingBag size={18} />Ver sacola ({nItens})</span><span>{money(subtotal)}</span>
          </button>
        </div>
      )}

      {peso && <SheetPeso it={peso} gramas={sacola[peso.id] || 0} salvar={(g) => mudar(peso, g)} fechar={() => setPeso(null)} />}
      {checkout && (
        <Checkout p={p} linhas={linhas} subtotal={subtotal} mudar={mudar} abrirPeso={(it) => { setCheckout(false); setPeso(it); }}
          fechar={() => setCheckout(false)}
          feito={(id) => { setSacola({}); setCheckout(false); aoPedir(id); }} />
      )}
    </div>
  );
}

/* ---------- aba Delivery ---------- */
export default function Delivery({ panis, loc, pedirLoc, lojaInicial, pedidoInicial, meus }) {
  const [loja, setLoja] = useState(lojaInicial || null);
  const [ver, setVer] = useState(pedidoInicial || null);
  const [q, setQ] = useState('');
  const [historico, setHistorico] = useState(false);

  useEffect(() => { if (lojaInicial) { setLoja(lojaInicial); setVer(null); } }, [lojaInicial]);
  useEffect(() => { if (pedidoInicial) setVer(pedidoInicial); }, [pedidoInicial]);

  const lojas = useMemo(() => {
    const busca = q.trim().toLowerCase();
    return panis.filter((p) => p.delivery)
      .filter((p) => !busca || (p.nome || '').toLowerCase().includes(busca) || (p.endereco || '').toLowerCase().includes(busca))
      .map((p) => ({ p, aberta: statusAgora(p).aberto, d: distKm(loc, p) }))
      .sort((a, b) => (b.aberta - a.aberta) || ((a.d ?? 1e9) - (b.d ?? 1e9)) || a.p.nome.localeCompare(b.p.nome, 'pt-BR'));
  }, [panis, q, loc]);

  if (ver) {
    return (
      <div>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-100">
          <button onClick={() => { setVer(null); meus.carregar(); }} aria-label="Voltar" className="p-1 -ml-1"><ChevronLeft size={22} /></button>
          <span className="font-semibold text-sm">Acompanhar pedido</span>
        </div>
        <AcompanharPedido id={ver} />
      </div>
    );
  }

  const pLoja = panis.find((p) => p.id === loja && p.delivery);
  if (pLoja) return <Loja p={pLoja} voltar={() => setLoja(null)} aoPedir={(id) => { setLoja(null); setVer(id); meus.carregar(); }} />;

  const anteriores = (meus.lista || []).filter((o) => !ABERTOS.includes(o.status));

  return (
    <div className="p-3 flex flex-col gap-3">
      {meus.ativos.length > 0 && (
        <div className="flex flex-col gap-2">
          <b className="text-sm px-1">Em andamento</b>
          {meus.ativos.map((o) => (
            <button key={o.id} onClick={() => setVer(o.id)} className={`${card} flex items-center gap-3 text-left border-red-200 bg-red-50/50`}>
              <span className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-xl shrink-0">{o.tipo === 'delivery' ? '🛵' : '🍽️'}</span>
              <span className="flex-1 min-w-0 text-sm">
                <span className="block font-semibold truncate">{o.panis?.nome || 'Pedido'} <span className="text-stone-400 font-normal text-xs">#{codigo(o.id)}</span></span>
                <span className={`inline-block text-[11px] font-semibold rounded-full px-2 py-0.5 mt-0.5 ${STATUS[o.status]?.cor || ''}`}>{STATUS[o.status]?.txt}</span>
                <span className="text-xs text-stone-500"> · {money(o.total)} · {tempo(o.created_at)}</span>
              </span>
              <ChevronRight size={18} className="text-stone-400" />
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search size={16} className="absolute left-3 top-3.5 text-stone-400" />
        <input className={`${inp} pl-9`} placeholder="Buscar panificadora com delivery" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
      </div>
      {!loc && (
        <button onClick={pedirLoc} className="text-xs text-red-700 font-semibold flex items-center gap-1 self-start"><MapPin size={13} />Usar minha localização para ver as mais perto</button>
      )}

      {lojas.length === 0 && (
        <Vazio t={q ? 'Nenhuma panificadora com delivery encontrada.' : 'Ainda não tem panificadora fazendo delivery por aqui. Siga suas favoritas e peça para elas ligarem!'} />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
      {lojas.map(({ p, aberta, d }) => (
        <button key={p.id} onClick={() => setLoja(p.id)} className={`rounded-2xl border border-stone-200 overflow-hidden text-left min-w-0 ${aberta ? '' : 'opacity-70'}`}>
          <div className="relative">
            {p.capa_url
              ? <img src={p.capa_url} alt="" loading="lazy" className="w-full h-24 object-cover bg-stone-200" />
              : <div className="w-full h-24 bg-gradient-to-br from-red-600 via-red-500 to-orange-400" />}
            <span className="absolute left-3 -bottom-6 rounded-full ring-4 ring-white bg-white">
              <Pic src={p.foto_url} emoji={p.emoji} cls="!w-14 h-14 rounded-full text-2xl" />
            </span>
          </div>
          <div className="pt-7 pb-3 px-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-bold truncate flex-1">{p.nome}</span>
              {d != null && <span className="text-xs text-stone-500 flex items-center gap-0.5 shrink-0"><MapPin size={11} />{kmFmt(d)}</span>}
            </div>
            <StatusBadge p={p} />
            <div className="flex flex-wrap gap-x-3 text-xs text-stone-600 mt-1">
              <span className="flex items-center gap-1"><Bike size={12} />{Number(p.taxa_entrega) > 0 ? money(p.taxa_entrega) : 'Entrega grátis'}</span>
              <span className="flex items-center gap-1"><Clock size={12} />{p.tempo_entrega || '40–60 min'}</span>
              {Number(p.pedido_minimo) > 0 && <span>Mín. {money(p.pedido_minimo)}</span>}
            </div>
          </div>
        </button>
      ))}
      </div>

      {anteriores.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setHistorico((v) => !v)} className="text-sm font-semibold px-1 flex items-center gap-1">
            Pedidos anteriores ({anteriores.length}) <ChevronRight size={16} className={historico ? 'rotate-90' : ''} />
          </button>
          {historico && anteriores.map((o) => (
            <button key={o.id} onClick={() => setVer(o.id)} className="w-full flex items-center gap-3 py-2 border-b border-stone-100 text-left text-sm">
              <span className="flex-1 min-w-0 truncate">{o.panis?.nome || 'Pedido'} · {money(o.total)}</span>
              <span className="text-xs text-stone-500">{STATUS[o.status]?.txt} · {tempo(o.created_at)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
