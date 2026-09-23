'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, Unlock, Lock } from 'lucide-react';
import type { InventoryReservation } from '@/lib/types/database';
import { releaseReservationAction } from '../actions';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { SearchBar } from '@/components/shared/SearchBar';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';

interface Props {
  initialReservations: InventoryReservation[];
}

type StatusFilter = 'all' | 'activa' | 'confirmada' | 'liberada' | 'expirada';

export function ReservasClient({ initialReservations }: Props) {
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('activa');

  const [releasing, setReleasing] = useState<InventoryReservation | null>(null);
  const [releaseReason, setReleaseReason] = useState('');
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    let list = [...initialReservations];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.product?.name ?? '').toLowerCase().includes(q) ||
          (r.product?.sku ?? '').toLowerCase().includes(q) ||
          (r.variant?.name ?? '').toLowerCase().includes(q) ||
          r.reference_type.toLowerCase().includes(q)
      );
    }

    if (filterStatus !== 'all')
      list = list.filter((r) => r.status === filterStatus);

    return list;
  }, [initialReservations, search, filterStatus]);

  function handleReleaseNow() {
    if (!releasing) return;
    if (releaseReason.trim().length < 3) {
      showToast('El motivo es obligatorio (minimo 3 caracteres)', 'error');
      return;
    }
    const target = releasing;
    const reason = releaseReason;
    startTransition(async () => {
      const res = await releaseReservationAction(target.id, reason);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Reserva liberada', 'success');
        setReleasing(null);
        setReleaseReason('');
      }
    });
  }

  const columns: Column<InventoryReservation>[] = [
    {
      key: 'created_at',
      header: 'Creada',
      render: (r) => (
        <span className="text-sm">
          {new Date(r.created_at).toLocaleString('es-MX')}
        </span>
      ),
    },
    {
      key: 'product',
      header: 'Producto',
      render: (r) => (
        <div>
          <p className="text-sm font-medium">{r.product?.name ?? '-'}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {r.product?.sku ?? '-'}
            {r.variant ? ` - ${r.variant.name}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Cantidad',
      render: (r) => (
        <span className="font-mono text-sm font-semibold">
          {Number(r.quantity)}
        </span>
      ),
    },
    {
      key: 'reference',
      header: 'Referencia',
      render: (r) => (
        <span className="text-xs text-muted-foreground">{r.reference_type}</span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => <ReservationStatusBadge status={r.status} />,
    },
    {
      key: 'expires_at',
      header: 'Expira',
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.expires_at
            ? new Date(r.expires_at).toLocaleString('es-MX')
            : 'Sin limite'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (r) =>
        r.status === 'activa' ? (
          <button
            type="button"
            title="Liberar reserva"
            onClick={() => setReleasing(r)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Unlock className="h-4 w-4" />
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/inventario">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Reservas de inventario
          </h1>
          <p className="text-sm text-muted-foreground">
            Stock comprometido para pedidos. Puedes liberar reservas activas.
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Buscar por producto, SKU o referencia..."
          />
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
            className="w-48"
          >
            <option value="all">Todos los estados</option>
            <option value="activa">Activas</option>
            <option value="confirmada">Confirmadas</option>
            <option value="liberada">Liberadas</option>
            <option value="expirada">Expiradas</option>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border bg-background">
        {filtered.length === 0 ? (
          <EmptyState
            title="Sin reservas"
            description={
              filterStatus === 'activa'
                ? 'No hay reservas activas en este momento.'
                : 'No hay reservas que coincidan con los filtros.'
            }
            icon={<Lock className="h-8 w-8" />}
          />
        ) : (
          <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} />
        )}
      </div>

      <Modal
        open={!!releasing}
        onClose={() => {
          setReleasing(null);
          setReleaseReason('');
        }}
        title="Liberar reserva"
        description="El stock reservado volvera a estar disponible."
      >
        {releasing && (
          <form
            id="release-reservation-form"
            action={undefined}
            onSubmit={(e) => {
              e.preventDefault();
              handleReleaseNow();
            }}
            className="space-y-4"
            autoComplete="off"
          >
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-sm font-medium">{releasing.product?.name}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {releasing.product?.sku ?? '-'}
                {releasing.variant ? ` - ${releasing.variant.name}` : ''}
              </p>
              <p className="mt-1 text-sm">
                Cantidad reservada:{' '}
                <strong>{Number(releasing.quantity)}</strong>
              </p>
            </div>

            <Textarea
              label="Motivo de liberacion"
              rows={3}
              value={releaseReason}
              onChange={(e) => setReleaseReason(e.target.value)}
              placeholder="Ej: Pedido cancelado por el cliente..."
              required
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setReleasing(null);
                  setReleaseReason('');
                }}
              >
                Cancelar
              </Button>
              <SubmitButton loadingText="Liberando...">
                Liberar reserva
              </SubmitButton>
            </div>
          </form>
        )}
      </Modal>

      {isPending && (
        <div className="pointer-events-none fixed inset-0 z-40 bg-black/10" />
      )}
    </div>
  );
}

function ReservationStatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { tone: 'default' | 'success' | 'warning' | 'destructive' | 'info'; label: string }
  > = {
    activa: { tone: 'info', label: 'Activa' },
    confirmada: { tone: 'success', label: 'Confirmada' },
    liberada: { tone: 'default', label: 'Liberada' },
    expirada: { tone: 'warning', label: 'Expirada' },
  };
  const cfg = map[status] ?? { tone: 'default' as const, label: status };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}