-- ============================================
-- ROLES
-- ============================================
create table roles (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- PERMISOS
-- ============================================
create table permissions (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  module text not null,
  action text not null,
  description text,
  created_at timestamptz not null default now()
);

-- ============================================
-- RELACIÓN ROL-PERMISO
-- ============================================
create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);