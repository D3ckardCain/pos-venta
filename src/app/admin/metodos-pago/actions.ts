'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const methodSchema = z.object({
  name: z.string().trim().min(1, 'Nombre requerido').max(80),
  code: z
    .string()
    .trim()
    .min(1, 'Codigo requerido')
    .max(40)
    .regex(/^[a-z0-9_]+$/, 'Solo minusculas, numeros y guion bajo'),
  is_active: z.coerce.boolean().default(true),
  requires_reference: z.coerce.boolean().default(false),
  sort_order: z.coerce.number().int().min(0).default(0),
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
    name: formData.get('name'),
    code: formData.get('code'),
    is_active: formData.get('is_active') === 'on',
    requires_reference: formData.get('requires_reference') === 'on',
    sort_order: formData.get('sort_order') ?? 0,
  };
}

export async function createPaymentMethodAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();
  const parsed = methodSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { error } = await supabase
    .from('payment_methods')
    .insert(parsed.data);

  if (error) {
    if (error.code === '23505')
      return {
        error: 'Ya existe un metodo con ese codigo',
        success: false,
        timestamp: Date.now(),
      };
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  revalidatePath('/admin/metodos-pago');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function updatePaymentMethodAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();
  const id = String(formData.get('id') ?? '');
  if (!id)
    return { error: 'ID requerido', success: false, timestamp: Date.now() };

  const parsed = methodSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { error } = await supabase
    .from('payment_methods')
    .update(parsed.data)
    .eq('id', id);

  if (error) {
    if (error.code === '23505')
      return {
        error: 'Ya existe un metodo con ese codigo',
        success: false,
        timestamp: Date.now(),
      };
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  revalidatePath('/admin/metodos-pago');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function togglePaymentMethodAction(
  id: string,
  isActive: boolean
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('payment_methods')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };
  revalidatePath('/admin/metodos-pago');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function deletePaymentMethodAction(
  id: string
): Promise<ActionState> {
  try {
    const supabase = await createClient();

    const { count } = await supabase
      .from('sales')
      .select('id', { count: 'exact', head: true })
      .eq('payment_method_id', id);

    if ((count ?? 0) > 0) {
      const { error } = await supabase
        .from('payment_methods')
        .update({ is_active: false })
        .eq('id', id);
      if (error)
        return { error: error.message, success: false, timestamp: Date.now() };
      revalidatePath('/admin/metodos-pago');
      return { error: null, success: true, timestamp: Date.now() };
    }

    const { error } = await supabase
      .from('payment_methods')
      .delete()
      .eq('id', id);

    if (error)
      return { error: error.message, success: false, timestamp: Date.now() };

    revalidatePath('/admin/metodos-pago');
    return { error: null, success: true, timestamp: Date.now() };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Error desconocido',
      success: false,
      timestamp: Date.now(),
    };
  }
}