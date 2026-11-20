-- =====================================================================
--  AppPani · 0002 — modo delivery, capa, Instagram/WhatsApp, venda por kg
--  Rode DEPOIS do 0001_schema.sql, no SQL Editor do Supabase.
--  Pode rodar de novo sem medo (tudo é idempotente).
--
--  O que muda:
--   • panis: capa_url, instagram, whatsapp, delivery (liga/desliga),
--            taxa_entrega, pedido_minimo, tempo_entrega
--   • cardapio_itens: unidade ('un' ou 'kg')
--   • pedidos: tipo ('mesa' | 'delivery'), cliente logado, endereço, telefone,
--              pagamento, troco, subtotal, taxa, status 'saiu' (saiu para entrega)
--   • dados_entrega: endereço/telefone que o cliente usou por último (só ele vê)
--   • fazer_pedido(): o pedido é montado NO SERVIDOR com o preço do cardápio —
--                     ninguém consegue mandar um pedido com preço inventado
--   • acompanhar_pedido(), cancelar_meu_pedido()
--   • segurança: cada cliente só lê os próprios pedidos e o próprio perfil
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. COLUNAS NOVAS
-- ---------------------------------------------------------------------
alter table public.panis add column if not exists capa_url      text;
alter table public.panis add column if not exists instagram     text;
alter table public.panis add column if not exists whatsapp      text;
alter table public.panis add column if not exists delivery      boolean not null default false;
alter table public.panis add column if not exists taxa_entrega  numeric(10,2) not null default 0;
alter table public.panis add column if not exists pedido_minimo numeric(10,2) not null default 0;
alter table public.panis add column if not exists tempo_entrega text not null default '40–60 min';

alter table public.panis drop constraint if exists panis_valores_entrega_check;
alter table public.panis add constraint panis_valores_entrega_check
  check (taxa_entrega >= 0 and taxa_entrega <= 500 and pedido_minimo >= 0 and pedido_minimo <= 5000);

alter table public.cardapio_itens add column if not exists unidade text;
alter table public.cardapio_itens drop constraint if exists cardapio_itens_unidade_check;
alter table public.cardapio_itens add constraint cardapio_itens_unidade_check check (unidade is null or unidade in ('un', 'kg'));

alter table public.pedidos alter column mesa drop not null;
alter table public.pedidos add column if not exists tipo         text not null default 'mesa';
alter table public.pedidos add column if not exists user_id      uuid references public.profiles(id) on delete set null;
alter table public.pedidos add column if not exists telefone     text;
alter table public.pedidos add column if not exists endereco     text;
alter table public.pedidos add column if not exists pagamento    text;
alter table public.pedidos add column if not exists troco        numeric(10,2);
alter table public.pedidos add column if not exists subtotal     numeric(10,2);
alter table public.pedidos add column if not exists taxa_entrega numeric(10,2) not null default 0;
alter table public.pedidos add column if not exists updated_at   timestamptz not null default now();

alter table public.pedidos drop constraint if exists pedidos_status_check;
alter table public.pedidos add constraint pedidos_status_check
  check (status in ('novo', 'preparando', 'pronto', 'saiu', 'entregue', 'cancelado'));
alter table public.pedidos drop constraint if exists pedidos_tipo_check;
alter table public.pedidos add constraint pedidos_tipo_check check (tipo in ('mesa', 'delivery'));
alter table public.pedidos drop constraint if exists pedidos_pagamento_check;
alter table public.pedidos add constraint pedidos_pagamento_check check (pagamento is null or pagamento in ('pix', 'dinheiro', 'cartao'));
alter table public.pedidos drop constraint if exists pedidos_mesa_ou_endereco_check;
alter table public.pedidos add constraint pedidos_mesa_ou_endereco_check
  check ((tipo = 'mesa' and coalesce(mesa, '') <> '') or (tipo = 'delivery' and coalesce(endereco, '') <> ''));

create index if not exists pedidos_user_idx on public.pedidos (user_id, created_at desc);
create index if not exists pedidos_aberto_idx on public.pedidos (pani_id, status);

-- endereço e telefone de entrega (preenche sozinho o próximo pedido)
create table if not exists public.dados_entrega (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  endereco   text not null default '',
  telefone   text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.dados_entrega enable row level security;
drop policy if exists entrega_minha on public.dados_entrega;
create policy entrega_minha on public.dados_entrega for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2. FAZER PEDIDO (mesa ou delivery) — tudo validado e calculado aqui
--    p_itens: [{ "id": "<uuid do item>", "qtd": 2 }]  · item por kg: qtd = gramas
-- ---------------------------------------------------------------------
create or replace function public.fazer_pedido(
  p_pani      uuid,
  p_tipo      text,
  p_itens     jsonb,
  p_mesa      text    default null,
  p_cliente   text    default '',
  p_obs       text    default '',
  p_telefone  text    default null,
  p_endereco  text    default null,
  p_pagamento text    default null,
  p_troco     numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_pani  public.panis%rowtype;
  v_menu  public.cardapio_itens%rowtype;
  v_item  jsonb;
  v_un    text;
  v_qtd   numeric;
  v_linha numeric;
  v_sub   numeric := 0;
  v_taxa  numeric := 0;
  v_lin   jsonb := '[]'::jsonb;
  v_id    uuid;
  v_fone  text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_end   text := left(trim(coalesce(p_endereco, '')), 300);
begin
  select * into v_pani from public.panis where id = p_pani;
  if not found then raise exception 'Panificadora não encontrada.'; end if;
  if p_tipo is null or p_tipo not in ('mesa', 'delivery') then raise exception 'Tipo de pedido inválido.'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Seu pedido está vazio.';
  end if;
  if jsonb_array_length(p_itens) > 60 then raise exception 'Itens demais em um pedido só.'; end if;

  if p_tipo = 'mesa' then
    if coalesce(trim(p_mesa), '') = '' then raise exception 'Informe o número da mesa.'; end if;
    -- freio contra robô: no máximo 8 pedidos por mesa em 5 minutos
    if (select count(*) from public.pedidos
         where pani_id = p_pani and mesa = trim(p_mesa) and created_at > now() - interval '5 minutes') >= 8 then
      raise exception 'Muitos pedidos seguidos nesta mesa. Chame o atendente.';
    end if;
  else
    if v_uid is null then raise exception 'Entre na sua conta para pedir delivery.'; end if;
    if not v_pani.delivery or not v_pani.visivel then raise exception 'Esta panificadora não está recebendo delivery agora.'; end if;
    if v_end = '' then raise exception 'Informe o endereço de entrega.'; end if;
    if length(v_fone) < 10 or length(v_fone) > 13 then raise exception 'Informe um telefone com DDD.'; end if;
    if p_pagamento is null or p_pagamento not in ('pix', 'dinheiro', 'cartao') then raise exception 'Escolha a forma de pagamento.'; end if;
    if (select count(*) from public.pedidos
         where user_id = v_uid and status in ('novo', 'preparando', 'pronto', 'saiu')) >= 5 then
      raise exception 'Você já tem 5 pedidos em andamento. Aguarde a entrega de algum.';
    end if;
    v_taxa := coalesce(v_pani.taxa_entrega, 0);
  end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    begin
      select * into v_menu from public.cardapio_itens
       where id = (v_item->>'id')::uuid and pani_id = p_pani and ativo;
    exception when invalid_text_representation then
      raise exception 'Item inválido no pedido.';
    end;
    if not found or v_menu.preco is null then
      raise exception 'Um item do seu pedido não está mais disponível. Atualize a página.';
    end if;

    if p_tipo = 'mesa' and v_menu.tipo not in ('chapa', 'bebida') then
      raise exception '"%" não pode ser pedido pela mesa.', v_menu.nome;
    end if;
    if p_tipo = 'delivery' and (v_menu.tipo <> 'balcao' or v_menu.cat is null or v_menu.unidade is null) then
      raise exception '"%" não está disponível no delivery.', v_menu.nome;
    end if;

    v_un := coalesce(v_menu.unidade, 'un');
    begin
      v_qtd := (v_item->>'qtd')::numeric;
    exception when others then
      raise exception 'Quantidade inválida.';
    end;

    if v_un = 'kg' then
      -- quantidade em gramas: de 50 g a 10 kg
      if v_qtd is null or v_qtd < 50 or v_qtd > 10000 then raise exception 'Quantidade de "%" inválida (50 g a 10 kg).', v_menu.nome; end if;
      v_qtd := round(v_qtd);
      v_linha := round(v_menu.preco * v_qtd / 1000, 2);
    else
      if v_qtd is null or v_qtd < 1 or v_qtd > 99 or v_qtd <> trunc(v_qtd) then raise exception 'Quantidade de "%" inválida.', v_menu.nome; end if;
      v_linha := round(v_menu.preco * v_qtd, 2);
    end if;

    v_sub := v_sub + v_linha;
    v_lin := v_lin || jsonb_build_array(jsonb_build_object(
      'id', v_menu.id, 'nome', v_menu.nome, 'unidade', v_un,
      'qtd', v_qtd, 'preco', v_menu.preco, 'total', v_linha));
  end loop;

  if p_tipo = 'delivery' and v_sub < coalesce(v_pani.pedido_minimo, 0) then
    raise exception 'O pedido mínimo desta panificadora é R$ %.', replace(to_char(v_pani.pedido_minimo, 'FM999990.00'), '.', ',');
  end if;
  if p_tipo = 'delivery' and p_pagamento = 'dinheiro' and p_troco is not null and p_troco > 0 and p_troco < v_sub + v_taxa then
    raise exception 'O troco precisa ser para um valor maior que o total.';
  end if;

  insert into public.pedidos (
    pani_id, tipo, user_id, mesa, cliente, obs, itens, subtotal, taxa_entrega, total,
    telefone, endereco, pagamento, troco, status
  ) values (
    p_pani, p_tipo, v_uid,
    case when p_tipo = 'mesa' then left(trim(p_mesa), 20) end,
    left(trim(coalesce(p_cliente, '')), 60),
    left(trim(coalesce(p_obs, '')), 300),
    v_lin, v_sub, v_taxa, v_sub + v_taxa,
    case when p_tipo = 'delivery' then v_fone end,
    case when p_tipo = 'delivery' then v_end end,
    case when p_tipo = 'delivery' then p_pagamento end,
    case when p_tipo = 'delivery' and p_pagamento = 'dinheiro' and p_troco > 0 then round(p_troco, 2) end,
    'novo'
  ) returning id into v_id;

  -- lembra o endereço para o próximo pedido
  if p_tipo = 'delivery' then
    insert into public.dados_entrega (user_id, endereco, telefone, updated_at)
    values (v_uid, v_end, v_fone, now())
    on conflict (user_id) do update set endereco = excluded.endereco, telefone = excluded.telefone, updated_at = now();
  end if;

  return jsonb_build_object('id', v_id, 'total', v_sub + v_taxa);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. ACOMPANHAR PEDIDO — quem tem o código do pedido vê o andamento.
--    Endereço e telefone só voltam para o próprio cliente ou para a pani.
-- ---------------------------------------------------------------------
create or replace function public.acompanhar_pedido(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'tipo', o.tipo, 'status', o.status, 'mesa', o.mesa, 'cliente', o.cliente,
    'itens', o.itens, 'subtotal', coalesce(o.subtotal, o.total), 'taxa_entrega', o.taxa_entrega, 'total', o.total,
    'obs', o.obs, 'pagamento', o.pagamento, 'troco', o.troco,
    'created_at', o.created_at, 'updated_at', o.updated_at,
    'meu', (o.user_id is not null and o.user_id = auth.uid()),
    'endereco', case when o.user_id = auth.uid() or p.owner = auth.uid() then o.endereco end,
    'pani', jsonb_build_object('id', p.id, 'nome', p.nome, 'slug', p.slug, 'emoji', p.emoji,
                               'foto_url', p.foto_url, 'whatsapp', p.whatsapp, 'tempo_entrega', p.tempo_entrega)
  )
  from public.pedidos o join public.panis p on p.id = o.pani_id
  where o.id = p_id;
$$;

-- o cliente desiste enquanto a pani ainda não começou a preparar
create or replace function public.cancelar_meu_pedido(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.pedidos set status = 'cancelado'
   where id = p_id and user_id = auth.uid() and status = 'novo';
  if not found then raise exception 'Este pedido já está sendo preparado. Fale com a panificadora.'; end if;
end;
$$;

grant execute on function public.fazer_pedido(uuid, text, jsonb, text, text, text, text, text, text, numeric) to anon, authenticated;
grant execute on function public.acompanhar_pedido(uuid) to anon, authenticated;
revoke all on function public.cancelar_meu_pedido(uuid) from public, anon;
grant execute on function public.cancelar_meu_pedido(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. PROTEÇÃO DOS PEDIDOS
-- ---------------------------------------------------------------------
create or replace function public.protege_pedido()
returns trigger language plpgsql as $$
begin
  new.pani_id := old.pani_id;   -- pedido não muda de loja
  -- nem de dono. Exceção: quando o cliente exclui a conta, o banco zera o vínculo (vem de outro gatilho)
  if not (new.user_id is null and pg_trigger_depth() > 1) then new.user_id := old.user_id; end if;
  new.tipo    := old.tipo;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists pedidos_protege on public.pedidos;
create trigger pedidos_protege before update on public.pedidos
  for each row execute function public.protege_pedido();

-- pedidos: o cliente lê os seus; a pani, os da loja; a administração, todos.
-- Ninguém cria pedido direto na tabela — só pela fazer_pedido() (a pani pode lançar na mão).
drop policy if exists pedidos_leitura on public.pedidos;
create policy pedidos_leitura on public.pedidos for select to authenticated
  using (user_id = auth.uid() or public.ehDono(pani_id) or public.ehAdm());
drop policy if exists pedidos_cria on public.pedidos;
create policy pedidos_cria on public.pedidos for insert to authenticated
  with check (public.ehDono(pani_id));

revoke select (id, status) on public.pedidos from anon;
revoke all on public.pedidos from anon;

-- ---------------------------------------------------------------------
-- 5. PERFIS — antes qualquer pessoa logada lia todos os perfis (com telefone).
--    Agora: o próprio, a administração e a pani que a pessoa segue.
-- ---------------------------------------------------------------------
create or replace function public.segueMinhaPani(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.follows f join public.panis p on p.id = f.pani_id
     where f.user_id = u and p.owner = auth.uid());
$$;

drop policy if exists profiles_leitura on public.profiles;
create policy profiles_leitura on public.profiles for select to authenticated
  using (id = auth.uid() or public.ehAdm() or public.segueMinhaPani(id));

-- ---------------------------------------------------------------------
-- 6. CAMPOS DA PANI — limpa Instagram/WhatsApp na gravação
-- ---------------------------------------------------------------------
create or replace function public.limpa_pani()
returns trigger language plpgsql as $$
begin
  if new.instagram is not null then
    new.instagram := lower(regexp_replace(regexp_replace(trim(new.instagram), '^(https?://)?(www\.)?instagram\.com/', '', 'i'), '[^A-Za-z0-9._]', '', 'g'));
    new.instagram := nullif(left(new.instagram, 30), '');
  end if;
  if new.whatsapp is not null then
    new.whatsapp := regexp_replace(new.whatsapp, '\D', '', 'g');
    if new.whatsapp = '' then new.whatsapp := null;
    elsif length(new.whatsapp) between 10 and 11 then new.whatsapp := '55' || new.whatsapp;
    end if;
    if new.whatsapp is not null and length(new.whatsapp) not between 12 and 13 then
      raise exception 'WhatsApp inválido. Use DDD + número.';
    end if;
  end if;
  new.tempo_entrega := left(coalesce(nullif(trim(new.tempo_entrega), ''), '40–60 min'), 30);
  return new;
end;
$$;
drop trigger if exists panis_limpa on public.panis;
create trigger panis_limpa before insert or update on public.panis
  for each row execute function public.limpa_pani();

-- ---------------------------------------------------------------------
-- 7. TEMPO REAL — o cliente vê o status mudar na hora
-- ---------------------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table public.pedidos; exception when duplicate_object then null; end;
end $$;
