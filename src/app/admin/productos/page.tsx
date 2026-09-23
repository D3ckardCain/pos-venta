import { createClient } from '@/lib/supabase/server';
import { ProductosClient } from './ProductosClient';
import type { Product, Category, Currency } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function ProductosPage() {
  const supabase = await createClient();

  const { data: products } = await supabase
    .from('products')
    .select(
      `*,
       category:categories!category_id(id, name, slug),
       images:product_images(*),
       variants:product_variants(*),
       prices_by_currency:prices_by_currency(*, currency:currencies(*))`
    )
    .order('created_at', { ascending: false });

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, slug, parent_id, is_active')
    .order('name');

  const { data: currencies } = await supabase
    .from('currencies')
    .select('*')
    .eq('is_active', true)
    .order('code');

  return (
    <ProductosClient
      initialProducts={(products ?? []) as unknown as Product[]}
      categories={(categories ?? []) as Category[]}
      currencies={(currencies ?? []) as Currency[]}
    />
  );
}