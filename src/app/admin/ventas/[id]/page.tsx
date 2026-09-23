import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { SaleDetailClient } from './SaleDetailClient';
import type { Sale } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function SaleDetailPage({ params }: PageProps) {
  const supabase = await createClient();

  const { data: sale } = await supabase
    .from('sales')
    .select(
      `*,
       currency:currencies!currency_id(*),
       base_currency:currencies!base_currency_id(*),
       exchange_rate:exchange_rates(*),
       customer:customers(id, full_name, phone, email),
       payment_method:payment_methods(id, name, code),
       cash_register:cash_registers(id, name, code),
       vendor:vendors(id, code, profile:profiles!profile_id(id, full_name, email)),
       created_by_user:profiles!created_by(id, full_name, email),
       items:sale_items(
         *,
         product:products(id, name, sku, unit),
         variant:product_variants(id, name, sku)
       )`
    )
    .eq('id', params.id)
    .single();

  if (!sale) notFound();

  return <SaleDetailClient sale={sale as unknown as Sale} />;
}