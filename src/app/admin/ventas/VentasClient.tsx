'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Plus,
  Eye,
  XCircle,
  Download,
  ShoppingCart,
  Filter,
  Receipt,
  Play,
  Trash2,
  Pause,
} from 'lucide-react';
import type {
  Sale,
  Currency,
  PaymentMethod,
  Vendor,
  Customer,
  CashRegister,
  ParkedSale,
} from '@/lib/types/database';
import {
  exportSalesCsvAction,
  cancelSaleAction,
  deleteParkedSaleAction,
} from './actions';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { SearchBar } from '@/components/shared/SearchBar';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/utils/currency';
import { NewSaleModal } from './NewSaleModal';

interface Props {
  initialSales: Sale[];
  initialParkedSales: ParkedSale[];
  currencies: Currency[];
  paymentMethods: PaymentMethod[];
  vendors: Vendor[];
  customers: Pick<Customer, 'id' | 'full_name' | 'phone' | 'email'>[];
  cashRegisters: CashRegister[];
}

type StatusFilter = 'all' | 'completada' | 'cancelada' | 'devuelta' | 'pendiente';
type ViewTab = 'sales' | 'parked';

export function VentasClient({
  initialSales,
  initialParkedSales,
  currencies,
  paymentMethods,
  vendors,
  customers,
  cashRegisters,
}: Props) {
  const { showToast } = useToast();

  const [tab, setTab] = useState<ViewTab>('sales');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [filterCurrency, setFilterCurrency] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [filterVendor, setFilterVendor] = useState('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const [newSaleOpen, setNewSaleOpen] = useState(false);
  const [resumeParked, setResumeParked] = useState<ParkedSale | null>(null);
  const [cancelling, setCancelling] = useState<Sale | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [confirmDeleteParked, setConfirmDeleteParked] =
    useState<ParkedSale | null>(null);
  const [isPending, startTransition] = useTransition();

  const completedSales = initialSales.filter((s) => s.status === 'completada');
  const totalRevenue = completedSales.reduce(
    (sum, s) => sum + Number(s.base_total),
    0
  );
  const totalProfit = completedSales.reduce(
    (sum, s) => sum + Number(s.base_profit),
    0
  );

  const primaryCurrency = currencies[0];

  const filtered = useMemo(() => {
    let list = [...initialSales];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.sale_number.toLowerCase().includes(q) ||
          (s.customer?.full_name ?? '').toLowerCase().includes(q) ||
          (s.customer?.phone ?? '').toLowerCase().includes(q) ||
          (s.notes ?? '').toLowerCase().includes(q)
      );
    }

    if (filterStatus !== 'all') list = list.filter((s) => s.status === filterStatus);
    if (filterCurrency !== 'all')
      list = list.filter((s) => s.currency_id === filterCurrency);
    if (filterPayment !== 'all')
      list = list.filter((s) => s.payment_method_id === filterPayment);
    if (filterVendor !== 'all')
      list = list.filter((s) => s.vendor_id === filterVendor);

    if (filterFrom)
      list = list.filter((s) => new Date(s.created_at) >= new Date(filterFrom));
    if (filterTo) {
      const to = new Date(filterTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((s) => new Date(s.created_at) <= to);
    }

    return list;
  }, [
    initialSales,
    search,
    filterStatus,
    filterCurrency,
    filterPayment,
    filterVendor,
    filterFrom,
    filterTo,
  ]);

  const filteredParked = useMemo(() => {
    let list = [...initialParkedSales];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.customer?.full_name ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [initialParkedSales, search]);

  const activeFiltersCount =
    (search ? 1 : 0) +
    (filterStatus !== 'all' ? 1 : 0) +
    (filterCurrency !== 'all' ? 1 : 0) +
    (filterPayment !== 'all' ? 1 : 0) +
    (filterVendor !== 'all' ? 1 : 0) +
    (filterFrom ? 1 : 0) +
    (filterTo ? 1 : 0);

  function clearFilters() {
    setSearch('');
    setFilterStatus('all');
    setFilterCurrency('all');
    setFilterPayment('all');
    setFilterVendor('all');
    setFilterFrom('');
    setFilterTo('');
  }

  function handleExport() {
    startTransition(async () => {
      const res = await exportSalesCsvAction({
        from: filterFrom || undefined,
        to: filterTo || undefined,
        status: filterStatus !== 'all' ? filterStatus : undefined,
        currency_id: filterCurrency !== 'all' ? filterCurrency : undefined,
        payment_method_id: filterPayment !== 'all' ? filterPayment : undefined,
        vendor_id: filterVendor !== 'all' ? filterVendor : undefined,
      });
      if (res.error) {
        showToast(res.error, 'error');
        return;
      }
      downloadCsv(res.csv!, res.filename!);
      showToast('Ventas exportadas', 'success');
    });
  }

  function handleCancelNow() {
    if (!cancelling) return;
    if (cancelReason.trim().length < 3) {
      showToast('El motivo es obligatorio', 'error');
      return;
    }
    const target = cancelling;
    const reason = cancelReason;
    startTransition(async () => {
      const res = await cancelSaleAction(target.id, reason);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Venta cancelada y stock devuelto', 'success');
        setCancelling(null);
        setCancelReason('');
      }
    });
  }

  function handleDeleteParkedNow() {
    if (!confirmDeleteParked) return;
    const target = confirmDeleteParked;
    setConfirmDeleteParked(null);
    startTransition(async () => {
      const res = await deleteParkedSaleAction(target.id);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Venta en espera eliminada', 'success');
      }
    });
  }

  const salesColumns: Column<Sale>[] = [
    {
      key: 'sale_number',
      header: 'Numero',
      render: (s) => (
        <Link
          href={`/admin/ventas/${s.id}`}
          className="font-mono text-sm font-medium hover:underline"
        >
          {s.sale_number}
        </Link>
      ),
    },
    {
      key: 'created_at',
      header: 'Fecha',
      render: (s) => (
        <span className="text-sm">
          {new Date(s.created_at).toLocaleString('es-MX')}
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Cliente',
      render: (s) => (
        <div>
          <p className="text-sm">{s.customer?.full_name ?? 'Publico general'}</p>
          {s.customer?.phone && (
            <p className="text-xs text-muted-foreground">{s.customer.phone}</p>
          )}
        </div>
      ),
    },
    {
      key: 'payment_method',
      header: 'Pago',
      render: (s) => (
        <span className="text-sm text-muted-foreground">
          {s.payment_method?.name ?? '-'}
        </span>
      ),
    },
    {
      key: 'currency',
      header: 'Moneda',
      render: (s) => <Badge tone="info">{s.currency?.code ?? '-'}</Badge>,
    },
    {
      key: 'total',
      header: 'Total original',
      render: (s) =>
        s.currency ? (
          <span className="font-mono text-sm">
            {formatCurrency(Number(s.total), s.currency)}
          </span>
        ) : (
          '-'
        ),
    },
    {
      key: 'base_total',
      header: 'Total base',
      render: (s) =>
        s.base_currency ? (
          <span className="font-mono text-sm font-semibold">
            {formatCurrency(Number(s.base_total), s.base_currency)}
          </span>
        ) : (
          '-'
        ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (s) => <SaleStatusBadge status={s.status} />,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (s) => (
        <div className="flex justify-end gap-1">
          <Link href={`/admin/ventas/${s.id}`}>
            <button
              type="button"
              title="Ver detalle"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Eye className="h-4 w-4" />
            </button>
          </Link>
          {s.status === 'completada' && (
            <button
              type="button"
              title="Cancelar venta"
              onClick={() => setCancelling(s)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const parkedColumns: Column<ParkedSale>[] = [
    {
      key: 'name',
      header: 'Nombre',
      render: (p) => <span className="font-medium">{p.name}</span>,
    },
    {
      key: 'customer',
      header: 'Cliente',
      render: (p) => (
        <span className="text-sm">
          {p.customer?.full_name ?? 'Publico general'}
        </span>
      ),
    },
    {
      key: 'items',
      header: 'Productos',
      render: (p) => (
        <span className="text-sm text-muted-foreground">
          {(p.items ?? []).length} item(s)
        </span>
      ),
    },
    {
      key: 'currency',
      header: 'Moneda',
      render: (p) => <Badge tone="info">{p.currency?.code ?? '-'}</Badge>,
    },
    {
      key: 'created_at',
      header: 'Guardada',
      render: (p) => (
        <span className="text-sm">
          {new Date(p.created_at).toLocaleString('es-MX')}
        </span>
      ),
    },
    {
      key: 'user',
      header: 'Usuario',
      render: (p) => (
        <span className="text-sm text-muted-foreground">
          {p.created_by_user?.full_name ?? p.created_by_user?.email ?? '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (p) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            title="Retomar venta"
            onClick={() => setResumeParked(p)}
            className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50"
          >
            <Play className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Eliminar"
            onClick={() => setConfirmDeleteParked(p)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ventas</h1>
          <p className="text-sm text-muted-foreground">
            Registro y consulta de ventas. Cada venta descuenta stock.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={isPending}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
          <Button onClick={() => setNewSaleOpen(true)}>
            <Plus className="h-4 w-4" />
            Nueva venta
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Ventas completadas"
          value={String(completedSales.length)}
          icon={<Receipt className="h-4 w-4" />}
        />
        <KpiCard
          label="En espera"
          value={String(initialParkedSales.length)}
          icon={<Pause className="h-4 w-4" />}
          tone="warning"
        />
        <KpiCard
          label="Ingresos consolidados"
          value={
            primaryCurrency ? formatCurrency(totalRevenue, primaryCurrency) : '-'
          }
          icon={<ShoppingCart className="h-4 w-4" />}
          tone="success"
        />
        <KpiCard
          label="Utilidad consolidada"
          value={
            primaryCurrency ? formatCurrency(totalProfit, primaryCurrency) : '-'
          }
          icon={<ShoppingCart className="h-4 w-4" />}
          tone="success"
        />
      </div>

      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setTab('sales')}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
            tab === 'sales'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Receipt className="h-4 w-4" />
          Ventas ({initialSales.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('parked')}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
            tab === 'parked'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Pause className="h-4 w-4" />
          En espera ({initialParkedSales.length})
        </button>
      </div>

      {tab === 'sales' && (
        <>
          <div className="rounded-lg border bg-background p-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <SearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder="Buscar por numero, cliente, telefono..."
                />
                {activeFiltersCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <Filter className="h-3.5 w-3.5" />
                    Limpiar filtros ({activeFiltersCount})
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
                >
                  <option value="all">Estado: todos</option>
                  <option value="completada">Completadas</option>
                  <option value="cancelada">Canceladas</option>
                  <option value="devuelta">Devueltas</option>
                  <option value="pendiente">Pendientes</option>
                </Select>

                <Select
                  value={filterCurrency}
                  onChange={(e) => setFilterCurrency(e.target.value)}
                >
                  <option value="all">Moneda: todas</option>
                  {currencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </Select>

                <Select
                  value={filterPayment}
                  onChange={(e) => setFilterPayment(e.target.value)}
                >
                  <option value="all">Pago: todos</option>
                  {paymentMethods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>

                <Select
                  value={filterVendor}
                  onChange={(e) => setFilterVendor(e.target.value)}
                >
                  <option value="all">Vendedor: todos</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.profile?.full_name ?? v.code ?? v.id.slice(0, 8)}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  type="date"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                  placeholder="Desde"
                />
                <Input
                  type="date"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                  placeholder="Hasta"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-background">
            {filtered.length === 0 ? (
              <EmptyState
                title={search ? 'Sin resultados' : 'No hay ventas'}
                description={
                  search
                    ? 'Prueba con otro termino de busqueda.'
                    : 'Registra tu primera venta para comenzar.'
                }
                icon={<ShoppingCart className="h-8 w-8" />}
                action={
                  !search ? (
                    <Button onClick={() => setNewSaleOpen(true)}>
                      <Plus className="h-4 w-4" />
                      Nueva venta
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <DataTable columns={salesColumns} rows={filtered} rowKey={(s) => s.id} />
            )}
          </div>
        </>
      )}

      {tab === 'parked' && (
        <div className="rounded-lg border bg-background">
          {filteredParked.length === 0 ? (
            <EmptyState
              title="Sin ventas en espera"
              description="Cuando pauses una venta, aparecera aqui."
              icon={<Pause className="h-8 w-8" />}
            />
          ) : (
            <DataTable
              columns={parkedColumns}
              rows={filteredParked}
              rowKey={(p) => p.id}
            />
          )}
        </div>
      )}

      {newSaleOpen && (
        <NewSaleModal
          open={newSaleOpen}
          onClose={() => setNewSaleOpen(false)}
          currencies={currencies}
          paymentMethods={paymentMethods}
          vendors={vendors}
          customers={customers}
          cashRegisters={cashRegisters}
          parkedSale={null}
        />
      )}

      {resumeParked && (
        <NewSaleModal
          open={!!resumeParked}
          onClose={() => setResumeParked(null)}
          currencies={currencies}
          paymentMethods={paymentMethods}
          vendors={vendors}
          customers={customers}
          cashRegisters={cashRegisters}
          parkedSale={resumeParked}
        />
      )}

      <Modal
        open={!!cancelling}
        onClose={() => {
          setCancelling(null);
          setCancelReason('');
        }}
        title="Cancelar venta"
        description="El stock sera devuelto automaticamente. Esta accion no se puede deshacer."
      >
        {cancelling && (
          <form
            id="cancel-sale-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleCancelNow();
            }}
            className="space-y-4"
            autoComplete="off"
          >
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="font-mono text-sm font-medium">
                {cancelling.sale_number}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Total:{' '}
                {cancelling.currency
                  ? formatCurrency(Number(cancelling.total), cancelling.currency)
                  : '-'}
              </p>
            </div>

            <Textarea
              label="Motivo de cancelacion"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ej: Cliente solicito cancelacion, error en cobro..."
              required
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCancelling(null);
                  setCancelReason('');
                }}
              >
                Volver
              </Button>
              <SubmitButton
                loadingText="Cancelando..."
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Cancelar venta
              </SubmitButton>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteParked}
        title={`Eliminar venta en espera "${confirmDeleteParked?.name ?? ''}"?`}
        description="Esta accion no se puede deshacer. Los productos volveran a estar disponibles normalmente."
        confirmLabel="Eliminar"
        variant="destructive"
        onCancel={() => setConfirmDeleteParked(null)}
        onConfirm={handleDeleteParkedNow}
      />

      {isPending && (
        <div className="pointer-events-none fixed inset-0 z-40 bg-black/10" />
      )}
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
  tone?: 'default' | 'success' | 'warning';
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-emerald-50 text-emerald-600'
      : tone === 'warning'
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

export function SaleStatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { tone: 'default' | 'success' | 'warning' | 'destructive' | 'info'; label: string }
  > = {
    completada: { tone: 'success', label: 'Completada' },
    cancelada: { tone: 'destructive', label: 'Cancelada' },
    devuelta: { tone: 'warning', label: 'Devuelta' },
    pendiente: { tone: 'info', label: 'Pendiente' },
  };
  const cfg = map[status] ?? { tone: 'default' as const, label: status };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}