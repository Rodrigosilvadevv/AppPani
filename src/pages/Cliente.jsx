import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Home, Search, Settings, MapPin, ChevronLeft, Send, LogOut, Megaphone, Pencil, Trash2, UtensilsCrossed, Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { Av, FotoBtn, HorariosView, Logo, NavBtn, Pic, PushBanner, Selo, Shell, Spinner, StatusBadge, Stars, Vazio, btn, btn2, inp, useToast } from '../ui';
import { distKm, fresco, kmFmt, media, money, tempo } from '../lib/util';
import { ativarPush, desativarPush, pushStatus } from '../lib/push';

const Nota = ({ lista }) => (
  <span className="flex items-center gap-1 text-xs text-stone-500">
    <Stars v={media(lista)} />{lista.length ? `${media(lista).toFixed(1).replace('.', ',')} (${lista.length})` : 'sem notas'}
  </span>
);

// Cards (somente imagem) do administrador + avisos liberados
const Cards = ({ cards, avisos }) => {
  if (!cards.length && !avisos.length) return null;
  return (
    <div className="flex gap-3 overflow-x-auto px-3 py-3 border-b border-stone-200 snap-x">
      {cards.map((c) => <img key={c.id} src={c.img_url} alt="" loading="lazy" className="snap-start shrink-0 h-36 w-64 rounded-xl object-cover" />)}
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

// item do feed: fornada ou post
const FeedItem = ({ it, pani, open }) => (
  <article className="border-b border-stone-200 pb-3">
    <button onClick={() => open?.(pani.id)} className="flex items-center gap-2 px-3 py-2">
      <Av src={pani.foto_url} emoji={pani.emoji} size={32} />
      <span className="text-sm font-semibold">{pani.nome}</span>
      <span className="text-xs text-stone-400">{tempo(it.created_at)}</span>
    </button>
    <div className="relative">
      <Pic src={it.img_url} emoji={pani.emoji} cls="aspect-square" />
      {it.tipo === 'fornada' && fresco(it.created_at) && <div className="absolute top-3 left-3"><Selo /></div>}
    </div>
    <div className="px-3 pt-2 text-sm">{it.tipo === 'fornada' ? <b>🥖 Fornada saindo agora!</b> : it.txt}</div>
  </article>
);

function Lista({ panis, follows, open, seguir, loc, pedirLoc }) {
  const [q, setQ] = useState('');
  const [ord, setOrd] = useState('nome');
  const dist = (p) => distKm(loc, p);
  const L = panis
    .filter((p) => p.nome.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (ord === 'km' && loc ? (dist(a) ?? 1e9) - (dist(b) ?? 1e9) : a.nome.localeCompare(b.nome)));
  return (
    <div className="p-3">
      <input className={inp} placeholder="Buscar pelo nome da pani" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex gap-2 my-3">
        <button onClick={() => { setOrd('km'); if (!loc) pedirLoc(); }} className={`rounded-full px-3 py-1 text-xs border ${ord === 'km' ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300'}`}>Mais perto</button>
        <button onClick={() => setOrd('nome')} className={`rounded-full px-3 py-1 text-xs border ${ord === 'nome' ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300'}`}>Nome A–Z</button>
      </div>
      {L.length === 0 && <Vazio t="Nenhuma pani encontrada." />}
      {L.map((p) => {
        const d = dist(p);
        return (
          <div key={p.id} className="flex items-center gap-3 py-2">
            <button onClick={() => open(p.id)} className="flex items-center gap-3 flex-1 text-left">
              <Av src={p.foto_url} emoji={p.emoji} size={52} />
              <span>
                <span className="block font-semibold text-sm">{p.nome}</span><Nota lista={p.comentarios} />
                <span className="flex gap-3 text-xs text-stone-500">
                  {d != null && <span className="flex items-center gap-0.5"><MapPin size={11} />{kmFmt(d)}</span>}<span>{p.seguidores} seguidores</span>
                </span>
              </span>
            </button>
            <button onClick={() => seguir(p.id)} className={follows.includes(p.id) ? btn2 : btn}>{follows.includes(p.id) ? 'Seguindo' : 'Seguir'}</button>
          </div>
        );
      })}
    </div>
  );
}

function PaniPage({ p, follows, seguir, loc, recarregar }) {
  const { user, perfil } = useAuth();
  const say = useToast();
  const [tab, setTab] = useState('nov');
  const [d, setD] = useState({ fornadas: [], posts: [], receitas: [], comentarios: [] });
  const [txt, setTxt] = useState('');
  const [nota, setNota] = useState(0);
  const [edit, setEdit] = useState(false);

  const load = useCallback(async () => {
    const [a, b, c, e] = await Promise.all([
      supabase.from('fornadas').select('*').eq('pani_id', p.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('posts').select('*').eq('pani_id', p.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('receitas').select('*').eq('pani_id', p.id).order('created_at', { ascending: false }),
      supabase.from('comentarios').select('*').eq('pani_id', p.id).order('created_at', { ascending: false }),
    ]);
    setD({ fornadas: a.data || [], posts: b.data || [], receitas: c.data || [], comentarios: e.data || [] });
  }, [p.id]);
  useEffect(() => { load(); }, [load]);

  const novidades = [
    ...d.fornadas.map((x) => ({ ...x, tipo: 'fornada' })),
    ...d.posts.map((x) => ({ ...x, tipo: 'post' })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const meu = d.comentarios.find((c) => c.user_id === user.id); // 1 comentário por cliente em cada pani
  const dist = distKm(loc, p);

  const salvar = async () => {
    if (!txt.trim() || !nota) return say('Escreva o comentário e escolha de 1 a 5 estrelas.');
    const { error } = meu
      ? await supabase.from('comentarios').update({ txt: txt.trim(), nota }).eq('id', meu.id)
      : await supabase.from('comentarios').insert({ pani_id: p.id, user_id: user.id, autor: perfil.nome, nota, txt: txt.trim() });
    if (error) return say('Não foi possível salvar o comentário.');
    setTxt(''); setNota(0); setEdit(false); load(); recarregar();
  };
  const apagar = async () => { await supabase.from('comentarios').delete().eq('id', meu.id); load(); recarregar(); };

  return (
    <div>
      <div className="p-4 flex gap-4 items-center">
        <Av src={p.foto_url} emoji={p.emoji} size={76} />
        <div className="flex-1 text-sm">
          <div className="font-bold text-base">{p.nome}</div>
          <div className="text-stone-600">{p.bio}</div><Nota lista={d.comentarios} />
          <div className="text-xs text-stone-500 mt-1 flex items-center gap-1"><MapPin size={12} />{p.endereco}{dist != null && ` — ${kmFmt(dist)}`}</div>
          <div className="text-xs text-stone-500 flex items-center gap-3"><span>{p.seguidores} seguidores</span><StatusBadge p={p} /></div>
        </div>
      </div>
      <div className="flex gap-2 px-4 pb-3">
        <button onClick={() => seguir(p.id)} className={`flex-1 ${follows.includes(p.id) ? btn2 : btn}`}>{follows.includes(p.id) ? 'Seguindo' : 'Seguir'}</button>
        <Link to={`/c/${p.slug}`} className={`flex-1 ${btn2} flex items-center justify-center gap-2`}><UtensilsCrossed size={16} />Cardápio</Link>
      </div>
      <div className="flex border-b border-stone-200">
        {[['nov', 'Novidades'], ['rec', 'Receitas'], ['com', 'Comentários'], ['hor', 'Horários']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 py-2.5 text-xs font-semibold border-b-2 ${tab === k ? 'border-stone-900' : 'border-transparent text-stone-400'}`}>{l}</button>
        ))}
      </div>

      {tab === 'nov' && (novidades.length ? novidades.map((it) => <FeedItem key={it.tipo + it.id} it={it} pani={p} />) : <Vazio t="Nada por aqui ainda. Siga a pani para saber quando sair a próxima fornada." />)}

      {tab === 'rec' && (d.receitas.length ? d.receitas.map((r) => (
        <div key={r.id} className="p-4 border-b border-stone-100 text-sm">
          <div className="font-bold">{r.titulo}</div>
          <div className="whitespace-pre-line text-stone-600 mt-1">{r.ingredientes}</div>
          <div className="mt-2">{r.modo}</div>
        </div>
      )) : <Vazio t="Esta pani ainda não publicou receitas." />)}

      {tab === 'com' && (
        <div className="p-3">
          {meu && !edit ? (
            <div className="border border-red-200 bg-red-50 rounded-xl p-3 mb-3 text-sm">
              <div className="flex items-center justify-between"><b>Seu comentário</b><Stars v={meu.nota} size={13} /></div>
              <p className="mt-1">{meu.txt}</p>
              <div className="flex gap-4 mt-2 text-xs font-semibold text-red-700">
                <button onClick={() => { setTxt(meu.txt); setNota(meu.nota); setEdit(true); }} className="flex items-center gap-1"><Pencil size={12} />Editar</button>
                <button onClick={apagar} className="flex items-center gap-1"><Trash2 size={12} />Apagar</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex gap-1"><Estrelas nota={nota} setNota={setNota} /></div>
              <div className="flex gap-2">
                <input className={inp} placeholder="Seu comentário (1 por pani)" value={txt} onChange={(e) => setTxt(e.target.value)} />
                <button onClick={salvar} aria-label="Enviar" className={btn}><Send size={16} /></button>
              </div>
            </div>
          )}
          {d.comentarios.length === 0 && <Vazio t="Seja o primeiro a comentar." />}
          {d.comentarios.map((c) => (
            <div key={c.id} className="py-2 text-sm">
              <div className="flex items-center gap-2"><b>{c.autor}</b><Stars v={c.nota} /></div>{c.txt}
              {c.resp && <div className="ml-3 mt-1 pl-2 border-l-2 border-red-600 text-xs text-stone-600"><b>{p.nome}</b> {c.resp}</div>}
            </div>
          ))}
        </div>
      )}

      {tab === 'hor' && <div className="p-4"><HorariosView p={p} /></div>}
    </div>
  );
}

// seletor de estrelas
const Estrelas = ({ nota, setNota }) => (
  <>{[1, 2, 3, 4, 5].map((i) => (
    <button key={i} onClick={() => setNota(i)} aria-label={`${i} estrelas`} className="p-0.5">
      <svg width="24" height="24" viewBox="0 0 24 24" className={i <= nota ? 'fill-red-500 text-red-500' : 'text-stone-300'} fill="currentColor"><path d="M12 2l3 7 7.5.6-5.7 4.9 1.8 7.3L12 17.8 5.4 21.8l1.8-7.3L1.5 9.6 9 9z" /></svg>
    </button>
  ))}</>
);

function Ajustes({ pedirLoc }) {
  const { user, perfil, refresh, signOut } = useAuth();
  const say = useToast();
  const [nome, setNome] = useState(perfil.nome);
  const [conf, setConf] = useState(false);
  const [pani, setPani] = useState('');
  const [ps, setPs] = useState(pushStatus());

  const salvarNome = async () => {
    const { error } = await supabase.from('profiles').update({ nome: nome.trim() }).eq('id', user.id);
    if (error) return say('Não foi possível salvar.');
    refresh(); say('Nome atualizado');
  };
  const foto = async (url) => { await supabase.from('profiles').update({ foto_url: url }).eq('id', user.id); refresh(); };
  const push = async () => {
    try { if (ps === 'ativo') { await desativarPush(); localStorage.setItem('apppani:push-off', '1'); setPs('pendente'); say('Avisos desativados'); } else { await ativarPush(); setPs('ativo'); say('Avisos ativados 🔔'); } }
    catch { setPs(pushStatus()); say('Não foi possível alterar os avisos neste aparelho.'); }
  };
  const virarPani = async () => {
    if (!pani.trim()) return;
    const { error } = await supabase.rpc('virar_pani', { p_nome: pani.trim() });
    if (error) return say('Não foi possível cadastrar a panificadora.');
    await refresh();
  };
  const excluir = async () => { await supabase.rpc('delete_my_account'); await signOut(); };

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center gap-4"><Av src={perfil.foto_url} emoji="🙂" size={72} /><FotoBtn img={null} onUrl={foto} /></div>
      <label className="text-sm font-semibold">Seu nome
        <div className="flex gap-2 mt-1"><input className={`${inp} font-normal`} value={nome} onChange={(e) => setNome(e.target.value)} /><button onClick={salvarNome} className={btn}>Salvar</button></div>
      </label>

      <div className="border border-stone-200 rounded-xl p-3 text-sm flex items-center gap-3">
        <Bell size={18} className="text-red-600" />
        <div className="flex-1"><b>Avisos de fornada</b><div className="text-xs text-stone-500">{ps === 'ativo' ? 'Ativos neste aparelho' : ps === 'bloqueado' ? 'Bloqueados no navegador' : ps === 'ios-instalar' ? 'No iPhone, adicione à Tela de Início' : ps === 'sem-suporte' ? 'Sem suporte neste aparelho' : 'Desativados'}</div></div>
        {(ps === 'ativo' || ps === 'pendente') && <button onClick={push} className={btn2}>{ps === 'ativo' ? 'Desativar' : 'Ativar'}</button>}
      </div>

      <button onClick={pedirLoc} className={`${btn2} flex items-center justify-center gap-2`}><MapPin size={16} />Usar minha localização</button>

      <div className="border border-stone-200 rounded-xl p-3 flex flex-col gap-2">
        <div className="text-sm font-semibold">Tenho uma panificadora</div>
        <input className={inp} placeholder="Nome da panificadora" value={pani} onChange={(e) => setPani(e.target.value)} />
        <button onClick={virarPani} className={btn2}>Cadastrar panificadora</button>
      </div>

      <button onClick={signOut} className={`${btn2} flex items-center justify-center gap-2`}><LogOut size={16} />Sair</button>
      {!conf
        ? <button onClick={() => setConf(true)} className="text-red-600 text-sm font-semibold py-2">Excluir conta</button>
        : <div className="border border-red-200 bg-red-50 rounded-xl p-3 text-sm">
            <p>Isso apaga seus dados e as panis que você segue. Não dá para desfazer.</p>
            <div className="flex gap-2 mt-3">
              <button onClick={excluir} className="flex-1 bg-red-600 text-white rounded-lg py-2 font-semibold">Excluir</button>
              <button onClick={() => setConf(false)} className={`flex-1 ${btn2}`}>Cancelar</button>
            </div>
          </div>}
    </div>
  );
}

export default function Cliente() {
  const { user } = useAuth();
  const say = useToast();
  const [tab, setTab] = useState('home');
  const [aberta, setAberta] = useState(null);
  const [panis, setPanis] = useState(null);
  const [follows, setFollows] = useState([]);
  const [cards, setCards] = useState([]);
  const [avisos, setAvisos] = useState([]);
  const [feed, setFeed] = useState([]);
  const [loc, setLoc] = useState(null);

  const carregar = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      supabase.from('panis').select('*, comentarios(nota)'),
      supabase.from('follows').select('pani_id').eq('user_id', user.id),
      supabase.from('cards').select('*').order('created_at', { ascending: false }),
      supabase.from('avisos').select('*, panis(nome)').eq('ativo', true).order('created_at', { ascending: false }),
    ]);
    setPanis(a.data || []); setFollows((b.data || []).map((x) => x.pani_id)); setCards(c.data || []); setAvisos(d.data || []);
  }, [user.id]);
  useEffect(() => { carregar(); }, [carregar]);

  const carregarFeed = useCallback(async () => {
    if (!follows.length) return setFeed([]);
    const desde = new Date(Date.now() - 7 * 864e5).toISOString();
    const [f, p] = await Promise.all([
      supabase.from('fornadas').select('*').in('pani_id', follows).gte('created_at', desde),
      supabase.from('posts').select('*').in('pani_id', follows).gte('created_at', desde),
    ]);
    setFeed([...(f.data || []).map((x) => ({ ...x, tipo: 'fornada' })), ...(p.data || []).map((x) => ({ ...x, tipo: 'post' }))]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  }, [follows]);
  useEffect(() => { carregarFeed(); }, [carregarFeed]);

  // novas fornadas aparecem sozinhas
  useEffect(() => {
    const ch = supabase.channel('feed-fornadas').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fornadas' }, () => carregarFeed()).subscribe();
    return () => supabase.removeChannel(ch);
  }, [carregarFeed]);

  const seguir = async (id) => {
    const on = follows.includes(id);
    setFollows(on ? follows.filter((x) => x !== id) : [...follows, id]);
    const { error } = on
      ? await supabase.from('follows').delete().eq('user_id', user.id).eq('pani_id', id)
      : await supabase.from('follows').insert({ user_id: user.id, pani_id: id });
    if (error) say('Não foi possível atualizar.');
    carregar();
  };
  const pedirLoc = () => {
    if (!navigator.geolocation) return say('Este aparelho não permite capturar a localização.');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }); say('Localização atualizada'); },
      () => say('Não foi possível capturar. Permita o acesso à localização.'));
  };

  if (!panis) return <Shell top={<Logo />} nav={null}><Spinner /></Shell>;
  const pani = panis.find((p) => p.id === aberta);
  const go = (t) => { setTab(t); setAberta(null); };
  const lista = <Lista panis={panis} follows={follows} open={setAberta} seguir={seguir} loc={loc} pedirLoc={pedirLoc} />;

  return (
    <Shell
      top={pani
        ? <><button onClick={() => setAberta(null)} aria-label="Voltar"><ChevronLeft size={22} /></button><span className="font-bold text-sm truncate">{pani.nome}</span></>
        : <Logo />}
      nav={<>
        <NavBtn icon={Home} label="Início" on={!aberta && tab === 'home'} click={() => go('home')} />
        <NavBtn icon={Search} label="Explorar" on={!aberta && tab === 'explorar'} click={() => go('explorar')} />
        <NavBtn icon={Settings} label="Ajustes" on={!aberta && tab === 'ajustes'} click={() => go('ajustes')} />
      </>}>
      {pani ? <PaniPage p={pani} follows={follows} seguir={seguir} loc={loc} recarregar={carregar} />
        : tab === 'explorar' ? lista
        : tab === 'ajustes' ? <Ajustes pedirLoc={pedirLoc} />
        : <>
            <PushBanner />
            <Cards cards={cards} avisos={avisos} />
            {follows.length === 0
              ? <><p className="px-4 pt-4 text-sm text-stone-600">Escolha uma pani para ver as fornadas frescas dela aqui.</p>{lista}</>
              : feed.length === 0 ? <Vazio t="Nada novo das panis que você segue. Toque em Explorar para seguir outras." />
              : feed.map((it) => {
                  const pn = panis.find((x) => x.id === it.pani_id);
                  return pn ? <FeedItem key={it.tipo + it.id} it={it} pani={pn} open={setAberta} /> : null;
                })}
          </>}
    </Shell>
  );
}
