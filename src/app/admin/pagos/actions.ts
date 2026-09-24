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