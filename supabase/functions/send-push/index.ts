// Edge Function: envia push para quem segue a panificadora.
// Deploy: supabase functions deploy send-push
// Secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:voce@dominio.com
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: 'não autorizado' }, 401);

    const { fornada_id } = await req.json();
    const { data: f } = await admin
      .from('fornadas')
      .select('id, img_url, created_at, panis(id, nome, owner)')
      .eq('id', fornada_id)
      .single();
    // deno-lint-ignore no-explicit-any
    const pani = (f as any)?.panis;
    if (!f || !pani || pani.owner !== user.id) return json({ error: 'proibido' }, 403);
    if (Date.now() - new Date(f.created_at).getTime() > 10 * 60 * 1000) return json({ error: 'aviso expirado' }, 400);

    const { data: seg } = await admin.from('follows').select('user_id').eq('pani_id', pani.id);
    const ids = (seg ?? []).map((s) => s.user_id);
    if (!ids.length) return json({ enviados: 0 });
    const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', ids);

    webpush.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT')!,
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    );
    const payload = JSON.stringify({
      title: `🥖 ${pani.nome}`,
      body: 'Fornada fresquinha saindo agora!',
      image: f.img_url,
      tag: `fornada-${pani.id}`,
      url: '/',
    });

    let enviados = 0;
    const mortos: string[] = [];
    await Promise.all((subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        enviados++;
      } catch (e) {
        // deno-lint-ignore no-explicit-any
        const code = (e as any)?.statusCode;
        if (code === 404 || code === 410) mortos.push(s.id);
      }
    }));
    if (mortos.length) await admin.from('push_subscriptions').delete().in('id', mortos);
    return json({ enviados });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
