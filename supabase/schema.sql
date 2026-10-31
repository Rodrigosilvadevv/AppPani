-- =====================================================================
-- AppPani — schema completo. Cole no Supabase > SQL Editor > Run.
-- =====================================================================
create extension if not exists unaccent with schema extensions;

-- ---------- tabelas ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  foto_url text,
  telefone text,
  role text not null default 'cliente' check (role in ('cliente','pani','adm')),
  created_at timestamptz not null default now()
);

create table public.panis (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null unique references public.profiles(id) on delete cascade,
  slug text not null unique,
  nome text not null,
  emoji text not null default '🥖',
  bio text not null default '',
  endereco text not null default '',
  lat double precision,
  lng double precision,
  foto_url text,
  plano text not null default 'Básico' check (plano in ('Básico','Pro','Premium')),
  horarios jsonb not null default '{}'::jsonb,  -- {"0":{"aberto":true,"ini":"06:00","fim":"19:00"},...} (0 = domingo)
  seguidores int not null default 0,
  ultimo_aviso timestamptz,
  created_at timestamptz not null default now()
);

create table public.follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  pani_id uuid not null references public.panis(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, pani_id)
);

create table public.fornadas (
  id uuid primary key default gen_random_uuid(),
  pani_id uuid not null references public.panis(id) on delete cascade,
  img_url text,
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  pani_id uuid not null references public.panis(id) on delete cascade,
  txt text not null default '',
  img_url text,
  created_at timestamptz not null default now()
);

create table public.receitas (
  id uuid primary key default gen_random_uuid(),
  pani_id uuid not null references public.panis(id) on delete cascade,
  titulo text not null,
  ingredientes text not null default '',
  modo text not null default '',
  created_at timestamptz not null default now()
);

create table public.comentarios (
  id uuid primary key default gen_random_uuid(),
  pani_id uuid not null references public.panis(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  autor text not null,
  nota int not null check (nota between 1 and 5),
  txt text not null,
  resp text not null default '',
  created_at timestamptz not null default now(),
  unique (pani_id, user_id)
);

create table public.avisos (          -- pani_id nulo = aviso do administrador
  id uuid primary key default gen_random_uuid(),
  pani_id uuid references public.panis(id) on delete cascade,
  txt text not null,
  img_url text,
  ativo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.cards (           -- cards do administrador (somente imagem)
  id uuid primary key default gen_random_uuid(),
  img_url text not null,
  created_at timestamptz not null default now()
);

create table public.cardapio_itens (
  id uuid primary key default gen_random_uuid(),
  pani_id uuid not null references public.panis(id) on delete cascade,
  tipo text not null check (tipo in ('chapa','bebida','balcao')), -- balcao = só visualização
  nome text not null,
  descricao text not null default '',
  preco numeric(10,2),
  img_url text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  pani_id uuid not null references public.panis(id) on delete cascade,
  mesa text not null check (char_length(mesa) between 1 and 20),
  cliente text not null default '' check (char_length(cliente) <= 60),
  obs text not null default '' check (char_length(obs) <= 300),
  itens jsonb not null,
  total numeric(10,2) not null default 0,
  status text not null default 'novo' check (status in ('novo','preparando','pronto','entregue','cancelado')),
  created_at timestamptz not null default now()
);

create table public.mensagens (
  id uuid primary key default gen_random_uuid(),
  pani_id uuid not null references public.panis(id) on delete cascade,
  de text not null check (de in ('pani','adm')),
  txt text not null,
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index on public.follows (pani_id);
create index on public.fornadas (pani_id, created_at desc);
create index on public.posts (pani_id, created_at desc);
create index on public.pedidos (pani_id, status, created_at);
create index on public.mensagens (pani_id, created_at);
create index on public.cardapio_itens (pani_id);

-- ---------- funções auxiliares ----------
create or replace function public.is_adm() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'adm') $$;

create or replace function public.my_pani() returns uuid
language sql stable security definer set search_path = public as
$$ select id from panis where owner = auth.uid() $$;

create or replace function public.make_slug(n text, uid uuid) returns text
language sql immutable set search_path = public, extensions as
$$ select coalesce(nullif(trim(both '-' from regexp_replace(lower(unaccent(n)), '[^a-z0-9]+', '-', 'g')), ''), 'pani') || '-' || substr(uid::text, 1, 4) $$;

-- ---------- novo usuário: cria perfil (e a pani, se for o caso) ----------
-- Obs.: o papel 'adm' NUNCA vem do cadastro; é dado manualmente (veja o README).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  r text := case when new.raw_user_meta_data->>'role' = 'pani' then 'pani' else 'cliente' end;
  n text := coalesce(nullif(new.raw_user_meta_data->>'nome',''), nullif(new.raw_user_meta_data->>'full_name',''),
                     nullif(split_part(coalesce(new.email,''),'@',1),''), 'Usuário');
begin
  insert into profiles (id, nome, telefone, role, foto_url)
  values (new.id, n, nullif(new.phone,''), r, new.raw_user_meta_data->>'avatar_url');
  if r = 'pani' then
    insert into panis (owner, nome, slug) values (new.id, n, make_slug(n, new.id));
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- cliente que também quer cadastrar uma panificadora (ex.: entrou com Google)
create or replace function public.virar_pani(p_nome text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  update profiles set role = 'pani' where id = auth.uid() and role = 'cliente';
  insert into panis (owner, nome, slug) values (auth.uid(), p_nome, make_slug(p_nome, auth.uid()))
  on conflict (owner) do nothing;
end $$;

-- ---------- triggers de contagem ----------
create or replace function public.t_follows() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then update panis set seguidores = seguidores + 1 where id = new.pani_id;
  else update panis set seguidores = greatest(seguidores - 1, 0) where id = old.pani_id; end if;
  return null;
end $$;
create trigger trg_follows after insert or delete on public.follows
for each row execute function public.t_follows();

create or replace function public.t_fornada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update panis set ultimo_aviso = new.created_at where id = new.pani_id;
  return null;
end $$;
create trigger trg_fornada after insert on public.fornadas
for each row execute function public.t_fornada();

-- ---------- RPCs ----------
create or replace function public.responder(c_id uuid, texto text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update comentarios set resp = left(texto, 500)
  where id = c_id and pani_id = my_pani();
end $$;

create or replace function public.set_plano(p_id uuid, p_plano text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_adm() then raise exception 'sem permissão'; end if;
  update panis set plano = p_plano where id = p_id;
end $$;

create or replace function public.registrar_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------- permissões por coluna (impede o usuário de se promover) ----------
revoke update on public.profiles from anon, authenticated;
grant update (nome, foto_url, telefone) on public.profiles to authenticated;
revoke update on public.panis from anon, authenticated;
grant update (slug, nome, emoji, bio, endereco, lat, lng, foto_url, horarios) on public.panis to authenticated;
revoke update on public.comentarios from anon, authenticated;
grant update (nota, txt) on public.comentarios to authenticated;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.panis enable row level security;
alter table public.follows enable row level security;
alter table public.fornadas enable row level security;
alter table public.posts enable row level security;
alter table public.receitas enable row level security;
alter table public.comentarios enable row level security;
alter table public.avisos enable row level security;
alter table public.cards enable row level security;
alter table public.cardapio_itens enable row level security;
alter table public.pedidos enable row level security;
alter table public.mensagens enable row level security;
alter table public.push_subscriptions enable row level security;

create policy profiles_sel on public.profiles for select using (
  id = auth.uid() or is_adm()
  or exists (select 1 from follows f where f.user_id = profiles.id and f.pani_id = my_pani()));
create policy profiles_upd on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy panis_sel on public.panis for select using (true);
create policy panis_upd on public.panis for update using (owner = auth.uid()) with check (owner = auth.uid());

create policy follows_sel on public.follows for select using (user_id = auth.uid() or pani_id = my_pani() or is_adm());
create policy follows_ins on public.follows for insert with check (user_id = auth.uid());
create policy follows_del on public.follows for delete using (user_id = auth.uid());

create policy fornadas_sel on public.fornadas for select using (true);
create policy fornadas_ins on public.fornadas for insert with check (pani_id = my_pani());
create policy fornadas_del on public.fornadas for delete using (pani_id = my_pani());

create policy posts_sel on public.posts for select using (true);
create policy posts_own on public.posts for all using (pani_id = my_pani()) with check (pani_id = my_pani());

create policy receitas_sel on public.receitas for select using (true);
create policy receitas_own on public.receitas for all using (pani_id = my_pani()) with check (pani_id = my_pani());

create policy coment_sel on public.comentarios for select using (true);
create policy coment_ins on public.comentarios for insert with check (user_id = auth.uid());
create policy coment_upd on public.comentarios for update using (user_id = auth.uid());
create policy coment_del on public.comentarios for delete using (user_id = auth.uid() or is_adm());

create policy avisos_sel on public.avisos for select using (ativo or pani_id = my_pani() or is_adm());
create policy avisos_ins on public.avisos for insert with check ((pani_id = my_pani() and not ativo) or is_adm());
create policy avisos_upd on public.avisos for update using (is_adm());
create policy avisos_del on public.avisos for delete using (is_adm() or (pani_id = my_pani() and not ativo));

create policy cards_sel on public.cards for select using (true);
create policy cards_adm on public.cards for all using (is_adm()) with check (is_adm());

create policy cardapio_sel on public.cardapio_itens for select using (true);
create policy cardapio_own on public.cardapio_itens for all using (pani_id = my_pani()) with check (pani_id = my_pani());

-- pedidos: qualquer pessoa na mesa (anônima) pode CRIAR; só a pani dona (e o adm) pode LER/atualizar
create policy pedidos_ins on public.pedidos for insert
  with check (status = 'novo' and exists (select 1 from panis p where p.id = pani_id));
create policy pedidos_sel on public.pedidos for select using (pani_id = my_pani() or is_adm());
create policy pedidos_upd on public.pedidos for update using (pani_id = my_pani()) with check (pani_id = my_pani());

create policy msg_sel on public.mensagens for select using (pani_id = my_pani() or is_adm());
create policy msg_ins on public.mensagens for insert
  with check ((de = 'pani' and pani_id = my_pani()) or (de = 'adm' and is_adm()));

create policy push_sel on public.push_subscriptions for select using (user_id = auth.uid());
create policy push_del on public.push_subscriptions for delete using (user_id = auth.uid());

-- ---------- realtime ----------
alter publication supabase_realtime add table public.pedidos, public.mensagens, public.fornadas;

-- ---------- storage (fotos) ----------
insert into storage.buckets (id, name, public) values ('imagens', 'imagens', true) on conflict (id) do nothing;
create policy imagens_leitura on storage.objects for select using (bucket_id = 'imagens');
create policy imagens_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'imagens' and (storage.foldername(name))[1] = auth.uid()::text);
create policy imagens_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'imagens' and (storage.foldername(name))[1] = auth.uid()::text);
