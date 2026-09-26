'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, X, History } from 'lucide-react';
import type {
  InventoryMovement,
  Product,
  Category,
} from '@/lib/types/database';
import { exportKardexExcelAction } from '../actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SearchBar } from '@/components/shared/SearchBar';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { MovementTypeBadge } from '../InventarioClient';

interface Props {
  initialMovements: InventoryMovement[];
  products: Pick<Product, 'id' | 'name' | 'sku' | 'category_id'>[];
  categories: Pick<Category, 'id' | 'name'>[];
  initialFilters: {
    product_id?: string;
    variant_id?: string;
    movement_type?: string;
    from?: string;
    to?: string;
  };
}

export function KardexClient({
  initialMovements,
  products,
  categories,
  initialFilters,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [filterProduct, setFilterProduct] = useState(
    initialFilters.product_id ?? 'all'
  );
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterType, setFilterType] = useState(
    initialFilters.movement_type ?? 'all'
  );
  const [filterFrom, setFilterFrom] = useState(initialFilters.from ?? '');
  const [filterTo, setFilterTo] = useState(initialFilters.to ?? '');
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    let list = [...initialMovements];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          (m.product?.name ?? '').toLowerCase().includes(q) ||
          (m.product?.sku ?? '').toLowerCase().includes(q) ||
          (m.variant?.name ?? '').toLowerCase().includes(q) ||
          (m.reason ?? '').toLowerCase().includes(q) ||
          (m.notes ?? '').toLowerCase().includes(q) ||
          (m.user?.full_name ?? '').toLowerCase().includes(q) ||
          (m.user?.email ?? '').toLowerCase().includes(q)
      );
    }

    if (filterProduct !== 'all')
      list = list.filter((m) => m.product_id === filterProduct);

    if (filterCategory !== 'all') {
      list = list.filter((m) => {
        const product = products.find((p) => p.id === m.product_id);
        return product?.category_id === filterCategory;
      });
    }

    if (filterType !== 'all')
      list = list.filter((m) => m.movement_type === filterType);

    if (filterFrom)
      list = list.filter(
        (m) => new Date(m.created_at) >= new Date(filterFrom)
      );
    if (filterTo) {
      const to = new Date(filterTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((m) => new Date(m.created_at) <= to);
    }

    return list;
  }, [
    initialMovements,
    search,
    filterProduct,
    filterCategory,
    filterType,
    filterFrom,
    filterTo,
    products,
  ]);

  const activeFiltersCount =
    (search ? 1 : 0) +
    (filterProduct !== 'all' ? 1 : 0) +
    (filterCategory !== 'all' ? 1 : 0) +
    (filterType !== 'all' ? 1 : 0) +
    (filterFrom ? 1 : 0) +
    (filterTo ? 1 : 0);

  function clearFilters() {
    setSearch('');
    setFilterProduct('all');
    setFilterCategory('all');
    setFilterType('all');
    setFilterFrom('');
    setFilterTo('');
    router.push('/admin/inventario/kardex');
  }

  function handleExport() {
    startTransition(async () => {
      const res = await exportKardexExcelAction({
        product_id: filterProduct !== 'all' ? filterProduct : undefined,
        movement_type: filterType !== 'all' ? filterType : undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
      });
      if (res.error) {
        showToast(res.error, 'error');
        return;
      }
      if (res.fileBase64 && res.filename) {
        downloadExcelFromBase64(res.fileBase64, res.filename);
        showToast('Kardex exportado', 'success');
      }
    });
  }

  const columns: Column<InventoryMovement>[] = [
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
          <Link
            href={`/admin/productos?search=${m.product?.sku ?? ''}`}
            className="text-sm font-medium hover:underline"
          >
            {m.product?.name ?? '-'}
          </Link>
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
      key: 'stock',
      header: 'Stock antes - despues',
      render: (m) => (
        <span className="font-mono text-xs text-muted-foreground">
          {Number(m.stock_before)} - {Number(m.stock_after)}
        </span>
      ),
    },
    {
      key: 'unit_cost',
      header: 'Costo unit.',
      render: (m) => (
        <span className="font-mono text-sm text-muted-foreground">
          {m.unit_cost !== null ? Number(m.unit_cost).toFixed(2) : '-'}
        </span>
      ),
    },
    {
      key: 'reference',
      header: 'Referencia',
      render: (m) => (
        <span className="text-xs text-muted-foreground">
          {m.reference_type ?? '-'}
        </span>
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
        <div className="flex items-center gap-3">
          <Link href="/admin/inventario">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Kardex</h1>
            <p className="text-sm text-muted-foreground">
              Historial completo de movimientos de inventario.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={isPending}>
          <Download className="h-4 w-4" />
          Exportar Excel
        </Button>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Buscar por producto, motivo, usuario..."
            />
            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" />
                Limpiar filtros ({activeFiltersCount})
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Select
              value={filterProduct}
              onChange={(e) => setFilterProduct(e.target.value)}
            >
              <option value="all">Producto: todos</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>

            <Select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="all">Categoria: todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>

            <Select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">Tipo: todos</option>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
              <option value="ajuste">Ajuste</option>
              <option value="devolucion">Devolucion</option>
              <option value="cancelacion">Cancelacion</option>
              <option value="reserva">Reserva</option>
              <option value="liberacion_reserva">Liberacion de reserva</option>
            </Select>

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
            title="Sin movimientos"
            description={
              activeFiltersCount > 0
                ? 'No hay movimientos que coincidan con los filtros.'
                : 'Aun no se han registrado movimientos de inventario.'
            }
            icon={<History className="h-8 w-8" />}
          />
        ) : (
          <DataTable columns={columns} rows={filtered} rowKey={(m) => m.id} />
        )}
      </div>

      {isPending && (
        <div className="pointer-events-none fixed inset-0 z-40 bg-black/10" />
      )}
    </div>
  );
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