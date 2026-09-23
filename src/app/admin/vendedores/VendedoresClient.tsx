'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { Plus, Pencil, Power, UserCog, Filter, AlertCircle } from 'lucide-react';
import type { Vendor } from '@/lib/types/database';
import {
  createVendorAction,
  updateVendorAction,
  toggleVendorActiveAction,
  type ActionState,
} from './actions';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
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
  initialVendors: Vendor[];
}

export function VendedoresClient({ initialVendors }: Props) {
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [, startTransition] = useTransition();

  const [createState, createFormAction] = useFormState(
    createVendorAction,
    initialActionState
  );
  const [updateState, updateFormAction] = useFormState(
    updateVendorAction,
    initialActionState
  );

  useEffect(() => {
    if (createState.timestamp > 0) {
      if (createState.success) {
        setModalOpen(false);
        setEditing(null);
        showToast('Vendedor creado', 'success');
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
        showToast('Vendedor actualizado', 'success');
      } else if (updateState.error) {
        showToast(updateState.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateState.timestamp]);

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

    return list;
  }, [initialVendors, search, filterActive]);

  const activeFiltersCount =
    (search ? 1 : 0) + (filterActive !== 'all' ? 1 : 0);

  function clearFilters() {
    setSearch('');
    setFilterActive('all');
  }

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(v: Vendor) {
    setEditing(v);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  function handleToggle(v: Vendor) {
    startTransition(async () => {
      const res = await toggleVendorActiveAction(v.id, !v.is_active);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast(v.is_active ? 'Vendedor desactivado' : 'Vendedor activado', 'success');
      }
    });
  }

  const columns: Column<Vendor>[] = [
    {
      key: 'name',
      header: 'Vendedor',
      render: (v) => (
        <div>
          <p className="font-medium">{v.profile?.full_name ?? '-'}</p>
          <p className="text-xs text-muted-foreground">
            {v.profile?.email ?? '-'}
            {v.code ? ` - ${v.code}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'commission_rate',
      header: 'Comision',
      render: (v) => (
        <span className="font-mono text-sm">{Number(v.commission_rate).toFixed(2)}%</span>
      ),
    },
    {
      key: 'total_sales',
      header: 'Ventas totales',
      render: (v) => (
        <span className="font-mono text-sm">
          {Number(v.total_sales).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'total_commission',
      header: 'Comision acumulada',
      render: (v) => (
        <span className="font-mono text-sm font-semibold">
          {Number(v.total_commission).toFixed(2)}
        </span>
      ),
    },
        {
      key: 'cash_differences_balance',
      header: 'Diferencias de caja',
      render: (v) => {
        const balance = Number(
          (v as { cash_differences_balance?: number }).cash_differences_balance ??
            0
        );
        if (balance === 0) {
          return (
            <span className="font-mono text-sm text-muted-foreground">
              0.00
            </span>
          );
        }
        return (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-sm font-semibold ${
              balance > 0
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {balance > 0 ? '+' : ''}
            {balance.toFixed(2)}
          </span>
        );
      },
    },
    {
      key: 'is_active',
      header: 'Estado',
      render: (v) =>
        v.is_active ? <Badge tone="success">Activo</Badge> : <Badge tone="default">Inactivo</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (v) => (
        <div className="flex justify-end gap-1">
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
          <button
            type="button"
            title="Editar"
            onClick={() => openEdit(v)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
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
          <h1 className="text-2xl font-bold tracking-tight">Vendedores</h1>
          <p className="text-sm text-muted-foreground">
            Equipo de ventas, comisiones y desempeno.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo vendedor
        </Button>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre, email o codigo..."
          />
          <div className="flex items-center gap-2">
            <Select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value as typeof filterActive)}
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

      <div className="rounded-lg border bg-background">
        {filtered.length === 0 ? (
          <EmptyState
            title={search ? 'Sin resultados' : 'No hay vendedores'}
            description={
              search
                ? 'Prueba con otro termino de busqueda.'
                : 'Crea el primer vendedor para comenzar.'
            }
            icon={<UserCog className="h-8 w-8" />}
            action={
              !search ? (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Nuevo vendedor
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable columns={columns} rows={filtered} rowKey={(v) => v.id} />
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? `Editar ${editing.profile?.full_name ?? 'vendedor'}` : 'Nuevo vendedor'}
        description={
          editing
            ? 'Modifica datos y comision del vendedor.'
            : 'Se creara un usuario con rol vendedor. Comparte las credenciales con el vendedor.'
        }
        size="lg"
      >
        <form
          id={editing ? 'vendor-update-form' : 'vendor-create-form'}
          action={editing ? updateFormAction : createFormAction}
          className="space-y-4"
          autoComplete="off"
        >
          {editing && <input type="hidden" name="id" value={editing.id} />}

          <Input
            label="Nombre completo"
            name="full_name"
            autoComplete="off"
            defaultValue={editing?.profile?.full_name ?? ''}
            error={formState.fieldErrors?.full_name}
            required
          />

          {!editing && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Correo electronico"
                name="email"
                type="email"
                autoComplete="off"
                placeholder="vendedor@tunegocio.com"
                error={formState.fieldErrors?.email}
                required
                hint="Sera el usuario para iniciar sesion."
              />
              <PasswordInput
                label="Contrasena"
                name="password"
                placeholder="Minimo 8 caracteres"
                error={formState.fieldErrors?.password}
                required
                hint="Compartela con el vendedor."
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Telefono (opcional)"
              name="phone"
              autoComplete="off"
              defaultValue={editing?.profile?.phone ?? ''}
              error={formState.fieldErrors?.phone}
            />
            <Input
              label="Codigo (opcional)"
              name="code"
              autoComplete="off"
              placeholder="V-001"
              defaultValue={editing?.code ?? ''}
              error={formState.fieldErrors?.code}
            />
          </div>

          <Input
            label="Comision (%)"
            name="commission_rate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            autoComplete="off"
            defaultValue={editing?.commission_rate ?? 0}
            error={formState.fieldErrors?.commission_rate}
            hint="Porcentaje de comision sobre ventas consolidadas."
          />

          {editing && (
            <Checkbox
              name="is_active"
              label="Activo"
              defaultChecked={editing.is_active}
            />
          )}

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
              {editing ? 'Guardar cambios' : 'Crear vendedor'}
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}