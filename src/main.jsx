import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import './index.css';
import { configurado } from './lib/supabase';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { Logo, Spinner, ToastProvider, btn, btn2 } from './ui';
import Login from './auth/Login';
import Redefinir from './auth/Redefinir';
import Cliente from './pages/Cliente';
import PaniApp from './pages/Pani';
import Admin from './pages/Admin';
import Cardapio from './pages/Cardapio';

const Aviso = ({ children }) => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-8 text-center"><Logo />{children}</div>
);

function Home() {
  const { session, perfil, loading, signOut } = useAuth();
  if (loading || (session && !perfil)) return <Spinner />;
  if (!session) return <Login />;
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
    <Routes>
      <Route path="/c/:slug" element={<Cardapio />} />
      <Route path="/redefinir-senha" element={<Redefinir />} />
      <Route path="/panipani" element={<AdminGate />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Rotas />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);
