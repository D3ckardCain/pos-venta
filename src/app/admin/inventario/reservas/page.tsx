import { createClient } from '@/lib/supabase/server';
import { ReservasClient } from './ReservasClient';
import type { InventoryReservation } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function ReservasPage() {
  const supabase = await createClient();

  const { data: reservations } = await supabase
    .from('inventory_reservations')
    .select(
      `*,
       product:products(id, name, sku),
       variant:product_variants(id, name, sku)`
    )
    .order('created_at', { ascending: false })
    .limit(500);

  return (
    <ReservasClient
      initialReservations={
        (reservations ?? []) as unknown as InventoryReservation[]
      }
    />
  );
}