import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { fonePadrao } from '../lib/util';
import { Logo, inp, btn, btn2 } from '../ui';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
    <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

const ERROS = {
  'Invalid login credentials': 'E-mail/telefone ou senha incorretos.',
  'Email not confirmed': 'Conta ainda não liberada. Desligue "Confirm email" no Supabase.',
};

const traduz = (m = '') =>
  ERROS[m] ||
  (m.includes('rate limit') || m.includes('Too Many Requests')
    ? 'Muitas tentativas seguidas. Aguarde um pouco e tente novamente.'
    : m);

export default function Login({ admin = false }) {
  const [modo, setModo] = useState('entrar'); // entrar | criar
  const [via, setVia] = useState('email');    // email | fone
  const [f, setF] = useState({ nome: '', email: '', fone: '', senha: '', tipo: 'cliente' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const run = async (fn) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ erro: true, t: traduz(e.message) });
    } finally {
      setBusy(false);
    }
  };

  const troca = (m) => { setModo(m); setMsg(null); };

  const enviar = (e) => {
    e.preventDefault();
    run(async () => {
      // Telefone vira um login interno (sem SMS, sem verificação). O número real fica salvo no perfil.
      const digitos = fonePadrao(f.fone).replace(/\D/g, '');
      if (via === 'fone' && digitos.length < 12) throw new Error('Digite o telefone com DDD.');
      const email = via === 'email' ? f.email.trim().toLowerCase() : `${digitos}@fone.apppani.app`;

      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: f.senha });
        if (error) throw error;
        return;
      }

      if (!f.nome.trim()) throw new Error('Informe o nome.');
      if (f.senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');

      const { data, error } = await supabase.auth.signUp({
        email,
        password: f.senha,
        options: { data: { nome: f.nome.trim(), role: f.tipo, telefone: via === 'fone' ? fonePadrao(f.fone) : null } },
      });
      if (error) {
        if (/already registered/i.test(error.message)) {
          setModo('entrar');
          throw new Error(`Já existe uma conta com ${via === 'email' ? 'esse e-mail' : 'esse telefone'}. Faça o login.`);
        }
        throw error;
      }
      // Se já existir e o Supabase devolver usuário sem identidade, também manda para o login
      if (data.user && data.user.identities?.length === 0) {
        setModo('entrar');
        throw new Error(`Já existe uma conta com ${via === 'email' ? 'esse e-mail' : 'esse telefone'}. Faça o login.`);
      }
      if (!data.session) throw new Error('Conta criada, mas o Supabase ainda exige confirmação. Desligue "Confirm email" em Authentication → Providers → Email.');
    });
  };

  const google = () => run(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href.split(/[?#]/)[0] },
    });
    if (error) throw error;
  });

  return (
    <div className="min-h-full bg-stone-100 flex justify-center">
      <div className="w-full max-w-md min-h-screen bg-white px-6 py-10 flex flex-col gap-4" style={{ paddingTop: 'max(2.5rem, env(safe-area-inset-top))' }}>
        <div className="text-center">
          <div className="text-5xl">🥖</div><Logo />
          <p className="text-sm text-stone-600 mt-1">{admin ? 'Administração' : 'Saiu pão fresco? Você fica sabendo.'}</p>
        </div>

        {!admin && (
          <div className="flex border-b border-stone-200">
            {[['entrar', 'Entrar'], ['criar', 'Criar conta']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => troca(k)} className={`flex-1 py-2.5 text-sm font-semibold border-b-2 ${modo === k ? 'border-stone-900' : 'border-transparent text-stone-400'}`}>{l}</button>
            ))}
          </div>
        )}

        <button type="button" onClick={google} disabled={busy} className={`${btn2} flex items-center justify-center gap-2`}><GoogleIcon />Continuar com Google</button>
        <div className="flex items-center gap-3 text-xs text-stone-400"><span className="flex-1 h-px bg-stone-200" />ou<span className="flex-1 h-px bg-stone-200" /></div>

        <div className="flex gap-2">
          {[['email', 'E-mail'], ['fone', 'Telefone']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setVia(k); setMsg(null); }}
              className={`flex-1 rounded-full py-1.5 text-xs border ${via === k ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300'}`}>{l}</button>
          ))}
        </div>

        <form onSubmit={enviar} className="flex flex-col gap-3">
          {modo === 'criar' && (
            <>
              <div className="flex gap-2">
                {[['cliente', 'Sou cliente'], ['pani', 'Sou panificadora']].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setF({ ...f, tipo: k })}
                    className={`flex-1 rounded-lg py-2 text-sm border ${f.tipo === k ? 'bg-red-600 text-white border-red-600' : 'border-stone-300'}`}>{l}</button>
                ))}
              </div>
              <input className={inp} placeholder={f.tipo === 'pani' ? 'Nome da panificadora' : 'Seu nome'} value={f.nome} onChange={set('nome')} autoComplete="name" />
            </>
          )}

          {via === 'email'
            ? <input className={inp} type="email" required placeholder="E-mail" value={f.email} onChange={set('email')} autoComplete="email" />
            : <input className={inp} type="tel" required inputMode="tel" placeholder="Telefone com DDD" value={f.fone} onChange={set('fone')} autoComplete="tel" />}

          <input className={inp} type="password" required placeholder={modo === 'criar' ? 'Senha (mín. 6 caracteres)' : 'Senha'} value={f.senha} onChange={set('senha')} autoComplete={modo === 'criar' ? 'new-password' : 'current-password'} />

          <button type="submit" className={btn} disabled={busy}>
            {busy ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        {msg && <p role="alert" className={`text-sm rounded-lg px-3 py-2 ${msg.erro ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{msg.t}</p>}
      </div>
    </div>
  );
}