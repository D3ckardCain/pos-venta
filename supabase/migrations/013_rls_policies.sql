-- ============================================
-- HABILITAR RLS EN TODAS LAS TABLAS
-- ============================================
alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table profiles enable row level security;
alter table currencies enable row level security;
alter table currency_settings enable row level security;
alter table exchange_rates enable row level security;
alter table exchange_rate_history enable row level security;
alter table prices_by_currency enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table product_images enable row level security;
alter table product_variants enable row level security;
alter table inventory enable row level security;
alter table inventory_movements enable row level security;
alter table inventory_reservations enable row level security;
alter table customers enable row level security;
alter table vendors enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_status_history enable row level security;
alter table payment_methods enable row level security;
alter table cash_registers enable row level security;
alter table cash_sessions enable row level security;
alter table cash_movements enable row level security;
alter table promotions enable row level security;
alter table promotion_products enable row level security;
alter table promotion_categories enable row level security;
alter table customer_points enable row level security;
alter table customer_points_movements enable row level security;
alter table audit_logs enable row level security;
alter table system_settings enable row level security;
alter table notifications enable row level security;

-- ============================================
-- FUNCIONES AUXILIARES DE ROL
-- ============================================
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.name
  from profiles p
  join roles r on r.id = p.role_id
  where p.id = auth.uid() and p.is_active = true
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'admin';
$$;

create or replace function public.is_vendor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'vendedor';
$$;

create or replace function public.is_customer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'cliente';
$$;

-- ============================================
-- POLÍTICAS: ROLES Y PERMISOS
-- ============================================
create policy "roles_select_admin" on roles
  for select using (public.is_admin());

create policy "permissions_select_admin" on permissions
  for select using (public.is_admin());

create policy "role_permissions_select_admin" on role_permissions
  for select using (public.is_admin());

-- ============================================
-- POLÍTICAS: PROFILES
-- ============================================
create policy "profiles_select_self_or_admin" on profiles
  for select using (id = auth.uid() or public.is_admin());

create policy "profiles_insert_admin" on profiles
  for insert with check (public.is_admin());

create policy "profiles_update_self_or_admin" on profiles
  for update using (id = auth.uid() or public.is_admin());

-- ============================================
-- POLÍTICAS: MONEDAS
-- ============================================
create policy "currencies_select_auth" on currencies
  for select using (auth.uid() is not null);

create policy "currencies_select_public_active" on currencies
  for select using (is_active = true);

create policy "currencies_all_admin" on currencies
  for all using (public.is_admin()) with check (public.is_admin());

create policy "currency_settings_select_auth" on currency_settings
  for select using (auth.uid() is not null);

create policy "currency_settings_all_admin" on currency_settings
  for all using (public.is_admin()) with check (public.is_admin());

create policy "exchange_rates_select_auth" on exchange_rates
  for select using (auth.uid() is not null);

create policy "exchange_rates_all_admin" on exchange_rates
  for all using (public.is_admin()) with check (public.is_admin());

create policy "exchange_rate_history_select_admin" on exchange_rate_history
  for select using (public.is_admin());

create policy "prices_by_currency_select_auth" on prices_by_currency
  for select using (auth.uid() is not null);

create policy "prices_by_currency_all_admin" on prices_by_currency
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================
-- POLÍTICAS: CATÁLOGO
-- ============================================
create policy "categories_select_active_public" on categories
  for select using (is_active = true);

create policy "categories_select_all_auth" on categories
  for select using (auth.uid() is not null);

create policy "categories_all_admin" on categories
  for all using (public.is_admin()) with check (public.is_admin());

create policy "products_select_active_public" on products
  for select using (is_active = true);

create policy "products_select_all_auth" on products
  for select using (auth.uid() is not null);

create policy "products_all_admin" on products
  for all using (public.is_admin()) with check (public.is_admin());

create policy "product_images_select_public" on product_images
  for select using (true);

create policy "product_images_all_admin" on product_images
  for all using (public.is_admin()) with check (public.is_admin());

create policy "product_variants_select_auth" on product_variants
  for select using (auth.uid() is not null);

create policy "product_variants_all_admin" on product_variants
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================
-- POLÍTICAS: INVENTARIO
-- ============================================
create policy "inventory_select_admin_vendor" on inventory
  for select using (public.is_admin() or public.is_vendor());

create policy "inventory_all_admin" on inventory
  for all using (public.is_admin()) with check (public.is_admin());

create policy "inventory_movements_select_admin_vendor" on inventory_movements
  for select using (public.is_admin() or public.is_vendor());

create policy "inventory_movements_insert_admin_vendor" on inventory_movements
  for insert with check (public.is_admin() or public.is_vendor());

create policy "inventory_reservations_select_admin_vendor" on inventory_reservations
  for select using (public.is_admin() or public.is_vendor());

-- ============================================
-- POLÍTICAS: CLIENTES Y VENDEDORES
-- ============================================
create policy "customers_select_admin_vendor" on customers
  for select using (public.is_admin() or public.is_vendor());

create policy "customers_select_self" on customers
  for select using (profile_id = auth.uid());

create policy "customers_insert_admin_vendor" on customers
  for insert with check (public.is_admin() or public.is_vendor());

create policy "customers_update_admin_vendor" on customers
  for update using (public.is_admin() or public.is_vendor());

create policy "customers_all_admin" on customers
  for all using (public.is_admin()) with check (public.is_admin());

create policy "vendors_select_admin" on vendors
  for select using (public.is_admin());

create policy "vendors_select_self" on vendors
  for select using (profile_id = auth.uid());

create policy "vendors_all_admin" on vendors
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================
-- POLÍTICAS: VENTAS
-- ============================================
create policy "sales_select_admin" on sales
  for select using (public.is_admin());

create policy "sales_select_vendor_own" on sales
  for select using (
    public.is_vendor() and vendor_id in (
      select id from vendors where profile_id = auth.uid()
    )
  );

create policy "sales_insert_admin_vendor" on sales
  for insert with check (public.is_admin() or public.is_vendor());

create policy "sales_update_admin" on sales
  for update using (public.is_admin());

create policy "sale_items_select_admin_vendor" on sale_items
  for select using (
    public.is_admin() or (
      public.is_vendor() and sale_id in (
        select s.id from sales s
        join vendors v on v.id = s.vendor_id
        where v.profile_id = auth.uid()
      )
    )
  );

create policy "sale_items_insert_admin_vendor" on sale_items
  for insert with check (public.is_admin() or public.is_vendor());

-- ============================================
-- POLÍTICAS: PEDIDOS
-- ============================================
create policy "orders_select_admin" on orders
  for select using (public.is_admin());

create policy "orders_select_vendor_own" on orders
  for select using (
    public.is_vendor() and vendor_id in (
      select id from vendors where profile_id = auth.uid()
    )
  );

create policy "orders_select_customer_own" on orders
  for select using (
    public.is_customer() and customer_id in (
      select id from customers where profile_id = auth.uid()
    )
  );

create policy "orders_insert_admin_vendor_customer" on orders
  for insert with check (
    public.is_admin() or public.is_vendor() or public.is_customer()
  );

create policy "orders_update_admin_vendor" on orders
  for update using (public.is_admin() or public.is_vendor());

create policy "order_items_select_admin_vendor_customer" on order_items
  for select using (
    public.is_admin() or public.is_vendor() or (
      public.is_customer() and order_id in (
        select o.id from orders o
        join customers c on c.id = o.customer_id
        where c.profile_id = auth.uid()
      )
    )
  );

create policy "order_items_insert_admin_vendor_customer" on order_items
  for insert with check (
    public.is_admin() or public.is_vendor() or public.is_customer()
  );

-- ============================================
-- POLÍTICAS: CAJAS Y PAGOS
-- ============================================
create policy "payment_methods_select_auth" on payment_methods
  for select using (auth.uid() is not null);

create policy "payment_methods_all_admin" on payment_methods
  for all using (public.is_admin()) with check (public.is_admin());

create policy "cash_registers_select_admin_vendor" on cash_registers
  for select using (public.is_admin() or public.is_vendor());

create policy "cash_registers_all_admin" on cash_registers
  for all using (public.is_admin()) with check (public.is_admin());

create policy "cash_sessions_select_admin_vendor" on cash_sessions
  for select using (public.is_admin() or public.is_vendor());

create policy "cash_sessions_all_admin_vendor" on cash_sessions
  for all using (public.is_admin() or public.is_vendor())
  with check (public.is_admin() or public.is_vendor());

create policy "cash_movements_select_admin_vendor" on cash_movements
  for select using (public.is_admin() or public.is_vendor());

create policy "cash_movements_insert_admin_vendor" on cash_movements
  for insert with check (public.is_admin() or public.is_vendor());

-- ============================================
-- POLÍTICAS: PROMOCIONES Y PUNTOS
-- ============================================
create policy "promotions_select_active_auth" on promotions
  for select using (is_active = true);

create policy "promotions_all_admin" on promotions
  for all using (public.is_admin()) with check (public.is_admin());

create policy "promotion_products_select_auth" on promotion_products
  for select using (auth.uid() is not null);

create policy "promotion_products_all_admin" on promotion_products
  for all using (public.is_admin()) with check (public.is_admin());

create policy "promotion_categories_select_auth" on promotion_categories
  for select using (auth.uid() is not null);

create policy "promotion_categories_all_admin" on promotion_categories
  for all using (public.is_admin()) with check (public.is_admin());

create policy "customer_points_select_admin" on customer_points
  for select using (public.is_admin());

create policy "customer_points_select_self" on customer_points
  for select using (
    customer_id in (select id from customers where profile_id = auth.uid())
  );

create policy "customer_points_all_admin" on customer_points
  for all using (public.is_admin()) with check (public.is_admin());

create policy "customer_points_movements_select_admin" on customer_points_movements
  for select using (public.is_admin());

create policy "customer_points_movements_select_self" on customer_points_movements
  for select using (
    customer_id in (select id from customers where profile_id = auth.uid())
  );

create policy "customer_points_movements_all_admin" on customer_points_movements
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================
-- POLÍTICAS: AUDITORÍA Y CONFIGURACIÓN
-- ============================================
create policy "audit_logs_select_admin" on audit_logs
  for select using (public.is_admin());

create policy "audit_logs_insert_system" on audit_logs
  for insert with check (true);

create policy "system_settings_select_admin" on system_settings
  for select using (public.is_admin());

create policy "system_settings_all_admin" on system_settings
  for all using (public.is_admin()) with check (public.is_admin());

create policy "notifications_select_self" on notifications
  for select using (user_id = auth.uid());

create policy "notifications_update_self" on notifications
  for update using (user_id = auth.uid());

create policy "notifications_insert_admin" on notifications
  for insert with check (public.is_admin());