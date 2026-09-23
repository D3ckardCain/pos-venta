-- ============================================
-- PEDIDOS
-- ============================================
create table orders (
  id uuid primary key default uuid_generate_v4(),
  order_number text not null unique,
  customer_id uuid references customers(id) on delete set null,
  vendor_id uuid references vendors(id) on delete set null,
  status order_status not null default 'pendiente',
  currency_id uuid not null references currencies(id),
  exchange_rate_id uuid references exchange_rates(id),
  exchange_rate_value numeric(18,8) not null default 1,
  base_currency_id uuid not null references currencies(id),
  subtotal numeric(18,4) not null default 0,
  tax_amount numeric(18,4) not null default 0,
  discount_amount numeric(18,4) not null default 0,
  total numeric(18,4) not null default 0,
  base_subtotal numeric(18,4) not null default 0,
  base_tax_amount numeric(18,4) not null default 0,
  base_discount_amount numeric(18,4) not null default 0,
  base_total numeric(18,4) not null default 0,
  delivery_address text,
  delivery_notes text,
  notes text,
  idempotency_key text unique,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz
);

create index idx_orders_customer on orders(customer_id);
create index idx_orders_status on orders(status);
create index idx_orders_date on orders(created_at desc);

-- ============================================
-- DETALLE DE PEDIDOS
-- ============================================
create table order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  variant_id uuid references product_variants(id),
  product_name text not null,
  quantity numeric(18,4) not null check (quantity > 0),
  unit_price numeric(18,4) not null,
  discount_amount numeric(18,4) not null default 0,
  subtotal numeric(18,4) not null,
  total numeric(18,4) not null,
  base_unit_price numeric(18,4) not null,
  base_total numeric(18,4) not null,
  created_at timestamptz not null default now()
);

create index idx_order_items_order on order_items(order_id);

-- ============================================
-- HISTORIAL DE ESTADOS DE PEDIDOS
-- ============================================
create table order_status_history (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  old_status order_status,
  new_status order_status not null,
  changed_by uuid references profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_order_status_history_order on order_status_history(order_id);