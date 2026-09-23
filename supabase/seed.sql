-- ============================================
-- ROLES DEL SISTEMA
-- ============================================
insert into roles (name, description, is_system) values
  ('admin', 'Administrador con acceso total', true),
  ('vendedor', 'Vendedor con acceso limitado', true),
  ('cliente', 'Cliente con acceso público y propio', true)
on conflict (name) do nothing;

-- ============================================
-- PERMISOS
-- ============================================
insert into permissions (code, module, action, description) values
  ('products.view', 'products', 'view', 'Ver productos'),
  ('products.create', 'products', 'create', 'Crear productos'),
  ('products.edit', 'products', 'edit', 'Editar productos'),
  ('products.delete', 'products', 'delete', 'Eliminar productos'),
  ('inventory.view', 'inventory', 'view', 'Ver inventario'),
  ('inventory.adjust', 'inventory', 'adjust', 'Ajustar inventario'),
  ('sales.view', 'sales', 'view', 'Ver ventas'),
  ('sales.create', 'sales', 'create', 'Crear ventas'),
  ('sales.cancel', 'sales', 'cancel', 'Cancelar ventas'),
  ('orders.view', 'orders', 'view', 'Ver pedidos'),
  ('orders.create', 'orders', 'create', 'Crear pedidos'),
  ('orders.manage', 'orders', 'manage', 'Gestionar pedidos'),
  ('customers.view', 'customers', 'view', 'Ver clientes'),
  ('customers.create', 'customers', 'create', 'Crear clientes'),
  ('customers.edit', 'customers', 'edit', 'Editar clientes'),
  ('vendors.view', 'vendors', 'view', 'Ver vendedores'),
  ('vendors.manage', 'vendors', 'manage', 'Gestionar vendedores'),
  ('currencies.view', 'currencies', 'view', 'Ver monedas'),
  ('currencies.manage', 'currencies', 'manage', 'Gestionar monedas y tipos de cambio'),
  ('cash.view', 'cash', 'view', 'Ver cajas'),
  ('cash.manage', 'cash', 'manage', 'Gestionar cajas'),
  ('reports.view', 'reports', 'view', 'Ver reportes'),
  ('audit.view', 'audit', 'view', 'Ver auditoría'),
  ('settings.manage', 'settings', 'manage', 'Gestionar configuración'),
  ('catalog.share', 'catalog', 'share', 'Compartir catálogo')
on conflict (code) do nothing;

-- ============================================
-- PERMISOS PARA ADMIN (todos)
-- ============================================
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r cross join permissions p
where r.name = 'admin'
on conflict do nothing;

-- ============================================
-- PERMISOS PARA VENDEDOR
-- ============================================
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in (
  'products.view', 'inventory.view',
  'sales.view', 'sales.create',
  'orders.view', 'orders.create',
  'customers.view', 'customers.create', 'customers.edit',
  'currencies.view', 'cash.view',
  'catalog.share'
)
where r.name = 'vendedor'
on conflict do nothing;

-- ============================================
-- PERMISOS PARA CLIENTE
-- ============================================
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in (
  'products.view', 'catalog.share'
)
where r.name = 'cliente'
on conflict do nothing;

-- ============================================
-- MONEDAS INICIALES
-- ============================================
insert into currencies (
  code, name, symbol, decimals,
  decimal_separator, thousand_separator, symbol_position,
  is_active, usable_in_sales, usable_in_purchases,
  usable_in_cash, usable_in_catalog, usable_by_customers, usable_by_vendors
) values
  ('MXN', 'Peso Mexicano', '$', 2, '.', ',', 'before', true, true, true, true, true, true, true),
  ('USD', 'Dólar Estadounidense', 'US$', 2, '.', ',', 'before', true, true, true, true, true, true, true),
  ('EUR', 'Euro', '€', 2, '.', ',', 'before', true, true, true, true, true, true, true)
on conflict (code) do nothing;

-- ============================================
-- CONFIGURACIÓN DE MONEDA PRINCIPAL
-- ============================================
insert into currency_settings (primary_currency_id, is_singleton)
select id, true from currencies where code = 'MXN'
on conflict (is_singleton) do nothing;

-- ============================================
-- TIPOS DE CAMBIO INICIALES
-- ============================================
insert into exchange_rates (from_currency_id, to_currency_id, rate, source, notes)
select
  (select id from currencies where code = 'USD'),
  (select id from currencies where code = 'MXN'),
  18.50,
  'manual',
  'Tipo de cambio inicial USD/MXN'
where not exists (
  select 1 from exchange_rates er
  where er.from_currency_id = (select id from currencies where code = 'USD')
    and er.to_currency_id = (select id from currencies where code = 'MXN')
);

insert into exchange_rates (from_currency_id, to_currency_id, rate, source, notes)
select
  (select id from currencies where code = 'EUR'),
  (select id from currencies where code = 'MXN'),
  20.10,
  'manual',
  'Tipo de cambio inicial EUR/MXN'
where not exists (
  select 1 from exchange_rates er
  where er.from_currency_id = (select id from currencies where code = 'EUR')
    and er.to_currency_id = (select id from currencies where code = 'MXN')
);

-- ============================================
-- MÉTODOS DE PAGO INICIALES
-- ============================================
insert into payment_methods (name, code, is_active, sort_order) values
  ('Efectivo', 'cash', true, 1),
  ('Tarjeta de Débito', 'debit_card', true, 2),
  ('Tarjeta de Crédito', 'credit_card', true, 3),
  ('Transferencia', 'transfer', true, 4),
  ('Otro', 'other', true, 5)
on conflict (code) do nothing;

-- ============================================
-- CAJA PRINCIPAL
-- ============================================
insert into cash_registers (name, code, is_active) values
  ('Caja Principal', 'MAIN', true)
on conflict (code) do nothing;

-- ============================================
-- CONFIGURACIÓN DEL SISTEMA
-- ============================================
insert into system_settings (key, value, description) values
  ('business_name', '"Mi Negocio"'::jsonb, 'Nombre del negocio'),
  ('business_phone', '""'::jsonb, 'Teléfono del negocio para WhatsApp'),
  ('catalog_url', '"http://localhost:3000/catalogo"'::jsonb, 'URL pública del catálogo'),
  ('whatsapp_message_template', '"Hola, te comparto nuestro catálogo actualizado:"'::jsonb, 'Plantilla de mensaje WhatsApp'),
  ('points_per_currency_unit', '1'::jsonb, 'Puntos por unidad de moneda gastada'),
  ('allow_negative_stock', 'false'::jsonb, 'Permitir stock negativo'),
  ('low_stock_threshold', '5'::jsonb, 'Umbral de stock bajo')
on conflict (key) do nothing;
