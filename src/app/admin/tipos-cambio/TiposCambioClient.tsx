'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import {
  Plus,
  Pencil,
  Power,
  Trash2,
  RefreshCw,
  History as HistoryIcon,
  ArrowRight,
} from 'lucide-react';
import type {
  Currency,
  ExchangeRate,
  ExchangeRateHistory,
} from '@/lib/types/database';
import {
  createExchangeRateAction,
  updateExchangeRateAction,
  toggleExchangeRateAction,
  deleteExchangeRateAction,
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
  currencies: Currency[];
  initialRates: ExchangeRate[];
  initialHistory: ExchangeRateHistory[];
}

type Tab = 'rates' | 'history';

export function TiposCambioClient({
  currencies,
  initialRates,
  initialHistory,
}: Props) {
  const { showToast } = useToast();

  const [tab, setTab] = useState<Tab>('rates');
  const [search, setSearch] = useState('');
  const [filterFrom, setFilterFrom] = useState('all');
  const [filterTo, setFilterTo] = useState('all');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExchangeRate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ExchangeRate | null>(null);
  const [, startTransition] = useTransition();

  const [createState, createFormAction] = useFormState(
    createExchangeRateAction,
    initialActionState
  );
  const [updateState, updateFormAction] = useFormState(
    updateExchangeRateAction,
    initialActionState
  );

  useEffect(() => {
    if (createState.timestamp > 0) {
      if (createState.success) {
        setModalOpen(false);
        setEditing(null);
        showToast('Tipo de cambio creado', 'success');
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
        showToast('Tipo de cambio actualizado', 'success');
      } else if (updateState.error) {
        showToast(updateState.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateState.timestamp]);

  const filteredRates = useMemo(() => {
    let list = [...initialRates];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.from_currency?.code ?? '').toLowerCase().includes(q) ||
          (r.to_currency?.code ?? '').toLowerCase().includes(q) ||
          (r.source ?? '').toLowerCase().includes(q) ||
          (r.notes ?? '').toLowerCase().includes(q)
      );
    }
    if (filterFrom !== 'all')
      list = list.filter((r) => r.from_currency_id === filterFrom);
    if (filterTo !== 'all')
      list = list.filter((r) => r.to_currency_id === filterTo);
    if (filterActive === 'active') list = list.filter((r) => r.is_active);
    if (filterActive === 'inactive') list = list.filter((r) => !r.is_active);
    return list;
  }, [initialRates, search, filterFrom, filterTo, filterActive]);

  const filteredHistory = useMemo(() => {
    let list = [...initialHistory];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (h) =>
          (h.from_currency?.code ?? '').toLowerCase().includes(q) ||
          (h.to_currency?.code ?? '').toLowerCase().includes(q) ||
          (h.reason ?? '').toLowerCase().includes(q)
      );
    }
    if (filterFrom !== 'all')
      list = list.filter((h) => h.from_currency_id === filterFrom);
    if (filterTo !== 'all')
      list = list.filter((h) => h.to_currency_id === filterTo);
    return list;
  }, [initialHistory, search, filterFrom, filterTo]);

  const activeFiltersCount =
    (search ? 1 : 0) +
    (filterFrom !== 'all' ? 1 : 0) +
    (filterTo !== 'all' ? 1 : 0) +
    (filterActive !== 'all' && tab === 'rates' ? 1 : 0);

  function clearFilters() {
    setSearch('');
    setFilterFrom('all');
    setFilterTo('all');
    setFilterActive('all');
  }

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(r: ExchangeRate) {
    setEditing(r);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  function handleToggle(r: ExchangeRate) {
    startTransition(async () => {
      const res = await toggleExchangeRateAction(r.id, !r.is_active);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast(
          r.is_active ? 'Tipo de cambio desactivado' : 'Tipo de cambio activado',
          'success'
        );
      }
    });
  }

  function confirmDeleteNow() {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    startTransition(async () => {
      const res = await deleteExchangeRateAction(target.id);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Tipo de cambio eliminado', 'success');
      }
    });
  }

  const rateColumns: Column<ExchangeRate>[] = [
    {
      key: 'pair',
      header: 'Par',
      render: (r) => (
        <div className="flex items-center gap-2 font-mono text-sm">
          <span>{r.from_currency?.code ?? '-'}</span>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{r.to_currency?.code ?? '-'}</span>
        </div>
      ),
    },
    {
      key: 'rate',
      header: 'Tipo de cambio',
      render: (r) => (
        <span className="font-mono text-sm font-semibold">
          {Number(r.rate).toFixed(8).replace(/\.?0+$/, '')}
        </span>
      ),
    },
    {
      key: 'valid_from',
      header: 'Vigente desde',
      render: (r) => (
        <span className="text-sm">
          {new Date(r.valid_from).toLocaleString('es-MX')}
        </span>
      ),
    },
    {
      key: 'valid_until',
      header: 'Vigente hasta',
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.valid_until
            ? new Date(r.valid_until).toLocaleString('es-MX')
            : 'Sin limite'}
        </span>
      ),
    },
    {
      key: 'source',
      header: 'Fuente',
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.source ?? '-'}</span>
      ),
    },
    {
      key: 'is_active',
      header: 'Estado',
      render: (r) =>
        r.is_active ? <Badge tone="success">Activo</Badge> : <Badge tone="default">Inactivo</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            title="Editar"
            onClick={() => openEdit(r)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            title={r.is_active ? 'Desactivar' : 'Activar'}
            onClick={() => handleToggle(r)}
            className={`rounded-md p-1.5 ${
              r.is_active
                ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                : 'text-emerald-600 hover:bg-emerald-50'
            }`}
          >
            <Power className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Eliminar"
            onClick={() => setConfirmDelete(r)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const historyColumns: Column<ExchangeRateHistory>[] = [
    {
      key: 'pair',
      header: 'Par',
      render: (h) => (
        <div className="flex items-center gap-2 font-mono text-sm">
          <span>{h.from_currency?.code ?? '-'}</span>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{h.to_currency?.code ?? '-'}</span>
        </div>
      ),
    },
    {
      key: 'old_rate',
      header: 'Anterior',
      render: (h) => (
        <span className="font-mono text-sm text-muted-foreground">
          {h.old_rate !== null
            ? Number(h.old_rate).toFixed(8).replace(/\.?0+$/, '')
            : '-'}
        </span>
      ),
    },
    {
      key: 'new_rate',
      header: 'Nuevo',
      render: (h) => (
        <span className="font-mono text-sm font-semibold">
          {Number(h.new_rate).toFixed(8).replace(/\.?0+$/, '')}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Motivo',
      render: (h) => (
        <span className="text-sm text-muted-foreground">{h.reason ?? '-'}</span>
      ),
    },
    {
      key: 'changed_at',
      header: 'Fecha',
      render: (h) => (
        <span className="text-sm">
          {new Date(h.changed_at).toLocaleString('es-MX')}
        </span>
      ),
    },
  ];

  const state = editing ? updateState : createState;

  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  const localIso = new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);

  const fromCurrency = editing
    ? currencies.find((c) => c.id === editing.from_currency_id)
    : null;
  const toCurrency = editing
    ? currencies.find((c) => c.id === editing.to_currency_id)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tipos de Cambio</h1>
          <p className="text-sm text-muted-foreground">
            Configura manualmente los tipos de cambio. El historial es inmutable.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo tipo de cambio
        </Button>
      </div>

      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setTab('rates')}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
            tab === 'rates'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <RefreshCw className="h-4 w-4" />
          Tipos vigentes ({initialRates.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
            tab === 'history'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <HistoryIcon className="h-4 w-4" />
          Historial ({initialHistory.length})
        </button>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Buscar por moneda, fuente o motivo..."
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="w-40"
            >
              <option value="all">Origen: todos</option>
              {currencies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </Select>
            <Select
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="w-40"
            >
              <option value="all">Destino: todos</option>
              {currencies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </Select>
            {tab === 'rates' && (
              <Select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value as typeof filterActive)}
                className="w-36"
              >
                <option value="all">Todos</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </Select>
            )}
            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Limpiar ({activeFiltersCount})
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-background">
        {tab === 'rates' ? (
          filteredRates.length === 0 ? (
            <EmptyState
              title={search ? 'Sin resultados' : 'No hay tipos de cambio'}
              description={
                search
                  ? 'Prueba con otro termino de busqueda.'
                  : 'Crea el primer tipo de cambio para operar con multimoneda.'
              }
              icon={<RefreshCw className="h-8 w-8" />}
              action={
                !search ? (
                  <Button onClick={openCreate}>
                    <Plus className="h-4 w-4" />
                    Nuevo tipo de cambio
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <DataTable
              columns={rateColumns}
              rows={filteredRates}
              rowKey={(r) => r.id}
            />
          )
        ) : filteredHistory.length === 0 ? (
          <EmptyState
            title="Sin historial"
            description="Los cambios de tipo de cambio apareceran aqui."
            icon={<HistoryIcon className="h-8 w-8" />}
          />
        ) : (
          <DataTable
            columns={historyColumns}
            rows={filteredHistory}
            rowKey={(h) => h.id}
          />
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Editar tipo de cambio' : 'Nuevo tipo de cambio'}
        description="Los cambios quedan registrados en el historial de forma inmutable."
      >
        <form
          id={editing ? 'rate-update-form' : 'rate-create-form'}
          action={editing ? updateFormAction : createFormAction}
          className="space-y-4"
        >
          {editing && <input type="hidden" name="id" value={editing.id} />}
          {editing && (
            <>
              <input
                type="hidden"
                name="from_currency_id"
                value={editing.from_currency_id}
              />
              <input
                type="hidden"
                name="to_currency_id"
                value={editing.to_currency_id}
              />
            </>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {editing ? (
              <>
                <div className="rounded-md border bg-muted/40 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Moneda origen</p>
                  <p className="mt-0.5 font-mono text-sm font-medium">
                    {fromCurrency
                      ? `${fromCurrency.code} - ${fromCurrency.name}`
                      : editing.from_currency_id}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/40 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Moneda destino</p>
                  <p className="mt-0.5 font-mono text-sm font-medium">
                    {toCurrency
                      ? `${toCurrency.code} - ${toCurrency.name}`
                      : editing.to_currency_id}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Las monedas origen y destino no se pueden cambiar. Si necesitas
                  un par diferente, crea uno nuevo.
                </p>
              </>
            ) : (
              <>
                <Select
                  label="Moneda origen"
                  name="from_currency_id"
                  defaultValue=""
                  error={state.fieldErrors?.from_currency_id}
                  required
                >
                  <option value="">Selecciona...</option>
                  {currencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Moneda destino"
                  name="to_currency_id"
                  defaultValue=""
                  error={state.fieldErrors?.to_currency_id}
                  required
                >
                  <option value="">Selecciona...</option>
                  {currencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </Select>
              </>
            )}
          </div>

          <Input
            label="Tipo de cambio"
            name="rate"
            type="number"
            step="0.00000001"
            min="0.00000001"
            placeholder="18.50"
            defaultValue={editing?.rate ?? ''}
            error={state.fieldErrors?.rate}
            required
            hint="1 unidad de origen = X unidades de destino"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Vigente desde"
              name="valid_from"
              type="datetime-local"
              defaultValue={
                editing
                  ? new Date(editing.valid_from).toISOString().slice(0, 16)
                  : localIso
              }
              error={state.fieldErrors?.valid_from}
              required
            />
            <Input
              label="Vigente hasta (opcional)"
              name="valid_until"
              type="datetime-local"
              defaultValue={
                editing?.valid_until
                  ? new Date(editing.valid_until).toISOString().slice(0, 16)
                  : ''
              }
              error={state.fieldErrors?.valid_until}
            />
          </div>

          <Input
            label="Fuente (opcional)"
            name="source"
            placeholder="Banco Central, manual, etc."
            defaultValue={editing?.source ?? ''}
            error={state.fieldErrors?.source}
          />

          <Textarea
            label="Notas (opcional)"
            name="notes"
            rows={3}
            placeholder="Observaciones sobre este tipo de cambio..."
            defaultValue={editing?.notes ?? ''}
            error={state.fieldErrors?.notes}
          />

          <Checkbox
            name="is_active"
            label="Activo"
            hint="Solo los tipos activos se usan en ventas y catalogo."
            defaultChecked={editing?.is_active ?? true}
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
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancelar
            </Button>
            <SubmitButton loadingText={editing ? 'Guardando...' : 'Creando...'}>
              {editing ? 'Guardar cambios' : 'Crear tipo de cambio'}
            </SubmitButton>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Eliminar tipo de cambio?"
        description="Esta accion no se puede deshacer. Las transacciones historicas conservan su tipo de cambio original."
        confirmLabel="Eliminar"
        variant="destructive"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={confirmDeleteNow}
      />
    </div>
  );
}