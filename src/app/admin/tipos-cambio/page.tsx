import { createClient } from '@/lib/supabase/server';
import type { Currency, ExchangeRate, ExchangeRateHistory } from '@/lib/types/database';
import { TiposCambioClient } from './TiposCambioClient';

export const dynamic = 'force-dynamic';

export default async function TiposCambioPage() {
  const supabase = await createClient();

  // Todas las monedas (activas e inactivas) para poder mostrarlas en el formulario de edición
  const { data: currencies } = await supabase
    .from('currencies')
    .select('*')
    .order('code');

  const { data: rates } = await supabase
    .from('exchange_rates')
    .select(
      '*, from_currency:currencies!from_currency_id(*), to_currency:currencies!to_currency_id(*)'
    )
    .order('created_at', { ascending: false });

  const { data: history } = await supabase
    .from('exchange_rate_history')
    .select(
      '*, from_currency:currencies!from_currency_id(*), to_currency:currencies!to_currency_id(*)'
    )
    .order('changed_at', { ascending: false })
    .limit(50);

  return (
    <TiposCambioClient
      currencies={(currencies ?? []) as Currency[]}
      initialRates={(rates ?? []) as ExchangeRate[]}
      initialHistory={(history ?? []) as ExchangeRateHistory[]}
    />
  );
}