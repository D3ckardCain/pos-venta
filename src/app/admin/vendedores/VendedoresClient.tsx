'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFormState } from 'react-dom';
import {
  Plus,
  Pencil,
  Power,
  Eye,
  UserCog,
  Truck,
  Download,
  Filter,
  Award,
  TrendingUp,
} from 'lucide-react';
import type { Vendor, Currency } from '@/lib/types/database';
import {
  createVendorAction,
  updateVendorAction,
  toggleVendorActiveAction,
  exportVendorsCsvAction,
  type ActionState,
} from './actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { SearchBar } from '@/components/shared/SearchBar';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/utils/currency';

const initialActionState: ActionState = { error: null, success: false };

interface Props {
  initialVendors: Vendor[];
  primaryCurrency: Currency | null;
}

export function VendedoresClient({ initialVendors, primaryCurrency }: Props) {
  const router = useRouter();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterType, setFilterType] = useState<'all' | 'vendedor' | 'mensajero' | 'ambos'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'total_sales' | 'commission_rate' | 'total_commission'>('total_sales');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [isPending, startTransition] = useTransition();

  const [createState, createFormAction] = useFormState(
    createVendorAction,
    initialActionState
  );
  const [updateState, updateFormAction] = useFormState(
    updateVendorAction,
    initialActionState
  );

  if (createState.success && modalOpen && !editing) {
    setModalOpen(false);
    showToast('Vendedor creado', 'success');
    router.refresh();
  }
  if (updateState.success && modalOpen && editing) {
    setModalOpen(false);
    setEditing(null);
    showToast('Vendedor actualizado', 'success');
    router.refresh();
  }

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

    if (filterActive === 'active') list = list.filter((v) => v.is_active);
    if (filterActive === 'inactive') list = list.filter((v) => !v.is_active);
    if (filterType !== 'all') list = list.filter((v) => v.type === filterType);

    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name')
        cmp = (a.profile?.full_name ?? '').localeCompare(b.profile?.full_name ?? '');
      else if (sortBy === 'total_sales')
        cmp = Number(a.total_sales) - Number(b.total_sales);
      else if (sortBy === 'commission_rate')
        cmp = Number(a.commission_rate) - Number(b.commission_rate);
      else if (sortBy === 'total_commission')
        cmp = Number(a.total_commission) - Number(b.total_commission);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [initialVendors, search, filterActive, filterType, sortBy, sortDir]);

  const total = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const activeFiltersCount =
    (search ? 1 : 0) +
    (filterActive !== 'all' ? 1 : 0) +
    (filterType !== 'all' ? 1 : 0);

  function clearFilters() {
    setSearch('');
    setFilterActive('all');
    setFilterType('all');
    setPage(1);
  }

  function handleSort(key: string) {
    if (key === sortBy) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(key as typeof sortBy);
      setSortDir('desc');
    }
  }

  function handleToggle(v: Vendor) {
    startTransition(async () => {
      const res = await toggleVendorActiveAction(v.id, !v.is_active);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast(v.is_active ? 'Vendedor desactivado' : 'Vendedor activado', 'success');
        router.refresh();
      }
    });
  }

  function handleExport() {
    startTransition(async () => {
      const res = await exportVendorsCsvAction();
      if (res.error) {
        showToast(res.error, 'error');
        return;
      }
      downloadCsv(res.csv!, res.filename!);
      showToast('Vendedores exportados', 'success');
    });
  }

  const columns: Column<Vendor>[] = [
    {
      key: 'name',
      header: 'Vendedor / Mensajero',
      sortable: true,
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
        return <Badge tone={tone as 'info' | 'warning' | 'default'}>{v.type}</Badge>;
      },
    },
    {
      key: 'commission_mode',
      header: 'Modo comisión',
      render: (v) =>
        v.type === 'mensajero' ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {v.commission_mode === 'profit' ? 'Sobre utilidad' : 'Sobre total'}
          </span>
        ),
    },
    {
      key: 'commission_rate',
      header: 'Comisión',
      sortable: true,
      render: (v) => (
        <span className="font-mono text-sm">{Number(v.commission_rate).toFixed(2)}%</span>
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
      key: 'pending_commission',
      header: 'Pendiente',
      render: (v) => {
        const amount = Number(v.pending_commission);
        if (amount <= 0) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <span className="font-mono text-sm font-semibold text-amber-600">
            {primaryCurrency ? formatCurrency(amount, primaryCurrency) : amount.toFixed(2)}
          </span>
        );
      },
    },
    {
      key: 'is_active',
      header: 'Estado',
      render: (v) =>
        v.is_active ? (
          <Badge tone="success">Activo</Badge>
        ) : (
          <Badge tone="default">Inactivo</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (v) => (
        <div className="flex justify-end gap-1">
          <Link href={`/admin/vendedores/${v.id}`}>
            <button
              type="button"
              title="Ver desempeño"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Eye className="h-4 w-4" />
            </button>
          </Link>
          <button
            type="button"
            title="Editar"
            onClick={() => {
              setEditing(v);
              setModalOpen(true);
            }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            title={v.is_active ? 'Desactivar' : 'Activar'}
            onClick={() => handleToggle(v)}
            className={`rounded-md p-1.5 ${
              v.is_active
                ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                : 'text-emerald-600 hover:bg-emerald-50'
            }`}
          >
            <Power className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const totalSales = initialVendors.reduce((s, v) => s + Number(v.total_sales), 0);
  const totalCommission = initialVendors.reduce((s, v) => s + Number(v.total_commission), 0);
  const totalPending = initialVendors.reduce((s, v) => s + Number(v.pending_commission), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vendedores y Mensajeros</h1>
          <p className="text-sm text-muted-foreground">
            Equipo de ventas, entregas y comisiones.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={isPending}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nuevo vendedor
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Vendedores/Mensajeros"
          value={String(initialVendors.length)}
          icon={<UserCog className="h-4 w-4" />}
        />
        <KpiCard
          label="Ventas totales"
          value={primaryCurrency ? formatCurrency(totalSales, primaryCurrency) : String(totalSales)}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="success"
        />
        <KpiCard
          label="Comisiones históricas"
          value={
            primaryCurrency
              ? formatCurrency(totalCommission, primaryCurrency)
              : String(totalCommission)
          }
          icon={<Award className="h-4 w-4" />}
          tone="warning"
        />
        <KpiCard
          label="Pendiente de pago"
          value={
            primaryCurrency
              ? formatCurrency(totalPending, primaryCurrency)
              : String(totalPending)
          }
          icon={<Award className="h-4 w-4" />}
          tone="warning"
        />
      </div>

      {/* Filtros */}
      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar por nombre, email o código…"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value as typeof filterType);
                setPage(1);
              }}
              className="w-40"
            >
              <option value="all">Tipo: todos</option>
              <option value="vendedor">Solo vendedores</option>
              <option value="mensajero">Solo mensajeros</option>
              <option value="ambos">Ambos</option>
            </Select>
            <Select
              value={filterActive}
              onChange={(e) => {
                setFilterActive(e.target.value as typeof filterActive);
                setPage(1);
              }}
              className="w-36"
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
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
        {paged.length === 0 ? (
          <EmptyState
            title={search ? 'Sin resultados' : 'No hay vendedores'}
            description={
              search
                ? 'Prueba con otro término de búsqueda.'
                : 'Crea el primer vendedor para comenzar.'
            }
            icon={<UserCog className="h-8 w-8" />}
            action={
              !search ? (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setModalOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Nuevo vendedor
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={paged}
              rowKey={(v) => v.id}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={handleSort}
            />
            <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>
                  Mostrando <strong>{paged.length}</strong> de <strong>{total}</strong>
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

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        title={editing ? `Editar ${editing.profile?.full_name}` : 'Nuevo vendedor'}
        description={
          editing
            ? 'Modifica datos, tipo y comisión.'
            : 'Se creará un usuario con rol vendedor. Comparte las credenciales con el vendedor.'
        }
        size="lg"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setModalOpen(false);
                setEditing(null);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" form={editing ? 'vendor-update-form' : 'vendor-create-form'}>
              {editing ? 'Guardar cambios' : 'Crear vendedor'}
            </Button>
          </>
        }
      >
        <VendorForm
          key={editing?.id ?? 'new'}
          editing={editing}
          createFormAction={createFormAction}
          updateFormAction={updateFormAction}
          createState={createState}
          updateState={updateState}
        />
      </Modal>

      {isPending && <div className="pointer-events-none fixed inset-0 z-40 bg-black/10" />}
    </div>
  );
}

// ============================================
// FORMULARIO DE VENDEDOR
// ============================================
function VendorForm({
  editing,
  createFormAction,
  updateFormAction,
  createState,
  updateState,
}: {
  editing: Vendor | null;
  createFormAction: (fd: FormData) => void;
  updateFormAction: (fd: FormData) => void;
  createState: ActionState;
  updateState: ActionState;
}) {
  const state = editing ? updateState : createState;
  const action = editing ? updateFormAction : createFormAction;
  const fe = state.fieldErrors ?? {};

  const [type, setType] = useState<'vendedor' | 'mensajero' | 'ambos'>(
    editing?.type ?? 'vendedor'
  );
  const [commissionMode, setCommissionMode] = useState<'total' | 'profit'>(
    editing?.commission_mode ?? 'total'
  );

  const showCommission = type === 'vendedor' || type === 'ambos';
  const showDelivery = type === 'mensajero' || type === 'ambos';

  return (
    <form
      id={editing ? 'vendor-update-form' : 'vendor-create-form'}
      action={action}
      className="space-y-4"
    >
      {editing && <input type="hidden" name="id" value={editing.id} />}

      <Input
        label="Nombre completo"
        name="full_name"
        defaultValue={editing?.profile?.full_name ?? ''}
        error={fe.full_name}
        required
      />

      {!editing && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Correo electrónico"
            name="email"
            type="email"
            placeholder="vendedor@tunegocio.com"
            error={fe.email}
            required
            hint="Será el usuario para iniciar sesión."
          />
          <Input
            label="Contraseña"
            name="password"
            type="password"
            placeholder="Mínimo 6 caracteres"
            error={fe.password}
            required
            hint="Compártela con el vendedor."
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Teléfono (opcional)"
          name="phone"
          defaultValue={editing?.profile?.phone ?? ''}
          error={fe.phone}
        />
        <Input
          label="Código (opcional)"
          name="code"
          placeholder="V-001"
          defaultValue={editing?.code ?? ''}
          error={fe.code}
        />
      </div>

      {/* Tipo */}
      <Select
        label="Tipo de persona"
        name="type"
        value={type}
        onChange={(e) => setType(e.target.value as typeof type)}
        error={fe.type}
        required
      >
        <option value="vendedor">Solo vendedor</option>
        <option value="mensajero">Solo mensajero</option>
        <option value="ambos">Vendedor y mensajero</option>
      </Select>

      {/* Comisión (solo si es vendedor o ambos) */}
      {showCommission && (
        <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
          <h3 className="text-sm font-semibold">Comisión por venta</h3>
          <Select
            label="Modo de comisión"
            name="commission_mode"
            value={commissionMode}
            onChange={(e) => setCommissionMode(e.target.value as typeof commissionMode)}
            error={fe.commission_mode}
          >
            <option value="total">Sobre el total de la venta</option>
            <option value="profit">Sobre la utilidad de la venta</option>
          </Select>
          <Input
            label="Porcentaje de comisión (%)"
            name="commission_rate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={editing?.commission_rate ?? 0}
            error={fe.commission_rate}
            hint={
              commissionMode === 'profit'
                ? 'Porcentaje sobre la utilidad de cada venta.'
                : 'Porcentaje sobre el total de cada venta.'
            }
          />
        </div>
      )}

      {/* Entrega (solo si es mensajero o ambos) */}
      {showDelivery && (
        <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
          <h3 className="text-sm font-semibold">Pago por entrega</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Monto fijo por entrega"
              name="delivery_fixed_fee"
              type="number"
              step="0.01"
              min="0"
              defaultValue={editing?.delivery_fixed_fee ?? 0}
              error={fe.delivery_fixed_fee}
              hint="Se paga por cada pedido entregado."
            />
            <Input
              label="% adicional del pedido"
              name="delivery_commission_rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              defaultValue={editing?.delivery_commission_rate ?? 0}
              error={fe.delivery_commission_rate}
              hint="Porcentaje adicional sobre el total del pedido."
            />
          </div>
        </div>
      )}

      {/* Campos ocultos si no aplica, para no romper el schema */}
      {!showCommission && (
        <>
          <input type="hidden" name="commission_mode" value="total" />
          <input type="hidden" name="commission_rate" value="0" />
        </>
      )}
      {!showDelivery && (
        <>
          <input type="hidden" name="delivery_fixed_fee" value="0" />
          <input type="hidden" name="delivery_commission_rate" value="0" />
        </>
      )}

      {editing && (
        <Checkbox name="is_active" label="Activo" defaultChecked={editing.is_active} />
      )}

      {state.error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}
    </form>
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