// Ponte entre o app web e o que só existe no celular (Capacitor).
// Todos os plugins são carregados sob demanda: na web o bundle fica leve e nada quebra.
import { Capacitor } from '@capacitor/core';

export const ehNativo = () => Capacitor.isNativePlatform();
export const plataforma = () => Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

/* ---------- vibração leve (feedback de toque) ---------- */
export async function haptic(tipo = 'leve') {
  if (!ehNativo()) {
    if (tipo === 'forte') navigator.vibrate?.(200);
    return;
  }
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
    if (tipo === 'sucesso') await Haptics.notification({ type: NotificationType.Success });
    else if (tipo === 'forte') await Haptics.impact({ style: ImpactStyle.Heavy });
    else await Haptics.impact({ style: ImpactStyle.Light });
  } catch { /* sem suporte */ }
}

/* ---------- copiar (sempre copia, nunca abre a folha de compartilhamento) ---------- */
export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch { /* segue para o jeito antigo abaixo */ }
  try {
    // alguns navegadores/webviews (apps instalados, iframes) bloqueiam navigator.clipboard;
    // esse jeito antigo com textarea + execCommand ainda funciona neles.
    const area = document.createElement('textarea');
    area.value = texto;
    area.style.position = 'fixed';
    area.style.top = '-9999px';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.focus();
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/* ---------- compartilhar ---------- */
export async function compartilhar({ title, text, url }) {
  try {
    if (ehNativo()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, url, dialogTitle: title });
      return 'ok';
    }
    if (navigator.share) { await navigator.share({ title, text, url }); return 'ok'; }
    await navigator.clipboard?.writeText(url || text || '');
    return 'copiado';
  } catch {
    return 'cancelado';
  }
}

// Compartilha/salva uma imagem (data URL). No celular abre a folha de compartilhamento; na web baixa o arquivo.
export async function compartilharImagem(dataUrl, nome = 'imagem.png') {
  if (!ehNativo()) {
    const a = document.createElement('a');
    a.href = dataUrl; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    return 'baixado';
  }
  try {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const gravado = await Filesystem.writeFile({ path: nome, data: dataUrl.split(',')[1], directory: Directory.Cache });
    await Share.share({ files: [gravado.uri], dialogTitle: nome });
    return 'ok';
  } catch {
    return 'erro';
  }
}

/* ---------- abrir link externo (navegador do sistema) ---------- */
export async function abrirLink(url) {
  if (ehNativo()) {
    const { Browser } = await import('@capacitor/browser');
    return Browser.open({ url });
  }
  window.open(url, '_blank', 'noopener');
}

/* ---------- localização ---------- */
export async function pegarLocalizacao() {
  if (ehNativo()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    let p = await Geolocation.checkPermissions();
    if (p.location !== 'granted' && p.coarseLocation !== 'granted') p = await Geolocation.requestPermissions();
    if (p.location !== 'granted' && p.coarseLocation !== 'granted') throw new Error('negado');
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  }
  if (!navigator.geolocation) throw new Error('sem-suporte');
  return new Promise((ok, falha) =>
    navigator.geolocation.getCurrentPosition(
      (pos) => ok({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => falha(new Error('negado')),
      { timeout: 10000 }
    )
  );
}

/* ---------- inicialização do app nativo: barra de status, splash ---------- */
export async function iniciarNativo() {
  if (!ehNativo()) return;
  document.documentElement.classList.add('nativo');
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Light }); // texto escuro sobre o topo branco
    if (plataforma() === 'android') await StatusBar.setBackgroundColor({ color: '#ffffff' });
  } catch { /* ignora */ }
}

export async function esconderSplash() {
  if (!ehNativo()) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch { /* ignora */ }
}