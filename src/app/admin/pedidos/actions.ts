'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// ============================================
// SCHEMAS
// ============================================

const orderItemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  product_name: z.string().min(1),
  quantity: z.coerce.number().positive('Cantidad debe ser mayor a 0'),
  unit_price: z.coerce.number().min(0),
});

const createOrderSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  vendor_id: z.string().uuid().nullable().optional(),
  currency_id: z.string().uuid('Moneda requerida'),
  discount_amount: z.coerce.number().min(0).default(0),
  delivery_address: z.string().trim().max(500).optional().nullable(),
  delivery_notes: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z.array(orderItemSchema).min(1, 'Al menos un producto'),
  idempotency_key: z.string().min(8),
});

const statusChangeSchema = z.object({
  new_status: z.enum([
    'pendiente',
    'confirmado',
    'preparando',
    'enviado',
    'entregado',
    'cancelado',
    'devuelto',
  ]),
  notes: z.string().trim().max(500).optional().nullable(),
});

export interface ActionState {
  error: string | null;
  success: boolean;
  timestamp: number;
  fieldErrors?: Record<string, string>;
  orderId?: string;
  orderNumber?: string;
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
// CREAR PEDIDO (con reserva de stock vía RPC)
// ============================================

export async function createOrderAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  let items: unknown[] = [];
  try {
    items = JSON.parse(String(formData.get('items') ?? '[]'));
  } catch {
    return { error: 'Items invalidos', success: false, timestamp: Date.now() };
  }

  const raw = {
    customer_id: formData.get('customer_id') || null,
    vendor_id: formData.get('vendor_id') || null,
    currency_id: formData.get('currency_id'),
    discount_amount: formData.get('discount_amount') ?? 0,
    delivery_address: formData.get('delivery_address') || null,
    delivery_notes: formData.get('delivery_notes') || null,
    notes: formData.get('notes') || null,
    items,
    idempotency_key: formData.get('idempotency_key'),
  };

  const parsed = createOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { data, error } = await supabase.rpc('create_order', {
    p_customer_id: parsed.data.customer_id || null,
    p_vendor_id: parsed.data.vendor_id || null,
    p_currency_id: parsed.data.currency_id,
    p_items: parsed.data.items,
    p_discount_amount: parsed.data.discount_amount,
    p_delivery_address: parsed.data.delivery_address || null,
    p_delivery_notes: parsed.data.delivery_notes || null,
    p_notes: parsed.data.notes || null,
    p_idempotency_key: parsed.data.idempotency_key,
  });

  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  const { data: order } = await supabase
    .from('orders')
    .select('order_number')
    .eq('id', data)
    .single();

  revalidatePath('/admin/pedidos');
  revalidatePath('/admin/inventario/reservas');
  revalidatePath('/admin/dashboard');

  return {
    error: null,
    success: true,
    timestamp: Date.now(),
    orderId: data as string,
    orderNumber: order?.order_number ?? '',
  };
}

// ============================================
// CAMBIAR ESTADO DEL PEDIDO
// ============================================

export async function changeOrderStatusAction(
  orderId: string,
  newStatus: z.infer<typeof statusChangeSchema>['new_status'],
  notes?: string
): Promise<ActionState> {
  const supabase = await createClient();

  const parsed = statusChangeSchema.safeParse({
    new_status: newStatus,
    notes: notes || null,
  });

  if (!parsed.success) {
    return {
      error: 'Datos invalidos',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single();

  if (fetchErr || !order) {
    return {
      error: 'Pedido no encontrado',
      success: false,
      timestamp: Date.now(),
    };
  }

  const oldStatus = order.status;
  const allowed = getAllowedTransitions(oldStatus);
  if (!allowed.includes(newStatus)) {
    return {
      error: `No se puede cambiar de "${oldStatus}" a "${newStatus}"`,
      success: false,
      timestamp: Date.now(),
    };
  }

  const userRes = await supabase.auth.getUser();
  const userId = userRes.data.user?.id ?? null;

  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (newStatus === 'confirmado')
    updatePayload.confirmed_at = new Date().toISOString();
  if (newStatus === 'entregado')
    updatePayload.delivered_at = new Date().toISOString();
  if (newStatus === 'cancelado')
    updatePayload.cancelled_at = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', orderId);

  if (updateErr) {
    return { error: updateErr.message, success: false, timestamp: Date.now() };
  }

  // Efectos en inventario
  try {
    if (newStatus === 'confirmado') {
      const { data: reservations } = await supabase
        .from('inventory_reservations')
        .select('id')
        .eq('reference_type', 'order')
        .eq('reference_id', orderId)
        .eq('status', 'activa');

      for (const res of reservations ?? []) {
        await supabase.rpc('confirm_inventory_reservation', {
          p_reservation_id: res.id,
          p_reason: `Pedido confirmado: ${orderId}`,
        });
      }
    }

    if (newStatus === 'cancelado') {
      const { data: reservations } = await supabase
        .from('inventory_reservations')
        .select('id')
        .eq('reference_type', 'order')
        .eq('reference_id', orderId)
        .eq('status', 'activa');

      for (const res of reservations ?? []) {
        await supabase.rpc('release_inventory_reservation', {
          p_reservation_id: res.id,
          p_reason: `Pedido cancelado: ${orderId}`,
        });
      }
    }
  } catch (invErr) {
    console.error('Error en inventario:', invErr);
  }

  await supabase.from('order_status_history').insert({
    order_id: orderId,
    old_status: oldStatus,
    new_status: newStatus,
    changed_by: userId,
    notes: notes || null,
  });

  revalidatePath('/admin/pedidos');
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath('/admin/inventario/reservas');
  revalidatePath('/admin/dashboard');

  return { error: null, success: true, timestamp: Date.now() };
}

function getAllowedTransitions(current: string): string[] {
  const map: Record<string, string[]> = {
    pendiente: ['confirmado', 'cancelado'],
    confirmado: ['preparando', 'cancelado'],
    preparando: ['enviado', 'cancelado'],
    enviado: ['entregado', 'devuelto'],
    entregado: ['devuelto'],
    cancelado: [],
    devuelto: [],
  };
  return map[current] ?? [];
}

// ============================================
// EXPORTAR PEDIDOS A EXCEL (.xlsx)
// ============================================

export async function exportOrdersExcelAction(filters: {
  from?: string;
  to?: string;
  status?: string;
  currency_id?: string;
  vendor_id?: string;
  customer_id?: string;
}): Promise<{ fileBase64?: string; filename?: string; error?: string }> {
  const supabase = await createClient();

  let query = supabase
    .from('orders')
    .select(
      `order_number, created_at, status, subtotal, discount_amount, total,
       base_total, currency:currencies!currency_id(code),
       base_currency:currencies!base_currency_id(code),
       exchange_rate_value,
       customer:customers(full_name),
       vendor:vendors(code, profile:profiles!profile_id(full_name))`
    )
    .order('created_at', { ascending: false })
    .limit(10000);

  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', filters.to);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.currency_id) query = query.eq('currency_id', filters.currency_id);
  if (filters.vendor_id) query = query.eq('vendor_id', filters.vendor_id);
  if (filters.customer_id) query = query.eq('customer_id', filters.customer_id);

  const { data, error } = await query;
  if (error) return { error: error.message };

  // --------------------------------------------
  // Preparar filas planas
  // --------------------------------------------
  const rows = (data ?? []).map((o) => {
    const row = o as unknown as {
      order_number: string;
      created_at: string;
      status: string;
      subtotal: number;
      discount_amount: number;
      total: number;
      base_total: number;
      currency?: { code?: string } | null;
      base_currency?: { code?: string } | null;
      exchange_rate_value: number;
      customer?: { full_name?: string } | null;
      vendor?: { code?: string; profile?: { full_name?: string } } | null;
    };

    return {
      order_number: row.order_number,
      created_at: row.created_at,
      status: row.status,
      customer_name: row.customer?.full_name ?? '',
      vendor_name: row.vendor?.profile?.full_name ?? row.vendor?.code ?? '',
      currency: row.currency?.code ?? '',
      exchange_rate: Number(row.exchange_rate_value),
      subtotal: Number(row.subtotal),
      discount_amount: Number(row.discount_amount),
      total: Number(row.total),
      base_currency: row.base_currency?.code ?? '',
      base_total: Number(row.base_total),
    };
  });

  // --------------------------------------------
  // Totales
  // --------------------------------------------
  const totalOriginal = rows.reduce((sum, r) => sum + r.total, 0);
  const totalBase = rows.reduce((sum, r) => sum + r.base_total, 0);
  const baseCurrencyCode = rows[0]?.base_currency ?? '';

  const totals: Record<string, string | number> = {
    order_number: 'TOTALES',
    total: totalOriginal,
    base_total: totalBase,
  };

  // --------------------------------------------
  // Construir workbook
  // --------------------------------------------
  const { buildExcelWorkbook, workbookToBuffer } = await import(
    '@/lib/utils/excel'
  );

  const wb = buildExcelWorkbook({
    name: 'Pedidos',
    columns: [
      { header: 'Número', key: 'order_number', width: 20 },
      { header: 'Fecha', key: 'created_at', type: 'datetime', width: 20 },
      { header: 'Estado', key: 'status', type: 'status', width: 14 },
      { header: 'Cliente', key: 'customer_name', width: 24 },
      { header: 'Vendedor', key: 'vendor_name', width: 24 },
      { header: 'Moneda', key: 'currency', width: 10 },
      { header: 'T. cambio', key: 'exchange_rate', type: 'number', width: 14 },
      { header: 'Subtotal', key: 'subtotal', type: 'currency', width: 14 },
      { header: 'Descuento', key: 'discount_amount', type: 'currency', width: 14 },
      { header: 'Total original', key: 'total', type: 'currency', width: 16 },
      { header: 'Moneda base', key: 'base_currency', width: 12 },
      {
        header: 'Total base',
        key: 'base_total',
        type: 'currency',
        currencyCode: baseCurrencyCode,
        width: 16,
      },
    ],
    rows,
    statusMap: {
      pendiente: 'info',
      confirmado: 'info',
      preparando: 'warning',
      enviado: 'info',
      entregado: 'success',
      cancelado: 'error',
      devuelto: 'warning',
    },
    totals,
  });

  const buffer = await workbookToBuffer(wb);
  const fileBase64 = Buffer.from(buffer).toString('base64');

  return {
    fileBase64,
    filename: `pedidos-${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}