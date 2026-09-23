-- ============================================
-- AUDITORÍA
-- ============================================
create table audit_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  user_agent text,
  reason text,
  created_at timestamptz not null default now()
);

create index idx_audit_user on audit_logs(user_id);
create index idx_audit_table on audit_logs(table_name);
create index idx_audit_date on audit_logs(created_at desc);
create index idx_audit_record on audit_logs(record_id);

-- ============================================
-- CONFIGURACIÓN DEL SISTEMA
-- ============================================
create table system_settings (
  id uuid primary key default uuid_generate_v4(),
  key text not null unique,
  value jsonb not null,
  description text,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

-- ============================================
-- NOTIFICACIONES
-- ============================================
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info',
  is_read boolean not null default false,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index idx_notifications_user on notifications(user_id, is_read);
create index idx_notifications_date on notifications(created_at desc);