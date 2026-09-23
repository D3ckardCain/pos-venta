-- ============================================
-- INVENTARIO (stock actual)
-- ============================================
create table inventory (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete cascade,
  stock numeric(18,4) not null default 0,
  reserved numeric(18,4) not null default 0,
  available numeric(18,4) generated always as (stock - reserved) stored,
  updated_at timestamptz not null default now(),
  unique (product_id, variant_id)
);

create index idx_inventory_product on inventory(product_id);
create index idx_inventory_low_stock on inventory(stock);

-- ============================================
-- MOVIMIENTOS DE INVENTARIO (kardex)
-- ============================================
create table inventory_movements (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id),
  variant_id uuid references product_variants(id),
  movement_type movement_type not null,
  quantity numeric(18,4) not null,
  stock_before numeric(18,4) not null,
  stock_after numeric(18,4) not null,
  unit_cost numeric(18,4),
  reference_type text,
  reference_id uuid,
  reason text,
  notes text,
  idempotency_key text unique,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_inv_mov_product on inventory_movements(product_id);
create index idx_inv_mov_type on inventory_movements(movement_type);
create index idx_inv_mov_date on inventory_movements(created_at desc);
create index idx_inv_mov_reference on inventory_movements(reference_type, reference_id);

-- ============================================
-- RESERVAS DE INVENTARIO
-- ============================================
create table inventory_reservations (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id),
  variant_id uuid references product_variants(id),
  quantity numeric(18,4) not null check (quantity > 0),
  reference_type text not null,
  reference_id uuid not null,
  status text not null default 'activa' check (status in ('activa', 'confirmada', 'liberada', 'expirada')),
  expires_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_inv_res_product on inventory_reservations(product_id);
create index idx_inv_res_reference on inventory_reservations(reference_type, reference_id);
create index idx_inv_res_status on inventory_reservations(status);