import { createClient } from '@/lib/supabase/server';
import { HistorialPagosClient } from './HistorialPagosClient';
import type { VendorPayment, Currency, Vendor } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: {
    vendor_id?: string;
    currency_id?: string;
    payment_method?: string;
    from?: string;
    to?: string;
    q?: string;
  };
}

export default async function HistorialPagosPage({ searchParams }: PageProps) {
  const supabase = await createClient();

  let query = supabase
    .from('vendor_payments')
    .select(
      `*,
       vendor:vendors(id, code, type, profile:profiles!profile_id(id, full_name, email)),
       base_currency:currencies!base_currency_id(*),
       paid_currency:currencies!paid_currency_id(*),
       paid_by_user:profiles!paid_by(id, full_name, email)`
    )
    .order('paid_at', { ascending: false })
    .limit(500);

  if (searchParams.vendor_id) query = query.eq('vendor_id', searchParams.vendor_id);
  if (searchParams.currency_id) query = query.eq('paid_currency_id', searchParams.currency_id);
  if (searchParams.payment_method) query = query.eq('payment_method', searchParams.payment_method);
  if (searchParams.from) query = query.gte('paid_at', searchParams.from);
  if (searchParams.to) query = query.lte('paid_at', searchParams.to);

  const { data: payments } = await query;

  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, code, type, profile:profiles!profile_id(id, full_name, email)')
    .order('created_at', { ascending: false });

  const { data: currencies } = await supabase
    .from('currencies')
    .select('*')
    .eq('is_active', true)
    .order('code');

  const { data: settings } = await supabase
    .from('currency_settings')
    .select('*, primary_currency:currencies!primary_currency_id(*)')
    .eq('is_singleton', true)
    .single();

  return (
    <HistorialPagosClient
      initialPayments={(payments ?? []) as unknown as VendorPayment[]}
      vendors={(vendors ?? []) as unknown as Vendor[]}
      currencies={(currencies ?? []) as Currency[]}
      primaryCurrency={
        (settings as { primary_currency?: Currency } | null)?.primary_currency ?? null
      }
      initialFilters={searchParams}
    />
  );
}