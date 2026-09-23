-- ============================================
-- CATEGORÍAS
-- ============================================
create table categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  description text,
  image_url text,
  parent_id uuid references categories(id) on delete set null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_categories_active on categories(is_active);
create index idx_categories_parent on categories(parent_id);

-- ============================================
-- PRODUCTOS
-- ============================================
create table products (
  id uuid primary key default uuid_generate_v4(),
  sku text unique,
  barcode text,
  name text not null,
  slug text not null unique,
  description text,
  category_id uuid references categories(id) on delete set null,
  brand text,
  unit text not null default 'unidad',
  cost numeric(18,4) not null default 0 check (cost >= 0),
  base_price numeric(18,4) not null default 0 check (base_price >= 0),
  min_stock numeric(18,4) not null default 0,
  has_variants boolean not null default false,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_products_active on products(is_active);
create index idx_products_category on products(category_id);
create index idx_products_sku on products(sku);
create index idx_products_slug on products(slug);
create index idx_products_name on products using gin(to_tsvector('spanish', name));

-- ============================================
-- IMÁGENES DE PRODUCTOS
-- ============================================
create table product_images (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  variant_id uuid,
  url text not null,
  alt_text text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_product_images_product on product_images(product_id);

-- ============================================
-- VARIANTES DE PRODUCTOS
-- ============================================
create table product_variants (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  sku text unique,
  name text not null,
  attributes jsonb not null default '{}'::jsonb,
  base_price numeric(18,4),
  cost numeric(18,4),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_product_variants_product on product_variants(product_id);