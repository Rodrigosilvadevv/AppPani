import { supabase } from './supabase';

/* ---------- tempo ---------- */
const H = 3600000;
export const idade = (t) => (Date.now() - new Date(t).getTime()) / H;
export const fresco = (t, cat) => idade(t) < (cat === 'doce' ? 120 : 10); // pão/salgado: 10 h · doce: 5 dias
export const tempo = (t) => {
  if (!t) return '';
  const m = Math.floor(idade(t) * 60);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} d`;
};

/* ---------- formatação ---------- */
export const money = (v) => (v || v === 0 ? `R$ ${Number(v).toFixed(2).replace('.', ',')}` : '');
export const kmFmt = (v) => `${v.toFixed(1).replace('.', ',')} km`;
export const slugify = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const fonePadrao = (v = '') => {
  const d = v.replace(/\D/g, '');
  if (!d) return '';
  return d.length > 11 && d.startsWith('55') ? `+${d}` : `+55${d}`; // E.164 (Brasil por padrão)
};
export const media = (l = []) => {
  const n = l.filter((c) => c.nota);
  return n.length ? n.reduce((a, c) => a + c.nota, 0) / n.length : 0;
};

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
const mins = (s) => { const [a, b] = s.split(':').map(Number); return a * 60 + b; };
export function statusAgora(p, now = new Date()) {
  const h = getHorarios(p)[now.getDay()];
  const t = now.getHours() * 60 + now.getMinutes();
  if (h.aberto) {
    const ini = mins(h.ini), fim = mins(h.fim);
    const dentro = fim > ini ? t >= ini && t < fim : t >= ini || t < fim; // aceita virada de meia-noite
    if (dentro) return { aberto: true, txt: `Aberto até ${h.fim}` };
    if (t < ini) return { aberto: false, txt: `Fechado · abre às ${h.ini}` };
  }
  return { aberto: false, txt: 'Fechado agora' };
}

/* ---------- upload de imagem (reduz para ~1280px antes de enviar) ---------- */
export async function enviarImagem(file, uid, max = 1280) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from('imagens').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw error;
  return supabase.storage.from('imagens').getPublicUrl(path).data.publicUrl;
}