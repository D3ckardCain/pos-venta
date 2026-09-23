-- ============================================
-- CREAR PEDIDO (transaccional con reserva)
-- ============================================
create or replace function public.create_order(
  p_customer_id uuid,
  p_vendor_id uuid,
  p_currency_id uuid,
  p_items jsonb,
  p_discount_amount numeric default 0,
  p_delivery_address text default null,
  p_delivery_notes text default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_subtotal numeric(18,4) := 0;
  v_total numeric(18,4) := 0;
  v_base_subtotal numeric(18,4) := 0;
  v_base_total numeric(18,4) := 0;
  v_exchange_rate numeric(18,8) := 1;
  v_exchange_rate_id uuid;
  v_base_currency_id uuid;
  v_qty numeric(18,4);
  v_unit_price numeric(18,4);
  v_line_total numeric(18,4);
  v_available numeric(18,4);
  v_count integer;
begin
  if p_idempotency_key is not null then
    select id into v_order_id from orders where idempotency_key = p_idempotency_key;
    if v_order_id is not null then
      return v_order_id;
    end if;
  end if;

  select primary_currency_id into v_base_currency_id
  from currency_settings where is_singleton = true;

  if p_currency_id = v_base_currency_id then
    v_exchange_rate := 1;
  else
    select rate_id, rate_value into v_exchange_rate_id, v_exchange_rate
    from get_current_exchange_rate(p_currency_id, v_base_currency_id);
    if v_exchange_rate is null then
      raise exception 'No hay tipo de cambio configurado para esta moneda';
    end if;
  end if;

  select count(*) + 1 into v_count from orders;
  v_order_number := 'P-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_count::text, 5, '0');

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;
    v_unit_price := (v_item->>'unit_price')::numeric;
    v_line_total := v_qty * v_unit_price;
    v_subtotal := v_subtotal + v_line_total;

    select available into v_available
    from inventory
    where product_id = (v_item->>'product_id')::uuid
      and (variant_id = nullif(v_item->>'variant_id', '')::uuid
           or (variant_id is null and nullif(v_item->>'variant_id', '') is null))
    for update;

    if v_available is null then
      raise exception 'Producto % sin inventario configurado', (v_item->>'product_name');
    end if;

    if v_available < v_qty then
      raise exception 'Stock insuficiente para % (disponible: %)', (v_item->>'product_name'), v_available;
    end if;
  end loop;

  v_total := v_subtotal - p_discount_amount;
  v_base_subtotal := v_subtotal * v_exchange_rate;
  v_base_total := v_total * v_exchange_rate;

  insert into orders (
    order_number, customer_id, vendor_id, status,
    currency_id, exchange_rate_id, exchange_rate_value, base_currency_id,
    subtotal, discount_amount, total,
    base_subtotal, base_discount_amount, base_total,
    delivery_address, delivery_notes, notes,
    idempotency_key, created_by
  ) values (
    v_order_number, p_customer_id, p_vendor_id, 'pendiente',
    p_currency_id, v_exchange_rate_id, v_exchange_rate, v_base_currency_id,
    v_subtotal, p_discount_amount, v_total,
    v_base_subtotal, p_discount_amount * v_exchange_rate, v_base_total,
    p_delivery_address, p_delivery_notes, p_notes,
    p_idempotency_key, auth.uid()
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;
    v_unit_price := (v_item->>'unit_price')::numeric;
    v_line_total := v_qty * v_unit_price;

    insert into order_items (
      order_id, product_id, variant_id, product_name,
      quantity, unit_price, discount_amount,
      subtotal, total, base_unit_price, base_total
    ) values (
      v_order_id,
      (v_item->>'product_id')::uuid,
      nullif(v_item->>'variant_id', '')::uuid,
      v_item->>'product_name',
      v_qty, v_unit_price, 0,
      v_line_total, v_line_total,
      v_unit_price * v_exchange_rate,
      v_line_total * v_exchange_rate
    );

    insert into inventory_reservations (
      product_id, variant_id, quantity,
      reference_type, reference_id, status, created_by
    ) values (
      (v_item->>'product_id')::uuid,
      nullif(v_item->>'variant_id', '')::uuid,
      v_qty, 'order', v_order_id, 'activa', auth.uid()
    );

    update inventory
    set reserved = reserved + v_qty, updated_at = now()
    where product_id = (v_item->>'product_id')::uuid
      and (variant_id = nullif(v_item->>'variant_id', '')::uuid
           or (variant_id is null and nullif(v_item->>'variant_id', '') is null));

    insert into inventory_movements (
      product_id, variant_id, movement_type, quantity,
      stock_before, stock_after, reference_type, reference_id,
      reason, created_by
    )
    select
      (v_item->>'product_id')::uuid,
      nullif(v_item->>'variant_id', '')::uuid,
      'reserva', v_qty,
      stock, stock,
      'order', v_order_id,
      'Reserva por pedido', auth.uid()
    from inventory
    where product_id = (v_item->>'product_id')::uuid
      and (variant_id = nullif(v_item->>'variant_id', '')::uuid
           or (variant_id is null and nullif(v_item->>'variant_id', '') is null));
  end loop;

  insert into order_status_history (
    order_id, old_status, new_status, changed_by, notes
  ) values (
    v_order_id, null, 'pendiente', auth.uid(), 'Pedido creado'
  );

  return v_order_id;
end;
$$;