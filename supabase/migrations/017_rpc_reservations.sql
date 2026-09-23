-- ============================================
-- LIBERAR RESERVA DE INVENTARIO
-- ============================================
create or replace function public.release_inventory_reservation(
  p_reservation_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res inventory_reservations%rowtype;
begin
  select * into v_res
  from inventory_reservations
  where id = p_reservation_id
  for update;

  if v_res is null then
    raise exception 'Reserva no encontrada';
  end if;

  if v_res.status <> 'activa' then
    raise exception 'La reserva no está activa';
  end if;

  update inventory_reservations
  set status = 'liberada', updated_at = now()
  where id = p_reservation_id;

  update inventory
  set reserved = greatest(0, reserved - v_res.quantity),
      updated_at = now()
  where product_id = v_res.product_id
    and (variant_id = v_res.variant_id
         or (variant_id is null and v_res.variant_id is null));

  insert into inventory_movements (
    product_id, variant_id, movement_type, quantity,
    stock_before, stock_after, reference_type, reference_id,
    reason, created_by
  )
  select
    v_res.product_id, v_res.variant_id, 'liberacion_reserva', v_res.quantity,
    stock, stock,
    'reservation', p_reservation_id,
    p_reason, auth.uid()
  from inventory
  where product_id = v_res.product_id
    and (variant_id = v_res.variant_id
         or (variant_id is null and v_res.variant_id is null));

  return true;
end;
$$;

-- ============================================
-- CREAR RESERVA DE INVENTARIO
-- ============================================
create or replace function public.create_inventory_reservation(
  p_product_id uuid,
  p_variant_id uuid,
  p_quantity numeric,
  p_reference_type text,
  p_reference_id uuid,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation_id uuid;
  v_available numeric;
begin
  if p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a 0';
  end if;

  select available into v_available
  from inventory
  where product_id = p_product_id
    and (variant_id = p_variant_id or (variant_id is null and p_variant_id is null))
  for update;

  if v_available is null then
    raise exception 'Producto sin inventario configurado';
  end if;

  if v_available < p_quantity then
    raise exception 'Stock disponible insuficiente (disponible: %)', v_available;
  end if;

  insert into inventory_reservations (
    product_id, variant_id, quantity,
    reference_type, reference_id,
    status, expires_at, created_by
  ) values (
    p_product_id, p_variant_id, p_quantity,
    p_reference_type, p_reference_id,
    'activa', p_expires_at, auth.uid()
  ) returning id into v_reservation_id;

  update inventory
  set reserved = reserved + p_quantity,
      updated_at = now()
  where product_id = p_product_id
    and (variant_id = p_variant_id or (variant_id is null and p_variant_id is null));

  insert into inventory_movements (
    product_id, variant_id, movement_type, quantity,
    stock_before, stock_after, reference_type, reference_id,
    reason, created_by
  )
  select
    p_product_id, p_variant_id, 'reserva', p_quantity,
    stock, stock,
    p_reference_type, p_reference_id,
    'Reserva creada', auth.uid()
  from inventory
  where product_id = p_product_id
    and (variant_id = p_variant_id or (variant_id is null and p_variant_id is null));

  return v_reservation_id;
end;
$$;

-- ============================================
-- CONFIRMAR RESERVA (convierte en salida)
-- ============================================
create or replace function public.confirm_inventory_reservation(
  p_reservation_id uuid,
  p_reason text default 'Reserva confirmada'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res inventory_reservations%rowtype;
  v_stock numeric;
begin
  select * into v_res
  from inventory_reservations
  where id = p_reservation_id
  for update;

  if v_res is null then
    raise exception 'Reserva no encontrada';
  end if;

  if v_res.status <> 'activa' then
    raise exception 'La reserva no está activa';
  end if;

  select stock into v_stock
  from inventory
  where product_id = v_res.product_id
    and (variant_id = v_res.variant_id or (variant_id is null and v_res.variant_id is null))
  for update;

  if v_stock is null or v_stock < v_res.quantity then
    raise exception 'Stock insuficiente para confirmar reserva';
  end if;

  update inventory_reservations
  set status = 'confirmada', updated_at = now()
  where id = p_reservation_id;

  update inventory
  set stock = stock - v_res.quantity,
      reserved = greatest(0, reserved - v_res.quantity),
      updated_at = now()
  where product_id = v_res.product_id
    and (variant_id = v_res.variant_id or (variant_id is null and v_res.variant_id is null));

  insert into inventory_movements (
    product_id, variant_id, movement_type, quantity,
    stock_before, stock_after, reference_type, reference_id,
    reason, created_by
  )
  select
    v_res.product_id, v_res.variant_id, 'salida', v_res.quantity,
    stock + v_res.quantity, stock,
    v_res.reference_type, v_res.reference_id,
    p_reason, auth.uid()
  from inventory
  where product_id = v_res.product_id
    and (variant_id = v_res.variant_id or (variant_id is null and v_res.variant_id is null));

  return true;
end;
$$;