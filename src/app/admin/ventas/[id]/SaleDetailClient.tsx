'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer, XCircle } from 'lucide-react';
import type { Sale } from '@/lib/types/database';
import { cancelSaleAction } from '../actions';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/utils/currency';
import { SaleStatusBadge } from '../VentasClient';

interface Props {
  sale: Sale;
}

export function SaleDetailClient({ sale }: Props) {
  const { showToast } = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [isPending, setIsPending] = useState(false);

  const currency = sale.currency!;
  const baseCurrency = sale.base_currency!;

  async function handleCancelNow() {
    if (reason.trim().length < 3) {
      showToast('El motivo es obligatorio', 'error');
      return;
    }
    setIsPending(true);
    const res = await cancelSaleAction(sale.id, reason);
    setIsPending(false);
    if (res.error) showToast(res.error, 'error');
    else {
      showToast('Venta cancelada y stock devuelto', 'success');
      setCancelOpen(false);
      setReason('');
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6 print:space-y-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/admin/ventas">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Venta {sale.sale_number}
            </h1>
            <p className="text-sm text-muted-foreground">
              {new Date(sale.created_at).toLocaleString('es-MX')}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
          {sale.status === 'completada' && (
            <Button variant="destructive" onClick={() => setCancelOpen(true)}>
              <XCircle className="h-4 w-4" />
              Cancelar venta
            </Button>
          )}
        </div>
      </div>

      <div className="hidden print:block">
        <h1 className="text-xl font-bold">Comprobante de venta</h1>
        <p className="text-sm">{sale.sale_number}</p>
        <p className="text-sm">
          {new Date(sale.created_at).toLocaleString('es-MX')}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <SaleStatusBadge status={sale.status} />
        {sale.status === 'cancelada' && sale.cancellation_reason && (
          <span className="text-sm text-muted-foreground">
            Motivo: {sale.cancellation_reason}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border bg-background p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">Informacion general</h2>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoRow
              label="Cliente"
              value={sale.customer?.full_name ?? 'Publico general'}
            />
            {sale.customer?.phone && (
              <InfoRow label="Telefono" value={sale.customer.phone} />
            )}
            <InfoRow
              label="Vendedor"
              value={
                sale.vendor?.profile?.full_name ??
                sale.vendor?.code ??
                'Sin asignar'
              }
            />
            <InfoRow
              label="Metodo de pago"
              value={sale.payment_method?.name ?? '-'}
            />
            <InfoRow label="Caja" value={sale.cash_register?.name ?? '-'} />
            <InfoRow
              label="Registrada por"
              value={sale.created_by_user?.full_name ?? '-'}
            />
          </dl>
        </div>

        <div className="rounded-lg border bg-background p-4">
          <h2 className="mb-3 text-sm font-semibold">Totales</h2>
          <div className="space-y-2 text-sm">
            <Row
              label="Subtotal"
              value={formatCurrency(Number(sale.subtotal), currency)}
            />
            {Number(sale.discount_amount) > 0 && (
              <Row
                label="Descuento"
                value={`- ${formatCurrency(
                  Number(sale.discount_amount),
                  currency
                )}`}
              />
            )}
            {Number(sale.tax_amount) > 0 && (
              <Row
                label="Impuestos"
                value={formatCurrency(Number(sale.tax_amount), currency)}
              />
            )}
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="font-mono">
                {formatCurrency(Number(sale.total), currency)}
              </span>
            </div>
            {sale.currency_id !== sale.base_currency_id && (
              <div className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                <Row
                  label="Tipo de cambio"
                  value={`1 ${currency.code} = ${Number(
                    sale.exchange_rate_value
                  )
                    .toFixed(6)
                    .replace(/\.?0+$/, '')} ${baseCurrency.code}`}
                />
                <Row
                  label={`Equivalente en ${baseCurrency.code}`}
                  value={formatCurrency(Number(sale.base_total), baseCurrency)}
                />
                <Row
                  label="Utilidad estimada"
                  value={formatCurrency(Number(sale.base_profit), baseCurrency)}
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
                  Descuento
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody>
              {sale.items?.map((item) => (
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
                  <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                    {Number(item.discount_amount) > 0
                      ? formatCurrency(Number(item.discount_amount), currency)
                      : '-'}
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

      {sale.notes && (
        <div className="rounded-lg border bg-background p-4">
          <h2 className="mb-2 text-sm font-semibold">Notas</h2>
          <p className="text-sm text-muted-foreground">{sale.notes}</p>
        </div>
      )}

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancelar venta"
        description="El stock sera devuelto automaticamente. Esta accion no se puede deshacer."
      >
        <form
          id="cancel-sale-detail-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleCancelNow();
          }}
          className="space-y-4"
          autoComplete="off"
        >
          <Textarea
            label="Motivo de cancelacion"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: Cliente solicito cancelacion, error en cobro..."
            required
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelOpen(false)}
            >
              Volver
            </Button>
            <SubmitButton
              loadingText="Cancelando..."
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancelar venta
            </SubmitButton>
          </div>
        </form>
      </Modal>

      <style jsx global>{`
        @media print {
          body {
            background: white;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:block {
            display: block !important;
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