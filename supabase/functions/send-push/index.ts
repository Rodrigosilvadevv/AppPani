// =====================================================================
//  send-push · envia notificação de fornada (e avisos da pani)
//
//  Entradas aceitas (JSON):
//    { "fornada_id": "uuid" }                      → clientes que seguem e pediram aviso da categoria
//    { "evento": "pedido",        "pedido_id": "uuid" } → dono da pani (pedido novo: mesa ou delivery)
//    { "evento": "status_pedido", "pedido_id": "uuid" } → cliente do pedido (preparando, saiu, entregue…)
//    { "evento": "seguidor",      "pani_id":  "uuid" }  → dono da pani
//    { "evento": "comentario",    "pani_id":  "uuid" }  → dono da pani
//
//  Quem chama é conferido pelo token do app: só o dono avisa fornada e muda status;
//  pedido novo só gera aviso nos primeiros 10 minutos (ninguém fica disparando avisos).
//
//  Variáveis de ambiente (Supabase → Edge Functions → Secrets):
//    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (já vêm prontas)
//    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT   → push na web
//    FCM_SERVICE_ACCOUNT  → JSON da conta de serviço do Firebase (push no app das lojas)
//    APP_URL              → https://seusite.com (link aberto ao tocar na notificação)
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const URL_SB = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = (Deno.env.get('APP_URL') || '').replace(/\/$/, '');
const VAPID_PUB = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIV = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUB = Deno.env.get('VAPID_SUBJECT') || 'mailto:suporte@apppani.app';
const FCM_SA = Deno.env.get('FCM_SERVICE_ACCOUNT') || '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

if (VAPID_PUB && VAPID_PRIV) webpush.setVapidDetails(VAPID_SUB, VAPID_PUB, VAPID_PRIV);

const db = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });

const CATS: Record<string, { emoji: string; un: string; col: string }> = {
  pao: { emoji: '🥖', un: 'pão', col: 'av_pao' },
  salgado: { emoji: '🥟', un: 'salgado', col: 'av_salgado' },
  doce: { emoji: '🍰', un: 'doce', col: 'av_doce' },
};

/* ------------------------- FCM (app nativo) ------------------------- */
let fcmCache: { token: string; exp: number } | null = null;

const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const pemParaBytes = (pem: string) => {
  const limpo = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(limpo), (c) => c.charCodeAt(0));
};

async function tokenFcm(sa: Record<string, string>) {
  const agora = Math.floor(Date.now() / 1000);
  if (fcmCache && fcmCache.exp > agora + 60) return fcmCache.token;

  const cabec = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const corpo = b64url(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600,
  })));
  const chave = await crypto.subtle.importKey(
    'pkcs8', pemParaBytes(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(`${cabec}.${corpo}`));
  const jwt = `${cabec}.${corpo}.${b64url(new Uint8Array(assinatura))}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error(`fcm-oauth: ${JSON.stringify(d)}`);
  fcmCache = { token: d.access_token, exp: agora + (d.expires_in || 3600) };
  return fcmCache.token;
}

type Aviso = { title: string; body: string; url: string; tag: string };

async function enviarNativo(tokens: { endpoint: string; token: string }[], aviso: Aviso) {
  if (!tokens.length || !FCM_SA) return { ok: 0, mortos: [] as string[] };
  let sa: Record<string, string>;
  try { sa = JSON.parse(FCM_SA); } catch { console.error('FCM_SERVICE_ACCOUNT inválido'); return { ok: 0, mortos: [] }; }

  const acesso = await tokenFcm(sa);
  const endpointFcm = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  const mortos: string[] = [];
  let ok = 0;

  await Promise.all(tokens.map(async (t) => {
    const r = await fetch(endpointFcm, {
      method: 'POST',
      headers: { authorization: `Bearer ${acesso}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: t.token,
          notification: { title: aviso.title, body: aviso.body },
          data: { url: aviso.url },
          android: { priority: 'HIGH', notification: { sound: 'default', tag: aviso.tag, channel_id: 'fornadas' } },
          apns: { payload: { aps: { sound: 'default', 'thread-id': aviso.tag, badge: 1 } } },
        },
      }),
    });
    if (r.ok) { ok++; return; }
    const txt = await r.text();
    if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(txt)) mortos.push(t.endpoint);
    else console.error('fcm', r.status, txt.slice(0, 300));
  }));

  return { ok, mortos };
}

/* --------------------------- Web Push ------------------------------- */
async function enviarWeb(subs: { endpoint: string; p256dh: string; auth: string }[], aviso: Aviso) {
  if (!subs.length || !VAPID_PUB || !VAPID_PRIV) return { ok: 0, mortos: [] as string[] };
  const mortos: string[] = [];
  let ok = 0;

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(aviso),
        { TTL: 3600, urgency: 'high' },
      );
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) mortos.push(s.endpoint);
      else console.error('webpush', code, (e as Error).message?.slice(0, 200));
    }
  }));

  return { ok, mortos };
}

/* --------------------------- quem recebe ---------------------------- */
async function quemChama(req: Request): Promise<string | null> {
  const tk = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!tk) return null;
  const { data } = await db.auth.getUser(tk); // chave anônima não é usuário: volta null
  return data?.user?.id ?? null;
}

const reais = (v: unknown) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;

async function destinatariosFornada(fornadaId: string, uid: string | null) {
  const { data: f } = await db.from('fornadas').select('id, cat, itens, pani_id').eq('id', fornadaId).maybeSingle();
  if (!f) throw new Error('fornada nao encontrada');

  const { data: pani } = await db.from('panis').select('id, nome, slug, visivel, owner').eq('id', f.pani_id).maybeSingle();
  if (!pani) throw new Error('pani nao encontrada');
  if (pani.owner !== uid) throw new Error('sem permissao');
  if (pani.visivel === false) return { users: [] as string[], aviso: null };

  const cat = CATS[f.cat] || CATS.pao;
  const [{ data: segue }, { data: bloq }] = await Promise.all([
    db.from('follows').select('user_id').eq('pani_id', f.pani_id),
    db.from('bloqueios').select('user_id').eq('pani_id', f.pani_id),
  ]);

  const ids = (segue || []).map((s) => s.user_id);
  if (!ids.length) return { users: [], aviso: null };
  const bloqueados = new Set((bloq || []).map((b) => b.user_id));

  // só quem pediu aviso daquela categoria
  const { data: querem } = await db.from('profiles').select('id').in('id', ids).eq(cat.col, true);
  const users = (querem || []).map((p) => p.id).filter((id) => !bloqueados.has(id));

  const lista = (f.itens || []).slice(0, 3).join(', ');
  const aviso: Aviso = {
    title: `${cat.emoji} ${pani.nome}`,
    body: lista ? `Saiu ${cat.un} fresco: ${lista}` : `Saiu ${cat.un} fresquinho agora!`,
    url: `${APP_URL}/c/${pani.slug}`,
    tag: `fornada-${f.pani_id}-${f.cat}`,
  };
  return { users, aviso };
}

const STATUS_CLIENTE: Record<string, [string, string]> = {
  preparando: ['👩‍🍳 Pedido em preparo', 'A panificadora começou a preparar seu pedido.'],
  pronto: ['✅ Pedido pronto', 'Seu pedido está pronto!'],
  saiu: ['🛵 Saiu para entrega', 'Seu pedido está a caminho.'],
  entregue: ['🥖 Pedido entregue', 'Bom apetite! Conta pra gente o que achou.'],
  cancelado: ['Pedido cancelado', 'A panificadora cancelou seu pedido. Fale com ela se precisar.'],
};

async function destinatariosEvento(corpo: Record<string, string>, uid: string | null) {
  let paniId = corpo.pani_id;
  let aviso: Aviso | null = null;

  if (corpo.evento === 'pedido' || corpo.evento === 'status_pedido') {
    const { data: ped } = await db.from('pedidos')
      .select('id, tipo, mesa, cliente, total, status, user_id, pani_id, created_at').eq('id', corpo.pedido_id).maybeSingle();
    if (!ped) throw new Error('pedido nao encontrado');
    const { data: pani } = await db.from('panis').select('id, nome, owner').eq('id', ped.pani_id).maybeSingle();
    if (!pani) throw new Error('pani nao encontrada');

    if (corpo.evento === 'status_pedido') {
      if (pani.owner !== uid) throw new Error('sem permissao');
      const txt = STATUS_CLIENTE[ped.status];
      if (!ped.user_id || !txt) return { users: [] as string[], aviso: null };
      return {
        users: [ped.user_id],
        aviso: { title: `${txt[0]} · ${pani.nome}`, body: txt[1], url: `${APP_URL}/pedido/${ped.id}`, tag: `pedido-${ped.id}` },
      };
    }

    if (Date.now() - new Date(ped.created_at).getTime() > 10 * 60 * 1000) return { users: [] as string[], aviso: null };
    const quem = ped.cliente ? ` · ${ped.cliente}` : '';
    aviso = ped.tipo === 'delivery'
      ? { title: '🛵 Novo pedido de delivery', body: `${reais(ped.total)}${quem}`, url: `${APP_URL}/`, tag: `pedido-${ped.pani_id}` }
      : { title: '🔔 Novo pedido', body: `Mesa ${ped.mesa} · ${reais(ped.total)}${quem}`, url: `${APP_URL}/`, tag: `pedido-${ped.pani_id}` };
    return { users: [pani.owner], aviso };
  }

  if (!uid) throw new Error('entre na conta');
  const { data: pani } = await db.from('panis').select('id, nome, owner').eq('id', paniId).maybeSingle();
  if (!pani) throw new Error('pani nao encontrada');
  paniId = pani.id;

  if (corpo.evento === 'seguidor') aviso = { title: `🥖 ${pani.nome}`, body: 'Você tem um seguidor novo!', url: `${APP_URL}/`, tag: `seguidor-${paniId}` };
  if (corpo.evento === 'comentario') aviso = { title: `💬 ${pani.nome}`, body: 'Alguém comentou na sua pani.', url: `${APP_URL}/`, tag: `coment-${paniId}` };
  if (!aviso) throw new Error('evento invalido');
  if (pani.owner === uid) return { users: [] as string[], aviso: null }; // não avisa a si mesmo

  return { users: [pani.owner], aviso };
}

/* ------------------------------ handler ----------------------------- */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'use POST' }, 405);

  try {
    const corpo = await req.json().catch(() => ({}));
    const uid = await quemChama(req);
    const { users, aviso } = corpo.fornada_id
      ? await destinatariosFornada(corpo.fornada_id, uid)
      : await destinatariosEvento(corpo, uid);

    if (!aviso || !users.length) return json({ enviados: 0, aparelhos: 0, motivo: 'ninguem para avisar' });

    const { data: subs } = await db.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', users);
    const todas = subs || [];
    const nativos = todas.filter((s) => s.endpoint.startsWith('native:'))
      .map((s) => ({ endpoint: s.endpoint, token: s.endpoint.split(':').slice(2).join(':') }));
    const web = todas.filter((s) => !s.endpoint.startsWith('native:'));

    const [rn, rw] = await Promise.all([enviarNativo(nativos, aviso), enviarWeb(web, aviso)]);

    const mortos = [...rn.mortos, ...rw.mortos];
    if (mortos.length) await db.from('push_subscriptions').delete().in('endpoint', mortos);

    return json({
      enviados: rn.ok + rw.ok,
      aparelhos: todas.length,
      nativos: rn.ok,
      web: rw.ok,
      removidos: mortos.length,
    });
  } catch (e) {
    const msg = (e as Error).message || 'falhou';
    console.error('[send-push]', msg);
    return json({ erro: msg }, msg === 'sem permissao' ? 403 : 400);
  }
});
