import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, role:roles(*)')
    .eq('id', user.id)
    .single();

  const role = (profile as { role?: { name?: string } } | null)?.role?.name;

  if (role === 'admin') {
    redirect('/admin/dashboard');
  } else if (role === 'vendedor') {
    redirect('/vendedor/dashboard');
  } else {
    redirect('/catalogo');
  }
}