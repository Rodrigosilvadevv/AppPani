import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fonePadrao } from '../lib/util';
import { Logo, inp, btn, btn2, useToast } from '../ui';
import { ehNativo, plataforma, abrirLink } from '../lib/native';
import { APP_URL, FEATURES, NATIVE_SCHEME, SENHA_MIN } from '../config';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
    <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);
const AppleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M16.37 12.78c.02 2.5 2.19 3.33 2.22 3.34-.02.06-.35 1.2-1.16 2.37-.7 1.01-1.42 2.02-2.57 2.04-1.13.02-1.49-.67-2.78-.67-1.29 0-1.69.65-2.76.69-1.1.04-1.94-1.09-2.64-2.1-1.53-2.2-2.7-6.23-1.13-8.95.78-1.35 2.17-2.2 3.68-2.23 1.09-.02 2.11.73 2.78.73.66 0 1.91-.9 3.22-.77.55.02 2.1.2 3.09 1.5-.08.05-1.85 1.08-1.83 3.22M14.3 4.2c.6-.72 1-1.72.89-2.72-.88.04-1.95.59-2.57 1.31-.56.64-1.03 1.66-.9 2.64.98.08 1.98-.5 2.58-1.23" />
  </svg>
);

const ERROS = {
  'Invalid login credentials': 'E-mail/telefone ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
  'User already registered': 'Já existe uma conta com esse acesso. Faça o login.',
  'Password should be at least 6 characters': `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`,
  'Signups not allowed for this instance': 'O cadastro está temporariamente desativado.',
  'Email address not authorized': 'Este e-mail não está autorizado.',
};

const traduz = (m = '') =>
  ERROS[m] ||
  (m.includes('rate limit') || m.includes('Too Many Requests')
    ? 'Muitas tentativas seguidas. Aguarde um pouco e tente novamente.'
    : m.includes('Failed to fetch') || m.includes('NetworkError')
      ? 'Sem conexão. Verifique a internet e tente de novo.'
      : m);

// Para onde o provedor social devolve o usuário: deep link no app, URL do site na web.
const voltaPara = () => (ehNativo() ? `${NATIVE_SCHEME}://login` : `${APP_URL || window.location.origin}/`);

export default function Login({ admin = false }) {
  const say = useToast();
  const [modo, setModo] = useState('entrar'); // entrar | criar | esqueci
  const [via, setVia] = useState('email');    // email | fone
  const [f, setF] = useState({ nome: '', email: '', fone: '', senha: '', tipo: 'cliente' });
  const [aceite, setAceite] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [social, setSocial] = useState(null);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const mostraApple = FEATURES.apple || plataforma() === 'ios';

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

  // Telefone vira um login interno (sem SMS, sem verificação). O número real fica salvo no perfil.
  const emailDeAcesso = () => {
    const digitos = fonePadrao(f.fone).replace(/\D/g, '');
    if (via === 'fone' && digitos.length < 12) throw new Error('Digite o telefone com DDD.');
    return via === 'email' ? f.email.trim().toLowerCase() : `${digitos}@fone.apppani.app`;
  };

  const enviar = (e) => {
    e.preventDefault();
    run(async () => {
      const email = emailDeAcesso();

      if (modo === 'esqueci') {
        if (via === 'fone') throw new Error('Para contas por telefone, fale com o suporte para recuperar o acesso.');
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${APP_URL || window.location.origin}/redefinir-senha`,
        });
        if (error) throw error;
        setMsg({ t: 'Enviamos um link para o seu e-mail. Abra por ele para criar uma nova senha.' });
        return;
      }

      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: f.senha });
        if (error) throw error;
        return;
      }

      // criar conta
      if (!f.nome.trim() || f.nome.trim().length < 2) throw new Error('Informe o nome.');
      if (f.senha.length < SENHA_MIN) throw new Error(`A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`);
      if (!aceite) throw new Error('É preciso aceitar os Termos e a Política de Privacidade.');

      const { data, error } = await supabase.auth.signUp({
        email,
        password: f.senha,
        options: {
          emailRedirectTo: `${APP_URL || window.location.origin}/`,
          data: {
            nome: f.nome.trim(),
            role: f.tipo,
            telefone: via === 'fone' ? fonePadrao(f.fone) : null,
            aceitou_termos: new Date().toISOString(),
          },
        },
      });
      if (error) {
        if (/already registered|already exists/i.test(error.message)) {
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
      if (!data.session) setMsg({ t: 'Conta criada! Confirme pelo link que enviamos para o seu e-mail e depois entre.' });
    });
  };

  const entrarCom = (provider) => run(async () => {
    setSocial(provider);
    try {
      const nativo = ehNativo();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: voltaPara(),
          skipBrowserRedirect: nativo, // no app abrimos no navegador do sistema e voltamos por deep link
          queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
        },
      });
      if (error) throw error;
      if (nativo && data?.url) await abrirLink(data.url);
    } finally {
      setSocial(null);
    }
  });

  const titulo = admin ? 'Administração' : modo === 'esqueci' ? 'Recuperar acesso' : 'Saiu pão fresco? Você fica sabendo.';

  return (
    <div className="min-h-full bg-stone-100 flex justify-center">
      <div className="w-full max-w-md min-h-screen bg-white px-6 py-10 flex flex-col gap-4" style={{ paddingTop: 'max(2.5rem, env(safe-area-inset-top))' }}>
        <div className="text-center">
          <div className="text-5xl" aria-hidden="true">🥖</div><Logo />
          <p className="text-sm text-stone-600 mt-1">{titulo}</p>
        </div>

        {!admin && modo !== 'esqueci' && (
          <div className="flex border-b border-stone-200">
            {[['entrar', 'Entrar'], ['criar', 'Criar conta']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => troca(k)}
                className={`flex-1 py-2.5 text-sm font-semibold border-b-2 ${modo === k ? 'border-stone-900' : 'border-transparent text-stone-400'}`}>{l}</button>
            ))}
          </div>
        )}

        {modo !== 'esqueci' && (
          <>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => entrarCom('google')} disabled={busy} className={`${btn2} flex items-center justify-center gap-2`}>
                {social === 'google' ? <Loader2 size={16} className="animate-spin" /> : <GoogleIcon />}Continuar com Google
              </button>
              {mostraApple && (
                <button type="button" onClick={() => entrarCom('apple')} disabled={busy}
                  className="bg-black text-white rounded-lg px-4 py-2.5 text-sm font-semibold active:opacity-80 disabled:opacity-50 min-h-11 flex items-center justify-center gap-2">
                  {social === 'apple' ? <Loader2 size={16} className="animate-spin" /> : <AppleIcon />}Continuar com Apple
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-stone-400"><span className="flex-1 h-px bg-stone-200" />ou<span className="flex-1 h-px bg-stone-200" /></div>
          </>
        )}

        <div className="flex gap-2">
          {[['email', 'E-mail'], ['fone', 'Telefone']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setVia(k); setMsg(null); }}
              className={`flex-1 rounded-full py-2 text-xs border ${via === k ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300'}`}>{l}</button>
          ))}
        </div>

        <form onSubmit={enviar} className="flex flex-col gap-3">
          {modo === 'criar' && (
            <>
              <div className="flex gap-2">
                {[['cliente', 'Sou cliente'], ['pani', 'Sou panificadora']].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setF({ ...f, tipo: k })}
                    className={`flex-1 rounded-lg py-2.5 text-sm border ${f.tipo === k ? 'bg-red-600 text-white border-red-600' : 'border-stone-300'}`}>{l}</button>
                ))}
              </div>
              <input className={inp} placeholder={f.tipo === 'pani' ? 'Nome da panificadora' : 'Seu nome'} value={f.nome} onChange={set('nome')} autoComplete="name" maxLength={60} />
            </>
          )}

          {via === 'email'
            ? <input className={inp} type="email" required placeholder="E-mail" value={f.email} onChange={set('email')} autoComplete="email" autoCapitalize="none" spellCheck="false" />
            : <input className={inp} type="tel" required inputMode="tel" placeholder="Telefone com DDD" value={f.fone} onChange={set('fone')} autoComplete="tel" />}

          {modo !== 'esqueci' && (
            <input className={inp} type="password" required minLength={modo === 'criar' ? SENHA_MIN : 1}
              placeholder={modo === 'criar' ? `Senha (mín. ${SENHA_MIN} caracteres)` : 'Senha'}
              value={f.senha} onChange={set('senha')} autoComplete={modo === 'criar' ? 'new-password' : 'current-password'} />
          )}

          {modo === 'criar' && (
            <label className="flex items-start gap-2 text-xs text-stone-600">
              <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-0.5 w-4 h-4 accent-red-600 shrink-0" />
              <span>
                Li e aceito os <Link to="/termos" className="underline font-semibold">Termos de Uso</Link> e a{' '}
                <Link to="/privacidade" className="underline font-semibold">Política de Privacidade</Link>.
              </span>
            </label>
          )}

          <button type="submit" className={btn} disabled={busy}>
            {busy ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Enviar link de recuperação'}
          </button>
        </form>

        <div className="flex justify-between text-xs">
          {modo === 'esqueci'
            ? <button type="button" onClick={() => troca('entrar')} className="underline text-stone-600">Voltar para o login</button>
            : <button type="button" onClick={() => troca('esqueci')} className="underline text-stone-600">Esqueci minha senha</button>}
          <button type="button" onClick={() => say('Fale com a gente pelo e-mail que está na Política de Privacidade.')} className="text-stone-400">Preciso de ajuda</button>
        </div>

        {msg && <p role="alert" className={`text-sm rounded-lg px-3 py-2 ${msg.erro ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{msg.t}</p>}

        <p className="text-[11px] text-stone-400 text-center mt-auto pt-6">
          <Link to="/termos" className="underline">Termos</Link> · <Link to="/privacidade" className="underline">Privacidade</Link>
        </p>
      </div>
    </div>
  );
}
