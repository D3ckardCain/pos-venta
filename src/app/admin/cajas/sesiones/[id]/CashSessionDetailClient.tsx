'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useFormState } from 'react-dom';
import {
  ArrowLeft,
  Plus,
  Wallet,
  Lock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type {
  CashSession,
  CashMovement,
  Currency,
} from '@/lib/types/database';
import {
  createCashMovementAction,
  closeSessionMethodAction,
  resolveDifferenceAction,
  type ActionState,
} from '../../actions';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/utils/currency';
import { SessionStatusBadge } from '../../CajasClient';

const initialActionState: ActionState = {
  error: null,
  success: false,
  timestamp: 0,
};

interface CashDifference {
  id: string;
  cash_session_id: string;
  cash_movement_id: string | null;
  user_id: string;
  currency_id: string;
  payment_method_id: string;
  expected_amount: number;
  counted_amount: number;
  difference: number;
  resolved_amount: number;
  status: 'pendiente' | 'parcial' | 'resuelta' | 'cancelada';
  notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  currency?: Currency;
  payment_method?: { id: string; name: string; code: string } | null;
  resolved_by_user?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

interface Props {
  session: CashSession;
  currencies: Currency[];
  paymentMethods: { id: string; name: string; code: string }[];
  differences: CashDifference[];
}

interface MethodRow {
  key: string;
  currencyId: string;
  currency: Currency | undefined;
  paymentMethodId: string;
  paymentMethodName: string;
  paymentMethodCode: string;
  expected: number;
  counted: number | null;
  difference: number | null;
  isClosed: boolean;
}

export function CashSessionDetailClient({
  session,
  currencies,
  paymentMethods,
  differences,
}: Props) {
  const { showToast } = useToast();

  const [movementModal, setMovementModal] = useState(false);
  const [closingRow, setClosingRow] = useState<MethodRow | null>(null);
  const [resolvingDiff, setResolvingDiff] = useState<CashDifference | null>(null);

  const [movState, movFormAction] = useFormState(
    createCashMovementAction,
    initialActionState
  );

  useEffect(() => {
    if (movState.timestamp > 0) {
      if (movState.success) {
        setMovementModal(false);
        showToast('Movimiento registrado', 'success');
      } else if (movState.error) {
        showToast(movState.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movState.timestamp]);

  const movements = session.movements ?? [];

  const methodRows: MethodRow[] = useMemo(() => {
    const map = new Map<string, MethodRow>();

    for (const m of movements) {
      if (m.movement_type === 'cierre') continue;

      const currency = currencies.find((c) => c.id === m.currency_id);
      if (!currency) continue;

      const pmId = m.payment_method_id ?? '__manual__';
      const pm = paymentMethods.find((p) => p.id === m.payment_method_id);
      const pmName = pm?.name ?? 'Otros';
      const pmCode = pm?.code ?? 'otros';

      const key = `${m.currency_id}::${pmId}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          currencyId: m.currency_id,
          currency,
          paymentMethodId: pmId,
          paymentMethodName: pmName,
          paymentMethodCode: pmCode,
          expected: 0,
          counted: null,
          difference: null,
          isClosed: false,
        });
      }

      const row = map.get(key)!;
      const amount = Number(m.amount);

      if (
        m.movement_type === 'apertura' ||
        m.movement_type === 'entrada' ||
        m.movement_type === 'deposito' ||
        m.movement_type === 'venta'
      ) {
        row.expected += amount;
      } else if (
        m.movement_type === 'salida' ||
        m.movement_type === 'retiro' ||
        m.movement_type === 'devolucion'
      ) {
        row.expected -= amount;
      }
    }

    for (const m of movements) {
      if (m.movement_type !== 'cierre') continue;
      if (!m.payment_method_id) continue;

      const key = `${m.currency_id}::${m.payment_method_id}`;
      const row = map.get(key);
      if (row) {
        row.isClosed = true;
        row.counted = Number(m.balance_after);
        row.difference = Number(m.balance_after) - row.expected;
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const c = (a.currency?.code ?? '').localeCompare(b.currency?.code ?? '');
      if (c !== 0) return c;
      return a.paymentMethodName.localeCompare(b.paymentMethodName);
    });
  }, [movements, currencies, paymentMethods]);

  const allClosed =
    methodRows.length > 0 && methodRows.every((r) => r.isClosed);

  const columns: Column<CashMovement>[] = [
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
      key: 'currency',
      header: 'Moneda',
      render: (m) => <Badge tone="info">{m.currency?.code ?? '-'}</Badge>,
    },
    {
      key: 'payment_method',
      header: 'Metodo',
      render: (m) =>
        m.payment_method ? (
          <span className="text-sm">{m.payment_method.name}</span>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        ),
    },
    {
      key: 'amount',
      header: 'Monto',
      render: (m) => {
        const amt = Number(m.amount);
        const isIn = ['apertura', 'entrada', 'deposito', 'venta'].includes(
          m.movement_type
        );
        const isOut = ['salida', 'retiro', 'devolucion'].includes(
          m.movement_type
        );
        return (
          <span
            className={`font-mono text-sm font-semibold ${
              isIn ? 'text-emerald-600' : isOut ? 'text-red-600' : ''
            }`}
          >
            {isIn ? '+' : isOut ? '-' : ''}
            {m.currency ? formatCurrency(amt, m.currency) : amt.toFixed(2)}
          </span>
        );
      },
    },
    {
      key: 'balance_after',
      header: 'Saldo',
      render: (m) => (
        <span className="font-mono text-sm">
          {m.currency
            ? formatCurrency(Number(m.balance_after), m.currency)
            : Number(m.balance_after).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Descripcion',
      render: (m) => (
        <span className="text-sm text-muted-foreground">
          {m.description ?? '-'}
        </span>
      ),
    },
    {
      key: 'user',
      header: 'Usuario',
      render: (m) => (
        <span className="text-xs text-muted-foreground">
          {m.user?.full_name ?? m.user?.email ?? '-'}
        </span>
      ),
    },
  ];

  const pendingDifferences = differences.filter(
    (d) => d.status === 'pendiente' || d.status === 'parcial'
  );
  const resolvedDifferences = differences.filter(
    (d) => d.status === 'resuelta' || d.status === 'cancelada'
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/cajas">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Caja de{' '}
              {session.opened_by_user?.full_name ??
                session.opened_by_user?.email ??
                'cajero'}
            </h1>
            <p className="text-sm text-muted-foreground">
              Sesion {session.id.slice(0, 8)} -{' '}
              {new Date(session.opened_at).toLocaleString('es-MX')}
            </p>
          </div>
          <SessionStatusBadge status={session.status} />
        </div>
        <div className="flex gap-2">
          {session.status === 'abierta' && (
            <Button variant="outline" onClick={() => setMovementModal(true)}>
              <Plus className="h-4 w-4" />
              Movimiento
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <InfoRow
            label="Apertura"
            value={new Date(session.opened_at).toLocaleString('es-MX')}
          />
          {session.cutoff_at && (
            <InfoRow
              label="Corte programado"
              value={new Date(session.cutoff_at).toLocaleString('es-MX')}
            />
          )}
          <InfoRow
            label="Tipo de apertura"
            value={session.is_auto_opened ? 'Automatica' : 'Manual'}
          />
          {session.closed_at && (
            <InfoRow
              label="Cerrada"
              value={new Date(session.closed_at).toLocaleString('es-MX')}
            />
          )}
          {session.closed_by_user && (
            <InfoRow
              label="Cerrada por"
              value={
                session.closed_by_user.full_name ??
                session.closed_by_user.email ??
                '-'
              }
            />
          )}
          {session.notes && (
            <div className="sm:col-span-3">
              <InfoRow label="Notas" value={session.notes} />
            </div>
          )}
        </dl>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Conciliacion por moneda y metodo de pago
          </h2>
          {allClosed && (
            <Badge tone="success">
              <CheckCircle2 className="mr-1 inline h-3 w-3" />
              Todos cerrados
            </Badge>
          )}
        </div>

        {methodRows.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            Sin movimientos aun.
          </div>
        ) : (
          <div className="space-y-3">
            {methodRows.map((row) => (
              <div
                key={row.key}
                className={`rounded-lg border bg-background p-4 ${
                  row.isClosed ? 'border-emerald-200 bg-emerald-50/30' : ''
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <Badge tone="info">{row.currency?.code ?? '-'}</Badge>
                    <div>
                      <p className="font-medium">{row.paymentMethodName}</p>
                      <p className="text-xs text-muted-foreground">
                        Esperado:{' '}
                        {row.currency
                          ? formatCurrency(row.expected, row.currency)
                          : row.expected.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {row.isClosed ? (
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          Contado
                        </p>
                        <p className="font-mono text-sm font-semibold">
                          {row.currency && row.counted !== null
                            ? formatCurrency(row.counted, row.currency)
                            : '-'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          Diferencia
                        </p>
                        <p
                          className={`font-mono text-sm font-semibold ${
                            row.difference === 0
                              ? 'text-muted-foreground'
                              : (row.difference ?? 0) > 0
                              ? 'text-red-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          {row.difference !== null && row.currency
                            ? `${row.difference > 0 ? '+' : ''}${formatCurrency(
                                row.difference,
                                row.currency
                              )}`
                            : '-'}
                        </p>
                      </div>
                      <Badge tone="success">
                        <CheckCircle2 className="mr-1 inline h-3 w-3" />
                        Cerrado
                      </Badge>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => setClosingRow(row)}
                      disabled={session.status === 'cerrada'}
                    >
                      <Lock className="h-4 w-4" />
                      Cerrar este metodo
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {pendingDifferences.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Diferencias pendientes de resolver
          </h2>
          <div className="space-y-2">
            {pendingDifferences.map((d) => {
              const pending = Number(d.difference) - Number(d.resolved_amount ?? 0);
              const isVendorOwes = pending < 0;

              return (
                <div
                  key={d.id}
                  className={`flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${
                    isVendorOwes
                      ? 'border-red-200 bg-red-50'
                      : 'border-emerald-200 bg-emerald-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-md ${
                        isVendorOwes
                          ? 'bg-red-100 text-red-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      <AlertCircle className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {d.payment_method?.name ?? 'Metodo'} -{' '}
                        {d.currency?.code ?? 'Moneda'}
                        {d.status === 'parcial' && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            (parcial)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Esperado:{' '}
                        {d.currency
                          ? formatCurrency(Number(d.expected_amount), d.currency)
                          : Number(d.expected_amount).toFixed(2)}{' '}
                        / Contado:{' '}
                        {d.currency
                          ? formatCurrency(Number(d.counted_amount), d.currency)
                          : Number(d.counted_amount).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        Pendiente
                      </p>
                      <p
                        className={`font-mono text-base font-semibold ${
                          isVendorOwes ? 'text-red-600' : 'text-emerald-600'
                        }`}
                      >
                        {pending > 0 ? '+' : ''}
                        {d.currency
                          ? formatCurrency(pending, d.currency)
                          : pending.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isVendorOwes
                          ? 'El vendedor me debe'
                          : 'Yo le debo al vendedor'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setResolvingDiff(d)}
                    >
                      Resolver
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {resolvedDifferences.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Diferencias resueltas
          </h2>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Fecha
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Metodo
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                    Diferencia
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Estado
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Resuelto por
                  </th>
                </tr>
              </thead>
              <tbody>
                {resolvedDifferences.map((d) => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleString('es-MX')}
                    </td>
                    <td className="px-4 py-2">
                      {d.payment_method?.name ?? '-'} -{' '}
                      {d.currency?.code ?? '-'}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-mono ${
                        Number(d.difference) > 0
                          ? 'text-red-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {Number(d.difference) > 0 ? '+' : ''}
                      {d.currency
                        ? formatCurrency(Number(d.difference), d.currency)
                        : Number(d.difference).toFixed(2)}
                    </td>
                    <td className="px-4 py-2">
                      <Badge
                        tone={
                          d.status === 'resuelta'
                            ? 'success'
                            : d.status === 'parcial'
                            ? 'warning'
                            : 'default'
                        }
                      >
                        {d.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {d.resolved_by_user?.full_name ??
                        d.resolved_by_user?.email ??
                        '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-background">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            Movimientos ({movements.length})
          </h2>
        </div>
        {movements.length === 0 ? (
          <EmptyState
            title="Sin movimientos"
            description="Aun no hay movimientos en esta sesion."
            icon={<Wallet className="h-8 w-8" />}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={[...movements].sort(
              (a, b) =>
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime()
            )}
            rowKey={(m) => m.id}
          />
        )}
      </div>

      <Modal
        open={movementModal}
        onClose={() => setMovementModal(false)}
        title="Registrar movimiento manual"
        description="Solo movimientos manuales. Las ventas se registran automaticamente."
      >
        <form
          id="movement-form"
          action={movFormAction}
          className="space-y-4"
          autoComplete="off"
        >
          <input type="hidden" name="cash_session_id" value={session.id} />

          <Select
            label="Tipo de movimiento"
            name="movement_type"
            defaultValue=""
            error={movState.fieldErrors?.movement_type}
            required
          >
            <option value="">Selecciona...</option>
            <option value="entrada">Entrada (ingreso manual)</option>
            <option value="salida">Salida (gasto manual)</option>
            <option value="deposito">Deposito (del banco)</option>
            <option value="retiro">Retiro (al banco)</option>
            <option value="ajuste">Ajuste (correccion)</option>
          </Select>

          <Select
            label="Moneda"
            name="currency_id"
            defaultValue=""
            error={movState.fieldErrors?.currency_id}
            required
          >
            <option value="">Selecciona...</option>
            {currencies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} - {c.name}
              </option>
            ))}
          </Select>

          <Input
            label="Monto"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            autoComplete="off"
            error={movState.fieldErrors?.amount}
            required
          />

          <Textarea
            label="Descripcion"
            name="description"
            rows={3}
            placeholder="Motivo del movimiento..."
            error={movState.fieldErrors?.description}
            required
          />

          {movState.error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {movState.error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMovementModal(false)}
            >
              Cancelar
            </Button>
            <SubmitButton loadingText="Registrando...">Registrar</SubmitButton>
          </div>
        </form>
      </Modal>

      {closingRow && (
        <CloseMethodModal
          row={closingRow}
          sessionId={session.id}
          onClose={() => setClosingRow(null)}
        />
      )}

      {resolvingDiff && (
        <ResolveDifferenceModal
          difference={resolvingDiff}
          onClose={() => setResolvingDiff(null)}
        />
      )}
    </div>
  );
}

// ============================================
// MODAL: CERRAR UN MÉTODO
// ============================================

function CloseMethodModal({
  row,
  sessionId,
  onClose,
}: {
  row: MethodRow;
  sessionId: string;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [state, formAction] = useFormState(
    closeSessionMethodAction,
    initialActionState
  );

  const [counted, setCounted] = useState(String(row.expected));

  useEffect(() => {
    if (state.timestamp > 0) {
      if (state.success) {
        showToast('Metodo cerrado', 'success');
        onClose();
      } else if (state.error) {
        showToast(state.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.timestamp]);

  const countedNum = Number(counted) || 0;
  const diff = countedNum - row.expected;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Cerrar ${row.paymentMethodName} - ${row.currency?.code ?? ''}`}
      description="Ingresa el monto contado fisicamente. El sistema calculara la diferencia."
    >
      <form
        id="close-method-form"
        action={formAction}
        className="space-y-4"
        autoComplete="off"
      >
        <input type="hidden" name="session_id" value={sessionId} />
        <input type="hidden" name="currency_id" value={row.currencyId} />
        <input
          type="hidden"
          name="payment_method_id"
          value={row.paymentMethodId}
        />

        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Monto esperado</p>
          <p className="mt-1 font-mono text-xl font-semibold">
            {row.currency
              ? formatCurrency(row.expected, row.currency)
              : row.expected.toFixed(2)}
          </p>
        </div>

        <Input
          label="Monto contado"
          name="counted_amount"
          type="number"
          step="0.01"
          min="0"
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
          error={state.fieldErrors?.counted_amount}
          required
          autoFocus
        />

        {diff !== 0 && (
          <div
            className={`flex items-center gap-2 rounded-md border p-3 text-sm ${
              diff > 0
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            <AlertCircle className="h-4 w-4" />
            <span>
              Diferencia: {diff > 0 ? '+' : ''}
              {row.currency
                ? formatCurrency(diff, row.currency)
                : diff.toFixed(2)}{' '}
              — {diff > 0 ? 'Yo le debo al vendedor' : 'El vendedor me debe'}
            </span>
          </div>
        )}

        <Textarea
          label="Notas (opcional)"
          name="notes"
          rows={2}
          placeholder="Observaciones sobre el cierre..."
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
          <SubmitButton loadingText="Cerrando...">
            Cerrar {row.paymentMethodName}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

// ============================================
// MODAL: RESOLVER DIFERENCIA
// ============================================

function ResolveDifferenceModal({
  difference,
  onClose,
}: {
  difference: CashDifference;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [state, formAction] = useFormState(
    resolveDifferenceAction,
    initialActionState
  );

  const total = Number(difference.difference);
  const resolved = Number(difference.resolved_amount ?? 0);
  const pending = total - resolved;
  const isVendorOwes = pending < 0;

  const [amount, setAmount] = useState(String(Math.abs(pending)));

  useEffect(() => {
    if (state.timestamp > 0) {
      if (state.success) {
        showToast('Diferencia actualizada', 'success');
        onClose();
      } else if (state.error) {
        showToast(state.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.timestamp]);

  const absPending = Math.abs(pending);
  const inputAmount = Number(amount) || 0;
  const signedAmount = isVendorOwes ? -inputAmount : inputAmount;
  const remaining = pending - signedAmount;

  function handleFullResolve() {
    setAmount(String(absPending));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Resolver diferencia"
      description={
        isVendorOwes
          ? 'El vendedor me debe dinero. Ingresa cuanto me pago.'
          : 'Yo le debo dinero al vendedor. Ingresa cuanto le pague.'
      }
    >
      <form
        id="resolve-difference-form"
        action={formAction}
        className="space-y-4"
        autoComplete="off"
      >
        <input type="hidden" name="difference_id" value={difference.id} />
        <input type="hidden" name="amount" value={signedAmount} />

        <div className="rounded-md border bg-muted/30 p-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Esperado</p>
              <p className="font-mono text-sm">
                {difference.currency
                  ? formatCurrency(
                      Number(difference.expected_amount),
                      difference.currency
                    )
                  : '-'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Contado</p>
              <p className="font-mono text-sm">
                {difference.currency
                  ? formatCurrency(
                      Number(difference.counted_amount),
                      difference.currency
                    )
                  : '-'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p
                className={`font-mono text-sm font-semibold ${
                  total > 0 ? 'text-red-600' : 'text-emerald-600'
                }`}
              >
                {total > 0 ? '+' : ''}
                {difference.currency
                  ? formatCurrency(total, difference.currency)
                  : total.toFixed(2)}
              </p>
            </div>
          </div>
          {resolved !== 0 && (
            <div className="mt-3 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                Ya resuelto:{' '}
                {difference.currency
                  ? formatCurrency(resolved, difference.currency)
                  : resolved.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">
                Pendiente:{' '}
                <span
                  className={`font-semibold ${
                    pending < 0 ? 'text-red-600' : 'text-emerald-600'
                  }`}
                >
                  {pending > 0 ? '+' : ''}
                  {difference.currency
                    ? formatCurrency(pending, difference.currency)
                    : pending.toFixed(2)}
                </span>
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            {isVendorOwes ? 'Monto que me pago' : 'Monto que le pague'}
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              max={absPending}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 rounded-md border bg-background px-3 py-2 text-right font-mono text-sm"
              autoFocus
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFullResolve}
            >
              Liquidar todo
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Maximo: {difference.currency
              ? formatCurrency(absPending, difference.currency)
              : absPending.toFixed(2)}
          </p>
        </div>

        {inputAmount > 0 && remaining !== 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Quedara pendiente:{' '}
            <strong>
              {remaining > 0 ? '+' : ''}
              {difference.currency
                ? formatCurrency(remaining, difference.currency)
                : remaining.toFixed(2)}
            </strong>
          </div>
        )}

        {inputAmount > 0 && remaining === 0 && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Esta diferencia quedara completamente resuelta.
          </div>
        )}

        <Textarea
          label="Notas (opcional)"
          name="notes"
          rows={2}
          placeholder="Observaciones sobre la resolucion..."
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
          <SubmitButton loadingText="Guardando...">Resolver</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

// ============================================
// AUXILIARES
// ============================================

function MovementTypeBadge({ type }: { type: string }) {
  const map: Record<
    string,
    { tone: 'default' | 'success' | 'warning' | 'destructive' | 'info'; label: string }
  > = {
    apertura: { tone: 'info', label: 'Apertura' },
    cierre: { tone: 'default', label: 'Cierre' },
    entrada: { tone: 'success', label: 'Entrada' },
    salida: { tone: 'destructive', label: 'Salida' },
    retiro: { tone: 'destructive', label: 'Retiro' },
    deposito: { tone: 'success', label: 'Deposito' },
    ajuste: { tone: 'warning', label: 'Ajuste' },
    venta: { tone: 'success', label: 'Venta' },
    devolucion: { tone: 'warning', label: 'Devolucion' },
  };
  const cfg = map[type] ?? { tone: 'default' as const, label: type };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}