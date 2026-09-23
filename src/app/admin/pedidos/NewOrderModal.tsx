'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Minus,
  Trash2,
  Search,
  ClipboardList,
  AlertCircle,
} from 'lucide-react';
import type {
  Currency,
  Vendor,
  Customer,
  Product,
  Inventory,
  ExchangeRate,
} from '@/lib/types/database';
import { createOrderAction, type ActionState } from './actions';
import { createClient } from '@/lib/supabase/client';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, convertCurrency } from '@/lib/utils/currency';

const initialActionState: ActionState = {
  error: null,
  success: false,
  timestamp: 0,
};

interface CartItem {
  product_id: string;
  variant_id: string | null;
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  stock_available: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  currencies: Currency[];
  vendors: Vendor[];
  customers: Pick<
    Customer,
    'id' | 'full_name' | 'phone' | 'email' | 'address'
  >[];
}

export function NewOrderModal({
  open,
  onClose,
  currencies,
  vendors,
  customers,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const supabase = createClient();

  const [state, formAction] = useFormState(createOrderAction, initialActionState);

  const primaryCurrency = currencies[0];
  const [currencyId, setCurrencyId] = useState(primaryCurrency?.id ?? '');
  const [customerId, setCustomerId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [notes, setNotes] = useState('');

  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);

  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<
    (Product & { inventory?: Inventory[] })[]
  >([]);
  const [searching, setSearching] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);

  const selectedCurrency =
    currencies.find((c) => c.id === currencyId) ?? primaryCurrency;
  const isBaseCurrency = currencyId === primaryCurrency?.id;

  const idempotencyKey = useMemo(
    () => `order-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open]
  );

  useEffect(() => {
    if (!open || !primaryCurrency || !currencyId) return;
    if (currencyId === primaryCurrency.id) {
      setExchangeRate(null);
      return;
    }
    (async () => {
      const { data } = await supabase.rpc('get_current_exchange_rate', {
        p_from_currency: currencyId,
        p_to_currency: primaryCurrency.id,
      });
      const row = Array.isArray(data) ? data[0] : null;
      if (row) {
        setExchangeRate({
          id: row.rate_id,
          from_currency_id: currencyId,
          to_currency_id: primaryCurrency.id,
          rate: Number(row.rate_value),
          valid_from: '',
          valid_until: null,
          is_active: true,
          source: null,
          notes: null,
          created_by: null,
          created_at: '',
          updated_at: '',
        });
      } else {
        setExchangeRate(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currencyId, open, primaryCurrency]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      if (!productSearch.trim()) {
        setProductResults([]);
        return;
      }
      setSearching(true);
      const q = productSearch.trim();
      const { data } = await supabase
        .from('products')
        .select(
          `id, name, sku, barcode, unit, cost, base_price, has_variants,
           inventory:inventory(id, stock, reserved, available, variant_id),
           variants:product_variants(id, name, sku, base_price, cost),
           prices_by_currency:prices_by_currency(id, currency_id, price, variant_id)`
        )
        .eq('is_active', true)
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%`)
        .limit(20);
      setProductResults(
        (data ?? []) as unknown as (Product & { inventory?: Inventory[] })[]
      );
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSearch, open]);

  useEffect(() => {
    if (!open) {
      setCart([]);
      setProductSearch('');
      setProductResults([]);
      setDiscountAmount('0');
      setNotes('');
      setCustomerId('');
      setVendorId('');
      setDeliveryAddress('');
      setDeliveryNotes('');
    }
  }, [open]);

  useEffect(() => {
    if (state.timestamp > 0) {
      if (state.success) {
        showToast(`Pedido ${state.orderNumber} creado`, 'success');
        onClose();
        if (state.orderId) {
          router.push(`/admin/pedidos/${state.orderId}`);
        }
      } else if (state.error) {
        showToast(state.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.timestamp]);

  function getPrice(product: Product, variantId: string | null): number {
    const priceByCurrency = product.prices_by_currency?.find(
      (p) => p.currency_id === currencyId && !p.variant_id
    );
    if (priceByCurrency && !isBaseCurrency) return Number(priceByCurrency.price);

    if (variantId) {
      const variant = product.variants?.find((v) => v.id === variantId);
      if (variant?.base_price !== null && variant?.base_price !== undefined) {
        return isBaseCurrency
          ? Number(variant.base_price)
          : convertCurrency(
              Number(variant.base_price),
              exchangeRate?.rate ?? 1,
              selectedCurrency.decimals
            );
      }
    }

    const basePrice = Number(product.base_price);
    return isBaseCurrency
      ? basePrice
      : convertCurrency(
          basePrice,
          exchangeRate?.rate ?? 1,
          selectedCurrency.decimals
        );
  }

  function getStock(product: Product, variantId: string | null): number {
    const inv = product.inventory?.find((i) => i.variant_id === variantId);
    return Number(inv?.available ?? 0);
  }

  function addToCart(
    product: Product,
    variantId: string | null,
    variantName: string | null,
    stockAvailable: number
  ) {
    const existing = cart.find(
      (c) => c.product_id === product.id && c.variant_id === variantId
    );

    if (existing) {
      if (existing.quantity >= stockAvailable) {
        showToast(`Stock insuficiente (disponible: ${stockAvailable})`, 'error');
        return;
      }
      setCart(
        cart.map((c) =>
          c.product_id === product.id && c.variant_id === variantId
            ? { ...c, quantity: c.quantity + 1 }
            : c
        )
      );
    } else {
      if (stockAvailable <= 0) {
        showToast('Producto sin stock disponible', 'error');
        return;
      }
      setCart([
        ...cart,
        {
          product_id: product.id,
          variant_id: variantId,
          product_name: variantName
            ? `${product.name} - ${variantName}`
            : product.name,
          sku: product.sku,
          quantity: 1,
          unit_price: getPrice(product, variantId),
          stock_available: stockAvailable,
        },
      ]);
    }
  }

  function updateQuantity(index: number, newQty: number) {
    const item = cart[index];
    if (newQty <= 0) {
      removeItem(index);
      return;
    }
    if (newQty > item.stock_available) {
      showToast(`Stock insuficiente (disponible: ${item.stock_available})`, 'error');
      return;
    }
    setCart(cart.map((c, i) => (i === index ? { ...c, quantity: newQty } : c)));
  }

  function removeItem(index: number) {
    setCart(cart.filter((_, i) => i !== index));
  }

  const subtotal = cart.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  );
  const discountNum = Number(discountAmount) || 0;
  const total = Math.max(0, subtotal - discountNum);

  const rate = isBaseCurrency ? 1 : exchangeRate?.rate ?? 0;
  const baseTotal = total * rate;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo pedido"
      description="Los pedidos reservan stock. Al confirmar, el stock se descuenta."
      size="lg"
    >
      <form
        id="new-order-form"
        action={formAction}
        className="space-y-4"
        autoComplete="off"
      >
        <input type="hidden" name="items" value={JSON.stringify(cart)} />
        <input type="hidden" name="idempotency_key" value={idempotencyKey} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Moneda"
            name="currency_id"
            value={currencyId}
            onChange={(e) => setCurrencyId(e.target.value)}
            required
          >
            {currencies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} - {c.name}
              </option>
            ))}
          </Select>

          <Select
            label="Cliente (opcional)"
            name="customer_id"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">Publico general</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
                {c.phone ? ` - ${c.phone}` : ''}
              </option>
            ))}
          </Select>

          <Select
            label="Vendedor (opcional)"
            name="vendor_id"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          >
            <option value="">Sin asignar</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.profile?.full_name ?? v.code ?? v.id.slice(0, 8)}
              </option>
            ))}
          </Select>

          {!isBaseCurrency && exchangeRate && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-800">
              Tipo de cambio: 1 {selectedCurrency.code} ={' '}
              <strong>
                {Number(exchangeRate.rate).toFixed(6).replace(/\.?0+$/, '')}{' '}
                {primaryCurrency?.code}
              </strong>
            </div>
          )}

          {!isBaseCurrency && !exchangeRate && (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              <AlertCircle className="h-3.5 w-3.5" />
              No hay tipo de cambio configurado.
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Buscar productos
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Nombre, SKU o codigo de barras..."
              className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {searching && (
            <p className="mt-2 text-xs text-muted-foreground">Buscando...</p>
          )}

          {productResults.length > 0 && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-md border bg-background">
              {productResults.map((p) => {
                const hasVariants = p.variants && p.variants.length > 0;
                if (hasVariants) {
                  return p.variants!.map((v) => {
                    const stock = getStock(p, v.id);
                    const price = getPrice(p, v.id);
                    return (
                      <button
                        key={`${p.id}-${v.id}`}
                        type="button"
                        onClick={() => {
                          addToCart(p, v.id, v.name, stock);
                          setProductSearch('');
                          setProductResults([]);
                        }}
                        disabled={stock <= 0}
                        className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted disabled:opacity-40"
                      >
                        <div>
                          <p className="font-medium">
                            {p.name} - {v.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {p.sku ?? '-'} - Stock: {stock}
                          </p>
                        </div>
                        <span className="font-mono text-sm">
                          {formatCurrency(price, selectedCurrency)}
                        </span>
                      </button>
                    );
                  });
                }
                const stock = getStock(p, null);
                const price = getPrice(p, null);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      addToCart(p, null, null, stock);
                      setProductSearch('');
                      setProductResults([]);
                    }}
                    disabled={stock <= 0}
                    className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted disabled:opacity-40"
                  >
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.sku ?? '-'} - Stock: {stock}
                      </p>
                    </div>
                    <span className="font-mono text-sm">
                      {formatCurrency(price, selectedCurrency)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="rounded-md border">
            <div className="border-b bg-muted/30 px-3 py-2">
              <p className="text-sm font-medium">
                Productos ({cart.length})
              </p>
            </div>
            <div className="divide-y">
              {cart.map((item, i) => (
                <div
                  key={`${item.product_id}-${item.variant_id ?? 'null'}-${i}`}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {item.product_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.sku ?? '-'} - Stock: {item.stock_available}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateQuantity(i, item.quantity - 1)}
                      className="rounded-md border p-1 hover:bg-muted"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-10 text-center font-mono text-sm">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(i, item.quantity + 1)}
                      className="rounded-md border p-1 hover:bg-muted"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="w-24 text-right">
                    <p className="font-mono text-sm font-medium">
                      {formatCurrency(
                        item.unit_price * item.quantity,
                        selectedCurrency
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {cart.length === 0 && (
          <div className="rounded-md border border-dashed bg-muted/20 py-8 text-center text-sm text-muted-foreground">
            <ClipboardList className="mx-auto mb-2 h-6 w-6" />
            Anade productos al pedido
          </div>
        )}

        <div className="rounded-md border bg-muted/20 p-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono">
                {formatCurrency(subtotal, selectedCurrency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Descuento</span>
              <input
                type="number"
                name="discount_amount"
                step="0.01"
                min="0"
                max={subtotal}
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                className="w-24 rounded-md border bg-background px-2 py-1 text-right font-mono text-sm"
              />
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="font-mono">
                {formatCurrency(total, selectedCurrency)}
              </span>
            </div>
            {!isBaseCurrency && exchangeRate && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Equivalente en {primaryCurrency?.code}</span>
                <span className="font-mono">
                  {formatCurrency(baseTotal, primaryCurrency!)}
                </span>
              </div>
            )}
          </div>
        </div>

        <Input
          label="Direccion de entrega (opcional)"
          name="delivery_address"
          value={deliveryAddress}
          onChange={(e) => setDeliveryAddress(e.target.value)}
          placeholder="Calle, numero, colonia, ciudad..."
        />

        <Textarea
          label="Notas de entrega (opcional)"
          name="delivery_notes"
          rows={2}
          value={deliveryNotes}
          onChange={(e) => setDeliveryNotes(e.target.value)}
          placeholder="Instrucciones especiales..."
        />

        <Textarea
          label="Notas internas (opcional)"
          name="notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observaciones..."
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
          <SubmitButton
            loadingText="Creando..."
            disabled={cart.length === 0}
          >
            Crear pedido
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}