import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { ProductoDetailClient } from './ProductoDetailClient';
import type {
  Product,
  Currency,
  CurrencySetting,
  ExchangeRate,
  SystemSetting,
} from '@/lib/types/database';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { slug: string };
}

export default async function ProductoDetailPage({ params }: PageProps) {
  const supabase = await createClient();

  const { data: product } = await supabase
    .from('products')
    .select(
      `*,
       category:categories(id, name, slug),
       images:product_images(*),
       variants:product_variants(*),
       prices_by_currency:prices_by_currency(id, currency_id, price, variant_id)`
    )
    .eq('slug', params.slug)
    .eq('is_active', true)
    .single();

  if (!product) notFound();

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

  const { data: related } = product.category_id
    ? await supabase
        .from('products')
        .select(
          'id, name, slug, base_price, images:product_images(id, url, is_primary), prices_by_currency:prices_by_currency(id, currency_id, price, variant_id)'
        )
        .eq('category_id', product.category_id)
        .eq('is_active', true)
        .neq('id', product.id)
        .limit(4)
    : { data: [] };

  return (
    <ProductoDetailClient
      product={product as unknown as Product}
      related={(related ?? []) as unknown as Product[]}
      currencies={(currencies ?? []) as Currency[]}
      currencySettings={(currencySettings ?? null) as CurrencySetting | null}
      exchangeRates={(exchangeRates ?? []) as ExchangeRate[]}
      systemSettings={(systemSettings ?? []) as SystemSetting[]}
    />
  );
}