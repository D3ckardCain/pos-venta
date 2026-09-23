-- ============================================
-- VENTAS
-- ============================================
create table sales (
  id uuid primary key default uuid_generate_v4(),
  sale_number text not null unique,
  customer_id uuid references customers(id) on delete set null,
  vendor_id uuid references vendors(id) on delete set null,
  status sale_status not null default 'completada',
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
  base_cost numeric(18,4) not null default 0,
  base_profit numeric(18,4) not null default 0,
  payment_method_id uuid,
  cash_register_id uuid,
  notes text,
  idempotency_key text unique,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references profiles(id),
  cancellation_reason text
);

create index idx_sales_customer on sales(customer_id);
create index idx_sales_vendor on sales(vendor_id);
create index idx_sales_status on sales(status);
create index idx_sales_date on sales(created_at desc);
create index idx_sales_currency on sales(currency_id);

-- ============================================
-- DETALLE DE VENTAS
-- ============================================
create table sale_items (
  id uuid primary key default uuid_generate_v4(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid not null references products(id),
  variant_id uuid references product_variants(id),
  product_name text not null,
  quantity numeric(18,4) not null check (quantity > 0),
  unit_price numeric(18,4) not null,
  unit_cost numeric(18,4) not null default 0,
  discount_amount numeric(18,4) not null default 0,
  subtotal numeric(18,4) not null,
  total numeric(18,4) not null,
  base_unit_price numeric(18,4) not null,
  base_total numeric(18,4) not null,
  created_at timestamptz not null default now()
);

create index idx_sale_items_sale on sale_items(sale_id);
create index idx_sale_items_product on sale_items(product_id);