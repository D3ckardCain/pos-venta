import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { OrderDetailClient } from './OrderDetailClient';
import type { Order } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function OrderDetailPage({ params }: PageProps) {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from('orders')
    .select(
      `*,
       currency:currencies!currency_id(*),
       base_currency:currencies!base_currency_id(*),
       exchange_rate:exchange_rates(*),
       customer:customers(id, full_name, phone, email, address),
       vendor:vendors(id, code, profile:profiles!profile_id(id, full_name, email)),
       created_by_user:profiles!created_by(id, full_name, email),
       items:order_items(
         *,
         product:products(id, name, sku, unit),
         variant:product_variants(id, name, sku)
       ),
       status_history:order_status_history(
         *,
         user:profiles!changed_by(id, full_name, email)
       )`
    )
    .eq('id', params.id)
    .single();

  if (!order) notFound();

  return <OrderDetailClient order={order as unknown as Order} />;
}