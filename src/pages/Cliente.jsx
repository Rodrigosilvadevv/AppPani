import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bell, BellOff, Bike, Cake, ChevronLeft, ChevronRight, Home, LogOut, MapPin, Megaphone,
  Pencil, Search, Send, Sandwich, Settings, Share2, Trash2, UserX, UtensilsCrossed, Wheat,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import {
  Av, Chip, FotoBtn, HorariosView, LinhaPush, Logo, NavBtn, Pic, PushBanner, Selo, Shell,
  SkeletonFeed, StatusBadge, Stars, Vazio, btn, btn2, card, inp, useConfirm, useToast,
} from '../ui';
import { distKm, fresco, kmFmt, media, notaFmt, statusAgora, tempo } from '../lib/util';
import { ativarPush, erroPush, pushStatus } from '../lib/push';
import { compartilhar, haptic, pegarLocalizacao } from '../lib/native';
import { useRevalidar } from '../lib/hooks';
import { validarTexto } from '../lib/moderacao';
import { APP_URL, APP_VERSAO, SUPORTE_EMAIL } from '../config';
import {
  BotaoComentar, BotaoCurtir, MenuItem, SheetComentarios, useBloqueios,
  useContagemComentarios, useCurtidas,
} from '../components/social';
import { Capa, Redes } from '../components/perfil';
import { ehUuid } from '../components/Acompanhar';
import Delivery, { useMeusPedidos } from './Delivery';

const CATS = {
  pao: { nome: 'Pães', un: 'pão', ic: Wheat, emoji: '🥖' },
  salgado: { nome: 'Salgados', un: 'salgado', ic: Sandwich, emoji: '🥟' },
  doce: { nome: 'Doces', un: 'doce', ic: Cake, emoji: '🍰' },
};
const LOC_CACHE = 'apppani:loc';

const Nota = ({ lista }) => (
  <span className="flex items-center gap-1 text-xs text-stone-500">
    <Stars v={media(lista)} />{lista?.length ? `${notaFmt(media(lista))} (${lista.length})` : 'sem notas'}
  </span>
);

/* Faixa Pães / Salgados / Doces: toque no ícone para filtrar; "Avisar" liga o push daquela categoria */
function Especiais({ filtro, setFiltro }) {
  const { user, perfil, refresh } = useAuth();
  const say = useToast();
  const [salvando, setSalvando] = useState(null);

  const setPref = async (k) => {
    if (!perfil || salvando) return;
    const v = !perfil[`av_${k}`];
    setSalvando(k);
    try {
      if (v && pushStatus() !== 'ativo') {
        try { await ativarPush(); } catch (e) { return say(erroPush(e), 'erro'); }
      }
      const { error } = await supabase.from('profiles').update({ [`av_${k}`]: v }).eq('id', user.id);
      if (error) return say('Não foi possível salvar.', 'erro');
      await refresh();
      haptic('sucesso');
      say(v ? `Você será avisado quando sair ${CATS[k].un} fresco 🔔` : `Aviso de ${CATS[k].un} desligado`);
    } finally { setSalvando(null); }
  };

  return (
    <div className="flex justify-around px-2 py-3 border-b border-stone-200">
      {Object.entries(CATS).map(([k, c]) => {
        const on = Boolean(perfil?.[`av_${k}`]);
        return (
          <div key={k} className="flex flex-col items-center gap-1">
            <button onClick={() => { haptic(); setFiltro(filtro === k ? null : k); }} aria-label={`Ver ${c.nome}`} aria-pressed={filtro === k}
              className={`w-14 h-14 rounded-full p-[2px] ${filtro === k ? 'bg-stone-900' : 'bg-gradient-to-tr from-red-500 to-orange-400'}`}>
              <span className="flex w-full h-full rounded-full bg-white items-center justify-center text-red-600"><c.ic size={22} strokeWidth={1.75} /></span>
            </button>
            <span className="text-xs font-semibold">{c.nome}</span>
            <button onClick={() => setPref(k)} disabled={salvando === k}
              className={`flex items-center gap-1 text-[11px] rounded-full px-2 py-1 border disabled:opacity-50 ${on ? 'bg-red-600 text-white border-red-600' : 'border-stone-300 text-stone-600'}`}>
              {on ? <Bell size={11} /> : <BellOff size={11} />}{on ? 'Avisando' : 'Avisar'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* Cards (somente imagem) do administrador + avisos liberados */
const Cards = ({ cards, avisos }) => {
  if (!cards.length && !avisos.length) return null;
  return (
    <div className="flex gap-3 overflow-x-auto px-3 py-3 border-b border-stone-200 snap-x">
      {cards.map((c) => (
        c.link
          ? <a key={c.id} href={c.link} target="_blank" rel="noopener noreferrer" className="snap-start shrink-0"><img src={c.img_url} alt="" loading="lazy" className="h-36 w-64 rounded-xl object-cover" /></a>
          : <img key={c.id} src={c.img_url} alt="" loading="lazy" className="snap-start shrink-0 h-36 w-64 rounded-xl object-cover" />
      ))}
      {avisos.map((a) => (
        <div key={a.id} className="snap-start shrink-0 w-64 rounded-xl border border-red-200 bg-red-50 overflow-hidden">
          {a.img_url && <img src={a.img_url} alt="" loading="lazy" className="h-24 w-full object-cover" />}
          <div className="p-3">
            <div className="flex items-center gap-1 text-xs font-bold text-red-700"><Megaphone size={13} />{a.panis?.nome || 'AppPani'}</div>
            <div className="text-sm mt-1">{a.txt}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

/* item do feed: fornada ou post */
function FeedItem({ it, pani, open, curtidas, nComentarios, bloquear, abrirComentarios }) {
  const c = CATS[it.cat] || CATS.pao;
  const say = useToast();
  const share = async () => {
    const r = await compartilhar({
      title: pani.nome,
      text: it.tipo === 'fornada' ? `Saiu ${c.un} fresco na ${pani.nome}! 🥖` : `${pani.nome} no AppPani`,
      url: `${APP_URL}/c/${pani.slug}`,
    });
    if (r === 'copiado') say('Link copiado');
  };
  return (
    <article className="px-3 pb-3 mb-1 border-b border-stone-100">
      <div className="flex items-center gap-2 py-2">
        <button onClick={() => open?.(pani.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <Av src={pani.foto_url} emoji={pani.emoji} size={32} />
          <span className="text-sm font-semibold truncate">{pani.nome}</span>
          <span className="text-xs text-stone-400 shrink-0">{tempo(it.created_at)}</span>
        </button>
        <MenuItem item={it} pani={pani} bloquear={bloquear} />
      </div>
      <div className="relative rounded-2xl overflow-hidden border border-stone-200 shadow-sm">
        <Pic src={it.img_url} emoji={it.tipo === 'fornada' ? c.emoji : pani.emoji} cls="aspect-square" alt={it.tipo === 'fornada' ? `Fornada de ${c.un}` : it.txt || ''} />
        {it.tipo === 'fornada' && fresco(it.created_at, it.cat) && <div className="absolute top-3 left-3"><Selo txt={it.cat === 'doce' ? 'Fresco' : 'Fresquinho'} /></div>}
      </div>
      <div className="flex items-center gap-4 pt-2">
        <BotaoCurtir on={curtidas.curtiu(it)} total={curtidas.total(it)} onClick={() => curtidas.curtir(it)} />
        <BotaoComentar total={nComentarios} onClick={() => abrirComentarios(it, pani)} />
        <button onClick={share} aria-label="Compartilhar" className="text-stone-600 active:opacity-60 py-1 ml-auto"><Share2 size={19} /></button>
      </div>
      <div className="pt-1 text-sm" data-selecionavel>
        {it.tipo === 'fornada' ? <b>{c.emoji} Fornada de {c.un} saindo agora!</b> : it.txt}
        {it.tipo === 'fornada' && it.itens?.length > 0 && <div className="text-stone-600">{it.itens.join(' · ')}</div>}
      </div>
    </article>
  );
}

/* ---------- Explorar ---------- */
function Lista({ panis, follows, open, seguir, loc, pedirLoc }) {
  const [q, setQ] = useState('');
  const [ord, setOrd] = useState('nome');
  const [soAbertas, setSoAbertas] = useState(false);
  const dist = useCallback((p) => distKm(loc, p), [loc]);

  const L = useMemo(() => {
    const busca = q.trim().toLowerCase();
    return panis
      .filter((p) => (p.nome || '').toLowerCase().includes(busca) || (p.endereco || '').toLowerCase().includes(busca))
      .filter((p) => !soAbertas || statusAgora(p).aberto)
      .sort((a, b) => (ord === 'km' && loc ? (dist(a) ?? 1e9) - (dist(b) ?? 1e9) : a.nome.localeCompare(b.nome, 'pt-BR')));
  }, [panis, q, ord, soAbertas, loc, dist]);

  return (
    <div className="p-3">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-3.5 text-stone-400" />
        <input className={`${inp} pl-9`} placeholder="Buscar pelo nome ou endereço" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
      </div>
      <div className="flex gap-2 my-3 overflow-x-auto">
        <Chip on={ord === 'km'} onClick={() => { setOrd('km'); if (!loc) pedirLoc(); }}>Mais perto</Chip>
        <Chip on={ord === 'nome'} onClick={() => setOrd('nome')}>Nome A–Z</Chip>
        <Chip on={soAbertas} onClick={() => setSoAbertas((v) => !v)}>Abertas agora</Chip>
      </div>
      {L.length === 0 && <Vazio t="Nenhuma pani encontrada com esse filtro." />}
      {L.map((p) => {
        const d = dist(p);
        const seguindo = follows.includes(p.id);
        return (
          <div key={p.id} className="flex items-center gap-3 py-2">
            <button onClick={() => open(p.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
              <Av src={p.foto_url} emoji={p.emoji} size={52} />
              <span className="min-w-0">
                <span className="block font-semibold text-sm truncate">{p.nome}</span><Nota lista={p.comentarios} />
                <span className="flex gap-3 text-xs text-stone-500">
                  {d != null && <span className="flex items-center gap-0.5"><MapPin size={11} />{kmFmt(d)}</span>}
                  <span>{p.seguidores ?? 0} seguidores</span>
                  {p.delivery && <span className="flex items-center gap-0.5 text-blue-700 font-semibold"><Bike size={11} />delivery</span>}
                </span>
              </span>
            </button>
            <button onClick={() => seguir(p.id)} className={`shrink-0 ${seguindo ? btn2 : btn}`}>{seguindo ? 'Seguindo' : 'Seguir'}</button>
          </div>
        );
      })}
    </div>
  );
}

/* seletor de estrelas */
const Estrelas = ({ nota, setNota }) => (
  <>{[1, 2, 3, 4, 5].map((i) => (
    <button key={i} type="button" onClick={() => { haptic(); setNota(i); }} aria-label={`${i} estrela${i > 1 ? 's' : ''}`} className="p-1">
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" className={i <= nota ? 'fill-red-500 text-red-500' : 'text-stone-300'} fill="currentColor">
        <path d="M12 2l3 7 7.5.6-5.7 4.9 1.8 7.3L12 17.8 5.4 21.8l1.8-7.3L1.5 9.6 9 9z" />
      </svg>
    </button>
  ))}</>
);

/* ---------- página de uma pani ---------- */
function PaniPage({ p, follows, seguir, loc, recarregar, bloquear, abrirDelivery }) {
  const { user, perfil } = useAuth();
  const say = useToast();
  const confirmar = useConfirm();
  const [tab, setTab] = useState('nov');
  const [filtro, setFiltro] = useState(null);
  const [d, setD] = useState(null);
  const [txt, setTxt] = useState('');
  const [nota, setNota] = useState(0);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [coment, setComent] = useState(null);

  const load = useCallback(async () => {
    const [a, b, e] = await Promise.all([
      supabase.from('fornadas').select('*').eq('pani_id', p.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('posts').select('*').eq('pani_id', p.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('comentarios').select('*').eq('pani_id', p.id).order('created_at', { ascending: false }),
    ]);
    setD({ fornadas: a.data || [], posts: b.data || [], comentarios: e.data || [] });
  }, [p.id]);
  useEffect(() => { load(); }, [load]);
  useRevalidar(load);

  const novidades = useMemo(() => {
    if (!d) return [];
    return [
      ...d.fornadas.filter((x) => x.feed !== false).map((x) => ({ ...x, tipo: 'fornada' })),
      ...(filtro ? [] : d.posts.map((x) => ({ ...x, tipo: 'post' }))),
    ].filter((x) => !filtro || x.cat === filtro).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [d, filtro]);

  const curtidas = useCurtidas(novidades);
  const [recarga, setRecarga] = useState(0);
  const nComent = useContagemComentarios(novidades, recarga);
  const meu = d?.comentarios.find((c) => c.user_id === user.id); // 1 comentário por cliente em cada pani
  const dist = distKm(loc, p);

  const salvar = async () => {
    const erro = validarTexto(txt, { max: 300 });
    if (erro) return say(erro, 'erro');
    if (!nota) return say('Escolha de 1 a 5 estrelas.', 'erro');
    setBusy(true);
    const { error } = meu
      ? await supabase.from('comentarios').update({ txt: txt.trim(), nota }).eq('id', meu.id)
      : await supabase.from('comentarios').insert({ pani_id: p.id, user_id: user.id, autor: perfil.nome, nota, txt: txt.trim() });
    setBusy(false);
    if (error) return say('Não foi possível salvar o comentário.', 'erro');
    if (!meu) supabase.functions.invoke('send-push', { body: { evento: 'comentario', pani_id: p.id } }).catch(() => {});
    setTxt(''); setNota(0); setEdit(false); load(); recarregar(); haptic('sucesso');
  };
  const apagar = async () => {
    if (!(await confirmar('Seu comentário e sua nota serão removidos.', { titulo: 'Apagar comentário?', ok: 'Apagar' }))) return;
    await supabase.from('comentarios').delete().eq('id', meu.id);
    load(); recarregar();
  };
  const share = async () => {
    const r = await compartilhar({ title: p.nome, text: `Conheça a ${p.nome} no AppPani 🥖`, url: `${APP_URL}/c/${p.slug}` });
    if (r === 'copiado') say('Link copiado');
  };

  const seguindo = follows.includes(p.id);

  return (
    <div>
      <Capa p={p} />
      <div className="px-4 pt-11 pb-3 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-bold text-lg leading-tight">{p.nome}</h2>
          {p.delivery && <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5"><Bike size={12} />Faz delivery</span>}
        </div>
        {p.bio && <div className="text-stone-600 mt-0.5" data-selecionavel>{p.bio}</div>}
        <Nota lista={d?.comentarios || []} />
        {p.endereco && <div className="text-xs text-stone-500 mt-1 flex items-center gap-1"><MapPin size={12} />{p.endereco}{dist != null && ` — ${kmFmt(dist)}`}</div>}
        <div className="text-xs text-stone-500 flex items-center gap-3 flex-wrap"><span>{p.seguidores ?? 0} seguidores</span><StatusBadge p={p} /></div>
        <Redes p={p} className="mt-2" />
      </div>
      <div className="flex gap-2 px-4 pb-3">
        <button onClick={() => seguir(p.id)} className={`flex-1 ${seguindo ? btn2 : btn}`}>{seguindo ? 'Seguindo' : 'Seguir'}</button>
        <Link to={`/c/${p.slug}`} className={`flex-1 ${btn2} flex items-center justify-center gap-2`}><UtensilsCrossed size={16} />Cardápio</Link>
        <button onClick={share} aria-label="Compartilhar" className={btn2}><Share2 size={16} /></button>
      </div>
      {p.delivery && (
        <div className="px-4 pb-3">
          <button onClick={() => abrirDelivery(p.id)} className="w-full bg-blue-700 text-white rounded-lg px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2 active:opacity-80">
            <Bike size={18} />Pedir delivery
          </button>
        </div>
      )}
      <Especiais filtro={filtro} setFiltro={setFiltro} />
      <div className="flex border-b border-stone-200">
        {[['nov', 'Novidades'], ['com', 'Comentários'], ['hor', 'Horários']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 py-3 text-xs font-semibold border-b-2 ${tab === k ? 'border-stone-900' : 'border-transparent text-stone-400'}`}>{l}</button>
        ))}
      </div>

      {tab === 'nov' && (d == null ? <SkeletonFeed /> : novidades.length
        ? novidades.map((it) => (
            <FeedItem key={it.tipo + it.id} it={it} pani={p} curtidas={curtidas} nComentarios={nComent(it)} bloquear={bloquear}
              abrirComentarios={(item) => setComent({ item, pani: p })} />
          ))
        : <Vazio t="Nada por aqui ainda. Ative o Avisar para saber quando sair a próxima fornada." />)}

      {tab === 'com' && (
        <div className="p-3">
          {meu && !edit ? (
            <div className="border border-red-200 bg-red-50 rounded-xl p-3 mb-3 text-sm">
              <div className="flex items-center justify-between"><b>Seu comentário</b><Stars v={meu.nota} size={13} /></div>
              <p className="mt-1" data-selecionavel>{meu.txt}</p>
              {meu.resp && <div className="ml-1 mt-2 pl-2 border-l-2 border-red-600 text-xs text-stone-600"><b>{p.nome}</b> {meu.resp}</div>}
              <div className="flex gap-4 mt-2 text-xs font-semibold text-red-700">
                <button onClick={() => { setTxt(meu.txt); setNota(meu.nota); setEdit(true); }} className="flex items-center gap-1"><Pencil size={12} />Editar</button>
                <button onClick={apagar} className="flex items-center gap-1"><Trash2 size={12} />Apagar</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex gap-1"><Estrelas nota={nota} setNota={setNota} /></div>
              <div className="flex gap-2">
                <input className={inp} maxLength={300} placeholder="Seu comentário (1 por pani)" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && salvar()} />
                <button onClick={salvar} disabled={busy} aria-label="Enviar" className={btn}><Send size={16} /></button>
              </div>
              {edit && <button onClick={() => { setEdit(false); setTxt(''); setNota(0); }} className="text-xs text-stone-500 underline self-start">Cancelar edição</button>}
            </div>
          )}
          {d?.comentarios.length === 0 && <Vazio t="Seja o primeiro a comentar." />}
          {(d?.comentarios || []).filter((c) => c.user_id !== user.id).map((c) => (
            <div key={c.id} className="py-2 text-sm border-b border-stone-100">
              <div className="flex items-center gap-2"><b>{c.autor}</b><Stars v={c.nota} /><span className="text-xs text-stone-400 ml-auto">{tempo(c.created_at)}</span></div>
              <p data-selecionavel>{c.txt}</p>
              {c.resp && <div className="ml-1 mt-1 pl-2 border-l-2 border-red-600 text-xs text-stone-600"><b>{p.nome}</b> {c.resp}</div>}
            </div>
          ))}
        </div>
      )}

      {tab === 'hor' && <div className="p-4"><HorariosView p={p} /></div>}

      {coment && <SheetComentarios item={coment.item} pani={coment.pani} fechar={() => setComent(null)} aoMudar={() => setRecarga((n) => n + 1)} />}
    </div>
  );
}

/* ---------- endereço do delivery (preenche sozinho o próximo pedido) ---------- */
function DadosEntrega() {
  const { user } = useAuth();
  const say = useToast();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user) return;
    supabase.from('dados_entrega').select('endereco, telefone').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setD({ endereco: data?.endereco || '', telefone: data?.telefone || '' }));
  }, [user]);
  if (!d) return null;
  const salvar = async () => {
    setBusy(true);
    const { error } = await supabase.from('dados_entrega').upsert({
      user_id: user.id, endereco: d.endereco.trim(), telefone: d.telefone.replace(/\D/g, ''), updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) return say('Não foi possível salvar.', 'erro');
    say('Endereço de entrega salvo');
  };
  return (
    <div className={`${card} text-sm flex flex-col gap-2`}>
      <div className="flex items-center gap-2 font-semibold"><Bike size={16} className="text-blue-700" />Endereço para delivery</div>
      <textarea className={inp} rows={2} maxLength={300} placeholder="Rua, número, bairro e referência" value={d.endereco} onChange={(e) => setD({ ...d, endereco: e.target.value })} />
      <input className={inp} type="tel" inputMode="tel" maxLength={20} placeholder="Telefone com DDD" value={d.telefone} onChange={(e) => setD({ ...d, telefone: e.target.value })} />
      <button onClick={salvar} disabled={busy} className={btn2}>{busy ? 'Salvando…' : 'Salvar endereço'}</button>
    </div>
  );
}

/* ---------- Ajustes do cliente ---------- */
function Ajustes({ pedirLoc, loc, panis, bloqueios }) {
  const { user, perfil, refresh, signOut } = useAuth();
  const say = useToast();
  const confirmar = useConfirm();
  const [nome, setNome] = useState(perfil.nome || '');
  const [busy, setBusy] = useState(false);
  const [excl, setExcl] = useState(false);

  const salvarNome = async () => {
    if (nome.trim().length < 2) return say('Informe seu nome.', 'erro');
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ nome: nome.trim() }).eq('id', user.id);
    setBusy(false);
    if (error) return say('Não foi possível salvar.', 'erro');
    refresh(); say('Nome atualizado');
  };
  const foto = async (url) => { await supabase.from('profiles').update({ foto_url: url }).eq('id', user.id); refresh(); };
  const excluir = async () => {
    if (!(await confirmar('Isso apaga seus dados, suas curtidas, comentários e as panis que você segue. Não dá para desfazer.', { titulo: 'Excluir sua conta?', ok: 'Excluir conta' }))) return;
    setExcl(true);
    const { error } = await supabase.rpc('delete_my_account');
    if (error) { setExcl(false); return say('Não foi possível excluir a conta. Fale com o suporte.', 'erro'); }
    await signOut();
  };

  const bloqueadas = panis.filter((p) => bloqueios.bloqueados.includes(p.id));

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center gap-4"><Av src={perfil.foto_url} emoji="🙂" size={72} /><FotoBtn img={perfil.foto_url} onUrl={foto} /></div>

      <label className="text-sm font-semibold">Seu nome
        <div className="flex gap-2 mt-1">
          <input className={`${inp} font-normal`} value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} />
          <button onClick={salvarNome} disabled={busy} className={btn}>Salvar</button>
        </div>
      </label>

      <LinhaPush textoAtivo="Avisos de fornada e de cada passo do seu pedido." />

      <DadosEntrega />

      <button onClick={pedirLoc} className={`${btn2} flex items-center justify-center gap-2`}>
        <MapPin size={16} />{loc ? 'Atualizar minha localização' : 'Usar minha localização'}
      </button>

      {bloqueadas.length > 0 && (
        <div className={card}>
          <div className="flex items-center gap-2 text-sm font-semibold"><UserX size={16} />Panis bloqueadas ({bloqueadas.length})</div>
          {bloqueadas.map((p) => (
            <div key={p.id} className="flex items-center gap-2 mt-2 text-sm">
              <Av src={p.foto_url} emoji={p.emoji} size={32} />
              <span className="flex-1 truncate">{p.nome}</span>
              <button onClick={() => bloqueios.desbloquear(p.id)} className="text-xs font-semibold text-red-700">Desbloquear</button>
            </div>
          ))}
        </div>
      )}

      <div className={`${card} text-sm`}>
        <div className="font-semibold mb-1">Sobre e ajuda</div>
        <div className="flex flex-col gap-2 text-stone-600">
          <a href={`mailto:${SUPORTE_EMAIL}`} className="flex items-center justify-between">Falar com o suporte <ChevronRight size={16} /></a>
          <Link to="/termos" className="flex items-center justify-between">Termos de Uso <ChevronRight size={16} /></Link>
          <Link to="/privacidade" className="flex items-center justify-between">Política de Privacidade <ChevronRight size={16} /></Link>
          <span className="text-xs text-stone-400">AppPani versão {APP_VERSAO}</span>
        </div>
      </div>

      <button onClick={signOut} className={`${btn2} flex items-center justify-center gap-2`}><LogOut size={16} />Sair</button>
      <button onClick={excluir} disabled={excl} className="text-red-600 text-sm font-semibold py-2">{excl ? 'Excluindo…' : 'Excluir conta'}</button>
    </div>
  );
}

/* ---------- app do cliente ---------- */
export default function Cliente() {
  const { user } = useAuth();
  const say = useToast();
  const [tab, setTab] = useState('home');
  const [aberta, setAberta] = useState(null);
  const [filtro, setFiltro] = useState(null);
  const [panis, setPanis] = useState(null);
  const [follows, setFollows] = useState([]);
  const [cards, setCards] = useState([]);
  const [avisos, setAvisos] = useState([]);
  const [feed, setFeed] = useState(null);
  const [novos, setNovos] = useState(0);
  const [coment, setComent] = useState(null);
  const [loc, setLoc] = useState(() => { try { return JSON.parse(localStorage.getItem(LOC_CACHE)); } catch { return null; } });
  const scroll = useRef(null);
  const bloqueios = useBloqueios();
  const [sp, setSp] = useSearchParams();
  const [lojaDelivery, setLojaDelivery] = useState(null);
  const [pedidoDelivery, setPedidoDelivery] = useState(null);

  const uid = user?.id;
  const meus = useMeusPedidos(uid);

  // links de fora: /?delivery=<id da pani> abre a loja · /?pedido=<id> abre o acompanhamento
  const qDelivery = sp.get('delivery');
  const qPedido = sp.get('pedido');
  useEffect(() => {
    if (!qDelivery && !qPedido) return;
    if (ehUuid(qDelivery)) { setLojaDelivery(qDelivery); setTab('delivery'); }
    if (ehUuid(qPedido)) { setPedidoDelivery(qPedido); setTab('delivery'); }
    setSp({}, { replace: true });
  }, [qDelivery, qPedido, setSp]);
  const carregar = useCallback(async () => {
    if (!uid) return;
    const [a, b, c, d] = await Promise.all([
      supabase.from('panis').select('*, comentarios(nota)'),
      supabase.from('follows').select('pani_id').eq('user_id', uid),
      supabase.from('cards').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('avisos').select('*, panis(nome)').eq('ativo', true).order('created_at', { ascending: false }).limit(20),
    ]);
    setPanis(a.data || []);
    setFollows((b.data || []).map((x) => x.pani_id));
    setCards(c.data || []);
    setAvisos(d.data || []);
  }, [uid]);
  useEffect(() => { carregar(); }, [carregar]);

  const carregarFeed = useCallback(async () => {
    if (!follows.length) return setFeed([]);
    const desde = new Date(Date.now() - 7 * 864e5).toISOString();
    const [f, p] = await Promise.all([
      supabase.from('fornadas').select('*').in('pani_id', follows).gte('created_at', desde).order('created_at', { ascending: false }).limit(60),
      supabase.from('posts').select('*').in('pani_id', follows).gte('created_at', desde).order('created_at', { ascending: false }).limit(60),
    ]);
    setFeed([
      ...(f.data || []).filter((x) => x.feed !== false).map((x) => ({ ...x, tipo: 'fornada' })),
      ...(p.data || []).map((x) => ({ ...x, tipo: 'post' })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    setNovos(0);
  }, [follows]);
  useEffect(() => { carregarFeed(); }, [carregarFeed]);
  useRevalidar(() => { carregar(); carregarFeed(); });

  // novas fornadas das panis que você segue: avisa com um botão, sem pular a leitura
  useEffect(() => {
    if (!follows.length) return;
    const ch = supabase.channel('feed-fornadas')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fornadas' }, (ev) => {
        if (follows.includes(ev.new.pani_id) && !bloqueios.bloqueados.includes(ev.new.pani_id)) setNovos((n) => n + 1);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [follows, bloqueios.bloqueados]);

  const itens = useMemo(() => (feed || [])
    .filter((it) => !bloqueios.bloqueados.includes(it.pani_id))
    .filter((it) => !filtro || (it.tipo === 'fornada' && it.cat === filtro)), [feed, filtro, bloqueios.bloqueados]);
  const curtidas = useCurtidas(itens);
  const [recarga, setRecarga] = useState(0);
  const nComent = useContagemComentarios(itens, recarga);

  const seguir = async (id) => {
    const on = follows.includes(id);
    haptic();
    setFollows(on ? follows.filter((x) => x !== id) : [...follows, id]);
    const { error } = on
      ? await supabase.from('follows').delete().eq('user_id', user.id).eq('pani_id', id)
      : await supabase.from('follows').insert({ user_id: user.id, pani_id: id });
    if (error) { say('Não foi possível atualizar.', 'erro'); setFollows(follows); return; }
    // avisa a pani que ganhou seguidor (se falhar, não atrapalha nada)
    if (!on) supabase.functions.invoke('send-push', { body: { evento: 'seguidor', pani_id: id } }).catch(() => {});
    carregar();
  };

  const pedirLoc = async () => {
    try {
      const l = await pegarLocalizacao();
      setLoc(l);
      try { localStorage.setItem(LOC_CACHE, JSON.stringify(l)); } catch { /* ignora */ }
      say('Localização atualizada');
    } catch (e) {
      say(e.message === 'sem-suporte' ? 'Este aparelho não permite capturar a localização.' : 'Não foi possível capturar. Permita o acesso à localização.', 'erro');
    }
  };

  const verNovas = () => { setNovos(0); carregarFeed(); scroll.current?.scrollTo({ top: 0, behavior: 'smooth' }); };

  if (!panis) return <Shell top={<Logo />} nav={null}><SkeletonFeed /></Shell>;

  const pani = panis.find((p) => p.id === aberta);
  const go = (t) => { setTab(t); setAberta(null); setLojaDelivery(null); setPedidoDelivery(null); scroll.current?.scrollTo({ top: 0 }); };
  const abrirDelivery = (id) => { setAberta(null); setLojaDelivery(id); setTab('delivery'); scroll.current?.scrollTo({ top: 0 }); };
  const visiveis = panis.filter((p) => !bloqueios.bloqueados.includes(p.id));
  const lista = <Lista panis={visiveis} follows={follows} open={setAberta} seguir={seguir} loc={loc} pedirLoc={pedirLoc} />;

  return (
    <Shell
      scrollRef={scroll}
      top={pani
        ? <><button onClick={() => setAberta(null)} aria-label="Voltar" className="p-1 -ml-1"><ChevronLeft size={22} /></button><span className="font-bold text-sm truncate">{pani.nome}</span></>
        : <><Logo /><span className="ml-auto text-xs text-stone-400">{tab === 'home' && follows.length > 0 ? `${follows.length} seguindo` : ''}</span></>}
      nav={<>
        <NavBtn icon={Home} label="Início" on={!aberta && tab === 'home'} click={() => go('home')} badge={novos} />
        <NavBtn icon={Search} label="Explorar" on={!aberta && tab === 'explorar'} click={() => go('explorar')} />
        <NavBtn icon={Bike} label="Delivery" on={!aberta && tab === 'delivery'} click={() => go('delivery')} badge={meus.ativos.length} />
        <NavBtn icon={Settings} label="Ajustes" on={!aberta && tab === 'ajustes'} click={() => go('ajustes')} />
      </>}>
      {pani ? <PaniPage p={pani} follows={follows} seguir={seguir} loc={loc} recarregar={carregar} bloquear={bloqueios.bloquear} abrirDelivery={abrirDelivery} />
        : tab === 'explorar' ? lista
        : tab === 'delivery' ? <Delivery panis={visiveis} loc={loc} pedirLoc={pedirLoc} lojaInicial={lojaDelivery} pedidoInicial={pedidoDelivery} meus={meus} />
        : tab === 'ajustes' ? <Ajustes pedirLoc={pedirLoc} loc={loc} panis={panis} bloqueios={bloqueios} />
        : <>
            <PushBanner />
            <Cards cards={cards} avisos={avisos} />
            <Especiais filtro={filtro} setFiltro={setFiltro} />
            {novos > 0 && (
              <button onClick={verNovas} className="sticky top-2 z-10 mx-auto my-2 block bg-stone-900 text-white text-xs font-semibold rounded-full px-4 py-2 shadow-lg">
                {novos === 1 ? '1 fornada nova' : `${novos} fornadas novas`} · ver
              </button>
            )}
            {feed == null ? <SkeletonFeed />
              : follows.length === 0
                ? <><p className="px-4 pt-4 text-sm text-stone-600">Escolha uma pani para ver as fornadas frescas dela aqui.</p>{lista}</>
                : itens.length === 0
                  ? <Vazio
                      t={filtro ? `Nenhuma fornada de ${CATS[filtro].un} das panis que você segue. Toque no ícone de novo para ver tudo.` : 'Nada novo das panis que você segue nos últimos 7 dias.'}
                      acao={<button onClick={() => go('explorar')} className={btn}>Explorar panis</button>} />
                  : itens.map((it) => {
                      const pn = visiveis.find((x) => x.id === it.pani_id);
                      return pn ? (
                        <FeedItem key={it.tipo + it.id} it={it} pani={pn} open={setAberta} curtidas={curtidas} nComentarios={nComent(it)}
                          bloquear={bloqueios.bloquear} abrirComentarios={(item, p) => setComent({ item, pani: p })} />
                      ) : null;
                    })}
            {coment && <SheetComentarios item={coment.item} pani={coment.pani} fechar={() => setComent(null)} aoMudar={() => setRecarga((n) => n + 1)} />}
          </>}
    </Shell>
  );
}
