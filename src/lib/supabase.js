import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(url && key);

// A sessão fica salva no localStorage (chave "apppani:auth") e é renovada sozinha.
export const supabase = createClient(url || 'http://localhost:54321', key || 'sem-chave', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'apppani:auth',
  },
});
