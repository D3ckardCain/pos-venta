import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { CategoriaCatalogoClient } from './CategoriaCatalogoClient';
import type {
  Product,
  Category,
  Currency,
  CurrencySetting,
  ExchangeRate,
  SystemSetting,
} from '@/lib/types/database';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { slug: string };
}

export default async function CategoriaCatalogoPage({ params }: PageProps) {
  const supabase = await createClient();

  const { data: category } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', params.slug)
    .eq('is_active', true)
    .single();

  if (!category) notFound();

  const { data: products } = await supabase
    .from('products')
    .select(
      `*,
       category:categories(id, name, slug),
       images:product_images(id, url, alt_text, sort_order, is_primary),
       variants:product_variants(id, name, sku, base_price),
       prices_by_currency:prices_by_currency(id, currency_id, price, variant_id)`
    )
    .eq('category_id', category.id)
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('name');

  const { data: currencies } = await supabase
    .from('currencies')
    .select('*')
    .eq('is_active', true)
    .eq('usable_in_catalog', true)
    .order('code');

  const { data: currencySettings } = await supabase
    .from('currency_settings')
    .select('*, primary_currency:currencies!primary_currency_id(*)')
    .eq('is_singleton', true)
    .single();

  const { data: exchangeRates } = await supabase
    .from('exchange_rates')
    .select('*')
    .eq('is_active', true);

  const { data: systemSettings } = await supabase
    .from('system_settings')
    .select('*');

  return (
    <CategoriaCatalogoClient
      category={category as Category}
      products={(products ?? []) as unknown as Product[]}
      currencies={(currencies ?? []) as Currency[]}
      currencySettings={(currencySettings ?? null) as CurrencySetting | null}
      exchangeRates={(exchangeRates ?? []) as ExchangeRate[]}
      systemSettings={(systemSettings ?? []) as SystemSetting[]}
    />
  );
}
