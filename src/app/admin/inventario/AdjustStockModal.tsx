'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import { AlertTriangle, Package } from 'lucide-react';
import type { Inventory, Currency } from '@/lib/types/database';
import { adjustInventoryAction, type ActionState } from './actions';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/utils/currency';

const initialActionState: ActionState = {
  error: null,
  success: false,
  timestamp: 0,
};

interface Props {
  open: boolean;
  onClose: () => void;
  inventory: Inventory | null;
  primaryCurrency: Currency | null;
}

export function AdjustStockModal({
  open,
  onClose,
  inventory,
  primaryCurrency,
}: Props) {
  const { showToast } = useToast();
  const [state, formAction] = useFormState(
    adjustInventoryAction,
    initialActionState
  );

  const [newStock, setNewStock] = useState<string>(
    inventory ? String(Number(inventory.stock)) : '0'
  );

  useEffect(() => {
    if (inventory) setNewStock(String(Number(inventory.stock)));
  }, [inventory]);

  useEffect(() => {
    if (state.timestamp > 0) {
      if (state.success) {
        showToast('Stock actualizado', 'success');
        onClose();
      } else if (state.error) {
        showToast(state.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.timestamp]);

  const idempotencyKey = useMemo(
    () => `adj-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, inventory?.id]
  );

  if (!inventory) return null;

  const currentStock = Number(inventory.stock);
  const reserved = Number(inventory.reserved);
  const parsedNew = Number(newStock);
  const diff = isNaN(parsedNew) ? 0 : parsedNew - currentStock;
  const isAdjustment = diff !== 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajustar stock"
      description="Toda modificacion queda registrada en el kardex con motivo."
    >
      <form id="adjust-form" action={formAction} className="space-y-4">
        <input type="hidden" name="product_id" value={inventory.product_id} />
        {inventory.variant_id && (
          <input type="hidden" name="variant_id" value={inventory.variant_id} />
        )}
        <input type="hidden" name="idempotency_key" value={idempotencyKey} />

        <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-background">
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {inventory.product?.name}
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {inventory.product?.sku ?? '-'}
              {inventory.variant ? ` - ${inventory.variant.name}` : ''}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border bg-background p-3">
            <p className="text-xs text-muted-foreground">Stock actual</p>
            <p className="mt-1 font-mono text-lg font-semibold">{currentStock}</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="text-xs text-muted-foreground">Reservado</p>
            <p className="mt-1 font-mono text-lg">{reserved}</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="text-xs text-muted-foreground">Disponible</p>
            <p className="mt-1 font-mono text-lg">{currentStock - reserved}</p>
          </div>
        </div>

        <Input
          label="Nuevo stock"
          name="new_stock"
          type="number"
          step="0.01"
          min="0"
          value={newStock}
          onChange={(e) => setNewStock(e.target.value)}
          error={state.fieldErrors?.new_stock}
          required
          hint="Establece el valor final. No es una suma/resta."
        />

        {isAdjustment && (
          <div
            className={`flex items-center gap-2 rounded-md border p-3 text-sm ${
              diff > 0
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            <span>
              Diferencia: {diff > 0 ? `+${diff}` : diff} unidades
              {primaryCurrency && inventory.product?.cost
                ? ` (${formatCurrency(
                    Math.abs(diff) * Number(inventory.product.cost),
                    primaryCurrency
                  )} en costo)`
                : ''}
            </span>
          </div>
        )}

        <Textarea
          label="Motivo del ajuste"
          name="reason"
          rows={3}
          placeholder="Ej: Conteo fisico, merma, correccion de error, compra sin registrar..."
          error={state.fieldErrors?.reason}
          required
          hint="Obligatorio. Minimo 3 caracteres."
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
          <SubmitButton loadingText="Aplicando...">
            {isAdjustment ? 'Aplicar ajuste' : 'Establecer stock'}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}