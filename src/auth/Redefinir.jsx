import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';
import { Logo, Spinner, inp, btn, useToast } from '../ui';
import { SENHA_MIN } from '../config';

// Tela de nova senha. Abre pelo link do e-mail (/redefinir-senha).
export default function Redefinir() {
  const { session, loading, setRecovery } = useAuth();
  const nav = useNavigate();
  const say = useToast();
  const [s1, setS1] = useState('');
  const [s2, setS2] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const [espera, setEspera] = useState(true);
  useEffect(() => { const t = setTimeout(() => setEspera(false), 4000); return () => clearTimeout(t); }, []);

  if (!session) {
    return (espera || loading) ? <Spinner /> : (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-8 text-center">
        <Logo />
        <p className="text-sm text-stone-600">Link inválido ou expirado. Peça um novo na tela de login.</p>
        <Link to="/" onClick={() => setRecovery(false)} className={btn}>Ir para o login</Link>
      </div>
    );
  }

  const salvar = async (e) => {
    e.preventDefault();
    if (s1.length < SENHA_MIN) return setErro(`A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`);
    if (s1 !== s2) return setErro('As senhas não conferem.');
    setBusy(true); setErro('');
    const { error } = await supabase.auth.updateUser({ password: s1 });
    setBusy(false);
    if (error) return setErro(error.message.includes('different from the old') ? 'Escolha uma senha diferente da anterior.' : error.message);
    setRecovery(false);
    say('Senha alterada com sucesso ✅');
    nav('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-stone-100 flex justify-center">
      <form onSubmit={salvar} className="w-full max-w-md bg-white px-6 py-10 flex flex-col gap-3" style={{ paddingTop: 'max(2.5rem, env(safe-area-inset-top))' }}>
        <div className="text-center mb-2"><Logo /><p className="text-sm text-stone-600 mt-1">Crie uma nova senha</p></div>
        <input className={inp} type="password" required placeholder="Nova senha" value={s1} onChange={(e) => setS1(e.target.value)} autoComplete="new-password" minLength={SENHA_MIN} />
        <input className={inp} type="password" required placeholder="Repita a nova senha" value={s2} onChange={(e) => setS2(e.target.value)} autoComplete="new-password" minLength={SENHA_MIN} />
        {erro && <p role="alert" className="text-sm bg-red-50 text-red-700 rounded-lg px-3 py-2">{erro}</p>}
        <button className={btn} disabled={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
      </form>
    </div>
  );
}
