import { createClient } from '@/lib/supabase/server';
import { PuntosClient } from './PuntosClient';
import type { Currency } from '@/lib/types/database';
import type {
  CustomerWithPoints,
  PointsMovementRow,
  PointsSettings,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function PuntosPage() {
  const supabase = await createClient();

  // ---- Clientes con sus puntos ----
  const { data: customersRaw } = await supabase
    .from('customers')
    .select(
      `id, code, full_name, email, phone, is_active, public_secret_code,
       points:customer_points(points, lifetime_points, updated_at)`
    )
    .eq('is_active', true)
    .order('full_name')
    .limit(1000);

  const customers: CustomerWithPoints[] = (customersRaw ?? []).map((c) => {
    const row = c as unknown as {
      id: string;
      code: string | null;
      full_name: string;
      email: string | null;
      phone: string | null;
      is_active: boolean;
      public_secret_code: string | null;
      points?: {
        points: number;
        lifetime_points: number;
        updated_at: string;
      } | null;
    };
    return {
      id: row.id,
      code: row.code,
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
      is_active: row.is_active,
      public_secret_code: row.public_secret_code,
      points: Number(row.points?.points ?? 0),
      lifetime_points: Number(row.points?.lifetime_points ?? 0),
      last_movement_at: row.points?.updated_at ?? null,
    };
  });

  // ---- Últimos movimientos globales ----
  const { data: movementsRaw } = await supabase
    .from('customer_points_movements')
    .select(
      `id, customer_id, movement_type, points, balance_after,
       reference_type, reference_id, description, expires_at, created_at,
       customer:customers(id, full_name, phone),
       user:profiles!created_by(full_name, email)`
    )
    .order('created_at', { ascending: false })
    .limit(200);

  const movements: PointsMovementRow[] = (movementsRaw ?? []).map((m) => {
    const row = m as unknown as {
      id: string;
      customer_id: string;
      movement_type: string;
      points: number;
      balance_after: number;
      reference_type: string | null;
      reference_id: string | null;
      description: string | null;
      expires_at: string | null;
      created_at: string;
      customer?: { id: string; full_name: string; phone: string | null } | null;
      user?: { full_name: string | null; email: string } | null;
    };
    return {
      id: row.id,
      customer_id: row.customer_id,
      customer_name: row.customer?.full_name ?? null,
      customer_phone: row.customer?.phone ?? null,
      movement_type: row.movement_type,
      points: Number(row.points),
      balance_after: Number(row.balance_after),
      reference_type: row.reference_type,
      reference_id: row.reference_id,
      description: row.description,
      expires_at: row.expires_at,
      created_at: row.created_at,
      user_name: row.user?.full_name ?? row.user?.email ?? null,
    };
  });

  // ---- Configuración actual ----
  const { data: settingsData } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', [
      'points_per_currency_unit',
      'points_expiration_days',
      'points_redemption_code_minutes',
    ]);

  const settingsMap = new Map<string, unknown>();
  for (const s of settingsData ?? []) settingsMap.set(s.key, s.value);

  const toNum = (v: unknown, def: number): number => {
    if (v === null || v === undefined) return def;
    const n = Number(v);
    return isNaN(n) ? def : n;
  };

  const settings: PointsSettings = {
    points_per_currency_unit: toNum(
      settingsMap.get('points_per_currency_unit'),
      1
    ),
    points_expiration_days: toNum(
      settingsMap.get('points_expiration_days'),
      0
    ),
    points_redemption_code_minutes: toNum(
      settingsMap.get('points_redemption_code_minutes'),
      15
    ),
  };

  // ---- Moneda principal (para mostrar equivalencias) ----
  const { data: currencySettings } = await supabase
    .from('currency_settings')
    .select('*, primary_currency:currencies!primary_currency_id(*)')
    .eq('is_singleton', true)
    .single();

  const primaryCurrency =
    (currencySettings as { primary_currency?: Currency } | null)
      ?.primary_currency ?? null;

  return (
    <PuntosClient
      initialCustomers={customers}
      initialMovements={movements}
      initialSettings={settings}
      primaryCurrency={primaryCurrency}
    />
  );
}