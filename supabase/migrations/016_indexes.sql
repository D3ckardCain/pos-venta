-- ============================================
-- ÍNDICES ADICIONALES DE RENDIMIENTO
-- ============================================

create index idx_products_search on products
  using gin(to_tsvector('spanish', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(sku, '')));

create index idx_customers_search on customers
  using gin(to_tsvector('spanish', coalesce(full_name, '') || ' ' || coalesce(email::text, '') || ' ' || coalesce(phone, '')));

create index idx_sales_date_range on sales(created_at desc) where status = 'completada';

create index idx_inv_mov_product_date on inventory_movements(product_id, created_at desc);

create index idx_exchange_rates_current on exchange_rates(from_currency_id, to_currency_id, valid_from desc)
  where is_active = true;

create index idx_products_active_visible on products(id) where is_active = true;

-- Índice para promociones activas (sin usar now() que no es IMMUTABLE)
create index idx_promotions_active_flag on promotions(id)
  where is_active = true;