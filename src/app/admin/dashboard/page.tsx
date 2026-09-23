import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
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

  const fullName =
    (profile as { full_name?: string } | null)?.full_name ?? 'Usuario';

  return (
    <div className="p-8">
      <div className="rounded-lg border bg-background p-8 text-center">
        <h2 className="text-2xl font-bold">Bienvenido, {fullName}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Has iniciado sesion correctamente como administrador.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Los modulos del sistema se iran construyendo en las siguientes entregas.
        </p>
      </div>
    </div>
  );
}