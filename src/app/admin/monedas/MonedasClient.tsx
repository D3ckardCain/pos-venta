'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { Plus, Pencil, Trash2, Star, Coins, Power, Filter } from 'lucide-react';
import type { Currency, CurrencySetting } from '@/lib/types/database';
import {
  createCurrencyAction,
  updateCurrencyAction,
  deleteCurrencyAction,
  setPrimaryCurrencyAction,
  toggleCurrencyActiveAction,
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
import { formatCurrency } from '@/lib/utils/currency';

const initialActionState: ActionState = {
  error: null,
  success: false,
  timestamp: 0,
};

interface Props {
  initialCurrencies: Currency[];
  initialSettings: CurrencySetting | null;
}

export function MonedasClient({ initialCurrencies, initialSettings }: Props) {
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Currency | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Currency | null>(null);
  const [confirmPrimary, setConfirmPrimary] = useState<Currency | null>(null);
  const [, startTransition] = useTransition();

  const [createState, createFormAction] = useFormState(
    createCurrencyAction,
    initialActionState
  );
  const [updateState, updateFormAction] = useFormState(
    updateCurrencyAction,
    initialActionState
  );

  useEffect(() => {
    if (createState.timestamp > 0) {
      if (createState.success) {
        setModalOpen(false);
        setEditing(null);
        showToast('Moneda creada', 'success');
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
        showToast('Moneda actualizada', 'success');
      } else if (updateState.error) {
        showToast(updateState.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateState.timestamp]);

  const primaryCurrencyId = initialSettings?.primary_currency_id ?? null;

  const filtered = useMemo(() => {
    let list = [...initialCurrencies];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.symbol.toLowerCase().includes(q)
      );
    }
    if (filterActive === 'active') list = list.filter((c) => c.is_active);
    if (filterActive === 'inactive') list = list.filter((c) => !c.is_active);
    return list;
  }, [initialCurrencies, search, filterActive]);

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

  function openEdit(c: Currency) {
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
      const res = await deleteCurrencyAction(target.id);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Moneda eliminada', 'success');
      }
    });
  }

  function confirmSetPrimaryNow() {
    if (!confirmPrimary) return;
    const target = confirmPrimary;
    setConfirmPrimary(null);
    startTransition(async () => {
      const res = await setPrimaryCurrencyAction(target.id);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast(`Moneda principal cambiada a ${target.code}`, 'success');
      }
    });
  }

  function handleToggle(c: Currency) {
    startTransition(async () => {
      const res = await toggleCurrencyActiveAction(c.id, !c.is_active);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast(c.is_active ? 'Moneda desactivada' : 'Moneda activada', 'success');
      }
    });
  }

  const columns: Column<Currency>[] = [
    {
      key: 'code',
      header: 'Codigo',
      render: (c) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold">{c.code}</span>
          {c.id === primaryCurrencyId && <Badge tone="success">Principal</Badge>}
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Nombre',
      render: (c) => <span>{c.name}</span>,
    },
    {
      key: 'symbol',
      header: 'Simbolo',
      render: (c) => <span className="font-mono text-sm">{c.symbol}</span>,
    },
    {
      key: 'format',
      header: 'Ejemplo',
      render: (c) => (
        <span className="font-mono text-sm text-muted-foreground">
          {formatCurrency(1234.5, c)}
        </span>
      ),
    },
    {
      key: 'decimals',
      header: 'Decimales',
      render: (c) => <span className="text-sm">{c.decimals}</span>,
    },
    {
      key: 'is_active',
      header: 'Estado',
      render: (c) =>
        c.is_active ? <Badge tone="success">Activa</Badge> : <Badge tone="default">Inactiva</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (c) => (
        <div className="flex justify-end gap-1">
          {c.id !== primaryCurrencyId && c.is_active && (
            <button
              type="button"
              title="Marcar como principal"
              onClick={() => setConfirmPrimary(c)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Star className="h-4 w-4" />
            </button>
          )}
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
            title="Editar"
            onClick={() => openEdit(c)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Eliminar"
            disabled={c.id === primaryCurrencyId}
            onClick={() => setConfirmDelete(c)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:pointer-events-none"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const state = editing ? updateState : createState;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monedas</h1>
          <p className="text-sm text-muted-foreground">
            Configura las monedas del sistema y define la moneda principal.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nueva moneda
        </Button>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Buscar por codigo, nombre o simbolo..."
          />
          <div className="flex items-center gap-2">
            <Select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value as typeof filterActive)}
              className="w-40"
            >
              <option value="all">Todas</option>
              <option value="active">Activas</option>
              <option value="inactive">Inactivas</option>
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
            title={search ? 'Sin resultados' : 'No hay monedas'}
            description={
              search
                ? 'Prueba con otro termino de busqueda.'
                : 'Crea la primera moneda para comenzar.'
            }
            icon={<Coins className="h-8 w-8" />}
            action={
              !search ? (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Nueva moneda
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
        title={editing ? `Editar ${editing.code}` : 'Nueva moneda'}
        description="Configura como se muestra y se usa esta moneda en el sistema."
        size="lg"
      >
        <form
          id={editing ? 'currency-update-form' : 'currency-create-form'}
          action={editing ? updateFormAction : createFormAction}
          className="space-y-4"
        >
          {editing && <input type="hidden" name="id" value={editing.id} />}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Codigo ISO 4217"
              name="code"
              placeholder="MXN"
              maxLength={3}
              defaultValue={editing?.code ?? ''}
              error={state.fieldErrors?.code}
              required
              style={{ textTransform: 'uppercase' }}
            />
            <Input
              label="Nombre"
              name="name"
              placeholder="Peso Mexicano"
              defaultValue={editing?.name ?? ''}
              error={state.fieldErrors?.name}
              required
            />
            <Input
              label="Simbolo"
              name="symbol"
              placeholder="$"
              maxLength={8}
              defaultValue={editing?.symbol ?? ''}
              error={state.fieldErrors?.symbol}
              required
            />
            <Select
              label="Posicion del simbolo"
              name="symbol_position"
              defaultValue={editing?.symbol_position ?? 'before'}
              error={state.fieldErrors?.symbol_position}
            >
              <option value="before">Antes (ej: $100)</option>
              <option value="after">Despues (ej: 100EUR)</option>
            </Select>
            <Input
              label="Decimales"
              name="decimals"
              type="number"
              min={0}
              max={6}
              defaultValue={editing?.decimals ?? 2}
              error={state.fieldErrors?.decimals}
              required
            />
            <Input
              label="Separador decimal"
              name="decimal_separator"
              placeholder="."
              maxLength={2}
              defaultValue={editing?.decimal_separator ?? '.'}
              error={state.fieldErrors?.decimal_separator}
              required
            />
            <Input
              label="Separador de miles"
              name="thousand_separator"
              placeholder=","
              maxLength={2}
              defaultValue={editing?.thousand_separator ?? ','}
              error={state.fieldErrors?.thousand_separator}
              required
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Disponibilidad</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Checkbox
                name="is_active"
                label="Activa"
                hint="Disponible en el sistema."
                defaultChecked={editing?.is_active ?? true}
              />
              <Checkbox
                name="usable_in_sales"
                label="Usable en ventas"
                defaultChecked={editing?.usable_in_sales ?? true}
              />
              <Checkbox
                name="usable_in_purchases"
                label="Usable en compras"
                defaultChecked={editing?.usable_in_purchases ?? true}
              />
              <Checkbox
                name="usable_in_cash"
                label="Usable en caja"
                defaultChecked={editing?.usable_in_cash ?? true}
              />
              <Checkbox
                name="usable_in_catalog"
                label="Usable en catalogo"
                defaultChecked={editing?.usable_in_catalog ?? true}
              />
              <Checkbox
                name="usable_by_customers"
                label="Visible para clientes"
                defaultChecked={editing?.usable_by_customers ?? true}
              />
              <Checkbox
                name="usable_by_vendors"
                label="Visible para vendedores"
                defaultChecked={editing?.usable_by_vendors ?? true}
              />
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
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancelar
            </Button>
            <SubmitButton loadingText={editing ? 'Guardando...' : 'Creando...'}>
              {editing ? 'Guardar cambios' : 'Crear moneda'}
            </SubmitButton>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Eliminar ${confirmDelete?.code ?? ''}?`}
        description="Si la moneda tiene transacciones asociadas, se desactivara en lugar de eliminarse. Esta accion no se puede deshacer."
        confirmLabel="Eliminar"
        variant="destructive"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={confirmDeleteNow}
      />

      <ConfirmDialog
        open={!!confirmPrimary}
        title={`Cambiar moneda principal a ${confirmPrimary?.code ?? ''}?`}
        description="Los reportes historicos no se recalcularan. Las transacciones nuevas usaran esta moneda como base. Las transacciones existentes conservan su tipo de cambio original."
        confirmLabel="Cambiar principal"
        onCancel={() => setConfirmPrimary(null)}
        onConfirm={confirmSetPrimaryNow}
      />
    </div>
  );
}