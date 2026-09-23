'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const vendorCreateSchema = z.object({
  email: z.string().trim().email('Correo invalido'),
  password: z.string().min(6, 'Minimo 6 caracteres'),
  full_name: z.string().trim().min(1, 'Nombre requerido').max(200),
  phone: z.string().trim().max(30).optional().nullable(),
  code: z.string().trim().max(40).optional().nullable(),
  commission_rate: z.coerce
    .number()
    .min(0, 'No puede ser negativo')
    .max(100, 'Maximo 100%')
    .default(0),
});

const vendorUpdateSchema = z.object({
  full_name: z.string().trim().min(1, 'Nombre requerido').max(200),
  phone: z.string().trim().max(30).optional().nullable(),
  code: z.string().trim().max(40).optional().nullable(),
  commission_rate: z.coerce.number().min(0).max(100),
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

export async function createVendorAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
    full_name: formData.get('full_name'),
    phone: formData.get('phone') || null,
    code: formData.get('code') || null,
    commission_rate: formData.get('commission_rate') ?? 0,
  };

  const parsed = vendorCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { data, error } = await supabase.rpc('admin_create_vendor', {
    p_email: parsed.data.email,
    p_password: parsed.data.password,
    p_full_name: parsed.data.full_name,
    p_phone: parsed.data.phone || null,
    p_code: parsed.data.code || null,
    p_commission_rate: parsed.data.commission_rate,
  });

  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  revalidatePath('/admin/vendedores');
  revalidatePath('/admin/usuarios');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function updateVendorAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const id = String(formData.get('id') ?? '');
  if (!id)
    return { error: 'ID requerido', success: false, timestamp: Date.now() };

  const raw = {
    full_name: formData.get('full_name'),
    phone: formData.get('phone') || null,
    code: formData.get('code') || null,
    commission_rate: formData.get('commission_rate'),
    is_active: formData.get('is_active') === 'on',
  };

  const parsed = vendorUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { data: vendor } = await supabase
    .from('vendors')
    .select('profile_id')
    .eq('id', id)
    .single();

  if (!vendor)
    return {
      error: 'Vendedor no encontrado',
      success: false,
      timestamp: Date.now(),
    };

  await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone || null,
      is_active: parsed.data.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', vendor.profile_id);

  const { error } = await supabase
    .from('vendors')
    .update({
      code: parsed.data.code || null,
      commission_rate: parsed.data.commission_rate,
      is_active: parsed.data.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  revalidatePath('/admin/vendedores');
  revalidatePath('/admin/usuarios');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function toggleVendorActiveAction(
  id: string,
  isActive: boolean
): Promise<ActionState> {
  const supabase = await createClient();

  const { data: vendor } = await supabase
    .from('vendors')
    .select('profile_id')
    .eq('id', id)
    .single();

  if (vendor) {
    await supabase
      .from('profiles')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', vendor.profile_id);
  }

  const { error } = await supabase
    .from('vendors')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  revalidatePath('/admin/vendedores');
  revalidatePath('/admin/usuarios');
  return { error: null, success: true, timestamp: Date.now() };
}