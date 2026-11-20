import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

const CACHE = 'apppani:perfil'; // perfil do usuário salvo no localStorage (abre o app instantaneamente)
const lerCache = () => { try { return JSON.parse(localStorage.getItem(CACHE)); } catch { return null; } };
const gravaCache = (p) => { try { p ? localStorage.setItem(CACHE, JSON.stringify(p)) : localStorage.removeItem(CACHE); } catch { /* ignora */ } };

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = ainda carregando
  const [perfilRaw, setPerfil] = useState(lerCache);
  const [recovery, setRecovery] = useState(false);
  const [erroPerfil, setErroPerfil] = useState(false);
  const tentativas = useRef(0);

  const refresh = useCallback(async (uid) => {
    if (!uid) return null;
    // o gatilho do banco cria o perfil no cadastro; em redes lentas ele pode demorar alguns instantes
    for (let i = 0; i < 6; i++) {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
      if (data) {
        setPerfil(data); gravaCache(data); setErroPerfil(false); tentativas.current = 0;
        return data;
      }
      if (error && error.code !== 'PGRST116') break;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
    setErroPerfil(true);
    return null;
  }, []);

  useEffect(() => {
    let vivo = true;

    // 1) sessão que já estava salva no aparelho
    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      setSession(data.session ?? null);
      if (data.session) refresh(data.session.user.id);
    });

    // 2) mudanças (login, logout, troca de token, recuperação de senha)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((ev, s) => {
      if (!vivo) return;
      setSession(s);
      if (ev === 'PASSWORD_RECOVERY') setRecovery(true);
      if (s) {
        if (ev !== 'TOKEN_REFRESHED') setTimeout(() => refresh(s.user.id), 0); // fora do callback, como recomendado pelo Supabase
      } else {
        setPerfil(null); gravaCache(null); setErroPerfil(false);
      }
    });
    return () => { vivo = false; subscription.unsubscribe(); };
  }, [refresh]);

  const signOut = useCallback(async () => {
    setPerfil(null); gravaCache(null);
    try { await supabase.auth.signOut(); } catch { /* já estava fora */ }
    try { localStorage.removeItem('apppani:push'); } catch { /* ignora */ }
  }, []);

  const value = useMemo(() => {
    const user = session?.user ?? null;
    const perfil = user && perfilRaw?.id === user.id ? perfilRaw : null;
    return {
      session, user, perfil,
      loading: session === undefined,
      erroPerfil,
      recovery, setRecovery, signOut,
      refresh: () => (user ? refresh(user.id) : Promise.resolve(null)),
    };
  }, [session, perfilRaw, recovery, signOut, refresh, erroPerfil]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
