import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, LayoutGrid, LogOut, Megaphone, MessagesSquare, ShieldCheck, Store, Trash2, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { Av, FotoBtn, NavBtn, Shell, Spinner, Vazio, btn, btn2, inp, useToast } from '../ui';
import { media } from '../lib/util';
import Chat from './Chat';

const PLANOS = { 'Básico': 49, Pro: 99, Premium: 149 };

function Panis({ panis, reload }) {
  const say = useToast();
  const receita = panis.reduce((a, p) => a + (PLANOS[p.plano] || 0), 0);
  const plano = async (id, v) => {
    const { error } = await supabase.rpc('set_plano', { p_id: id, p_plano: v });
    if (error) return say('Não foi possível alterar o plano.');
    reload();
  };
  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="rounded-xl bg-red-600 text-white p-3 text-sm">Receita mensal dos planos: <b>R$ {receita}</b> em {panis.length} panis</div>
      {panis.map((p) => (
        <div key={p.id} className="border border-stone-200 rounded-xl p-3">
          <div className="flex items-center gap-3">
            <Av src={p.foto_url} emoji={p.emoji} size={40} />
            <div className="flex-1"><div className="font-semibold text-sm">{p.nome}</div><div className="text-xs text-stone-500">/c/{p.slug} · nota {media(p.comentarios).toFixed(1).replace('.', ',')}</div></div>
          </div>
          <div className="text-xs text-stone-500 mt-2">{p.seguidores} seguidores</div>
          <label className="text-xs font-semibold mt-2 block">Plano
            <select className={`${inp} mt-1 font-normal`} value={p.plano} onChange={(e) => plano(p.id, e.target.value)}>
              {Object.entries(PLANOS).map(([k, v]) => <option key={k} value={k}>{k} (R$ {v}/mês)</option>)}
            </select>
          </label>
        </div>
      ))}
    </div>
  );
}

function Clientes() {
  const [l, setL] = useState(null);
  useEffect(() => { supabase.from('profiles').select('id, nome, foto_url, telefone, created_at').eq('role', 'cliente').order('created_at', { ascending: false }).then(({ data }) => setL(data || [])); }, []);
  if (!l) return <Spinner />;
  return (
    <div className="p-3">
      <p className="text-sm font-semibold mb-2">{l.length} clientes</p>
      {l.map((c) => (
        <div key={c.id} className="flex items-center gap-3 py-2">
          <Av src={c.foto_url} emoji={(c.nome || '?')[0]} size={36} />
          <div className="text-sm"><div className="font-semibold">{c.nome}</div>{c.telefone && <div className="text-xs text-stone-500">{c.telefone}</div>}</div>
        </div>
      ))}
    </div>
  );
}

function Avisos() {
  const say = useToast();
  const [l, setL] = useState([]);
  const [txt, setTxt] = useState('');
  const [img, setImg] = useState(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from('avisos').select('*, panis(nome)').order('created_at', { ascending: false });
    setL(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const publicar = async () => {
    if (!txt.trim()) return;
    const { error } = await supabase.from('avisos').insert({ pani_id: null, txt: txt.trim(), img_url: img, ativo: true });
    if (error) return say('Não foi possível publicar.');
    setTxt(''); setImg(null); load(); say('Aviso publicado para os clientes');
  };
  const alterna = async (a) => { await supabase.from('avisos').update({ ativo: !a.ativo }).eq('id', a.id); load(); };
  const apaga = async (a) => { await supabase.from('avisos').delete().eq('id', a.id); load(); };
  return (
    <div className="p-3">
      <div className="border border-stone-200 rounded-xl p-3 flex flex-col gap-2 mb-3">
        <div className="font-semibold text-sm">Novo aviso (imagem opcional)</div>
        <input className={inp} placeholder="Texto do aviso" value={txt} onChange={(e) => setTxt(e.target.value)} />
        <FotoBtn img={img} onUrl={setImg} />
        <button onClick={publicar} className={btn}>Publicar aviso</button>
      </div>
      {l.length === 0 && <Vazio t="Nenhum aviso ainda." />}
      {l.map((a) => (
        <div key={a.id} className="border border-stone-200 rounded-xl p-3 mb-2 text-sm">
          <div className="text-xs font-semibold text-red-700">{a.panis?.nome || 'Administração'}</div>
          {a.img_url && <img src={a.img_url} alt="" className="mt-2 rounded-lg max-h-40 w-full object-cover" />}
          <p className="my-1">{a.txt}</p>
          <div className="flex gap-2">
            <button onClick={() => alterna(a)} className={a.ativo ? btn : btn2}>{a.ativo ? 'No ar para clientes' : 'Mostrar aos clientes'}</button>
            <button aria-label="Excluir" onClick={() => apaga(a)} className={btn2}><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Cards do app: SOMENTE imagens
function Cards() {
  const say = useToast();
  const [l, setL] = useState([]);
  const [img, setImg] = useState(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from('cards').select('*').order('created_at', { ascending: false });
    setL(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const publicar = async () => {
    if (!img) return;
    const { error } = await supabase.from('cards').insert({ img_url: img });
    if (error) return say('Não foi possível publicar.');
    setImg(null); load(); say('Card publicado para os clientes');
  };
  return (
    <div className="p-3">
      <div className="border border-stone-200 rounded-xl p-3 flex flex-col gap-2 mb-3">
        <div className="font-semibold text-sm">Novo card (imagem)</div>
        <FotoBtn img={img} onUrl={setImg} label="Escolher imagem do card" />
        <p className="text-xs text-stone-500">Dica: use imagens horizontais (proporção 16:9).</p>
        <button onClick={publicar} disabled={!img} className={btn}>Publicar card</button>
      </div>
      {l.length === 0 && <Vazio t="Nenhum card publicado." />}
      <div className="flex flex-col gap-3">
        {l.map((c) => (
          <div key={c.id} className="relative">
            <img src={c.img_url} alt="" loading="lazy" className="w-full h-40 rounded-xl object-cover" />
            <button aria-label="Excluir" onClick={async () => { await supabase.from('cards').delete().eq('id', c.id); load(); }} className="absolute top-2 right-2 bg-white/90 rounded-full p-1.5"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Admin() {
  const { signOut } = useAuth();
  const [tab, setTab] = useState('panis');
  const [chat, setChat] = useState(null);
  const [panis, setPanis] = useState(null);
  const [ultimas, setUltimas] = useState({});

  const reload = useCallback(async () => {
    const { data } = await supabase.from('panis').select('*, comentarios(nota)').order('nome');
    setPanis(data || []);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (tab !== 'chat') return;
    supabase.from('mensagens').select('pani_id, txt, created_at').order('created_at', { ascending: false }).limit(300).then(({ data }) => {
      const u = {}; (data || []).forEach((m) => { u[m.pani_id] ||= m.txt; }); setUltimas(u);
    });
  }, [tab, chat]);

  if (!panis) return <Shell top={<ShieldCheck size={20} className="text-red-600" />} nav={null}><Spinner /></Shell>;
  const cp = panis.find((p) => p.id === chat);
  const T = [['panis', 'Panis', Store], ['clientes', 'Clientes', Users], ['chat', 'Conversas', MessagesSquare], ['avisos', 'Avisos', Megaphone], ['cards', 'Cards', LayoutGrid]];

  return (
    <Shell
      top={tab === 'chat' && cp
        ? <><button onClick={() => setChat(null)} aria-label="Voltar"><ChevronLeft size={22} /></button><span className="font-bold text-sm truncate">{cp.nome}</span></>
        : <><ShieldCheck size={20} className="text-red-600" /><span className="font-bold text-sm">Administração</span><button onClick={signOut} className="ml-auto" aria-label="Sair"><LogOut size={18} /></button></>}
      nav={T.map(([k, l, I]) => <NavBtn key={k} icon={I} label={l} on={tab === k} click={() => { setTab(k); setChat(null); }} />)}>
      {tab === 'panis' && <Panis panis={panis} reload={reload} />}
      {tab === 'clientes' && <Clientes />}
      {tab === 'chat' && (cp ? <Chat paniId={cp.id} de="adm" /> : panis.map((p) => (
        <button key={p.id} onClick={() => setChat(p.id)} className="flex items-center gap-3 w-full text-left px-3 py-3 border-b border-stone-100">
          <Av src={p.foto_url} emoji={p.emoji} size={40} />
          <span className="flex-1 min-w-0"><span className="block font-semibold text-sm">{p.nome}</span><span className="block text-xs text-stone-500 truncate">{ultimas[p.id] || 'Sem mensagens'}</span></span>
        </button>
      )))}
      {tab === 'avisos' && <Avisos />}
      {tab === 'cards' && <Cards />}
    </Shell>
  );
}
