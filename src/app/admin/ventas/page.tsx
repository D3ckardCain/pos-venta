import { createClient } from '@/lib/supabase/server';
import { VentasClient } from './VentasClient';
import type {
  Sale,
  Currency,
  PaymentMethod,
  Vendor,
  Customer,
  CashRegister,
  ParkedSale,
} from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function VentasPage() {
  const supabase = await createClient();

  const { data: sales } = await supabase
    .from('sales')
    .select(
      `*,
       currency:currencies!currency_id(*),
       base_currency:currencies!base_currency_id(*),
       customer:customers(id, full_name, phone, email),
       payment_method:payment_methods(id, name, code),
       vendor:vendors(id, code, profile:profiles!profile_id(id, full_name, email))`
    )
    .order('created_at', { ascending: false })
    .limit(1000);

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

  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, code, profile:profiles!profile_id(id, full_name, email)')
    .eq('is_active', true);

  const { data: customers } = await supabase
    .from('customers')
    .select('id, full_name, phone, email')
    .eq('is_active', true)
    .order('full_name')
    .limit(500);

  const { data: cashRegisters } = await supabase
    .from('cash_registers')
    .select('*')
    .eq('is_active', true)
    .order('name');

  const { data: parkedSales } = await supabase
    .from('parked_sales')
    .select(
      `*,
       customer:customers(id, full_name),
       currency:currencies(*),
       created_by_user:profiles!created_by(id, full_name, email)`
    )
    .order('created_at', { ascending: false });

  return (
    <VentasClient
      initialSales={(sales ?? []) as unknown as Sale[]}
      initialParkedSales={(parkedSales ?? []) as unknown as ParkedSale[]}
      currencies={(currencies ?? []) as Currency[]}
      paymentMethods={(paymentMethods ?? []) as PaymentMethod[]}
      vendors={(vendors ?? []) as unknown as Vendor[]}
      customers={
        (customers ?? []) as Pick<
          Customer,
          'id' | 'full_name' | 'phone' | 'email'
        >[]
      }
      cashRegisters={(cashRegisters ?? []) as CashRegister[]}
    />
  );
}