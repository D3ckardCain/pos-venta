'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Power,
  Star,
  Package,
  Image as ImageIcon,
  Filter,
} from 'lucide-react';
import type { Product, Category, Currency } from '@/lib/types/database';
import {
  deleteProductAction,
  toggleProductActiveAction,
  toggleProductFeaturedAction,
  type ActionState,
} from './actions';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { SearchBar } from '@/components/shared/SearchBar';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/utils/currency';
import { ProductFormModal } from './ProductFormModal';

const initialActionState: ActionState = {
  error: null,
  success: false,
  timestamp: 0,
};

interface Props {
  initialProducts: Product[];
  categories: Category[];
  currencies: Currency[];
}

export function ProductosClient({
  initialProducts,
  categories,
  currencies,
}: Props) {
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterFeatured, setFilterFeatured] = useState<'all' | 'yes' | 'no'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [, startTransition] = useTransition();

  const primaryCurrency = currencies[0];

  const filtered = useMemo(() => {
    let list = [...initialProducts];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          (p.sku ?? '').toLowerCase().includes(q) ||
          (p.barcode ?? '').toLowerCase().includes(q) ||
          (p.brand ?? '').toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q)
      );
    }

    if (filterCategory !== 'all')
      list = list.filter((p) => p.category_id === filterCategory);

    if (filterActive === 'active') list = list.filter((p) => p.is_active);
    if (filterActive === 'inactive') list = list.filter((p) => !p.is_active);

    if (filterFeatured === 'yes') list = list.filter((p) => p.is_featured);
    if (filterFeatured === 'no') list = list.filter((p) => !p.is_featured);

    return list;
  }, [initialProducts, search, filterCategory, filterActive, filterFeatured]);

  const activeFiltersCount =
    (search ? 1 : 0) +
    (filterCategory !== 'all' ? 1 : 0) +
    (filterActive !== 'all' ? 1 : 0) +
    (filterFeatured !== 'all' ? 1 : 0);

  function clearFilters() {
    setSearch('');
    setFilterCategory('all');
    setFilterActive('all');
    setFilterFeatured('all');
  }

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  function confirmDeleteNow() {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    startTransition(async () => {
      const res = await deleteProductAction(target.id);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Producto eliminado o desactivado', 'success');
      }
    });
  }

  function handleToggleActive(p: Product) {
    startTransition(async () => {
      const res = await toggleProductActiveAction(p.id, !p.is_active);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast(
          p.is_active ? 'Producto desactivado' : 'Producto activado',
          'success'
        );
      }
    });
  }

  function handleToggleFeatured(p: Product) {
    startTransition(async () => {
      const res = await toggleProductFeaturedAction(p.id, !p.is_featured);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast(
          p.is_featured ? 'Quitado de destacados' : 'Marcado como destacado',
          'success'
        );
      }
    });
  }

  const columns: Column<Product>[] = [
    {
      key: 'product',
      header: 'Producto',
      render: (p) => {
        const primaryImg = p.images?.find((i) => i.is_primary) ?? p.images?.[0];
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
              {primaryImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={primaryImg.url}
                  alt={p.name}
                  className="h-10 w-10 object-cover"
                />
              ) : (
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate font-medium">{p.name}</p>
                {p.is_featured && (
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                )}
              </div>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {p.sku ?? '-'} - /{p.slug}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'category',
      header: 'Categoria',
      render: (p) =>
        p.category ? (
          <span className="text-sm">{p.category.name}</span>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        ),
    },
    {
      key: 'cost',
      header: 'Costo',
      render: (p) =>
        primaryCurrency ? (
          <span className="font-mono text-sm text-muted-foreground">
            {formatCurrency(Number(p.cost), primaryCurrency)}
          </span>
        ) : (
          <span className="text-sm">-</span>
        ),
    },
    {
      key: 'base_price',
      header: 'Precio base',
      render: (p) =>
        primaryCurrency ? (
          <span className="font-mono text-sm font-medium">
            {formatCurrency(Number(p.base_price), primaryCurrency)}
          </span>
        ) : (
          <span className="text-sm">-</span>
        ),
    },
    {
      key: 'variants',
      header: 'Variantes',
      render: (p) =>
        p.has_variants ? (
          <Badge tone="info">{p.variants?.length ?? 0} var.</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        ),
    },
    {
      key: 'is_active',
      header: 'Estado',
      render: (p) =>
        p.is_active ? <Badge tone="success">Activo</Badge> : <Badge tone="default">Inactivo</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (p) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            title={p.is_featured ? 'Quitar destacado' : 'Destacar'}
            onClick={() => handleToggleFeatured(p)}
            className={`rounded-md p-1.5 ${
              p.is_featured
                ? 'text-amber-500 hover:bg-amber-50'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Star className={`h-4 w-4 ${p.is_featured ? 'fill-amber-400' : ''}`} />
          </button>
          <button
            type="button"
            title={p.is_active ? 'Desactivar' : 'Activar'}
            onClick={() => handleToggleActive(p)}
            className={`rounded-md p-1.5 ${
              p.is_active
                ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                : 'text-emerald-600 hover:bg-emerald-50'
            }`}
          >
            <Power className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Editar"
            onClick={() => openEdit(p)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Eliminar"
            onClick={() => setConfirmDelete(p)}
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
          <h1 className="text-2xl font-bold tracking-tight">Productos</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona productos, variantes, imagenes y precios multimoneda.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo producto
        </Button>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre, SKU, codigo de barras, marca..."
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
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value as typeof filterActive)}
              className="w-36"
            >
              <option value="all">Estado: todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </Select>
            <Select
              value={filterFeatured}
              onChange={(e) => setFilterFeatured(e.target.value as typeof filterFeatured)}
              className="w-40"
            >
              <option value="all">Destacados: todos</option>
              <option value="yes">Solo destacados</option>
              <option value="no">No destacados</option>
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
            title={search ? 'Sin resultados' : 'No hay productos'}
            description={
              search
                ? 'Prueba con otro termino de busqueda.'
                : 'Crea el primer producto para comenzar a vender.'
            }
            icon={<Package className="h-8 w-8" />}
            action={
              !search ? (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Nuevo producto
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable columns={columns} rows={filtered} rowKey={(p) => p.id} />
        )}
      </div>

      <ProductFormModal
        open={modalOpen}
        onClose={closeModal}
        product={editing}
        categories={categories}
        currencies={currencies}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Eliminar "${confirmDelete?.name ?? ''}"?`}
        description="Si el producto tiene ventas o pedidos asociados, se desactivara en lugar de eliminarse. Esta accion no se puede deshacer."
        confirmLabel="Eliminar"
        variant="destructive"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={confirmDeleteNow}
      />
    </div>
  );
}