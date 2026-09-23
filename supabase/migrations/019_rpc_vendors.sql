-- ============================================
-- CREAR VENDEDOR (auth user + profile + vendor)
-- ============================================
create or replace function public.admin_create_vendor(
  p_email text,
  p_password text,
  p_full_name text,
  p_phone text default null,
  p_code text default null,
  p_commission_rate numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_vendor_id uuid;
  v_role_id uuid;
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  select id into v_role_id from roles where name = 'vendedor';
  if v_role_id is null then
    raise exception 'Rol vendedor no existe';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('role', 'vendedor', 'full_name', p_full_name),
    now(),
    now()
  ) returning id into v_user_id;

  update profiles
  set full_name = p_full_name,
      phone = p_phone,
      role_id = v_role_id,
      is_active = true
  where id = v_user_id;

  insert into vendors (
    profile_id, code, commission_rate, is_active
  ) values (
    v_user_id, p_code, p_commission_rate, true
  ) returning id into v_vendor_id;

  return v_vendor_id;
end;
$$;

-- ============================================
-- AJUSTAR PUNTOS DE CLIENTE
-- ============================================
create or replace function public.adjust_customer_points(
  p_customer_id uuid,
  p_points integer,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
  v_lifetime integer;
  v_new integer;
begin
  if not (public.is_admin() or public.is_vendor()) then
    raise exception 'No autorizado';
  end if;

  select points, lifetime_points into v_current, v_lifetime
  from customer_points
  where customer_id = p_customer_id
  for update;

  if v_current is null then
    insert into customer_points (customer_id, points, lifetime_points)
    values (p_customer_id, 0, 0);
    v_current := 0;
    v_lifetime := 0;
  end if;

  v_new := v_current + p_points;
  if v_new < 0 then
    raise exception 'Puntos insuficientes (actual: %, solicitado: %)', v_current, p_points;
  end if;

  update customer_points
  set points = v_new,
      lifetime_points = case when p_points > 0 then v_lifetime + p_points else v_lifetime end,
      updated_at = now()
  where customer_id = p_customer_id;

  insert into customer_points_movements (
    customer_id, movement_type, points, balance_after,
    description, created_by
  ) values (
    p_customer_id,
    case when p_points >= 0 then 'acumulacion'::points_movement_type else 'canje'::points_movement_type end,
    p_points,
    v_new,
    p_reason,
    auth.uid()
  );

  return true;
end;
$$;