import { createClient } from '@/lib/supabase/server';
import { ConfiguracionClient } from './ConfiguracionClient';
import type { SystemSetting, CurrencySetting } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function ConfiguracionPage() {
  const supabase = await createClient();

  const { data: settings } = await supabase.from('system_settings').select('*');

  const { data: currencySettings } = await supabase
    .from('currency_settings')
    .select('*, primary_currency:currencies!primary_currency_id(*)')
    .eq('is_singleton', true)
    .single();

  return (
    <ConfiguracionClient
      initialSettings={(settings ?? []) as SystemSetting[]}
      currencySettings={(currencySettings ?? null) as CurrencySetting | null}
    />
  );
}