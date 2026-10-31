import { useCallback, useEffect, useState } from 'react';
import { Home, ClipboardList, UtensilsCrossed, BookOpen, Users, MessagesSquare, Settings, Flame, Trash2, Send, MapPin, LogOut, Copy, Plus, Minus, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { Av, FotoBtn, Logo, NavBtn, Pic, Selo, Shell, Spinner, Vazio, btn, btn2, inp, useToast } from '../ui';
import { DIAS, fresco, getHorarios, idade, money, slugify, tempo } from '../lib/util';
import Chat from './Chat';

/* ---------- helpers ---------- */
const pn = (v) => parseFloat(String(v ?? '').replace(',', '.')) || 0; // "12,50" -> 12.5
const fmt = (v) => Number(v || 0).toFixed(2).replace('.', ',');       // 12.5 -> "12,50"
const chip = (on) => `rounded-full px-3 py-1 text-xs border whitespace-nowrap ${on ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300'}`;

/* ---------- Painel: avisar fornada + feed de rolagem ---------- */
const CATS = { pao: ['🥖', 'Pão'], salgado: ['🥟', 'Salgado'], doce: ['🍰', 'Doce'] };

function Item({ it, p, apagar }) {
  const [e, l] = CATS[it.cat] || CATS.pao;
  const f = it.tipo === 'fornada';
  return (
    <article className="px-3 pb-4 mb-1 border-b border-stone-100">
      <div className="flex items-center gap-2 py-2">
        <Av src={p.foto_url} emoji={p.emoji} size={32} />
        <span className="text-sm font-semibold">{p.nome}</span>
        <span className="text-xs text-stone-400 flex-1">{tempo(it.created_at)}</span>
        <button onClick={() => apagar(it)} aria-label="Apagar"><Trash2 size={16} className="text-stone-400" /></button>
      </div>
      <div className="relative rounded-2xl overflow-hidden border border-stone-200 shadow-sm">
        <Pic src={it.img_url} emoji={f ? e : p.emoji} cls="aspect-square" />
        {f && fresco(it.created_at, it.cat) && <div className="absolute top-3 left-3"><Selo txt={it.cat === 'doce' ? 'Fresco' : 'Fresquinho'} /></div>}
      </div>
      <div className="pt-2 text-sm">{f ? <b>{e} Fornada de {l.toLowerCase()} saindo agora!</b> : it.txt}</div>
    </article>
  );
}

function Painel({ p, reload }) {
  const say = useToast();
  const [cat, setCat] = useState('pao');
  const [img, setImg] = useState(null);
  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState('');
  const [busy, setBusy] = useState(false);
  const [bal, setBal] = useState([]);      // itens do balcão já cadastrados
  const [feed, setFeed] = useState(null);
  const [pub, setPub] = useState(false);
  const [txt, setTxt] = useState('');
  const [pimg, setPimg] = useState(null);

  const loadBal = useCallback(async () => {
    const { data } = await supabase.from('cardapio_itens').select('*').eq('pani_id', p.id).eq('tipo', 'balcao').order('nome');
    setBal(data || []);
  }, [p.id]);
  const loadFeed = useCallback(async () => {
    const q = (t) => supabase.from(t).select('*').eq('pani_id', p.id).order('created_at', { ascending: false }).limit(30);
    const [f, o] = await Promise.all([q('fornadas'), q('posts')]);
    setFeed([...(f.data || []).map((x) => ({ ...x, tipo: 'fornada' })), ...(o.data || []).map((x) => ({ ...x, tipo: 'post' }))]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  }, [p.id]);
  useEffect(() => { loadBal(); loadFeed(); }, [loadBal, loadFeed]);

  const nomeCat = CATS[cat][1].toLowerCase();
  const ult = feed?.find((x) => x.tipo === 'fornada' && x.cat === cat); // cada categoria tem o seu próprio último aviso

  // salgado/doce avisado entra (ou volta a ficar ativo) no cardápio, tipo balcão
  const paraCardapio = async (n) => {
    const ja = bal.find((i) => i.nome.toLowerCase() === n.toLowerCase());
    const pr = preco.trim() ? pn(preco) : null;
    const dados = { ativo: true, ...(img && { img_url: img }), ...(pr != null && { preco: pr }) };
    const { error } = ja
      ? await supabase.from('cardapio_itens').update(dados).eq('id', ja.id)
      : await supabase.from('cardapio_itens').insert({ pani_id: p.id, tipo: 'balcao', nome: n, descricao: '', preco: pr, img_url: img, ativo: true });
    await loadBal();
    return !error;
  };

  const avisar = async () => {
    if (ult && idade(ult.created_at) < 0.17 && !window.confirm(`Você avisou ${nomeCat} há poucos minutos. Avisar de novo?`)) return;
    setBusy(true);
    const { data, error } = await supabase.from('fornadas').insert({ pani_id: p.id, img_url: img, cat }).select('id').single();
    if (error) { setBusy(false); return say('Não foi possível enviar o aviso.'); }
    const n = nome.trim();
    const noCardapio = cat !== 'pao' && n ? await paraCardapio(n) : false;
    const r = await supabase.functions.invoke('send-push', { body: { fornada_id: data.id } });
    setImg(null); setNome(''); setPreco('');
    await Promise.all([reload(), loadFeed()]);
    setBusy(false);
    say(r.error ? 'Aviso publicado no app (o push não saiu agora).' : `${CATS[cat][0]} Aviso enviado para ${r.data?.enviados ?? 0} aparelho(s)${noCardapio ? ' · já está no cardápio' : ''}`);
  };

  const postar = async () => {
    if (!txt.trim() && !pimg) return;
    const { error } = await supabase.from('posts').insert({ pani_id: p.id, txt: txt.trim(), img_url: pimg });
    if (error) return say('Não foi possível publicar.');
    setTxt(''); setPimg(null); setPub(false); loadFeed(); say('Publicado no feed');
  };
  const apagar = async (it) => {
    if (!window.confirm('Apagar esta publicação?')) return;
    const { error } = await supabase.from(it.tipo === 'fornada' ? 'fornadas' : 'posts').delete().eq('id', it.id);
    if (error) return say('Não foi possível apagar.');
    loadFeed();
  };

  return (
    <div>
      <div className="p-3 border-b border-stone-200 flex flex-col gap-2">
        <div className="flex gap-2">
          {Object.entries(CATS).map(([k, [e, l]]) => (
            <button key={k} onClick={() => setCat(k)} className={`flex-1 rounded-lg py-1.5 text-sm border ${cat === k ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300'}`}>{e} {l}</button>
          ))}
        </div>
        {cat !== 'pao' && (
          <>
            <div className="flex gap-2">
              <input className={inp} placeholder={`Qual ${nomeCat} saiu? (entra no cardápio)`} value={nome} onChange={(e) => setNome(e.target.value)} />
              <input className={`${inp} !w-24`} inputMode="decimal" placeholder="Preço" value={preco} onChange={(e) => setPreco(e.target.value)} />
            </div>
            {bal.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {bal.map((i) => (
                  <button key={i.id} onClick={() => { setNome(i.nome); setPreco(i.preco != null ? fmt(i.preco) : ''); }}
                    className={`${chip(nome.trim().toLowerCase() === i.nome.toLowerCase())} ${i.ativo ? '' : 'opacity-50'}`}>{i.nome}</button>
                ))}
              </div>
            )}
          </>
        )}
        <button onClick={avisar} disabled={busy} className="bg-red-600 text-white rounded-xl py-4 font-bold flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-60">
          <Flame size={20} />{busy ? 'Enviando…' : 'Avisar fornada'}
        </button>
        <FotoBtn img={img} onUrl={setImg} label="Foto da fornada (opcional)" />
        {feed && <p className="text-xs text-stone-500">{ult ? `Último aviso de ${nomeCat}: ${tempo(ult.created_at)}` : `Você ainda não avisou nenhuma fornada de ${nomeCat}.`}</p>}
      </div>

      <div className="px-3 py-2 border-b border-stone-200">
        {!pub
          ? <button onClick={() => setPub(true)} className={`${btn2} w-full flex items-center justify-center gap-2`}><Plus size={16} />Nova publicação</button>
          : <div className="flex flex-col gap-2">
              <FotoBtn img={pimg} onUrl={setPimg} />
              <input className={inp} placeholder="Legenda" value={txt} onChange={(e) => setTxt(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => { setPub(false); setTxt(''); setPimg(null); }} className={`flex-1 ${btn2}`}>Cancelar</button>
                <button onClick={postar} className={`flex-1 ${btn}`}>Publicar</button>
              </div>
            </div>}
      </div>

      <div className="pt-2">
        {feed === null ? <Spinner />
          : feed.length === 0 ? <Vazio t="Seu feed está vazio. Avise a primeira fornada ou faça uma publicação." />
          : feed.map((it) => <Item key={it.tipo + it.id} it={it} p={p} apagar={apagar} />)}
      </div>
    </div>
  );
}

/* ---------- Pedidos: recebido → preparando → pronto → finalizado ---------- */
const FLUXO = { novo: ['preparando', 'Preparar'], preparando: ['pronto', 'Pronto'], pronto: ['entregue', 'Finalizar'] };
const ROT = { novo: 'Recebido', preparando: 'Preparando', pronto: 'Pronto' };
const COR = { novo: 'bg-red-100 text-red-700', preparando: 'bg-orange-100 text-orange-700', pronto: 'bg-green-100 text-green-700' };

// preço do item: o que está salvo no pedido ou, se faltar, o preço atual do cardápio
const precoDe = (i, menu) => i.preco ?? menu.find((m) => (i.id && m.id === i.id) || m.nome === i.nome)?.preco ?? 0;
const soma = (l) => l.reduce((a, i) => a + pn(i.preco) * i.qtd, 0);

function Editor({ ini, menu, novo, onSave, onCancel }) {
  const say = useToast();
  const [mesa, setMesa] = useState(ini.mesa ?? '');
  const [itens, setItens] = useState(() => (ini.itens || []).map((i) => ({ ...i, preco: fmt(precoDe(i, menu)) })));
  const [total, setTotal] = useState(fmt(ini.total));
  const troca = (l) => { setItens(l); setTotal(fmt(soma(l))); }; // mexeu nos itens: o total acompanha
  const add = (m) => {
    const k = itens.findIndex((i) => (i.id && i.id === m.id) || i.nome === m.nome);
    troca(k >= 0 ? itens.map((i, x) => (x === k ? { ...i, qtd: i.qtd + 1 } : i)) : [...itens, { id: m.id, nome: m.nome, preco: fmt(m.preco), qtd: 1 }]);
  };
  const mais = (k, d) => troca(itens.map((i, x) => (x === k ? { ...i, qtd: i.qtd + d } : i)).filter((i) => i.qtd > 0));
  const setPreco = (k, v) => troca(itens.map((i, x) => (x === k ? { ...i, preco: v } : i)));
  const salvar = () => {
    if (novo && !String(mesa).trim()) return say('Informe a mesa.');
    if (!itens.length) return say('Adicione pelo menos um item.');
    onSave({ ...(novo && { mesa: String(mesa).trim() }), itens: itens.map((i) => ({ ...i, preco: pn(i.preco) })), total: pn(total) });
  };
  return (
    <div className="mt-2 border border-stone-200 bg-stone-50 rounded-xl p-2 flex flex-col gap-2">
      {novo && <input className={inp} placeholder="Mesa" value={mesa} onChange={(e) => setMesa(e.target.value)} />}
      {itens.map((i, k) => (
        <div key={k} className="flex items-center gap-2">
          <span className="flex-1 min-w-0 truncate">{i.nome}</span>
          <button onClick={() => mais(k, -1)} aria-label="Menos"><Minus size={16} /></button>
          <b className="w-5 text-center">{i.qtd}</b>
          <button onClick={() => mais(k, 1)} aria-label="Mais"><Plus size={16} /></button>
          <input className={`${inp} !w-20 text-right`} inputMode="decimal" aria-label={`Preço de ${i.nome}`} value={i.preco} onChange={(e) => setPreco(k, e.target.value)} />
        </div>
      ))}
      <div className="text-xs text-stone-500">Cardápio — toque para adicionar:</div>
      {menu.length === 0
        ? <p className="text-xs text-stone-400">Seu cardápio não tem itens ativos.</p>
        : <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {menu.map((m) => <button key={m.id} onClick={() => add(m)} className={chip(false)}>{m.nome}{m.preco != null && ` · ${money(m.preco)}`}</button>)}
          </div>}
      <label className="flex items-center justify-between font-semibold">Total (R$)
        <input className={`${inp} !w-28 text-right`} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button onClick={onCancel} className={`flex-1 ${btn2}`}>Cancelar</button>
        <button onClick={salvar} className={`flex-1 ${btn}`}>Salvar</button>
      </div>
    </div>
  );
}

function Pedidos({ lista, recarregar, menu, pid }) {
  const say = useToast();
  const [f, setF] = useState('todos');
  const [ed, setEd] = useState(null); // id do pedido em edição, ou 'novo'
  const n = (s) => lista.filter((o) => o.status === s).length;
  const L = lista.filter((o) => f === 'todos' || o.status === f);

  const mudar = async (ids, status) => {
    const { error } = await supabase.from('pedidos').update({ status }).in('id', ids);
    if (error) say('Não foi possível atualizar o pedido.'); else recarregar();
  };
  const salvar = async (o, d) => {
    const { error } = o
      ? await supabase.from('pedidos').update(d).eq('id', o.id)
      : await supabase.from('pedidos').insert({ pani_id: pid, status: 'novo', ...d });
    if (error) return say('Não foi possível salvar o pedido.');
    setEd(null); recarregar(); say(o ? 'Pedido atualizado' : 'Pedido criado');
  };

  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="flex gap-2 overflow-x-auto">
        {[['todos', 'Todos', lista.length], ['novo', 'Recebidos', n('novo')], ['preparando', 'Preparando', n('preparando')], ['pronto', 'Prontos', n('pronto')]].map(([k, l, c]) => (
          <button key={k} onClick={() => setF(k)} className={chip(f === k)}>{l} {c}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => setEd('novo')} className={`flex-1 ${btn2} flex items-center justify-center gap-2`}><Plus size={16} />Novo pedido</button>
        {n('pronto') > 0 && (
          <button onClick={() => mudar(lista.filter((o) => o.status === 'pronto').map((o) => o.id), 'entregue')} className={`flex-1 ${btn} flex items-center justify-center gap-2`}>
            <Check size={16} />Finalizar prontos ({n('pronto')})
          </button>
        )}
      </div>
      {ed === 'novo' && <Editor novo ini={{ itens: [], total: 0 }} menu={menu} onSave={(d) => salvar(null, d)} onCancel={() => setEd(null)} />}
      {!L.length && <Vazio t="Nenhum pedido em aberto. Os pedidos feitos pelo seu link aparecem aqui na hora." />}

      {L.map((o) => (
        <div key={o.id} className="border border-stone-200 rounded-xl p-3 text-sm">
          <div className="flex items-center justify-between">
            <b className="text-base">Mesa {o.mesa}</b>
            <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${COR[o.status]}`}>{ROT[o.status] || o.status}</span>
          </div>
          <div className="text-xs text-stone-500">{o.cliente && `${o.cliente} · `}{tempo(o.created_at)}</div>

          {ed === o.id
            ? <Editor ini={o} menu={menu} onSave={(d) => salvar(o, d)} onCancel={() => setEd(null)} />
            : <>
                <ul className="mt-2">
                  {o.itens.map((i, k) => {
                    const pr = pn(precoDe(i, menu));
                    return <li key={k} className="flex justify-between"><span>{i.qtd}× {i.nome}</span>{pr > 0 && <span className="text-stone-500">{money(pr * i.qtd)}</span>}</li>;
                  })}
                </ul>
                {o.obs && <p className="mt-1 text-xs bg-yellow-50 rounded px-2 py-1">Obs.: {o.obs}</p>}
                <div className="flex items-center justify-between mt-2 border-t border-stone-100 pt-2"><span className="text-stone-500">Total</span><b className="text-base">{money(o.total)}</b></div>
                {FLUXO[o.status] && <button onClick={() => mudar([o.id], FLUXO[o.status][0])} className={`${btn} w-full mt-3`}>{FLUXO[o.status][1]}</button>}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setEd(o.id)} className={`flex-1 ${btn2}`}>Alterar valor</button>
                  {o.status !== 'pronto' && <button onClick={() => mudar([o.id], 'entregue')} className={`flex-1 ${btn2}`}>Finalizar</button>}
                  <button onClick={() => window.confirm('Cancelar este pedido?') && mudar([o.id], 'cancelado')} className={`flex-1 ${btn2}`}>Cancelar</button>
                </div>
              </>}
        </div>
      ))}
    </div>
  );
}

/* ---------- Cardápio (chapa, bebidas e balcão) ---------- */
const TIPOS = [['chapa', 'Chapa'], ['bebida', 'Bebida'], ['balcao', 'Balcão (só ver)']];
function CardapioAdm({ p }) {
  const say = useToast();
  const [itens, setItens] = useState([]);
  const [f, setF] = useState({ tipo: 'chapa', nome: '', descricao: '', preco: '', img: null });
  const link = `${window.location.origin}/c/${p.slug}`;
  const load = useCallback(async () => {
    const { data } = await supabase.from('cardapio_itens').select('*').eq('pani_id', p.id).order('created_at', { ascending: false });
    setItens(data || []);
  }, [p.id]);
  useEffect(() => { load(); }, [load]);

  const copiar = async () => {
    if (navigator.share) { try { await navigator.share({ title: p.nome, url: link }); return; } catch { /* cancelado */ } }
    await navigator.clipboard?.writeText(link); say('Link do cardápio copiado');
  };
  const add = async () => {
    if (!f.nome.trim()) return;
    const { error } = await supabase.from('cardapio_itens').insert({
      pani_id: p.id, tipo: f.tipo, nome: f.nome.trim(), descricao: f.descricao.trim(),
      preco: parseFloat(String(f.preco).replace(',', '.')) || null, img_url: f.img,
    });
    if (error) return say('Não foi possível adicionar o item.');
    setF({ ...f, nome: '', descricao: '', preco: '', img: null }); load(); say('Item adicionado');
  };
  const alterna = async (it) => { await supabase.from('cardapio_itens').update({ ativo: !it.ativo }).eq('id', it.id); load(); };
  const remove = async (it) => { if (window.confirm(`Remover "${it.nome}"?`)) { await supabase.from('cardapio_itens').delete().eq('id', it.id); load(); } };

  return (
    <div className="p-4">
      <div className="border border-stone-200 rounded-xl p-3 flex flex-col gap-2 mb-3">
        <div className="font-semibold text-sm">Link do seu cardápio</div>
        <div className="flex gap-2"><input readOnly className={inp} value={link} onFocus={(e) => e.target.select()} /><button onClick={copiar} aria-label="Copiar" className={btn2}><Copy size={16} /></button></div>
        <p className="text-xs text-stone-500">Salgados e doces avisados no Painel entram aqui sozinhos, em Balcão.</p>
      </div>
      <div className="border border-stone-200 rounded-xl p-3 flex flex-col gap-2">
        <div className="flex gap-2">
          {TIPOS.map(([k, l]) => (
            <button key={k} onClick={() => setF({ ...f, tipo: k })} className={`flex-1 rounded-lg py-1.5 text-xs border ${f.tipo === k ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300'}`}>{l}</button>
          ))}
        </div>
        <input className={inp} placeholder="Nome (ex.: X-Bacon)" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <input className={inp} placeholder="Descrição (opcional)" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        <input className={inp} inputMode="decimal" placeholder="Preço" value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value })} />
        <FotoBtn img={f.img} onUrl={(img) => setF({ ...f, img })} />
        <p className="text-xs text-stone-500">{f.tipo === 'balcao' ? 'Itens do balcão aparecem no cardápio, mas não podem ser pedidos pelo link.' : 'O cliente na mesa pode pedir este item pelo link do cardápio.'}</p>
        <button onClick={add} className={`${btn} flex items-center justify-center gap-2`}><Plus size={16} />Adicionar ao cardápio</button>
      </div>
      {itens.length === 0 ? <Vazio t="Seu cardápio está vazio. Adicione o primeiro item." /> : (
        <div className="mt-4">
          {itens.map((it) => (
            <div key={it.id} className={`flex items-center gap-3 py-2 border-b border-stone-100 ${it.ativo ? '' : 'opacity-50'}`}>
              <Pic src={it.img_url} emoji="🍔" cls="w-14 h-14 rounded-lg !w-14" />
              <div className="flex-1 min-w-0 text-sm"><div className="font-semibold truncate">{it.nome}</div><div className="text-xs text-stone-500">{TIPOS.find((t) => t[0] === it.tipo)[1]} · {money(it.preco)}</div></div>
              <button onClick={() => alterna(it)} className={btn2}>{it.ativo ? 'Pausar' : 'Ativar'}</button>
              <button onClick={() => remove(it)} aria-label="Remover"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Receitas ---------- */
function Receitas({ p }) {
  const say = useToast();
  const [lista, setLista] = useState([]);
  const [f, setF] = useState({ titulo: '', ingredientes: '', modo: '' });
  const load = useCallback(async () => {
    const { data } = await supabase.from('receitas').select('*').eq('pani_id', p.id).order('created_at', { ascending: false });
    setLista(data || []);
  }, [p.id]);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    if (!f.titulo.trim()) return;
    const { error } = await supabase.from('receitas').insert({ pani_id: p.id, ...f });
    if (error) return say('Não foi possível salvar.');
    setF({ titulo: '', ingredientes: '', modo: '' }); load(); say('Receita salva');
  };
  return (
    <div className="p-4">
      <div className="border border-stone-200 rounded-xl p-3 flex flex-col gap-2">
        <input className={inp} placeholder="Nome da receita" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
        <textarea className={inp} rows={3} placeholder="Ingredientes (um por linha)" value={f.ingredientes} onChange={(e) => setF({ ...f, ingredientes: e.target.value })} />
        <textarea className={inp} rows={3} placeholder="Modo de preparo" value={f.modo} onChange={(e) => setF({ ...f, modo: e.target.value })} />
        <button onClick={add} className={btn}>Salvar receita</button>
      </div>
      {lista.length === 0 && <Vazio t="Guarde aqui as receitas da casa." />}
      {lista.map((r) => (
        <div key={r.id} className="py-3 border-b border-stone-100 text-sm">
          <div className="flex justify-between"><b>{r.titulo}</b>
            <button aria-label="Excluir" onClick={async () => { await supabase.from('receitas').delete().eq('id', r.id); load(); }}><Trash2 size={16} /></button>
          </div>
          <div className="whitespace-pre-line text-stone-600 mt-1">{r.ingredientes}</div>
          <div className="mt-1">{r.modo}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Clientes (seguidores) ---------- */
function Clientes({ p }) {
  const [l, setL] = useState(null);
  useEffect(() => {
    supabase.from('follows').select('user_id, created_at, profiles(nome, foto_url)').eq('pani_id', p.id).order('created_at', { ascending: false }).then(({ data }) => setL(data || []));
  }, [p.id]);
  if (!l) return <Spinner />;
  return (
    <div className="p-4">
      <p className="text-sm font-semibold mb-2">{l.length} {l.length === 1 ? 'seguidor' : 'seguidores'}</p>
      {l.length === 0 && <Vazio t="Quando alguém seguir sua pani, aparece aqui." />}
      {l.map((s) => (
        <div key={s.user_id} className="flex items-center gap-3 py-2">
          <Av src={s.profiles?.foto_url} emoji={(s.profiles?.nome || '?')[0]} size={40} />
          <span className="flex-1 text-sm font-semibold">{s.profiles?.nome}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Ajustes: dados, horários, localização, avisos, comentários ---------- */
function Horarios({ value, onChange }) {
  const h = getHorarios({ horarios: value });
  const set = (i, k, v) => onChange({ ...h, [i]: { ...h[i], [k]: v } });
  return (
    <div className="flex flex-col gap-2">
      {DIAS.map((d, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-2 w-28 shrink-0"><input type="checkbox" checked={h[i].aberto} onChange={(e) => set(i, 'aberto', e.target.checked)} />{d}</label>
          {h[i].aberto
            ? <><input type="time" aria-label={`${d} abre`} className={`${inp} !w-auto`} value={h[i].ini} onChange={(e) => set(i, 'ini', e.target.value)} />às
                <input type="time" aria-label={`${d} fecha`} className={`${inp} !w-auto`} value={h[i].fim} onChange={(e) => set(i, 'fim', e.target.value)} /></>
            : <span className="text-stone-400">Fechado</span>}
        </div>
      ))}
    </div>
  );
}

function AvisoAdm({ p }) {
  const say = useToast();
  const [av, setAv] = useState('');
  const [avisos, setAvisos] = useState([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from('avisos').select('*').eq('pani_id', p.id).order('created_at', { ascending: false }).limit(10);
    setAvisos(data || []);
  }, [p.id]);
  useEffect(() => { load(); }, [load]);
  const enviar = async () => {
    if (!av.trim()) return;
    const { error } = await supabase.from('avisos').insert({ pani_id: p.id, txt: av.trim(), ativo: false });
    if (error) return say('Não foi possível enviar.');
    setAv(''); load(); say('Aviso enviado. O administrador escolhe se aparece para os clientes.');
  };
  return (
    <div className="border border-stone-200 rounded-xl p-3 flex flex-col gap-2">
      <div className="font-semibold text-sm">Aviso para os clientes</div>
      <input className={inp} placeholder="Ex.: Hoje fechamos às 15h" value={av} onChange={(e) => setAv(e.target.value)} />
      <button onClick={enviar} className={btn}>Enviar para aprovação</button>
      {avisos.map((a) => <div key={a.id} className="flex justify-between gap-2 text-xs"><span>{a.txt}</span><span className={a.ativo ? 'text-green-600 font-semibold shrink-0' : 'text-stone-400 shrink-0'}>{a.ativo ? 'No ar' : 'Aguardando'}</span></div>)}
    </div>
  );
}

function Coment({ c, nome, reload }) {
  const say = useToast();
  const [r, setR] = useState('');
  const responder = async () => {
    if (!r.trim()) return;
    const { error } = await supabase.rpc('responder', { c_id: c.id, texto: r.trim() });
    if (error) return say('Não foi possível responder.');
    setR(''); reload();
  };
  return (
    <div className="py-2 text-sm">
      <div className="flex items-center gap-2"><b>{c.autor}</b><span className="text-xs text-stone-500">{'★'.repeat(c.nota)}</span></div>{c.txt}
      {c.resp
        ? <div className="ml-3 mt-1 pl-2 border-l-2 border-red-600 text-xs text-stone-600">Você respondeu: {c.resp}</div>
        : <div className="flex gap-2 mt-1"><input className={inp} placeholder="Responder" value={r} onChange={(e) => setR(e.target.value)} /><button onClick={responder} className={btn} aria-label="Enviar"><Send size={16} /></button></div>}
    </div>
  );
}

function Ajustes({ p, reload }) {
  const { signOut } = useAuth();
  const say = useToast();
  const [f, setF] = useState({ nome: p.nome, bio: p.bio, endereco: p.endereco, slug: p.slug, horarios: getHorarios(p) });
  const [com, setCom] = useState([]);
  const [busy, setBusy] = useState(false);
  const loadCom = useCallback(async () => {
    const { data } = await supabase.from('comentarios').select('*').eq('pani_id', p.id).order('created_at', { ascending: false });
    setCom(data || []);
  }, [p.id]);
  useEffect(() => { loadCom(); }, [loadCom]);

  const patch = async (dados, ok) => {
    const { error } = await supabase.from('panis').update(dados).eq('id', p.id);
    if (error) return say(error.code === '23505' ? 'Esse link já está em uso. Escolha outro.' : 'Não foi possível salvar.'), false;
    await reload(); if (ok) say(ok); return true;
  };
  const salvar = async () => {
    const slug = slugify(f.slug);
    if (!f.nome.trim() || !slug) return say('Informe o nome e o link do cardápio.');
    setBusy(true); await patch({ nome: f.nome.trim(), bio: f.bio, endereco: f.endereco, slug, horarios: f.horarios }, 'Alterações salvas'); setBusy(false);
  };
  const gps = () => {
    if (!navigator.geolocation) return say('Este aparelho não permite capturar a localização.');
    navigator.geolocation.getCurrentPosition(
      (pos) => patch({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 'Localização salva'),
      () => say('Não foi possível capturar. Permita o acesso à localização.'));
  };

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-4"><Av src={p.foto_url} emoji={p.emoji} size={72} /><FotoBtn img={null} onUrl={(u) => patch({ foto_url: u }, 'Foto atualizada')} /></div>
      <input className={inp} placeholder="Nome da pani" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
      <textarea className={inp} rows={2} placeholder="Bio da pani" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
      <input className={inp} placeholder="Endereço" value={f.endereco} onChange={(e) => setF({ ...f, endereco: e.target.value })} />
      <label className="text-xs font-semibold">Link do cardápio
        <div className="flex items-center gap-1 mt-1 font-normal text-stone-500"><span className="text-sm">/c/</span><input className={inp} value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} /></div>
      </label>
      <button onClick={gps} className={`${btn2} flex items-center justify-center gap-2`}><MapPin size={16} />{p.lat ? 'Atualizar localização' : 'Capturar localização'}</button>
      {p.lat && <p className="text-xs text-stone-500 flex items-center gap-1"><Check size={12} />Localização salva</p>}

      <div className="font-semibold text-sm mt-2">Horário de funcionamento</div>
      <Horarios value={f.horarios} onChange={(horarios) => setF({ ...f, horarios })} />
      <button onClick={salvar} disabled={busy} className={btn}>{busy ? 'Salvando…' : 'Salvar alterações'}</button>

      <div className="mt-2"><AvisoAdm p={p} /></div>

      <div className="font-semibold text-sm mt-2">Comentários ({com.length})</div>
      {com.length === 0 && <Vazio t="Ainda não há comentários." />}
      {com.map((c) => <Coment key={c.id} c={c} nome={p.nome} reload={loadCom} />)}
      <button onClick={signOut} className={`${btn2} flex items-center justify-center gap-2 mt-2`}><LogOut size={16} />Sair</button>
    </div>
  );
}

/* ---------- App da panificadora ---------- */
export default function PaniApp() {
  const { user } = useAuth();
  const say = useToast();
  const [p, setP] = useState(undefined);
  const [tab, setTab] = useState('painel');
  const [pedidos, setPedidos] = useState([]);
  const [menu, setMenu] = useState([]);

  const reload = useCallback(async () => {
    const { data } = await supabase.from('panis').select('*').eq('owner', user.id).maybeSingle();
    setP(data);
  }, [user.id]);
  useEffect(() => { reload(); }, [reload]);

  const pid = p?.id;
  const loadPedidos = useCallback(async () => {
    if (!pid) return;
    const { data } = await supabase.from('pedidos').select('*').eq('pani_id', pid).in('status', ['novo', 'preparando', 'pronto']).order('created_at');
    setPedidos(data || []);
  }, [pid]);

  useEffect(() => {
    if (!pid) return;
    loadPedidos();
    const ch = supabase.channel(`pedidos-${pid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `pani_id=eq.${pid}` }, (ev) => {
        if (ev.eventType === 'INSERT') { say(`🔔 Novo pedido — mesa ${ev.new.mesa}`); navigator.vibrate?.(200); }
        loadPedidos();
      }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [pid, say, loadPedidos]);

  // cardápio real (itens ativos), atualizado toda vez que a aba Pedidos é aberta
  useEffect(() => {
    if (!pid || tab !== 'pedidos') return;
    supabase.from('cardapio_itens').select('*').eq('pani_id', pid).eq('ativo', true).order('tipo').order('nome').then(({ data }) => setMenu(data || []));
  }, [pid, tab]);

  if (p === undefined) return <Shell top={<Logo />} nav={null}><Spinner /></Shell>;
  if (p === null) return <Shell top={<Logo />} nav={null}><Vazio t="Não encontramos sua panificadora. Fale com o suporte." /></Shell>;

  const T = [['painel', 'Painel', Home], ['pedidos', 'Pedidos', ClipboardList], ['cardapio', 'Cardápio', UtensilsCrossed], ['receitas', 'Receitas', BookOpen], ['clientes', 'Clientes', Users], ['chat', 'Chat', MessagesSquare], ['ajustes', 'Ajustes', Settings]];
  return (
    <Shell top={<><Logo /><span className="text-xs text-stone-500 truncate">{p.nome}</span></>}
      nav={T.map(([k, l, I]) => <NavBtn key={k} icon={I} label={l} on={tab === k} click={() => setTab(k)} badge={k === 'pedidos' ? pedidos.filter((o) => o.status === 'novo').length : 0} />)}>
      {tab === 'painel' && <Painel p={p} reload={reload} />}
      {tab === 'pedidos' && <Pedidos lista={pedidos} recarregar={loadPedidos} menu={menu} pid={pid} />}
      {tab === 'cardapio' && <CardapioAdm p={p} />}
      {tab === 'receitas' && <Receitas p={p} />}
      {tab === 'clientes' && <Clientes p={p} />}
      {tab === 'chat' && <Chat paniId={p.id} de="pani" />}
      {tab === 'ajustes' && <Ajustes p={p} reload={reload} />}
    </Shell>
  );
}