-- ============================================
-- CLIENTES
-- ============================================
create table customers (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete set null,
  code text unique,
  full_name text not null,
  email citext,
  phone text,
  address text,
  city text,
  notes text,
  total_purchases numeric(18,4) not null default 0,
  total_orders integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_customers_email on customers(email);
create index idx_customers_phone on customers(phone);
create index idx_customers_name on customers using gin(to_tsvector('spanish', full_name));

-- ============================================
-- VENDEDORES
-- ============================================
create table vendors (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  code text unique,
  commission_rate numeric(5,2) not null default 0 check (commission_rate >= 0 and commission_rate <= 100),
  total_sales numeric(18,4) not null default 0,
  total_commission numeric(18,4) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_vendors_profile on vendors(profile_id);
create index idx_vendors_active on vendors(is_active);