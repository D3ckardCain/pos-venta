-- ============================================
-- TRIGGER: updated_at automático
-- ============================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_roles_updated before update on roles
  for each row execute function set_updated_at();

create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

create trigger trg_currencies_updated before update on currencies
  for each row execute function set_updated_at();

create trigger trg_currency_settings_updated before update on currency_settings
  for each row execute function set_updated_at();

create trigger trg_exchange_rates_updated before update on exchange_rates
  for each row execute function set_updated_at();

create trigger trg_prices_by_currency_updated before update on prices_by_currency
  for each row execute function set_updated_at();

create trigger trg_categories_updated before update on categories
  for each row execute function set_updated_at();

create trigger trg_products_updated before update on products
  for each row execute function set_updated_at();

create trigger trg_product_variants_updated before update on product_variants
  for each row execute function set_updated_at();

create trigger trg_customers_updated before update on customers
  for each row execute function set_updated_at();

create trigger trg_vendors_updated before update on vendors
  for each row execute function set_updated_at();

create trigger trg_sales_updated before update on sales
  for each row execute function set_updated_at();

create trigger trg_orders_updated before update on orders
  for each row execute function set_updated_at();

create trigger trg_inventory_reservations_updated before update on inventory_reservations
  for each row execute function set_updated_at();

create trigger trg_promotions_updated before update on promotions
  for each row execute function set_updated_at();

create trigger trg_customer_points_updated before update on customer_points
  for each row execute function set_updated_at();

-- ============================================
-- TRIGGER: historial de tipos de cambio
-- ============================================
create trigger trg_exchange_rate_history
  after update on exchange_rates
  for each row execute function record_exchange_rate_change();

-- ============================================
-- TRIGGER: crear perfil al registrar usuario
-- ============================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
  v_role_name text;
begin
  v_role_name := coalesce(new.raw_user_meta_data->>'role', 'cliente');
  select id into v_role_id from roles where name = v_role_name;
  if v_role_id is null then
    select id into v_role_id from roles where name = 'cliente';
  end if;

  insert into profiles (id, email, full_name, role_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_role_id
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================
-- TRIGGER: auditoría automática
-- ============================================
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_logs (user_id, action, table_name, record_id, new_data)
    values (auth.uid(), 'INSERT', tg_table_name, new.id, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into audit_logs (user_id, action, table_name, record_id, old_data, new_data)
    values (auth.uid(), 'UPDATE', tg_table_name, new.id, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into audit_logs (user_id, action, table_name, record_id, old_data)
    values (auth.uid(), 'DELETE', tg_table_name, old.id, to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

create trigger trg_audit_products
  after insert or update or delete on products
  for each row execute function audit_trigger();

create trigger trg_audit_categories
  after insert or update or delete on categories
  for each row execute function audit_trigger();

create trigger trg_audit_sales
  after insert or update or delete on sales
  for each row execute function audit_trigger();

create trigger trg_audit_orders
  after insert or update or delete on orders
  for each row execute function audit_trigger();

create trigger trg_audit_currencies
  after insert or update or delete on currencies
  for each row execute function audit_trigger();

create trigger trg_audit_exchange_rates
  after insert or update or delete on exchange_rates
  for each row execute function audit_trigger();

create trigger trg_audit_customers
  after insert or update or delete on customers
  for each row execute function audit_trigger();