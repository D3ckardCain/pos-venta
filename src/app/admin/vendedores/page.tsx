import { createClient } from '@/lib/supabase/server';
import { VendedoresClient } from './VendedoresClient';
import type { Vendor } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function VendedoresPage() {
  const supabase = await createClient();

  const { data: vendors } = await supabase
    .from('vendors')
    .select('*, profile:profiles!profile_id(id, full_name, email, phone, avatar_url, is_active)')
    .order('created_at', { ascending: false });

  return (
    <VendedoresClient initialVendors={(vendors ?? []) as unknown as Vendor[]} />
  );
}