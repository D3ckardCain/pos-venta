import { createClient } from '@/lib/supabase/server';
import { ClientesClient } from './ClientesClient';
import type { Customer } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function ClientesPage() {
  const supabase = await createClient();

  const { data: customers } = await supabase
    .from('customers')
    .select('*, points:customer_points(points, lifetime_points)')
    .order('created_at', { ascending: false })
    .limit(2000);

  return (
    <ClientesClient initialCustomers={(customers ?? []) as Customer[]} />
  );
}