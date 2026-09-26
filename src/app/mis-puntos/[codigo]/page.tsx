import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Award,
  ShoppingBag,
  Phone,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertCircle,
  Store,
  MessageCircle,
} from 'lucide-react';
import type { Currency } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { codigo: string };
}

export default async function MisPuntosPage({ params }: PageProps) {
  const supabase = await createClient();

  // Buscar cliente por código secreto
  const { data: customer } = await supabase
    .from('customers')
    .select('id, code, full_name, phone, is_active, public_secret_code')
    .eq('public_secret_code', params.codigo)
    .eq('is_active', true)
    .maybeSingle();

  if (!customer) {
    notFound();
  }

  // Puntos del cliente
  const { data: pointsData } = await supabase
    .from('customer_points')
    .select('points, lifetime_points, updated_at')
    .eq('customer_id', customer.id)
    .maybeSingle();

  const points = Number(pointsData?.points ?? 0);
  const lifetimePoints = Number(pointsData?.lifetime_points ?? 0);

  // Historial reciente (últimos 20)
  const { data: movements } = await supabase
    .from('customer_points_movements')
    .select(
      'id, movement_type, points, balance_after, description, created_at'
    )
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })
    .limit(20);

  // Moneda principal
  const { data: currencySettings } = await supabase
    .from('currency_settings')
    .select('*, primary_currency:currencies!primary_currency_id(*)')
    .eq('is_singleton', true)
    .single();

  const primaryCurrency =
    (currencySettings as { primary_currency?: Currency } | null)
      ?.primary_currency ?? null;

  // Configuración de puntos
  const { data: settingsData } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', ['points_per_currency_unit', 'points_expiration_days']);

  const settingsMap = new Map<string, unknown>();
  for (const s of settingsData ?? []) settingsMap.set(s.key, s.value);

  const toNum = (v: unknown, def: number): number => {
    if (v === null || v === undefined) return def;
    const n = Number(v);
    return isNaN(n) ? def : n;
  };

  const pointsPerUnit = toNum(settingsMap.get('points_per_currency_unit'), 1);
  const expirationDays = toNum(settingsMap.get('points_expiration_days'), 0);

  const pointValue = pointsPerUnit > 0 ? 1 / pointsPerUnit : 0;
  const pointsValueInMoney = points * pointValue;

  // Datos del negocio
  const { data: businessSettings } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', ['business_name', 'business_phone']);

  const businessMap = new Map<string, unknown>();
  for (const s of businessSettings ?? []) businessMap.set(s.key, s.value);

  const businessName = String(businessMap.get('business_name') ?? 'Mi Negocio');
  const businessPhone = String(businessMap.get('business_phone') ?? '');

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Store className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">{businessName}</p>
              <p className="text-xs text-muted-foreground">Mis puntos</p>
            </div>
          </div>
          {businessPhone && (
            <a
              href={`https://wa.me/${businessPhone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Contactar
            </a>
          )}
        </div>
      </header>

      {/* Contenido */}
      <main className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        {/* Saludo */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Hola, {customer.full_name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aquí puedes ver tus puntos acumulados.
          </p>
        </div>

        {/* Card de puntos principal */}
        <div className="rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-6 text-center">
          <div className="flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/20 text-primary">
              <Award className="h-7 w-7" />
            </div>
          </div>
          <p className="mt-4 text-sm uppercase tracking-wider text-muted-foreground">
            Puntos disponibles
          </p>
          <p className="mt-2 text-5xl font-bold text-primary">{points}</p>
          {primaryCurrency && (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Equivalen a
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {formatMoney(pointsValueInMoney, primaryCurrency)}
              </p>
            </>
          )}
          {lifetimePoints > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Has acumulado {lifetimePoints} puntos en total
            </p>
          )}
        </div>

        {/* Cómo canjear */}
        <div className="rounded-lg border bg-background p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ShoppingBag className="h-4 w-4" />
            ¿Cómo canjear?
          </h2>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="font-semibold text-foreground">1.</span>
              Cuando estés en la tienda, dile al vendedor tu nombre o teléfono.
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-foreground">2.</span>
              El vendedor te enviará un código por WhatsApp.
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-foreground">3.</span>
              Muéstrale el código al vendedor y podrás usar tus puntos para
              pagar.
            </li>
          </ol>
        </div>

        {/* Info de caducidad */}
        {expirationDays > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
            <strong>Aviso:</strong> Tus puntos caducan a los{' '}
            <strong>{expirationDays} días</strong> desde que los acumulas.
            Aprovechalos pronto.
          </div>
        )}

        {/* Historial reciente */}
        {movements && movements.length > 0 && (
          <div className="rounded-lg border bg-background">
            <div className="border-b px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4" />
                Movimientos recientes
              </h2>
            </div>
            <div className="divide-y">
              {movements.map((m) => (
                <MovementRow key={m.id} movement={m} />
              ))}
            </div>
          </div>
        )}

        {(!movements || movements.length === 0) && (
          <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            <AlertCircle className="mx-auto mb-2 h-6 w-6" />
            Aún no tienes movimientos de puntos.
            <br />
            Cuando compres en {businessName} y des tu nombre o teléfono,
            empezarás a acumular puntos.
          </div>
        )}

        {/* Footer */}
        <div className="pt-4 text-center text-xs text-muted-foreground">
          <p>
            {businessName} · Programa de fidelidad
          </p>
          {customer.code && (
            <p className="mt-1 font-mono">Código: {customer.code}</p>
          )}
        </div>
      </main>
    </div>
  );
}

// ============================================
// SUBCOMPONENTES
// ============================================
function MovementRow({
  movement,
}: {
  movement: {
    id: string;
    movement_type: string;
    points: number;
    balance_after: number;
    description: string | null;
    created_at: string;
  };
}) {
  const isPositive = movement.points > 0;

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isPositive
            ? 'bg-emerald-50 text-emerald-600'
            : 'bg-amber-50 text-amber-600'
        }`}
      >
        {isPositive ? (
          <TrendingUp className="h-4 w-4" />
        ) : (
          <TrendingDown className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {movement.description ?? labelForType(movement.movement_type)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {new Date(movement.created_at).toLocaleString('es-MX')}
        </p>
      </div>
      <div className="text-right">
        <p
          className={`font-mono text-sm font-semibold ${
            isPositive ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {isPositive ? `+${movement.points}` : movement.points}
        </p>
        <p className="text-xs text-muted-foreground">
          Saldo: {movement.balance_after}
        </p>
      </div>
    </div>
  );
}

function labelForType(type: string): string {
  switch (type) {
    case 'acumulacion':
      return 'Puntos acumulados';
    case 'canje':
      return 'Canje de puntos';
    case 'expiracion':
      return 'Puntos expirados';
    case 'ajuste':
      return 'Ajuste';
    default:
      return 'Movimiento';
  }
}

function formatMoney(amount: number, currency: Currency): string {
  const fixed = Number(amount).toFixed(currency.decimals);
  const [intPart, decPart] = fixed.split('.');
  const intFormatted = intPart.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    currency.thousand_separator
  );
  const formatted =
    currency.decimals > 0
      ? `${intFormatted}${currency.decimal_separator}${decPart}`
      : intFormatted;
  return currency.symbol_position === 'before'
    ? `${currency.symbol}${formatted}`
    : `${formatted}${currency.symbol}`;
}