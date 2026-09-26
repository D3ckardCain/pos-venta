'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// ============================================
// SCHEMAS
// ============================================
const payVendorSchema = z.object({
  vendor_id: z.string().uuid('Vendedor inválido'),
  payment_currency_id: z.string().uuid('Moneda de pago inválida'),
  payment_method: z.enum(['efectivo', 'transferencia', 'otro']),
  notes: z.string().trim().max(500).optional().nullable(),
});

export interface ActionState {
  error: string | null;
  success: boolean;
  timestamp: number;
  fieldErrors?: Record<string, string>;
  paymentId?: string;
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
// PAGAR A UN VENDEDOR/MENSAJERO
// ============================================
export async function payVendorAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const raw = {
    vendor_id: formData.get('vendor_id'),
    payment_currency_id: formData.get('payment_currency_id'),
    payment_method: formData.get('payment_method'),
    notes: formData.get('notes') || null,
  };

  const parsed = payVendorSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: 'Revisa los campos',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { data, error } = await supabase.rpc('pay_vendor', {
    p_vendor_id: parsed.data.vendor_id,
    p_payment_currency_id: parsed.data.payment_currency_id,
    p_payment_method: parsed.data.payment_method,
    p_notes: parsed.data.notes || null,
  });

  if (error) {
    return {
      error: error.message,
      success: false,
      timestamp: Date.now(),
    };
  }

  revalidatePath('/admin/pagos');
  revalidatePath('/admin/vendedores');
  revalidatePath(`/admin/vendedores/${parsed.data.vendor_id}`);

  return {
    error: null,
    success: true,
    timestamp: Date.now(),
    paymentId: data,
  };
}

// ============================================
// EXPORTAR PAGOS A EXCEL (.xlsx)
// Devuelve el binario como base64 para evitar
// la corrupción de Uint8Array en Server Actions.
// ============================================
export async function exportPaymentsExcelAction(filters: {
  vendor_id?: string;
  currency_id?: string;
  payment_method?: string;
  from?: string;
  to?: string;
}): Promise<{ fileBase64?: string; filename?: string; error?: string }> {
  const supabase = await createClient();

  let query = supabase
    .from('vendor_payments')
    .select(
      `id, paid_at, amount_base, amount_paid, exchange_rate_value,
       payment_method, notes,
       vendor:vendors(id, code, type, profile:profiles!profile_id(full_name, email)),
       base_currency:currencies!base_currency_id(code),
       paid_currency:currencies!paid_currency_id(code),
       paid_by_user:profiles!paid_by(full_name, email)`
    )
    .order('paid_at', { ascending: false })
    .limit(10000);

  if (filters.vendor_id) query = query.eq('vendor_id', filters.vendor_id);
  if (filters.currency_id) query = query.eq('paid_currency_id', filters.currency_id);
  if (filters.payment_method) query = query.eq('payment_method', filters.payment_method);
  if (filters.from) query = query.gte('paid_at', filters.from);
  if (filters.to) query = query.lte('paid_at', filters.to);

  const { data, error } = await query;
  if (error) return { error: error.message };

  // --------------------------------------------
  // Preparar filas para Excel
  // --------------------------------------------
  const rows = (data ?? []).map((p) => {
    const row = p as unknown as {
      paid_at: string;
      amount_base: number;
      amount_paid: number;
      exchange_rate_value: number;
      payment_method: string;
      notes: string | null;
      vendor?: {
        code?: string | null;
        type?: string;
        profile?: { full_name?: string; email?: string } | null;
      } | null;
      base_currency?: { code?: string } | null;
      paid_currency?: { code?: string } | null;
      paid_by_user?: { full_name?: string; email?: string } | null;
    };

    return {
      paid_at: row.paid_at,
      vendor_name: row.vendor?.profile?.full_name ?? '',
      vendor_email: row.vendor?.profile?.email ?? '',
      vendor_code: row.vendor?.code ?? '',
      vendor_type: row.vendor?.type ?? '',
      amount_paid: Number(row.amount_paid),
      paid_currency: row.paid_currency?.code ?? '',
      amount_base: Number(row.amount_base),
      base_currency: row.base_currency?.code ?? '',
      exchange_rate: Number(row.exchange_rate_value),
      payment_method: row.payment_method,
      paid_by: row.paid_by_user?.full_name ?? row.paid_by_user?.email ?? '',
      notes: row.notes ?? '',
    };
  });

  // --------------------------------------------
  // Totales
  // --------------------------------------------
  const totalBase = rows.reduce((sum, r) => sum + r.amount_base, 0);
  const baseCurrencyCode = rows[0]?.base_currency ?? '';

  const totals: Record<string, string | number> = {
    paid_at: 'TOTALES',
    amount_base: totalBase,
  };

  // --------------------------------------------
  // Construir workbook
  // --------------------------------------------
  const { buildExcelWorkbook, workbookToBuffer } = await import(
    '@/lib/utils/excel'
  );

  const wb = buildExcelWorkbook({
    name: 'Pagos',
    columns: [
      { header: 'Fecha', key: 'paid_at', type: 'datetime', width: 20 },
      { header: 'Vendedor/Mensajero', key: 'vendor_name', width: 26 },
      { header: 'Email', key: 'vendor_email', width: 26 },
      { header: 'Código', key: 'vendor_code', width: 12 },
      {
        header: 'Tipo',
        key: 'vendor_type',
        type: 'status',
        width: 12,
      },
      { header: 'Monto pagado', key: 'amount_paid', type: 'currency', width: 16 },
      { header: 'Moneda', key: 'paid_currency', width: 10 },
      {
        header: 'Monto base',
        key: 'amount_base',
        type: 'currency',
        currencyCode: baseCurrencyCode,
        width: 16,
      },
      { header: 'Moneda base', key: 'base_currency', width: 12 },
      { header: 'T. cambio', key: 'exchange_rate', type: 'number', width: 14 },
      { header: 'Forma de pago', key: 'payment_method', width: 16 },
      { header: 'Pagado por', key: 'paid_by', width: 22 },
      { header: 'Notas', key: 'notes', width: 32 },
    ],
    rows,
    statusMap: {
      vendedor: 'info',
      mensajero: 'warning',
      ambos: 'success',
    },
    totals,
  });

  const buffer = await workbookToBuffer(wb);

  // --------------------------------------------
  // Convertir a base64 (evita corrupción en Server Actions)
  // --------------------------------------------
  const fileBase64 = Buffer.from(buffer).toString('base64');

  return {
    fileBase64,
    filename: `pagos-${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}