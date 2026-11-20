-- =====================================================================
--  AppPani · banco completo (tabelas, segurança, gatilhos e funções)
--  Rode este arquivo e, em seguida, o 0002_delivery.sql no SQL Editor do Supabase.
--  Os dois podem ser rodados de novo sem medo: tudo é "if not exists" / "drop ... if exists".
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. TABELAS
-- ---------------------------------------------------------------------

-- perfil de todo mundo (cliente, pani e administrador)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null default '',
  foto_url    text,
  telefone    text,
  role        text not null default 'cliente' check (role in ('cliente', 'pani', 'adm')),
  av_pao      boolean not null default false,
  av_salgado  boolean not null default false,
  av_doce     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- panificadoras
create table if not exists public.panis (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null unique references auth.users(id) on delete cascade,
  nome        text not null,
  slug        text not null unique,
  bio         text default '',
  endereco    text default '',
  emoji       text default '🥖',
  foto_url    text,
  lat         double precision,
  lng         double precision,
  horarios    jsonb,
  plano       text not null default 'Básico',
  visivel     boolean not null default true,
  seguidores  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists panis_slug_idx on public.panis (slug);

-- quem segue quem
create table if not exists public.follows (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  pani_id    uuid not null references public.panis(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, pani_id)
);
create index if not exists follows_pani_idx on public.follows (pani_id);

-- avisos de fornada
create table if not exists public.fornadas (
  id         uuid primary key default gen_random_uuid(),
  pani_id    uuid not null references public.panis(id) on delete cascade,
  cat        text not null default 'pao' check (cat in ('pao', 'salgado', 'doce')),
  itens      text[] not null default '{}',
  img_url    text,
  feed       boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists fornadas_pani_idx on public.fornadas (pani_id, created_at desc);

-- publicações livres da pani
create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  pani_id    uuid not null references public.panis(id) on delete cascade,
  txt        text default '',
  img_url    text,
  created_at timestamptz not null default now()
);
create index if not exists posts_pani_idx on public.posts (pani_id, created_at desc);

-- curtidas de fornada/post
create table if not exists public.curtidas (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  tipo       text not null check (tipo in ('fornada', 'post')),
  item_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, tipo, item_id)
);
create index if not exists curtidas_item_idx on public.curtidas (item_id);

-- comentários dentro de uma publicação (conversa do feed)
create table if not exists public.comentarios_post (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('fornada', 'post')),
  item_id    uuid not null,
  pani_id    uuid references public.panis(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  autor      text not null default 'Cliente',
  txt        text not null,
  created_at timestamptz not null default now()
);
create index if not exists comentarios_post_item_idx on public.comentarios_post (item_id);

-- avaliação da pani (1 por cliente, com nota e resposta do dono)
create table if not exists public.comentarios (
  id         uuid primary key default gen_random_uuid(),
  pani_id    uuid not null references public.panis(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  autor      text not null default 'Cliente',
  nota       smallint check (nota between 1 and 5),
  txt        text not null default '',
  resp       text,
  created_at timestamptz not null default now(),
  unique (pani_id, user_id)
);
create index if not exists comentarios_pani_idx on public.comentarios (pani_id);

-- cliente escondeu uma pani
create table if not exists public.bloqueios (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  pani_id    uuid not null references public.panis(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, pani_id)
);

-- denúncias (fila de moderação do administrador)
create table if not exists public.denuncias (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete set null,
  tipo       text not null check (tipo in ('fornada', 'post', 'comentario', 'pani')),
  item_id    uuid not null,
  pani_id    uuid references public.panis(id) on delete cascade,
  motivo     text not null default 'outro',
  detalhe    text default '',
  status     text not null default 'aberta' check (status in ('aberta', 'removida', 'ok')),
  created_at timestamptz not null default now()
);
create index if not exists denuncias_status_idx on public.denuncias (status, created_at desc);

-- avisos (pani_id nulo = aviso da administração)
create table if not exists public.avisos (
  id         uuid primary key default gen_random_uuid(),
  pani_id    uuid references public.panis(id) on delete cascade,
  txt        text not null,
  img_url    text,
  ativo      boolean not null default false,
  created_at timestamptz not null default now()
);

-- cards de imagem no topo do app do cliente
create table if not exists public.cards (
  id         uuid primary key default gen_random_uuid(),
  img_url    text not null,
  link       text,
  created_at timestamptz not null default now()
);

-- cardápio: chapa e bebida podem ser pedidos; balcão é só vitrine
create table if not exists public.cardapio_itens (
  id         uuid primary key default gen_random_uuid(),
  pani_id    uuid not null references public.panis(id) on delete cascade,
  tipo       text not null default 'chapa' check (tipo in ('chapa', 'bebida', 'balcao')),
  cat        text check (cat in ('pao', 'salgado', 'doce')),
  nome       text not null,
  descricao  text default '',
  preco      numeric(10,2),
  img_url    text,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists cardapio_pani_idx on public.cardapio_itens (pani_id);

-- pedidos da mesa (quem pede não precisa de conta)
create table if not exists public.pedidos (
  id         uuid primary key default gen_random_uuid(),
  pani_id    uuid not null references public.panis(id) on delete cascade,
  mesa       text not null,
  cliente    text default '',
  obs        text default '',
  itens      jsonb not null default '[]',
  total      numeric(10,2) not null default 0,
  status     text not null default 'novo' check (status in ('novo', 'preparando', 'pronto', 'entregue', 'cancelado')),
  created_at timestamptz not null default now()
);
create index if not exists pedidos_pani_idx on public.pedidos (pani_id, created_at desc);

-- conversa pani <-> administração
create table if not exists public.mensagens (
  id         uuid primary key default gen_random_uuid(),
  pani_id    uuid not null references public.panis(id) on delete cascade,
  de         text not null check (de in ('pani', 'adm')),
  txt        text not null,
  created_at timestamptz not null default now()
);
create index if not exists mensagens_pani_idx on public.mensagens (pani_id, created_at);

-- caderno de receitas (só a pani vê)
create table if not exists public.receitas (
  id           uuid primary key default gen_random_uuid(),
  pani_id      uuid not null references public.panis(id) on delete cascade,
  titulo       text not null,
  ingredientes text default '',
  modo         text default '',
  created_at   timestamptz not null default now()
);

-- aparelhos inscritos para notificação
--   web   : endpoint do navegador  · p256dh/auth = chaves do Web Push
--   nativo: "native:ios:<token>"   · p256dh = plataforma · auth = 'native'
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_user_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------
-- 2. FUNÇÕES AUXILIARES
-- ---------------------------------------------------------------------

create or replace function public.ehAdm()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'adm');
$$;

create or replace function public.ehDono(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.panis where id = p and owner = auth.uid());
$$;

-- perfil novo + pani criada automaticamente no cadastro
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nome text := coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'cliente');
  v_base text;
  v_slug text;
  i int := 0;
begin
  if v_role not in ('cliente', 'pani') then v_role := 'cliente'; end if;

  insert into public.profiles (id, nome, role, telefone, foto_url)
  values (new.id, v_nome, v_role, new.raw_user_meta_data->>'telefone', new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;

  if v_role = 'pani' then
    v_base := regexp_replace(lower(translate(v_nome,
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^a-z0-9]+', '-', 'g');
    v_base := trim(both '-' from v_base);
    if v_base = '' then v_base := 'pani'; end if;
    v_slug := v_base;
    while exists (select 1 from public.panis where slug = v_slug) loop
      i := i + 1;
      v_slug := v_base || '-' || i;
    end loop;
    insert into public.panis (owner, nome, slug, horarios)
    values (new.id, v_nome, v_slug, null)
    on conflict (owner) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- contador de seguidores sempre certo
create or replace function public.conta_seguidores()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.interno', '1', true);
  if tg_op = 'INSERT' then
    update public.panis set seguidores = seguidores + 1 where id = new.pani_id;
  elsif tg_op = 'DELETE' then
    update public.panis set seguidores = greatest(0, seguidores - 1) where id = old.pani_id;
  end if;
  perform set_config('app.interno', '0', true);
  return null;
end;
$$;

drop trigger if exists follows_conta on public.follows;
create trigger follows_conta
  after insert or delete on public.follows
  for each row execute function public.conta_seguidores();

-- ---------------------------------------------------------------------
-- 3. RPCs CHAMADAS PELO APP
-- ---------------------------------------------------------------------

-- a pani responde a uma avaliação
create or replace function public.responder(c_id uuid, texto text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.interno', '1', true);
  update public.comentarios c
     set resp = left(texto, 500)
   where c.id = c_id
     and exists (select 1 from public.panis p where p.id = c.pani_id and p.owner = auth.uid());
  if not found then raise exception 'sem permissao'; end if;
end;
$$;

-- administração troca o plano da pani
create or replace function public.set_plano(p_id uuid, p_plano text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ehAdm() then raise exception 'sem permissao'; end if;
  if p_plano not in ('Básico', 'Pro', 'Premium') then raise exception 'plano invalido'; end if;
  update public.panis set plano = p_plano where id = p_id;
end;
$$;

-- grava/atualiza a inscrição de notificação do aparelho
create or replace function public.salvar_push(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sem sessao'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now();
end;
$$;

-- apaga as inscrições deste aparelho (usado ao desligar os avisos no app nativo)
create or replace function public.remover_push_do_aparelho(p_prefixo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_subscriptions
   where user_id = auth.uid() and endpoint like p_prefixo || '%';
end;
$$;

-- o usuário apaga a própria conta (exigência das lojas)
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'sem sessao'; end if;
  delete from auth.users where id = uid; -- o resto cai por cascade
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.responder(uuid, text) to authenticated;
grant execute on function public.set_plano(uuid, text) to authenticated;
grant execute on function public.salvar_push(text, text, text) to authenticated;
grant execute on function public.remover_push_do_aparelho(text) to authenticated;

-- trava campos que o próprio usuário não pode mudar sozinho
create or replace function public.protege_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role <> old.role and not public.ehAdm() then new.role := old.role; end if;
  return new;
end;
$$;
drop trigger if exists profiles_protege on public.profiles;
create trigger profiles_protege before update on public.profiles
  for each row execute function public.protege_profile();

-- a resposta da pani só muda pela RPC responder(); o plano, só pela RPC set_plano()
create or replace function public.interno()
returns boolean language sql stable as $$ select coalesce(current_setting('app.interno', true), '0') = '1'; $$;

create or replace function public.protege_comentario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.resp is distinct from old.resp and not public.interno() then new.resp := old.resp; end if;
  return new;
end;
$$;
drop trigger if exists comentarios_protege on public.comentarios;
create trigger comentarios_protege before update on public.comentarios
  for each row execute function public.protege_comentario();

create or replace function public.protege_pani()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.plano is distinct from old.plano and not public.ehAdm() then new.plano := old.plano; end if;
  if new.owner is distinct from old.owner then new.owner := old.owner; end if;
  if new.seguidores is distinct from old.seguidores and not (public.interno() or public.ehAdm()) then new.seguidores := old.seguidores; end if;
  return new;
end;
$$;
drop trigger if exists panis_protege on public.panis;
create trigger panis_protege before update on public.panis
  for each row execute function public.protege_pani();

-- ---------------------------------------------------------------------
-- 4. SEGURANÇA (RLS) — ninguém lê nem escreve o que não é seu
-- ---------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.panis              enable row level security;
alter table public.follows            enable row level security;
alter table public.fornadas           enable row level security;
alter table public.posts              enable row level security;
alter table public.curtidas           enable row level security;
alter table public.comentarios_post   enable row level security;
alter table public.comentarios        enable row level security;
alter table public.bloqueios          enable row level security;
alter table public.denuncias          enable row level security;
alter table public.avisos             enable row level security;
alter table public.cards              enable row level security;
alter table public.cardapio_itens     enable row level security;
alter table public.pedidos            enable row level security;
alter table public.mensagens          enable row level security;
alter table public.receitas           enable row level security;
alter table public.push_subscriptions enable row level security;

-- profiles
-- leitura de perfis: definida em 0002_delivery.sql (o próprio, a administração e a pani que a pessoa segue)
drop policy if exists profiles_eu_atualizo on public.profiles;
create policy profiles_eu_atualizo on public.profiles for update to authenticated
  using (id = auth.uid() or public.ehAdm()) with check (id = auth.uid() or public.ehAdm());
drop policy if exists profiles_eu_insiro on public.profiles;
create policy profiles_eu_insiro on public.profiles for insert to authenticated with check (id = auth.uid());

-- panis: todo mundo vê as visíveis; o dono vê e edita a sua; adm vê e edita todas
drop policy if exists panis_leitura on public.panis;
create policy panis_leitura on public.panis for select to anon, authenticated
  using (visivel or owner = auth.uid() or public.ehAdm());
drop policy if exists panis_dono_edita on public.panis;
create policy panis_dono_edita on public.panis for update to authenticated
  using (owner = auth.uid() or public.ehAdm()) with check (owner = auth.uid() or public.ehAdm());

-- follows
drop policy if exists follows_leitura on public.follows;
create policy follows_leitura on public.follows for select to authenticated
  using (user_id = auth.uid() or public.ehDono(pani_id) or public.ehAdm());
drop policy if exists follows_eu_sigo on public.follows;
create policy follows_eu_sigo on public.follows for insert to authenticated with check (user_id = auth.uid());
drop policy if exists follows_eu_deixo on public.follows;
create policy follows_eu_deixo on public.follows for delete to authenticated using (user_id = auth.uid());

-- fornadas e posts: leitura pública (pani visível); escrita só do dono
drop policy if exists fornadas_leitura on public.fornadas;
create policy fornadas_leitura on public.fornadas for select to anon, authenticated
  using (exists (select 1 from public.panis p where p.id = pani_id and (p.visivel or p.owner = auth.uid() or public.ehAdm())));
drop policy if exists fornadas_dono on public.fornadas;
create policy fornadas_dono on public.fornadas for insert to authenticated with check (public.ehDono(pani_id));
drop policy if exists fornadas_dono_apaga on public.fornadas;
create policy fornadas_dono_apaga on public.fornadas for delete to authenticated using (public.ehDono(pani_id) or public.ehAdm());

drop policy if exists posts_leitura on public.posts;
create policy posts_leitura on public.posts for select to anon, authenticated
  using (exists (select 1 from public.panis p where p.id = pani_id and (p.visivel or p.owner = auth.uid() or public.ehAdm())));
drop policy if exists posts_dono on public.posts;
create policy posts_dono on public.posts for insert to authenticated with check (public.ehDono(pani_id));
drop policy if exists posts_dono_apaga on public.posts;
create policy posts_dono_apaga on public.posts for delete to authenticated using (public.ehDono(pani_id) or public.ehAdm());

-- curtidas
drop policy if exists curtidas_leitura on public.curtidas;
create policy curtidas_leitura on public.curtidas for select to authenticated using (true);
drop policy if exists curtidas_minhas on public.curtidas;
create policy curtidas_minhas on public.curtidas for insert to authenticated with check (user_id = auth.uid());
drop policy if exists curtidas_minhas_apago on public.curtidas;
create policy curtidas_minhas_apago on public.curtidas for delete to authenticated using (user_id = auth.uid());

-- comentários do feed
drop policy if exists cpost_leitura on public.comentarios_post;
create policy cpost_leitura on public.comentarios_post for select to authenticated using (true);
drop policy if exists cpost_insere on public.comentarios_post;
create policy cpost_insere on public.comentarios_post for insert to authenticated with check (user_id = auth.uid());
drop policy if exists cpost_apaga on public.comentarios_post;
create policy cpost_apaga on public.comentarios_post for delete to authenticated
  using (user_id = auth.uid() or public.ehDono(pani_id) or public.ehAdm());

-- avaliações da pani
drop policy if exists coment_leitura on public.comentarios;
create policy coment_leitura on public.comentarios for select to anon, authenticated using (true);
drop policy if exists coment_insere on public.comentarios;
create policy coment_insere on public.comentarios for insert to authenticated with check (user_id = auth.uid());
drop policy if exists coment_atualiza on public.comentarios;
create policy coment_atualiza on public.comentarios for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists coment_apaga on public.comentarios;
create policy coment_apaga on public.comentarios for delete to authenticated using (user_id = auth.uid() or public.ehAdm());

-- bloqueios (só o próprio dono vê)
drop policy if exists bloq_minhas on public.bloqueios;
create policy bloq_minhas on public.bloqueios for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- denúncias: quem denuncia só insere; a administração lê e resolve
drop policy if exists den_insere on public.denuncias;
create policy den_insere on public.denuncias for insert to anon, authenticated with check (true);
drop policy if exists den_adm_le on public.denuncias;
create policy den_adm_le on public.denuncias for select to authenticated using (public.ehAdm());
drop policy if exists den_adm_resolve on public.denuncias;
create policy den_adm_resolve on public.denuncias for update to authenticated using (public.ehAdm()) with check (public.ehAdm());

-- avisos: cliente vê os liberados; pani vê e cria os seus; adm faz tudo
drop policy if exists avisos_leitura on public.avisos;
create policy avisos_leitura on public.avisos for select to anon, authenticated
  using (ativo or public.ehDono(pani_id) or public.ehAdm());
drop policy if exists avisos_pani_cria on public.avisos;
create policy avisos_pani_cria on public.avisos for insert to authenticated
  with check ((public.ehDono(pani_id) and ativo = false) or public.ehAdm());
drop policy if exists avisos_adm_edita on public.avisos;
create policy avisos_adm_edita on public.avisos for update to authenticated using (public.ehAdm()) with check (public.ehAdm());
drop policy if exists avisos_adm_apaga on public.avisos;
create policy avisos_adm_apaga on public.avisos for delete to authenticated using (public.ehAdm());

-- cards
drop policy if exists cards_leitura on public.cards;
create policy cards_leitura on public.cards for select to anon, authenticated using (true);
drop policy if exists cards_adm on public.cards;
create policy cards_adm on public.cards for all to authenticated using (public.ehAdm()) with check (public.ehAdm());

-- cardápio: leitura pública (é a página /c/slug), escrita do dono
drop policy if exists menu_leitura on public.cardapio_itens;
create policy menu_leitura on public.cardapio_itens for select to anon, authenticated using (true);
drop policy if exists menu_dono on public.cardapio_itens;
create policy menu_dono on public.cardapio_itens for all to authenticated
  using (public.ehDono(pani_id) or public.ehAdm()) with check (public.ehDono(pani_id) or public.ehAdm());

-- pedidos: leitura e criação ficam em 0002_delivery.sql (pedido só nasce pela função fazer_pedido,
-- com o preço calculado no servidor). Aqui ficam só a edição e a exclusão pela pani.
drop policy if exists pedidos_dono on public.pedidos;
create policy pedidos_dono on public.pedidos for update to authenticated
  using (public.ehDono(pani_id)) with check (public.ehDono(pani_id));
drop policy if exists pedidos_dono_apaga on public.pedidos;
create policy pedidos_dono_apaga on public.pedidos for delete to authenticated using (public.ehDono(pani_id));

-- conversa pani <-> administração
drop policy if exists msg_leitura on public.mensagens;
create policy msg_leitura on public.mensagens for select to authenticated
  using (public.ehDono(pani_id) or public.ehAdm());
drop policy if exists msg_envia on public.mensagens;
create policy msg_envia on public.mensagens for insert to authenticated
  with check ((de = 'pani' and public.ehDono(pani_id)) or (de = 'adm' and public.ehAdm()));

-- receitas (privadas da pani)
drop policy if exists receitas_dono on public.receitas;
create policy receitas_dono on public.receitas for all to authenticated
  using (public.ehDono(pani_id)) with check (public.ehDono(pani_id));

-- inscrições de push (cada um só vê as suas; a Edge Function usa service_role)
drop policy if exists push_minhas on public.push_subscriptions;
create policy push_minhas on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 5. TEMPO REAL (pedidos chegando, conversa, feed)
-- ---------------------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table public.pedidos;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.mensagens; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.fornadas;  exception when duplicate_object then null; end;
end $$;

-- ---------------------------------------------------------------------
-- 6. STORAGE (fotos) — bucket público só para leitura
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imagens', 'imagens', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 10485760;

drop policy if exists imagens_leitura on storage.objects;
create policy imagens_leitura on storage.objects for select to anon, authenticated using (bucket_id = 'imagens');

drop policy if exists imagens_envio on storage.objects;
create policy imagens_envio on storage.objects for insert to authenticated
  with check (bucket_id = 'imagens' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists imagens_apaga on storage.objects;
create policy imagens_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'imagens' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- 7. PRIMEIRO ADMINISTRADOR
--    Cadastre-se normalmente no app, depois rode (trocando o e-mail):
--
--    update public.profiles set role = 'adm'
--     where id = (select id from auth.users where email = 'voce@exemplo.com');
-- ---------------------------------------------------------------------
