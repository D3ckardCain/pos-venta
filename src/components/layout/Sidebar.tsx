'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  Tags,
  Boxes,
  ShoppingCart,
  ClipboardList,
  Users,
  UserCog,
  Shield,
  Coins,
  RefreshCw,
  Wallet,
  CreditCard,
  Percent,
  Award,
  BarChart3,
  FileSearch,
  Settings,
  Store,
  History,
  Lock,
  Bell,
  DollarSign,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'General',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Catálogo',
    items: [
      { href: '/admin/productos', label: 'Productos', icon: Package },
      { href: '/admin/categorias', label: 'Categorías', icon: Tags },
      { href: '/admin/inventario', label: 'Inventario', icon: Boxes },
      { href: '/admin/inventario/kardex', label: 'Kardex', icon: History },
      { href: '/admin/inventario/reservas', label: 'Reservas', icon: Lock },
      { href: '/admin/promociones', label: 'Promociones', icon: Percent },
    ],
  },
  {
    title: 'Operaciones',
    items: [
      { href: '/admin/ventas', label: 'Ventas', icon: ShoppingCart },
      { href: '/admin/pedidos', label: 'Pedidos', icon: ClipboardList },
      { href: '/admin/cajas', label: 'Cajas', icon: Wallet },
      { href: '/admin/pagos', label: 'Pagos Vendedores', icon: DollarSign },
      { href: '/admin/metodos-pago', label: 'Métodos de Pago', icon: CreditCard },
    ],
  },
  {
    title: 'Personas',
    items: [
      { href: '/admin/clientes', label: 'Clientes', icon: Users },
      { href: '/admin/vendedores', label: 'Vendedores', icon: UserCog },
      { href: '/admin/puntos', label: 'Puntos', icon: Award },
    ],
  },
  {
    title: 'Monedas',
    items: [
      { href: '/admin/monedas', label: 'Monedas', icon: Coins },
      { href: '/admin/tipos-cambio', label: 'Tipos de Cambio', icon: RefreshCw },
    ],
  },
  {
    title: 'Análisis',
    items: [
      { href: '/admin/reportes', label: 'Reportes', icon: BarChart3 },
      { href: '/admin/auditoria', label: 'Auditoría', icon: FileSearch },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { href: '/admin/usuarios', label: 'Usuarios', icon: Shield },
      { href: '/admin/roles', label: 'Roles', icon: Shield },
      { href: '/admin/notificaciones', label: 'Notificaciones', icon: Bell },
      { href: '/admin/configuracion', label: 'Configuración', icon: Settings },
      { href: '/catalogo', label: 'Ver Catálogo', icon: Store },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-background lg:flex lg:flex-col">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/admin/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Store className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold">
            {process.env.NEXT_PUBLIC_APP_NAME ?? 'Mi Negocio'}
          </span>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-4">
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  pathname.startsWith(item.href + '/');
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={
                        active
                          ? 'flex items-center gap-3 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary'
                          : 'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground'
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}