'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// ============================================
// SCHEMAS
// ============================================
const vendorCreateSchema = z.object({
  email: z.string().trim().email('Correo inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  full_name: z.string().trim().min(1, 'Nombre requerido').max(200),
  phone: z.string().trim().max(30).optional().nullable(),
  code: z.string().trim().max(40).optional().nullable(),
  type: z.enum(['vendedor', 'mensajero', 'ambos']).default('vendedor'),
  commission_mode: z.enum(['total', 'profit']).default('total'),
  commission_rate: z.coerce.number().min(0).max(100).default(0),
  delivery_fixed_fee: z.coerce.number().min(0).default(0),
  delivery_commission_rate: z.coerce.number().min(0).max(100).default(0),
});

const vendorUpdateSchema = z.object({
  full_name: z.string().trim().min(1, 'Nombre requerido').max(200),
  phone: z.string().trim().max(30).optional().nullable(),
  code: z.string().trim().max(40).optional().nullable(),
  type: z.enum(['vendedor', 'mensajero', 'ambos']).default('vendedor'),
  commission_mode: z.enum(['total', 'profit']).default('total'),
  commission_rate: z.coerce.number().min(0).max(100),
  delivery_fixed_fee: z.coerce.number().min(0).default(0),
  delivery_commission_rate: z.coerce.number().min(0).max(100).default(0),
  is_active: z.coerce.boolean().default(true),
});

export interface ActionState {
  error: string | null;
  success: boolean;
  fieldErrors?: Record<string, string>;
  vendorId?: string;
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
// CREAR VENDEDOR
// ============================================
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
    type: formData.get('type') || 'vendedor',
    commission_mode: formData.get('commission_mode') || 'total',
    commission_rate: formData.get('commission_rate') ?? 0,
    delivery_fixed_fee: formData.get('delivery_fixed_fee') ?? 0,
    delivery_commission_rate: formData.get('delivery_commission_rate') ?? 0,
  };

  const parsed = vendorCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  // Crear usuario + profile + vendor vía RPC
  const { data, error } = await supabase.rpc('admin_create_vendor', {
    p_email: parsed.data.email,
    p_password: parsed.data.password,
    p_full_name: parsed.data.full_name,
    p_phone: parsed.data.phone || null,
    p_code: parsed.data.code || null,
    p_commission_rate: parsed.data.commission_rate,
  });

  if (error) {
    return { error: error.message, success: false };
  }

  // Actualizar los campos nuevos
  const { error: updateError } = await supabase
    .from('vendors')
    .update({
      type: parsed.data.type,
      commission_mode: parsed.data.commission_mode,
      delivery_fixed_fee: parsed.data.delivery_fixed_fee,
      delivery_commission_rate: parsed.data.delivery_commission_rate,
    })
    .eq('id', data);

  if (updateError) {
    return { error: updateError.message, success: false };
  }

  revalidatePath('/admin/vendedores');
  revalidatePath('/admin/usuarios');
  revalidatePath('/admin/pagos');

  return { error: null, success: true, vendorId: data };
}

// ============================================
// ACTUALIZAR VENDEDOR
// ============================================
export async function updateVendorAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'ID requerido', success: false };

  const raw = {
    full_name: formData.get('full_name'),
    phone: formData.get('phone') || null,
    code: formData.get('code') || null,
    type: formData.get('type') || 'vendedor',
    commission_mode: formData.get('commission_mode') || 'total',
    commission_rate: formData.get('commission_rate'),
    delivery_fixed_fee: formData.get('delivery_fixed_fee') ?? 0,
    delivery_commission_rate: formData.get('delivery_commission_rate') ?? 0,
    is_active: formData.get('is_active') === 'on',
  };

  const parsed = vendorUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  // Obtener profile_id
  const { data: vendor } = await supabase
    .from('vendors')
    .select('profile_id')
    .eq('id', id)
    .single();

  if (!vendor) return { error: 'Vendedor no encontrado', success: false };

  // Actualizar profile
  await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone || null,
      is_active: parsed.data.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', vendor.profile_id);

  // Actualizar vendor con todos los campos
  const { error } = await supabase
    .from('vendors')
    .update({
      code: parsed.data.code || null,
      type: parsed.data.type,
      commission_mode: parsed.data.commission_mode,
      commission_rate: parsed.data.commission_rate,
      delivery_fixed_fee: parsed.data.delivery_fixed_fee,
      delivery_commission_rate: parsed.data.delivery_commission_rate,
      is_active: parsed.data.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { error: error.message, success: false };

  revalidatePath('/admin/vendedores');
  revalidatePath(`/admin/vendedores/${id}`);
  revalidatePath('/admin/pagos');

  return { error: null, success: true };
}

// ============================================
// TOGGLE ACTIVO
// ============================================
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

  if (error) return { error: error.message, success: false };

  revalidatePath('/admin/vendedores');
  revalidatePath('/admin/usuarios');

  return { error: null, success: true };
}

// ============================================
// EXPORTAR VENDEDORES A CSV
// ============================================
export async function exportVendorsCsvAction(): Promise<{
  csv?: string;
  filename?: string;
  error?: string;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('vendors')
    .select(
      'code, type, commission_mode, commission_rate, delivery_fixed_fee, delivery_commission_rate, total_sales, total_commission, pending_commission, is_active, created_at, profile:profiles!profile_id(full_name, email, phone)'
    )
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };

  const rows: string[] = [];
  rows.push(
    [
      'Código',
      'Nombre',
      'Email',
      'Teléfono',
      'Tipo',
      'Modo comisión',
      'Comisión %',
      'Entrega fija',
      'Entrega %',
      'Total ventas',
      'Total comisión',
      'Pendiente pago',
      'Activo',
      'Registrado',
    ].join(',')
  );

  for (const v of data ?? []) {
    const row = v as unknown as {
      code: string | null;
      type: string;
      commission_mode: string;
      commission_rate: number;
      delivery_fixed_fee: number;
      delivery_commission_rate: number;
      total_sales: number;
      total_commission: number;
      pending_commission: number;
      is_active: boolean;
      created_at: string;
      profile?: { full_name?: string; email?: string; phone?: string } | null;
    };

    rows.push(
      [
        csvEscape(row.code ?? ''),
        csvEscape(row.profile?.full_name ?? ''),
        csvEscape(row.profile?.email ?? ''),
        csvEscape(row.profile?.phone ?? ''),
        row.type,
        row.commission_mode,
        Number(row.commission_rate).toFixed(2),
        Number(row.delivery_fixed_fee).toFixed(4),
        Number(row.delivery_commission_rate).toFixed(2),
        Number(row.total_sales).toFixed(4),
        Number(row.total_commission).toFixed(4),
        Number(row.pending_commission).toFixed(4),
        row.is_active ? 'Sí' : 'No',
        new Date(row.created_at).toISOString(),
      ].join(',')
    );
  }

  return {
    csv: rows.join('\n'),
    filename: `vendedores-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}