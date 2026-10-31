import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Vazio, inp, btn } from '../ui';

// Conversa permanente pani <-> administrador (tempo real)
export default function Chat({ paniId, de }) {
  const [msgs, setMsgs] = useState([]);
  const [t, setT] = useState('');

  useEffect(() => {
    let vivo = true;
    supabase.from('mensagens').select('*').eq('pani_id', paniId).order('created_at').then(({ data }) => vivo && setMsgs(data || []));
    const ch = supabase.channel(`msg-${paniId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `pani_id=eq.${paniId}` },
        (p) => setMsgs((m) => (m.some((x) => x.id === p.new.id) ? m : [...m, p.new])))
      .subscribe();
    return () => { vivo = false; supabase.removeChannel(ch); };
  }, [paniId]);

  const go = async () => {
    const txt = t.trim();
    if (!txt) return;
    setT('');
    const { error } = await supabase.from('mensagens').insert({ pani_id: paniId, de, txt });
    if (error) setT(txt);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col-reverse gap-2 p-3">
        {msgs.length === 0 && <Vazio t="Nenhuma mensagem ainda. As conversas ficam salvas aqui." />}
        {[...msgs].reverse().map((m) => (
          <div key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.de === de ? 'self-end bg-red-600 text-white' : 'self-start bg-stone-100'}`}>
            {m.txt}
            <div className={`text-[10px] mt-0.5 ${m.de === de ? 'text-red-100' : 'text-stone-400'}`}>
              {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
      </div>
      <div className="shrink-0 flex gap-2 p-2 border-t border-stone-200">
        <input className={inp} placeholder="Mensagem" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        <button onClick={go} aria-label="Enviar" className={btn}><Send size={16} /></button>
      </div>
    </div>
  );
}
