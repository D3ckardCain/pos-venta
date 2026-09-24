import { createClient } from '@/lib/supabase/server';
import { VendedoresClient } from './VendedoresClient';
import type { Vendor, Currency } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function VendedoresPage() {
  const supabase = await createClient();

  const { data: vendors } = await supabase
    .from('vendors')
    .select(
      '*, profile:profiles!profile_id(id, full_name, email, phone, avatar_url, is_active)'
    )
    .order('created_at', { ascending: false });

  const { data: settings } = await supabase
    .from('currency_settings')
    .select('*, primary_currency:currencies!primary_currency_id(*)')
    .eq('is_singleton', true)
    .single();

  return (
    <VendedoresClient
      initialVendors={(vendors ?? []) as unknown as Vendor[]}
      primaryCurrency={
        (settings as { primary_currency?: Currency } | null)?.primary_currency ??
        null
      }
    />
  );
}