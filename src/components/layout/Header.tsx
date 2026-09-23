'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, User, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function Header() {
  const router = useRouter();
  const [email, setEmail] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [role, setRole] = useState<string>('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();

    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setEmail(user.email ?? '');

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role:roles(name)')
        .eq('id', user.id)
        .single();

      if (profile) {
        setFullName(
          (profile as { full_name?: string }).full_name ?? 'Usuario'
        );
        const r = (profile as { role?: { name?: string } }).role?.name;
        if (r) setRole(r);
      }
    }

    loadProfile();
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-medium text-muted-foreground">
          Panel de Administracion
        </h1>
      </div>

      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="h-3.5 w-3.5" />
          </div>
          <span className="hidden sm:inline">
            {fullName || email || 'Usuario'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-56 rounded-md border bg-background p-1 shadow-lg z-50"
          >
            <div className="border-b px-3 py-2">
              <p className="text-sm font-medium">{fullName || 'Usuario'}</p>
              <p className="text-xs text-muted-foreground">{email}</p>
              {role && (
                <p className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary capitalize">
                  {role}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesion
            </button>
          </div>
        )}
      </div>
    </header>
  );
}