import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { CashSessionDetailClient } from './CashSessionDetailClient';
import type { CashSession, Currency } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function CashSessionDetailPage({ params }: PageProps) {
  const supabase = await createClient();

  const { data: session } = await supabase
    .from('cash_sessions')
    .select(
      `*,
       opened_by_user:profiles!opened_by(id, full_name, email),
       closed_by_user:profiles!closed_by(id, full_name, email),
       movements:cash_movements(
         *,
         currency:currencies(*),
         payment_method:payment_methods(id, name, code),
         user:profiles!created_by(id, full_name, email)
       )`
    )
    .eq('id', params.id)
    .single();

  if (!session) notFound();

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

  const { data: differences } = await supabase
    .from('cash_differences')
    .select(
      `*,
       currency:currencies(*),
       payment_method:payment_methods(id, name, code),
       resolved_by_user:profiles!resolved_by(id, full_name, email)`
    )
    .eq('cash_session_id', params.id)
    .order('created_at', { ascending: false });

  return (
    <CashSessionDetailClient
      session={session as unknown as CashSession}
      currencies={(currencies ?? []) as Currency[]}
      paymentMethods={paymentMethods ?? []}
      differences={differences ?? []}
    />
  );
}