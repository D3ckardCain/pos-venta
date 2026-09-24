import { createClient } from '@/lib/supabase/server';
import { PagosClient } from './PagosClient';
import type { Currency, Vendor } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function PagosPage() {
  const supabase = await createClient();

  // Vendedores/mensajeros con acumulado pendiente o histórico
  const { data: vendors } = await supabase
    .from('vendors')
    .select(
      '*, profile:profiles!profile_id(id, full_name, email, phone, is_active)'
    )
    .order('pending_commission', { ascending: false });

  // Monedas activas para el pago
  const { data: currencies } = await supabase
    .from('currencies')
    .select('*')
    .eq('is_active', true)
    .order('code');

  // Moneda principal
  const { data: settings } = await supabase
    .from('currency_settings')
    .select('*, primary_currency:currencies!primary_currency_id(*)')
    .eq('is_singleton', true)
    .single();

  return (
    <PagosClient
      initialVendors={(vendors ?? []) as unknown as Vendor[]}
      currencies={(currencies ?? []) as Currency[]}
      primaryCurrency={
        (settings as { primary_currency?: Currency } | null)?.primary_currency ??
        null
      }
    />
  );
}