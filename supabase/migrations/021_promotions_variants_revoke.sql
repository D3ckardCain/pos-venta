-- ============================================
-- MIGRACIÓN 021
-- Promociones: soporte de variantes + revocación
-- ============================================

-- ============================================
-- 1) promotion_products: añadir variant_id
-- ============================================
alter table promotion_products
  add column if not exists variant_id uuid references product_variants(id) on delete cascade;

-- Índice para búsquedas por variante
create index if not exists idx_promotion_products_variant
  on promotion_products(variant_id)
  where variant_id is not null;

-- Índice combinado para búsqueda "producto + variante"
create index if not exists idx_promotion_products_product_variant
  on promotion_products(product_id, variant_id);

comment on column promotion_products.variant_id is
  'Si es NULL, la promoción aplica a todas las variantes del producto. Si tiene valor, aplica solo a esa variante.';

-- ============================================
-- 2) promotions: campos de revocación
-- ============================================
alter table promotions
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references profiles(id),
  add column if not exists revoke_reason text;

create index if not exists idx_promotions_revoked
  on promotions(revoked_at)
  where revoked_at is not null;

comment on column promotions.revoked_at is
  'Fecha en la que se revocó la promoción anticipadamente. NULL = no revocada.';
comment on column promotions.revoked_by is
  'Usuario que revocó la promoción.';
comment on column promotions.revoke_reason is
  'Motivo opcional de la revocación.';

-- ============================================
-- 3) Ajustar RLS para permitir UPDATE de revocación
-- ============================================
-- Ya existe promotions_all_admin (ALL) que cubre esto.
-- No hace falta política nueva.

-- ============================================
-- FIN DE MIGRACIÓN 021
-- ============================================