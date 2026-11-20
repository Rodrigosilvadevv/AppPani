import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, Flag, LayoutGrid, LogOut, Megaphone, MessagesSquare, Search, ShieldCheck,
  Store, Trash2, Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import {
  Av, Chip, FotoBtn, NavBtn, Shell, Spinner, Switch, Vazio, btn, btn2, card, inp, useConfirm, useToast,
} from '../ui';
import { media, money, notaFmt, tempo } from '../lib/util';
import { haptic } from '../lib/native';
import { useRevalidar } from '../lib/hooks';
import { validarTexto } from '../lib/moderacao';
import Chat from './Chat';

const PLANOS = { 'Básico': 49, Pro: 99, Premium: 149 };

/* =========================== PANIS =========================== */
function Panis({ panis, reload }) {
  const say = useToast();
  const [q, setQ] = useState('');
  const receita = panis.reduce((a, p) => a + (PLANOS[p.plano] || 0), 0);
  const ativas = panis.filter((p) => p.visivel !== false).length;

  const plano = async (id, v) => {
    const { error } = await supabase.rpc('set_plano', { p_id: id, p_plano: v });
    if (error) return say('Não foi possível alterar o plano.', 'erro');
    haptic('sucesso'); reload();
  };
  const visivel = async (p, v) => {
    const { error } = await supabase.from('panis').update({ visivel: v }).eq('id', p.id);
    if (error) return say('Não foi possível alterar.', 'erro');
    reload();
  };

  const L = panis.filter((p) => `${p.nome} ${p.slug}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="rounded-xl bg-red-600 text-white p-3 text-sm">
        Receita mensal dos planos: <b>{money(receita)}</b>
        <div className="text-xs text-red-100 mt-0.5">{panis.length} panis cadastradas · {ativas} visíveis no app</div>
      </div>
      <div className="flex items-center gap-2">
        <Search size={16} className="text-stone-400 shrink-0" />
        <input className={inp} placeholder="Buscar pani" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {L.length === 0 && <Vazio t="Nenhuma pani encontrada." />}
      {L.map((p) => (
        <div key={p.id} className={card}>
          <div className="flex items-center gap-3">
            <Av src={p.foto_url} emoji={p.emoji} size={40} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{p.nome}</div>
              <div className="text-xs text-stone-500 truncate">/c/{p.slug} · nota {notaFmt(media(p.comentarios))} · {p.seguidores || 0} seguidores{p.delivery ? ' · 🛵 delivery' : ''}</div>
            </div>
          </div>
          <label className="text-xs font-semibold mt-2 block">Plano
            <select className={`${inp} mt-1 font-normal`} value={p.plano || 'Básico'} onChange={(e) => plano(p.id, e.target.value)}>
              {Object.entries(PLANOS).map(([k, v]) => <option key={k} value={k}>{k} ({money(v)}/mês)</option>)}
            </select>
          </label>
          <div className="flex items-center gap-3 mt-2 text-xs">
            <span className="flex-1">{p.visivel === false ? 'Oculta do app' : 'Visível no app'}</span>
            <Switch on={p.visivel !== false} set={(v) => visivel(p, v)} label={`Visibilidade de ${p.nome}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* =========================== CLIENTES =========================== */
function Clientes() {
  const [l, setL] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    supabase.from('profiles').select('id, nome, foto_url, telefone, created_at')
      .eq('role', 'cliente').order('created_at', { ascending: false }).limit(1000)
      .then(({ data }) => setL(data || []));
  }, []);
  if (!l) return <Spinner />;
  const L = l.filter((c) => `${c.nome || ''} ${c.telefone || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-2">
        <Search size={16} className="text-stone-400 shrink-0" />
        <input className={inp} placeholder="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="text-sm font-semibold mb-2">{l.length} clientes</p>
      {L.map((c) => (
        <div key={c.id} className="flex items-center gap-3 py-2">
          <Av src={c.foto_url} emoji={(c.nome || '?')[0]} size={36} />
          <div className="text-sm flex-1 min-w-0">
            <div className="font-semibold truncate">{c.nome || 'Cliente'}</div>
            {c.telefone && <div className="text-xs text-stone-500">{c.telefone}</div>}
          </div>
          <span className="text-xs text-stone-400">{tempo(c.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

/* =========================== AVISOS =========================== */
function Avisos() {
  const say = useToast();
  const confirmar = useConfirm();
  const [l, setL] = useState(null);
  const [txt, setTxt] = useState('');
  const [img, setImg] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('avisos').select('*, panis(nome)').order('created_at', { ascending: false }).limit(100);
    setL(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const publicar = async () => {
    const erro = validarTexto(txt, { max: 200 });
    if (erro) return say(erro, 'erro');
    const { error } = await supabase.from('avisos').insert({ pani_id: null, txt: txt.trim(), img_url: img, ativo: true });
    if (error) return say('Não foi possível publicar.', 'erro');
    setTxt(''); setImg(null); load(); haptic('sucesso'); say('Aviso publicado para os clientes');
  };
  const alterna = async (a) => { await supabase.from('avisos').update({ ativo: !a.ativo }).eq('id', a.id); load(); };
  const apaga = async (a) => {
    if (!(await confirmar('Este aviso será removido.', { titulo: 'Apagar aviso?', ok: 'Apagar' }))) return;
    await supabase.from('avisos').delete().eq('id', a.id); load();
  };

  const pendentes = (l || []).filter((a) => !a.ativo).length;

  return (
    <div className="p-3">
      <div className={`${card} flex flex-col gap-2 mb-3`}>
        <div className="font-semibold text-sm">Novo aviso (imagem opcional)</div>
        <input className={inp} maxLength={200} placeholder="Texto do aviso" value={txt} onChange={(e) => setTxt(e.target.value)} />
        <FotoBtn img={img} onUrl={setImg} />
        <button onClick={publicar} className={btn}>Publicar aviso</button>
      </div>
      {pendentes > 0 && <p className="text-xs text-stone-500 mb-2">{pendentes} aviso(s) de panis aguardando aprovação.</p>}
      {l == null ? <Spinner /> : l.length === 0 ? <Vazio t="Nenhum aviso ainda." /> : l.map((a) => (
        <div key={a.id} className={`${card} mb-2 text-sm`}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-red-700 flex-1 truncate">{a.panis?.nome || 'Administração'}</span>
            <span className="text-xs text-stone-400">{tempo(a.created_at)}</span>
          </div>
          {a.img_url && <img src={a.img_url} alt="" loading="lazy" className="mt-2 rounded-lg max-h-40 w-full object-cover" />}
          <p className="my-1 break-words">{a.txt}</p>
          <div className="flex gap-2">
            <button onClick={() => alterna(a)} className={`flex-1 ${a.ativo ? btn : btn2}`}>{a.ativo ? 'No ar para clientes' : 'Mostrar aos clientes'}</button>
            <button aria-label="Excluir aviso" onClick={() => apaga(a)} className={btn2}><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* =========================== CARDS (só imagem) =========================== */
function Cards() {
  const say = useToast();
  const confirmar = useConfirm();
  const [l, setL] = useState(null);
  const [img, setImg] = useState(null);
  const [link, setLink] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('cards').select('*').order('created_at', { ascending: false }).limit(100);
    setL(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const publicar = async () => {
    if (!img) return;
    if (link && !/^https?:\/\//i.test(link)) return say('O link deve começar com https://', 'erro');
    const { error } = await supabase.from('cards').insert({ img_url: img, link: link.trim() || null });
    if (error) return say('Não foi possível publicar.', 'erro');
    setImg(null); setLink(''); load(); haptic('sucesso'); say('Card publicado para os clientes');
  };
  const apagar = async (c) => {
    if (!(await confirmar('Este card sai do app.', { titulo: 'Apagar card?', ok: 'Apagar' }))) return;
    await supabase.from('cards').delete().eq('id', c.id); load();
  };

  return (
    <div className="p-3">
      <div className={`${card} flex flex-col gap-2 mb-3`}>
        <div className="font-semibold text-sm">Novo card (imagem)</div>
        <FotoBtn img={img} onUrl={setImg} label="Escolher imagem do card" />
        <input className={inp} placeholder="Link ao tocar (opcional)" value={link} onChange={(e) => setLink(e.target.value)} />
        <p className="text-xs text-stone-500">Use imagens horizontais (16:9). Elas aparecem no topo do app do cliente.</p>
        <button onClick={publicar} disabled={!img} className={btn}>Publicar card</button>
      </div>
      {l == null ? <Spinner /> : l.length === 0 ? <Vazio t="Nenhum card publicado." /> : (
        <div className="flex flex-col gap-3">
          {l.map((c) => (
            <div key={c.id} className="relative">
              <img src={c.img_url} alt="" loading="lazy" className="w-full h-40 rounded-xl object-cover" />
              <button aria-label="Excluir card" onClick={() => apagar(c)} className="absolute top-2 right-2 bg-white/90 rounded-full p-2"><Trash2 size={14} /></button>
              {c.link && <span className="absolute bottom-2 left-2 bg-white/90 rounded-full px-2 py-0.5 text-[11px] truncate max-w-[80%]">{c.link}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================== MODERAÇÃO =========================== */
const MOTIVO_TXT = {
  spam: 'Spam ou propaganda', ofensivo: 'Ofensivo ou de ódio', falso: 'Informação falsa',
  impropio: 'Impróprio ou adulto', outro: 'Outro motivo',
};
const TABELA = { fornada: 'fornadas', post: 'posts', comentario: 'comentarios_post' };

function Moderacao({ panis }) {
  const say = useToast();
  const confirmar = useConfirm();
  const [l, setL] = useState(null);
  const [f, setF] = useState('aberta');

  const load = useCallback(async () => {
    const { data } = await supabase.from('denuncias').select('*').order('created_at', { ascending: false }).limit(200);
    setL(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  useRevalidar(load, 30000);

  const nomePani = (id) => panis.find((p) => p.id === id)?.nome || '—';

  const resolver = async (d, status) => {
    const { error } = await supabase.from('denuncias').update({ status }).eq('id', d.id);
    if (error) return say('Não foi possível atualizar.', 'erro');
    load();
  };
  const removerConteudo = async (d) => {
    const tabela = TABELA[d.tipo];
    if (!tabela) return say('Este tipo de denúncia não tem conteúdo para remover.', 'erro');
    if (!(await confirmar('O conteúdo denunciado será apagado para todos e a denúncia marcada como resolvida.', { titulo: 'Remover conteúdo?', ok: 'Remover' }))) return;
    const { error } = await supabase.from(tabela).delete().eq('id', d.item_id);
    if (error) return say('Não foi possível remover o conteúdo.', 'erro');
    await supabase.from('denuncias').update({ status: 'removida' }).eq('id', d.id);
    load(); say('Conteúdo removido');
  };

  const L = useMemo(() => (l || []).filter((d) => (f === 'todas' ? true : f === 'aberta' ? (d.status || 'aberta') === 'aberta' : d.status === f)), [l, f]);
  const abertas = (l || []).filter((d) => (d.status || 'aberta') === 'aberta').length;

  return (
    <div className="p-3">
      <div className="rounded-xl bg-stone-900 text-white p-3 text-sm mb-3">
        <b>{abertas}</b> denúncia(s) aberta(s)
        <div className="text-xs text-stone-300 mt-0.5">Analise em até 24 h: é o que as lojas exigem de apps com conteúdo de usuários.</div>
      </div>
      <div className="flex gap-2 overflow-x-auto mb-2">
        {[['aberta', 'Abertas'], ['removida', 'Removidas'], ['ok', 'Sem problema'], ['todas', 'Todas']].map(([k, lb]) => (
          <Chip key={k} on={f === k} onClick={() => setF(k)}>{lb}</Chip>
        ))}
      </div>
      {l == null ? <Spinner /> : L.length === 0 ? <Vazio t="Nada por aqui. Fila limpa 🎉" /> : L.map((d) => (
        <div key={d.id} className={`${card} mb-2 text-sm`}>
          <div className="flex items-center gap-2">
            <Flag size={14} className="text-red-600 shrink-0" />
            <b className="flex-1 truncate">{MOTIVO_TXT[d.motivo] || d.motivo}</b>
            <span className="text-xs text-stone-400">{tempo(d.created_at)}</span>
          </div>
          <div className="text-xs text-stone-500 mt-1">
            {d.tipo} · {nomePani(d.pani_id)} · item <span className="font-mono">{String(d.item_id).slice(0, 8)}</span>
          </div>
          {d.detalhe && <p className="mt-1 bg-stone-50 rounded px-2 py-1 break-words">{d.detalhe}</p>}
          {(d.status || 'aberta') === 'aberta' ? (
            <div className="flex gap-2 mt-2">
              <button onClick={() => removerConteudo(d)} className={`flex-1 ${btn}`}>Remover conteúdo</button>
              <button onClick={() => resolver(d, 'ok')} className={`flex-1 ${btn2}`}>Sem problema</button>
            </div>
          ) : (
            <p className="text-xs font-semibold text-stone-500 mt-2">{d.status === 'removida' ? 'Conteúdo removido' : 'Analisada: sem problema'}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* =========================== APP DO ADMIN =========================== */
export default function Admin() {
  const { signOut } = useAuth();
  const [tab, setTab] = useState('panis');
  const [chat, setChat] = useState(null);
  const [panis, setPanis] = useState(null);
  const [ultimas, setUltimas] = useState({});
  const [abertas, setAbertas] = useState(0);

  const reload = useCallback(async () => {
    const { data } = await supabase.from('panis').select('*, comentarios(nota)').order('nome');
    setPanis(data || []);
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // contador de denúncias abertas no menu
  const contarDenuncias = useCallback(async () => {
    const { count } = await supabase.from('denuncias').select('id', { count: 'exact', head: true }).eq('status', 'aberta');
    setAbertas(count || 0);
  }, []);
  useEffect(() => { contarDenuncias(); }, [contarDenuncias, tab]);
  useRevalidar(contarDenuncias, 30000);

  useEffect(() => {
    if (tab !== 'chat') return;
    supabase.from('mensagens').select('pani_id, txt, created_at').order('created_at', { ascending: false }).limit(500)
      .then(({ data }) => {
        const u = {};
        (data || []).forEach((m) => { u[m.pani_id] ||= m.txt; });
        setUltimas(u);
      });
  }, [tab, chat]);

  if (!panis) return <Shell top={<ShieldCheck size={20} className="text-red-600" />} nav={null}><Spinner /></Shell>;

  const cp = panis.find((p) => p.id === chat);
  const T = [
    ['panis', 'Panis', Store], ['clientes', 'Clientes', Users], ['chat', 'Conversas', MessagesSquare],
    ['moderacao', 'Moderar', Flag], ['avisos', 'Avisos', Megaphone], ['cards', 'Cards', LayoutGrid],
  ];

  return (
    <Shell
      top={tab === 'chat' && cp
        ? <><button onClick={() => setChat(null)} aria-label="Voltar"><ChevronLeft size={22} /></button><span className="font-bold text-sm truncate">{cp.nome}</span></>
        : <>
            <ShieldCheck size={20} className="text-red-600" />
            <span className="font-bold text-sm flex-1">Administração</span>
            <button onClick={signOut} aria-label="Sair"><LogOut size={18} /></button>
          </>}
      nav={T.map(([k, l, I]) => (
        <NavBtn key={k} icon={I} label={l} on={tab === k} click={() => { setTab(k); setChat(null); }} badge={k === 'moderacao' ? abertas : 0} />
      ))}>
      {tab === 'panis' && <Panis panis={panis} reload={reload} />}
      {tab === 'clientes' && <Clientes />}
      {tab === 'chat' && (cp
        ? <Chat paniId={cp.id} de="adm" />
        : (
          <div>
            {panis.length === 0 && <Vazio t="Nenhuma pani cadastrada ainda." />}
            {panis.map((p) => (
              <button key={p.id} onClick={() => setChat(p.id)} className="flex items-center gap-3 w-full text-left px-3 py-3 border-b border-stone-100">
                <Av src={p.foto_url} emoji={p.emoji} size={40} />
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-sm truncate">{p.nome}</span>
                  <span className="block text-xs text-stone-500 truncate">{ultimas[p.id] || 'Sem mensagens'}</span>
                </span>
              </button>
            ))}
          </div>
        ))}
      {tab === 'moderacao' && <Moderacao panis={panis} />}
      {tab === 'avisos' && <Avisos />}
      {tab === 'cards' && <Cards />}
    </Shell>
  );
}
