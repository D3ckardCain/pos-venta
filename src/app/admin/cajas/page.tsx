import { createClient } from '@/lib/supabase/server';
import { CajasClient } from './CajasClient';
import type { CashSession, Currency } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function CajasPage() {
  const supabase = await createClient();

  const { data: sessions } = await supabase
    .from('cash_sessions')
    .select(
      `*,
       opened_by_user:profiles!opened_by(id, full_name, email),
       closed_by_user:profiles!closed_by(id, full_name, email)`
    )
    .order('opened_at', { ascending: false })
    .limit(500);

  const { data: currencies } = await supabase
    .from('currencies')
    .select('*')
    .eq('is_active', true)
    .order('code');

  const { data: paymentMethods } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  return (
    <CajasClient
      initialSessions={(sessions ?? []) as unknown as CashSession[]}
      currencies={(currencies ?? []) as Currency[]}
      paymentMethods={paymentMethods ?? []}
    />
  );
}