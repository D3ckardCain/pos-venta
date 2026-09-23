import { createClient } from '@/lib/supabase/server';
import { MetodosPagoClient } from './MetodosPagoClient';
import type { PaymentMethod } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function MetodosPagoPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('payment_methods')
    .select('*')
    .order('sort_order')
    .order('name');

  return (
    <MetodosPagoClient initialMethods={(data ?? []) as PaymentMethod[]} />
  );
}