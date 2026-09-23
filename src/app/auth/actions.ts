'use server';

import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Correo invalido'),
  password: z.string().min(6, 'Minimo 6 caracteres'),
});

export interface ActionState {
  error: string | null;
  success: boolean;
  redirectTo?: string;
}

export async function loginAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? 'Datos invalidos',
      success: false,
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      error:
        error.message === 'Invalid login credentials'
          ? 'Credenciales incorrectas'
          : error.message,
      success: false,
    };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, role:roles(*)')
    .eq('id', data.user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    return { error: 'Perfil no encontrado', success: false };
  }

  const role = (profile as { role?: { name?: string } }).role?.name;

  await supabase
    .from('profiles')
    .update({ last_login: new Date().toISOString() })
    .eq('id', data.user.id);

  let redirectTo = '/catalogo';
  if (role === 'admin') redirectTo = '/admin/dashboard';
  else if (role === 'vendedor') redirectTo = '/vendedor/dashboard';

  return { error: null, success: true, redirectTo };
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const { redirect } = await import('next/navigation');
  redirect('/auth/login');
}