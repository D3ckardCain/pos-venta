import { createClient } from '@/lib/supabase/server';
import type { Category } from '@/lib/types/database';
import { CategoriasClient } from './CategoriasClient';

export const dynamic = 'force-dynamic';

export default async function CategoriasPage() {
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from('categories')
    .select('*, parent:categories!parent_id(id, name, slug)')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  return (
    <CategoriasClient initialCategories={(categories ?? []) as Category[]} />
  );
}