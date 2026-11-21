import { supabase } from './supabase';

/* ---------- tempo ---------- */
const H = 3600000;
export const idade = (t) => (Date.now() - new Date(t).getTime()) / H;
// quanto tempo cada categoria continua com o selo "fresquinho"
export const VALIDADE_H = { pao: 10, salgado: 30, doce: 72 }; // pão 10 h · salgado 30 h · doce 3 dias
export const fresco = (t, cat) => idade(t) < (VALIDADE_H[cat] ?? VALIDADE_H.pao);
export const tempo = (t) => {
  if (!t) return '';
  const m = Math.floor(idade(t) * 60);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} d`;
};
export const inicioDoDia = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();

/* ---------- formatação ---------- */
export const money = (v) => (v || v === 0 ? `R$ ${Number(v).toFixed(2).replace('.', ',')}` : '');
export const kmFmt = (v) => `${v.toFixed(1).replace('.', ',')} km`;
export const slugify = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const fonePadrao = (v = '') => {
  const d = v.replace(/\D/g, '');
  if (!d) return '';
  return d.length > 11 && d.startsWith('55') ? `+${d}` : `+55${d}`; // E.164 (Brasil por padrão)
};
export const media = (l = []) => {
  const n = l.filter((c) => c.nota);
  return n.length ? n.reduce((a, c) => a + c.nota, 0) / n.length : 0;
};
export const notaFmt = (v) => v.toFixed(1).replace('.', ',');
export const pn = (v) => parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')) || 0; // "12,50" -> 12.5

/* ---------- venda por unidade ou por quilo ---------- */
export const UNIDADES = { un: 'unidade', kg: 'kg' };
const num = (v, casas) => Number(v).toFixed(casas).replace('.', ',');
export const gramasFmt = (g) => {
  const n = Number(g) || 0;
  if (n < 1000) return `${Math.round(n)} g`;
  const kg = n / 1000;
  return `${num(kg, Number.isInteger(kg) ? 0 : kg * 10 === Math.round(kg * 10) ? 1 : 2)} kg`;
};
export const precoFmt = (preco, unidade) => {
  if (preco == null || preco === '') return '';
  return `${money(preco)}${unidade === 'kg' ? '/kg' : unidade === 'un' ? '/un' : ''}`;
};
// item de pedido: { unidade: 'un'|'kg', qtd (unidades ou gramas), preco, total? }
export const linhaTotal = (i) => {
  if (i?.total != null) return Number(i.total) || 0;
  const preco = Number(i?.preco) || 0;
  const q = Number(i?.qtd) || 0;
  return Math.round((i?.unidade === 'kg' ? (preco * q) / 1000 : preco * q) * 100) / 100;
};
export const qtdFmt = (i) => (i?.unidade === 'kg' ? gramasFmt(i.qtd) : `${i?.qtd ?? 0}×`);

/* ---------- contato: Instagram, WhatsApp, telefone, mapa ---------- */
export const limpaInstagram = (v = '') =>
  String(v).trim().replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 30).toLowerCase();
export const linkInstagram = (u) => (u ? `https://instagram.com/${limpaInstagram(u)}` : null);
export const soDigitos = (v = '') => String(v ?? '').replace(/\D/g, '');
export const linkWhatsapp = (n, texto = '') => {
  let d = soDigitos(n);
  if (!d) return null;
  if (d.length <= 11) d = `55${d}`;
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
};
export const foneFmt = (v) => {
  let d = soDigitos(v);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v || '';
};
export const linkMapa = (endereco) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco || '')}`;

/* ---------- distância ---------- */
export const distKm = (a, b) => {
  if (!a || !b || b.lat == null || b.lng == null) return null;
  const rad = Math.PI / 180;
  const dLa = (b.lat - a.lat) * rad;
  const dLo = (b.lng - a.lng) * rad;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLo / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};

/* ---------- horário de funcionamento ---------- */
export const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const horariosPadrao = () =>
  Object.fromEntries(DIAS.map((_, i) => [i, { aberto: i !== 0, ini: '06:00', fim: '19:00' }]));
export const getHorarios = (p) => ({ ...horariosPadrao(), ...(p?.horarios || {}) });
const mins = (s) => { const [a, b] = String(s || '0:0').split(':').map(Number); return a * 60 + b; };
export function statusAgora(p, now = new Date()) {
  const hs = getHorarios(p);
  const dia = now.getDay();
  const t = now.getHours() * 60 + now.getMinutes();
  const hoje = hs[dia];
  const ontem = hs[(dia + 6) % 7];

  // expediente de ontem que atravessou a meia-noite (ex.: 18:00 → 02:00)
  if (ontem?.aberto) {
    const i = mins(ontem.ini), f = mins(ontem.fim);
    if (f <= i && t < f) return { aberto: true, txt: `Aberto até ${ontem.fim}` };
  }
  if (hoje?.aberto) {
    const i = mins(hoje.ini), f = mins(hoje.fim);
    const dentro = f > i ? t >= i && t < f : t >= i;
    if (dentro) return { aberto: true, txt: `Aberto até ${hoje.fim}` };
    if (t < i) return { aberto: false, txt: `Fechado · abre às ${hoje.ini}` };
  }
  return { aberto: false, txt: 'Fechado agora' };
}

/* ---------- upload de imagem (corrige rotação do iPhone e reduz para ~1280px) ---------- */
export async function enviarImagem(file, uid, max = 1280) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Imagem muito grande.');
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await createImageBitmap(file); }
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
  if (!blob) throw new Error('Não foi possível processar a imagem.');
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from('imagens').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw error;
  return supabase.storage.from('imagens').getPublicUrl(path).data.publicUrl;
}

/* ---------- aviso sonoro de pedido novo (a cozinha ouve mesmo sem olhar o celular) ---------- */
let ctxAudio;
/* O navegador só deixa tocar som depois de um toque na página: chame no primeiro clique. */
export function destravarAudio() {
  try {
    ctxAudio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctxAudio.state === 'suspended') ctxAudio.resume();
    return ctxAudio.state !== 'suspended';
  } catch { return false; }
}
export const audioLiberado = () => Boolean(ctxAudio && ctxAudio.state === 'running');

export function beep() {
  try {
    ctxAudio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctxAudio.state === 'suspended') ctxAudio.resume();
    const t0 = ctxAudio.currentTime;
    [880, 1175].forEach((f, i) => {
      const o = ctxAudio.createOscillator();
      const g = ctxAudio.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t0 + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.16);
      o.connect(g).connect(ctxAudio.destination);
      o.start(t0 + i * 0.18); o.stop(t0 + i * 0.18 + 0.18);
    });
  } catch { /* o navegador pode bloquear áudio antes do primeiro toque */ }
}
