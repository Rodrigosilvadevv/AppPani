import { useEffect, useRef } from 'react';
import { ehNativo } from './native';

/**
 * Chama `fn` quando o usuário volta para o app (aba em foco, app saiu do segundo plano
 * ou a internet voltou). Mantém o feed atualizado sem precisar puxar a tela.
 * `minimo` evita recarregar toda hora (milissegundos).
 */
export function useRevalidar(fn, minimo = 20000) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; });

  useEffect(() => {
    let ultimo = Date.now();
    const roda = () => {
      if (Date.now() - ultimo < minimo) return;
      ultimo = Date.now();
      ref.current?.();
    };
    const vis = () => { if (document.visibilityState === 'visible') roda(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('online', roda);

    let handle;
    let vivo = true;
    if (ehNativo()) {
      import('@capacitor/app').then(async ({ App }) => {
        const h = await App.addListener('appStateChange', ({ isActive }) => { if (isActive) roda(); });
        if (vivo) handle = h; else h.remove();
      }).catch(() => {});
    }
    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('online', roda);
      handle?.remove();
    };
  }, [minimo]);
}
