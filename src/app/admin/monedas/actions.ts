'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const currencySchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Debe ser un codigo ISO 4217 de 3 letras'),
  name: z.string().trim().min(1, 'Nombre requerido').max(80),
  symbol: z.string().trim().min(1, 'Simbolo requerido').max(8),
  decimals: z.coerce.number().int().min(0).max(6),
  decimal_separator: z.string().min(1).max(2),
  thousand_separator: z.string().min(1).max(2),
  symbol_position: z.enum(['before', 'after']),
  is_active: z.coerce.boolean().default(true),
  usable_in_sales: z.coerce.boolean().default(true),
  usable_in_purchases: z.coerce.boolean().default(true),
  usable_in_cash: z.coerce.boolean().default(true),
  usable_in_catalog: z.coerce.boolean().default(true),
  usable_by_customers: z.coerce.boolean().default(true),
  usable_by_vendors: z.coerce.boolean().default(true),
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

function parseCurrencyForm(formData: FormData) {
  return {
    code: formData.get('code'),
    name: formData.get('name'),
    symbol: formData.get('symbol'),
    decimals: formData.get('decimals'),
    decimal_separator: formData.get('decimal_separator'),
    thousand_separator: formData.get('thousand_separator'),
    symbol_position: formData.get('symbol_position'),
    is_active: formData.get('is_active') === 'on',
    usable_in_sales: formData.get('usable_in_sales') === 'on',
    usable_in_purchases: formData.get('usable_in_purchases') === 'on',
    usable_in_cash: formData.get('usable_in_cash') === 'on',
    usable_in_catalog: formData.get('usable_in_catalog') === 'on',
    usable_by_customers: formData.get('usable_by_customers') === 'on',
    usable_by_vendors: formData.get('usable_by_vendors') === 'on',
  };
}

export async function createCurrencyAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const parsed = currencySchema.safeParse(parseCurrencyForm(formData));
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { error } = await supabase.from('currencies').insert(parsed.data);

  if (error) {
    if (error.code === '23505') {
      return {
        error: 'Ya existe una moneda con ese codigo',
        success: false,
        timestamp: Date.now(),
      };
    }
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  revalidatePath('/admin/monedas');
  revalidatePath('/admin/tipos-cambio');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function updateCurrencyAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const id = String(formData.get('id') ?? '');
  if (!id)
    return { error: 'ID requerido', success: false, timestamp: Date.now() };

  const parsed = currencySchema.safeParse(parseCurrencyForm(formData));
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { error } = await supabase
    .from('currencies')
    .update(parsed.data)
    .eq('id', id);

  if (error) {
    if (error.code === '23505') {
      return {
        error: 'Ya existe una moneda con ese codigo',
        success: false,
        timestamp: Date.now(),
      };
    }
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  revalidatePath('/admin/monedas');
  revalidatePath('/admin/tipos-cambio');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function deleteCurrencyAction(id: string): Promise<ActionState> {
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from('currency_settings')
    .select('primary_currency_id')
    .eq('is_singleton', true)
    .single();

  if (settings?.primary_currency_id === id) {
    return {
      error:
        'No puedes eliminar la moneda principal. Cambia la principal primero.',
      success: false,
      timestamp: Date.now(),
    };
  }

  const { count: salesCount } = await supabase
    .from('sales')
    .select('id', { count: 'exact', head: true })
    .eq('currency_id', id);

  const { count: ordersCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('currency_id', id);

  if ((salesCount ?? 0) > 0 || (ordersCount ?? 0) > 0) {
    const { error } = await supabase
      .from('currencies')
      .update({ is_active: false })
      .eq('id', id);
    if (error)
      return { error: error.message, success: false, timestamp: Date.now() };
    revalidatePath('/admin/monedas');
    return { error: null, success: true, timestamp: Date.now() };
  }

  const { count: ratesFrom } = await supabase
    .from('exchange_rates')
    .select('id', { count: 'exact', head: true })
    .eq('from_currency_id', id);

  const { count: ratesTo } = await supabase
    .from('exchange_rates')
    .select('id', { count: 'exact', head: true })
    .eq('to_currency_id', id);

  if ((ratesFrom ?? 0) > 0 || (ratesTo ?? 0) > 0) {
    return {
      error: `No se puede eliminar: hay ${ratesFrom ?? 0} tipo(s) de cambio usando esta moneda como origen y ${ratesTo ?? 0} como destino. Elimina o desactiva esos tipos de cambio primero.`,
      success: false,
      timestamp: Date.now(),
    };
  }

  const { error } = await supabase.from('currencies').delete().eq('id', id);
  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  revalidatePath('/admin/monedas');
  revalidatePath('/admin/tipos-cambio');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function setPrimaryCurrencyAction(
  currencyId: string
): Promise<ActionState> {
  const supabase = await createClient();

  const { data: currency, error: currencyError } = await supabase
    .from('currencies')
    .select('id, is_active')
    .eq('id', currencyId)
    .single();

  if (currencyError || !currency) {
    return {
      error: 'Moneda no encontrada',
      success: false,
      timestamp: Date.now(),
    };
  }

  if (!currency.is_active) {
    return {
      error: 'La moneda debe estar activa para ser principal',
      success: false,
      timestamp: Date.now(),
    };
  }

  const { error } = await supabase
    .from('currency_settings')
    .update({
      primary_currency_id: currencyId,
      updated_at: new Date().toISOString(),
    })
    .eq('is_singleton', true);

  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  revalidatePath('/admin/monedas');
  revalidatePath('/admin/tipos-cambio');
  revalidatePath('/admin/dashboard');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function toggleCurrencyActiveAction(
  id: string,
  isActive: boolean
): Promise<ActionState> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('currencies')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  revalidatePath('/admin/monedas');
  return { error: null, success: true, timestamp: Date.now() };
}