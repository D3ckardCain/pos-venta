import { createClient } from '@/lib/supabase/server';
import type { Currency, CurrencySetting } from '@/lib/types/database';
import { MonedasClient } from './MonedasClient';

export const dynamic = 'force-dynamic';

export default async function MonedasPage() {
  const supabase = await createClient();

  const { data: currencies } = await supabase
    .from('currencies')
    .select('*')
    .order('is_active', { ascending: false })
    .order('code', { ascending: true });

  const { data: settings } = await supabase
    .from('currency_settings')
    .select('*')
    .eq('is_singleton', true)
    .single();

  return (
    <MonedasClient
      initialCurrencies={(currencies ?? []) as Currency[]}
      initialSettings={(settings ?? null) as CurrencySetting | null}
    />
  );
}