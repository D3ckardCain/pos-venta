-- ============================================
-- MIGRACIÓN 023
-- Sistema de puntos: canje, códigos, caducidad,
-- promociones por puntos y link público.
-- ============================================

-- ============================================
-- 1) SALES: campos de puntos usados
-- ============================================
alter table sales
  add column if not exists points_used integer not null default 0,
  add column if not exists points_discount_amount numeric(18,4) not null default 0;

comment on column sales.points_used is
  'Puntos canjeados en esta venta (0 si no se usaron).';
comment on column sales.points_discount_amount is
  'Descuento aplicado en moneda original por canje de puntos.';

create index if not exists idx_sales_points_used
  on sales(points_used)
  where points_used > 0;

-- ============================================
-- 2) PROMOTIONS: promociones solo con puntos
-- ============================================
alter table promotions
  add column if not exists only_with_points boolean not null default false;

comment on column promotions.only_with_points is
  'Si es true, la promoción solo aplica cuando el cliente paga usando puntos.';

-- ============================================
-- 3) CUSTOMERS: código secreto para link público
-- ============================================
alter table customers
  add column if not exists public_secret_code text unique;

create index if not exists idx_customers_public_secret_code
  on customers(public_secret_code)
  where public_secret_code is not null;

comment on column customers.public_secret_code is
  'Código secreto aleatorio para que el cliente acceda a sus puntos sin login.';

-- Generar códigos para clientes existentes que no tengan
update customers
set public_secret_code = encode(gen_random_bytes(16), 'hex')
where public_secret_code is null;

-- ============================================
-- 4) CUSTOMER_POINTS: caducidad configurable
-- ============================================
-- Nota: la tabla customer_points_movements YA tiene 'expires_at'.
-- Pero necesitamos un setting global para cuántos días caducan por defecto.
insert into system_settings (key, value, description)
values (
  'points_expiration_days',
  '0'::jsonb,
  'Días hasta que caducan los puntos desde que se otorgan. 0 = no caducan por defecto.'
)
on conflict (key) do nothing;

insert into system_settings (key, value, description)
values (
  'points_redemption_code_minutes',
  '15'::jsonb,
  'Minutos de validez de un código de canje generado.'
)
on conflict (key) do nothing;

-- ============================================
-- 5) POINT_REDEMPTION_CODES
-- ============================================
create table if not exists point_redemption_codes (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references customers(id) on delete cascade,
  code text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_in_sale_id uuid references sales(id) on delete set null,
  invalidated_at timestamptz,
  invalidated_by uuid references profiles(id)
);

create index if not exists idx_point_codes_code
  on point_redemption_codes(code)
  where used_at is null and invalidated_at is null;

create index if not exists idx_point_codes_customer
  on point_redemption_codes(customer_id, created_at desc);

comment on table point_redemption_codes is
  'Códigos de un solo uso que el vendedor envía por WhatsApp al cliente para validar un canje de puntos.';

alter table point_redemption_codes enable row level security;

create policy "point_codes_all_admin"
  on point_redemption_codes for all
  using (public.is_admin())
  with check (public.is_admin());

-- Los vendedores pueden generar códigos y validarlos
create policy "point_codes_select_vendor"
  on point_redemption_codes for select
  using (public.is_vendor());

create policy "point_codes_insert_vendor"
  on point_redemption_codes for insert
  with check (public.is_vendor());

create policy "point_codes_update_vendor"
  on point_redemption_codes for update
  using (public.is_vendor())
  with check (public.is_vendor());

-- ============================================
-- 6) RPC: GENERAR CÓDIGO DE CANJE
-- ============================================
create or replace function public.generate_redemption_code(
  p_customer_id uuid
)
returns table (
  code text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minutes integer;
  v_code text;
  v_expires timestamptz;
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  -- Leer configuración (por defecto 15 min)
  select coalesce((value::text)::integer, 15) into v_minutes
  from system_settings
  where key = 'points_redemption_code_minutes';

  if v_minutes is null then v_minutes := 15; end if;

  -- Invalidar códigos activos previos del mismo cliente
  update point_redemption_codes
  set invalidated_at = now(), invalidated_by = v_user_id
  where customer_id = p_customer_id
    and used_at is null
    and invalidated_at is null;

  -- Generar código de 6 dígitos
  v_code := lpad(floor(random() * 1000000)::text, 6, '0');
  v_expires := now() + (v_minutes || ' minutes')::interval;

  insert into point_redemption_codes (
    customer_id, code, created_by, expires_at
  ) values (
    p_customer_id, v_code, v_user_id, v_expires
  );

  return query select v_code, v_expires;
end;
$$;

-- ============================================
-- 7) RPC: VALIDAR CÓDIGO DE CANJE
-- ============================================
create or replace function public.validate_redemption_code(
  p_customer_id uuid,
  p_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found uuid;
begin
  select id into v_found
  from point_redemption_codes
  where customer_id = p_customer_id
    and code = p_code
    and used_at is null
    and invalidated_at is null
    and expires_at > now()
  limit 1;

  return v_found is not null;
end;
$$;

-- ============================================
-- 8) RPC: CANJEAR PUNTOS EN UNA VENTA
-- ============================================
create or replace function public.redeem_points_for_sale(
  p_customer_id uuid,
  p_code text,
  p_points_to_redeem integer,
  p_sale_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_id uuid;
  v_current_points integer;
  v_new_balance integer;
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  if p_points_to_redeem <= 0 then
    raise exception 'La cantidad de puntos debe ser mayor a 0';
  end if;

  -- Validar código
  select id into v_code_id
  from point_redemption_codes
  where customer_id = p_customer_id
    and code = p_code
    and used_at is null
    and invalidated_at is null
    and expires_at > now()
  limit 1;

  if v_code_id is null then
    raise exception 'Código inválido, usado o expirado';
  end if;

  -- Leer saldo actual
  select points into v_current_points
  from customer_points
  where customer_id = p_customer_id
  for update;

  if v_current_points is null then
    raise exception 'El cliente no tiene puntos registrados';
  end if;

  if v_current_points < p_points_to_redeem then
    raise exception 'El cliente no tiene suficientes puntos (disponible: %)', v_current_points;
  end if;

  v_new_balance := v_current_points - p_points_to_redeem;

  -- Descontar puntos
  update customer_points
  set points = v_new_balance, updated_at = now()
  where customer_id = p_customer_id;

  -- Registrar movimiento
  insert into customer_points_movements (
    customer_id, movement_type, points, balance_after,
    reference_type, reference_id, description, created_by
  ) values (
    p_customer_id,
    'canje',
    -p_points_to_redeem,
    v_new_balance,
    'sale',
    p_sale_id,
    'Canje en venta',
    v_user_id
  );

  -- Marcar código como usado
  update point_redemption_codes
  set used_at = now(), used_in_sale_id = p_sale_id
  where id = v_code_id;

  return true;
end;
$$;

-- ============================================
-- 9) RPC: APLICAR CADUCIDAD DE PUNTOS
-- ============================================
create or replace function public.apply_points_expiration()
returns table (
  affected_customers integer,
  total_points_expired integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired_count integer := 0;
  v_expired_sum integer := 0;
  v_rec record;
  v_current integer;
  v_new integer;
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  -- Buscar movimientos de acumulación con expires_at vencido
  -- que aún no hayan sido procesados
  for v_rec in
    select id, customer_id, points, expires_at
    from customer_points_movements
    where movement_type = 'acumulacion'
      and expires_at is not null
      and expires_at < now()
      and not exists (
        select 1 from customer_points_movements m2
        where m2.movement_type = 'expiracion'
          and m2.reference_type = 'movement_expiration'
          and m2.reference_id = customer_points_movements.id
      )
  loop
    -- Puntos a expirar (no pueden ser más que el saldo actual)
    select points into v_current
    from customer_points
    where customer_id = v_rec.customer_id
    for update;

    if v_current is null then
      continue;
    end if;

    v_new := greatest(0, v_current - v_rec.points);

    if v_new <> v_current then
      update customer_points
      set points = v_new, updated_at = now()
      where customer_id = v_rec.customer_id;

      insert into customer_points_movements (
        customer_id, movement_type, points, balance_after,
        reference_type, reference_id, description
      ) values (
        v_rec.customer_id,
        'expiracion',
        -v_rec.points,
        v_new,
        'movement_expiration',
        v_rec.id,
        'Caducidad de puntos'
      );

      v_expired_count := v_expired_count + 1;
      v_expired_sum := v_expired_sum + v_rec.points;
    else
      -- Ya no quedan puntos para expirar; marcamos como procesado
      insert into customer_points_movements (
        customer_id, movement_type, points, balance_after,
        reference_type, reference_id, description
      ) values (
        v_rec.customer_id,
        'expiracion',
        0,
        v_new,
        'movement_expiration',
        v_rec.id,
        'Caducidad sin efecto (saldo ya consumido)'
      );
    end if;
  end loop;

  return query select v_expired_count, v_expired_sum;
end;
$$;

-- ============================================
-- 10) TRIGGER: asignar expires_at automáticamente
--     a movimientos de acumulación si el setting
--     points_expiration_days > 0
-- ============================================
create or replace function public.set_points_expiration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
begin
  if new.movement_type <> 'acumulacion' then
    return new;
  end if;

  if new.expires_at is not null then
    return new;
  end if;

  select coalesce((value::text)::integer, 0) into v_days
  from system_settings
  where key = 'points_expiration_days';

  if v_days is null or v_days <= 0 then
    return new;
  end if;

  new.expires_at := now() + (v_days || ' days')::interval;
  return new;
end;
$$;

drop trigger if exists trg_set_points_expiration on customer_points_movements;
create trigger trg_set_points_expiration
  before insert on customer_points_movements
  for each row
  execute function set_points_expiration();

-- ============================================
-- 11) TRIGGER: generar public_secret_code en nuevos clientes
-- ============================================
create or replace function public.set_customer_secret_code()
returns trigger
language plpgsql
as $$
begin
  if new.public_secret_code is null then
    new.public_secret_code := encode(gen_random_bytes(16), 'hex');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_customer_secret_code on customers;
create trigger trg_set_customer_secret_code
  before insert on customers
  for each row
  execute function set_customer_secret_code();

-- ============================================
-- FIN DE MIGRACIÓN 023
-- ============================================