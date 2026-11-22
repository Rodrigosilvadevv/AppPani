import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bike, BookOpen, Check, ChevronLeft, ClipboardList, Copy, Eye, EyeOff, Flame, Home, LogOut, MapPin,
  MessagesSquare, Minus, Navigation, Phone, Plus, QrCode, Send, Settings, Share2, ShoppingBag, Trash2,
  UtensilsCrossed, Users, Volume2, VolumeX, Wallet, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { AlertaPedidos, AtivarAlertas } from '../components/AlertaPedidos';
import {
  Av, Chip, FotoBtn, LinhaPush, Logo, NavBtn, Pic, Segmento, Selo, Sheet, Shell, SkeletonFeed, Spinner,
  Switch, Vazio, btn, btn2, card, inp, useConfirm, useToast,
} from '../ui';
import {
  DIAS, VALIDADE_H, foneFmt, fresco, getHorarios, idade, inicioDoDia, limpaInstagram, linhaTotal, linkMapa,
  linkWhatsapp, money, pn, precoFmt, qtdFmt, slugify, soDigitos, tempo,
} from '../lib/util';
import { ABERTOS, PAGAMENTOS, PROXIMO, STATUS, avisarStatus, codigo } from '../lib/pedidos';
import { abrirLink, compartilhar, compartilharImagem, copiarTexto, haptic, pegarLocalizacao } from '../lib/native';
import { Capa, IconeInstagram, IconeWhatsapp } from '../components/perfil';
import { useRevalidar } from '../lib/hooks';
import { validarTexto } from '../lib/moderacao';
import { APP_URL, APP_VERSAO, SUPORTE_EMAIL } from '../config';
import { BotaoComentar, BotaoCurtir, MenuItem, SheetComentarios, useContagemComentarios, useCurtidas } from '../components/social';
import Chat from './Chat';

/* ---------- auxiliares ---------- */
const fmt = (v) => Number(v || 0).toFixed(2).replace('.', ',');         // 12.5 -> "12,50"
const key = (s) => String(s).trim().toLowerCase();

const CATS = { pao: ['🥖', 'Pão'], salgado: ['🥟', 'Salgado'], doce: ['🍰', 'Doce'] };
const EX = { pao: 'Pão francês', salgado: 'Coxinha', doce: 'Brigadeiro' };

/* =========================================================================
 * PAINEL — avisar fornada, publicar e ver o próprio feed
 * ========================================================================= */
function Resumo({ paniId, seguidores }) {
  const [d, setD] = useState(null);
  const carregar = useCallback(async () => {
    const desde = inicioDoDia();
    const [f, o] = await Promise.all([
      supabase.from('fornadas').select('id', { count: 'exact', head: true }).eq('pani_id', paniId).gte('created_at', desde),
      supabase.from('pedidos').select('total, status').eq('pani_id', paniId).gte('created_at', desde),
    ]);
    const pedidos = o.data || [];
    setD({
      fornadas: f.count || 0,
      pedidos: pedidos.length,
      faturamento: pedidos.filter((x) => x.status === 'entregue').reduce((a, x) => a + Number(x.total || 0), 0),
    });
  }, [paniId]);
  useEffect(() => { carregar(); }, [carregar]);
  useRevalidar(carregar, 60000);

  const itens = [
    ['Fornadas hoje', d ? d.fornadas : '–'],
    ['Pedidos hoje', d ? d.pedidos : '–'],
    ['Caixa de hoje', d ? money(d.faturamento) : '–'],
    ['Seguidores', seguidores ?? '–'],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 p-3 border-b border-stone-200">
      {itens.map(([l, v]) => (
        <div key={l} className="rounded-xl bg-stone-50 border border-stone-200 px-3 py-2">
          <div className="text-[11px] text-stone-500">{l}</div>
          <div className="font-bold text-sm">{v}</div>
        </div>
      ))}
    </div>
  );
}

function ItemFeed({ it, p, apagar, curtidas, nComentarios, abrirComentarios }) {
  const [e, l] = CATS[it.cat] || CATS.pao;
  const f = it.tipo === 'fornada';
  return (
    <article className="px-3 pb-3 mb-1 border-b border-stone-100">
      <div className="flex items-center gap-2 py-2">
        <Av src={p.foto_url} emoji={p.emoji} size={32} />
        <span className="text-sm font-semibold truncate">{p.nome}</span>
        <span className="text-xs text-stone-400 flex-1">{tempo(it.created_at)}</span>
        {it.feed === false && <span className="text-[10px] text-stone-400 border border-stone-200 rounded-full px-1.5 py-0.5">só aviso</span>}
        <MenuItem item={it} pani={p} apagar={apagar} />
      </div>
      <div className="relative rounded-2xl overflow-hidden border border-stone-200 shadow-sm">
        <Pic src={it.img_url} emoji={f ? e : p.emoji} cls="aspect-square" alt={f ? `Fornada de ${l}` : it.txt || ''} />
        {f && fresco(it.created_at, it.cat) && <div className="absolute top-3 left-3"><Selo txt={it.cat === 'doce' ? 'Fresco' : 'Fresquinho'} /></div>}
      </div>
      <div className="flex items-center gap-4 pt-1.5">
        <BotaoCurtir on={curtidas.curtiu(it)} total={curtidas.total(it)} onClick={() => curtidas.curtir(it)} />
        <BotaoComentar total={nComentarios(it)} onClick={() => abrirComentarios(it)} />
      </div>
      <div className="pt-1 text-sm">{f ? <b>{e} Fornada de {l.toLowerCase()} saindo agora!</b> : it.txt}</div>
      {f && it.itens?.length > 0 && <div className="text-sm text-stone-600">{it.itens.join(' · ')}</div>}
    </article>
  );
}

function Painel({ p, reload }) {
  const say = useToast();
  const confirmar = useConfirm();
  const [cat, setCat] = useState('pao');
  const [listas, setListas] = useState({ pao: [], salgado: [], doce: [] });       // itens escolhidos por categoria
  const [feedOn, setFeedOn] = useState({ pao: false, salgado: true, doce: true }); // pão: por padrão só notificação
  const [img, setImg] = useState(null);
  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState('');
  const [un, setUn] = useState(null);       // 'un' | 'kg' | null
  const [faltando, setFaltando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bal, setBal] = useState([]);
  const [feed, setFeed] = useState(null);
  const [pub, setPub] = useState(false);
  const [txt, setTxt] = useState('');
  const [pimg, setPimg] = useState(null);
  const [coment, setComent] = useState(null);
  const [recarga, setRecarga] = useState(0);
  const delivery = Boolean(p.delivery);

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
  useRevalidar(loadFeed);

  const vis = useMemo(() => (feed || []).filter((x) => x.tipo !== 'fornada' || x.feed !== false), [feed]);
  const curtidas = useCurtidas(vis);
  const nComentarios = useContagemComentarios(vis, recarga);

  const nomeCat = CATS[cat][1].toLowerCase();
  const lista = listas[cat];
  const setLista = (fn) => setListas((s) => ({ ...s, [cat]: fn(s[cat]) }));
  const ult = feed?.find((x) => x.tipo === 'fornada' && x.cat === cat);

  // falta preço ou unidade? (no modo delivery é obrigatório; fora dele, opcional)
  const incompleto = (i) => !i.unidade || !(pn(i.preco) > 0);

  // chips: itens já cadastrados nesta categoria + os digitados agora
  const dispo = bal.filter((i) => i.cat === cat)
    .map((i) => ({ nome: i.nome, preco: i.preco != null ? fmt(i.preco) : '', unidade: i.unidade || null, off: !i.ativo }));
  const chips = [...dispo, ...lista.filter((i) => !dispo.some((d) => key(d.nome) === key(i.nome)))];
  const toggle = (c) => {
    haptic();
    setLista((l) => (l.some((x) => key(x.nome) === key(c.nome))
      ? l.filter((x) => key(x.nome) !== key(c.nome))
      : [...l, { nome: c.nome, preco: c.preco, unidade: c.unidade }]));
  };
  const editar = (nomeItem, campo, v) => setLista((l) => l.map((x) => (key(x.nome) === key(nomeItem) ? { ...x, [campo]: v } : x)));
  const tirar = (nomeItem) => setLista((l) => l.filter((x) => key(x.nome) !== key(nomeItem)));

  const addDigitado = () => {
    const erro = validarTexto(nome, { max: 60 });
    if (erro) return say(erro, 'erro');
    if (String(preco).trim() && !(pn(preco) > 0)) return say('Preço inválido.', 'erro');
    if (delivery && (!un || !(pn(preco) > 0))) {
      setFaltando(true);
      return say('Com o delivery ligado, informe o preço e escolha se é por unidade ou por kg.', 'erro');
    }
    setLista((l) => [...l.filter((x) => key(x.nome) !== key(nome)), { nome: nome.trim(), preco, unidade: un }]);
    setNome(''); setPreco(''); setUn(null); setFaltando(false);
  };

  // os itens do aviso entram (ou voltam a ficar ativos) no cardápio, como balcão
  const paraCardapio = async (itens) => {
    const foto = itens.length === 1 && feedOn[cat] ? img : null;
    const res = await Promise.all(itens.map(async (it) => {
      const ja = bal.find((i) => key(i.nome) === key(it.nome));
      const pr = String(it.preco ?? '').trim() ? pn(it.preco) : null;
      const dados = { cat, ativo: true, ...(foto && { img_url: foto }), ...(pr != null && { preco: pr }), ...(it.unidade && { unidade: it.unidade }) };
      const { error } = ja
        ? await supabase.from('cardapio_itens').update(dados).eq('id', ja.id)
        : await supabase.from('cardapio_itens').insert({ pani_id: p.id, tipo: 'balcao', nome: it.nome, descricao: '', ...dados, preco: pr, img_url: foto, unidade: it.unidade || null });
      return !error;
    }));
    await loadBal();
    return res.filter(Boolean).length;
  };

  const avisar = async () => {
    const pend = nome.trim() ? [{ nome: nome.trim(), preco, unidade: un }] : []; // o que está digitado também entra
    const itens = [...lista.filter((i) => !pend.some((x) => key(x.nome) === key(i.nome))), ...pend];
    if (delivery) {
      const sem = itens.filter(incompleto);
      if (sem.length) {
        setFaltando(true);
        return say(`Com o delivery ligado, falta preço ou unidade (un/kg) em: ${sem.map((i) => i.nome).join(', ')}.`, 'erro');
      }
    }
    if (p.visivel === false && !(await confirmar('Sua pani está oculta: ninguém vai receber este aviso. Quer avisar mesmo assim?', { titulo: 'Pani oculta', ok: 'Avisar', perigo: false }))) return;
    if (ult && idade(ult.created_at) < 0.17
      && !(await confirmar(`Você avisou ${nomeCat} há poucos minutos. Avisar de novo?`, { titulo: 'Avisar de novo?', ok: 'Avisar', perigo: false }))) return;

    setBusy(true);
    const { data, error } = await supabase.from('fornadas').insert({
      pani_id: p.id, cat, feed: feedOn[cat], img_url: feedOn[cat] ? img : null, itens: itens.map((i) => i.nome),
    }).select('id').single();
    if (error) { setBusy(false); return say('Não foi possível enviar o aviso.', 'erro'); }

    const salvos = itens.length ? await paraCardapio(itens) : 0;
    const r = await supabase.functions.invoke('send-push', { body: { fornada_id: data.id } });
    setListas((s) => ({ ...s, [cat]: [] })); setNome(''); setPreco(''); setUn(null); setImg(null); setFaltando(false);
    await Promise.all([reload(), loadFeed()]);
    setBusy(false);
    haptic('sucesso');
    say(r.error
      ? (feedOn[cat] ? 'Aviso publicado no app (a notificação não saiu agora).' : 'A notificação não saiu agora. Tente de novo.')
      : `${CATS[cat][0]} Aviso enviado para ${r.data?.enviados ?? 0} aparelho(s)${salvos ? ` · ${salvos} no cardápio${delivery ? ' e no delivery' : ''}` : ''}`,
      r.error ? 'erro' : 'info');
  };

  const postar = async () => {
    const erro = validarTexto(txt, { max: 500, obrigatorio: !pimg });
    if (erro) return say(erro, 'erro');
    const { error } = await supabase.from('posts').insert({ pani_id: p.id, txt: txt.trim(), img_url: pimg });
    if (error) return say('Não foi possível publicar.', 'erro');
    setTxt(''); setPimg(null); setPub(false); loadFeed(); haptic('sucesso'); say('Publicado no feed');
  };

  const apagar = async (it) => {
    const { error } = await supabase.from(it.tipo === 'fornada' ? 'fornadas' : 'posts').delete().eq('id', it.id);
    if (error) return say('Não foi possível apagar.', 'erro');
    loadFeed();
  };

  return (
    <div>
      {p.visivel === false && (
        <div className="m-3 mb-0 rounded-xl bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs">
          Sua pani está oculta: os clientes não veem seus avisos nem posts. Para mostrar, vá em Ajustes.
        </div>
      )}
      <Resumo paniId={p.id} seguidores={p.seguidores} />

      <div className="p-3 border-b border-stone-200 flex flex-col gap-2">
        <div className="flex gap-2">
          {Object.entries(CATS).map(([k, [e, l]]) => (
            <button key={k} onClick={() => { haptic(); setCat(k); }}
              className={`flex-1 rounded-lg py-2 text-sm border ${cat === k ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300'}`}>
              {e} {l}{listas[k].length > 0 && ` (${listas[k].length})`}
            </button>
          ))}
        </div>

        {delivery && (
          <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-900">
            <Bike size={14} className="shrink-0 mt-0.5" />
            <span><b>Delivery ligado:</b> preço e unidade (por unidade ou por kg) são obrigatórios. Os itens avisados aqui aparecem para pedido no delivery.</span>
          </div>
        )}

        <input className={inp} maxLength={60} placeholder={`Item de ${nomeCat} (ex.: ${EX[cat]})`} value={nome}
          onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDigitado()} />
        <div className="flex gap-2">
          <input className={`${inp} flex-1 ${faltando && delivery && nome && !(pn(preco) > 0) ? '!border-red-500' : ''}`} inputMode="decimal"
            placeholder={un === 'kg' ? 'Preço do kg' : un === 'un' ? 'Preço da unidade' : `Preço${delivery ? ' *' : ' (opcional)'}`}
            value={preco} onChange={(e) => setPreco(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDigitado()} aria-label="Preço" />
          <Segmento valor={un} mudar={setUn} opcoes={[['un', 'Unid.'], ['kg', 'Kg']]} erro={faltando && delivery && Boolean(nome) && !un} />
          <button onClick={addDigitado} aria-label="Adicionar item" className={btn2}><Plus size={16} /></button>
        </div>
        {!delivery && <p className="text-[11px] text-stone-400 -mt-1">Preço e unidade são opcionais. Ficam obrigatórios quando você liga o delivery em Ajustes.</p>}

        {chips.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {chips.map((c) => {
              const s = lista.find((x) => key(x.nome) === key(c.nome));
              const pr = (s || c).preco;
              return (
                <Chip key={c.nome} on={Boolean(s)} onClick={() => toggle(c)} className={c.off && !s ? 'opacity-50' : ''}>
                  {s ? '✓ ' : ''}{c.nome}{pr ? ` · ${precoFmt(pn(pr), (s || c).unidade)}` : ''}
                </Chip>
              );
            })}
          </div>
        )}

        {lista.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-xl border border-stone-200 p-2">
            <div className="text-[11px] font-semibold text-stone-500 px-1">Neste aviso ({lista.length})</div>
            {lista.map((i) => {
              const ruim = delivery && faltando && incompleto(i);
              return (
                <div key={i.nome} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0 truncate">{i.nome}</span>
                  <input className={`${inp} !w-20 !py-1.5 text-right ${ruim && !(pn(i.preco) > 0) ? '!border-red-500' : ''}`} inputMode="decimal" placeholder="Preço"
                    aria-label={`Preço de ${i.nome}`} value={i.preco ?? ''} onChange={(e) => editar(i.nome, 'preco', e.target.value)} />
                  <Segmento valor={i.unidade} mudar={(v) => editar(i.nome, 'unidade', v)} opcoes={[['un', 'Un'], ['kg', 'Kg']]} erro={ruim && !i.unidade} />
                  <button onClick={() => tirar(i.nome)} aria-label={`Tirar ${i.nome}`} className="p-1.5 text-stone-400"><X size={16} /></button>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-stone-500">Adicione quantos itens quiser. Eles entram no cardápio e o aviso vai para todos que pediram aviso de {nomeCat}.</p>

        {feedOn[cat] && <FotoBtn img={img} onUrl={setImg} label="Foto da fornada (opcional)" />}
        <div className="flex items-center gap-3 text-sm">
          <div className="flex-1">
            <b>Publicar no feed</b>
            <div className="text-xs text-stone-500">{feedOn[cat] ? 'Aparece no feed dos clientes.' : 'Só envia a notificação, sem post.'}</div>
          </div>
          <Switch on={feedOn[cat]} set={(v) => setFeedOn((s) => ({ ...s, [cat]: v }))} label="Publicar no feed" />
        </div>

        <button onClick={avisar} disabled={busy}
          className="bg-red-600 text-white rounded-xl py-4 font-bold flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-60">
          <Flame size={20} />{busy ? 'Enviando…' : `Avisar fornada de ${nomeCat}`}
        </button>
        {feed && (
          <p className="text-xs text-stone-500">
            {ult ? `Último aviso de ${nomeCat}: ${tempo(ult.created_at)}${ult.feed === false ? ' (só notificação)' : ''}` : `Você ainda não avisou nenhuma fornada de ${nomeCat}.`}
            {' '}O selo “fresquinho” dura {VALIDADE_H[cat] >= 48 ? `${VALIDADE_H[cat] / 24} dias` : `${VALIDADE_H[cat]} h`}.
          </p>
        )}
      </div>

      <div className="px-3 py-2 border-b border-stone-200">
        {!pub
          ? <button onClick={() => setPub(true)} className={`${btn2} w-full flex items-center justify-center gap-2`}><Plus size={16} />Nova publicação</button>
          : (
            <div className="flex flex-col gap-2">
              <FotoBtn img={pimg} onUrl={setPimg} />
              <input className={inp} maxLength={500} placeholder="Legenda" value={txt} onChange={(e) => setTxt(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => { setPub(false); setTxt(''); setPimg(null); }} className={`flex-1 ${btn2}`}>Cancelar</button>
                <button onClick={postar} className={`flex-1 ${btn}`}>Publicar</button>
              </div>
            </div>
          )}
      </div>

      <div className="pt-2">
        {feed == null ? <SkeletonFeed />
          : vis.length === 0 ? <Vazio t="Seu feed está vazio. Avise a primeira fornada ou faça uma publicação." />
          : vis.map((it) => (
            <ItemFeed key={it.tipo + it.id} it={it} p={p} apagar={apagar}
              curtidas={curtidas} nComentarios={nComentarios} abrirComentarios={setComent} />
          ))}
      </div>

      {coment && <SheetComentarios item={coment} pani={p} fechar={() => setComent(null)} aoMudar={() => setRecarga((n) => n + 1)} />}
    </div>
  );
}

/* =========================================================================
 * PEDIDOS — mesa: recebido → preparando → pronto → finalizado
 *           delivery: recebido → preparando → saiu para entrega → entregue
 * ========================================================================= */
const precoDe = (i, menu) => i.preco ?? menu.find((m) => (i.id && m.id === i.id) || m.nome === i.nome)?.preco ?? 0;
const soma = (l) => l.reduce((a, i) => a + pn(i.preco) * i.qtd, 0);
const totalLinha = (i, menu) => (i.total != null ? Number(i.total) : linhaTotal({ ...i, preco: pn(precoDe(i, menu)) }));

function Editor({ ini, menu, novo, onSave, onCancel }) {
  const say = useToast();
  const [mesa, setMesa] = useState(ini.mesa ?? '');
  const [itens, setItens] = useState(() => (ini.itens || []).map((i) => ({ ...i, preco: fmt(precoDe(i, menu)) })));
  const [total, setTotal] = useState(fmt(ini.total));
  const [manual, setManual] = useState(false); // o dono digitou o total: não sobrescreve

  const troca = (l) => { setItens(l); if (!manual) setTotal(fmt(soma(l))); };
  const add = (m) => {
    const k = itens.findIndex((i) => (i.id && i.id === m.id) || i.nome === m.nome);
    troca(k >= 0 ? itens.map((i, x) => (x === k ? { ...i, qtd: i.qtd + 1 } : i)) : [...itens, { id: m.id, nome: m.nome, preco: fmt(m.preco), qtd: 1, unidade: 'un' }]);
  };
  const mais = (k, d) => troca(itens.map((i, x) => (x === k ? { ...i, qtd: i.qtd + d } : i)).filter((i) => i.qtd > 0));
  const setPreco = (k, v) => troca(itens.map((i, x) => (x === k ? { ...i, preco: v } : i)));
  const salvar = () => {
    if (novo && !String(mesa).trim()) return say('Informe a mesa.', 'erro');
    if (!itens.length) return say('Adicione pelo menos um item.', 'erro');
    onSave({
      ...(novo && { mesa: String(mesa).trim() }),
      itens: itens.map((i) => ({ ...i, unidade: 'un', preco: pn(i.preco), total: Math.round(pn(i.preco) * i.qtd * 100) / 100 })),
      total: pn(total),
    });
  };

  return (
    <div className="mt-2 border border-stone-200 bg-stone-50 rounded-xl p-2 flex flex-col gap-2">
      {novo && <input className={inp} maxLength={20} placeholder="Mesa" value={mesa} onChange={(e) => setMesa(e.target.value)} />}
      {itens.map((i, k) => (
        <div key={k} className="flex items-center gap-2 text-sm">
          <span className="flex-1 min-w-0 truncate">{i.nome}</span>
          <button onClick={() => mais(k, -1)} aria-label={`Menos ${i.nome}`} className="p-1"><Minus size={16} /></button>
          <b className="w-5 text-center">{i.qtd}</b>
          <button onClick={() => mais(k, 1)} aria-label={`Mais ${i.nome}`} className="p-1"><Plus size={16} /></button>
          <input className={`${inp} !w-20 text-right`} inputMode="decimal" aria-label={`Preço de ${i.nome}`} value={i.preco} onChange={(e) => setPreco(k, e.target.value)} />
        </div>
      ))}
      <div className="text-xs text-stone-500">Cardápio — toque para adicionar:</div>
      {menu.filter((m) => m.tipo !== 'balcao').length === 0
        ? <p className="text-xs text-stone-400">Seu cardápio não tem itens de chapa ou bebida ativos.</p>
        : (
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {menu.filter((m) => m.tipo !== 'balcao').map((m) => <Chip key={m.id} onClick={() => add(m)}>{m.nome}{m.preco != null ? ` · ${money(m.preco)}` : ''}</Chip>)}
          </div>
        )}
      <label className="flex items-center justify-between font-semibold text-sm">Total (R$)
        <input className={`${inp} !w-28 text-right`} inputMode="decimal" value={total}
          onChange={(e) => { setManual(true); setTotal(e.target.value); }} />
      </label>
      <div className="flex gap-2">
        <button onClick={onCancel} className={`flex-1 ${btn2}`}>Cancelar</button>
        <button onClick={salvar} className={`flex-1 ${btn}`}>Salvar</button>
      </div>
    </div>
  );
}

// no delivery os itens vêm calculados pelo servidor; a pani só ajusta o total (ex.: o peso deu diferente)
function AjusteTotal({ o, onSave, onCancel }) {
  const [v, setV] = useState(fmt(o.total));
  return (
    <div className="mt-2 border border-stone-200 bg-stone-50 rounded-xl p-2 flex flex-col gap-2">
      <p className="text-xs text-stone-500">Ajuste o total se o peso na balança deu diferente. Avise o cliente pelo WhatsApp.</p>
      <label className="flex items-center justify-between font-semibold text-sm">Novo total (R$)
        <input className={`${inp} !w-28 text-right`} inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button onClick={onCancel} className={`flex-1 ${btn2}`}>Cancelar</button>
        <button onClick={() => (pn(v) > 0 ? onSave({ total: pn(v) }) : null)} className={`flex-1 ${btn}`}>Salvar</button>
      </div>
    </div>
  );
}

function CartaoPedido({ o, menu, ed, setEd, mudar, salvar, cancelar }) {
  const tipo = o.tipo || 'mesa';
  const prox = PROXIMO[tipo]?.[o.status];
  const st = STATUS[o.status] || { txt: o.status, cor: 'bg-stone-100 text-stone-600' };
  const wa = o.telefone ? linkWhatsapp(o.telefone, `Olá${o.cliente ? `, ${o.cliente}` : ''}! Aqui é da padaria, sobre o seu pedido #${codigo(o.id)}.`) : null;
  const sub = o.subtotal != null ? Number(o.subtotal) : null;

  return (
    <div className={`${card} text-sm ${tipo === 'delivery' ? 'border-blue-200' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <b className="text-base flex items-center gap-1.5">
          {tipo === 'delivery' ? <><Bike size={18} className="text-blue-700" />Delivery <span className="text-stone-400 font-normal text-xs">#{codigo(o.id)}</span></> : `Mesa ${o.mesa}`}
        </b>
        <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${st.cor}`}>{st.txt}</span>
      </div>
      <div className="text-xs text-stone-500">{o.cliente ? `${o.cliente} · ` : ''}{tempo(o.created_at)}</div>

      {tipo === 'delivery' && (
        <div className="mt-2 rounded-lg bg-stone-50 p-2 flex flex-col gap-1.5 text-xs">
          {o.endereco && (
            <button onClick={() => abrirLink(linkMapa(o.endereco))} className="flex items-start gap-1.5 text-left">
              <MapPin size={14} className="shrink-0 mt-0.5 text-red-600" /><span className="flex-1">{o.endereco}</span><Navigation size={13} className="shrink-0 text-stone-400" />
            </button>
          )}
          {o.telefone && (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 flex-1"><Phone size={13} className="text-stone-500" />{foneFmt(o.telefone)}</span>
              {wa && <button onClick={() => abrirLink(wa)} className="flex items-center gap-1 font-semibold text-green-700"><IconeWhatsapp size={14} />WhatsApp</button>}
              <a href={`tel:+${soDigitos(o.telefone).length <= 11 ? '55' : ''}${soDigitos(o.telefone)}`} className="font-semibold text-stone-700">Ligar</a>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Wallet size={13} className="text-stone-500" />
            <span><b>{PAGAMENTOS[o.pagamento] || 'Pagamento na entrega'}</b>{o.pagamento === 'dinheiro' && (o.troco ? ` · troco para ${money(o.troco)} (levar ${money(Number(o.troco) - Number(o.total))})` : ' · sem troco')}</span>
          </div>
        </div>
      )}

      {ed === o.id
        ? (tipo === 'delivery'
          ? <AjusteTotal o={o} onSave={(d) => salvar(o, d)} onCancel={() => setEd(null)} />
          : <Editor ini={o} menu={menu} onSave={(d) => salvar(o, d)} onCancel={() => setEd(null)} />)
        : (
          <>
            <ul className="mt-2">
              {(o.itens || []).map((i, k) => {
                const v = totalLinha(i, menu);
                return (
                  <li key={k} className="flex justify-between gap-2">
                    <span><b>{qtdFmt(i)}</b> {i.nome}{i.unidade === 'kg' && i.preco ? <span className="text-stone-400 text-xs"> ({precoFmt(i.preco, 'kg')})</span> : null}</span>
                    {v > 0 && <span className="text-stone-500 shrink-0">{money(v)}</span>}
                  </li>
                );
              })}
            </ul>
            {o.obs && <p className="mt-1 text-xs bg-yellow-50 rounded px-2 py-1">Obs.: {o.obs}</p>}
            {tipo === 'delivery' && sub != null && (
              <div className="mt-2 border-t border-stone-100 pt-2 text-xs text-stone-500 flex flex-col gap-0.5">
                <div className="flex justify-between"><span>Produtos</span><span>{money(sub)}</span></div>
                <div className="flex justify-between"><span>Entrega</span><span>{Number(o.taxa_entrega) > 0 ? money(o.taxa_entrega) : 'Grátis'}</span></div>
              </div>
            )}
            <div className="flex items-center justify-between mt-2 border-t border-stone-100 pt-2">
              <span className="text-stone-500">Total</span><b className="text-base">{money(o.total)}</b>
            </div>
            {prox && (
              <button onClick={() => mudar([o], prox[0])} className={`${btn} w-full mt-3 ${tipo === 'delivery' && prox[0] === 'saiu' ? '!bg-blue-700' : ''}`}>{prox[1]}</button>
            )}
            <div className="flex gap-2 mt-2">
              <button onClick={() => setEd(o.id)} className={`flex-1 ${btn2}`}>{tipo === 'delivery' ? 'Ajustar total' : 'Alterar valor'}</button>
              {tipo === 'mesa' && o.status !== 'pronto' && <button onClick={() => mudar([o], 'entregue')} className={`flex-1 ${btn2}`}>Finalizar</button>}
              <button onClick={() => cancelar(o)} className={`flex-1 ${btn2}`}>Cancelar</button>
            </div>
          </>
        )}
    </div>
  );
}

function Pedidos({ lista, recarregar, menu, pid, som, setSom, delivery }) {
  const say = useToast();
  const confirmar = useConfirm();
  const [tipo, setTipo] = useState('todos');
  const [f, setF] = useState('todos');
  const [ed, setEd] = useState(null);

  const doTipo = lista.filter((o) => tipo === 'todos' || (o.tipo || 'mesa') === tipo);
  const n = (s) => doTipo.filter((o) => o.status === s).length;
  const L = doTipo.filter((o) => f === 'todos' || o.status === f);
  const nTipo = (t) => lista.filter((o) => (o.tipo || 'mesa') === t).length;
  const temDelivery = delivery || nTipo('delivery') > 0;
  const prontosMesa = lista.filter((o) => (o.tipo || 'mesa') === 'mesa' && o.status === 'pronto');

  const mudar = async (pedidos, status) => {
    const { error } = await supabase.from('pedidos').update({ status }).in('id', pedidos.map((o) => o.id));
    if (error) return say('Não foi possível atualizar o pedido.', 'erro');
    haptic();
    pedidos.forEach((o) => avisarStatus(o)); // o cliente recebe a notificação do novo status
    recarregar();
  };
  const salvar = async (o, d) => {
    const { error } = o
      ? await supabase.from('pedidos').update(d).eq('id', o.id)
      : await supabase.from('pedidos').insert({ pani_id: pid, status: 'novo', tipo: 'mesa', ...d });
    if (error) return say('Não foi possível salvar o pedido.', 'erro');
    setEd(null); recarregar(); say(o ? 'Pedido atualizado' : 'Pedido criado');
  };
  const cancelar = async (o) => {
    const quem = (o.tipo || 'mesa') === 'delivery' ? `de delivery #${codigo(o.id)}` : `da mesa ${o.mesa}`;
    if (!(await confirmar(`O pedido ${quem} será cancelado${o.user_id ? ' e o cliente recebe um aviso' : ''}.`, { titulo: 'Cancelar pedido?', ok: 'Cancelar pedido' }))) return;
    mudar([o], 'cancelado');
  };

  const filtros = [
    ['todos', 'Todos', doTipo.length], ['novo', 'Recebidos', n('novo')], ['preparando', 'Preparando', n('preparando')],
    ...(tipo !== 'delivery' ? [['pronto', 'Prontos', n('pronto')]] : []),
    ...(tipo !== 'mesa' && temDelivery ? [['saiu', 'A caminho', n('saiu')]] : []),
  ];

  return (
    <div className="p-3 flex flex-col gap-3">
      {temDelivery && (
        <div className="flex rounded-xl bg-stone-100 p-1 text-xs font-semibold">
          {[['todos', 'Tudo', lista.length], ['mesa', 'Mesa', nTipo('mesa')], ['delivery', 'Delivery', nTipo('delivery')]].map(([k, l, c]) => (
            <button key={k} onClick={() => { setTipo(k); setF('todos'); }}
              className={`flex-1 rounded-lg py-2 flex items-center justify-center gap-1 ${tipo === k ? 'bg-white shadow-sm' : 'text-stone-500'}`}>
              {k === 'delivery' && <Bike size={14} />}{l} {c > 0 && <span className="text-red-600">{c}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto">
        {filtros.map(([k, l, c]) => <Chip key={k} on={f === k} onClick={() => setF(k)}>{l} {c}</Chip>)}
        <button onClick={() => setSom(!som)} aria-label={som ? 'Desligar som de pedido' : 'Ligar som de pedido'}
          className="ml-auto shrink-0 text-stone-500 p-1.5">{som ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setEd('novo')} className={`flex-1 ${btn2} flex items-center justify-center gap-2`}><Plus size={16} />Pedido de mesa</button>
        {prontosMesa.length > 0 && tipo !== 'delivery' && (
          <button onClick={() => mudar(prontosMesa, 'entregue')}
            className={`flex-1 ${btn} flex items-center justify-center gap-2`}><Check size={16} />Finalizar prontos ({prontosMesa.length})</button>
        )}
      </div>

      {ed === 'novo' && <Editor novo ini={{ itens: [], total: 0 }} menu={menu} onSave={(d) => salvar(null, d)} onCancel={() => setEd(null)} />}
      {!L.length && (
        <Vazio t={tipo === 'delivery'
          ? (delivery ? 'Nenhum delivery em aberto. Os pedidos dos clientes caem aqui na hora, com som.' : 'O delivery está desligado. Ligue em Ajustes para receber pedidos pelo app.')
          : 'Nenhum pedido em aberto. Os pedidos feitos pelo seu link aparecem aqui na hora.'} />
      )}

      {L.map((o) => (
        <CartaoPedido key={o.id} o={o} menu={menu} ed={ed} setEd={setEd} mudar={mudar} salvar={salvar} cancelar={cancelar} />
      ))}
    </div>
  );
}

/* =========================================================================
 * CARDÁPIO (chapa, bebidas e balcão) + QR da mesa
 * ========================================================================= */
const TIPOS = [['chapa', 'Chapa'], ['bebida', 'Bebida'], ['balcao', 'Balcão (só ver)']];

function SheetQr({ link, nome, fechar, titulo = 'QR code da mesa', texto = 'Imprima e deixe nas mesas. O cliente aponta a câmera, vê o cardápio e pede sem chamar ninguém.' }) {
  const say = useToast();
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let vivo = true;
    import('qrcode')
      .then((mod) => {
        const gerar = mod.toDataURL || mod.default?.toDataURL;
        if (!gerar) throw new Error('qrcode indisponível');
        return gerar(link, { width: 720, margin: 2, color: { dark: '#1c1917', light: '#ffffff' } });
      })
      .then((d) => vivo && setUrl(d))
      .catch(() => vivo && setUrl(''));
    return () => { vivo = false; };
  }, [link]);
  return (
    <Sheet aberto fechar={fechar} titulo={titulo}>
      <p className="text-sm text-stone-600">{texto}</p>
      <div className="flex justify-center my-4">
        {url == null ? <Spinner /> : url ? <img src={url} alt={`QR code do cardápio da ${nome}`} className="w-56 h-56 rounded-xl border border-stone-200" />
          : <p className="text-sm text-red-700">Não foi possível gerar o QR agora.</p>}
      </div>
      <p className="text-center text-xs text-stone-500 break-all">{link}</p>
      {url && (
        <button onClick={async () => { const r = await compartilharImagem(url, `qr-${slugify(nome)}.png`); if (r === 'baixado') say('Imagem baixada'); }}
          className={`${btn} w-full mt-3 flex items-center justify-center gap-2`}><Share2 size={16} />Salvar / compartilhar imagem</button>
      )}
    </Sheet>
  );
}

function SheetItem({ it, delivery, fechar, salvo }) {
  const say = useToast();
  const [f, setF] = useState({
    nome: it.nome || '', descricao: it.descricao || '', preco: it.preco != null ? fmt(it.preco) : '',
    tipo: it.tipo, cat: it.cat || null, unidade: it.unidade || null, img: it.img_url || null,
  });
  const [busy, setBusy] = useState(false);
  const balcao = f.tipo === 'balcao';
  const salvar = async () => {
    const erro = validarTexto(f.nome, { max: 60 });
    if (erro) return say(erro, 'erro');
    if (String(f.preco).trim() && !(pn(f.preco) > 0)) return say('Preço inválido.', 'erro');
    if (balcao && delivery && f.cat && (!f.unidade || !(pn(f.preco) > 0))) return say('Com o delivery ligado, informe o preço e se é por unidade ou por kg.', 'erro');
    setBusy(true);
    const { error } = await supabase.from('cardapio_itens').update({
      nome: f.nome.trim(), descricao: f.descricao.trim(), preco: String(f.preco).trim() ? pn(f.preco) : null,
      tipo: f.tipo, cat: balcao ? f.cat : null, unidade: balcao ? f.unidade : null, img_url: f.img,
    }).eq('id', it.id);
    setBusy(false);
    if (error) return say('Não foi possível salvar.', 'erro');
    haptic('sucesso'); say('Item atualizado'); salvo(); fechar();
  };
  return (
    <Sheet aberto fechar={fechar} titulo="Editar item">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          {TIPOS.map(([k, l]) => <Chip key={k} on={f.tipo === k} onClick={() => setF({ ...f, tipo: k })}>{l}</Chip>)}
        </div>
        <input className={inp} maxLength={60} placeholder="Nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <input className={inp} maxLength={160} placeholder="Descrição (opcional)" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        {balcao && (
          <div className="flex gap-2">
            {Object.entries(CATS).map(([k, [e, l]]) => <Chip key={k} on={f.cat === k} onClick={() => setF({ ...f, cat: f.cat === k ? null : k })}>{e} {l}</Chip>)}
          </div>
        )}
        <div className="flex gap-2">
          <input className={`${inp} flex-1`} inputMode="decimal" placeholder={f.unidade === 'kg' ? 'Preço do kg' : 'Preço'} value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value })} />
          {balcao && <Segmento valor={f.unidade} mudar={(v) => setF({ ...f, unidade: v })} opcoes={[['un', 'Unid.'], ['kg', 'Kg']]} />}
        </div>
        {balcao && <p className="text-xs text-stone-500">Para aparecer no delivery: categoria (pão, salgado ou doce), preço e unidade.</p>}
        <FotoBtn img={f.img} onUrl={(img) => setF({ ...f, img })} />
        <button onClick={salvar} disabled={busy} className={btn}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </Sheet>
  );
}

const prontoDelivery = (i) => i.tipo === 'balcao' && i.cat && i.unidade && i.preco != null && i.ativo;

function CardapioAdm({ p }) {
  const say = useToast();
  const confirmar = useConfirm();
  const [itens, setItens] = useState(null);
  const [f, setF] = useState({ tipo: 'chapa', nome: '', descricao: '', preco: '', img: null, cat: null, unidade: null });
  const [qr, setQr] = useState(false);
  const [filtro, setFiltro] = useState('todos');
  const [editando, setEditando] = useState(null);
  const link = `${APP_URL}/c/${p.slug}`;
  const delivery = Boolean(p.delivery);

  const load = useCallback(async () => {
    const { data } = await supabase.from('cardapio_itens').select('*').eq('pani_id', p.id).order('created_at', { ascending: false });
    setItens(data || []);
  }, [p.id]);
  useEffect(() => { load(); }, [load]);

  const copiar = async () => {
    haptic();
    if (await copiarTexto(link)) say('Link do cardápio copiado');
    else say('Não copiou automático — toque no campo do link e copie manualmente.', 'erro');
  };
  const compartilharCardapio = async () => {
    const r = await compartilhar({ title: p.nome, text: `Cardápio da ${p.nome}`, url: link });
    if (r === 'copiado') say('Link do cardápio copiado');
  };
  const add = async () => {
    const erro = validarTexto(f.nome, { max: 60 });
    if (erro) return say(erro, 'erro');
    if (String(f.preco).trim() && !(pn(f.preco) > 0)) return say('Preço inválido.', 'erro');
    const balcao = f.tipo === 'balcao';
    if (balcao && delivery && (!f.cat || !f.unidade || !(pn(f.preco) > 0))) {
      return say('Com o delivery ligado, itens do balcão precisam de categoria, preço e unidade (un ou kg).', 'erro');
    }
    const { error } = await supabase.from('cardapio_itens').insert({
      pani_id: p.id, tipo: f.tipo, nome: f.nome.trim(), descricao: f.descricao.trim(),
      preco: String(f.preco).trim() ? pn(f.preco) : null, img_url: f.img,
      cat: balcao ? f.cat : null, unidade: balcao ? f.unidade : null,
    });
    if (error) return say('Não foi possível adicionar o item.', 'erro');
    setF({ ...f, nome: '', descricao: '', preco: '', img: null }); load(); haptic('sucesso'); say('Item adicionado');
  };
  const alterna = async (it) => { await supabase.from('cardapio_itens').update({ ativo: !it.ativo }).eq('id', it.id); load(); };
  const remove = async (it) => {
    if (!(await confirmar(`"${it.nome}" sai do seu cardápio.`, { titulo: 'Remover item?', ok: 'Remover' }))) return;
    await supabase.from('cardapio_itens').delete().eq('id', it.id); load();
  };

  const L = (itens || []).filter((i) => (filtro === 'todos' || i.tipo === filtro) || (filtro === 'delivery' && prontoDelivery(i)));
  const nDelivery = (itens || []).filter(prontoDelivery).length;
  const pendentes = (itens || []).filter((i) => i.tipo === 'balcao' && i.ativo && !prontoDelivery(i));

  return (
    <div className="p-4">
      <div className={`${card} flex flex-col gap-2 mb-3`}>
        <div className="font-semibold text-sm">Link do seu cardápio</div>
        <div className="flex gap-2">
          <input readOnly className={inp} value={link} onFocus={(e) => e.target.select()} aria-label="Link do cardápio" />
          <button onClick={copiar} aria-label="Copiar link" className={btn2}><Copy size={16} /></button>
          <button onClick={compartilharCardapio} aria-label="Compartilhar link" className={btn2}><Share2 size={16} /></button>
        </div>
        <button onClick={() => setQr(true)} className={`${btn2} flex items-center justify-center gap-2`}><QrCode size={16} />Gerar QR code da mesa</button>
        <p className="text-xs text-stone-500">Pães, salgados e doces avisados no Painel entram aqui sozinhos, em Balcão{delivery ? ', e ficam disponíveis no delivery' : ''}.</p>
      </div>

      {delivery && pendentes.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs">
          <b>{pendentes.length} {pendentes.length === 1 ? 'item do balcão não aparece' : 'itens do balcão não aparecem'} no delivery</b>
          <p className="text-stone-600 mt-0.5">Falta categoria, preço ou unidade (un/kg). Toque para ajustar:</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {pendentes.slice(0, 12).map((i) => <Chip key={i.id} onClick={() => setEditando(i)}>{i.nome}</Chip>)}
          </div>
        </div>
      )}

      <div className={`${card} flex flex-col gap-2`}>
        <div className="flex gap-2">
          {TIPOS.map(([k, l]) => (
            <button key={k} onClick={() => setF({ ...f, tipo: k })}
              className={`flex-1 rounded-lg py-2 text-xs border ${f.tipo === k ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300'}`}>{l}</button>
          ))}
        </div>
        <input className={inp} maxLength={60} placeholder={f.tipo === 'balcao' ? 'Nome (ex.: Pão de queijo)' : 'Nome (ex.: X-Bacon)'} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <input className={inp} maxLength={160} placeholder="Descrição (opcional)" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        {f.tipo === 'balcao' && (
          <div className="flex gap-2">
            {Object.entries(CATS).map(([k, [e, l]]) => <Chip key={k} on={f.cat === k} onClick={() => setF({ ...f, cat: f.cat === k ? null : k })}>{e} {l}</Chip>)}
          </div>
        )}
        <div className="flex gap-2">
          <input className={`${inp} flex-1`} inputMode="decimal" placeholder={f.unidade === 'kg' ? 'Preço do kg' : f.tipo === 'balcao' && delivery ? 'Preço *' : 'Preço'} value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value })} />
          {f.tipo === 'balcao' && <Segmento valor={f.unidade} mudar={(v) => setF({ ...f, unidade: v })} opcoes={[['un', 'Unid.'], ['kg', 'Kg']]} />}
        </div>
        <FotoBtn img={f.img} onUrl={(img) => setF({ ...f, img })} />
        <p className="text-xs text-stone-500">
          {f.tipo === 'balcao'
            ? (delivery ? 'Itens do balcão com categoria, preço e unidade podem ser pedidos no delivery (na mesa, só aparecem para ver).' : 'Itens do balcão aparecem no cardápio, mas não podem ser pedidos pela mesa.')
            : 'O cliente na mesa pode pedir este item pelo link do cardápio.'}
        </p>
        <button onClick={add} className={`${btn} flex items-center justify-center gap-2`}><Plus size={16} />Adicionar ao cardápio</button>
      </div>

      {itens == null ? <Spinner /> : itens.length === 0 ? <Vazio t="Seu cardápio está vazio. Adicione o primeiro item." /> : (
        <>
          <div className="flex gap-2 overflow-x-auto mt-4 mb-1">
            <Chip on={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos {itens.length}</Chip>
            {TIPOS.map(([k, l]) => <Chip key={k} on={filtro === k} onClick={() => setFiltro(k)}>{l} {itens.filter((i) => i.tipo === k).length}</Chip>)}
            {delivery && <Chip on={filtro === 'delivery'} onClick={() => setFiltro('delivery')}>🛵 No delivery {nDelivery}</Chip>}
          </div>
          <div>
            {L.map((it) => (
              <div key={it.id} className={`flex items-center gap-3 py-2 border-b border-stone-100 ${it.ativo ? '' : 'opacity-50'}`}>
                <button onClick={() => setEditando(it)} className="flex items-center gap-3 flex-1 min-w-0 text-left" aria-label={`Editar ${it.nome}`}>
                  <Pic src={it.img_url} emoji={it.tipo === 'bebida' ? '🥤' : it.tipo === 'chapa' ? '🍔' : CATS[it.cat]?.[0] || '🥖'} cls="!w-14 h-14 rounded-lg shrink-0" />
                  <span className="flex-1 min-w-0 text-sm">
                    <span className="block font-semibold truncate">{it.nome}</span>
                    <span className="block text-xs text-stone-500">
                      {TIPOS.find((t) => t[0] === it.tipo)?.[1] || it.tipo}{it.preco != null ? ` · ${precoFmt(it.preco, it.unidade)}` : ''}
                      {delivery && prontoDelivery(it) && <span className="text-blue-700"> · 🛵 delivery</span>}
                    </span>
                  </span>
                </button>
                <button onClick={() => alterna(it)} className={btn2}>{it.ativo ? 'Pausar' : 'Ativar'}</button>
                <button onClick={() => remove(it)} aria-label={`Remover ${it.nome}`} className="p-2 text-stone-400"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </>
      )}

      {qr && <SheetQr link={link} nome={p.nome} fechar={() => setQr(false)} />}
      {editando && <SheetItem it={editando} delivery={delivery} fechar={() => setEditando(null)} salvo={load} />}
    </div>
  );
}

/* =========================================================================
 * RECEITAS — caderno da casa (fica só com a pani)
 * ========================================================================= */
function Receitas({ p }) {
  const say = useToast();
  const confirmar = useConfirm();
  const [lista, setLista] = useState(null);
  const [f, setF] = useState({ titulo: '', ingredientes: '', modo: '' });
  const [abrir, setAbrir] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('receitas').select('*').eq('pani_id', p.id).order('created_at', { ascending: false });
    setLista(data || []);
  }, [p.id]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const erro = validarTexto(f.titulo, { max: 80 });
    if (erro) return say(erro, 'erro');
    const { error } = await supabase.from('receitas').insert({ pani_id: p.id, ...f, titulo: f.titulo.trim() });
    if (error) return say('Não foi possível salvar.', 'erro');
    setF({ titulo: '', ingredientes: '', modo: '' }); setAbrir(false); load(); haptic('sucesso'); say('Receita salva');
  };
  const apagar = async (r) => {
    if (!(await confirmar(`"${r.titulo}" será apagada.`, { titulo: 'Apagar receita?', ok: 'Apagar' }))) return;
    await supabase.from('receitas').delete().eq('id', r.id); load();
  };

  return (
    <div className="p-4">
      {!abrir
        ? <button onClick={() => setAbrir(true)} className={`${btn2} w-full flex items-center justify-center gap-2`}><Plus size={16} />Nova receita</button>
        : (
          <div className={`${card} flex flex-col gap-2`}>
            <input className={inp} maxLength={80} placeholder="Nome da receita" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
            <textarea className={inp} rows={3} maxLength={2000} placeholder="Ingredientes (um por linha)" value={f.ingredientes} onChange={(e) => setF({ ...f, ingredientes: e.target.value })} />
            <textarea className={inp} rows={4} maxLength={4000} placeholder="Modo de preparo" value={f.modo} onChange={(e) => setF({ ...f, modo: e.target.value })} />
            <div className="flex gap-2">
              <button onClick={() => setAbrir(false)} className={`flex-1 ${btn2}`}>Cancelar</button>
              <button onClick={add} className={`flex-1 ${btn}`}>Salvar receita</button>
            </div>
          </div>
        )}
      {lista == null ? <Spinner /> : lista.length === 0 ? <Vazio t="Guarde aqui as receitas da casa. Só você vê." /> : lista.map((r) => (
        <details key={r.id} className="py-3 border-b border-stone-100 text-sm">
          <summary className="flex items-center gap-2 cursor-pointer font-bold py-1">
            <span className="flex-1">{r.titulo}</span>
            <button onClick={(e) => { e.preventDefault(); apagar(r); }} aria-label={`Apagar ${r.titulo}`} className="p-1 text-stone-400"><Trash2 size={16} /></button>
          </summary>
          {r.ingredientes && <div className="whitespace-pre-line text-stone-600 mt-1">{r.ingredientes}</div>}
          {r.modo && <div className="whitespace-pre-line mt-2">{r.modo}</div>}
        </details>
      ))}
    </div>
  );
}

/* =========================================================================
 * CLIENTES (seguidores)
 * ========================================================================= */
function Clientes({ p }) {
  const [l, setL] = useState(null);
  useEffect(() => {
    supabase.from('follows').select('user_id, created_at, profiles(nome, foto_url)')
      .eq('pani_id', p.id).order('created_at', { ascending: false }).limit(500)
      .then(({ data }) => setL(data || []));
  }, [p.id]);
  if (!l) return <Spinner />;
  return (
    <div className="p-4">
      <p className="text-sm font-semibold mb-2">{l.length} {l.length === 1 ? 'seguidor' : 'seguidores'}</p>
      {l.length === 0 && <Vazio t="Quando alguém seguir sua pani, aparece aqui." />}
      {l.map((s) => (
        <div key={s.user_id} className="flex items-center gap-3 py-2">
          <Av src={s.profiles?.foto_url} emoji={(s.profiles?.nome || '?')[0]} size={40} />
          <span className="flex-1 text-sm font-semibold truncate">{s.profiles?.nome || 'Cliente'}</span>
          <span className="text-xs text-stone-400">{tempo(s.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

/* =========================================================================
 * AJUSTES
 * ========================================================================= */
function Horarios({ value, onChange }) {
  const h = getHorarios({ horarios: value });
  const set = (i, k, v) => onChange({ ...h, [i]: { ...h[i], [k]: v } });
  const copiarParaTodos = () => {
    const base = h[1];
    onChange(Object.fromEntries(DIAS.map((_, i) => [i, { ...h[i], ini: base.ini, fim: base.fim }])));
  };
  return (
    <div className="flex flex-col gap-2">
      {DIAS.map((d, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-2 w-28 shrink-0">
            <input type="checkbox" className="w-4 h-4 accent-red-600" checked={h[i].aberto} onChange={(e) => set(i, 'aberto', e.target.checked)} />{d}
          </label>
          {h[i].aberto
            ? (
              <>
                <input type="time" aria-label={`${d} abre`} className={`${inp} !w-auto`} value={h[i].ini} onChange={(e) => set(i, 'ini', e.target.value)} />
                <span className="text-stone-400">às</span>
                <input type="time" aria-label={`${d} fecha`} className={`${inp} !w-auto`} value={h[i].fim} onChange={(e) => set(i, 'fim', e.target.value)} />
              </>
            )
            : <span className="text-stone-400">Fechado</span>}
        </div>
      ))}
      <button onClick={copiarParaTodos} className={`${btn2} self-start`}>Usar o horário de segunda em todos os dias</button>
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
    const erro = validarTexto(av, { max: 200 });
    if (erro) return say(erro, 'erro');
    const { error } = await supabase.from('avisos').insert({ pani_id: p.id, txt: av.trim(), ativo: false });
    if (error) return say('Não foi possível enviar.', 'erro');
    setAv(''); load(); say('Aviso enviado. O administrador escolhe se aparece para os clientes.');
  };
  return (
    <div className={`${card} flex flex-col gap-2`}>
      <div className="font-semibold text-sm">Aviso para os clientes</div>
      <input className={inp} maxLength={200} placeholder="Ex.: Hoje fechamos às 15h" value={av} onChange={(e) => setAv(e.target.value)} />
      <button onClick={enviar} className={btn}>Enviar para aprovação</button>
      {avisos.map((a) => (
        <div key={a.id} className="flex justify-between gap-2 text-xs">
          <span className="truncate">{a.txt}</span>
          <span className={a.ativo ? 'text-green-600 font-semibold shrink-0' : 'text-stone-400 shrink-0'}>{a.ativo ? 'No ar' : 'Aguardando'}</span>
        </div>
      ))}
    </div>
  );
}

function Coment({ c, reload }) {
  const say = useToast();
  const [r, setR] = useState('');
  const [busy, setBusy] = useState(false);
  const responder = async () => {
    const erro = validarTexto(r, { max: 300 });
    if (erro) return say(erro, 'erro');
    setBusy(true);
    const { error } = await supabase.rpc('responder', { c_id: c.id, texto: r.trim() });
    setBusy(false);
    if (error) return say('Não foi possível responder.', 'erro');
    setR(''); reload(); haptic('sucesso');
  };
  return (
    <div className="py-2 text-sm border-b border-stone-100">
      <div className="flex items-center gap-2">
        <b>{c.autor}</b>
        <span className="text-xs text-stone-500">{'★'.repeat(c.nota || 0)}</span>
        <span className="text-xs text-stone-400 flex-1 text-right">{tempo(c.created_at)}</span>
      </div>
      <p className="break-words">{c.txt}</p>
      {c.resp
        ? <div className="ml-3 mt-1 pl-2 border-l-2 border-red-600 text-xs text-stone-600">Você respondeu: {c.resp}</div>
        : (
          <div className="flex gap-2 mt-1">
            <input className={inp} maxLength={300} placeholder="Responder" value={r} onChange={(e) => setR(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !busy && responder()} />
            <button onClick={responder} disabled={busy} className={btn} aria-label="Enviar resposta"><Send size={16} /></button>
          </div>
        )}
    </div>
  );
}

function Delivery({ p, patch }) {
  const confirmar = useConfirm();
  const say = useToast();
  const [d, setD] = useState({ taxa: fmt(p.taxa_entrega), minimo: fmt(p.pedido_minimo), tempo: p.tempo_entrega || '40–60 min' });
  const [itens, setItens] = useState(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState(false);
  const on = Boolean(p.delivery);
  const link = `${APP_URL}/d/${p.slug}`; // pedido pelo navegador, sem conta e sem baixar o app

  const copiarLink = async () => {
    haptic();
    if (await copiarTexto(link)) say('Link do delivery copiado');
    else say('Não copiou automático — toque no campo do link e copie manualmente.', 'erro');
  };
  const compartilharLink = async () => {
    const r = await compartilhar({ title: `${p.nome} · Delivery`, text: `Peça delivery da ${p.nome} 🛵`, url: link });
    if (r === 'copiado') say('Link do delivery copiado');
  };

  useEffect(() => {
    supabase.from('cardapio_itens').select('id, tipo, cat, unidade, preco, ativo').eq('pani_id', p.id).eq('tipo', 'balcao')
      .then(({ data }) => setItens(data || []));
  }, [p.id, p.delivery]);
  const prontos = (itens || []).filter(prontoDelivery).length;
  const faltam = (itens || []).filter((i) => i.ativo && !prontoDelivery(i)).length;

  const ligar = async (v) => {
    if (v && !p.endereco?.trim()) return say('Preencha o endereço da pani antes de ligar o delivery.', 'erro');
    if (v && prontos === 0 && !(await confirmar('Ainda não há pães, salgados ou doces com preço e unidade (un/kg). Ligue e depois avise uma fornada no Painel com preço e unidade — eles aparecem no delivery.', { titulo: 'Ligar delivery?', ok: 'Ligar mesmo assim', perigo: false }))) return;
    patch({ delivery: v }, v ? '🛵 Delivery ligado! Seus clientes já podem pedir.' : 'Delivery desligado');
  };
  const salvar = async () => {
    const taxa = pn(d.taxa); const minimo = pn(d.minimo);
    if (taxa < 0 || taxa > 500 || minimo < 0 || minimo > 5000) return say('Confira a taxa e o pedido mínimo.', 'erro');
    setBusy(true);
    await patch({ taxa_entrega: taxa, pedido_minimo: minimo, tempo_entrega: d.tempo.trim() || '40–60 min' }, 'Entrega salva');
    setBusy(false);
  };

  return (
    <div className={`${card} text-sm flex flex-col gap-3 ${on ? 'border-blue-300 bg-blue-50/40' : ''}`}>
      <div className="flex items-center gap-3">
        <Bike size={18} className={on ? 'text-blue-700 shrink-0' : 'text-stone-400 shrink-0'} />
        <div className="flex-1">
          <b>Modo delivery</b>
          <div className="text-xs text-stone-500">{on ? 'Ligado: pedem pelo app ou pelo seu link, e o pedido cai em Pedidos com alerta na tela.' : 'Desligado: ninguém consegue pedir entrega.'}</div>
        </div>
        <Switch on={on} set={ligar} label="Modo delivery" />
      </div>
      {itens && (
        <p className="text-xs text-stone-600">
          <b>{prontos}</b> {prontos === 1 ? 'item pronto' : 'itens prontos'} para o delivery
          {faltam > 0 && <> · <span className="text-amber-700">{faltam} sem preço ou unidade (ajuste no Cardápio)</span></>}
        </p>
      )}
      {on && (
        <>
          <div className="rounded-xl bg-white border border-blue-200 p-3">
            <b className="text-xs">Seu link de delivery</b>
            <p className="text-[11px] text-stone-500 mt-0.5">Mande no WhatsApp, coloque na bio do Instagram ou imprima o QR. Qualquer pessoa pede pelo navegador, sem baixar o app e sem criar conta.</p>
            <div className="flex gap-2 mt-2 items-center">
              <span className="flex-1 min-w-0 truncate text-xs text-blue-800 bg-blue-50 rounded-lg px-2.5 py-2.5 select-all" data-selecionavel>{link}</span>
              <button onClick={copiarLink} aria-label="Copiar link" className={btn2}><Copy size={16} /></button>
              <button onClick={compartilharLink} aria-label="Compartilhar link" className={btn2}><Share2 size={16} /></button>
              <button onClick={() => setQr(true)} aria-label="QR code do delivery" className={btn2}><QrCode size={16} /></button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold">Taxa de entrega (R$)
              <input className={`${inp} mt-1 font-normal`} inputMode="decimal" value={d.taxa} onChange={(e) => setD({ ...d, taxa: e.target.value })} placeholder="0,00 = grátis" />
            </label>
            <label className="text-xs font-semibold">Pedido mínimo (R$)
              <input className={`${inp} mt-1 font-normal`} inputMode="decimal" value={d.minimo} onChange={(e) => setD({ ...d, minimo: e.target.value })} placeholder="0,00" />
            </label>
          </div>
          <label className="text-xs font-semibold">Tempo de entrega
            <input className={`${inp} mt-1 font-normal`} maxLength={30} value={d.tempo} onChange={(e) => setD({ ...d, tempo: e.target.value })} placeholder="Ex.: 30–50 min" />
          </label>
          <button onClick={salvar} disabled={busy} className={btn}>{busy ? 'Salvando…' : 'Salvar entrega'}</button>
        </>
      )}
      {qr && <SheetQr link={link} nome={p.nome} fechar={() => setQr(false)} titulo="QR code do delivery"
        texto="Cole no balcão, na sacola ou no panfleto. O cliente aponta a câmera e pede delivery pelo navegador." />}
    </div>
  );
}

function Ajustes({ p, reload }) {
  const { signOut } = useAuth();
  const say = useToast();
  const [f, setF] = useState({
    nome: p.nome || '', bio: p.bio || '', endereco: p.endereco || '', slug: p.slug || '', horarios: getHorarios(p),
    instagram: p.instagram ? `@${p.instagram}` : '', whatsapp: p.whatsapp ? foneFmt(p.whatsapp) : '',
  });
  const [com, setCom] = useState(null);
  const [conf, setConf] = useState(false);
  const [digitado, setDigitado] = useState('');
  const [excl, setExcl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gps, setGps] = useState(false);
  const visivel = p.visivel !== false;

  const loadCom = useCallback(async () => {
    const { data } = await supabase.from('comentarios').select('*').eq('pani_id', p.id).order('created_at', { ascending: false }).limit(200);
    setCom(data || []);
  }, [p.id]);
  useEffect(() => { loadCom(); }, [loadCom]);

  const patch = async (dados, ok) => {
    const { error } = await supabase.from('panis').update(dados).eq('id', p.id);
    if (error) {
      say(error.code === '23505' ? 'Esse link já está em uso. Escolha outro.' : error.code === 'P0001' ? error.message : 'Não foi possível salvar.', 'erro');
      return false;
    }
    await reload(); if (ok) say(ok); return true;
  };
  const salvar = async () => {
    const slug = slugify(f.slug);
    if (!f.nome.trim() || !slug) return say('Informe o nome e o link do cardápio.', 'erro');
    const zap = soDigitos(f.whatsapp);
    if (zap && (zap.length < 10 || zap.length > 13)) return say('WhatsApp inválido. Use DDD + número.', 'erro');
    setBusy(true);
    await patch({
      nome: f.nome.trim(), bio: f.bio, endereco: f.endereco, slug, horarios: f.horarios,
      instagram: limpaInstagram(f.instagram) || null, whatsapp: zap || null,
    }, 'Alterações salvas');
    setBusy(false);
  };
  const pegarGps = async () => {
    setGps(true);
    try {
      const l = await pegarLocalizacao();
      await patch({ lat: l.lat, lng: l.lng }, 'Localização salva');
    } catch {
      say('Não foi possível capturar. Permita o acesso à localização.', 'erro');
    } finally { setGps(false); }
  };
  const excluir = async () => {
    setExcl(true);
    const { error } = await supabase.rpc('delete_my_account');
    if (error) { setExcl(false); return say('Não foi possível excluir a conta. Fale com o suporte.', 'erro'); }
    await signOut();
  };

  return (
    <div className="flex flex-col gap-3 pb-4">
      {/* capa estilo Facebook + foto de perfil */}
      <div>
        <Capa p={p} altura="h-40">
          <span className="bg-white/90 rounded-full px-3 shadow">
            <FotoBtn img={null} max={1600} removivel={false} label={p.capa_url ? 'Trocar capa' : 'Adicionar capa'}
              onUrl={(u) => u && patch({ capa_url: u }, 'Capa atualizada')} />
          </span>
        </Capa>
        <div className="flex items-center justify-end gap-3 px-4 pt-2 min-h-12">
          {p.capa_url && <button onClick={() => patch({ capa_url: null }, 'Capa removida')} className="text-xs text-stone-500 underline">Remover capa</button>}
          <FotoBtn img={null} removivel={false} label={p.foto_url ? 'Trocar foto' : 'Foto de perfil'} onUrl={(u) => u && patch({ foto_url: u }, 'Foto atualizada')} />
        </div>
        <p className="px-4 text-[11px] text-stone-400">Capa: use uma foto deitada (horizontal), como a vitrine ou a fachada.</p>
      </div>

      <div className="px-4 flex flex-col gap-3">
        <div className={`${card} text-sm flex items-center gap-3`}>
          {visivel ? <Eye size={18} className="text-red-600 shrink-0" /> : <EyeOff size={18} className="text-stone-400 shrink-0" />}
          <div className="flex-1">
            <b>Visível para os clientes</b>
            <div className="text-xs text-stone-500">{visivel ? 'Aparece em Explorar e no feed, e envia avisos.' : 'Oculta do app e sem avisos. O link do cardápio continua funcionando.'}</div>
          </div>
          <Switch on={visivel} set={(v) => patch({ visivel: v }, v ? 'Sua pani está visível' : 'Sua pani está oculta')} label="Visível para os clientes" />
        </div>

        <Delivery p={p} patch={patch} />

        <LinhaPush textoAtivo="Você recebe aviso de pedido, seguidor novo e comentário." textoInativo="Ative para saber de pedidos e seguidores novos." />

        <div className="font-semibold text-sm mt-2">Dados da pani</div>
        <input className={inp} maxLength={60} placeholder="Nome da pani" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <textarea className={inp} rows={2} maxLength={200} placeholder="Bio da pani" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
        <input className={inp} maxLength={160} placeholder="Endereço" value={f.endereco} onChange={(e) => setF({ ...f, endereco: e.target.value })} />

        <div className="font-semibold text-sm mt-2">Redes para o cliente falar com você <span className="font-normal text-stone-400">(opcional)</span></div>
        <label className="flex items-center gap-2">
          <span className="text-pink-700"><IconeInstagram /></span>
          <input className={inp} maxLength={60} placeholder="Instagram (ex.: @padariadoze)" value={f.instagram} onChange={(e) => setF({ ...f, instagram: e.target.value })} autoCapitalize="none" aria-label="Instagram" />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-green-700"><IconeWhatsapp /></span>
          <input className={inp} type="tel" inputMode="tel" maxLength={20} placeholder="WhatsApp com DDD" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} aria-label="WhatsApp" />
        </label>
        <p className="text-[11px] text-stone-400 -mt-1">Aparecem como botões no seu perfil e no cardápio. Deixe em branco para não mostrar.</p>

        <label className="text-xs font-semibold mt-1">Link do cardápio
          <div className="flex items-center gap-1 mt-1 font-normal text-stone-500">
            <span className="text-sm">/c/</span>
            <input className={inp} maxLength={40} value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} aria-label="Link do cardápio" />
          </div>
        </label>
        <button onClick={pegarGps} disabled={gps} className={`${btn2} flex items-center justify-center gap-2`}>
          <MapPin size={16} />{gps ? 'Capturando…' : p.lat ? 'Atualizar localização' : 'Capturar localização'}
        </button>
        {p.lat && <p className="text-xs text-stone-500 flex items-center gap-1"><Check size={12} />Localização salva (os clientes veem a distância)</p>}

        <div className="font-semibold text-sm mt-2">Horário de funcionamento</div>
        <Horarios value={f.horarios} onChange={(horarios) => setF({ ...f, horarios })} />
        <button onClick={salvar} disabled={busy} className={btn}>{busy ? 'Salvando…' : 'Salvar alterações'}</button>

        <div className="mt-2"><AvisoAdm p={p} /></div>

        <div className="font-semibold text-sm mt-2">Comentários dos clientes {com ? `(${com.length})` : ''}</div>
        {com == null ? <Spinner /> : com.length === 0 ? <Vazio t="Ainda não há comentários." /> : com.map((c) => <Coment key={c.id} c={c} reload={loadCom} />)}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-400 mt-4">
          <Link to="/privacidade" className="underline">Privacidade</Link>
          <Link to="/termos" className="underline">Termos</Link>
          <a href={`mailto:${SUPORTE_EMAIL}`} className="underline">Suporte</a>
          <span>versão {APP_VERSAO}</span>
        </div>

        <button onClick={signOut} className={`${btn2} flex items-center justify-center gap-2 mt-2`}><LogOut size={16} />Sair</button>
        {!conf
          ? <button onClick={() => setConf(true)} className="text-red-600 text-sm font-semibold py-2">Excluir conta</button>
          : (
            <div className="border border-red-200 bg-red-50 rounded-xl p-3 text-sm flex flex-col gap-2">
              <p>Isso apaga sua conta e os dados da pani (cardápio, pedidos, receitas). Não dá para desfazer.</p>
              <input className={inp} placeholder={`Digite "${p.nome}" para confirmar`} value={digitado} onChange={(e) => setDigitado(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={excluir} disabled={excl || key(digitado) !== key(p.nome)}
                  className="flex-1 bg-red-600 text-white rounded-lg py-2.5 font-semibold disabled:opacity-40">{excl ? 'Excluindo…' : 'Excluir'}</button>
                <button onClick={() => { setConf(false); setDigitado(''); }} className={`flex-1 ${btn2}`}>Cancelar</button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

/* =========================================================================
 * APP DA PANIFICADORA
 * ========================================================================= */
export default function PaniApp() {
  const { user, signOut } = useAuth();
  const [p, setP] = useState(undefined);
  const [tab, setTab] = useState('painel');
  const [pedidos, setPedidos] = useState([]);
  const [menu, setMenu] = useState([]);
  const [som, setSom] = useState(() => localStorage.getItem('apppani:som') !== '0');
  const scroll = useRef(null);

  useEffect(() => { localStorage.setItem('apppani:som', som ? '1' : '0'); }, [som]);

  const reload = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.from('panis').select('*').eq('owner', user.id).maybeSingle();
    if (!error) setP(data);
  }, [user]);
  useEffect(() => { reload(); }, [reload]);

  const pid = p?.id;
  // pedidos que chegaram e ainda ninguém viu (alerta na tela). "vistos" começa com o que já existia ao abrir.
  const [alertas, setAlertas] = useState([]);
  const vistos = useRef(null);
  const loadPedidos = useCallback(async () => {
    if (!pid) return;
    const { data } = await supabase.from('pedidos').select('*').eq('pani_id', pid)
      .in('status', ABERTOS).order('created_at');
    if (!data) return;
    let chegaram = [];
    if (vistos.current === null) vistos.current = new Set(data.map((o) => o.id));
    else {
      chegaram = data.filter((o) => o.status === 'novo' && !vistos.current.has(o.id)).reverse();
      data.forEach((o) => vistos.current.add(o.id));
    }
    // some do alerta o pedido que já foi aceito ou cancelado (até em outro aparelho)
    setAlertas((a) => [...chegaram, ...a.filter((x) => !chegaram.some((c) => c.id === x.id))]
      .filter((x) => data.some((o) => o.id === x.id && o.status === 'novo')));
    setPedidos(data);
  }, [pid]);

  // tempo real (o pedido aparece na hora)
  useEffect(() => {
    if (!pid) return;
    loadPedidos();
    const ch = supabase.channel(`pedidos-${pid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `pani_id=eq.${pid}` }, () => loadPedidos())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [pid, loadPedidos]);

  // rede de segurança: se o tempo real cair sem avisar (wi-fi oscilou, tablet dormiu), confere a cada 30 s
  useEffect(() => {
    if (!pid) return;
    const t = setInterval(loadPedidos, 30000);
    return () => clearInterval(t);
  }, [pid, loadPedidos]);

  useRevalidar(loadPedidos, 15000);

  // cardápio ativo: usado pelo editor de pedidos
  useEffect(() => {
    if (!pid || tab !== 'pedidos') return;
    supabase.from('cardapio_itens').select('*').eq('pani_id', pid).eq('ativo', true).order('tipo').order('nome')
      .then(({ data }) => setMenu(data || []));
  }, [pid, tab]);

  // troca de aba sempre começa no topo
  useEffect(() => { scroll.current?.scrollTo({ top: 0 }); }, [tab]);

  if (p === undefined) return <Shell top={<Logo />} nav={null}><Spinner /></Shell>;
  if (p === null) {
    return (
      <Shell top={<Logo />} nav={null}>
        <Vazio t="Não encontramos sua panificadora nesta conta. Fale com o suporte para liberar o cadastro."
          acao={<div className="flex gap-2"><a href={`mailto:${SUPORTE_EMAIL}`} className={btn}>Falar com o suporte</a><button onClick={signOut} className={btn2}>Sair</button></div>} />
      </Shell>
    );
  }

  const novos = pedidos.filter((o) => o.status === 'novo').length;
  const T = [
    ['painel', 'Painel', Home], ['pedidos', 'Pedidos', ClipboardList], ['cardapio', 'Cardápio', UtensilsCrossed],
    ['receitas', 'Receitas', BookOpen], ['clientes', 'Clientes', Users], ['chat', 'Chat', MessagesSquare], ['ajustes', 'Ajustes', Settings],
  ];

  return (
    <Shell
      scrollRef={scroll}
      top={tab === 'chat'
        ? <><button onClick={() => setTab('painel')} aria-label="Voltar"><ChevronLeft size={22} /></button><span className="font-bold text-sm">Suporte AppPani</span></>
        : <><Logo size="text-xl" /><span className="text-xs text-stone-500 truncate flex-1">{p.nome}</span>{novos > 0 && (
            <button onClick={() => setTab('pedidos')} className="flex items-center gap-1 text-xs font-semibold bg-red-600 text-white rounded-full px-2 py-1">
              <ShoppingBag size={12} />{novos}
            </button>
          )}</>}
      nav={T.map(([k, l, I]) => (
        <NavBtn key={k} icon={I} label={l} on={tab === k} click={() => setTab(k)} badge={k === 'pedidos' ? novos : 0} />
      ))}>
      <AlertaPedidos alertas={alertas} som={som} manterTela={Boolean(p.delivery)}
        ver={() => { setAlertas([]); setTab('pedidos'); }} dispensar={() => setAlertas([])} />
      {p.delivery && (tab === 'painel' || tab === 'pedidos') && <AtivarAlertas som={som} />}
      {tab === 'painel' && <Painel p={p} reload={reload} />}
      {tab === 'pedidos' && <Pedidos lista={pedidos} recarregar={loadPedidos} menu={menu} pid={pid} som={som} setSom={setSom} delivery={Boolean(p.delivery)} />}
      {tab === 'cardapio' && <CardapioAdm p={p} />}
      {tab === 'receitas' && <Receitas p={p} />}
      {tab === 'clientes' && <Clientes p={p} />}
      {tab === 'chat' && <Chat paniId={p.id} de="pani" />}
      {tab === 'ajustes' && <Ajustes p={p} reload={reload} />}
    </Shell>
  );
}