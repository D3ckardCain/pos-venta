import { createClient } from '@/lib/supabase/server';
import { ReportesClient } from './ReportesClient';
import type {
  Currency,
  Vendor,
  Customer,
  PaymentMethod,
  Category,
  Product,
} from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function ReportesPage() {
  const supabase = await createClient();

  // Monedas activas
  const { data: currencies } = await supabase
    .from('currencies')
    .select('*')
    .eq('is_active', true)
    .order('code');

  // Vendedores activos
  const { data: vendors } = await supabase
    .from('vendors')
    .select(
      'id, code, type, profile:profiles!profile_id(id, full_name, email)'
    )
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  // Clientes activos (limitado a 500 para no sobrecargar)
  const { data: customers } = await supabase
    .from('customers')
    .select('id, full_name, email, phone')
    .eq('is_active', true)
    .order('full_name')
    .limit(500);

  // Métodos de pago activos
  const { data: paymentMethods } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  // Categorías activas
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  // Productos activos (limitado a 500)
  const { data: products } = await supabase
    .from('products')
    .select('id, name, sku')
    .eq('is_active', true)
    .order('name')
    .limit(500);

  // Moneda principal
  const { data: settings } = await supabase
    .from('currency_settings')
    .select('*, primary_currency:currencies!primary_currency_id(*)')
    .eq('is_singleton', true)
    .single();

  return (
    <ReportesClient
      currencies={(currencies ?? []) as Currency[]}
      vendors={(vendors ?? []) as unknown as Vendor[]}
      customers={
        (customers ?? []) as Pick<
          Customer,
          'id' | 'full_name' | 'email' | 'phone'
        >[]
      }
      paymentMethods={(paymentMethods ?? []) as PaymentMethod[]}
      categories={(categories ?? []) as Pick<Category, 'id' | 'name'>[]}
      products={
        (products ?? []) as Pick<Product, 'id' | 'name' | 'sku'>[]
      }
      primaryCurrency={
        (settings as { primary_currency?: Currency } | null)
          ?.primary_currency ?? null
      }
    />
  );
}