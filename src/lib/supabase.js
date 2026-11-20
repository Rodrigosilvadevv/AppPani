import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(url && key);

// A sessão fica salva no localStorage (chave "apppani:auth") e é renovada sozinha.
// flowType "implicit": o link de recuperação de senha funciona em qualquer navegador/aparelho
// e o login social nativo volta para o app por deep link (ver NativeBridge).
export const supabase = createClient(url || 'http://localhost:54321', key || 'sem-chave', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
    storageKey: 'apppani:auth',
  },
  realtime: { params: { eventsPerSecond: 10 } },
});
