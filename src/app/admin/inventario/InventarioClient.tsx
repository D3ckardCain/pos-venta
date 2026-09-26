'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Boxes,
  AlertTriangle,
  PackageX,
  Download,
  SlidersHorizontal,
  History,
  Filter,
} from 'lucide-react';
import type {
  Inventory,
  Category,
  Currency,
  InventoryMovement,
} from '@/lib/types/database';
import {
  exportInventoryExcelAction,
  recalculateReservedAction,
} from './actions';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { SearchBar } from '@/components/shared/SearchBar';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/utils/currency';
import { AdjustStockModal } from './AdjustStockModal';

interface Props {
  initialInventory: Inventory[];
  categories: Pick<Category, 'id' | 'name'>[];
  primaryCurrency: Currency | null;
  recentMovements: InventoryMovement[];
}

type StockFilter = 'all' | 'low' | 'out' | 'ok';
type ViewTab = 'stock' | 'movements';

export function InventarioClient({
  initialInventory,
  categories,
  primaryCurrency,
  recentMovements,
}: Props) {
  const { showToast } = useToast();

  const [tab, setTab] = useState<ViewTab>('stock');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStock, setFilterStock] = useState<StockFilter>('all');

  const [adjusting, setAdjusting] = useState<Inventory | null>(null);
  const [isPending, startTransition] = useTransition();

  // KPIs
  const totalItems = initialInventory.length;
  const totalStock = useMemo(
    () => initialInventory.reduce((sum, i) => sum + Number(i.stock), 0),
    [initialInventory]
  );
  const lowStockCount = useMemo(
    () =>
      initialInventory.filter((i) => {
        const min = Number(i.product?.min_stock ?? 0);
        return min > 0 && Number(i.stock) <= min && Number(i.stock) > 0;
      }).length,
    [initialInventory]
  );
  const outOfStockCount = useMemo(
    () => initialInventory.filter((i) => Number(i.stock) <= 0).length,
    [initialInventory]
  );
  const totalValue = useMemo(
    () =>
      initialInventory.reduce(
        (sum, i) => sum + Number(i.stock) * Number(i.product?.cost ?? 0),
        0
      ),
    [initialInventory]
  );

  const filtered = useMemo(() => {
    let list = [...initialInventory];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (i) =>
          (i.product?.name ?? '').toLowerCase().includes(q) ||
          (i.product?.sku ?? '').toLowerCase().includes(q) ||
          (i.variant?.name ?? '').toLowerCase().includes(q) ||
          (i.variant?.sku ?? '').toLowerCase().includes(q)
      );
    }

    if (filterCategory !== 'all') {
      list = list.filter((i) => i.product?.category_id === filterCategory);
    }

    if (filterStock === 'low') {
      list = list.filter((i) => {
        const min = Number(i.product?.min_stock ?? 0);
        return min > 0 && Number(i.stock) <= min && Number(i.stock) > 0;
      });
    } else if (filterStock === 'out') {
      list = list.filter((i) => Number(i.stock) <= 0);
    } else if (filterStock === 'ok') {
      list = list.filter((i) => {
        const min = Number(i.product?.min_stock ?? 0);
        return Number(i.stock) > min;
      });
    }

    return list;
  }, [initialInventory, search, filterCategory, filterStock]);

  const activeFiltersCount =
    (search ? 1 : 0) +
    (filterCategory !== 'all' ? 1 : 0) +
    (filterStock !== 'all' ? 1 : 0);

  function clearFilters() {
    setSearch('');
    setFilterCategory('all');
    setFilterStock('all');
  }

  function handleExport() {
    startTransition(async () => {
      const res = await exportInventoryExcelAction();
      if (res.error) {
        showToast(res.error, 'error');
        return;
      }
      if (res.fileBase64 && res.filename) {
        downloadExcelFromBase64(res.fileBase64, res.filename);
        showToast('Inventario exportado', 'success');
      }
    });
  }

  function handleRecalculate() {
    startTransition(async () => {
      const res = await recalculateReservedAction();
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Reservas recalculadas', 'success');
      }
    });
  }

  const inventoryColumns: Column<Inventory>[] = [
    {
      key: 'product',
      header: 'Producto',
      render: (i) => (
        <div>
          <p className="font-medium">{i.product?.name ?? '-'}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {i.product?.sku ?? '-'}
            {i.variant ? ` - ${i.variant.name}` : ''}
            {i.variant?.sku ? ` (${i.variant.sku})` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'unit',
      header: 'Unidad',
      render: (i) => (
        <span className="text-sm text-muted-foreground">
          {i.product?.unit ?? '-'}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      render: (i) => {
        const stock = Number(i.stock);
        const min = Number(i.product?.min_stock ?? 0);
        const isOut = stock <= 0;
        const isLow = !isOut && min > 0 && stock <= min;
        return (
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{stock}</span>
            {isOut && <Badge tone="destructive">Agotado</Badge>}
            {isLow && <Badge tone="warning">Bajo</Badge>}
          </div>
        );
      },
    },
    {
      key: 'reserved',
      header: 'Reservado',
      render: (i) => (
        <span className="font-mono text-sm text-muted-foreground">
          {Number(i.reserved)}
        </span>
      ),
    },
    {
      key: 'available',
      header: 'Disponible',
      render: (i) => (
        <span className="font-mono text-sm font-medium">
          {Number(i.available)}
        </span>
      ),
    },
    {
      key: 'cost',
      header: 'Costo',
      render: (i) =>
        primaryCurrency ? (
          <span className="font-mono text-sm text-muted-foreground">
            {formatCurrency(Number(i.product?.cost ?? 0), primaryCurrency)}
          </span>
        ) : (
          '-'
        ),
    },
    {
      key: 'value',
      header: 'Valor total',
      render: (i) =>
        primaryCurrency ? (
          <span className="font-mono text-sm">
            {formatCurrency(
              Number(i.stock) * Number(i.product?.cost ?? 0),
              primaryCurrency
            )}
          </span>
        ) : (
          '-'
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (i) => (
        <div className="flex justify-end gap-1">
          <Link
            href={`/admin/inventario/kardex?product_id=${i.product_id}${
              i.variant_id ? `&variant_id=${i.variant_id}` : ''
            }`}
          >
            <button
              type="button"
              title="Ver kardex"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <History className="h-4 w-4" />
            </button>
          </Link>
          <button
            type="button"
            title="Ajustar stock"
            onClick={() => setAdjusting(i)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const movementColumns: Column<InventoryMovement>[] = [
    {
      key: 'created_at',
      header: 'Fecha',
      render: (m) => (
        <span className="text-sm">
          {new Date(m.created_at).toLocaleString('es-MX')}
        </span>
      ),
    },
    {
      key: 'movement_type',
      header: 'Tipo',
      render: (m) => <MovementTypeBadge type={m.movement_type} />,
    },
    {
      key: 'product',
      header: 'Producto',
      render: (m) => (
        <div>
          <p className="text-sm font-medium">{m.product?.name ?? '-'}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {m.product?.sku ?? '-'}
            {m.variant ? ` - ${m.variant.name}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Cantidad',
      render: (m) => {
        const q = Number(m.quantity);
        return (
          <span
            className={`font-mono text-sm font-semibold ${
              q > 0 ? 'text-emerald-600' : q < 0 ? 'text-red-600' : ''
            }`}
          >
            {q > 0 ? `+${q}` : q}
          </span>
        );
      },
    },
    {
      key: 'stock_after',
      header: 'Stock final',
      render: (m) => (
        <span className="font-mono text-sm">{Number(m.stock_after)}</span>
      ),
    },
    {
      key: 'reason',
      header: 'Motivo',
      render: (m) => (
        <span className="text-sm text-muted-foreground">{m.reason ?? '-'}</span>
      ),
    },
    {
      key: 'user',
      header: 'Usuario',
      render: (m) => (
        <span className="text-sm text-muted-foreground">
          {m.user?.full_name ?? m.user?.email ?? '-'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventario</h1>
          <p className="text-sm text-muted-foreground">
            Existencias, movimientos y ajustes. Toda modificacion queda auditada.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRecalculate} disabled={isPending}>
            Recalcular reservas
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={isPending}>
            <Download className="h-4 w-4" />
            Exportar Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Productos"
          value={String(totalItems)}
          icon={<Boxes className="h-4 w-4" />}
        />
        <KpiCard
          label="Unidades en stock"
          value={String(totalStock)}
          icon={<Boxes className="h-4 w-4" />}
        />
        <KpiCard
          label="Stock bajo"
          value={String(lowStockCount)}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="warning"
        />
        <KpiCard
          label="Agotados"
          value={String(outOfStockCount)}
          icon={<PackageX className="h-4 w-4" />}
          tone="danger"
        />
        <KpiCard
          label="Valor del inventario"
          value={
            primaryCurrency ? formatCurrency(totalValue, primaryCurrency) : '-'
          }
          icon={<Boxes className="h-4 w-4" />}
          tone="success"
        />
      </div>

      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setTab('stock')}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
            tab === 'stock'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Boxes className="h-4 w-4" />
          Existencias
        </button>
        <button
          type="button"
          onClick={() => setTab('movements')}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
            tab === 'movements'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <History className="h-4 w-4" />
          Ultimos movimientos
        </button>
      </div>

      {tab === 'stock' && (
        <>
          <div className="rounded-lg border bg-background p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder="Buscar por producto, SKU o variante..."
              />
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-44"
                >
                  <option value="all">Categoria: todas</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <Select
                  value={filterStock}
                  onChange={(e) => setFilterStock(e.target.value as StockFilter)}
                  className="w-40"
                >
                  <option value="all">Stock: todos</option>
                  <option value="ok">Stock normal</option>
                  <option value="low">Stock bajo</option>
                  <option value="out">Agotados</option>
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
                title={search ? 'Sin resultados' : 'Sin inventario'}
                description={
                  search
                    ? 'Prueba con otro termino de busqueda.'
                    : 'Los productos que crees apareceran aqui automaticamente.'
                }
                icon={<Boxes className="h-8 w-8" />}
              />
            ) : (
              <DataTable
                columns={inventoryColumns}
                rows={filtered}
                rowKey={(i) => i.id}
              />
            )}
          </div>
        </>
      )}

      {tab === 'movements' && (
        <div className="rounded-lg border bg-background">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-medium">
              Ultimos {recentMovements.length} movimientos
            </p>
            <Link href="/admin/inventario/kardex">
              <Button variant="outline" size="sm">
                Ver kardex completo
              </Button>
            </Link>
          </div>
          {recentMovements.length === 0 ? (
            <EmptyState
              title="Sin movimientos"
              description="Los movimientos de inventario apareceran aqui."
              icon={<History className="h-8 w-8" />}
            />
          ) : (
            <DataTable
              columns={movementColumns}
              rows={recentMovements}
              rowKey={(m) => m.id}
            />
          )}
        </div>
      )}

      <AdjustStockModal
        open={!!adjusting}
        onClose={() => setAdjusting(null)}
        inventory={adjusting}
        primaryCurrency={primaryCurrency}
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
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const toneClass =
    tone === 'warning'
      ? 'text-amber-600 bg-amber-50'
      : tone === 'danger'
      ? 'text-red-600 bg-red-50'
      : tone === 'success'
      ? 'text-emerald-600 bg-emerald-50'
      : 'text-primary bg-primary/10';
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

export function MovementTypeBadge({ type }: { type: string }) {
  const map: Record<
    string,
    { tone: 'default' | 'success' | 'warning' | 'destructive' | 'info'; label: string }
  > = {
    entrada: { tone: 'success', label: 'Entrada' },
    salida: { tone: 'info', label: 'Salida' },
    ajuste: { tone: 'warning', label: 'Ajuste' },
    devolucion: { tone: 'success', label: 'Devolucion' },
    cancelacion: { tone: 'success', label: 'Cancelacion' },
    reserva: { tone: 'info', label: 'Reserva' },
    liberacion_reserva: { tone: 'default', label: 'Liberacion' },
    transferencia: { tone: 'default', label: 'Transferencia' },
  };
  const cfg = map[type] ?? { tone: 'default' as const, label: type };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

// ============================================
// DESCARGA DEL EXCEL (decodifica base64)
// ============================================
function downloadExcelFromBase64(base64: string, filename: string) {
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