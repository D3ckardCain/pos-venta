import { createClient } from '@/lib/supabase/server';
import { PromocionesClient } from './PromocionesClient';
import type { Promotion, Currency, Product, Category } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function PromocionesPage() {
  const supabase = await createClient();

  // Promociones con sus relaciones
  const { data: promotions } = await supabase
    .from('promotions')
    .select(
      `*,
       currency:currencies(*),
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
    .order('created_at', { ascending: false });

  // Monedas activas
  const { data: currencies } = await supabase
    .from('currencies')
    .select('*')
    .eq('is_active', true)
    .order('code');

  // Productos activos con sus variantes (limitado a 500)
  const { data: products } = await supabase
    .from('products')
    .select(
      `id, name, sku, base_price, has_variants,
       variants:product_variants(id, name, sku, base_price, is_active)`
    )
    .eq('is_active', true)
    .order('name')
    .limit(500);

  // Filtrar variantes inactivas
  const productsWithVariants = (products ?? []).map((p) => ({
    ...p,
    variants: (p.variants ?? []).filter((v) => v.is_active !== false),
  }));

  // Categorías activas
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  return (
    <PromocionesClient
      initialPromotions={(promotions ?? []) as Promotion[]}
      currencies={(currencies ?? []) as Currency[]}
      products={
        productsWithVariants as unknown as (Pick<
          Product,
          'id' | 'name' | 'sku' | 'base_price'
        > & {
          has_variants?: boolean;
          variants?: Array<{
            id: string;
            name: string;
            sku: string | null;
            base_price: number | null;
          }>;
        })[]
      }
      categories={(categories ?? []) as Pick<Category, 'id' | 'name'>[]}
    />
  );
}