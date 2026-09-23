'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const exchangeRateSchema = z.object({
  from_currency_id: z.string().uuid('Moneda origen invalida'),
  to_currency_id: z.string().uuid('Moneda destino invalida'),
  rate: z.coerce
    .number()
    .positive('El tipo de cambio debe ser mayor a 0')
    .max(1_000_000, 'Tipo de cambio demasiado alto'),
  valid_from: z.string().min(1, 'Fecha de vigencia requerida'),
  valid_until: z.string().optional().nullable(),
  source: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  is_active: z.coerce.boolean().default(true),
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

function parseForm(formData: FormData) {
  return {
    from_currency_id: formData.get('from_currency_id'),
    to_currency_id: formData.get('to_currency_id'),
    rate: formData.get('rate'),
    valid_from: formData.get('valid_from'),
    valid_until: formData.get('valid_until') || null,
    source: formData.get('source') || null,
    notes: formData.get('notes') || null,
    is_active: formData.get('is_active') === 'on',
  };
}

export async function createExchangeRateAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const parsed = exchangeRateSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  if (parsed.data.from_currency_id === parsed.data.to_currency_id) {
    return {
      error: 'Las monedas origen y destino deben ser diferentes',
      success: false,
      timestamp: Date.now(),
    };
  }

  const { error } = await supabase.from('exchange_rates').insert({
    ...parsed.data,
    valid_from: new Date(parsed.data.valid_from).toISOString(),
    valid_until: parsed.data.valid_until
      ? new Date(parsed.data.valid_until).toISOString()
      : null,
  });

  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  revalidatePath('/admin/tipos-cambio');
  revalidatePath('/admin/monedas');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function updateExchangeRateAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const id = String(formData.get('id') ?? '');
  if (!id)
    return { error: 'ID requerido', success: false, timestamp: Date.now() };

  const parsed = exchangeRateSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  if (parsed.data.from_currency_id === parsed.data.to_currency_id) {
    return {
      error: 'Las monedas origen y destino deben ser diferentes',
      success: false,
      timestamp: Date.now(),
    };
  }

  const { error } = await supabase
    .from('exchange_rates')
    .update({
      ...parsed.data,
      valid_from: new Date(parsed.data.valid_from).toISOString(),
      valid_until: parsed.data.valid_until
        ? new Date(parsed.data.valid_until).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  revalidatePath('/admin/tipos-cambio');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function toggleExchangeRateAction(
  id: string,
  isActive: boolean
): Promise<ActionState> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('exchange_rates')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  revalidatePath('/admin/tipos-cambio');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function deleteExchangeRateAction(
  id: string
): Promise<ActionState> {
  const supabase = await createClient();

  const { error } = await supabase.from('exchange_rates').delete().eq('id', id);

  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  revalidatePath('/admin/tipos-cambio');
  return { error: null, success: true, timestamp: Date.now() };
}