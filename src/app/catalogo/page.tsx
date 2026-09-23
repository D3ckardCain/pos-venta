import { createClient } from '@/lib/supabase/server';
import { CatalogoClient } from './CatalogoClient';
import type {
  Product,
  Category,
  Currency,
  CurrencySetting,
  ExchangeRate,
  SystemSetting,
} from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function CatalogoPage() {
  const supabase = await createClient();

  const { data: products } = await supabase
    .from('products')
    .select(
      `id, name, slug, sku, description, base_price, cost, unit, brand, is_featured, category_id,
       category:categories(id, name, slug),
       images:product_images(id, url, alt_text, sort_order, is_primary),
       variants:product_variants(id, name, sku, base_price),
       prices_by_currency:prices_by_currency(id, currency_id, price, variant_id)`
    )
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, slug, image_url')
    .eq('is_active', true)
    .order('sort_order')
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
    <CatalogoClient
      products={(products ?? []) as unknown as Product[]}
      categories={(categories ?? []) as Category[]}
      currencies={(currencies ?? []) as Currency[]}
      currencySettings={(currencySettings ?? null) as CurrencySetting | null}
      exchangeRates={(exchangeRates ?? []) as ExchangeRate[]}
      systemSettings={(systemSettings ?? []) as SystemSetting[]}
    />
  );
}