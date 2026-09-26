'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState } from 'react-dom';
import {
  Plus,
  Pencil,
  Power,
  Trash2,
  Percent,
  Download,
  Filter,
  Search,
  Tag,
  Calendar,
  ChevronRight,
  ChevronDown,
  XCircle,
  RotateCcw,
  History,
  ShoppingCart,
  Layers,
} from 'lucide-react';
import type {
  Promotion,
  Currency,
  Product,
  Category,
} from '@/lib/types/database';
import {
  createPromotionAction,
  updatePromotionAction,
  togglePromotionAction,
  revokePromotionAction,
  restorePromotionAction,
  deletePromotionPermanentlyAction,
  exportPromotionsExcelAction,
  getPromotionHistoryAction,
  exportPromotionHistoryExcel,
  type ActionState,
  type PromotionHistoryEvent,
  type PromotionHistoryCounters,
  type PromotionAppliedItem,
} from './actions';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { SearchBar } from '@/components/shared/SearchBar';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';

const initialActionState: ActionState = {
  error: null,
  success: false,
  timestamp: 0,
};

interface ProductWithVariants
  extends Pick<Product, 'id' | 'name' | 'sku' | 'base_price'> {
  has_variants?: boolean;
  variants?: Array<{
    id: string;
    name: string;
    sku: string | null;
    base_price: number | null;
  }>;
}

interface Props {
  initialPromotions: Promotion[];
  currencies: Currency[];
  products: ProductWithVariants[];
  categories: Pick<Category, 'id' | 'name'>[];
}

type TypeFilter = 'all' | 'porcentaje' | 'monto_fijo' | 'precio_especial' | '2x1';
type StateFilter =
  | 'all'
  | 'active'
  | 'inactive'
  | 'expired'
  | 'upcoming'
  | 'revoked';

export function PromocionesClient({
  initialPromotions,
  currencies,
  products,
  categories,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<TypeFilter>('all');
  const [filterState, setFilterState] = useState<StateFilter>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Promotion | null>(null);
  const [revoking, setRevoking] = useState<Promotion | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [historyOf, setHistoryOf] = useState<Promotion | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);

  const [createState, createFormAction] = useFormState(
    createPromotionAction,
    initialActionState
  );
  const [updateState, updateFormAction] = useFormState(
    updatePromotionAction,
    initialActionState
  );

  useEffect(() => {
    if (createState.timestamp > 0) {
      if (createState.success) {
        setModalOpen(false);
        showToast('Promoción creada', 'success');
        router.refresh();
      } else if (createState.error) {
        showToast(createState.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createState.timestamp]);

  useEffect(() => {
    if (updateState.timestamp > 0) {
      if (updateState.success) {
        setModalOpen(false);
        setEditing(null);
        showToast('Promoción actualizada', 'success');
        router.refresh();
      } else if (updateState.error) {
        showToast(updateState.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateState.timestamp]);

  const now = new Date();

  const filtered = useMemo(() => {
    let list = [...initialPromotions];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q)
      );
    }

    if (filterType !== 'all') list = list.filter((p) => p.type === filterType);

    if (filterState !== 'all') {
      list = list.filter((p) => {
        const starts = new Date(p.starts_at);
        const ends = p.ends_at ? new Date(p.ends_at) : null;
        const isRevoked = !!p.revoked_at;

        if (filterState === 'revoked') return isRevoked;
        if (isRevoked) return false;
        if (filterState === 'active')
          return p.is_active && starts <= now && (!ends || ends > now);
        if (filterState === 'inactive') return !p.is_active;
        if (filterState === 'expired') return ends !== null && ends <= now;
        if (filterState === 'upcoming') return starts > now;
        return true;
      });
    }

    return list;
  }, [initialPromotions, search, filterType, filterState]);

  const counts = useMemo(() => {
    let active = 0;
    let expired = 0;
    let upcoming = 0;
    let inactive = 0;
    let revoked = 0;
    for (const p of initialPromotions) {
      const starts = new Date(p.starts_at);
      const ends = p.ends_at ? new Date(p.ends_at) : null;
      if (p.revoked_at) revoked++;
      else if (!p.is_active) inactive++;
      else if (ends && ends <= now) expired++;
      else if (starts > now) upcoming++;
      else active++;
    }
    return {
      total: initialPromotions.length,
      active,
      expired,
      upcoming,
      inactive,
      revoked,
    };
  }, [initialPromotions, now]);

  const activeFiltersCount =
    (search ? 1 : 0) +
    (filterType !== 'all' ? 1 : 0) +
    (filterState !== 'all' ? 1 : 0);

  function clearFilters() {
    setSearch('');
    setFilterType('all');
    setFilterState('all');
  }

  function handleToggle(p: Promotion) {
    if (p.revoked_at) {
      showToast(
        'Una promoción revocada no se puede activar. Restáurala primero.',
        'error'
      );
      return;
    }
    startTransition(async () => {
      const res = await togglePromotionAction(p.id, !p.is_active);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast(
          p.is_active ? 'Promoción desactivada' : 'Promoción activada',
          'success'
        );
        router.refresh();
      }
    });
  }

  function handleRestore(p: Promotion) {
    startTransition(async () => {
      const res = await restorePromotionAction(p.id, false);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Promoción restaurada (inactiva)', 'success');
        router.refresh();
      }
    });
  }

  function handleRevokeNow() {
    if (!revoking) return;
    const target = revoking;
    const reason = revokeReason;
    setRevoking(null);
    setRevokeReason('');
    startTransition(async () => {
      const res = await revokePromotionAction(target.id, reason || undefined);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Promoción revocada', 'success');
        router.refresh();
      }
    });
  }

  function confirmDeleteNow() {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    startTransition(async () => {
      const res = await deletePromotionPermanentlyAction(target.id);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Promoción eliminada permanentemente', 'success');
        router.refresh();
      }
    });
  }

  async function handleExport() {
    setIsExporting(true);
    try {
      const res = await exportPromotionsExcelAction();
      if (res.error) {
        showToast(res.error, 'error');
        return;
      }
      if (res.fileBase64 && res.filename) {
        downloadExcelFromBase64(res.fileBase64, res.filename);
        showToast('Promociones exportadas', 'success');
      }
    } finally {
      setIsExporting(false);
    }
  }

  const columns: Column<Promotion>[] = [
    {
      key: 'name',
      header: 'Promoción',
      render: (p) => (
        <div>
          <p className="font-medium">{p.name}</p>
          {p.description && (
            <p className="line-clamp-1 text-xs text-muted-foreground">
              {p.description}
            </p>
          )}
          {p.revoke_reason && (
            <p className="mt-0.5 text-xs text-red-600">
              Revocada: {p.revoke_reason}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (p) => (
        <PromotionTypeBadge type={p.type} value={p.value} currency={p.currency} />
      ),
    },
    {
      key: 'vigencia',
      header: 'Vigencia',
      render: (p) => {
        const starts = new Date(p.starts_at);
        const ends = p.ends_at ? new Date(p.ends_at) : null;
        const expired = ends && ends <= now;
        const upcoming = starts > now;
        return (
          <div className="text-xs">
            <p className={upcoming ? 'text-blue-600' : ''}>
              {starts.toLocaleDateString('es-MX')}
            </p>
            <p className="text-muted-foreground">
              {ends ? `→ ${ends.toLocaleDateString('es-MX')}` : 'Sin fin'}
              {expired && ' (expirada)'}
            </p>
          </div>
        );
      },
    },
    {
      key: 'uses',
      header: 'Usos',
      render: (p) => (
        <span className="text-sm">
          {p.current_uses}
          {p.max_uses ? ` / ${p.max_uses}` : ''}
        </span>
      ),
    },
    {
      key: 'scope',
      header: 'Aplica a',
      render: (p) => {
        const prods = p.products?.length ?? 0;
        const vars =
          p.products?.filter((x) => x.variant_id !== null).length ?? 0;
        const cats = p.categories?.length ?? 0;
        return (
          <div className="flex flex-wrap gap-1">
            {prods > 0 && <Badge tone="info">{prods} producto(s)</Badge>}
            {vars > 0 && <Badge tone="warning">{vars} variante(s)</Badge>}
            {cats > 0 && <Badge tone="info">{cats} categoría(s)</Badge>}
            {prods === 0 && cats === 0 && <Badge tone="default">Global</Badge>}
          </div>
        );
      },
    },
    {
      key: 'is_active',
      header: 'Estado',
      render: (p) => {
        const ends = p.ends_at ? new Date(p.ends_at) : null;
        const starts = new Date(p.starts_at);
        if (p.revoked_at) return <Badge tone="destructive">Revocada</Badge>;
        if (!p.is_active) return <Badge tone="default">Inactiva</Badge>;
        if (starts > now) return <Badge tone="info">Programada</Badge>;
        if (ends && ends <= now) return <Badge tone="warning">Expirada</Badge>;
        return <Badge tone="success">Activa</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (p) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            title="Ver historial"
            onClick={() => setHistoryOf(p)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <History className="h-4 w-4" />
          </button>
          {!p.revoked_at ? (
            <>
              <button
                type="button"
                title="Editar"
                onClick={() => {
                  setEditing(p);
                  setModalOpen(true);
                }}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                title={p.is_active ? 'Desactivar (pausa)' : 'Activar'}
                onClick={() => handleToggle(p)}
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
                title="Revocar (cancelación anticipada)"
                onClick={() => setRevoking(p)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-amber-50 hover:text-amber-600"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              title="Restaurar (queda inactiva)"
              onClick={() => handleRestore(p)}
              className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            title="Eliminar permanentemente"
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
          <h1 className="text-2xl font-bold tracking-tight">Promociones</h1>
          <p className="text-sm text-muted-foreground">
            Descuentos y ofertas con vigencias configurables y soporte de
            variantes.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isExporting}
          >
            <Download className="h-4 w-4" />
            Exportar Excel
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nueva promoción
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Total"
          value={String(counts.total)}
          icon={<Percent className="h-4 w-4" />}
        />
        <KpiCard
          label="Activas"
          value={String(counts.active)}
          icon={<Calendar className="h-4 w-4" />}
          tone="success"
        />
        <KpiCard
          label="Programadas"
          value={String(counts.upcoming)}
          icon={<Calendar className="h-4 w-4" />}
          tone="info"
        />
        <KpiCard
          label="Expiradas"
          value={String(counts.expired)}
          icon={<Calendar className="h-4 w-4" />}
          tone="warning"
        />
        <KpiCard
          label="Inactivas"
          value={String(counts.inactive)}
          icon={<Percent className="h-4 w-4" />}
        />
        <KpiCard
          label="Revocadas"
          value={String(counts.revoked)}
          icon={<XCircle className="h-4 w-4" />}
          tone="danger"
        />
      </div>

      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre o descripción…"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as TypeFilter)}
              className="w-44"
            >
              <option value="all">Tipo: todos</option>
              <option value="porcentaje">% Descuento</option>
              <option value="monto_fijo">Monto fijo</option>
              <option value="precio_especial">Precio especial</option>
              <option value="2x1">2x1</option>
            </Select>
            <Select
              value={filterState}
              onChange={(e) => setFilterState(e.target.value as StateFilter)}
              className="w-44"
            >
              <option value="all">Estado: todas</option>
              <option value="active">Activas</option>
              <option value="upcoming">Programadas</option>
              <option value="expired">Expiradas</option>
              <option value="inactive">Inactivas</option>
              <option value="revoked">Revocadas</option>
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
            title={search ? 'Sin resultados' : 'No hay promociones'}
            description={
              search
                ? 'Prueba con otro término de búsqueda.'
                : 'Crea la primera promoción para comenzar.'
            }
            icon={<Percent className="h-8 w-8" />}
            action={
              !search ? (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setModalOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Nueva promoción
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable columns={columns} rows={filtered} rowKey={(p) => p.id} />
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        title={editing ? `Editar ${editing.name}` : 'Nueva promoción'}
        description="Configura el tipo de descuento, su vigencia y a qué productos o variantes aplica."
        size="lg"
      >
        <PromotionForm
          key={editing?.id ?? 'new'}
          editing={editing}
          currencies={currencies}
          products={products}
          categories={categories}
          createFormAction={createFormAction}
          updateFormAction={updateFormAction}
          createState={createState}
          updateState={updateState}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
        />
      </Modal>

      <Modal
        open={!!revoking}
        onClose={() => {
          setRevoking(null);
          setRevokeReason('');
        }}
        title={`Revocar "${revoking?.name ?? ''}"`}
        description="La promoción quedará cancelada anticipadamente. No se borra: queda en el historial y se puede restaurar."
      >
        {revoking && (
          <form
            id="revoke-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleRevokeNow();
            }}
            className="space-y-4"
            autoComplete="off"
          >
            <Textarea
              label="Motivo (opcional)"
              rows={3}
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="Ej: Producto descontinuado, cambio de estrategia…"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRevoking(null);
                  setRevokeReason('');
                }}
              >
                Cancelar
              </Button>
              <SubmitButton
                loadingText="Revocando..."
                className="bg-amber-600 text-white hover:bg-amber-700"
              >
                Revocar promoción
              </SubmitButton>
            </div>
          </form>
        )}
      </Modal>

      {historyOf && (
        <HistoryModal
          promotion={historyOf}
          onClose={() => setHistoryOf(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title={`¿Eliminar permanentemente "${confirmDelete?.name ?? ''}"?`}
        description="⚠️ Esta acción NO se puede deshacer. La promoción desaparecerá del listado y del Excel. El historial se conserva. Si solo quieres cancelarla, usa 'Revocar'."
        confirmLabel="Eliminar permanentemente"
        variant="destructive"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={confirmDeleteNow}
      />

      {isPending && (
        <div className="pointer-events-none fixed inset-0 z-40 bg-black/10" />
      )}
    </div>
  );
}

// ============================================
// MODAL DE HISTORIAL (con contadores + aplicables)
// ============================================
function HistoryModal({
  promotion,
  onClose,
}: {
  promotion: Promotion;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [events, setEvents] = useState<PromotionHistoryEvent[]>([]);
  const [counters, setCounters] = useState<PromotionHistoryCounters | null>(
    null
  );
  const [applied, setApplied] = useState<PromotionAppliedItem[]>([]);
  const [promotionName, setPromotionName] = useState<string>(
    promotion.name
  );
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [showApplied, setShowApplied] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const res = await getPromotionHistoryAction(promotion.id);
      if (!mounted) return;
      if (res.error) {
        showToast(res.error, 'error');
      } else {
        setEvents(res.events ?? []);
        setCounters(res.counters ?? null);
        setApplied(res.applied ?? []);
        if (res.promotionName) setPromotionName(res.promotionName);
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promotion.id]);

  async function handleExportHistory() {
    setIsExporting(true);
    try {
      const res = await exportPromotionHistoryExcel(promotion.id);
      if (res.error) {
        showToast(res.error, 'error');
        return;
      }
      if (res.fileBase64 && res.filename) {
        downloadExcelFromBase64(res.fileBase64, res.filename);
        showToast('Historial exportado', 'success');
      }
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Historial de "${promotionName}"`}
      description="Cada cambio de estado queda registrado de forma inmutable."
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportHistory}
            disabled={isExporting || loading}
          >
            <Download className="h-4 w-4" />
            Exportar historial
          </Button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Cargando historial…
          </p>
        ) : (
          <>
            {/* Resumen de contadores */}
            {counters && (
              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Resumen de cambios
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <CounterCard
                    label="Total eventos"
                    value={counters.total}
                  />
                  <CounterCard
                    label="Creaciones"
                    value={counters.creadas}
                    tone="info"
                  />
                  <CounterCard
                    label="Activaciones"
                    value={counters.activadas}
                    tone="success"
                  />
                  <CounterCard
                    label="Desactivaciones"
                    value={counters.desactivadas}
                  />
                  <CounterCard
                    label="Revocaciones"
                    value={counters.revocadas}
                    tone="danger"
                  />
                  <CounterCard
                    label="Restauraciones"
                    value={counters.restauradas}
                    tone="warning"
                  />
                </div>
              </div>
            )}

            {/* Aplicables */}
            <div>
              <button
                type="button"
                onClick={() => setShowApplied((v) => !v)}
                className="flex w-full items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-sm font-semibold hover:bg-muted/40"
              >
                <span className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Aplica a ({applied.length})
                  {applied.length === 0 && (
                    <Badge tone="default">Todo el catálogo</Badge>
                  )}
                </span>
                {showApplied ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              {showApplied && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-md border bg-background">
                  {applied.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-muted-foreground">
                      Esta promoción aplica a todo el catálogo (no hay productos
                      ni categorías específicas).
                    </p>
                  ) : (
                    applied.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-0"
                      >
                        {item.type === 'category' ? (
                          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : item.type === 'variant' ? (
                          <Layers className="h-3.5 w-3.5 text-amber-600" />
                        ) : (
                          <ShoppingCart className="h-3.5 w-3.5 text-blue-600" />
                        )}
                        <span className="flex-1">
                          {item.name}
                          {item.detail && (
                            <span className="ml-2 font-mono text-xs text-muted-foreground">
                              {item.detail}
                            </span>
                          )}
                        </span>
                        <Badge
                          tone={
                            item.type === 'category'
                              ? 'default'
                              : item.type === 'variant'
                              ? 'warning'
                              : 'info'
                          }
                        >
                          {item.type === 'category'
                            ? 'Categoría'
                            : item.type === 'variant'
                            ? 'Variante'
                            : 'Producto'}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Lista de eventos */}
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Eventos ({events.length})
              </h3>
              {events.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Sin eventos registrados todavía.
                </p>
              ) : (
                <div className="space-y-2">
                  {events.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-start gap-3 rounded-md border bg-muted/20 p-3"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background">
                        <HistoryStatusIcon status={e.new_status} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <HistoryStatusBadge status={e.new_status} />
                          {e.previous_status && (
                            <span className="text-xs text-muted-foreground">
                              (antes: {e.previous_status})
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(e.changed_at).toLocaleString('es-MX')} ·{' '}
                          {e.user?.full_name ?? e.user?.email ?? 'Sistema'}
                        </p>
                        {e.reason && (
                          <p className="mt-1 text-sm">
                            <span className="text-muted-foreground">
                              Motivo:{' '}
                            </span>
                            {e.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function CounterCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'warning' | 'info' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-600'
      : tone === 'warning'
      ? 'text-amber-600'
      : tone === 'info'
      ? 'text-blue-600'
      : tone === 'danger'
      ? 'text-red-600'
      : 'text-foreground';
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function HistoryStatusIcon({ status }: { status: string }) {
  const cls = 'h-3.5 w-3.5';
  if (status === 'activada' || status.startsWith('restaurada')) {
    return <Power className={`${cls} text-emerald-600`} />;
  }
  if (status === 'revocada') {
    return <XCircle className={`${cls} text-red-600`} />;
  }
  if (status === 'creada') {
    return <Plus className={`${cls} text-blue-600`} />;
  }
  if (status === 'desactivada') {
    return <Power className={`${cls} text-muted-foreground`} />;
  }
  return <History className={`${cls} text-muted-foreground`} />;
}

function HistoryStatusBadge({ status }: { status: string }) {
  if (status === 'creada') return <Badge tone="info">Creada</Badge>;
  if (status === 'activada') return <Badge tone="success">Activada</Badge>;
  if (status === 'desactivada') return <Badge tone="default">Desactivada</Badge>;
  if (status === 'revocada') return <Badge tone="destructive">Revocada</Badge>;
  if (status === 'restaurada') return <Badge tone="warning">Restaurada</Badge>;
  if (status === 'restaurada (activada)')
    return <Badge tone="success">Restaurada + activada</Badge>;
  return <Badge>{status}</Badge>;
}

// ============================================
// FORMULARIO
// ============================================
function PromotionForm({
  editing,
  currencies,
  products,
  categories,
  createFormAction,
  updateFormAction,
  createState,
  updateState,
  onClose,
}: {
  editing: Promotion | null;
  currencies: Currency[];
  products: ProductWithVariants[];
  categories: Pick<Category, 'id' | 'name'>[];
  createFormAction: (fd: FormData) => void;
  updateFormAction: (fd: FormData) => void;
  createState: ActionState;
  updateState: ActionState;
  onClose: () => void;
}) {
  const state = editing ? updateState : createState;
  const action = editing ? updateFormAction : createFormAction;
  const fe = state.fieldErrors ?? {};

  const [type, setType] = useState<
    'porcentaje' | 'monto_fijo' | 'precio_especial' | '2x1'
  >(editing?.type ?? 'porcentaje');

  const [selectedItems, setSelectedItems] = useState<
    Array<{ product_id: string; variant_id: string | null }>
  >(
    editing?.products?.map((p) => ({
      product_id: p.product_id,
      variant_id: p.variant_id,
    })) ?? []
  );

  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    editing?.categories?.map((c) => c.category_id) ?? []
  );
  const [productSearch, setProductSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  const localIso = new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);

  function isProductSelected(productId: string) {
    return selectedItems.some(
      (x) => x.product_id === productId && x.variant_id === null
    );
  }
  function isVariantSelected(productId: string, variantId: string) {
    return selectedItems.some(
      (x) => x.product_id === productId && x.variant_id === variantId
    );
  }
  function toggleProduct(productId: string) {
    setSelectedItems((prev) => {
      const isSelected = prev.some(
        (x) => x.product_id === productId && x.variant_id === null
      );
      if (isSelected) return prev.filter((x) => x.product_id !== productId);
      const filtered = prev.filter((x) => x.product_id !== productId);
      return [...filtered, { product_id: productId, variant_id: null }];
    });
  }
  function toggleVariant(productId: string, variantId: string) {
    setSelectedItems((prev) => {
      const hasVariant = prev.some(
        (x) => x.product_id === productId && x.variant_id === variantId
      );
      if (hasVariant) {
        return prev.filter(
          (x) => !(x.product_id === productId && x.variant_id === variantId)
        );
      }
      const filtered = prev.filter(
        (x) => !(x.product_id === productId && x.variant_id === null)
      );
      return [...filtered, { product_id: productId, variant_id: variantId }];
    });
  }
  function toggleCategory(id: string) {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }
  function toggleExpanded(productId: string) {
    setExpanded((prev) => ({ ...prev, [productId]: !prev[productId] }));
  }

  return (
    <form
      id={editing ? 'promo-update-form' : 'promo-create-form'}
      action={action}
      className="space-y-4"
    >
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <input
        type="hidden"
        name="products"
        value={JSON.stringify(selectedItems)}
      />
      <input
        type="hidden"
        name="category_ids"
        value={JSON.stringify(selectedCategories)}
      />

      <Input
        label="Nombre"
        name="name"
        defaultValue={editing?.name ?? ''}
        error={fe.name}
        required
      />

      <Textarea
        label="Descripción (opcional)"
        name="description"
        rows={2}
        defaultValue={editing?.description ?? ''}
        error={fe.description}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Tipo"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          error={fe.type}
          required
        >
          <option value="porcentaje">Porcentaje de descuento</option>
          <option value="monto_fijo">Monto fijo de descuento</option>
          <option value="precio_especial">Precio especial</option>
          <option value="2x1">2x1 (paga 1, lleva 2)</option>
        </Select>

        <Input
          label={
            type === 'porcentaje'
              ? 'Descuento (%)'
              : type === '2x1'
              ? 'Valor (no aplica)'
              : 'Valor'
          }
          name="value"
          type="number"
          step="0.01"
          min="0"
          defaultValue={editing?.value ?? (type === '2x1' ? 0 : '')}
          error={fe.value}
          disabled={type === '2x1'}
          required={type !== '2x1'}
        />
      </div>

      {(type === 'monto_fijo' || type === 'precio_especial') && (
        <Select
          label="Moneda (opcional)"
          name="currency_id"
          defaultValue={editing?.currency_id ?? ''}
          error={fe.currency_id}
        >
          <option value="">Moneda principal</option>
          {currencies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </Select>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Input
          label="Cantidad mínima"
          name="min_quantity"
          type="number"
          step="1"
          min="0"
          defaultValue={editing?.min_quantity ?? 1}
          error={fe.min_quantity}
          hint="Ej: 2 para 2x1."
        />
        <Input
          label="Monto mínimo"
          name="min_amount"
          type="number"
          step="0.01"
          min="0"
          defaultValue={editing?.min_amount ?? ''}
          error={fe.min_amount}
          hint="Opcional."
        />
        <Input
          label="Máx. usos"
          name="max_uses"
          type="number"
          step="1"
          min="0"
          defaultValue={editing?.max_uses ?? ''}
          error={fe.max_uses}
          hint="Vacío = ilimitado."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Vigente desde"
          name="starts_at"
          type="datetime-local"
          defaultValue={
            editing
              ? new Date(editing.starts_at).toISOString().slice(0, 16)
              : localIso
          }
          error={fe.starts_at}
          required
        />
        <Input
          label="Vigente hasta (opcional)"
          name="ends_at"
          type="datetime-local"
          defaultValue={
            editing?.ends_at
              ? new Date(editing.ends_at).toISOString().slice(0, 16)
              : ''
          }
          error={fe.ends_at}
        />
      </div>

      <Checkbox
        name="is_active"
        label="Activa"
        defaultChecked={editing?.is_active ?? true}
      />

      <div>
        <p className="mb-2 text-sm font-medium">
          Productos y variantes aplicables
        </p>
        <p className="mb-2 text-xs text-muted-foreground">
          Si no seleccionas productos ni categorías, la promoción aplica a todo
          el catálogo. Marca el producto completo para aplicar a todas sus
          variantes, o expande y marca solo las variantes específicas.
        </p>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder="Buscar productos…"
            className="w-full rounded-md border bg-background py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="max-h-64 overflow-y-auto rounded-md border bg-background">
          {filteredProducts.map((p) => {
            const hasVariants =
              !!p.has_variants && (p.variants?.length ?? 0) > 0;
            const isExpanded = expanded[p.id];
            const productSelected = isProductSelected(p.id);
            const someVariantSelected = selectedItems.some(
              (x) => x.product_id === p.id && x.variant_id !== null
            );

            return (
              <div key={p.id} className="border-b last:border-0">
                <div className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted">
                  {hasVariants ? (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(p.id)}
                      className="flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>
                  ) : (
                    <span className="h-4 w-4" />
                  )}
                  <input
                    type="checkbox"
                    checked={productSelected}
                    onChange={() => toggleProduct(p.id)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="flex-1">
                    {p.name}
                    {p.sku ? ` · ${p.sku}` : ''}
                    {hasVariants && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({p.variants!.length} variantes)
                      </span>
                    )}
                    {someVariantSelected && !productSelected && (
                      <Badge tone="warning">
                        <span className="ml-2">variantes específicas</span>
                      </Badge>
                    )}
                  </span>
                </div>

                {hasVariants && isExpanded && (
                  <div className="bg-muted/30 pl-12 pr-3">
                    {p.variants!.map((v) => (
                      <label
                        key={v.id}
                        className="flex cursor-pointer items-center gap-2 border-b py-1.5 text-xs last:border-0"
                      >
                        <input
                          type="checkbox"
                          checked={isVariantSelected(p.id, v.id)}
                          onChange={() => toggleVariant(p.id, v.id)}
                          className="h-3 w-3"
                          disabled={productSelected}
                        />
                        <span className="flex-1">
                          {v.name}
                          {v.sku ? ` · ${v.sku}` : ''}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {filteredProducts.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Sin resultados.
            </p>
          )}
        </div>

        {selectedItems.length > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {selectedItems.length} selección(es) —{' '}
            {selectedItems.filter((x) => x.variant_id === null).length}{' '}
            producto(s) completo(s),{' '}
            {selectedItems.filter((x) => x.variant_id !== null).length}{' '}
            variante(s)
          </p>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Categorías aplicables</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <label
              key={c.id}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                selectedCategories.includes(c.id)
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'hover:bg-muted'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedCategories.includes(c.id)}
                onChange={() => toggleCategory(c.id)}
                className="hidden"
              />
              <Tag className="h-3 w-3" />
              {c.name}
            </label>
          ))}
        </div>
      </div>

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
        <SubmitButton loadingText={editing ? 'Guardando...' : 'Creando...'}>
          {editing ? 'Guardar cambios' : 'Crear promoción'}
        </SubmitButton>
      </div>
    </form>
  );
}

// ============================================
// AUXILIARES
// ============================================
function PromotionTypeBadge({
  type,
  value,
  currency,
}: {
  type: string;
  value: number;
  currency?: Currency | null;
}) {
  if (type === 'porcentaje') {
    return <Badge tone="success">{Number(value)}% off</Badge>;
  }
  if (type === 'monto_fijo') {
    return (
      <Badge tone="info">
        {currency?.symbol ?? ''}
        {Number(value)} off
      </Badge>
    );
  }
  if (type === 'precio_especial') {
    return (
      <Badge tone="warning">
        Precio {currency?.symbol ?? ''}
        {Number(value)}
      </Badge>
    );
  }
  if (type === '2x1') {
    return <Badge tone="info">2x1</Badge>;
  }
  return <Badge>{type}</Badge>;
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
  tone?: 'default' | 'success' | 'warning' | 'info' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-emerald-50 text-emerald-600'
      : tone === 'warning'
      ? 'bg-amber-50 text-amber-600'
      : tone === 'info'
      ? 'bg-blue-50 text-blue-600'
      : tone === 'danger'
      ? 'bg-red-50 text-red-600'
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