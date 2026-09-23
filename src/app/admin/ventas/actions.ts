'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// ============================================
// SCHEMAS
// ============================================

const saleItemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  product_name: z.string().min(1),
  quantity: z.coerce.number().positive('Cantidad debe ser mayor a 0'),
  unit_price: z.coerce.number().min(0),
  unit_cost: z.coerce.number().min(0).default(0),
  discount_amount: z.coerce.number().min(0).default(0),
});

const createSaleSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  vendor_id: z.string().uuid().nullable().optional(),
  currency_id: z.string().uuid('Moneda requerida'),
  payment_method_id: z.string().uuid('Metodo de pago requerido'),
  cash_register_id: z.string().uuid().nullable().optional(),
  discount_amount: z.coerce.number().min(0).default(0),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z.array(saleItemSchema).min(1, 'Al menos un producto'),
  idempotency_key: z.string().min(8),
});

const parkedSaleSchema = z.object({
  name: z.string().trim().min(1, 'Nombre requerido').max(120),
  customer_id: z.string().uuid().nullable().optional(),
  vendor_id: z.string().uuid().nullable().optional(),
  currency_id: z.string().uuid(),
  payment_method_id: z.string().uuid().nullable().optional(),
  cash_register_id: z.string().uuid().nullable().optional(),
  discount_amount: z.coerce.number().min(0).default(0),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z.array(saleItemSchema).min(1, 'Al menos un producto'),
});

export interface ActionState {
  error: string | null;
  success: boolean;
  timestamp: number;
  fieldErrors?: Record<string, string>;
  saleId?: string;
  saleNumber?: string;
  parkedId?: string;
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
// CREAR VENTA (usa RPC create_sale)
// ============================================

export async function createSaleAction(
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
    payment_method_id: formData.get('payment_method_id'),
    cash_register_id: formData.get('cash_register_id') || null,
    discount_amount: formData.get('discount_amount') ?? 0,
    notes: formData.get('notes') || null,
    items,
    idempotency_key: formData.get('idempotency_key'),
  };

  const parsed = createSaleSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { data, error } = await supabase.rpc('create_sale', {
    p_customer_id: parsed.data.customer_id || null,
    p_vendor_id: parsed.data.vendor_id || null,
    p_currency_id: parsed.data.currency_id,
    p_items: parsed.data.items,
    p_payment_method_id: parsed.data.payment_method_id,
    p_cash_register_id: parsed.data.cash_register_id || null,
    p_discount_amount: parsed.data.discount_amount,
    p_notes: parsed.data.notes || null,
    p_idempotency_key: parsed.data.idempotency_key,
  });

  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  const { data: sale } = await supabase
    .from('sales')
    .select('sale_number')
    .eq('id', data)
    .single();

  // Registrar movimiento de caja si aplica
  try {
    await maybeRegisterCashMovement(data as string);
  } catch (err) {
    console.error('[createSaleAction] Error al registrar movimiento de caja:', err);
  }

  // Si la venta fue retomada desde parked_sales, eliminar el parked
  const parkedId = formData.get('parked_sale_id');
  if (parkedId) {
    await supabase.from('parked_sales').delete().eq('id', String(parkedId));
  }

  revalidatePath('/admin/ventas');
  revalidatePath('/admin/ventas/parked');
  revalidatePath('/admin/dashboard');
  revalidatePath('/admin/inventario');
  revalidatePath('/admin/cajas');

  return {
    error: null,
    success: true,
    timestamp: Date.now(),
    saleId: data as string,
    saleNumber: sale?.sale_number ?? '',
  };
}

// ============================================
// REGISTRAR MOVIMIENTO EN CAJA SI APLICA
// ============================================

async function maybeRegisterCashMovement(saleId: string) {
  const supabase = await createClient();

  const { data: sale } = await supabase
    .from('sales')
    .select(
      `id, total, currency_id, cash_register_id,
       payment_method:payment_methods!payment_method_id(code)`
    )
    .eq('id', saleId)
    .single();

  if (!sale) return;

  const paymentCode = (sale as unknown as {
    payment_method?: { code?: string } | null;
  }).payment_method?.code;

  if (paymentCode !== 'cash') return;

  let sessionQuery = supabase
    .from('cash_sessions')
    .select('id, currency_id')
    .eq('currency_id', sale.currency_id)
    .eq('status', 'abierta');

  if (sale.cash_register_id) {
    sessionQuery = sessionQuery.eq('cash_register_id', sale.cash_register_id);
  }

  const { data: session } = await sessionQuery
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return;

  const { data: lastMovement } = await supabase
    .from('cash_movements')
    .select('balance_after')
    .eq('cash_session_id', session.id)
    .neq('movement_type', 'cierre')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentBalance = Number(lastMovement?.balance_after ?? 0);
  const amount = Number(sale.total);
  const newBalance = currentBalance + amount;

  await supabase.from('cash_movements').insert({
    cash_session_id: session.id,
    movement_type: 'venta',
    currency_id: sale.currency_id,
    amount,
    balance_after: newBalance,
    reference_type: 'sale',
    reference_id: sale.id,
    description: `Venta en efectivo registrada`,
  });
}

// ============================================
// CANCELAR VENTA
// ============================================

export async function cancelSaleAction(
  saleId: string,
  reason: string
): Promise<ActionState> {
  const supabase = await createClient();

  if (!reason || reason.trim().length < 3) {
    return {
      error: 'El motivo es obligatorio (minimo 3 caracteres)',
      success: false,
      timestamp: Date.now(),
    };
  }

  const { error } = await supabase.rpc('cancel_sale', {
    p_sale_id: saleId,
    p_reason: reason.trim(),
  });

  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  revalidatePath('/admin/ventas');
  revalidatePath(`/admin/ventas/${saleId}`);
  revalidatePath('/admin/inventario');
  revalidatePath('/admin/dashboard');
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// GUARDAR VENTA EN ESPERA (parked_sales)
// ============================================

export async function parkSaleAction(
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
    name: formData.get('name'),
    customer_id: formData.get('customer_id') || null,
    vendor_id: formData.get('vendor_id') || null,
    currency_id: formData.get('currency_id'),
    payment_method_id: formData.get('payment_method_id') || null,
    cash_register_id: formData.get('cash_register_id') || null,
    discount_amount: formData.get('discount_amount') ?? 0,
    notes: formData.get('notes') || null,
    items,
  };

  const parsed = parkedSaleSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const userRes = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('parked_sales')
    .insert({
      name: parsed.data.name,
      customer_id: parsed.data.customer_id || null,
      vendor_id: parsed.data.vendor_id || null,
      currency_id: parsed.data.currency_id,
      payment_method_id: parsed.data.payment_method_id || null,
      cash_register_id: parsed.data.cash_register_id || null,
      items: parsed.data.items,
      discount_amount: parsed.data.discount_amount,
      notes: parsed.data.notes || null,
      created_by: userRes.data.user?.id ?? null,
    })
    .select('id')
    .single();

  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  revalidatePath('/admin/ventas');
  revalidatePath('/admin/ventas/parked');
  return {
    error: null,
    success: true,
    timestamp: Date.now(),
    parkedId: data.id,
  };
}

// ============================================
// ACTUALIZAR VENTA EN ESPERA
// ============================================

export async function updateParkedSaleAction(
  parkedId: string,
  data: {
    name: string;
    customer_id: string | null;
    vendor_id: string | null;
    currency_id: string;
    payment_method_id: string | null;
    cash_register_id: string | null;
    discount_amount: number;
    notes: string | null;
    items: unknown[];
  }
): Promise<ActionState> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('parked_sales')
    .update({
      name: data.name,
      customer_id: data.customer_id,
      vendor_id: data.vendor_id,
      currency_id: data.currency_id,
      payment_method_id: data.payment_method_id,
      cash_register_id: data.cash_register_id,
      items: data.items,
      discount_amount: data.discount_amount,
      notes: data.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parkedId);

  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  revalidatePath('/admin/ventas');
  revalidatePath('/admin/ventas/parked');
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// ELIMINAR VENTA EN ESPERA
// ============================================

export async function deleteParkedSaleAction(
  parkedId: string
): Promise<ActionState> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('parked_sales')
    .delete()
    .eq('id', parkedId);

  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  revalidatePath('/admin/ventas');
  revalidatePath('/admin/ventas/parked');
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// BUSCAR PRODUCTO POR CÓDIGO DE BARRAS
// ============================================

export async function findByBarcodeAction(
  barcode: string
): Promise<{
  product?: {
    id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
    unit: string;
    cost: number;
    base_price: number;
    has_variants: boolean;
    inventory?: {
      id: string;
      variant_id: string | null;
      stock: number;
      reserved: number;
      available: number;
    }[];
    variants?: {
      id: string;
      name: string;
      sku: string | null;
      base_price: number | null;
      cost: number | null;
    }[];
    prices_by_currency?: {
      id: string;
      currency_id: string;
      price: number;
      variant_id: string | null;
    }[];
  };
  error?: string;
}> {
  const supabase = await createClient();

  if (!barcode.trim()) return { error: 'Codigo vacio' };

  const { data, error } = await supabase
    .from('products')
    .select(
      `id, name, sku, barcode, unit, cost, base_price, has_variants,
       inventory:inventory(id, variant_id, stock, reserved, available),
       variants:product_variants(id, name, sku, base_price, cost),
       prices_by_currency:prices_by_currency(id, currency_id, price, variant_id)`
    )
    .or(`barcode.eq.${barcode},sku.eq.${barcode}`)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'Producto no encontrado' };

  return { product: data as never };
}

// ============================================
// EXPORTAR VENTAS A CSV
// ============================================

export async function exportSalesCsvAction(filters: {
  from?: string;
  to?: string;
  status?: string;
  currency_id?: string;
  payment_method_id?: string;
  vendor_id?: string;
  customer_id?: string;
}): Promise<{ csv?: string; filename?: string; error?: string }> {
  const supabase = await createClient();

  let query = supabase
    .from('sales')
    .select(
      `sale_number, created_at, status, subtotal, discount_amount, total,
       base_total, base_profit, currency:currencies!currency_id(code),
       base_currency:currencies!base_currency_id(code),
       exchange_rate_value,
       customer:customers(full_name),
       vendor:vendors(code, profile:profiles!profile_id(full_name)),
       payment_method:payment_methods(name)`
    )
    .order('created_at', { ascending: false })
    .limit(10000);

  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', filters.to);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.currency_id) query = query.eq('currency_id', filters.currency_id);
  if (filters.payment_method_id)
    query = query.eq('payment_method_id', filters.payment_method_id);
  if (filters.vendor_id) query = query.eq('vendor_id', filters.vendor_id);
  if (filters.customer_id) query = query.eq('customer_id', filters.customer_id);

  const { data, error } = await query;
  if (error) return { error: error.message };

  const rows: string[] = [];
  rows.push(
    [
      'Numero',
      'Fecha',
      'Estado',
      'Cliente',
      'Vendedor',
      'Metodo de pago',
      'Moneda',
      'Tipo de cambio',
      'Subtotal',
      'Descuento',
      'Total original',
      'Moneda base',
      'Total base',
      'Utilidad base',
    ].join(',')
  );

  for (const s of data ?? []) {
    const row = s as unknown as {
      sale_number: string;
      created_at: string;
      status: string;
      subtotal: number;
      discount_amount: number;
      total: number;
      base_total: number;
      base_profit: number;
      currency?: { code?: string };
      base_currency?: { code?: string };
      exchange_rate_value: number;
      customer?: { full_name?: string } | null;
      vendor?: { code?: string; profile?: { full_name?: string } } | null;
      payment_method?: { name?: string } | null;
    };
    rows.push(
      [
        csvEscape(row.sale_number),
        new Date(row.created_at).toISOString(),
        row.status,
        csvEscape(row.customer?.full_name ?? ''),
        csvEscape(row.vendor?.profile?.full_name ?? row.vendor?.code ?? ''),
        csvEscape(row.payment_method?.name ?? ''),
        csvEscape(row.currency?.code ?? ''),
        Number(row.exchange_rate_value).toFixed(8),
        Number(row.subtotal).toFixed(4),
        Number(row.discount_amount).toFixed(4),
        Number(row.total).toFixed(4),
        csvEscape(row.base_currency?.code ?? ''),
        Number(row.base_total).toFixed(4),
        Number(row.base_profit).toFixed(4),
      ].join(',')
    );
  }

  return {
    csv: rows.join('\n'),
    filename: `ventas-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}