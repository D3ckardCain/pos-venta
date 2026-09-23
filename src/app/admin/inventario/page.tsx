import { createClient } from '@/lib/supabase/server';
import { InventarioClient } from './InventarioClient';
import type {
  Inventory,
  Category,
  Currency,
  InventoryMovement,
} from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function InventarioPage() {
  const supabase = await createClient();

  const { data: inventory } = await supabase
    .from('inventory')
    .select(
      `*,
       product:products(id, name, sku, slug, unit, min_stock, cost, base_price, category_id, is_active),
       variant:product_variants(id, name, sku)`
    )
    .order('updated_at', { ascending: false });

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .order('name');

  const { data: settings } = await supabase
    .from('currency_settings')
    .select('*, primary_currency:currencies!primary_currency_id(*)')
    .eq('is_singleton', true)
    .single();

  const { data: recentMovements } = await supabase
    .from('inventory_movements')
    .select(
      `*,
       product:products(id, name, sku),
       variant:product_variants(id, name, sku),
       user:profiles!created_by(id, full_name, email)`
    )
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <InventarioClient
      initialInventory={(inventory ?? []) as unknown as Inventory[]}
      categories={(categories ?? []) as Pick<Category, 'id' | 'name'>[]}
      primaryCurrency={
        (settings as { primary_currency?: Currency } | null)?.primary_currency ??
        null
      }
      recentMovements={(recentMovements ?? []) as unknown as InventoryMovement[]}
    />
  );
}