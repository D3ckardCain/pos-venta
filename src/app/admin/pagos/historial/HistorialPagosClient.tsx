'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Eye,
  Download,
  Filter,
  DollarSign,
  Wallet,
  Calendar,
} from 'lucide-react';
import type {
  VendorPayment,
  Vendor,
  Currency,
  VendorPaymentItem,
} from '@/lib/types/database';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { SearchBar } from '@/components/shared/SearchBar';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/utils/currency';
import { exportPaymentsExcelAction } from '../actions';

interface Props {
  initialPayments: VendorPayment[];
  vendors: Vendor[];
  currencies: Currency[];
  primaryCurrency: Currency | null;
  initialFilters: {
    vendor_id?: string;
    currency_id?: string;
    payment_method?: string;
    from?: string;
    to?: string;
    q?: string;
  };
}

interface PaymentWithRelations extends VendorPayment {
  vendor?: {
    id: string;
    code: string | null;
    type: string;
    profile?: {
      id: string;
      full_name: string | null;
      email: string;
    } | null;
  } | null;
}

export function HistorialPagosClient({
  initialPayments,
  vendors,
  currencies,
  primaryCurrency,
  initialFilters,
}: Props) {
  const { showToast } = useToast();

  const [search, setSearch] = useState(initialFilters.q ?? '');
  const [filterVendor, setFilterVendor] = useState(initialFilters.vendor_id ?? 'all');
  const [filterCurrency, setFilterCurrency] = useState(initialFilters.currency_id ?? 'all');
  const [filterMethod, setFilterMethod] = useState(initialFilters.payment_method ?? 'all');
  const [filterFrom, setFilterFrom] = useState(initialFilters.from ?? '');
  const [filterTo, setFilterTo] = useState(initialFilters.to ?? '');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [viewing, setViewing] = useState<PaymentWithRelations | null>(null);
  const [isPending, setIsPending] = useState(false);

  const filtered = useMemo(() => {
    let list = [...initialPayments] as PaymentWithRelations[];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          (p.vendor?.profile?.full_name ?? '').toLowerCase().includes(q) ||
          (p.vendor?.profile?.email ?? '').toLowerCase().includes(q) ||
          (p.vendor?.code ?? '').toLowerCase().includes(q) ||
          (p.notes ?? '').toLowerCase().includes(q)
      );
    }

    if (filterVendor !== 'all') list = list.filter((p) => p.vendor_id === filterVendor);
    if (filterCurrency !== 'all') list = list.filter((p) => p.paid_currency_id === filterCurrency);
    if (filterMethod !== 'all') list = list.filter((p) => p.payment_method === filterMethod);

    if (filterFrom)
      list = list.filter((p) => new Date(p.paid_at) >= new Date(filterFrom));

    if (filterTo) {
      const to = new Date(filterTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((p) => new Date(p.paid_at) <= to);
    }

    return list;
  }, [initialPayments, search, filterVendor, filterCurrency, filterMethod, filterFrom, filterTo]);

  const total = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const totalsBase = useMemo(() => {
    return filtered.reduce((sum, p) => sum + Number(p.amount_base), 0);
  }, [filtered]);

  const activeFiltersCount =
    (search ? 1 : 0) +
    (filterVendor !== 'all' ? 1 : 0) +
    (filterCurrency !== 'all' ? 1 : 0) +
    (filterMethod !== 'all' ? 1 : 0) +
    (filterFrom ? 1 : 0) +
    (filterTo ? 1 : 0);

  function clearFilters() {
    setSearch('');
    setFilterVendor('all');
    setFilterCurrency('all');
    setFilterMethod('all');
    setFilterFrom('');
    setFilterTo('');
    setPage(1);
  }

  async function handleExport() {
    setIsPending(true);
    try {
      const res = await exportPaymentsExcelAction({
        vendor_id: filterVendor !== 'all' ? filterVendor : undefined,
        currency_id: filterCurrency !== 'all' ? filterCurrency : undefined,
        payment_method: filterMethod !== 'all' ? filterMethod : undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
      });
      if (res.error) {
        showToast(res.error, 'error');
        return;
      }
      if (res.fileBase64 && res.filename) {
        downloadExcelFromBase64(res.fileBase64, res.filename);
        showToast('Historial exportado', 'success');
      }
    } finally {
      setIsPending(false);
    }
  }

  const columns: Column<PaymentWithRelations>[] = [
    {
      key: 'paid_at',
      header: 'Fecha',
      render: (p) => (
        <span className="text-sm">
          {new Date(p.paid_at).toLocaleString('es-MX')}
        </span>
      ),
    },
    {
      key: 'vendor',
      header: 'Vendedor/Mensajero',
      render: (p) => (
        <div>
          <p className="text-sm font-medium">
            {p.vendor?.profile?.full_name ?? '—'}
          </p>
          <p className="text-xs text-muted-foreground">
            {p.vendor?.profile?.email ?? '—'}
            {p.vendor?.code ? ` · ${p.vendor.code}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (p) => {
        const t = p.vendor?.type ?? 'vendedor';
        const tone =
          t === 'mensajero' ? 'info' : t === 'ambos' ? 'warning' : 'default';
        return <Badge tone={tone as 'info' | 'warning' | 'default'}>{t}</Badge>;
      },
    },
    {
      key: 'amount_base',
      header: 'En moneda principal',
      render: (p) => (
        <span className="font-mono text-sm">
          {p.base_currency
            ? formatCurrency(Number(p.amount_base), p.base_currency)
            : Number(p.amount_base).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'amount_paid',
      header: 'Pagado',
      render: (p) => (
        <span className="font-mono text-sm font-semibold">
          {p.paid_currency
            ? formatCurrency(Number(p.amount_paid), p.paid_currency)
            : Number(p.amount_paid).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'exchange_rate',
      header: 'T. cambio',
      render: (p) => (
        <span className="font-mono text-xs text-muted-foreground">
          {Number(p.exchange_rate_value).toFixed(6).replace(/\.?0+$/, '')}
        </span>
      ),
    },
    {
      key: 'payment_method',
      header: 'Forma de pago',
      render: (p) => (
        <span className="text-xs capitalize">{p.payment_method}</span>
      ),
    },
    {
      key: 'paid_by',
      header: 'Pagado por',
      render: (p) => (
        <span className="text-xs text-muted-foreground">
          {p.paid_by_user?.full_name ?? p.paid_by_user?.email ?? '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (p) => (
        <button
          type="button"
          title="Ver detalle"
          onClick={() => setViewing(p)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Eye className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/pagos">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Historial de pagos
            </h1>
            <p className="text-sm text-muted-foreground">
              Todos los pagos realizados a vendedores y mensajeros.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={isPending}>
          <Download className="h-4 w-4" />
          Exportar Excel
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Total de pagos"
          value={String(total)}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <KpiCard
          label="Monto consolidado"
          value={
            primaryCurrency
              ? formatCurrency(totalsBase, primaryCurrency)
              : totalsBase.toFixed(2)
          }
          icon={<Wallet className="h-4 w-4" />}
          tone="success"
        />
        <KpiCard
          label="Filtros activos"
          value={String(activeFiltersCount)}
          icon={<Filter className="h-4 w-4" />}
        />
      </div>

      {/* Filtros */}
      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SearchBar
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Buscar por nombre, email, código o notas…"
            />
            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <Filter className="h-3.5 w-3.5" />
                Limpiar filtros ({activeFiltersCount})
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Select
              value={filterVendor}
              onChange={(e) => {
                setFilterVendor(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Vendedor: todos</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.profile?.full_name ?? v.code ?? v.id.slice(0, 8)}
                </option>
              ))}
            </Select>
            <Select
              value={filterCurrency}
              onChange={(e) => {
                setFilterCurrency(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Moneda: todas</option>
              {currencies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </Select>
            <Select
              value={filterMethod}
              onChange={(e) => {
                setFilterMethod(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Forma: todas</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="otro">Otro</option>
            </Select>
            <Input
              type="date"
              value={filterFrom}
              onChange={(e) => {
                setFilterFrom(e.target.value);
                setPage(1);
              }}
              placeholder="Desde"
            />
            <Input
              type="date"
              value={filterTo}
              onChange={(e) => {
                setFilterTo(e.target.value);
                setPage(1);
              }}
              placeholder="Hasta"
            />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-lg border bg-background">
        {paged.length === 0 ? (
          <EmptyState
            title="Sin pagos"
            description={
              activeFiltersCount > 0
                ? 'No hay pagos que coincidan con los filtros.'
                : 'Aún no se han realizado pagos.'
            }
            icon={<Calendar className="h-8 w-8" />}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={paged}
              rowKey={(p) => p.id}
            />
            <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>
                  Mostrando <strong>{paged.length}</strong> de{' '}
                  <strong>{total}</strong>
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded-md border bg-background px-2 py-1 text-sm"
                >
                  {[10, 25, 50, 100].map((s) => (
                    <option key={s} value={s}>
                      {s} / página
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <span className="px-2 text-sm">
                  Página {page} de {Math.max(1, Math.ceil(total / pageSize))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(total / pageSize)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal de detalle */}
      {viewing && (
        <DetallePagoModal payment={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

// ============================================
// MODAL: DETALLE DEL PAGO
// ============================================
function DetallePagoModal({
  payment,
  onClose,
}: {
  payment: PaymentWithRelations;
  onClose: () => void;
}) {
  const items = (payment as VendorPayment & { items?: VendorPaymentItem[] })
    .items;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Pago a ${payment.vendor?.profile?.full_name ?? 'vendedor'}`}
      description={`Realizado el ${new Date(payment.paid_at).toLocaleString('es-MX')}`}
      size="lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoRow
            label="Vendedor/Mensajero"
            value={payment.vendor?.profile?.full_name ?? '—'}
          />
          <InfoRow label="Tipo" value={payment.vendor?.type ?? '—'} />
          <InfoRow
            label="Monto en moneda principal"
            value={
              payment.base_currency
                ? formatCurrency(Number(payment.amount_base), payment.base_currency)
                : Number(payment.amount_base).toFixed(2)
            }
          />
          <InfoRow
            label="Monto pagado"
            value={
              payment.paid_currency
                ? formatCurrency(Number(payment.amount_paid), payment.paid_currency)
                : Number(payment.amount_paid).toFixed(2)
            }
          />
          <InfoRow
            label="Tipo de cambio aplicado"
            value={`1 ${payment.paid_currency?.code ?? ''} = ${Number(
              payment.exchange_rate_value
            )
              .toFixed(6)
              .replace(/\.?0+$/, '')} ${payment.base_currency?.code ?? ''}`}
          />
          <InfoRow
            label="Forma de pago"
            value={payment.payment_method}
          />
          <InfoRow
            label="Pagado por"
            value={
              payment.paid_by_user?.full_name ??
              payment.paid_by_user?.email ??
              '—'
            }
          />
        </div>

        {payment.notes && (
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Notas</p>
            <p className="mt-1 text-sm">{payment.notes}</p>
          </div>
        )}

        {items && items.length > 0 ? (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Tipo
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Referencia
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Monto base
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Descripción
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-xs">{it.item_type}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {it.reference_type} {it.reference_id?.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {payment.base_currency
                        ? formatCurrency(Number(it.base_amount), payment.base_currency)
                        : Number(it.base_amount).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {it.description ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sin movimientos individuales registrados para este pago.
          </p>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================
// AUXILIARES
// ============================================
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm capitalize">{value}</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: 'default' | 'success';
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-emerald-50 text-emerald-600'
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

// ============================================
// DESCARGA DEL EXCEL (decodifica base64)
// ============================================
function downloadExcelFromBase64(base64: string, filename: string) {
  // Decodificar base64 a binario
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}