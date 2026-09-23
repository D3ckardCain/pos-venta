'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Wallet,
  Eye,
  Filter,
  RefreshCw,
  Clock,
  Lock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { CashSession, Currency } from '@/lib/types/database';
import { refreshExpiredSessionsAction } from './actions';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { SearchBar } from '@/components/shared/SearchBar';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';

interface Props {
  initialSessions: CashSession[];
  currencies: Currency[];
  paymentMethods: { id: string; name: string; code: string }[];
}

type StatusFilter = 'all' | 'abierta' | 'pendiente_cierre' | 'cerrada';

export function CajasClient({ initialSessions }: Props) {
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [filterUser, setFilterUser] = useState('all');
  const [isPending, startTransition] = useTransition();

  const openCount = initialSessions.filter((s) => s.status === 'abierta').length;
  const pendingCount = initialSessions.filter(
    (s) => s.status === 'pendiente_cierre'
  ).length;
  const closedCount = initialSessions.filter((s) => s.status === 'cerrada').length;

  const users = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of initialSessions) {
      if (s.opened_by_user) {
        map.set(
          s.opened_by,
          s.opened_by_user.full_name ?? s.opened_by_user.email ?? s.opened_by
        );
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [initialSessions]);

  const filtered = useMemo(() => {
    let list = [...initialSessions];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) =>
          (s.opened_by_user?.full_name ?? '').toLowerCase().includes(q) ||
          (s.opened_by_user?.email ?? '').toLowerCase().includes(q) ||
          (s.notes ?? '').toLowerCase().includes(q)
      );
    }

    if (filterStatus !== 'all') list = list.filter((s) => s.status === filterStatus);
    if (filterUser !== 'all') list = list.filter((s) => s.opened_by === filterUser);

    return list;
  }, [initialSessions, search, filterStatus, filterUser]);

  const activeFiltersCount =
    (search ? 1 : 0) +
    (filterStatus !== 'all' ? 1 : 0) +
    (filterUser !== 'all' ? 1 : 0);

  function clearFilters() {
    setSearch('');
    setFilterStatus('all');
    setFilterUser('all');
  }

  function handleRefresh() {
    startTransition(async () => {
      const res = await refreshExpiredSessionsAction();
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Sesiones vencidas actualizadas', 'success');
      }
    });
  }

  const columns: Column<CashSession>[] = [
    {
      key: 'opened_by_user',
      header: 'Cajero',
      render: (s) => (
        <div>
          <p className="font-medium">
            {s.opened_by_user?.full_name ?? s.opened_by_user?.email ?? '-'}
          </p>
          <p className="text-xs text-muted-foreground">
            {s.is_auto_opened ? 'Apertura automatica' : 'Apertura manual'}
          </p>
        </div>
      ),
    },
    {
      key: 'opened_at',
      header: 'Apertura',
      render: (s) => (
        <span className="text-sm">
          {new Date(s.opened_at).toLocaleString('es-MX')}
        </span>
      ),
    },
    {
      key: 'cutoff_at',
      header: 'Corte programado',
      render: (s) => (
        <span className="text-sm text-muted-foreground">
          {s.cutoff_at
            ? new Date(s.cutoff_at).toLocaleString('es-MX')
            : '-'}
        </span>
      ),
    },
    {
      key: 'closed_at',
      header: 'Cierre',
      render: (s) => (
        <span className="text-sm text-muted-foreground">
          {s.closed_at
            ? new Date(s.closed_at).toLocaleString('es-MX')
            : 'Sin cerrar'}
        </span>
      ),
    },
    {
      key: 'difference',
      header: 'Diferencia',
      render: (s) => {
        const pending = Number(s._pending_difference ?? 0);
        if (Math.abs(pending) > 0.0001) {
          return (
            <Badge tone="destructive">
              <AlertCircle className="mr-1 inline h-3 w-3" />
              Si
            </Badge>
          );
        }
        return <Badge tone="success">No</Badge>;
      },
    },
    {
      key: 'status',
      header: 'Estado',
      render: (s) => <SessionStatusBadge status={s.status} />,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (s) => (
        <Link href={`/admin/cajas/sesiones/${s.id}`}>
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
          <h1 className="text-2xl font-bold tracking-tight">Cajas</h1>
          <p className="text-sm text-muted-foreground">
            Sesiones por cajero. Corte diario a las 12:00 AM. Conciliacion por metodo de pago y moneda.
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isPending}>
          <RefreshCw className="h-4 w-4" />
          Actualizar vencidas
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Sesiones abiertas"
          value={String(openCount)}
          icon={<Clock className="h-4 w-4" />}
          tone="success"
        />
        <KpiCard
          label="Pendientes de cierre"
          value={String(pendingCount)}
          icon={<Lock className="h-4 w-4" />}
          tone="warning"
        />
        <KpiCard
          label="Cerradas"
          value={String(closedCount)}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="default"
        />
      </div>

      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Buscar por cajero o notas..."
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
              className="w-44"
            >
              <option value="all">Estado: todos</option>
              <option value="abierta">Abiertas</option>
              <option value="pendiente_cierre">Pendientes de cierre</option>
              <option value="cerrada">Cerradas</option>
            </Select>
            <Select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="w-48"
            >
              <option value="all">Cajero: todos</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
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

      <div className="rounded-lg border bg-background">
        {filtered.length === 0 ? (
          <EmptyState
            title={search ? 'Sin resultados' : 'No hay sesiones'}
            description={
              search
                ? 'Prueba con otro termino de busqueda.'
                : 'Las sesiones se abren automaticamente al hacer la primera venta del dia.'
            }
            icon={<Wallet className="h-8 w-8" />}
          />
        ) : (
          <DataTable columns={columns} rows={filtered} rowKey={(s) => s.id} />
        )}
      </div>

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
          <p className="mt-1 text-2xl font-semibold">{value}</p>
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

export function SessionStatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { tone: 'default' | 'success' | 'warning' | 'destructive' | 'info'; label: string }
  > = {
    abierta: { tone: 'success', label: 'Abierta' },
    pendiente_cierre: { tone: 'warning', label: 'Pendiente de cierre' },
    cerrada: { tone: 'default', label: 'Cerrada' },
  };
  const cfg = map[status] ?? { tone: 'default' as const, label: status };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}