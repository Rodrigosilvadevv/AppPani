import { useCallback, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner, Vazio, inp, btn, useToast } from '../ui';
import { validarTexto } from '../lib/moderacao';
import { haptic } from '../lib/native';

// Conversa permanente pani <-> administrador (tempo real)
export default function Chat({ paniId, de }) {
  const say = useToast();
  const [msgs, setMsgs] = useState(null);
  const [t, setT] = useState('');
  const [enviando, setEnviando] = useState(false);
  const fim = useRef(null);

  const juntar = useCallback((nova) => {
    setMsgs((m) => {
      const base = m || [];
      if (base.some((x) => x.id === nova.id)) return base;
      return [...base.filter((x) => !String(x.id).startsWith('tmp:') || x.txt !== nova.txt), nova];
    });
  }, []);

  useEffect(() => {
    let vivo = true;
    setMsgs(null);
    supabase.from('mensagens').select('*').eq('pani_id', paniId).order('created_at').limit(300)
      .then(({ data }) => vivo && setMsgs(data || []));
    const ch = supabase.channel(`msg-${paniId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `pani_id=eq.${paniId}` },
        (p) => juntar(p.new))
      .subscribe();
    return () => { vivo = false; supabase.removeChannel(ch); };
  }, [paniId, juntar]);

  // rola para a última mensagem
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [msgs]);

  const go = async () => {
    const txt = t.trim();
    const erro = validarTexto(txt, { max: 1000 });
    if (erro) return say(erro, 'erro');
    setT(''); setEnviando(true);
    const tmp = { id: `tmp:${Date.now()}`, pani_id: paniId, de, txt, created_at: new Date().toISOString(), pendente: true };
    setMsgs((m) => [...(m || []), tmp]);
    const { data, error } = await supabase.from('mensagens').insert({ pani_id: paniId, de, txt }).select('*').single();
    setEnviando(false);
    if (error) {
      setMsgs((m) => (m || []).filter((x) => x.id !== tmp.id));
      setT(txt);
      return say('Não foi possível enviar. Tente de novo.', 'erro');
    }
    setMsgs((m) => (m || []).map((x) => (x.id === tmp.id ? data : x)));
    haptic();
  };

  if (msgs == null) return <Spinner />;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 p-3">
        {msgs.length === 0 && <Vazio t="Nenhuma mensagem ainda. As conversas ficam salvas aqui." />}
        {msgs.map((m) => (
          <div key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.de === de ? 'self-end bg-red-600 text-white' : 'self-start bg-stone-100'} ${m.pendente ? 'opacity-60' : ''}`}>
            <span data-selecionavel className="whitespace-pre-wrap break-words">{m.txt}</span>
            <div className={`text-[10px] mt-0.5 ${m.de === de ? 'text-red-100' : 'text-stone-400'}`}>
              {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
        <div ref={fim} />
      </div>
      <div className="shrink-0 flex gap-2 p-2 border-t border-stone-200">
        <input className={inp} placeholder="Mensagem" value={t} maxLength={1000} enterKeyHint="send"
          onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !enviando && go()} />
        <button onClick={go} disabled={enviando} aria-label="Enviar" className={btn}><Send size={16} /></button>
      </div>
    </div>
  );
}
