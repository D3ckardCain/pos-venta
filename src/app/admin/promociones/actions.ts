'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// ============================================
// SCHEMAS
// ============================================
const promotionProductSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
});

const promotionSchema = z.object({
  name: z.string().trim().min(1, 'Nombre requerido').max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  type: z.enum(['porcentaje', 'monto_fijo', 'precio_especial', '2x1']),
  value: z.coerce.number().min(0).default(0),
  currency_id: z
    .string()
    .uuid()
    .optional()
    .nullable()
    .or(z.literal('')),
  min_quantity: z.coerce.number().min(0).optional().nullable(),
  min_amount: z.coerce.number().min(0).optional().nullable(),
  starts_at: z.string().min(1, 'Fecha de inicio requerida'),
  ends_at: z.string().optional().nullable(),
  max_uses: z.coerce.number().int().min(0).optional().nullable(),
  is_active: z.coerce.boolean().default(true),
  products: z.array(promotionProductSchema).default([]),
  category_ids: z.array(z.string().uuid()).default([]),
});

const revokeSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().max(500).optional().nullable(),
});

export interface ActionState {
  error: string | null;
  success: boolean;
  timestamp: number;
  fieldErrors?: Record<string, string>;
  promotionId?: string;
}

export interface PromotionHistoryEvent {
  id: string;
  previous_status: string | null;
  new_status: string;
  reason: string | null;
  changed_at: string;
  changed_by: string | null;
  user?: { id: string; full_name: string | null; email: string } | null;
}

export interface PromotionHistoryCounters {
  creadas: number;
  activadas: number;
  desactivadas: number;
  revocadas: number;
  restauradas: number;
  total: number;
}

export interface PromotionAppliedItem {
  type: 'product' | 'variant' | 'category';
  name: string;
  detail?: string; // SKU o nombre de categoría, por ejemplo
}

export interface PromotionHistoryResult {
  events?: PromotionHistoryEvent[];
  counters?: PromotionHistoryCounters;
  applied?: PromotionAppliedItem[];
  promotionName?: string;
  error?: string;
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
  let products: Array<{ product_id: string; variant_id: string | null }> = [];
  let categoryIds: string[] = [];

  try {
    const raw = JSON.parse(String(formData.get('products') ?? '[]'));
    if (Array.isArray(raw)) {
      products = raw
        .filter(
          (p) =>
            p && typeof p === 'object' && typeof p.product_id === 'string'
        )
        .map((p) => ({
          product_id: String(p.product_id),
          variant_id: p.variant_id ? String(p.variant_id) : null,
        }));
    }
  } catch {
    products = [];
  }

  try {
    categoryIds = JSON.parse(String(formData.get('category_ids') ?? '[]'));
  } catch {
    categoryIds = [];
  }

  return {
    name: formData.get('name'),
    description: formData.get('description') || null,
    type: formData.get('type'),
    value: formData.get('value') ?? 0,
    currency_id: formData.get('currency_id') || null,
    min_quantity: formData.get('min_quantity') || null,
    min_amount: formData.get('min_amount') || null,
    starts_at: formData.get('starts_at'),
    ends_at: formData.get('ends_at') || null,
    max_uses: formData.get('max_uses') || null,
    is_active: formData.get('is_active') === 'on',
    products,
    category_ids: categoryIds,
  };
}

// ============================================
// HELPER: registrar evento de historial
// ============================================
async function logHistory(params: {
  promotion_id: string;
  previous_status: string | null;
  new_status: string;
  reason?: string | null;
  user_id: string | null;
}) {
  const supabase = await createClient();
  await supabase.from('promotion_status_history').insert({
    promotion_id: params.promotion_id,
    previous_status: params.previous_status,
    new_status: params.new_status,
    reason: params.reason || null,
    changed_by: params.user_id,
  });
}

// ============================================
// CREAR PROMOCIÓN
// ============================================
export async function createPromotionAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const parsed = promotionSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const userRes = await supabase.auth.getUser();
  const userId = userRes.data.user?.id ?? null;

  const { data, error } = await supabase
    .from('promotions')
    .insert({
      name: parsed.data.name,
      description: parsed.data.description || null,
      type: parsed.data.type,
      value: parsed.data.value,
      currency_id: parsed.data.currency_id || null,
      min_quantity: parsed.data.min_quantity ?? 1,
      min_amount: parsed.data.min_amount ?? null,
      starts_at: new Date(parsed.data.starts_at).toISOString(),
      ends_at: parsed.data.ends_at
        ? new Date(parsed.data.ends_at).toISOString()
        : null,
      max_uses: parsed.data.max_uses ?? null,
      is_active: parsed.data.is_active,
      created_by: userId,
    })
    .select('id')
    .single();

  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  if (parsed.data.products.length > 0) {
    await supabase.from('promotion_products').insert(
      parsed.data.products.map((p) => ({
        promotion_id: data.id,
        product_id: p.product_id,
        variant_id: p.variant_id,
      }))
    );
  }

  if (parsed.data.category_ids.length > 0) {
    await supabase.from('promotion_categories').insert(
      parsed.data.category_ids.map((cid) => ({
        promotion_id: data.id,
        category_id: cid,
      }))
    );
  }

  await logHistory({
    promotion_id: data.id,
    previous_status: null,
    new_status: 'creada',
    user_id: userId,
  });
  if (parsed.data.is_active) {
    await logHistory({
      promotion_id: data.id,
      previous_status: 'creada',
      new_status: 'activada',
      user_id: userId,
    });
  }

  revalidatePath('/admin/promociones');
  return {
    error: null,
    success: true,
    timestamp: Date.now(),
    promotionId: data.id,
  };
}

// ============================================
// ACTUALIZAR PROMOCIÓN
// ============================================
export async function updatePromotionAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();
  const id = String(formData.get('id') ?? '');
  if (!id) {
    return { error: 'ID requerido', success: false, timestamp: Date.now() };
  }

  const parsed = promotionSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { data: prev } = await supabase
    .from('promotions')
    .select('is_active, revoked_at')
    .eq('id', id)
    .single();
  const userRes = await supabase.auth.getUser();
  const userId = userRes.data.user?.id ?? null;

  const { error } = await supabase
    .from('promotions')
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      type: parsed.data.type,
      value: parsed.data.value,
      currency_id: parsed.data.currency_id || null,
      min_quantity: parsed.data.min_quantity ?? 1,
      min_amount: parsed.data.min_amount ?? null,
      starts_at: new Date(parsed.data.starts_at).toISOString(),
      ends_at: parsed.data.ends_at
        ? new Date(parsed.data.ends_at).toISOString()
        : null,
      max_uses: parsed.data.max_uses ?? null,
      is_active: parsed.data.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  if (prev && prev.is_active !== parsed.data.is_active && !prev.revoked_at) {
    await logHistory({
      promotion_id: id,
      previous_status: prev.is_active ? 'activada' : 'desactivada',
      new_status: parsed.data.is_active ? 'activada' : 'desactivada',
      user_id: userId,
    });
  }

  await supabase.from('promotion_products').delete().eq('promotion_id', id);
  await supabase.from('promotion_categories').delete().eq('promotion_id', id);

  if (parsed.data.products.length > 0) {
    await supabase.from('promotion_products').insert(
      parsed.data.products.map((p) => ({
        promotion_id: id,
        product_id: p.product_id,
        variant_id: p.variant_id,
      }))
    );
  }

  if (parsed.data.category_ids.length > 0) {
    await supabase.from('promotion_categories').insert(
      parsed.data.category_ids.map((cid) => ({
        promotion_id: id,
        category_id: cid,
      }))
    );
  }

  revalidatePath('/admin/promociones');
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// TOGGLE ACTIVO
// ============================================
export async function togglePromotionAction(
  id: string,
  isActive: boolean
): Promise<ActionState> {
  const supabase = await createClient();
  const userRes = await supabase.auth.getUser();
  const userId = userRes.data.user?.id ?? null;

  const { error } = await supabase
    .from('promotions')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  await logHistory({
    promotion_id: id,
    previous_status: isActive ? 'desactivada' : 'activada',
    new_status: isActive ? 'activada' : 'desactivada',
    user_id: userId,
  });

  revalidatePath('/admin/promociones');
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// REVOCAR
// ============================================
export async function revokePromotionAction(
  id: string,
  reason?: string
): Promise<ActionState> {
  const supabase = await createClient();

  const parsed = revokeSchema.safeParse({ id, reason: reason ?? null });
  if (!parsed.success) {
    return {
      error: 'Datos inválidos',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const userRes = await supabase.auth.getUser();
  const userId = userRes.data.user?.id ?? null;

  const { error } = await supabase
    .from('promotions')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: userId,
      revoke_reason: parsed.data.reason || null,
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  await logHistory({
    promotion_id: id,
    previous_status: 'activada',
    new_status: 'revocada',
    reason: parsed.data.reason || null,
    user_id: userId,
  });

  revalidatePath('/admin/promociones');
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// RESTAURAR
// ============================================
export async function restorePromotionAction(
  id: string,
  alsoActivate: boolean
): Promise<ActionState> {
  const supabase = await createClient();
  const userRes = await supabase.auth.getUser();
  const userId = userRes.data.user?.id ?? null;

  const { error } = await supabase
    .from('promotions')
    .update({
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
      is_active: alsoActivate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  await logHistory({
    promotion_id: id,
    previous_status: 'revocada',
    new_status: alsoActivate ? 'restaurada (activada)' : 'restaurada',
    user_id: userId,
  });

  revalidatePath('/admin/promociones');
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// BORRADO FÍSICO
// ============================================
export async function deletePromotionPermanentlyAction(
  id: string
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from('promotions').delete().eq('id', id);
  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }
  revalidatePath('/admin/promociones');
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// OBTENER HISTORIAL + CONTADORES + APLICABLES
// ============================================
export async function getPromotionHistoryAction(
  promotionId: string
): Promise<PromotionHistoryResult> {
  const supabase = await createClient();

  // Info básica de la promoción (para nombre)
  const { data: promo, error: promoErr } = await supabase
    .from('promotions')
    .select(
      `id, name,
       products:promotion_products(
         product_id,
         variant_id,
         product:products(id, name, sku),
         variant:product_variants(id, name, sku)
       ),
       categories:promotion_categories(
         category_id,
         category:categories(id, name)
       )`
    )
    .eq('id', promotionId)
    .maybeSingle();

  if (promoErr) return { error: promoErr.message };

  // Eventos del historial
  const { data, error } = await supabase
    .from('promotion_status_history')
    .select(
      'id, previous_status, new_status, reason, changed_at, changed_by, user:profiles!changed_by(id, full_name, email)'
    )
    .eq('promotion_id', promotionId)
    .order('changed_at', { ascending: false });

  if (error) return { error: error.message };

  const events = (data ?? []) as unknown as PromotionHistoryEvent[];

  // Calcular contadores
  const counters: PromotionHistoryCounters = {
    creadas: 0,
    activadas: 0,
    desactivadas: 0,
    revocadas: 0,
    restauradas: 0,
    total: events.length,
  };
  for (const e of events) {
    if (e.new_status === 'creada') counters.creadas++;
    else if (e.new_status === 'activada') counters.activadas++;
    else if (e.new_status === 'desactivada') counters.desactivadas++;
    else if (e.new_status === 'revocada') counters.revocadas++;
    else if (
      e.new_status === 'restaurada' ||
      e.new_status === 'restaurada (activada)'
    )
      counters.restauradas++;
  }

  // Productos y variantes aplicables
  const applied: PromotionAppliedItem[] = [];
  if (promo) {
    const p = promo as unknown as {
      name: string;
      products?: Array<{
        product_id: string;
        variant_id: string | null;
        product?: { id: string; name: string; sku: string | null } | null;
        variant?: { id: string; name: string; sku: string | null } | null;
      }>;
      categories?: Array<{
        category_id: string;
        category?: { id: string; name: string } | null;
      }>;
    };

    for (const prod of p.products ?? []) {
      if (prod.variant_id) {
        applied.push({
          type: 'variant',
          name: `${prod.product?.name ?? 'Producto'} · ${prod.variant?.name ?? 'Variante'}`,
          detail: prod.variant?.sku ?? prod.product?.sku ?? undefined,
        });
      } else {
        applied.push({
          type: 'product',
          name: prod.product?.name ?? 'Producto',
          detail: prod.product?.sku ?? undefined,
        });
      }
    }
    for (const cat of p.categories ?? []) {
      applied.push({
        type: 'category',
        name: cat.category?.name ?? 'Categoría',
      });
    }
  }

  return {
    events,
    counters,
    applied,
    promotionName: promo?.name ?? undefined,
  };
}

// ============================================
// EXPORTAR HISTORIAL A EXCEL (2 hojas)
// ============================================
export async function exportPromotionHistoryExcel(promotionId: string): Promise<{
  fileBase64?: string;
  filename?: string;
  error?: string;
}> {
  const res = await getPromotionHistoryAction(promotionId);
  if (res.error) return { error: res.error };

  const events = res.events ?? [];
  const counters = res.counters!;
  const applied = res.applied ?? [];
  const promoName = res.promotionName ?? `Promocion-${promotionId.slice(0, 8)}`;

  const { buildExcelWorkbook, workbookToBuffer } = await import(
    '@/lib/utils/excel'
  );

  // ----------------------
  // Hoja 1: Resumen
  // ----------------------
  const summaryRows = [
    { label: 'Promoción', value: promoName },
    { label: 'Total de eventos', value: counters.total },
    { label: 'Creaciones', value: counters.creadas },
    { label: 'Activaciones', value: counters.activadas },
    { label: 'Desactivaciones', value: counters.desactivadas },
    { label: 'Revocaciones', value: counters.revocadas },
    { label: 'Restauraciones', value: counters.restauradas },
  ];

  const wb = buildExcelWorkbook({
    name: 'Resumen',
    columns: [
      { header: 'Métrica', key: 'label', width: 28 },
      { header: 'Valor', key: 'value', width: 40 },
    ],
    rows: summaryRows,
  });

  // Añadir segunda hoja "Aplicables" (productos, variantes, categorías)
  const ExcelJS = (await import('exceljs')).default;
  const wsApplied = wb.addWorksheet('Aplicables', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  wsApplied.columns = [
    { header: 'Tipo', key: 'type', width: 16 },
    { header: 'Nombre', key: 'name', width: 50 },
    { header: 'Detalle', key: 'detail', width: 24 },
  ];
  wsApplied.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  wsApplied.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E40AF' },
  };

  if (applied.length === 0) {
    wsApplied.addRow({
      type: '—',
      name: 'Aplica a todo el catálogo (sin productos ni categorías específicas)',
      detail: '',
    });
  } else {
    for (const item of applied) {
      wsApplied.addRow({
        type:
          item.type === 'product'
            ? 'Producto'
            : item.type === 'variant'
            ? 'Variante'
            : 'Categoría',
        name: item.name,
        detail: item.detail ?? '',
      });
    }
  }

  // ----------------------
  // Hoja 3: Eventos
  // ----------------------
  const wsEvents = wb.addWorksheet('Eventos', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  wsEvents.columns = [
    { header: 'Fecha', key: 'changed_at', width: 22 },
    { header: 'Estado anterior', key: 'previous_status', width: 20 },
    { header: 'Estado nuevo', key: 'new_status', width: 22 },
    { header: 'Motivo', key: 'reason', width: 40 },
    { header: 'Usuario', key: 'user_name', width: 24 },
  ];
  wsEvents.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  wsEvents.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E40AF' },
  };
  wsEvents.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  const statusColors: Record<string, { bg: string; fg: string }> = {
    creada: { bg: 'FFDBEAFE', fg: 'FF1E40AF' },
    activada: { bg: 'FFD1FAE5', fg: 'FF065F46' },
    desactivada: { bg: 'FFF3F4F6', fg: 'FF374151' },
    revocada: { bg: 'FFFEE2E2', fg: 'FF991B1B' },
    restaurada: { bg: 'FFFEF3C7', fg: 'FF92400E' },
    'restaurada (activada)': { bg: 'FFD1FAE5', fg: 'FF065F46' },
  };

  for (const e of events) {
    const row = wsEvents.addRow({
      changed_at: new Date(e.changed_at),
      previous_status: e.previous_status ?? '',
      new_status: e.new_status,
      reason: e.reason ?? '',
      user_name: e.user?.full_name ?? e.user?.email ?? 'Sistema',
    });
    row.getCell(1).numFmt = 'dd/mm/yyyy hh:mm';
    const color = statusColors[e.new_status];
    if (color) {
      const c = row.getCell(3);
      c.font = { bold: true, color: { argb: color.fg } };
      c.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color.bg },
      };
    }
  }

  const buffer = await workbookToBuffer(wb);

  const safeName = promoName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);

  return {
    fileBase64: Buffer.from(buffer).toString('base64'),
    filename: `historial-${safeName}-${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}

// ============================================
// EXPORTAR PROMOCIONES A EXCEL (con columna veces revocada)
// ============================================
export async function exportPromotionsExcelAction(): Promise<{
  fileBase64?: string;
  filename?: string;
  error?: string;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('promotions')
    .select(
      `id, name, description, type, value, currency_id,
       min_quantity, min_amount, starts_at, ends_at,
       max_uses, current_uses, is_active,
       revoked_at, revoke_reason, created_at,
       currency:currencies!currency_id(code),
       products:promotion_products(product_id, variant_id),
       categories:promotion_categories(category_id)`
    )
    .order('created_at', { ascending: false })
    .limit(10000);

  if (error) return { error: error.message };

  const { data: revokes } = await supabase
    .from('promotion_status_history')
    .select('promotion_id')
    .eq('new_status', 'revocada');

  const revokeCount = new Map<string, number>();
  for (const r of revokes ?? []) {
    revokeCount.set(
      r.promotion_id,
      (revokeCount.get(r.promotion_id) ?? 0) + 1
    );
  }

  const now = new Date();

  const rows = (data ?? []).map((p) => {
    const row = p as unknown as {
      id: string;
      name: string;
      description: string | null;
      type: string;
      value: number;
      min_quantity: number | null;
      min_amount: number | null;
      starts_at: string;
      ends_at: string | null;
      max_uses: number | null;
      current_uses: number;
      is_active: boolean;
      revoked_at: string | null;
      revoke_reason: string | null;
      created_at: string;
      currency?: { code?: string } | null;
      products?: Array<{ product_id: string; variant_id: string | null }>;
      categories?: Array<{ category_id: string }>;
    };

    const starts = new Date(row.starts_at);
    const ends = row.ends_at ? new Date(row.ends_at) : null;
    let estado = 'Activa';
    if (row.revoked_at) estado = 'Revocada';
    else if (!row.is_active) estado = 'Inactiva';
    else if (ends && ends <= now) estado = 'Expirada';
    else if (starts > now) estado = 'Programada';

    return {
      name: row.name,
      description: row.description ?? '',
      type: row.type,
      value: Number(row.value),
      currency: row.currency?.code ?? '',
      min_quantity: row.min_quantity ?? 0,
      min_amount: row.min_amount ?? 0,
      starts_at: row.starts_at,
      ends_at: row.ends_at ?? '',
      max_uses: row.max_uses ?? 0,
      current_uses: row.current_uses,
      products_count: row.products?.length ?? 0,
      variants_count:
        row.products?.filter((x) => x.variant_id !== null).length ?? 0,
      categories_count: row.categories?.length ?? 0,
      estado,
      revokes_count: revokeCount.get(row.id) ?? 0,
      revoked_at: row.revoked_at ?? '',
      revoke_reason: row.revoke_reason ?? '',
      is_active: row.is_active,
      created_at: row.created_at,
    };
  });

  const totals = {
    name: 'TOTALES',
    current_uses: rows.reduce((s, r) => s + r.current_uses, 0),
  };

  const { buildExcelWorkbook, workbookToBuffer } = await import(
    '@/lib/utils/excel'
  );

  const wb = buildExcelWorkbook({
    name: 'Promociones',
    columns: [
      { header: 'Nombre', key: 'name', width: 30 },
      { header: 'Descripción', key: 'description', width: 32 },
      { header: 'Tipo', key: 'type', type: 'status', width: 16 },
      { header: 'Valor', key: 'value', type: 'number', width: 12 },
      { header: 'Moneda', key: 'currency', width: 10 },
      { header: 'Cant. mínima', key: 'min_quantity', type: 'number', width: 14 },
      { header: 'Monto mínimo', key: 'min_amount', type: 'number', width: 14 },
      { header: 'Inicio', key: 'starts_at', type: 'datetime', width: 20 },
      { header: 'Fin', key: 'ends_at', type: 'datetime', width: 20 },
      { header: 'Máx. usos', key: 'max_uses', type: 'number', width: 12 },
      { header: 'Usos actuales', key: 'current_uses', type: 'number', width: 14 },
      { header: 'Productos', key: 'products_count', type: 'number', width: 12 },
      { header: 'Variantes', key: 'variants_count', type: 'number', width: 12 },
      { header: 'Categorías', key: 'categories_count', type: 'number', width: 12 },
      { header: 'Estado', key: 'estado', type: 'status', width: 14 },
      { header: 'Veces revocada', key: 'revokes_count', type: 'number', width: 14 },
      { header: 'Revocada el', key: 'revoked_at', type: 'datetime', width: 20 },
      { header: 'Motivo última revocación', key: 'revoke_reason', width: 30 },
      { header: 'Activa', key: 'is_active', type: 'boolean', width: 10 },
      { header: 'Creada', key: 'created_at', type: 'datetime', width: 20 },
    ],
    rows,
    statusMap: {
      porcentaje: 'success',
      monto_fijo: 'info',
      precio_especial: 'warning',
      '2x1': 'default',
      Activa: 'success',
      Programada: 'info',
      Expirada: 'warning',
      Inactiva: 'default',
      Revocada: 'error',
    },
    totals,
  });

  const buffer = await workbookToBuffer(wb);
  return {
    fileBase64: Buffer.from(buffer).toString('base64'),
    filename: `promociones-${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}