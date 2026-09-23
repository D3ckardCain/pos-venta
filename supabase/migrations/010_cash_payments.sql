-- ============================================
-- MÉTODOS DE PAGO
-- ============================================
create table payment_methods (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  code text not null unique,
  is_active boolean not null default true,
  requires_reference boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================
-- CAJAS FÍSICAS
-- ============================================
create table cash_registers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  code text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================
-- SESIONES DE CAJA
-- ============================================
create table cash_sessions (
  id uuid primary key default uuid_generate_v4(),
  cash_register_id uuid not null references cash_registers(id),
  currency_id uuid not null references currencies(id),
  opened_by uuid not null references profiles(id),
  closed_by uuid references profiles(id),
  opening_amount numeric(18,4) not null default 0,
  closing_amount numeric(18,4),
  expected_amount numeric(18,4),
  difference numeric(18,4),
  status text not null default 'abierta' check (status in ('abierta', 'cerrada')),
  notes text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create index idx_cash_sessions_register on cash_sessions(cash_register_id);
create index idx_cash_sessions_status on cash_sessions(status);

-- ============================================
-- MOVIMIENTOS DE CAJA
-- ============================================
create table cash_movements (
  id uuid primary key default uuid_generate_v4(),
  cash_session_id uuid not null references cash_sessions(id) on delete cascade,
  movement_type cash_movement_type not null,
  currency_id uuid not null references currencies(id),
  amount numeric(18,4) not null,
  balance_after numeric(18,4) not null,
  reference_type text,
  reference_id uuid,
  description text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_cash_movements_session on cash_movements(cash_session_id);
create index idx_cash_movements_date on cash_movements(created_at desc);

-- FK diferidas para sales
alter table sales
  add constraint fk_sales_payment_method
  foreign key (payment_method_id) references payment_methods(id);

alter table sales
  add constraint fk_sales_cash_register
  foreign key (cash_register_id) references cash_registers(id);