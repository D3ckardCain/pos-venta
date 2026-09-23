-- ============================================
-- PERFILES (extiende auth.users)
-- ============================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  full_name text not null,
  phone text,
  avatar_url text,
  role_id uuid not null references roles(id),
  is_active boolean not null default true,
  last_login timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_role on profiles(role_id);
create index idx_profiles_active on profiles(is_active);
create index idx_profiles_email on profiles(email);