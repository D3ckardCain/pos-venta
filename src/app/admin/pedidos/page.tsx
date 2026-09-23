import { createClient } from '@/lib/supabase/server';
import { PedidosClient } from './PedidosClient';
import type { Order, Currency, Vendor, Customer } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function PedidosPage() {
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from('orders')
    .select(
      `*,
       currency:currencies!currency_id(*),
       base_currency:currencies!base_currency_id(*),
       customer:customers(id, full_name, phone, email, address),
       vendor:vendors(id, code, profile:profiles!profile_id(id, full_name, email))`
    )
    .order('created_at', { ascending: false })
    .limit(1000);

  const { data: currencies } = await supabase
    .from('currencies')
    .select('*')
    .eq('is_active', true)
    .order('code');

  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, code, profile:profiles!profile_id(id, full_name, email)')
    .eq('is_active', true);

  const { data: customers } = await supabase
    .from('customers')
    .select('id, full_name, phone, email, address')
    .eq('is_active', true)
    .order('full_name')
    .limit(500);

  return (
    <PedidosClient
      initialOrders={(orders ?? []) as unknown as Order[]}
      currencies={(currencies ?? []) as Currency[]}
      vendors={(vendors ?? []) as unknown as Vendor[]}
      customers={
        (customers ?? []) as Pick<
          Customer,
          'id' | 'full_name' | 'phone' | 'email' | 'address'
        >[]
      }
    />
  );
}