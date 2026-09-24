'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState } from 'react-dom';
import {
  Wallet,
  UserCog,
  Truck,
  AlertCircle,
  Filter,
  DollarSign,
} from 'lucide-react';
import type { Vendor, Currency } from '@/lib/types/database';
import { payVendorAction, type ActionState } from './actions';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { SearchBar } from '@/components/shared/SearchBar';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, convertCurrency } from '@/lib/utils/currency';

const initialActionState: ActionState = {
  error: null,
  success: false,
  timestamp: 0,
};

interface Props {
  initialVendors: Vendor[];
  currencies: Currency[];
  primaryCurrency: Currency | null;
}

export function PagosClient({
  initialVendors,
  currencies,
  primaryCurrency,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<
    'all' | 'vendedor' | 'mensajero' | 'ambos'
  >('all');
  const [filterPending, setFilterPending] = useState<'all' | 'with' | 'without'>(
    'all'
  );

  const [paying, setPaying] = useState<Vendor | null>(null);

  const filtered = useMemo(() => {
    let list = [...initialVendors];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (v) =>
          (v.profile?.full_name ?? '').toLowerCase().includes(q) ||
          (v.profile?.email ?? '').toLowerCase().includes(q) ||
          (v.code ?? '').toLowerCase().includes(q)
      );
    }

    if (filterType !== 'all') list = list.filter((v) => v.type === filterType);

    if (filterPending === 'with')
      list = list.filter((v) => Number(v.pending_commission) > 0);
    if (filterPending === 'without')
      list = list.filter((v) => Number(v.pending_commission) === 0);

    return list;
  }, [initialVendors, search, filterType, filterPending]);

  const totalPending = useMemo(
    () =>
      initialVendors.reduce(
        (sum, v) => sum + Number(v.pending_commission ?? 0),
        0
      ),
    [initialVendors]
  );

  const withPending = useMemo(
    () => initialVendors.filter((v) => Number(v.pending_commission) > 0).length,
    [initialVendors]
  );

  const activeFiltersCount =
    (search ? 1 : 0) +
    (filterType !== 'all' ? 1 : 0) +
    (filterPending !== 'all' ? 1 : 0);

  function clearFilters() {
    setSearch('');
    setFilterType('all');
    setFilterPending('all');
  }

  const columns: Column<Vendor>[] = [
    {
      key: 'name',
      header: 'Vendedor / Mensajero',
      render: (v) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
            {v.type === 'mensajero' ? (
              <Truck className="h-4 w-4 text-muted-foreground" />
            ) : (
              <UserCog className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div>
            <p className="font-medium">{v.profile?.full_name ?? '—'}</p>
            <p className="text-xs text-muted-foreground">
              {v.profile?.email ?? '—'}
              {v.code ? ` · ${v.code}` : ''}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (v) => {
        const tone =
          v.type === 'mensajero'
            ? 'info'
            : v.type === 'ambos'
            ? 'warning'
            : 'default';
        return (
          <Badge tone={tone as 'info' | 'warning' | 'default'}>
            {v.type}
          </Badge>
        );
      },
    },
    {
      key: 'commission_mode',
      header: 'Modo comisión',
      render: (v) => (
        <span className="text-xs text-muted-foreground">
          {v.type === 'mensajero'
            ? '—'
            : v.commission_mode === 'profit'
            ? 'Sobre utilidad'
            : 'Sobre total'}
        </span>
      ),
    },
    {
      key: 'commission_rate',
      header: '% Comisión',
      render: (v) => (
        <span className="font-mono text-sm">
          {Number(v.commission_rate).toFixed(2)}%
        </span>
      ),
    },
    {
      key: 'delivery',
      header: 'Entrega',
      render: (v) =>
        v.type === 'vendedor' ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {primaryCurrency
              ? formatCurrency(Number(v.delivery_fixed_fee), primaryCurrency)
              : Number(v.delivery_fixed_fee).toFixed(2)}{' '}
            + {Number(v.delivery_commission_rate).toFixed(1)}%
          </span>
        ),
    },
    {
      key: 'pending',
      header: 'Acumulado pendiente',
      render: (v) => {
        const amount = Number(v.pending_commission);
        if (amount <= 0)
          return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <span className="font-mono text-sm font-semibold text-amber-600">
            {primaryCurrency
              ? formatCurrency(amount, primaryCurrency)
              : amount.toFixed(2)}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (v) => {
        const amount = Number(v.pending_commission);
        if (amount <= 0) {
          return (
            <span className="text-xs text-muted-foreground">Sin pendiente</span>
          );
        }
        return (
          <Button size="sm" onClick={() => setPaying(v)}>
            <DollarSign className="h-4 w-4" />
            Pagar
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Pagos a Vendedores y Mensajeros
          </h1>
          <p className="text-sm text-muted-foreground">
            Acumulado de comisiones y entregas. Marca como pagado cuando
            entregues el dinero.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Total pendiente"
          value={
            primaryCurrency
              ? formatCurrency(totalPending, primaryCurrency)
              : totalPending.toFixed(2)
          }
          icon={<Wallet className="h-4 w-4" />}
          tone="warning"
        />
        <KpiCard
          label="Con pendiente"
          value={String(withPending)}
          icon={<AlertCircle className="h-4 w-4" />}
          tone="warning"
        />
        <KpiCard
          label="Total personas"
          value={String(initialVendors.length)}
          icon={<UserCog className="h-4 w-4" />}
        />
      </div>

      {/* Filtros */}
      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre, email o código…"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filterType}
              onChange={(e) =>
                setFilterType(e.target.value as typeof filterType)
              }
              className="w-40"
            >
              <option value="all">Tipo: todos</option>
              <option value="vendedor">Solo vendedores</option>
              <option value="mensajero">Solo mensajeros</option>
              <option value="ambos">Ambos</option>
            </Select>
            <Select
              value={filterPending}
              onChange={(e) =>
                setFilterPending(e.target.value as typeof filterPending)
              }
              className="w-44"
            >
              <option value="all">Pendiente: todos</option>
              <option value="with">Con pendiente</option>
              <option value="without">Sin pendiente</option>
            </Select>
            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <Filter className="h-3.5 w-3.5" />
                Limpiar ({activeFiltersCount})
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-lg border bg-background">
        {filtered.length === 0 ? (
          <EmptyState
            title={search ? 'Sin resultados' : 'No hay personas registradas'}
            description={
              search
                ? 'Prueba con otro término de búsqueda.'
                : 'Crea vendedores o mensajeros para comenzar.'
            }
            icon={<Wallet className="h-8 w-8" />}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(v) => v.id}
          />
        )}
      </div>

      {/* Modal de pago */}
      {paying && (
        <PayVendorModal
          vendor={paying}
          currencies={currencies}
          primaryCurrency={primaryCurrency}
          onClose={() => setPaying(null)}
          onSuccess={() => {
            setPaying(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ============================================
// MODAL: PAGAR A VENDEDOR/MENSAJERO
// ============================================
function PayVendorModal({
  vendor,
  currencies,
  primaryCurrency,
  onClose,
  onSuccess,
}: {
  vendor: Vendor;
  currencies: Currency[];
  primaryCurrency: Currency | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { showToast } = useToast();
  const [state, formAction] = useFormState(payVendorAction, initialActionState);
  const [isPending, startTransition] = useTransition();
  const supabase = createClient();

  const [currencyId, setCurrencyId] = useState(primaryCurrency?.id ?? '');
  const [paymentMethod, setPaymentMethod] = useState<
    'efectivo' | 'transferencia' | 'otro'
  >('efectivo');
  const [notes, setNotes] = useState('');

  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [loadingRate, setLoadingRate] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  const amountBase = Number(vendor.pending_commission);
  const selectedCurrency = currencies.find((c) => c.id === currencyId);
  const isBaseCurrency =
    !primaryCurrency ||
    !selectedCurrency ||
    selectedCurrency.id === primaryCurrency.id;

  // Cargar el tipo de cambio cuando cambia la moneda de pago
  useEffect(() => {
    if (!selectedCurrency || !primaryCurrency) return;

    if (selectedCurrency.id === primaryCurrency.id) {
      setExchangeRate(1);
      setRateError(null);
      return;
    }

    setLoadingRate(true);
    setRateError(null);

    (async () => {
      const { data, error } = await supabase.rpc('get_current_exchange_rate', {
        p_from_currency: selectedCurrency.id,
        p_to_currency: primaryCurrency.id,
      });

      if (error) {
        setExchangeRate(null);
        setRateError('Error al obtener el tipo de cambio');
        setLoadingRate(false);
        return;
      }

      const row = Array.isArray(data) ? data[0] : null;
      if (row) {
        setExchangeRate(Number(row.rate_value));
      } else {
        setExchangeRate(null);
        setRateError('No hay tipo de cambio configurado para esta moneda');
      }
      setLoadingRate(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currencyId, primaryCurrency]);

  // Calcular el monto en la moneda de pago
  const amountPaid =
    !isBaseCurrency && exchangeRate && selectedCurrency && primaryCurrency
      ? convertCurrency(
          amountBase,
          1 / exchangeRate, // desde moneda principal a moneda de pago
          selectedCurrency.decimals
        )
      : amountBase;

  if (state.success) {
    showToast('Pago registrado correctamente', 'success');
    onSuccess();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Pagar a ${vendor.profile?.full_name ?? 'vendedor'}`}
      description="Confirma la moneda y la forma de pago. El acumulado se reiniciará a 0."
    >
      <form id="pay-vendor-form" action={formAction} className="space-y-4">
        <input type="hidden" name="vendor_id" value={vendor.id} />

        {/* Monto con conversión */}
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            Monto pendiente en {primaryCurrency?.code ?? 'moneda principal'}
          </p>
          <p className="mt-1 font-mono text-xl font-semibold">
            {primaryCurrency
              ? formatCurrency(amountBase, primaryCurrency)
              : amountBase.toFixed(2)}
          </p>

          {!isBaseCurrency && (
            <div className="mt-3 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                Equivalente a pagar en {selectedCurrency?.code ?? '—'}
              </p>
              {loadingRate ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Calculando…
                </p>
              ) : rateError ? (
                <p className="mt-1 text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {rateError}
                </p>
              ) : (
                <p className="mt-1 font-mono text-2xl font-bold text-primary">
                  {selectedCurrency
                    ? formatCurrency(amountPaid, selectedCurrency)
                    : amountPaid.toFixed(2)}
                </p>
              )}
              {exchangeRate && !loadingRate && !rateError && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Tipo de cambio: 1 {selectedCurrency?.code} ={' '}
                  {exchangeRate.toFixed(6).replace(/\.?0+$/, '')}{' '}
                  {primaryCurrency?.code}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Moneda de pago */}
        <Select
          label="Moneda de pago"
          name="payment_currency_id"
          value={currencyId}
          onChange={(e) => setCurrencyId(e.target.value)}
          error={state.fieldErrors?.payment_currency_id}
          required
        >
          {currencies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </Select>

        {/* Forma de pago */}
        <Select
          label="Forma de pago"
          name="payment_method"
          value={paymentMethod}
          onChange={(e) =>
            setPaymentMethod(
              e.target.value as 'efectivo' | 'transferencia' | 'otro'
            )
          }
          error={state.fieldErrors?.payment_method}
          required
        >
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="otro">Otro</option>
        </Select>

        {/* Notas */}
        <Textarea
          label="Notas (opcional)"
          name="notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observaciones sobre el pago…"
        />

        {state.error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={isPending}
            disabled={loadingRate || !!rateError}
          >
            Confirmar pago
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================
// AUXILIARES
// ============================================
function KpiCard({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: 'default' | 'warning';
}) {
  const toneClass =
    tone === 'warning'
      ? 'bg-amber-50 text-amber-600'
      : 'bg-primary/10 text-primary';

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-semibold">{value}</p>
        </div>
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-md ${toneClass}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}