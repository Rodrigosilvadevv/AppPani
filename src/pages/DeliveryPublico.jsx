// /d/:slug — delivery pelo link da pani: qualquer pessoa pede pelo navegador,
// sem criar conta e sem baixar o app. O valor é recalculado no banco (fazer_pedido).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bike, ChefHat } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Av, Logo, Spinner, Vazio } from '../ui';
import { Redes } from '../components/perfil';
import { pedidosRecentes } from '../lib/pedidos';
import { Loja } from './Delivery';

export default function DeliveryPublico() {
  const { slug } = useParams();
  const nav = useNavigate();
  const [p, setP] = useState(undefined);
  const [recente] = useState(() => pedidosRecentes(6)[0]?.id || null);

  useEffect(() => {
    let vivo = true;
    supabase.from('panis').select('*').eq('slug', slug).maybeSingle()
      .then(({ data }) => { if (vivo) setP(data || null); });
    return () => { vivo = false; };
  }, [slug]);

  useEffect(() => {
    if (!p?.nome) return;
    const antes = document.title;
    document.title = `${p.nome} · Delivery`;
    return () => { document.title = antes; };
  }, [p?.nome]);

  return (
    <div className="min-h-screen bg-stone-100 flex justify-center">
      <div className="w-full max-w-2xl bg-white min-h-screen flex flex-col sm:border-x border-stone-200">
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur flex items-center gap-2 px-4 min-h-12 border-b border-stone-200"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <Logo size="text-xl" />
          <span className="flex items-center gap-1 text-xs font-semibold text-blue-700"><Bike size={14} />Delivery</span>
          {recente && (
            <Link to={`/pedido/${recente}?volta=/d/${slug}`} className="ml-auto flex items-center gap-1 text-xs font-semibold text-red-700">
              <ChefHat size={14} />Meu pedido
            </Link>
          )}
        </header>

        <main className="flex-1">
          {p === undefined ? <Spinner />
            : p === null ? <Vazio t="Não encontramos esta panificadora. Confira o link com a padaria." />
            : !p.delivery ? (
              <div className="p-6 flex flex-col items-center text-center gap-3">
                <Av src={p.foto_url} emoji={p.emoji} size={76} />
                <h1 className="font-bold text-lg">{p.nome}</h1>
                <p className="text-sm text-stone-600">Esta panificadora não está recebendo pedidos de delivery agora.</p>
                <Redes p={p} texto="Fale com a padaria" className="justify-center" />
              </div>
            )
            : <Loja p={p} aoPedir={(id) => nav(`/pedido/${id}?volta=/d/${slug}`)} />}
        </main>

        <footer className="px-4 py-5 text-center text-[11px] text-stone-400 border-t border-stone-100">
          Pedido feito pelo <Link to="/" className="underline">AppPani</Link> · sem cadastro ·{' '}
          <Link to="/privacidade" className="underline">Privacidade</Link>
        </footer>
      </div>
    </div>
  );
}
