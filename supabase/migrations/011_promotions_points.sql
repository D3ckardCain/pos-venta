-- ============================================
-- PROMOCIONES
-- ============================================
create table promotions (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  type promotion_type not null,
  value numeric(18,4) not null default 0,
  currency_id uuid references currencies(id),
  min_quantity numeric(18,4) default 1,
  min_amount numeric(18,4),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  max_uses integer,
  current_uses integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_promotions_active on promotions(is_active);
create index idx_promotions_dates on promotions(starts_at, ends_at);

create table promotion_products (
  promotion_id uuid not null references promotions(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  primary key (promotion_id, product_id)
);

create table promotion_categories (
  promotion_id uuid not null references promotions(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  primary key (promotion_id, category_id)
);

-- ============================================
-- PUNTOS DE CLIENTES
-- ============================================
create table customer_points (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null unique references customers(id) on delete cascade,
  points integer not null default 0 check (points >= 0),
  lifetime_points integer not null default 0,
  updated_at timestamptz not null default now()
);

create table customer_points_movements (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references customers(id) on delete cascade,
  movement_type points_movement_type not null,
  points integer not null,
  balance_after integer not null,
  reference_type text,
  reference_id uuid,
  description text,
  expires_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_points_mov_customer on customer_points_movements(customer_id);
create index idx_points_mov_date on customer_points_movements(created_at desc);