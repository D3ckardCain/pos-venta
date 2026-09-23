'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Nombre requerido').max(120),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug requerido')
    .max(160)
    .regex(/^[a-z0-9-]+$/, 'Solo minusculas, numeros y guiones'),
  description: z.string().trim().max(1000).optional().nullable(),
  image_url: z
    .string()
    .trim()
    .url('URL invalida')
    .optional()
    .nullable()
    .or(z.literal('')),
  parent_id: z.string().uuid().optional().nullable().or(z.literal('')),
  sort_order: z.coerce.number().int().min(0).max(100000).default(0),
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
    name: formData.get('name'),
    slug: formData.get('slug'),
    description: formData.get('description') || null,
    image_url: formData.get('image_url') || null,
    parent_id: formData.get('parent_id') || null,
    sort_order: formData.get('sort_order') ?? 0,
    is_active: formData.get('is_active') === 'on',
  };
}

export async function createCategoryAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const parsed = categorySchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', parsed.data.slug);
  if (existing && existing.length > 0) {
    return {
      error: 'Ya existe una categoria con ese slug',
      success: false,
      timestamp: Date.now(),
      fieldErrors: { slug: 'Slug duplicado' },
    };
  }

  const { error } = await supabase.from('categories').insert({
    ...parsed.data,
    parent_id: parsed.data.parent_id || null,
    image_url: parsed.data.image_url || null,
    description: parsed.data.description || null,
  });

  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  revalidatePath('/admin/categorias');
  revalidatePath('/admin/productos');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function updateCategoryAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const id = String(formData.get('id') ?? '');
  if (!id)
    return { error: 'ID requerido', success: false, timestamp: Date.now() };

  const parsed = categorySchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return {
      error: 'Revisa los campos marcados',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  if (parsed.data.parent_id === id) {
    return {
      error: 'Una categoria no puede ser padre de si misma',
      success: false,
      timestamp: Date.now(),
      fieldErrors: { parent_id: 'Categoria invalida' },
    };
  }

  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', parsed.data.slug)
    .neq('id', id);
  if (existing && existing.length > 0) {
    return {
      error: 'Ya existe otra categoria con ese slug',
      success: false,
      timestamp: Date.now(),
      fieldErrors: { slug: 'Slug duplicado' },
    };
  }

  const { error } = await supabase
    .from('categories')
    .update({
      ...parsed.data,
      parent_id: parsed.data.parent_id || null,
      image_url: parsed.data.image_url || null,
      description: parsed.data.description || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  revalidatePath('/admin/categorias');
  revalidatePath('/admin/productos');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function deleteCategoryAction(id: string): Promise<ActionState> {
  const supabase = await createClient();

  const { count: childrenCount } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', id);

  if ((childrenCount ?? 0) > 0) {
    return {
      error:
        'No se puede eliminar: tiene subcategorias. Elimina o reasigna primero.',
      success: false,
      timestamp: Date.now(),
    };
  }

  const { count: productsCount } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);

  if ((productsCount ?? 0) > 0) {
    return {
      error: `No se puede eliminar: ${productsCount} producto(s) usan esta categoria.`,
      success: false,
      timestamp: Date.now(),
    };
  }

  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error)
    return { error: error.message, success: false, timestamp: Date.now() };

  revalidatePath('/admin/categorias');
  revalidatePath('/admin/productos');
  return { error: null, success: true, timestamp: Date.now() };
}

export async function toggleCategoryAction(
  id: string,
  isActive: boolean
): Promise<ActionState> {
  const supabase = await createClient();

  const { data: category, error: fetchErr } = await supabase
    .from('categories')
    .select('id, is_active')
    .eq('id', id)
    .single();

  if (fetchErr || !category) {
    return {
      error: 'Categoria no encontrada',
      success: false,
      timestamp: Date.now(),
    };
  }

  if (isActive === false) {
    const { data: children } = await supabase
      .from('categories')
      .select('id, is_active')
      .eq('parent_id', id);

    for (const child of children ?? []) {
      await supabase
        .from('categories')
        .update({
          was_active_before_parent_disable: child.is_active,
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', child.id);
    }

    const { error } = await supabase
      .from('categories')
      .update({
        is_active: false,
        was_active_before_parent_disable: category.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error)
      return { error: error.message, success: false, timestamp: Date.now() };
  } else {
    const { data: children } = await supabase
      .from('categories')
      .select('id, was_active_before_parent_disable')
      .eq('parent_id', id);

    for (const child of children ?? []) {
      const previousState =
        child.was_active_before_parent_disable === null
          ? true
          : child.was_active_before_parent_disable;

      await supabase
        .from('categories')
        .update({
          is_active: previousState,
          was_active_before_parent_disable: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', child.id);
    }

    const { error } = await supabase
      .from('categories')
      .update({
        is_active: true,
        was_active_before_parent_disable: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error)
      return { error: error.message, success: false, timestamp: Date.now() };
  }

  revalidatePath('/admin/categorias');
  revalidatePath('/admin/productos');
  return { error: null, success: true, timestamp: Date.now() };
}