'use server';

import { createClient } from '@/lib/supabase/server';
import type { Product } from '@/lib/types/database';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const productSchema = z.object({
  name: z.string().trim().min(1, 'Nombre requerido').max(200),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug requerido')
    .max(220)
    .regex(/^[a-z0-9-]+$/, 'Solo minusculas, numeros y guiones'),
  sku: z.string().trim().max(80).optional().nullable(),
  barcode: z.string().trim().max(80).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  category_id: z.string().uuid().optional().nullable().or(z.literal('')),
  brand: z.string().trim().max(120).optional().nullable(),
  unit: z.string().trim().min(1, 'Unidad requerida').max(40).default('unidad'),
  cost: z.coerce.number().min(0, 'Costo no puede ser negativo').max(1_000_000_000),
  base_price: z.coerce.number().min(0, 'Precio no puede ser negativo').max(1_000_000_000),
  min_stock: z.coerce.number().min(0).max(1_000_000).default(0),
  has_variants: z.coerce.boolean().default(false),
  is_active: z.coerce.boolean().default(true),
  is_featured: z.coerce.boolean().default(false),
});

export interface ActionState {
  error: string | null;
  success: boolean;
  timestamp: number;
  fieldErrors?: Record<string, string>;
  createdId?: string;
}

function zodToFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.errors) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function parseProductForm(formData: FormData) {
  return {
    name: formData.get('name'),
    slug: formData.get('slug'),
    sku: formData.get('sku') || null,
    barcode: formData.get('barcode') || null,
    description: formData.get('description') || null,
    category_id: formData.get('category_id') || null,
    brand: formData.get('brand') || null,
    unit: formData.get('unit') || 'unidad',
    cost: formData.get('cost') ?? 0,
    base_price: formData.get('base_price') ?? 0,
    min_stock: formData.get('min_stock') ?? 0,
    has_variants: formData.get('has_variants') === 'on',
    is_active: formData.get('is_active') === 'on',
    is_featured: formData.get('is_featured') === 'on',
  };
}

function slugify(text: string): string {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ============================================
// GENERADOR DE SKU ÚNICO
// ============================================

export async function generateUniqueSkuAction(
  base: string,
  excludeProductId?: string,
  excludeVariantId?: string
): Promise<{ sku: string; error?: string }> {
  const supabase = await createClient();

  const cleanBase = slugify(base).toUpperCase();
  if (!cleanBase) return { sku: '', error: 'Nombre invalido' };

  let query = supabase
    .from('products')
    .select('id, sku')
    .ilike('sku', `${cleanBase}%`);

  if (excludeProductId) query = query.neq('id', excludeProductId);

  const { data: productSkus } = await query;

  let variantQuery = supabase
    .from('product_variants')
    .select('id, sku')
    .ilike('sku', `${cleanBase}%`);

  if (excludeVariantId) variantQuery = variantQuery.neq('id', excludeVariantId);

  const { data: variantSkus } = await variantQuery;

  const existing = new Set<string>();
  for (const p of productSkus ?? []) {
    if (p.sku) existing.add(p.sku);
  }
  for (const v of variantSkus ?? []) {
    if (v.sku) existing.add(v.sku);
  }

  if (!existing.has(cleanBase)) return { sku: cleanBase };

  let i = 2;
  while (existing.has(`${cleanBase}-${String(i).padStart(3, '0')}`)) {
    i++;
    if (i > 9999) return { sku: '', error: 'Demasiadas colisiones de SKU' };
  }
  return { sku: `${cleanBase}-${String(i).padStart(3, '0')}` };
}

export async function generateUniqueVariantSkuAction(
  productSku: string,
  variantName: string
): Promise<{ sku: string; error?: string }> {
  return generateUniqueSkuAction(`${productSku}-${variantName}`);
}

// ============================================
// OBTENER PRODUCTO POR ID (con relaciones)
// ============================================

export async function getProductByIdAction(
  id: string
): Promise<{ product?: Product; error?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products')
    .select(
      `*,
       category:categories!category_id(id, name, slug),
       images:product_images(*),
       variants:product_variants(*),
       prices_by_currency:prices_by_currency(*, currency:currencies(*))`
    )
    .eq('id', id)
    .single();

  if (error) return { error: error.message };
  return { product: data as unknown as Product };
}

// ============================================
// CREAR PRODUCTO
// ============================================

export async function createProductAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const parsed = productSchema.safeParse(parseProductForm(formData));
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { data: existingSlug } = await supabase
    .from('products')
    .select('id')
    .eq('slug', parsed.data.slug);
  if (existingSlug && existingSlug.length > 0) {
    return {
      error: 'Ya existe un producto con ese slug',
      success: false,
      timestamp: Date.now(),
      fieldErrors: { slug: 'Slug duplicado' },
    };
  }

  if (parsed.data.sku) {
    const { data: existingSku } = await supabase
      .from('products')
      .select('id')
      .eq('sku', parsed.data.sku);
    if (existingSku && existingSku.length > 0) {
      return {
        error: 'Ya existe un producto con ese SKU',
        success: false,
        timestamp: Date.now(),
        fieldErrors: { sku: 'SKU duplicado' },
      };
    }
  }

  const { data, error } = await supabase
    .from('products')
    .insert({
      ...parsed.data,
      sku: parsed.data.sku || null,
      barcode: parsed.data.barcode || null,
      description: parsed.data.description || null,
      category_id: parsed.data.category_id || null,
      brand: parsed.data.brand || null,
    })
    .select('id')
    .single();

  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  await supabase.from('inventory').insert({
    product_id: data.id,
    variant_id: null,
    stock: 0,
    reserved: 0,
  });

  revalidatePath('/admin/productos');
  revalidatePath('/admin/inventario');
  return {
    error: null,
    success: true,
    timestamp: Date.now(),
    createdId: data.id,
  };
}

// ============================================
// ACTUALIZAR PRODUCTO
// ============================================

export async function updateProductAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const id = String(formData.get('id') ?? '');
  if (!id)
    return { error: 'ID requerido', success: false, timestamp: Date.now() };

  const parsed = productSchema.safeParse(parseProductForm(formData));
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { data: existingSlug } = await supabase
    .from('products')
    .select('id')
    .eq('slug', parsed.data.slug)
    .neq('id', id);
  if (existingSlug && existingSlug.length > 0) {
    return {
      error: 'Ya existe otro producto con ese slug',
      success: false,
      timestamp: Date.now(),
      fieldErrors: { slug: 'Slug duplicado' },
    };
  }

  if (parsed.data.sku) {
    const { data: existingSku } = await supabase
      .from('products')
      .select('id')
      .eq('sku', parsed.data.sku)
      .neq('id', id);
    if (existingSku && existingSku.length > 0) {
      return {
        error: 'Ya existe otro producto con ese SKU',
        success: false,
        timestamp: Date.now(),
        fieldErrors: { sku: 'SKU duplicado' },
      };
    }
  }

  const { error } = await supabase
    .from('products')
    .update({
      ...parsed.data,
      sku: parsed.data.sku || null,
      barcode: parsed.data.barcode || null,
      description: parsed.data.description || null,
      category_id: parsed.data.category_id || null,
      brand: parsed.data.brand || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  revalidatePath('/admin/productos');
  revalidatePath(`/admin/productos/${id}`);
  revalidatePath('/admin/inventario');
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// ELIMINAR PRODUCTO
// ============================================

export async function deleteProductAction(id: string): Promise<ActionState> {
  const supabase = await createClient();

  const { count: salesCount } = await supabase
    .from('sale_items')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', id);

  const { count: orderCount } = await supabase
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', id);

  if ((salesCount ?? 0) > 0 || (orderCount ?? 0) > 0) {
    const { error } = await supabase
      .from('products')
      .update({ is_active: false })
      .eq('id', id);
    if (error)
      return { error: error.message, success: false, timestamp: Date.now() };
    revalidatePath('/admin/productos');
    return { error: null, success: true, timestamp: Date.now() };
  }

  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  revalidatePath('/admin/productos');
  revalidatePath('/admin/inventario');
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// TOGGLES
// ============================================

export async function toggleProductActiveAction(
  id: string,
  isActive: boolean
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('products')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };
  revalidatePath('/admin/productos');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function toggleProductFeaturedAction(
  id: string,
  isFeatured: boolean
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('products')
    .update({ is_featured: isFeatured, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };
  revalidatePath('/admin/productos');
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// IMÁGENES
// ============================================

export async function addProductImageAction(
  productId: string,
  url: string,
  altText?: string
): Promise<ActionState> {
  const supabase = await createClient();

  const { count } = await supabase
    .from('product_images')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId);

  const isPrimary = (count ?? 0) === 0;

  const { error } = await supabase.from('product_images').insert({
    product_id: productId,
    url,
    alt_text: altText || null,
    sort_order: count ?? 0,
    is_primary: isPrimary,
  });

  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  revalidatePath('/admin/productos');
  revalidatePath(`/admin/productos/${productId}`);
  return { error: null, success: true, timestamp: Date.now() };
}

export async function deleteProductImageAction(
  imageId: string
): Promise<ActionState> {
  const supabase = await createClient();

  const { data: img } = await supabase
    .from('product_images')
    .select('product_id, is_primary')
    .eq('id', imageId)
    .single();

  const { error } = await supabase
    .from('product_images')
    .delete()
    .eq('id', imageId);
  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  if (img?.is_primary) {
    const { data: next } = await supabase
      .from('product_images')
      .select('id')
      .eq('product_id', img.product_id)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next) {
      await supabase
        .from('product_images')
        .update({ is_primary: true })
        .eq('id', next.id);
    }
  }

  revalidatePath('/admin/productos');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function setPrimaryImageAction(
  imageId: string,
  productId: string
): Promise<ActionState> {
  const supabase = await createClient();

  await supabase
    .from('product_images')
    .update({ is_primary: false })
    .eq('product_id', productId);

  const { error } = await supabase
    .from('product_images')
    .update({ is_primary: true })
    .eq('id', imageId);
  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  revalidatePath('/admin/productos');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function uploadProductImageAction(
  formData: FormData
): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();

  const file = formData.get('file') as File | null;
  const productId = formData.get('product_id') as string | null;

  if (!file || !productId) {
    return { error: 'Archivo y product_id requeridos' };
  }

  const ext = file.name.split('.').pop() ?? 'webp';
  const filename = `${productId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from('product-images')
    .upload(filename, file, {
      cacheControl: '31536000',
      upsert: false,
      contentType: file.type,
    });

  if (error) return { error: error.message };

  const { data } = supabase.storage
    .from('product-images')
    .getPublicUrl(filename);

  return { url: data.publicUrl };
}

// ============================================
// VARIANTES
// ============================================

export async function createVariantAction(
  productId: string,
  data: {
    name: string;
    sku?: string;
    base_price?: number | null;
    cost?: number | null;
  }
): Promise<ActionState> {
  const supabase = await createClient();

  if (!data.name.trim()) {
    return {
      error: 'Nombre de variante requerido',
      success: false,
      timestamp: Date.now(),
    };
  }

  if (data.sku) {
    const { data: existing } = await supabase
      .from('product_variants')
      .select('id')
      .eq('sku', data.sku);
    if (existing && existing.length > 0) {
      return {
        error: 'Ya existe una variante con ese SKU',
        success: false,
        timestamp: Date.now(),
      };
    }
  }

  const { data: inserted, error } = await supabase
    .from('product_variants')
    .insert({
      product_id: productId,
      name: data.name.trim(),
      sku: data.sku?.trim() || null,
      attributes: {},
      base_price: data.base_price ?? null,
      cost: data.cost ?? null,
      is_active: true,
    })
    .select('id')
    .single();

  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  await supabase.from('inventory').insert({
    product_id: productId,
    variant_id: inserted.id,
    stock: 0,
    reserved: 0,
  });

  await supabase
    .from('products')
    .update({ has_variants: true })
    .eq('id', productId);

  revalidatePath('/admin/productos');
  revalidatePath(`/admin/productos/${productId}`);
  return { error: null, success: true, timestamp: Date.now() };
}

export async function deleteVariantAction(
  variantId: string
): Promise<ActionState> {
  const supabase = await createClient();

  const { data: inv } = await supabase
    .from('inventory')
    .select('stock')
    .eq('variant_id', variantId)
    .single();

  if (inv && Number(inv.stock) > 0) {
    return {
      error:
        'No se puede eliminar: la variante tiene stock. Ajusta el stock a 0 primero.',
      success: false,
      timestamp: Date.now(),
    };
  }

  const { data: variant } = await supabase
    .from('product_variants')
    .select('product_id')
    .eq('id', variantId)
    .single();

  const { error } = await supabase
    .from('product_variants')
    .delete()
    .eq('id', variantId);

  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  if (variant) {
    const { count } = await supabase
      .from('product_variants')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', variant.product_id);
    if ((count ?? 0) === 0) {
      await supabase
        .from('products')
        .update({ has_variants: false })
        .eq('id', variant.product_id);
    }
  }

  revalidatePath('/admin/productos');
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// PRECIOS POR MONEDA
// ============================================

export async function upsertPriceByCurrencyAction(
  data: {
    product_id: string;
    currency_id: string;
    price: number;
  }
): Promise<ActionState> {
  const supabase = await createClient();

  if (data.price < 0) {
    return {
      error: 'El precio no puede ser negativo',
      success: false,
      timestamp: Date.now(),
    };
  }

  const { data: existing } = await supabase
    .from('prices_by_currency')
    .select('id')
    .eq('product_id', data.product_id)
    .eq('currency_id', data.currency_id)
    .is('variant_id', null)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('prices_by_currency')
      .update({
        price: data.price,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error)
      return { error: error.message, success: false, timestamp: Date.now() };
  } else {
    const { error } = await supabase.from('prices_by_currency').insert({
      product_id: data.product_id,
      currency_id: data.currency_id,
      price: data.price,
      min_quantity: 1,
    });
    if (error)
      return { error: error.message, success: false, timestamp: Date.now() };
  }

  revalidatePath('/admin/productos');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function deletePriceByCurrencyAction(
  id: string
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('prices_by_currency')
    .delete()
    .eq('id', id);
  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };
  revalidatePath('/admin/productos');
  return { error: null, success: true, timestamp: Date.now() };
}