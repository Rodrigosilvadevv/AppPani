// /pedido/:id — acompanhar um pedido pelo link (abre pela notificação ou depois de pedir na mesa)
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Logo, btn } from '../ui';
import { AcompanharPedido } from '../components/Acompanhar';

export default function Pedido() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const volta = sp.get('volta');
  const destino = volta && volta.startsWith('/') && !volta.startsWith('//') ? volta : '/';
  return (
    <div className="min-h-screen bg-stone-100 flex justify-center">
      <div className="w-full max-w-md bg-white min-h-screen">
        <header className="flex items-center gap-2 px-3 min-h-12 border-b border-stone-200" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <Link to={destino} aria-label="Voltar" className="p-1"><ChevronLeft size={22} /></Link>
          <Logo size="text-xl" />
        </header>
        <AcompanharPedido id={id} rodape={
          <Link to={destino} className={`${btn} text-center`}>{destino.startsWith('/c/') || destino.startsWith('/d/') ? 'Fazer outro pedido' : 'Voltar ao app'}</Link>
        } />
      </div>
    </div>
  );
}
