-- ============================================
-- EXTENSIONES NECESARIAS
-- ============================================
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "citext" with schema public;

-- ============================================
-- SEARCH_PATH GLOBAL
-- ============================================
alter database postgres set search_path to public, extensions;

-- ============================================
-- TIPOS ENUMERADOS (idempotentes)
-- ============================================
do $$ begin
  create type user_role as enum ('admin', 'vendedor', 'cliente');
exception when duplicate_object then null; end $$;

do $$ begin
  create type movement_type as enum (
    'entrada', 'salida', 'ajuste', 'devolucion',
    'cancelacion', 'reserva', 'liberacion_reserva', 'transferencia'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type sale_status as enum ('completada', 'cancelada', 'devuelta', 'pendiente');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum (
    'pendiente', 'confirmado', 'preparando', 'enviado',
    'entregado', 'cancelado', 'devuelto'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type cash_movement_type as enum (
    'apertura', 'cierre', 'entrada', 'salida',
    'retiro', 'deposito', 'ajuste', 'venta', 'devolucion'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type promotion_type as enum ('porcentaje', 'monto_fijo', 'precio_especial', '2x1');
exception when duplicate_object then null; end $$;

do $$ begin
  create type points_movement_type as enum ('acumulacion', 'canje', 'expiracion', 'ajuste');
exception when duplicate_object then null; end $$;