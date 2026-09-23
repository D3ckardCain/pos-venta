-- ============================================
-- GENERAR NÚMERO DE VENTA
-- ============================================
create or replace function public.generate_sale_number()
returns text
language plpgsql
as $$
declare
  v_count integer;
  v_number text;
begin
  select count(*) + 1 into v_count from sales;
  v_number := 'V-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_count::text, 5, '0');
  return v_number;
end;
$$;

-- ============================================
-- GENERAR NÚMERO DE PEDIDO
-- ============================================
create or replace function public.generate_order_number()
returns text
language plpgsql
as $$
declare
  v_count integer;
  v_number text;
begin
  select count(*) + 1 into v_count from orders;
  v_number := 'P-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_count::text, 5, '0');
  return v_number;
end;
$$;

-- ============================================
-- OBTENER TIPO DE CAMBIO VIGENTE
-- ============================================
create or replace function public.get_current_exchange_rate(
  p_from_currency uuid,
  p_to_currency uuid
)
returns table (rate_id uuid, rate_value numeric)
language sql
stable
as $$
  select er.id, er.rate
  from exchange_rates er
  where er.from_currency_id = p_from_currency
    and er.to_currency_id = p_to_currency
    and er.is_active = true
    and er.valid_from <= now()
    and (er.valid_until is null or er.valid_until > now())
  order by er.valid_from desc
  limit 1;
$$;

-- ============================================
-- CREAR VENTA (transaccional)
-- ============================================
create or replace function public.create_sale(
  p_customer_id uuid,
  p_vendor_id uuid,
  p_currency_id uuid,
  p_items jsonb,
  p_payment_method_id uuid default null,
  p_cash_register_id uuid default null,
  p_discount_amount numeric default 0,
  p_notes text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_sale_number text;
  v_item jsonb;
  v_stock record;
  v_subtotal numeric(18,4) := 0;
  v_total numeric(18,4) := 0;
  v_base_subtotal numeric(18,4) := 0;
  v_base_total numeric(18,4) := 0;
  v_base_cost numeric(18,4) := 0;
  v_exchange_rate numeric(18,8) := 1;
  v_exchange_rate_id uuid;
  v_base_currency_id uuid;
  v_qty numeric(18,4);
  v_unit_price numeric(18,4);
  v_line_total numeric(18,4);
begin
  if p_idempotency_key is not null then
    select id into v_sale_id from sales where idempotency_key = p_idempotency_key;
    if v_sale_id is not null then
      return v_sale_id;
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

  v_sale_number := generate_sale_number();

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;
    v_unit_price := (v_item->>'unit_price')::numeric;
    v_line_total := v_qty * v_unit_price;
    v_subtotal := v_subtotal + v_line_total;

    select stock, cost into v_stock
    from (
      select i.stock, p.cost
      from inventory i
      join products p on p.id = i.product_id
      where i.product_id = (v_item->>'product_id')::uuid
        and (i.variant_id = (v_item->>'variant_id')::uuid or (i.variant_id is null and (v_item->>'variant_id') is null))
      for update
    ) sub;

    if v_stock.stock is null or v_stock.stock < v_qty then
      raise exception 'Stock insuficiente para producto %', (v_item->>'product_name');
    end if;

    v_base_cost := v_base_cost + (v_qty * coalesce(v_stock.cost, 0) * v_exchange_rate);
  end loop;

  v_total := v_subtotal - p_discount_amount;
  v_base_subtotal := v_subtotal * v_exchange_rate;
  v_base_total := v_total * v_exchange_rate;

  insert into sales (
    sale_number, customer_id, vendor_id, status,
    currency_id, exchange_rate_id, exchange_rate_value, base_currency_id,
    subtotal, discount_amount, total,
    base_subtotal, base_discount_amount, base_total,
    base_cost, base_profit,
    payment_method_id, cash_register_id, notes,
    idempotency_key, created_by
  ) values (
    v_sale_number, p_customer_id, p_vendor_id, 'completada',
    p_currency_id, v_exchange_rate_id, v_exchange_rate, v_base_currency_id,
    v_subtotal, p_discount_amount, v_total,
    v_base_subtotal, p_discount_amount * v_exchange_rate, v_base_total,
    v_base_cost, v_base_total - v_base_cost,
    p_payment_method_id, p_cash_register_id, p_notes,
    p_idempotency_key, auth.uid()
  ) returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;
    v_unit_price := (v_item->>'unit_price')::numeric;
    v_line_total := v_qty * v_unit_price;

    insert into sale_items (
      sale_id, product_id, variant_id, product_name,
      quantity, unit_price, unit_cost, discount_amount,
      subtotal, total, base_unit_price, base_total
    ) values (
      v_sale_id,
      (v_item->>'product_id')::uuid,
      nullif(v_item->>'variant_id', '')::uuid,
      v_item->>'product_name',
      v_qty, v_unit_price,
      coalesce((v_item->>'unit_cost')::numeric, 0),
      0,
      v_line_total, v_line_total,
      v_unit_price * v_exchange_rate,
      v_line_total * v_exchange_rate
    );

    update inventory
    set stock = stock - v_qty, updated_at = now()
    where product_id = (v_item->>'product_id')::uuid
      and (variant_id = nullif(v_item->>'variant_id', '')::uuid
           or (variant_id is null and nullif(v_item->>'variant_id', '') is null));

    insert into inventory_movements (
      product_id, variant_id, movement_type, quantity,
      stock_before, stock_after, reference_type, reference_id,
      created_by
    )
    select
      (v_item->>'product_id')::uuid,
      nullif(v_item->>'variant_id', '')::uuid,
      'salida', v_qty,
      stock + v_qty, stock,
      'sale', v_sale_id, auth.uid()
    from inventory
    where product_id = (v_item->>'product_id')::uuid
      and (variant_id = nullif(v_item->>'variant_id', '')::uuid
           or (variant_id is null and nullif(v_item->>'variant_id', '') is null));
  end loop;

  if p_customer_id is not null then
    update customers
    set total_purchases = total_purchases + v_base_total,
        total_orders = total_orders + 1,
        updated_at = now()
    where id = p_customer_id;
  end if;

  if p_vendor_id is not null then
    update vendors
    set total_sales = total_sales + v_base_total,
        updated_at = now()
    where id = p_vendor_id;
  end if;

  return v_sale_id;
end;
$$;

-- ============================================
-- CANCELAR VENTA (transaccional)
-- ============================================
create or replace function public.cancel_sale(
  p_sale_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale record;
  v_item record;
begin
  select * into v_sale from sales where id = p_sale_id for update;

  if v_sale is null then
    raise exception 'Venta no encontrada';
  end if;

  if v_sale.status = 'cancelada' then
    raise exception 'La venta ya está cancelada';
  end if;

  for v_item in select * from sale_items where sale_id = p_sale_id
  loop
    update inventory
    set stock = stock + v_item.quantity, updated_at = now()
    where product_id = v_item.product_id
      and (variant_id = v_item.variant_id
           or (variant_id is null and v_item.variant_id is null));

    insert into inventory_movements (
      product_id, variant_id, movement_type, quantity,
      stock_before, stock_after, reference_type, reference_id,
      reason, created_by
    )
    select
      v_item.product_id, v_item.variant_id, 'cancelacion', v_item.quantity,
      stock - v_item.quantity, stock,
      'sale_cancellation', p_sale_id, p_reason, auth.uid()
    from inventory
    where product_id = v_item.product_id
      and (variant_id = v_item.variant_id
           or (variant_id is null and v_item.variant_id is null));
  end loop;

  update sales
  set status = 'cancelada',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancellation_reason = p_reason,
      updated_at = now()
  where id = p_sale_id;

  if v_sale.customer_id is not null then
    update customers
    set total_purchases = total_purchases - v_sale.base_total,
        total_orders = greatest(total_orders - 1, 0),
        updated_at = now()
    where id = v_sale.customer_id;
  end if;

  if v_sale.vendor_id is not null then
    update vendors
    set total_sales = total_sales - v_sale.base_total,
        updated_at = now()
    where id = v_sale.vendor_id;
  end if;

  return true;
end;
$$;

-- ============================================
-- AJUSTAR INVENTARIO (transaccional)
-- ============================================
create or replace function public.adjust_inventory(
  p_product_id uuid,
  p_variant_id uuid,
  p_new_stock numeric,
  p_reason text,
  p_idempotency_key text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_stock numeric(18,4);
  v_diff numeric(18,4);
begin
  if p_idempotency_key is not null then
    if exists (select 1 from inventory_movements where idempotency_key = p_idempotency_key) then
      return true;
    end if;
  end if;

  select stock into v_current_stock
  from inventory
  where product_id = p_product_id
    and (variant_id = p_variant_id or (variant_id is null and p_variant_id is null))
  for update;

  if v_current_stock is null then
    insert into inventory (product_id, variant_id, stock)
    values (p_product_id, p_variant_id, p_new_stock);
    v_current_stock := 0;
  end if;

  v_diff := p_new_stock - v_current_stock;

  update inventory
  set stock = p_new_stock, updated_at = now()
  where product_id = p_product_id
    and (variant_id = p_variant_id or (variant_id is null and p_variant_id is null));

  insert into inventory_movements (
    product_id, variant_id, movement_type, quantity,
    stock_before, stock_after, reason, idempotency_key, created_by
  ) values (
    p_product_id, p_variant_id, 'ajuste', v_diff,
    v_current_stock, p_new_stock, p_reason, p_idempotency_key, auth.uid()
  );

  return true;
end;
$$;

-- ============================================
-- REGISTRAR CAMBIO DE TIPO DE CAMBIO
-- ============================================
create or replace function public.record_exchange_rate_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.rate <> new.rate then
    insert into exchange_rate_history (
      exchange_rate_id, from_currency_id, to_currency_id,
      old_rate, new_rate, changed_by, reason
    ) values (
      new.id, new.from_currency_id, new.to_currency_id,
      old.rate, new.rate, auth.uid(), 'Cambio manual'
    );
  end if;
  return new;
end;
$$;