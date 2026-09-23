-- ============================================
-- MONEDAS
-- ============================================
create table currencies (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null,
  symbol text not null,
  decimals smallint not null default 2 check (decimals between 0 and 6),
  decimal_separator text not null default '.',
  thousand_separator text not null default ',',
  symbol_position text not null default 'before' check (symbol_position in ('before', 'after')),
  is_active boolean not null default true,
  usable_in_sales boolean not null default true,
  usable_in_purchases boolean not null default true,
  usable_in_cash boolean not null default true,
  usable_in_catalog boolean not null default true,
  usable_by_customers boolean not null default true,
  usable_by_vendors boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- CONFIGURACIÓN DE MONEDAS (singleton)
-- ============================================
create table currency_settings (
  id uuid primary key default uuid_generate_v4(),
  primary_currency_id uuid not null references currencies(id),
  is_singleton boolean not null default true unique check (is_singleton = true),
  auto_convert_catalog boolean not null default true,
  show_currency_selector boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- TIPOS DE CAMBIO
-- ============================================
create table exchange_rates (
  id uuid primary key default uuid_generate_v4(),
  from_currency_id uuid not null references currencies(id),
  to_currency_id uuid not null references currencies(id),
  rate numeric(18,8) not null check (rate > 0),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  is_active boolean not null default true,
  source text,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_currency_id <> to_currency_id)
);

create index idx_exchange_rates_pair on exchange_rates(from_currency_id, to_currency_id, valid_from desc);
create index idx_exchange_rates_active on exchange_rates(is_active) where is_active = true;

-- ============================================
-- HISTORIAL DE TIPOS DE CAMBIO (inmutable)
-- ============================================
create table exchange_rate_history (
  id uuid primary key default uuid_generate_v4(),
  exchange_rate_id uuid references exchange_rates(id),
  from_currency_id uuid not null references currencies(id),
  to_currency_id uuid not null references currencies(id),
  old_rate numeric(18,8),
  new_rate numeric(18,8) not null,
  changed_by uuid references profiles(id),
  reason text,
  changed_at timestamptz not null default now()
);

-- ============================================
-- PRECIOS POR MONEDA (override opcional)
-- ============================================
create table prices_by_currency (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null,
  variant_id uuid,
  currency_id uuid not null references currencies(id),
  price numeric(18,4) not null check (price >= 0),
  min_quantity numeric(18,4) not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_prices_by_currency_product on prices_by_currency(product_id, currency_id);