'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Printer,
  CheckCircle2,
  Package,
  Truck,
  XCircle,
  RotateCcw,
  Clock,
} from 'lucide-react';
import type { Order, OrderStatus } from '@/lib/types/database';
import { changeOrderStatusAction } from '../actions';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/utils/currency';
import { OrderStatusBadge } from '../PedidosClient';

interface Props {
  order: Order;
}

const STATUS_ACTIONS: Record<
  string,
  Array<{
    label: string;
    status: OrderStatus;
    icon: React.ReactNode;
    variant: 'primary' | 'outline' | 'destructive';
  }>
> = {
  pendiente: [
    {
      label: 'Confirmar pedido',
      status: 'confirmado',
      icon: <CheckCircle2 className="h-4 w-4" />,
      variant: 'primary',
    },
    {
      label: 'Cancelar',
      status: 'cancelado',
      icon: <XCircle className="h-4 w-4" />,
      variant: 'destructive',
    },
  ],
  confirmado: [
    {
      label: 'Marcar en preparacion',
      status: 'preparando',
      icon: <Package className="h-4 w-4" />,
      variant: 'primary',
    },
    {
      label: 'Cancelar',
      status: 'cancelado',
      icon: <XCircle className="h-4 w-4" />,
      variant: 'destructive',
    },
  ],
  preparando: [
    {
      label: 'Marcar como enviado',
      status: 'enviado',
      icon: <Truck className="h-4 w-4" />,
      variant: 'primary',
    },
    {
      label: 'Cancelar',
      status: 'cancelado',
      icon: <XCircle className="h-4 w-4" />,
      variant: 'destructive',
    },
  ],
  enviado: [
    {
      label: 'Marcar como entregado',
      status: 'entregado',
      icon: <CheckCircle2 className="h-4 w-4" />,
      variant: 'primary',
    },
    {
      label: 'Marcar como devuelto',
      status: 'devuelto',
      icon: <RotateCcw className="h-4 w-4" />,
      variant: 'outline',
    },
  ],
  entregado: [
    {
      label: 'Marcar como devuelto',
      status: 'devuelto',
      icon: <RotateCcw className="h-4 w-4" />,
      variant: 'outline',
    },
  ],
  cancelado: [],
  devuelto: [],
};

export function OrderDetailClient({ order }: Props) {
  const { showToast } = useToast();
  const [pendingChange, setPendingChange] = useState<{
    status: OrderStatus;
    label: string;
  } | null>(null);
  const [notes, setNotes] = useState('');
  const [isPending, setIsPending] = useState(false);

  const currency = order.currency!;
  const baseCurrency = order.base_currency!;
  const actions = STATUS_ACTIONS[order.status] ?? [];

  async function handleConfirmChange() {
    if (!pendingChange) return;
    const target = pendingChange;
    setIsPending(true);
    const res = await changeOrderStatusAction(order.id, target.status, notes);
    setIsPending(false);
    if (res.error) showToast(res.error, 'error');
    else {
      showToast(`Pedido actualizado a ${target.label}`, 'success');
      setPendingChange(null);
      setNotes('');
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6 print:space-y-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/admin/pedidos">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Pedido {order.order_number}
            </h1>
            <p className="text-sm text-muted-foreground">
              {new Date(order.created_at).toLocaleString('es-MX')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
          {actions.map((action) => (
            <Button
              key={action.status}
              variant={action.variant}
              onClick={() =>
                setPendingChange({ status: action.status, label: action.label })
              }
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <OrderStatusBadge status={order.status} />
        {order.confirmed_at && (
          <span className="text-xs text-muted-foreground">
            Confirmado: {new Date(order.confirmed_at).toLocaleString('es-MX')}
          </span>
        )}
        {order.delivered_at && (
          <span className="text-xs text-muted-foreground">
            Entregado: {new Date(order.delivered_at).toLocaleString('es-MX')}
          </span>
        )}
        {order.cancelled_at && (
          <span className="text-xs text-muted-foreground">
            Cancelado: {new Date(order.cancelled_at).toLocaleString('es-MX')}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border bg-background p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">Informacion general</h2>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoRow
              label="Cliente"
              value={order.customer?.full_name ?? 'Publico general'}
            />
            {order.customer?.phone && (
              <InfoRow label="Telefono" value={order.customer.phone} />
            )}
            <InfoRow
              label="Vendedor"
              value={
                order.vendor?.profile?.full_name ??
                order.vendor?.code ??
                'Sin asignar'
              }
            />
            <InfoRow
              label="Registrado por"
              value={order.created_by_user?.full_name ?? '-'}
            />
            {order.delivery_address && (
              <div className="sm:col-span-2">
                <InfoRow
                  label="Direccion de entrega"
                  value={order.delivery_address}
                />
              </div>
            )}
            {order.delivery_notes && (
              <div className="sm:col-span-2">
                <InfoRow label="Notas de entrega" value={order.delivery_notes} />
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-lg border bg-background p-4">
          <h2 className="mb-3 text-sm font-semibold">Totales</h2>
          <div className="space-y-2 text-sm">
            <Row
              label="Subtotal"
              value={formatCurrency(Number(order.subtotal), currency)}
            />
            {Number(order.discount_amount) > 0 && (
              <Row
                label="Descuento"
                value={`- ${formatCurrency(
                  Number(order.discount_amount),
                  currency
                )}`}
              />
            )}
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="font-mono">
                {formatCurrency(Number(order.total), currency)}
              </span>
            </div>
            {order.currency_id !== order.base_currency_id && (
              <div className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                <Row
                  label="Tipo de cambio"
                  value={`1 ${currency.code} = ${Number(
                    order.exchange_rate_value
                  )
                    .toFixed(6)
                    .replace(/\.?0+$/, '')} ${baseCurrency.code}`}
                />
                <Row
                  label={`Equivalente en ${baseCurrency.code}`}
                  value={formatCurrency(Number(order.base_total), baseCurrency)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-background">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Productos</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                  Producto
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                  Cantidad
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                  Precio unit.
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody>
              {order.items?.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.product?.sku ?? '-'}
                    </p>
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {Number(item.quantity)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {formatCurrency(Number(item.unit_price), currency)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-medium">
                    {formatCurrency(Number(item.total), currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {order.status_history && order.status_history.length > 0 && (
        <div className="rounded-lg border bg-background p-4">
          <h2 className="mb-3 text-sm font-semibold">Historial de estados</h2>
          <div className="space-y-3">
            {order.status_history
              .slice()
              .sort(
                (a, b) =>
                  new Date(b.created_at).getTime() -
                  new Date(a.created_at).getTime()
              )
              .map((h) => (
                <div key={h.id} className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <OrderStatusBadge status={h.new_status} />
                      {h.old_status && (
                        <span className="text-xs text-muted-foreground">
                          (antes: {h.old_status})
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(h.created_at).toLocaleString('es-MX')} ·{' '}
                      {h.user?.full_name ?? h.user?.email ?? 'Sistema'}
                    </p>
                    {h.notes && <p className="mt-1 text-sm">{h.notes}</p>}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      <Modal
        open={!!pendingChange}
        onClose={() => {
          setPendingChange(null);
          setNotes('');
        }}
        title={pendingChange?.label ?? ''}
        description={
          pendingChange?.status === 'confirmado'
            ? 'El stock reservado se convertira en salida real.'
            : pendingChange?.status === 'cancelado'
            ? 'Las reservas activas seran liberadas.'
            : 'Puedes anadir una nota opcional.'
        }
      >
        {pendingChange && (
          <form
            id="change-status-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleConfirmChange();
            }}
            className="space-y-4"
            autoComplete="off"
          >
            <Textarea
              label="Nota (opcional)"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observacion sobre el cambio de estado..."
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPendingChange(null);
                  setNotes('');
                }}
              >
                Cancelar
              </Button>
              <SubmitButton loadingText="Aplicando...">Confirmar</SubmitButton>
            </div>
          </form>
        )}
      </Modal>

      <style jsx global>{`
        @media print {
          body {
            background: white;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:space-y-2 > * + * {
            margin-top: 0.5rem;
          }
          @page {
            margin: 1cm;
          }
        }
      `}</style>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}