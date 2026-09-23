'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { Plus, Pencil, Power, Trash2, CreditCard, Filter } from 'lucide-react';
import type { PaymentMethod } from '@/lib/types/database';
import {
  createPaymentMethodAction,
  updatePaymentMethodAction,
  togglePaymentMethodAction,
  deletePaymentMethodAction,
  type ActionState,
} from './actions';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
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
  initialMethods: PaymentMethod[];
}

export function MetodosPagoClient({ initialMethods }: Props) {
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PaymentMethod | null>(null);
  const [, startTransition] = useTransition();

  const [createState, createFormAction] = useFormState(
    createPaymentMethodAction,
    initialActionState
  );
  const [updateState, updateFormAction] = useFormState(
    updatePaymentMethodAction,
    initialActionState
  );

  useEffect(() => {
    if (createState.timestamp > 0) {
      if (createState.success) {
        setModalOpen(false);
        setEditing(null);
        showToast('Metodo creado', 'success');
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
        showToast('Metodo actualizado', 'success');
      } else if (updateState.error) {
        showToast(updateState.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateState.timestamp]);

  const filtered = useMemo(() => {
    let list = [...initialMethods];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) => m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q)
      );
    }
    if (filterActive === 'active') list = list.filter((m) => m.is_active);
    if (filterActive === 'inactive') list = list.filter((m) => !m.is_active);
    return list;
  }, [initialMethods, search, filterActive]);

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

  function openEdit(m: PaymentMethod) {
    setEditing(m);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  function handleToggle(m: PaymentMethod) {
    startTransition(async () => {
      const res = await togglePaymentMethodAction(m.id, !m.is_active);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast(m.is_active ? 'Metodo desactivado' : 'Metodo activado', 'success');
      }
    });
  }

  function confirmDeleteNow() {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    startTransition(async () => {
      const res = await deletePaymentMethodAction(target.id);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Metodo eliminado', 'success');
      }
    });
  }

  const columns: Column<PaymentMethod>[] = [
    {
      key: 'name',
      header: 'Nombre',
      render: (m) => (
        <div>
          <p className="font-medium">{m.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{m.code}</p>
        </div>
      ),
    },
    {
      key: 'requires_reference',
      header: 'Requiere referencia',
      render: (m) =>
        m.requires_reference ? (
          <Badge tone="warning">Si</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">No</span>
        ),
    },
    {
      key: 'sort_order',
      header: 'Orden',
      render: (m) => <span className="text-sm">{m.sort_order}</span>,
    },
    {
      key: 'is_active',
      header: 'Estado',
      render: (m) =>
        m.is_active ? <Badge tone="success">Activo</Badge> : <Badge tone="default">Inactivo</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (m) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            title={m.is_active ? 'Desactivar' : 'Activar'}
            onClick={() => handleToggle(m)}
            className={`rounded-md p-1.5 ${
              m.is_active
                ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                : 'text-emerald-600 hover:bg-emerald-50'
            }`}
          >
            <Power className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Editar"
            onClick={() => openEdit(m)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Eliminar"
            onClick={() => setConfirmDelete(m)}
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
          <h1 className="text-2xl font-bold tracking-tight">Metodos de Pago</h1>
          <p className="text-sm text-muted-foreground">
            Configura los metodos disponibles en ventas.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo metodo
        </Button>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre o codigo..."
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
            title={search ? 'Sin resultados' : 'No hay metodos de pago'}
            description={
              search ? 'Prueba con otro termino.' : 'Crea el primer metodo de pago.'
            }
            icon={<CreditCard className="h-8 w-8" />}
            action={
              !search ? (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Nuevo metodo
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable columns={columns} rows={filtered} rowKey={(m) => m.id} />
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? `Editar ${editing.name}` : 'Nuevo metodo de pago'}
      >
        <form
          id={editing ? 'method-update-form' : 'method-create-form'}
          action={editing ? updateFormAction : createFormAction}
          className="space-y-4"
        >
          {editing && <input type="hidden" name="id" value={editing.id} />}

          <Input
            label="Nombre"
            name="name"
            defaultValue={editing?.name ?? ''}
            error={(editing ? updateState : createState).fieldErrors?.name}
            required
          />

          <Input
            label="Codigo"
            name="code"
            placeholder="cash, debit_card..."
            defaultValue={editing?.code ?? ''}
            error={(editing ? updateState : createState).fieldErrors?.code}
            required
            hint="Solo minusculas, numeros y guion bajo. Unico."
          />

          <Input
            label="Orden"
            name="sort_order"
            type="number"
            min={0}
            defaultValue={editing?.sort_order ?? 0}
            error={(editing ? updateState : createState).fieldErrors?.sort_order}
            hint="Menor numero = aparece primero."
          />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Checkbox
              name="is_active"
              label="Activo"
              defaultChecked={editing?.is_active ?? true}
            />
            <Checkbox
              name="requires_reference"
              label="Requiere referencia"
              hint="Ej: numero de transferencia o autorizacion."
              defaultChecked={editing?.requires_reference ?? false}
            />
          </div>

          {(editing ? updateState : createState).error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {(editing ? updateState : createState).error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancelar
            </Button>
            <SubmitButton loadingText={editing ? 'Guardando...' : 'Creando...'}>
              {editing ? 'Guardar' : 'Crear'}
            </SubmitButton>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Eliminar "${confirmDelete?.name ?? ''}"?`}
        description="Si el metodo tiene ventas asociadas, se desactivara en lugar de eliminarse."
        confirmLabel="Eliminar"
        variant="destructive"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={confirmDeleteNow}
      />
    </div>
  );
}