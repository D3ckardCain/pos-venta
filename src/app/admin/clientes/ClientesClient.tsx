'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import Link from 'next/link';
import {
  Plus,
  Pencil,
  Trash2,
  Power,
  Eye,
  Users,
  Filter,
  Award,
} from 'lucide-react';
import type { Customer } from '@/lib/types/database';
import {
  createCustomerAction,
  updateCustomerAction,
  deleteCustomerAction,
  toggleCustomerActiveAction,
  adjustPointsAction,
  type ActionState,
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

interface Props {
  initialCustomers: Customer[];
}

export function ClientesClient({ initialCustomers }: Props) {
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterHasPoints, setFilterHasPoints] = useState<'all' | 'yes' | 'no'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);
  const [adjustingPoints, setAdjustingPoints] = useState<Customer | null>(null);
  const [, startTransition] = useTransition();

  const [createState, createFormAction] = useFormState(
    createCustomerAction,
    initialActionState
  );
  const [updateState, updateFormAction] = useFormState(
    updateCustomerAction,
    initialActionState
  );

  useEffect(() => {
    if (createState.timestamp > 0) {
      if (createState.success) {
        setModalOpen(false);
        setEditing(null);
        showToast('Cliente creado', 'success');
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
        showToast('Cliente actualizado', 'success');
      } else if (updateState.error) {
        showToast(updateState.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateState.timestamp]);

  const filtered = useMemo(() => {
    let list = [...initialCustomers];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          (c.email ?? '').toLowerCase().includes(q) ||
          (c.phone ?? '').toLowerCase().includes(q) ||
          (c.code ?? '').toLowerCase().includes(q) ||
          (c.city ?? '').toLowerCase().includes(q)
      );
    }
    if (filterActive === 'active') list = list.filter((c) => c.is_active);
    if (filterActive === 'inactive') list = list.filter((c) => !c.is_active);
    if (filterHasPoints === 'yes')
      list = list.filter((c) => Number(c.points?.points ?? 0) > 0);
    if (filterHasPoints === 'no')
      list = list.filter((c) => Number(c.points?.points ?? 0) === 0);

    return list;
  }, [initialCustomers, search, filterActive, filterHasPoints]);

  const activeFiltersCount =
    (search ? 1 : 0) +
    (filterActive !== 'all' ? 1 : 0) +
    (filterHasPoints !== 'all' ? 1 : 0);

  function clearFilters() {
    setSearch('');
    setFilterActive('all');
    setFilterHasPoints('all');
  }

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
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
      const res = await deleteCustomerAction(target.id);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Cliente eliminado o desactivado', 'success');
      }
    });
  }

  function handleToggle(c: Customer) {
    startTransition(async () => {
      const res = await toggleCustomerActiveAction(c.id, !c.is_active);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast(c.is_active ? 'Cliente desactivado' : 'Cliente activado', 'success');
      }
    });
  }

  const columns: Column<Customer>[] = [
    {
      key: 'code',
      header: 'Codigo',
      render: (c) => (
        <span className="font-mono text-xs text-muted-foreground">
          {c.code ?? '-'}
        </span>
      ),
    },
    {
      key: 'full_name',
      header: 'Cliente',
      render: (c) => (
        <div>
          <p className="font-medium">{c.full_name}</p>
          <p className="text-xs text-muted-foreground">
            {c.email ?? c.phone ?? '-'}
          </p>
        </div>
      ),
    },
    {
      key: 'city',
      header: 'Ciudad',
      render: (c) => <span className="text-sm">{c.city ?? '-'}</span>,
    },
    {
      key: 'total_purchases',
      header: 'Total compras',
      render: (c) => (
        <span className="font-mono text-sm">
          {Number(c.total_purchases).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'total_orders',
      header: 'Pedidos',
      render: (c) => <span className="text-sm">{c.total_orders}</span>,
    },
    {
      key: 'points',
      header: 'Puntos',
      render: (c) => (
        <div className="flex items-center gap-1.5">
          <Award className="h-3.5 w-3.5 text-amber-500" />
          <span className="font-mono text-sm">{c.points?.points ?? 0}</span>
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'Estado',
      render: (c) =>
        c.is_active ? <Badge tone="success">Activo</Badge> : <Badge tone="default">Inactivo</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (c) => (
        <div className="flex justify-end gap-1">
          <Link href={`/admin/clientes/${c.id}`}>
            <button
              type="button"
              title="Ver detalle"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Eye className="h-4 w-4" />
            </button>
          </Link>
          <button
            type="button"
            title="Ajustar puntos"
            onClick={() => setAdjustingPoints(c)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-amber-50 hover:text-amber-600"
          >
            <Award className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Editar"
            onClick={() => openEdit(c)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            title={c.is_active ? 'Desactivar' : 'Activar'}
            onClick={() => handleToggle(c)}
            className={`rounded-md p-1.5 ${
              c.is_active
                ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                : 'text-emerald-600 hover:bg-emerald-50'
            }`}
          >
            <Power className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Eliminar"
            onClick={() => setConfirmDelete(c)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const formState = editing ? updateState : createState;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Base de clientes, historial de compras y puntos de fidelidad.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo cliente
        </Button>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre, email, telefono, codigo..."
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value as typeof filterActive)}
              className="w-36"
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </Select>
            <Select
              value={filterHasPoints}
              onChange={(e) => setFilterHasPoints(e.target.value as typeof filterHasPoints)}
              className="w-40"
            >
              <option value="all">Puntos: todos</option>
              <option value="yes">Con puntos</option>
              <option value="no">Sin puntos</option>
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
            title={search ? 'Sin resultados' : 'No hay clientes'}
            description={
              search
                ? 'Prueba con otro termino de busqueda.'
                : 'Registra tu primer cliente para comenzar.'
            }
            icon={<Users className="h-8 w-8" />}
            action={
              !search ? (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Nuevo cliente
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable columns={columns} rows={filtered} rowKey={(c) => c.id} />
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? `Editar ${editing.full_name}` : 'Nuevo cliente'}
        size="lg"
      >
        <form
          id={editing ? 'customer-update-form' : 'customer-create-form'}
          action={editing ? updateFormAction : createFormAction}
          className="space-y-4"
        >
          {editing && <input type="hidden" name="id" value={editing.id} />}

          <Input
            label="Nombre completo"
            name="full_name"
            defaultValue={editing?.full_name ?? ''}
            error={formState.fieldErrors?.full_name}
            required
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Correo electronico (opcional)"
              name="email"
              type="email"
              defaultValue={editing?.email ?? ''}
              error={formState.fieldErrors?.email}
            />
            <Input
              label="Telefono (opcional)"
              name="phone"
              defaultValue={editing?.phone ?? ''}
              error={formState.fieldErrors?.phone}
            />
          </div>

          <Input
            label="Direccion (opcional)"
            name="address"
            defaultValue={editing?.address ?? ''}
            error={formState.fieldErrors?.address}
          />

          <Input
            label="Ciudad (opcional)"
            name="city"
            defaultValue={editing?.city ?? ''}
            error={formState.fieldErrors?.city}
          />

          <Textarea
            label="Notas internas (opcional)"
            name="notes"
            rows={3}
            defaultValue={editing?.notes ?? ''}
            error={formState.fieldErrors?.notes}
          />

          <Checkbox
            name="is_active"
            label="Activo"
            defaultChecked={editing?.is_active ?? true}
          />

          {formState.error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formState.error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancelar
            </Button>
            <SubmitButton loadingText={editing ? 'Guardando...' : 'Creando...'}>
              {editing ? 'Guardar cambios' : 'Crear cliente'}
            </SubmitButton>
          </div>
        </form>
      </Modal>

      <AdjustPointsModal
        open={!!adjustingPoints}
        onClose={() => setAdjustingPoints(null)}
        customer={adjustingPoints}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Eliminar "${confirmDelete?.full_name ?? ''}"?`}
        description="Si el cliente tiene ventas o pedidos, se desactivara en lugar de eliminarse."
        confirmLabel="Eliminar"
        variant="destructive"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={confirmDeleteNow}
      />
    </div>
  );
}

function AdjustPointsModal({
  open,
  onClose,
  customer,
}: {
  open: boolean;
  onClose: () => void;
  customer: Customer | null;
}) {
  const { showToast } = useToast();
  const [state, formAction] = useFormState(adjustPointsAction, initialActionState);

  useEffect(() => {
    if (state.timestamp > 0) {
      if (state.success) {
        showToast('Puntos ajustados', 'success');
        onClose();
      } else if (state.error) {
        showToast(state.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.timestamp]);

  if (!customer) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Ajustar puntos - ${customer.full_name}`}
      description="Los ajustes quedan registrados en el historial de puntos."
    >
      <form id="adjust-points-form" action={formAction} className="space-y-4">
        <input type="hidden" name="customer_id" value={customer.id} />

        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Puntos actuales</p>
          <p className="mt-1 text-2xl font-semibold">
            {Number(customer.points?.points ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Historico: {Number(customer.points?.lifetime_points ?? 0)}
          </p>
        </div>

        <Input
          label="Puntos a ajustar"
          name="points"
          type="number"
          step="1"
          placeholder="Positivo para anadir, negativo para canjear"
          error={state.fieldErrors?.points}
          required
          hint="Ej: 100 para anadir, -50 para canjear."
        />

        <Textarea
          label="Motivo"
          name="reason"
          rows={3}
          placeholder="Ej: Compensacion por error, canje manual..."
          error={state.fieldErrors?.reason}
          required
        />

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
          <SubmitButton loadingText="Aplicando...">Aplicar</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}