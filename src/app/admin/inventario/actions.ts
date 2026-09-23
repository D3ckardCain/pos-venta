'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const adjustSchema = z.object({
  product_id: z.string().uuid('Producto invalido'),
  variant_id: z.string().uuid().optional().nullable().or(z.literal('')),
  new_stock: z.coerce
    .number()
    .min(0, 'El stock no puede ser negativo')
    .max(1_000_000_000, 'Valor demasiado alto'),
  reason: z
    .string()
    .trim()
    .min(3, 'El motivo es obligatorio (minimo 3 caracteres)')
    .max(500),
  idempotency_key: z.string().trim().min(8).max(120),
});

export interface ActionState {
  error: string | null;
  success: boolean;
  timestamp: number;
  fieldErrors?: Record<string, string>;
  movementId?: string;
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
// AJUSTAR INVENTARIO (usa RPC adjust_inventory)
// ============================================

export async function adjustInventoryAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const raw = {
    product_id: formData.get('product_id'),
    variant_id: formData.get('variant_id') || null,
    new_stock: formData.get('new_stock'),
    reason: formData.get('reason'),
    idempotency_key:
      formData.get('idempotency_key') ??
      `adj-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };

  const parsed = adjustSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { error } = await supabase.rpc('adjust_inventory', {
    p_product_id: parsed.data.product_id,
    p_variant_id: parsed.data.variant_id || null,
    p_new_stock: parsed.data.new_stock,
    p_reason: parsed.data.reason,
    p_idempotency_key: parsed.data.idempotency_key,
  });

  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  revalidatePath('/admin/inventario');
  revalidatePath('/admin/inventario/kardex');
  revalidatePath('/admin/dashboard');
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// LIBERAR RESERVA MANUALMENTE
// ============================================

export async function releaseReservationAction(
  reservationId: string,
  reason: string
): Promise<ActionState> {
  const supabase = await createClient();

  if (!reason || reason.trim().length < 3) {
    return {
      error: 'Motivo requerido (minimo 3 caracteres)',
      success: false,
      timestamp: Date.now(),
    };
  }

  const { error } = await supabase.rpc('release_inventory_reservation', {
    p_reservation_id: reservationId,
    p_reason: reason.trim(),
  });

  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  revalidatePath('/admin/inventario');
  revalidatePath('/admin/inventario/reservas');
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// RECALCULAR RESERVADO
// ============================================

export async function recalculateReservedAction(): Promise<ActionState> {
  const supabase = await createClient();

  const { data: reservations } = await supabase
    .from('inventory_reservations')
    .select('product_id, variant_id, quantity')
    .eq('status', 'activa');

  const grouped = new Map<string, number>();
  for (const r of reservations ?? []) {
    const key = `${r.product_id}::${r.variant_id ?? 'null'}`;
    grouped.set(key, (grouped.get(key) ?? 0) + Number(r.quantity));
  }

  const { data: inventory } = await supabase
    .from('inventory')
    .select('id, product_id, variant_id, reserved');

  for (const inv of inventory ?? []) {
    const key = `${inv.product_id}::${inv.variant_id ?? 'null'}`;
    const expected = grouped.get(key) ?? 0;
    if (Number(inv.reserved) !== expected) {
      await supabase
        .from('inventory')
        .update({ reserved: expected, updated_at: new Date().toISOString() })
        .eq('id', inv.id);
    }
  }

  revalidatePath('/admin/inventario');
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// EXPORTAR INVENTARIO A CSV
// ============================================

export async function exportInventoryCsvAction(): Promise<{
  csv?: string;
  filename?: string;
  error?: string;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('inventory')
    .select(
      'stock, reserved, available, updated_at, product:products(name, sku, unit, cost, min_stock), variant:product_variants(name, sku)'
    )
    .order('updated_at', { ascending: false });

  if (error) return { error: error.message };

  const rows: string[] = [];
  rows.push(
    [
      'Producto',
      'SKU',
      'Variante',
      'SKU Variante',
      'Unidad',
      'Stock',
      'Reservado',
      'Disponible',
      'Costo Unitario',
      'Valor Total',
      'Stock Minimo',
      'Actualizado',
    ].join(',')
  );

  for (const inv of data ?? []) {
    const p = inv as unknown as {
      product?: { name?: string; sku?: string; unit?: string; cost?: number; min_stock?: number };
      variant?: { name?: string; sku?: string } | null;
      stock: number;
      reserved: number;
      available: number;
      updated_at: string;
    };
    const product = p.product;
    const variant = p.variant;
    const stock = Number(p.stock);
    const cost = Number(product?.cost ?? 0);
    rows.push(
      [
        csvEscape(product?.name ?? ''),
        csvEscape(product?.sku ?? ''),
        csvEscape(variant?.name ?? ''),
        csvEscape(variant?.sku ?? ''),
        csvEscape(product?.unit ?? ''),
        stock.toString(),
        Number(p.reserved).toString(),
        Number(p.available).toString(),
        cost.toFixed(4),
        (stock * cost).toFixed(4),
        Number(product?.min_stock ?? 0).toString(),
        new Date(p.updated_at).toISOString(),
      ].join(',')
    );
  }

  return {
    csv: rows.join('\n'),
    filename: `inventario-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}

// ============================================
// EXPORTAR KARDEX A CSV
// ============================================

export async function exportKardexCsvAction(filters: {
  product_id?: string;
  variant_id?: string;
  movement_type?: string;
  from?: string;
  to?: string;
}): Promise<{ csv?: string; filename?: string; error?: string }> {
  const supabase = await createClient();

  let query = supabase
    .from('inventory_movements')
    .select(
      'created_at, movement_type, quantity, stock_before, stock_after, unit_cost, reference_type, reason, notes, product:products(name, sku), variant:product_variants(name, sku), user:profiles!created_by(full_name, email)'
    )
    .order('created_at', { ascending: false })
    .limit(10000);

  if (filters.product_id) query = query.eq('product_id', filters.product_id);
  if (filters.variant_id) query = query.eq('variant_id', filters.variant_id);
  if (filters.movement_type) query = query.eq('movement_type', filters.movement_type);
  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', filters.to);

  const { data, error } = await query;
  if (error) return { error: error.message };

  const rows: string[] = [];
  rows.push(
    [
      'Fecha',
      'Tipo',
      'Producto',
      'SKU',
      'Variante',
      'Cantidad',
      'Stock Antes',
      'Stock Despues',
      'Costo Unitario',
      'Referencia',
      'Motivo',
      'Notas',
      'Usuario',
    ].join(',')
  );

  for (const m of data ?? []) {
    const row = m as unknown as {
      created_at: string;
      movement_type: string;
      quantity: number;
      stock_before: number;
      stock_after: number;
      unit_cost: number | null;
      reference_type: string | null;
      reason: string | null;
      notes: string | null;
      product?: { name?: string; sku?: string };
      variant?: { name?: string; sku?: string } | null;
      user?: { full_name?: string; email?: string } | null;
    };
    rows.push(
      [
        new Date(row.created_at).toISOString(),
        row.movement_type,
        csvEscape(row.product?.name ?? ''),
        csvEscape(row.product?.sku ?? ''),
        csvEscape(row.variant?.name ?? ''),
        Number(row.quantity).toString(),
        Number(row.stock_before).toString(),
        Number(row.stock_after).toString(),
        row.unit_cost !== null ? Number(row.unit_cost).toFixed(4) : '',
        csvEscape(row.reference_type ?? ''),
        csvEscape(row.reason ?? ''),
        csvEscape(row.notes ?? ''),
        csvEscape(row.user?.full_name ?? row.user?.email ?? ''),
      ].join(',')
    );
  }

  return {
    csv: rows.join('\n'),
    filename: `kardex-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}