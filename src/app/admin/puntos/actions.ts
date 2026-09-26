'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// ============================================
// SCHEMAS
// ============================================
const adjustPointsSchema = z.object({
  customer_id: z.string().uuid(),
  points: z.coerce.number().int(),
  reason: z
    .string()
    .trim()
    .min(3, 'Motivo requerido (mínimo 3 caracteres)')
    .max(500),
});

const generateCodeSchema = z.object({
  customer_id: z.string().uuid(),
});

export interface ActionState {
  error: string | null;
  success: boolean;
  timestamp: number;
  fieldErrors?: Record<string, string>;
}

export interface CustomerWithPoints {
  id: string;
  code: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  public_secret_code: string | null;
  points: number;
  lifetime_points: number;
  last_movement_at: string | null;
}

export interface PointsMovementRow {
  id: string;
  customer_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  movement_type: string;
  points: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  expires_at: string | null;
  created_at: string;
  user_name: string | null;
}

export interface PointsKpis {
  total_customers_with_points: number;
  total_points_active: number;
  total_points_lifetime: number;
  total_points_redeemed: number;
  total_points_expired: number;
}

export interface PointsSettings {
  points_per_currency_unit: number;
  points_expiration_days: number;
  points_redemption_code_minutes: number;
}

function zodToFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.errors) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

// ============================================
// KPIs
// ============================================
export async function getPointsKpisAction(): Promise<{
  kpis?: PointsKpis;
  error?: string;
}> {
  const supabase = await createClient();

  // Clientes con puntos
  const { data: pointsData } = await supabase
    .from('customer_points')
    .select('points, lifetime_points');

  let active = 0;
  let lifetime = 0;
  let customersWithPoints = 0;
  for (const r of pointsData ?? []) {
    const p = Number(r.points ?? 0);
    if (p > 0) customersWithPoints++;
    active += p;
    lifetime += Number(r.lifetime_points ?? 0);
  }

  // Canjeados y expirados (desde movimientos)
  const { data: redeemed } = await supabase
    .from('customer_points_movements')
    .select('points')
    .eq('movement_type', 'canje');

  const { data: expired } = await supabase
    .from('customer_points_movements')
    .select('points')
    .eq('movement_type', 'expiracion');

  const totalRedeemed = (redeemed ?? []).reduce(
    (sum, r) => sum + Math.abs(Number(r.points ?? 0)),
    0
  );
  const totalExpired = (expired ?? []).reduce(
    (sum, r) => sum + Math.abs(Number(r.points ?? 0)),
    0
  );

  return {
    kpis: {
      total_customers_with_points: customersWithPoints,
      total_points_active: active,
      total_points_lifetime: lifetime,
      total_points_redeemed: totalRedeemed,
      total_points_expired: totalExpired,
    },
  };
}

// ============================================
// CONFIGURACIÓN ACTUAL DE PUNTOS
// ============================================
export async function getPointsSettingsAction(): Promise<{
  settings?: PointsSettings;
  error?: string;
}> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', [
      'points_per_currency_unit',
      'points_expiration_days',
      'points_redemption_code_minutes',
    ]);

  const map = new Map<string, unknown>();
  for (const s of data ?? []) {
    map.set(s.key, s.value);
  }

  const toNum = (v: unknown, def: number): number => {
    if (v === null || v === undefined) return def;
    const n = Number(v);
    return isNaN(n) ? def : n;
  };

  return {
    settings: {
      points_per_currency_unit: toNum(
        map.get('points_per_currency_unit'),
        1
      ),
      points_expiration_days: toNum(map.get('points_expiration_days'), 0),
      points_redemption_code_minutes: toNum(
        map.get('points_redemption_code_minutes'),
        15
      ),
    },
  };
}

// ============================================
// AJUSTAR PUNTOS MANUALMENTE
// ============================================
export async function adjustPointsAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const raw = {
    customer_id: formData.get('customer_id'),
    points: formData.get('points'),
    reason: formData.get('reason'),
  };

  const parsed = adjustPointsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { data: current } = await supabase
    .from('customer_points')
    .select('points, lifetime_points')
    .eq('customer_id', parsed.data.customer_id)
    .single();

  const currentPoints = Number(current?.points ?? 0);
  const currentLifetime = Number(current?.lifetime_points ?? 0);
  const newBalance = currentPoints + parsed.data.points;

  if (newBalance < 0) {
    return {
      error: 'El cliente no tiene suficientes puntos',
      success: false,
      timestamp: Date.now(),
    };
  }

  const userRes = await supabase.auth.getUser();
  const userId = userRes.data.user?.id ?? null;

  if (!current) {
    await supabase.from('customer_points').insert({
      customer_id: parsed.data.customer_id,
      points: newBalance,
      lifetime_points: parsed.data.points > 0 ? parsed.data.points : 0,
    });
  } else {
    await supabase
      .from('customer_points')
      .update({
        points: newBalance,
        lifetime_points:
          parsed.data.points > 0
            ? currentLifetime + parsed.data.points
            : currentLifetime,
        updated_at: new Date().toISOString(),
      })
      .eq('customer_id', parsed.data.customer_id);
  }

  await supabase.from('customer_points_movements').insert({
    customer_id: parsed.data.customer_id,
    movement_type: parsed.data.points >= 0 ? 'acumulacion' : 'canje',
    points: parsed.data.points,
    balance_after: newBalance,
    reference_type: 'manual_adjust',
    description: parsed.data.reason,
    created_by: userId,
  });

  revalidatePath('/admin/puntos');
  revalidatePath('/admin/clientes');
  revalidatePath(`/admin/clientes/${parsed.data.customer_id}`);
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// APLICAR CADUCIDAD
// ============================================
export async function applyExpirationAction(): Promise<{
  affected_customers?: number;
  total_points_expired?: number;
  error?: string;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('apply_points_expiration');

  if (error) return { error: error.message };

  // La función devuelve una tabla
  const row = Array.isArray(data) ? data[0] : data;
  return {
    affected_customers: Number(row?.affected_customers ?? 0),
    total_points_expired: Number(row?.total_points_expired ?? 0),
  };
}

// ============================================
// GENERAR CÓDIGO DE CANJE
// ============================================
export async function generateRedemptionCodeAction(
  customerId: string
): Promise<{
  code?: string;
  expires_at?: string;
  error?: string;
}> {
  const supabase = await createClient();

  const parsed = generateCodeSchema.safeParse({ customer_id: customerId });
  if (!parsed.success) {
    return { error: 'ID de cliente inválido' };
  }

  const { data, error } = await supabase.rpc('generate_redemption_code', {
    p_customer_id: parsed.data.customer_id,
  });

  if (error) return { error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  return {
    code: row?.code,
    expires_at: row?.expires_at,
  };
}

// ============================================
// ACTUALIZAR CONFIGURACIÓN DE PUNTOS
// ============================================
export async function updatePointsSettingsAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const pointsPerUnit = Number(formData.get('points_per_currency_unit'));
  const expirationDays = Number(formData.get('points_expiration_days'));
  const codeMinutes = Number(formData.get('points_redemption_code_minutes'));

  if (
    isNaN(pointsPerUnit) ||
    isNaN(expirationDays) ||
    isNaN(codeMinutes) ||
    pointsPerUnit < 0 ||
    expirationDays < 0 ||
    codeMinutes <= 0
  ) {
    return {
      error: 'Valores inválidos',
      success: false,
      timestamp: Date.now(),
    };
  }

  const userRes = await supabase.auth.getUser();
  const userId = userRes.data.user?.id ?? null;

  const updates: Array<{ key: string; value: unknown; description: string }> = [
    {
      key: 'points_per_currency_unit',
      value: pointsPerUnit,
      description: 'Puntos otorgados por cada unidad de moneda gastada.',
    },
    {
      key: 'points_expiration_days',
      value: expirationDays,
      description:
        'Días hasta que caducan los puntos desde que se otorgan. 0 = no caducan.',
    },
    {
      key: 'points_redemption_code_minutes',
      value: codeMinutes,
      description: 'Minutos de validez de un código de canje generado.',
    },
  ];

  for (const u of updates) {
    const { error } = await supabase.from('system_settings').upsert(
      {
        key: u.key,
        value: u.value as never,
        description: u.description,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );
    if (error) {
      return { error: error.message, success: false, timestamp: Date.now() };
    }
  }

  revalidatePath('/admin/puntos');
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// EXPORTAR CLIENTES CON PUNTOS
// ============================================
export async function exportCustomersPointsExcel(filters: {
  only_with_points?: boolean;
}): Promise<{ fileBase64?: string; filename?: string; error?: string }> {
  const supabase = await createClient();

  let query = supabase
    .from('customers')
    .select(
      `id, code, full_name, email, phone, is_active, public_secret_code,
       points:customer_points(points, lifetime_points, updated_at)`
    )
    .eq('is_active', true)
    .order('full_name')
    .limit(10000);

  const { data, error } = await query;
  if (error) return { error: error.message };

  let rows = (data ?? []).map((c) => {
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
      code: row.code ?? '',
      full_name: row.full_name,
      email: row.email ?? '',
      phone: row.phone ?? '',
      points: Number(row.points?.points ?? 0),
      lifetime_points: Number(row.points?.lifetime_points ?? 0),
      last_updated: row.points?.updated_at ?? '',
      has_secret_code: row.public_secret_code ? 'Sí' : 'No',
    };
  });

  if (filters.only_with_points) {
    rows = rows.filter((r) => r.points > 0);
  }

  const totals = {
    full_name: 'TOTALES',
    points: rows.reduce((s, r) => s + r.points, 0),
    lifetime_points: rows.reduce((s, r) => s + r.lifetime_points, 0),
  };

  const { buildExcelWorkbook, workbookToBuffer } = await import(
    '@/lib/utils/excel'
  );

  const wb = buildExcelWorkbook({
    name: 'Clientes con puntos',
    columns: [
      { header: 'Código', key: 'code', width: 12 },
      { header: 'Nombre', key: 'full_name', width: 28 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'Teléfono', key: 'phone', width: 16 },
      { header: 'Puntos actuales', key: 'points', type: 'number', width: 16 },
      {
        header: 'Puntos históricos',
        key: 'lifetime_points',
        type: 'number',
        width: 18,
      },
      {
        header: 'Última actualización',
        key: 'last_updated',
        type: 'datetime',
        width: 20,
      },
      { header: 'Tiene código', key: 'has_secret_code', width: 14 },
    ],
    rows,
    totals,
  });

  const buffer = await workbookToBuffer(wb);
  return {
    fileBase64: Buffer.from(buffer).toString('base64'),
    filename: `clientes-puntos-${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}

// ============================================
// EXPORTAR HISTORIAL GLOBAL DE MOVIMIENTOS
// ============================================
export async function exportPointsMovementsExcel(filters: {
  from?: string;
  to?: string;
  customer_id?: string;
  movement_type?: string;
}): Promise<{ fileBase64?: string; filename?: string; error?: string }> {
  const supabase = await createClient();

  let query = supabase
    .from('customer_points_movements')
    .select(
      `id, movement_type, points, balance_after,
       reference_type, reference_id, description, expires_at, created_at,
       customer:customers(id, full_name, phone),
       user:profiles!created_by(full_name, email)`
    )
    .order('created_at', { ascending: false })
    .limit(10000);

  if (filters.customer_id)
    query = query.eq('customer_id', filters.customer_id);
  if (filters.movement_type)
    query = query.eq('movement_type', filters.movement_type);
  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', filters.to);

  const { data, error } = await query;
  if (error) return { error: error.message };

  const rows = (data ?? []).map((m) => {
    const row = m as unknown as {
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
      created_at: row.created_at,
      customer_name: row.customer?.full_name ?? '',
      customer_phone: row.customer?.phone ?? '',
      movement_type: row.movement_type,
      points: Number(row.points),
      balance_after: Number(row.balance_after),
      reference_type: row.reference_type ?? '',
      description: row.description ?? '',
      expires_at: row.expires_at ?? '',
      user_name: row.user?.full_name ?? row.user?.email ?? 'Sistema',
    };
  });

  const totals = {
    customer_name: 'TOTALES',
    points: rows.reduce((s, r) => s + r.points, 0),
  };

  const { buildExcelWorkbook, workbookToBuffer } = await import(
    '@/lib/utils/excel'
  );

  const wb = buildExcelWorkbook({
    name: 'Movimientos',
    columns: [
      { header: 'Fecha', key: 'created_at', type: 'datetime', width: 20 },
      { header: 'Cliente', key: 'customer_name', width: 26 },
      { header: 'Teléfono', key: 'customer_phone', width: 16 },
      {
        header: 'Tipo',
        key: 'movement_type',
        type: 'status',
        width: 16,
      },
      { header: 'Puntos', key: 'points', type: 'number', width: 12 },
      { header: 'Saldo', key: 'balance_after', type: 'number', width: 12 },
      { header: 'Referencia', key: 'reference_type', width: 18 },
      { header: 'Descripción', key: 'description', width: 32 },
      { header: 'Expira', key: 'expires_at', type: 'datetime', width: 18 },
      { header: 'Usuario', key: 'user_name', width: 22 },
    ],
    rows,
    statusMap: {
      acumulacion: 'success',
      canje: 'warning',
      expiracion: 'error',
      ajuste: 'info',
    },
    totals,
  });

  const buffer = await workbookToBuffer(wb);
  return {
    fileBase64: Buffer.from(buffer).toString('base64'),
    filename: `movimientos-puntos-${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}