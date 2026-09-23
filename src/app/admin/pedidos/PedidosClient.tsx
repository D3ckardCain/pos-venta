'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Plus,
  Eye,
  Download,
  ClipboardList,
  Filter,
} from 'lucide-react';
import type {
  Order,
  Currency,
  Vendor,
  Customer,
  OrderStatus,
} from '@/lib/types/database';
import { exportOrdersCsvAction } from './actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { SearchBar } from '@/components/shared/SearchBar';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/utils/currency';
import { NewOrderModal } from './NewOrderModal';

interface Props {
  initialOrders: Order[];
  currencies: Currency[];
  vendors: Vendor[];
  customers: Pick<
    Customer,
    'id' | 'full_name' | 'phone' | 'email' | 'address'
  >[];
}

type StatusFilter = 'all' | OrderStatus;

export function PedidosClient({
  initialOrders,
  currencies,
  vendors,
  customers,
}: Props) {
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [filterCurrency, setFilterCurrency] = useState('all');
  const [filterVendor, setFilterVendor] = useState('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    let list = [...initialOrders];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.order_number.toLowerCase().includes(q) ||
          (o.customer?.full_name ?? '').toLowerCase().includes(q) ||
          (o.customer?.phone ?? '').toLowerCase().includes(q) ||
          (o.delivery_address ?? '').toLowerCase().includes(q)
      );
    }

    if (filterStatus !== 'all') list = list.filter((o) => o.status === filterStatus);
    if (filterCurrency !== 'all')
      list = list.filter((o) => o.currency_id === filterCurrency);
    if (filterVendor !== 'all') list = list.filter((o) => o.vendor_id === filterVendor);

    if (filterFrom)
      list = list.filter((o) => new Date(o.created_at) >= new Date(filterFrom));
    if (filterTo) {
      const to = new Date(filterTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((o) => new Date(o.created_at) <= to);
    }

    return list;
  }, [
    initialOrders,
    search,
    filterStatus,
    filterCurrency,
    filterVendor,
    filterFrom,
    filterTo,
  ]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of initialOrders) {
      counts[o.status] = (counts[o.status] ?? 0) + 1;
    }
    return counts;
  }, [initialOrders]);

  const activeFiltersCount =
    (search ? 1 : 0) +
    (filterStatus !== 'all' ? 1 : 0) +
    (filterCurrency !== 'all' ? 1 : 0) +
    (filterVendor !== 'all' ? 1 : 0) +
    (filterFrom ? 1 : 0) +
    (filterTo ? 1 : 0);

  function clearFilters() {
    setSearch('');
    setFilterStatus('all');
    setFilterCurrency('all');
    setFilterVendor('all');
    setFilterFrom('');
    setFilterTo('');
  }

  function handleExport() {
    startTransition(async () => {
      const res = await exportOrdersCsvAction({
        from: filterFrom || undefined,
        to: filterTo || undefined,
        status: filterStatus !== 'all' ? filterStatus : undefined,
        currency_id: filterCurrency !== 'all' ? filterCurrency : undefined,
        vendor_id: filterVendor !== 'all' ? filterVendor : undefined,
      });
      if (res.error) {
        showToast(res.error, 'error');
        return;
      }
      downloadCsv(res.csv!, res.filename!);
      showToast('Pedidos exportados', 'success');
    });
  }

  const columns: Column<Order>[] = [
    {
      key: 'order_number',
      header: 'Numero',
      render: (o) => (
        <Link
          href={`/admin/pedidos/${o.id}`}
          className="font-mono text-sm font-medium hover:underline"
        >
          {o.order_number}
        </Link>
      ),
    },
    {
      key: 'created_at',
      header: 'Fecha',
      render: (o) => (
        <span className="text-sm">
          {new Date(o.created_at).toLocaleString('es-MX')}
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Cliente',
      render: (o) => (
        <div>
          <p className="text-sm">{o.customer?.full_name ?? 'Publico general'}</p>
          {o.customer?.phone && (
            <p className="text-xs text-muted-foreground">{o.customer.phone}</p>
          )}
        </div>
      ),
    },
    {
      key: 'currency',
      header: 'Moneda',
      render: (o) => <Badge tone="info">{o.currency?.code ?? '-'}</Badge>,
    },
    {
      key: 'total',
      header: 'Total original',
      render: (o) =>
        o.currency ? (
          <span className="font-mono text-sm">
            {formatCurrency(Number(o.total), o.currency)}
          </span>
        ) : (
          '-'
        ),
    },
    {
      key: 'base_total',
      header: 'Total base',
      render: (o) =>
        o.base_currency ? (
          <span className="font-mono text-sm font-semibold">
            {formatCurrency(Number(o.base_total), o.base_currency)}
          </span>
        ) : (
          '-'
        ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (o) => <OrderStatusBadge status={o.status} />,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (o) => (
        <Link href={`/admin/pedidos/${o.id}`}>
          <button
            type="button"
            title="Ver detalle"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Eye className="h-4 w-4" />
          </button>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Los pedidos reservan stock. Al confirmar, el stock se descuenta.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={isPending}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
          <Button onClick={() => setNewOrderOpen(true)}>
            <Plus className="h-4 w-4" />
            Nuevo pedido
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <StatusKpi
          label="Pendientes"
          count={statusCounts.pendiente ?? 0}
          tone="info"
        />
        <StatusKpi
          label="Confirmados"
          count={statusCounts.confirmado ?? 0}
          tone="info"
        />
        <StatusKpi
          label="Preparando"
          count={statusCounts.preparando ?? 0}
          tone="warning"
        />
        <StatusKpi
          label="Enviados"
          count={statusCounts.enviado ?? 0}
          tone="info"
        />
        <StatusKpi
          label="Entregados"
          count={statusCounts.entregado ?? 0}
          tone="success"
        />
        <StatusKpi
          label="Cancelados"
          count={statusCounts.cancelado ?? 0}
          tone="destructive"
        />
        <StatusKpi
          label="Devueltos"
          count={statusCounts.devuelto ?? 0}
          tone="warning"
        />
      </div>

      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Buscar por numero, cliente, direccion..."
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
              <option value="pendiente">Pendiente</option>
              <option value="confirmado">Confirmado</option>
              <option value="preparando">Preparando</option>
              <option value="enviado">Enviado</option>
              <option value="entregado">Entregado</option>
              <option value="cancelado">Cancelado</option>
              <option value="devuelto">Devuelto</option>
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

            <div className="grid grid-cols-2 gap-2">
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
      </div>

      <div className="rounded-lg border bg-background">
        {filtered.length === 0 ? (
          <EmptyState
            title={search ? 'Sin resultados' : 'No hay pedidos'}
            description={
              search
                ? 'Prueba con otro termino de busqueda.'
                : 'Crea tu primer pedido para comenzar.'
            }
            icon={<ClipboardList className="h-8 w-8" />}
            action={
              !search ? (
                <Button onClick={() => setNewOrderOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Nuevo pedido
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable columns={columns} rows={filtered} rowKey={(o) => o.id} />
        )}
      </div>

      <NewOrderModal
        open={newOrderOpen}
        onClose={() => setNewOrderOpen(false)}
        currencies={currencies}
        vendors={vendors}
        customers={customers}
      />

      {isPending && (
        <div className="pointer-events-none fixed inset-0 z-40 bg-black/10" />
      )}
    </div>
  );
}

function StatusKpi({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: 'info' | 'warning' | 'success' | 'destructive';
}) {
  const toneClass = {
    info: 'text-blue-600 bg-blue-50',
    warning: 'text-amber-600 bg-amber-50',
    success: 'text-emerald-600 bg-emerald-50',
    destructive: 'text-red-600 bg-red-50',
  }[tone];
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-md ${toneClass}`}
        >
          <ClipboardList className="h-3 w-3" />
        </div>
      </div>
      <p className="mt-1 text-lg font-semibold">{count}</p>
    </div>
  );
}

export function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { tone: 'default' | 'success' | 'warning' | 'destructive' | 'info'; label: string }
  > = {
    pendiente: { tone: 'info', label: 'Pendiente' },
    confirmado: { tone: 'info', label: 'Confirmado' },
    preparando: { tone: 'warning', label: 'Preparando' },
    enviado: { tone: 'info', label: 'Enviado' },
    entregado: { tone: 'success', label: 'Entregado' },
    cancelado: { tone: 'destructive', label: 'Cancelado' },
    devuelto: { tone: 'warning', label: 'Devuelto' },
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