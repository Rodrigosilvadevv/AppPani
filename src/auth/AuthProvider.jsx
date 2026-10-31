import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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

  const refresh = useCallback(async (uid) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (data) { setPerfil(data); gravaCache(data); }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((ev, s) => {
      setSession(s);
      if (ev === 'PASSWORD_RECOVERY') setRecovery(true);
      if (s) setTimeout(() => refresh(s.user.id), 0); // fora do callback, como recomendado pelo Supabase
      else { setPerfil(null); gravaCache(null); }
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  const signOut = useCallback(async () => { await supabase.auth.signOut(); setPerfil(null); gravaCache(null); }, []);

  const value = useMemo(() => {
    const user = session?.user ?? null;
    const perfil = user && perfilRaw?.id === user.id ? perfilRaw : null;
    return { session, user, perfil, loading: session === undefined, recovery, setRecovery, signOut, refresh: () => user && refresh(user.id) };
  }, [session, perfilRaw, recovery, signOut, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
