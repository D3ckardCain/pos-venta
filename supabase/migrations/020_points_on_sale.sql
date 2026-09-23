-- ============================================
-- OTORGAR PUNTOS AUTOMÁTICAMENTE AL COMPLETAR VENTA
-- ============================================
create or replace function public.award_points_on_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points_per_unit numeric;
  v_points_to_award integer;
  v_current_points integer;
  v_current_lifetime integer;
  v_new_balance integer;
begin
  if new.customer_id is null then
    return new;
  end if;

  if new.status <> 'completada' then
    return new;
  end if;

  select (value::text)::numeric into v_points_per_unit
  from system_settings
  where key = 'points_per_currency_unit';

  if v_points_per_unit is null or v_points_per_unit <= 0 then
    return new;
  end if;

  v_points_to_award := floor(new.base_total * v_points_per_unit)::integer;

  if v_points_to_award <= 0 then
    return new;
  end if;

  select points, lifetime_points into v_current_points, v_current_lifetime
  from customer_points
  where customer_id = new.customer_id
  for update;

  if v_current_points is null then
    insert into customer_points (customer_id, points, lifetime_points)
    values (new.customer_id, 0, 0);
    v_current_points := 0;
    v_current_lifetime := 0;
  end if;

  v_new_balance := v_current_points + v_points_to_award;

  update customer_points
  set points = v_new_balance,
      lifetime_points = v_current_lifetime + v_points_to_award,
      updated_at = now()
  where customer_id = new.customer_id;

  insert into customer_points_movements (
    customer_id, movement_type, points, balance_after,
    reference_type, reference_id, description, created_by
  ) values (
    new.customer_id,
    'acumulacion',
    v_points_to_award,
    v_new_balance,
    'sale',
    new.id,
    'Puntos por venta ' || new.sale_number,
    new.created_by
  );

  return new;
end;
$$;

drop trigger if exists trg_award_points_on_sale on sales;
create trigger trg_award_points_on_sale
  after insert on sales
  for each row
  when (new.status = 'completada' and new.customer_id is not null)
  execute function award_points_on_sale();