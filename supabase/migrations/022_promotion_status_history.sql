-- ============================================
-- MIGRACIÓN 022
-- Historial de cambios de estado de promociones
-- ============================================

create table if not exists promotion_status_history (
  id uuid primary key default uuid_generate_v4(),
  promotion_id uuid not null,
  previous_status text,
  new_status text not null,
  reason text,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now(),
  metadata jsonb
);

-- Índices para búsquedas
create index if not exists idx_promotion_history_promo
  on promotion_status_history(promotion_id, changed_at desc);

create index if not exists idx_promotion_history_date
  on promotion_status_history(changed_at desc);

comment on table promotion_status_history is
  'Historial de eventos de estado de promociones. Se conserva aunque la promoción se borre.';
comment on column promotion_status_history.previous_status is
  'Estado anterior. NULL si es la creación.';
comment on column promotion_status_history.new_status is
  'Estado nuevo: creada, activada, desactivada, revocada, restaurada.';
comment on column promotion_status_history.reason is
  'Motivo opcional (ej: motivo de revocación).';

-- ============================================
-- RLS
-- ============================================
alter table promotion_status_history enable row level security;

-- Admin puede leer todo
create policy "promotion_history_select_admin"
  on promotion_status_history for select
  using (public.is_admin());

-- Admin puede insertar (lo hacen las Server Actions en su nombre)
create policy "promotion_history_insert_admin"
  on promotion_status_history for insert
  with check (public.is_admin());

-- No hay update ni delete: el historial es inmutable.
-- Para limpiar, se hace vía SQL directo.

-- ============================================
-- NOTA: No hay FK con ON DELETE CASCADE
-- Esto es intencional: el historial se conserva
-- aunque la promoción se borre físicamente.
-- ============================================

-- ============================================
-- FIN DE MIGRACIÓN 022
-- ============================================