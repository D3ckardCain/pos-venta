import { createClient } from '@/lib/supabase/server';
import { KardexClient } from './KardexClient';
import type { InventoryMovement, Product, Category } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: {
    product_id?: string;
    variant_id?: string;
    movement_type?: string;
    from?: string;
    to?: string;
  };
}

export default async function KardexPage({ searchParams }: PageProps) {
  const supabase = await createClient();

  let query = supabase
    .from('inventory_movements')
    .select(
      `*,
       product:products(id, name, sku, category_id),
       variant:product_variants(id, name, sku),
       user:profiles!created_by(id, full_name, email)`
    )
    .order('created_at', { ascending: false })
    .limit(500);

  if (searchParams.product_id)
    query = query.eq('product_id', searchParams.product_id);
  if (searchParams.variant_id)
    query = query.eq('variant_id', searchParams.variant_id);
  if (searchParams.movement_type)
    query = query.eq('movement_type', searchParams.movement_type);
  if (searchParams.from) query = query.gte('created_at', searchParams.from);
  if (searchParams.to) query = query.lte('created_at', searchParams.to);

  const { data: movements } = await query;

  const { data: products } = await supabase
    .from('products')
    .select('id, name, sku, category_id')
    .eq('is_active', true)
    .order('name');

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .order('name');

  return (
    <KardexClient
      initialMovements={(movements ?? []) as unknown as InventoryMovement[]}
      products={
        (products ?? []) as Pick<Product, 'id' | 'name' | 'sku' | 'category_id'>[]
      }
      categories={(categories ?? []) as Pick<Category, 'id' | 'name'>[]}
      initialFilters={searchParams}
    />
  );
}