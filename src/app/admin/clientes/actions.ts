'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const customerSchema = z.object({
  full_name: z.string().trim().min(1, 'Nombre requerido').max(200),
  email: z
    .string()
    .trim()
    .email('Correo invalido')
    .optional()
    .nullable()
    .or(z.literal('')),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  is_active: z.coerce.boolean().default(true),
});

const adjustPointsSchema = z.object({
  customer_id: z.string().uuid(),
  points: z.coerce.number().int(),
  reason: z
    .string()
    .trim()
    .min(3, 'Motivo requerido (minimo 3 caracteres)')
    .max(500),
});

export interface ActionState {
  error: string | null;
  success: boolean;
  timestamp: number;
  fieldErrors?: Record<string, string>;
}

function zodToFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.errors) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function parseCustomerForm(formData: FormData) {
  return {
    full_name: formData.get('full_name'),
    email: formData.get('email') || null,
    phone: formData.get('phone') || null,
    address: formData.get('address') || null,
    city: formData.get('city') || null,
    notes: formData.get('notes') || null,
    is_active: formData.get('is_active') === 'on',
  };
}

export async function createCustomerAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const parsed = customerSchema.safeParse(parseCustomerForm(formData));
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  if (parsed.data.email) {
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('email', parsed.data.email);
    if (existing && existing.length > 0) {
      return {
        error: 'Ya existe un cliente con ese correo',
        success: false,
        timestamp: Date.now(),
        fieldErrors: { email: 'Correo duplicado' },
      };
    }
  }

  const { count } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true });
  const code = `C-${String((count ?? 0) + 1).padStart(5, '0')}`;

  const { data, error } = await supabase
    .from('customers')
    .insert({
      ...parsed.data,
      code,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      city: parsed.data.city || null,
      notes: parsed.data.notes || null,
    })
    .select('id')
    .single();

  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  // Crear registro de puntos
  await supabase.from('customer_points').insert({
    customer_id: data.id,
    points: 0,
    lifetime_points: 0,
  });

  revalidatePath('/admin/clientes');
  revalidatePath('/admin/puntos');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function updateCustomerAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const id = String(formData.get('id') ?? '');
  if (!id)
    return { error: 'ID requerido', success: false, timestamp: Date.now() };

  const parsed = customerSchema.safeParse(parseCustomerForm(formData));
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  if (parsed.data.email) {
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('email', parsed.data.email)
      .neq('id', id);
    if (existing && existing.length > 0) {
      return {
        error: 'Ya existe otro cliente con ese correo',
        success: false,
        timestamp: Date.now(),
        fieldErrors: { email: 'Correo duplicado' },
      };
    }
  }

  const { error } = await supabase
    .from('customers')
    .update({
      ...parsed.data,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      city: parsed.data.city || null,
      notes: parsed.data.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  revalidatePath('/admin/clientes');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function deleteCustomerAction(id: string): Promise<ActionState> {
  const supabase = await createClient();

  const { count: salesCount } = await supabase
    .from('sales')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', id);

  const { count: ordersCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', id);

  if ((salesCount ?? 0) > 0 || (ordersCount ?? 0) > 0) {
    const { error } = await supabase
      .from('customers')
      .update({ is_active: false })
      .eq('id', id);
    if (error)
      return { error: error.message, success: false, timestamp: Date.now() };
    revalidatePath('/admin/clientes');
    return { error: null, success: true, timestamp: Date.now() };
  }

  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  revalidatePath('/admin/clientes');
  revalidatePath('/admin/puntos');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function toggleCustomerActiveAction(
  id: string,
  isActive: boolean
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('customers')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };
  revalidatePath('/admin/clientes');
  return { error: null, success: true, timestamp: Date.now() };
}

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
    description: parsed.data.reason,
    created_by: userId,
  });

  revalidatePath('/admin/clientes');
  revalidatePath(`/admin/clientes/${parsed.data.customer_id}`);
  revalidatePath('/admin/puntos');
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// EXPORTAR CLIENTES A EXCEL (.xlsx)
// ============================================

export async function exportCustomersExcelAction(): Promise<{
  fileBase64?: string;
  filename?: string;
  error?: string;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('customers')
    .select(
      'code, full_name, email, phone, address, city, total_purchases, total_orders, is_active, created_at, points:customer_points(points, lifetime_points)'
    )
    .order('created_at', { ascending: false })
    .limit(10000);

  if (error) return { error: error.message };

  // --------------------------------------------
  // Preparar filas planas
  // --------------------------------------------
  const rows = (data ?? []).map((c) => {
    const row = c as unknown as {
      code: string | null;
      full_name: string;
      email: string | null;
      phone: string | null;
      address: string | null;
      city: string | null;
      total_purchases: number;
      total_orders: number;
      is_active: boolean;
      created_at: string;
      points?: { points: number; lifetime_points: number } | null;
    };

    return {
      code: row.code ?? '',
      full_name: row.full_name,
      email: row.email ?? '',
      phone: row.phone ?? '',
      address: row.address ?? '',
      city: row.city ?? '',
      total_purchases: Number(row.total_purchases),
      total_orders: Number(row.total_orders),
      points: Number(row.points?.points ?? 0),
      lifetime_points: Number(row.points?.lifetime_points ?? 0),
      is_active: row.is_active,
      created_at: row.created_at,
    };
  });

  // --------------------------------------------
  // Totales
  // --------------------------------------------
  const totalPurchases = rows.reduce((sum, r) => sum + r.total_purchases, 0);
  const totalOrders = rows.reduce((sum, r) => sum + r.total_orders, 0);
  const totalPoints = rows.reduce((sum, r) => sum + r.points, 0);

  const totals: Record<string, string | number> = {
    code: 'TOTALES',
    total_purchases: totalPurchases,
    total_orders: totalOrders,
    points: totalPoints,
  };

  // --------------------------------------------
  // Construir workbook
  // --------------------------------------------
  const { buildExcelWorkbook, workbookToBuffer } = await import(
    '@/lib/utils/excel'
  );

  const wb = buildExcelWorkbook({
    name: 'Clientes',
    columns: [
      { header: 'Código', key: 'code', width: 12 },
      { header: 'Nombre', key: 'full_name', width: 28 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Teléfono', key: 'phone', width: 16 },
      { header: 'Dirección', key: 'address', width: 32 },
      { header: 'Ciudad', key: 'city', width: 18 },
      { header: 'Total compras', key: 'total_purchases', type: 'currency', width: 16 },
      { header: 'Total pedidos', key: 'total_orders', type: 'number', width: 14 },
      { header: 'Puntos', key: 'points', type: 'number', width: 12 },
      { header: 'Puntos históricos', key: 'lifetime_points', type: 'number', width: 16 },
      { header: 'Activo', key: 'is_active', type: 'boolean', width: 10 },
      { header: 'Registrado', key: 'created_at', type: 'date', width: 14 },
    ],
    rows,
    totals,
  });

  const buffer = await workbookToBuffer(wb);
  const fileBase64 = Buffer.from(buffer).toString('base64');

  return {
    fileBase64,
    filename: `clientes-${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}