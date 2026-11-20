import { useCallback, useEffect, useState } from 'react';
import { Flag, Heart, MessageCircle, MoreHorizontal, Share2, Trash2, UserX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { Sheet, btn, btn2, inp, useConfirm, useToast } from '../ui';
import { compartilhar, haptic } from '../lib/native';
import { validarTexto } from '../lib/moderacao';
import { APP_URL } from '../config';
import { tempo } from '../lib/util';

/* ===================== curtidas ===================== */
/**
 * Curtidas otimistas: o coração pinta na hora e o banco é atualizado em seguida.
 * Tabela `curtidas` (user_id, tipo 'fornada'|'post', item_id). Ver SQL em supabase/migrations.
 */
export function useCurtidas(itens) {
  const { user } = useAuth();
  const [meus, setMeus] = useState(() => new Set());
  const [contas, setContas] = useState({});

  const chaves = itens.map((i) => `${i.tipo}:${i.id}`).join(',');

  const carregar = useCallback(async () => {
    if (!user || !chaves) { setMeus(new Set()); setContas({}); return; }
    const ids = chaves.split(',').map((k) => k.split(':')[1]);
    const { data } = await supabase.from('curtidas').select('item_id, tipo, user_id').in('item_id', ids);
    if (!data) return;
    const c = {}; const m = new Set();
    data.forEach((x) => {
      const k = `${x.tipo}:${x.item_id}`;
      c[k] = (c[k] || 0) + 1;
      if (x.user_id === user.id) m.add(k);
    });
    setContas(c); setMeus(m);
  }, [user, chaves]);
  useEffect(() => { carregar(); }, [carregar]);

  const curtir = useCallback(async (it) => {
    if (!user) return;
    const k = `${it.tipo}:${it.id}`;
    const tinha = meus.has(k);
    haptic();
    setMeus((s) => { const n = new Set(s); tinha ? n.delete(k) : n.add(k); return n; });
    setContas((c) => ({ ...c, [k]: Math.max(0, (c[k] || 0) + (tinha ? -1 : 1)) }));
    const { error } = tinha
      ? await supabase.from('curtidas').delete().eq('user_id', user.id).eq('tipo', it.tipo).eq('item_id', it.id)
      : await supabase.from('curtidas').insert({ user_id: user.id, tipo: it.tipo, item_id: it.id });
    if (error) carregar(); // deu errado: volta ao que o banco diz
  }, [user, meus, carregar]);

  return {
    curtiu: (it) => meus.has(`${it.tipo}:${it.id}`),
    total: (it) => contas[`${it.tipo}:${it.id}`] || 0,
    curtir,
  };
}

export const BotaoCurtir = ({ on, total, onClick }) => (
  <button onClick={onClick} aria-pressed={on} aria-label={on ? 'Remover curtida' : 'Curtir'}
    className="flex items-center gap-1.5 text-sm text-stone-600 active:opacity-60 py-1">
    <Heart size={20} className={on ? 'fill-red-600 text-red-600' : ''} />
    {total > 0 && <span className={on ? 'text-red-600 font-semibold' : ''}>{total}</span>}
  </button>
);

/** Quantos comentários cada publicação tem (uma consulta só para a lista inteira). */
export function useContagemComentarios(itens, dependencia = 0) {
  const [contas, setContas] = useState({});
  const chaves = itens.map((i) => `${i.tipo}:${i.id}`).join(',');

  useEffect(() => {
    let vivo = true;
    if (!chaves) { setContas({}); return; }
    const ids = chaves.split(',').map((k) => k.split(':')[1]);
    supabase.from('comentarios_post').select('item_id, tipo').in('item_id', ids).then(({ data }) => {
      if (!vivo || !data) return;
      const c = {};
      data.forEach((x) => { const k = `${x.tipo}:${x.item_id}`; c[k] = (c[k] || 0) + 1; });
      setContas(c);
    });
    return () => { vivo = false; };
  }, [chaves, dependencia]);

  return (it) => contas[`${it.tipo}:${it.id}`] || 0;
}

/* ===================== bloqueios ===================== */
/** Lista de panis que o cliente bloqueou — o feed e o Explorar escondem essas panis. */
export function useBloqueios() {
  const { user } = useAuth();
  const [ids, setIds] = useState([]);
  const carregar = useCallback(async () => {
    if (!user) return setIds([]);
    const { data } = await supabase.from('bloqueios').select('pani_id').eq('user_id', user.id);
    setIds((data || []).map((x) => x.pani_id));
  }, [user]);
  useEffect(() => { carregar(); }, [carregar]);

  const bloquear = async (paniId) => {
    if (!user) return false;
    setIds((l) => [...new Set([...l, paniId])]);
    const { error } = await supabase.from('bloqueios').insert({ user_id: user.id, pani_id: paniId });
    if (error) { carregar(); return false; }
    return true;
  };
  const desbloquear = async (paniId) => {
    setIds((l) => l.filter((x) => x !== paniId));
    await supabase.from('bloqueios').delete().eq('user_id', user.id).eq('pani_id', paniId);
    carregar();
  };
  return { bloqueados: ids, bloquear, desbloquear, recarregar: carregar };
}

/* ===================== denúncia ===================== */
const MOTIVOS = [
  ['spam', 'Spam ou propaganda'],
  ['ofensivo', 'Conteúdo ofensivo ou de ódio'],
  ['falso', 'Informação falsa'],
  ['impropio', 'Conteúdo impróprio ou adulto'],
  ['outro', 'Outro motivo'],
];

export function SheetDenuncia({ alvo, fechar }) {
  const { user } = useAuth();
  const say = useToast();
  const [motivo, setMotivo] = useState('spam');
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);

  const enviar = async () => {
    const erro = validarTexto(txt, { max: 400, obrigatorio: false });
    if (erro) return say(erro, 'erro');
    setBusy(true);
    const { error } = await supabase.from('denuncias').insert({
      user_id: user?.id ?? null,
      tipo: alvo.tipo,          // 'fornada' | 'post' | 'comentario' | 'pani'
      item_id: alvo.id,
      pani_id: alvo.paniId ?? null,
      motivo,
      detalhe: txt.trim(),
    });
    setBusy(false);
    if (error) return say('Não foi possível enviar a denúncia.', 'erro');
    fechar();
    say('Denúncia enviada. Nossa equipe analisa em até 24 h.');
  };

  return (
    <Sheet aberto={Boolean(alvo)} fechar={fechar} titulo="Denunciar conteúdo">
      <p className="text-sm text-stone-600">Conte o que está errado. A análise é feita por uma pessoa da equipe em até 24 horas.</p>
      <div className="flex flex-col gap-1 my-3">
        {MOTIVOS.map(([k, l]) => (
          <label key={k} className="flex items-center gap-3 py-2 text-sm">
            <input type="radio" name="motivo" value={k} checked={motivo === k} onChange={() => setMotivo(k)} className="accent-red-600 w-4 h-4" />
            {l}
          </label>
        ))}
      </div>
      <textarea className={inp} rows={3} maxLength={400} placeholder="Detalhes (opcional)" value={txt} onChange={(e) => setTxt(e.target.value)} />
      <div className="flex gap-2 mt-3">
        <button onClick={fechar} className={`flex-1 ${btn2}`}>Cancelar</button>
        <button onClick={enviar} disabled={busy} className={`flex-1 ${btn}`}>{busy ? 'Enviando…' : 'Enviar denúncia'}</button>
      </div>
    </Sheet>
  );
}

/* ===================== menu "⋯" de cada publicação ===================== */
/**
 * props:
 *  item     { id, tipo, pani_id }
 *  pani     { id, nome, slug }
 *  apagar   função (só aparece para quem é dono do conteúdo)
 *  bloquear função (cliente) — recebe o id da pani
 */
export function MenuItem({ item, pani, apagar, bloquear }) {
  const [aberto, setAberto] = useState(false);
  const [denuncia, setDenuncia] = useState(null);
  const confirmar = useConfirm();
  const say = useToast();

  const share = async () => {
    setAberto(false);
    const r = await compartilhar({
      title: pani?.nome || 'AppPani',
      text: pani?.nome ? `Olha a fornada da ${pani.nome} no AppPani 🥖` : 'Olha isso no AppPani 🥖',
      url: pani?.slug ? `${APP_URL}/c/${pani.slug}` : APP_URL,
    });
    if (r === 'copiado') say('Link copiado');
  };

  const pedeBloqueio = async () => {
    setAberto(false);
    if (!(await confirmar(`Você não verá mais as publicações da ${pani?.nome}. Pode desfazer em Ajustes.`, { titulo: 'Bloquear esta pani?', ok: 'Bloquear' }))) return;
    const ok = await bloquear(pani.id);
    say(ok ? `${pani.nome} bloqueada` : 'Não foi possível bloquear.', ok ? 'info' : 'erro');
  };

  const pedeApagar = async () => {
    setAberto(false);
    if (!(await confirmar('Essa publicação será removida para todos.', { titulo: 'Apagar publicação?', ok: 'Apagar' }))) return;
    apagar(item);
  };

  return (
    <>
      <button onClick={() => setAberto(true)} aria-label="Mais opções" className="p-1.5 -mr-1.5 text-stone-400">
        <MoreHorizontal size={18} />
      </button>
      <Sheet aberto={aberto} fechar={() => setAberto(false)} titulo="Opções">
        <div className="flex flex-col">
          <button onClick={share} className="flex items-center gap-3 py-3 text-sm text-left"><Share2 size={18} />Compartilhar</button>
          {apagar && <button onClick={pedeApagar} className="flex items-center gap-3 py-3 text-sm text-left text-red-700"><Trash2 size={18} />Apagar publicação</button>}
          {!apagar && (
            <>
              <button onClick={() => { setAberto(false); setDenuncia({ tipo: item.tipo, id: item.id, paniId: item.pani_id }); }}
                className="flex items-center gap-3 py-3 text-sm text-left text-red-700"><Flag size={18} />Denunciar</button>
              {bloquear && pani && (
                <button onClick={pedeBloqueio} className="flex items-center gap-3 py-3 text-sm text-left text-red-700"><UserX size={18} />Bloquear {pani.nome}</button>
              )}
            </>
          )}
        </div>
      </Sheet>
      {denuncia && <SheetDenuncia alvo={denuncia} fechar={() => setDenuncia(null)} />}
    </>
  );
}

/* ===================== comentários de uma publicação ===================== */
export const BotaoComentar = ({ total, onClick }) => (
  <button onClick={onClick} aria-label="Comentários" className="flex items-center gap-1.5 text-sm text-stone-600 active:opacity-60 py-1">
    <MessageCircle size={20} />{total > 0 && <span>{total}</span>}
  </button>
);

/** Gaveta com os comentários de uma fornada/post (rede social de verdade: dá conversa). */
export function SheetComentarios({ item, pani, fechar, aoMudar }) {
  const { user, perfil } = useAuth();
  const say = useToast();
  const confirmar = useConfirm();
  const [lista, setLista] = useState(null);
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('comentarios_post')
      .select('*').eq('tipo', item.tipo).eq('item_id', item.id).order('created_at');
    setLista(data || []);
  }, [item.tipo, item.id]);
  useEffect(() => { carregar(); }, [carregar]);

  const enviar = async () => {
    const erro = validarTexto(txt, { max: 300 });
    if (erro) return say(erro, 'erro');
    setBusy(true);
    const { error } = await supabase.from('comentarios_post').insert({
      tipo: item.tipo, item_id: item.id, pani_id: item.pani_id,
      user_id: user.id, autor: perfil?.nome || 'Cliente', txt: txt.trim(),
    });
    setBusy(false);
    if (error) return say('Não foi possível comentar.', 'erro');
    setTxt(''); carregar(); aoMudar?.(); haptic('sucesso');
  };

  const apagar = async (c) => {
    if (!(await confirmar('Apagar seu comentário?', { ok: 'Apagar' }))) return;
    await supabase.from('comentarios_post').delete().eq('id', c.id);
    carregar(); aoMudar?.();
  };

  return (
    <Sheet aberto fechar={fechar} titulo={`Comentários · ${pani?.nome || ''}`}>
      {lista == null ? <p className="text-sm text-stone-500 py-6 text-center">Carregando…</p>
        : lista.length === 0 ? <p className="text-sm text-stone-500 py-6 text-center">Ninguém comentou ainda. Comece a conversa.</p>
        : (
          <div className="flex flex-col divide-y divide-stone-100 -mt-1">
            {lista.map((c) => (
              <div key={c.id} className="py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <b>{c.autor}</b>
                  <span className="text-xs text-stone-400 flex-1">{tempo(c.created_at)}</span>
                  {c.user_id === user?.id && (
                    <button onClick={() => apagar(c)} aria-label="Apagar comentário" className="text-stone-400"><Trash2 size={14} /></button>
                  )}
                </div>
                <p className="mt-0.5 break-words">{c.txt}</p>
              </div>
            ))}
          </div>
        )}
      <div className="flex gap-2 mt-3 sticky bottom-0 bg-white pt-2">
        <input className={inp} maxLength={300} placeholder="Escreva um comentário" value={txt}
          onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !busy && enviar()} />
        <button onClick={enviar} disabled={busy} className={btn}>Enviar</button>
      </div>
    </Sheet>
  );
}
