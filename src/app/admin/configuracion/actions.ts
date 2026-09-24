'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const settingsSchema = z.object({
  business_name: z.string().trim().min(1, 'Nombre del negocio requerido').max(120),
  business_phone: z.string().trim().max(30).optional().or(z.literal('')),
  catalog_url: z.string().trim().url('URL inválida').optional().or(z.literal('')),
  whatsapp_message_template: z.string().trim().max(500).optional().or(z.literal('')),
  points_per_currency_unit: z.coerce.number().min(0, 'No puede ser negativo').max(1000),
  allow_negative_stock: z.coerce.boolean().default(false),
  low_stock_threshold: z.coerce.number().int().min(0).max(100000),
  payment_cycle: z.enum(['manual', 'daily', 'weekly', 'biweekly', 'monthly']),
  payment_cycle_start_day: z.coerce.number().int().min(1).max(31),
});

export interface ActionState {
  error: string | null;
  success: boolean;
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

export async function updateSystemSettingsAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const raw = {
    business_name: formData.get('business_name'),
    business_phone: formData.get('business_phone') || '',
    catalog_url: formData.get('catalog_url') || '',
    whatsapp_message_template: formData.get('whatsapp_message_template') || '',
    points_per_currency_unit: formData.get('points_per_currency_unit'),
    allow_negative_stock: formData.get('allow_negative_stock') === 'on',
    low_stock_threshold: formData.get('low_stock_threshold'),
    payment_cycle: formData.get('payment_cycle'),
    payment_cycle_start_day: formData.get('payment_cycle_start_day'),
  };

  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const updates: Array<{ key: string; value: unknown; description: string }> = [
    { key: 'business_name', value: parsed.data.business_name, description: 'Nombre del negocio' },
    { key: 'business_phone', value: parsed.data.business_phone ?? '', description: 'Teléfono del negocio para WhatsApp' },
    { key: 'catalog_url', value: parsed.data.catalog_url ?? '', description: 'URL pública del catálogo' },
    { key: 'whatsapp_message_template', value: parsed.data.whatsapp_message_template ?? '', description: 'Plantilla de mensaje WhatsApp' },
    { key: 'points_per_currency_unit', value: parsed.data.points_per_currency_unit, description: 'Puntos por unidad de moneda gastada' },
    { key: 'allow_negative_stock', value: parsed.data.allow_negative_stock, description: 'Permitir stock negativo' },
    { key: 'low_stock_threshold', value: parsed.data.low_stock_threshold, description: 'Umbral de stock bajo' },
    { key: 'payment_cycle', value: parsed.data.payment_cycle, description: 'Ciclo de pago a vendedores' },
    { key: 'payment_cycle_start_day', value: parsed.data.payment_cycle_start_day, description: 'Día de inicio del ciclo de pago' },
  ];

  const userRes = await supabase.auth.getUser();
  const userId = userRes.data.user?.id ?? null;

  for (const u of updates) {
    const { error } = await supabase
      .from('system_settings')
      .upsert(
        {
          key: u.key,
          value: u.value as never,
          description: u.description,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );
    if (error) return { error: error.message, success: false };
  }

  revalidatePath('/admin/configuracion');
  revalidatePath('/admin/dashboard');
  revalidatePath('/admin/monedas');
  revalidatePath('/admin/pagos');

  return { error: null, success: true };
}