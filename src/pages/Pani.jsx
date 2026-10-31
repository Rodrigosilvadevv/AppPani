import { useCallback, useEffect, useState } from 'react';
import { Home, ClipboardList, UtensilsCrossed, BookOpen, Users, MessagesSquare, Settings, Flame, Trash2, Send, MapPin, LogOut, Copy, Plus, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { Av, FotoBtn, Logo, NavBtn, Shell, Spinner, Vazio, btn, btn2, inp, useToast, Pic } from '../ui';
import { DIAS, getHorarios, idade, money, slugify, tempo } from '../lib/util';
import Chat from './Chat';

/* ---------- Painel: botão único "Avisar fornada" ---------- */
function Painel({ p, reload }) {
  const say = useToast();
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [txt, setTxt] = useState('');
  const [pimg, setPimg] = useState(null);
  const [av, setAv] = useState('');
  const [avisos, setAvisos] = useState([]);
  const link = `${window.location.origin}/c/${p.slug}`;

  const loadAv = useCallback(async () => {
    const { data } = await supabase.from('avisos').select('*').eq('pani_id', p.id).order('created_at', { ascending: false }).limit(10);
    setAvisos(data || []);
  }, [p.id]);
  useEffect(() => { loadAv(); }, [loadAv]);

  const avisar = async () => {
    if (p.ultimo_aviso && idade(p.ultimo_aviso) < 0.17 && !window.confirm('Você avisou há poucos minutos. Avisar de novo?')) return;
    setBusy(true);
    const { data, error } = await supabase.from('fornadas').insert({ pani_id: p.id, img_url: img }).select('id').single();
    if (error) { setBusy(false); return say('Não foi possível enviar o aviso.'); }
    const r = await supabase.functions.invoke('send-push', { body: { fornada_id: data.id } });
    setImg(null); await reload(); setBusy(false);
    say(r.error ? 'Aviso publicado no app (o push não saiu agora).' : `🥖 Aviso enviado para ${r.data?.enviados ?? 0} aparelho(s)`);
  };
  const copiar = async () => {
    if (navigator.share) { try { await navigator.share({ title: p.nome, url: link }); return; } catch { /* cancelado */ } }
    await navigator.clipboard?.writeText(link); say('Link do cardápio copiado');
  };
  const postar = async () => {
    if (!txt.trim() && !pimg) return;
    const { error } = await supabase.from('posts').insert({ pani_id: p.id, txt: txt.trim(), img_url: pimg });
    if (error) return say('Não foi possível publicar.');
    setTxt(''); setPimg(null); say('Publicado no feed');
  };
  const enviarAviso = async () => {
    if (!av.trim()) return;
    const { error } = await supabase.from('avisos').insert({ pani_id: p.id, txt: av.trim(), ativo: false });
    if (error) return say('Não foi possível enviar.');
    setAv(''); loadAv(); say('Aviso enviado. O administrador escolhe se aparece para os clientes.');
  };

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="border border-stone-200 rounded-xl p-4 flex flex-col gap-3">
        <button onClick={avisar} disabled={busy} className="bg-red-600 text-white rounded-xl py-4 font-bold flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-60">
          <Flame size={20} />{busy ? 'Enviando…' : 'Avisar fornada'}
        </button>
        <FotoBtn img={img} onUrl={setImg} label="Foto da fornada (opcional)" />
        <p className="text-xs text-stone-500">{p.ultimo_aviso ? `Último aviso: ${tempo(p.ultimo_aviso)} (${new Date(p.ultimo_aviso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })})` : 'Você ainda não avisou nenhuma fornada.'}</p>
      </div>

      <div className="border border-stone-200 rounded-xl p-3 flex flex-col gap-2">
        <div className="font-semibold text-sm">Link do seu cardápio</div>
        <div className="flex gap-2"><input readOnly className={inp} value={link} onFocus={(e) => e.target.select()} /><button onClick={copiar} aria-label="Copiar" className={btn2}><Copy size={16} /></button></div>
      </div>

      <div className="border border-stone-200 rounded-xl p-3 flex flex-col gap-2">
        <div className="font-semibold text-sm">Postar no feed</div>
        <FotoBtn img={pimg} onUrl={setPimg} />
        <input className={inp} placeholder="Legenda" value={txt} onChange={(e) => setTxt(e.target.value)} />
        <button onClick={postar} className={btn}>Publicar</button>
      </div>

      <div className="border border-stone-200 rounded-xl p-3 flex flex-col gap-2">
        <div className="font-semibold text-sm">Aviso para os clientes</div>
        <input className={inp} placeholder="Ex.: Hoje fechamos às 15h" value={av} onChange={(e) => setAv(e.target.value)} />
        <button onClick={enviarAviso} className={btn}>Enviar para aprovação</button>
        {avisos.map((a) => <div key={a.id} className="flex justify-between gap-2 text-xs"><span>{a.txt}</span><span className={a.ativo ? 'text-green-600 font-semibold shrink-0' : 'text-stone-400 shrink-0'}>{a.ativo ? 'No ar' : 'Aguardando'}</span></div>)}
      </div>
    </div>
  );
}

/* ---------- Pedidos da chapa (tempo real) ---------- */
const FLUXO = { novo: ['preparando', 'Preparar'], preparando: ['pronto', 'Pronto'], pronto: ['entregue', 'Entregue'] };
const COR = { novo: 'bg-red-100 text-red-700', preparando: 'bg-orange-100 text-orange-700', pronto: 'bg-green-100 text-green-700' };
function Pedidos({ lista, recarregar }) {
  const say = useToast();
  const mudar = async (id, status) => {
    const { error } = await supabase.from('pedidos').update({ status }).eq('id', id);
    if (error) say('Não foi possível atualizar o pedido.'); else recarregar();
  };
  if (!lista.length) return <Vazio t="Nenhum pedido em aberto. Os pedidos feitos pelo seu link aparecem aqui na hora." />;
  return (
    <div className="p-3 flex flex-col gap-3">
      {lista.map((o) => (
        <div key={o.id} className="border border-stone-200 rounded-xl p-3 text-sm">
          <div className="flex items-center justify-between">
            <b className="text-base">Mesa {o.mesa}</b>
            <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${COR[o.status]}`}>{o.status}</span>
          </div>
          <div className="text-xs text-stone-500">{o.cliente && `${o.cliente} · `}{tempo(o.created_at)}</div>
          <ul className="mt-2">{o.itens.map((i, k) => <li key={k}>{i.qtd}× {i.nome}</li>)}</ul>
          {o.obs && <p className="mt-1 text-xs bg-yellow-50 rounded px-2 py-1">Obs.: {o.obs}</p>}
          <div className="flex items-center justify-between mt-3">
            <b>{money(o.total)}</b>
            <div className="flex gap-2">
              <button onClick={() => mudar(o.id, 'cancelado')} className={btn2}>Cancelar</button>
              {FLUXO[o.status] && <button onClick={() => mudar(o.id, FLUXO[o.status][0])} className={btn}>{FLUXO[o.status][1]}</button>}
            </div>
          </div>
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
  const load = useCallback(async () => {
    const { data } = await supabase.from('cardapio_itens').select('*').eq('pani_id', p.id).order('created_at', { ascending: false });
    setItens(data || []);
  }, [p.id]);
  useEffect(() => { load(); }, [load]);

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

/* ---------- Ajustes: dados, horários, localização, comentários ---------- */
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

  const reload = useCallback(async () => {
    const { data } = await supabase.from('panis').select('*').eq('owner', user.id).maybeSingle();
    setP(data);
  }, [user.id]);
  useEffect(() => { reload(); }, [reload]);

  const pid = p?.id;
  useEffect(() => {
    if (!pid) return;
    const load = async () => {
      const { data } = await supabase.from('pedidos').select('*').eq('pani_id', pid).in('status', ['novo', 'preparando', 'pronto']).order('created_at');
      setPedidos(data || []);
    };
    load();
    const ch = supabase.channel(`pedidos-${pid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `pani_id=eq.${pid}` }, (ev) => {
        if (ev.eventType === 'INSERT') { say(`🔔 Novo pedido — mesa ${ev.new.mesa}`); navigator.vibrate?.(200); }
        load();
      }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [pid, say]);

  const recarregarPedidos = async () => {
    const { data } = await supabase.from('pedidos').select('*').eq('pani_id', pid).in('status', ['novo', 'preparando', 'pronto']).order('created_at');
    setPedidos(data || []);
  };

  if (p === undefined) return <Shell top={<Logo />} nav={null}><Spinner /></Shell>;
  if (p === null) return <Shell top={<Logo />} nav={null}><Vazio t="Não encontramos sua panificadora. Fale com o suporte." /></Shell>;

  const T = [['painel', 'Painel', Home], ['pedidos', 'Pedidos', ClipboardList], ['cardapio', 'Cardápio', UtensilsCrossed], ['receitas', 'Receitas', BookOpen], ['clientes', 'Clientes', Users], ['chat', 'Chat', MessagesSquare], ['ajustes', 'Ajustes', Settings]];
  return (
    <Shell top={<><Logo /><span className="text-xs text-stone-500 truncate">{p.nome}</span></>}
      nav={T.map(([k, l, I]) => <NavBtn key={k} icon={I} label={l} on={tab === k} click={() => setTab(k)} badge={k === 'pedidos' ? pedidos.filter((o) => o.status === 'novo').length : 0} />)}>
      {tab === 'painel' && <Painel p={p} reload={reload} />}
      {tab === 'pedidos' && <Pedidos lista={pedidos} recarregar={recarregarPedidos} />}
      {tab === 'cardapio' && <CardapioAdm p={p} />}
      {tab === 'receitas' && <Receitas p={p} />}
      {tab === 'clientes' && <Clientes p={p} />}
      {tab === 'chat' && <Chat paniId={p.id} de="pani" />}
      {tab === 'ajustes' && <Ajustes p={p} reload={reload} />}
    </Shell>
  );
}
