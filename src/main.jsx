import { Component, StrictMode, Suspense, lazy, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import './index.css';
import { configurado, supabase } from './lib/supabase';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { ConfirmProvider, Logo, Spinner, ToastProvider, btn, btn2 } from './ui';
import { ehNativo, esconderSplash, iniciarNativo } from './lib/native';
import { ouvirPushNativo } from './lib/push';
import { SUPORTE_EMAIL } from './config';
import Login from './auth/Login';
import Redefinir from './auth/Redefinir';
import Legal from './pages/Legal';

// As telas grandes entram por demanda: o app abre em menos tempo.
const Cliente = lazy(() => import('./pages/Cliente'));
const PaniApp = lazy(() => import('./pages/Pani'));
const Admin = lazy(() => import('./pages/Admin'));
const Cardapio = lazy(() => import('./pages/Cardapio'));
const Pedido = lazy(() => import('./pages/Pedido'));

const Aviso = ({ children }) => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-8 text-center"><Logo />{children}</div>
);

/* ---------- rede caiu / erro inesperado: a tela não fica branca ---------- */
class Barreira extends Component {
  constructor(p) { super(p); this.state = { erro: null }; }
  static getDerivedStateFromError(erro) { return { erro }; }
  componentDidCatch(erro, info) { console.error('[apppani]', erro, info); }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <Aviso>
        <p className="text-sm text-stone-600">Algo deu errado ao abrir esta tela.</p>
        <button onClick={() => window.location.reload()} className={btn}>Tentar de novo</button>
        <a href={`mailto:${SUPORTE_EMAIL}`} className="text-xs text-stone-400 underline">Falar com o suporte</a>
      </Aviso>
    );
  }
}

/* ---------- integrações do app nativo: deep link, splash, push ---------- */
function PonteNativa() {
  const nav = useNavigate();
  useEffect(() => {
    iniciarNativo();
    const t = setTimeout(esconderSplash, 150);
    ouvirPushNativo((url) => { try { nav(new URL(url, 'https://x').pathname); } catch { /* ignora */ } });

    let sub;
    let vivo = true;
    if (ehNativo()) {
      import('@capacitor/app').then(async ({ App }) => {
        const h = await App.addListener('appUrlOpen', async ({ url }) => {
          // volta do login social (app.apppani.mobile://login#access_token=…) ou link do e-mail
          try {
            const u = new URL(url);
            const frag = new URLSearchParams((u.hash || '').replace(/^#/, ''));
            const at = frag.get('access_token');
            const rt = frag.get('refresh_token');
            if (at && rt) {
              await supabase.auth.setSession({ access_token: at, refresh_token: rt });
              if (frag.get('type') === 'recovery') nav('/redefinir-senha', { replace: true });
              return;
            }
            const code = u.searchParams.get('code');
            if (code) { await supabase.auth.exchangeCodeForSession(code); return; }
            if (u.pathname && u.pathname !== '/') nav(u.pathname + u.search, { replace: true });
          } catch (e) { console.error('[deeplink]', e); }
        });
        if (vivo) sub = h; else h.remove();
      }).catch(() => {});
    }
    return () => { clearTimeout(t); vivo = false; sub?.remove(); };
  }, [nav]);
  return null;
}

function Home() {
  const { session, perfil, loading, erroPerfil, signOut } = useAuth();
  if (loading) return <Spinner />;
  if (!session) return <Login />;
  if (!perfil) {
    return erroPerfil ? (
      <Aviso>
        <p className="text-sm text-stone-600">Não conseguimos carregar seu perfil. Verifique a conexão e tente de novo.</p>
        <button onClick={() => window.location.reload()} className={btn}>Tentar de novo</button>
        <button onClick={signOut} className={btn2}>Sair</button>
      </Aviso>
    ) : <Spinner />;
  }
  if (perfil.role === 'pani') return <PaniApp />;
  if (perfil.role === 'adm') {
    return (
      <Aviso>
        <p className="text-sm text-stone-600">Esta é uma conta de administrador. O painel fica em /panipani.</p>
        <Link to="/panipani" className={btn}>Abrir administração</Link>
        <button onClick={signOut} className={btn2}>Sair</button>
      </Aviso>
    );
  }
  return <Cliente />;
}

// /panipani — só entra quem tem role = 'adm' (verificado de novo no banco pelas políticas RLS)
function AdminGate() {
  const { session, perfil, loading, signOut } = useAuth();
  if (loading || (session && !perfil)) return <Spinner />;
  if (!session) return <Login admin />;
  if (perfil.role !== 'adm') {
    return (
      <Aviso>
        <p className="text-sm text-stone-600">Esta conta não tem acesso à administração.</p>
        <button onClick={signOut} className={btn2}>Sair</button>
      </Aviso>
    );
  }
  return <Admin />;
}

function Rotas() {
  const { recovery } = useAuth();
  if (!configurado) {
    return <Aviso><p className="text-sm text-stone-600">Configure o arquivo <b>.env</b> (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY) e reinicie o servidor.</p></Aviso>;
  }
  if (recovery) return <Redefinir />;
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/c/:slug" element={<Cardapio />} />
        <Route path="/pedido/:id" element={<Pedido />} />
        <Route path="/redefinir-senha" element={<Redefinir />} />
        <Route path="/privacidade" element={<Legal />} />
        <Route path="/termos" element={<Legal />} />
        <Route path="/panipani" element={<AdminGate />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </Suspense>
  );
}

// O service worker é só para a web/PWA — no app nativo o push é do sistema.
if (!ehNativo() && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Barreira>
      <BrowserRouter>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <PonteNativa />
              <Rotas />
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </BrowserRouter>
    </Barreira>
  </StrictMode>
);
