'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Minus,
  Trash2,
  Search,
  ShoppingCart,
  AlertCircle,
  Pause,
  Scan,
} from 'lucide-react';
import type {
  Currency,
  PaymentMethod,
  Vendor,
  Customer,
  Product,
  Inventory,
  CashRegister,
  ExchangeRate,
  ParkedSale,
  ParkedSaleItem,
} from '@/lib/types/database';
import {
  createSaleAction,
  parkSaleAction,
  updateParkedSaleAction,
  findByBarcodeAction,
  type ActionState,
} from './actions';
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
  unit_cost: number;
  discount_amount: number;
  stock_available: number;
  currency_code: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  currencies: Currency[];
  paymentMethods: PaymentMethod[];
  vendors: Vendor[];
  customers: Pick<Customer, 'id' | 'full_name' | 'phone' | 'email'>[];
  cashRegisters: CashRegister[];
  parkedSale: ParkedSale | null;
}

export function NewSaleModal({
  open,
  onClose,
  currencies,
  paymentMethods,
  vendors,
  customers,
  cashRegisters,
  parkedSale,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const supabase = createClient();

  const isResuming = !!parkedSale;

  // ============================================
  // ESTADO DEL FORMULARIO
  // ============================================

  const primaryCurrency = currencies[0];

  const [currencyId, setCurrencyId] = useState(
    parkedSale?.currency_id ?? primaryCurrency?.id ?? ''
  );
  const [paymentMethodId, setPaymentMethodId] = useState(
    parkedSale?.payment_method_id ?? paymentMethods[0]?.id ?? ''
  );
  const [customerId, setCustomerId] = useState(parkedSale?.customer_id ?? '');
  const [vendorId, setVendorId] = useState(parkedSale?.vendor_id ?? '');
  const [cashRegisterId, setCashRegisterId] = useState(
    parkedSale?.cash_register_id ?? cashRegisters[0]?.id ?? ''
  );
  const [discountAmount, setDiscountAmount] = useState(
    parkedSale ? String(parkedSale.discount_amount) : '0'
  );
  const [notes, setNotes] = useState(parkedSale?.notes ?? '');
  const [parkedName, setParkedName] = useState(parkedSale?.name ?? '');
  const [parkedSaleId, setParkedSaleId] = useState(parkedSale?.id ?? null);

  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);

  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<
    (Product & { inventory?: Inventory[] })[]
  >([]);
  const [searching, setSearching] = useState(false);

  const [barcode, setBarcode] = useState('');
  const [scanning, setScanning] = useState(false);

  const [cart, setCart] = useState<CartItem[]>(
    parkedSale
      ? (parkedSale.items ?? []).map((i: ParkedSaleItem) => ({
          product_id: i.product_id,
          variant_id: i.variant_id,
          product_name: i.product_name,
          sku: i.sku,
          quantity: i.quantity,
          unit_price: i.unit_price,
          unit_cost: i.unit_cost,
          discount_amount: i.discount_amount ?? 0,
          stock_available: i.stock_available,
          currency_code:
            currencies.find((c) => c.id === parkedSale.currency_id)?.code ?? '',
        }))
      : []
  );

  const [showParkModal, setShowParkModal] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedCurrency =
    currencies.find((c) => c.id === currencyId) ?? primaryCurrency;
  const isBaseCurrency = currencyId === primaryCurrency?.id;

  const idempotencyKey = useMemo(
    () => `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, parkedSaleId]
  );

  // ============================================
  // FORMS
  // ============================================

  const [createState, createFormAction] = useFormState(
    createSaleAction,
    initialActionState
  );
  const [parkState, parkFormAction] = useFormState(
    parkSaleAction,
    initialActionState
  );

  // ============================================
  // EFECTOS
  // ============================================

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

  // Buscar productos con debounce
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

  // Reset al cerrar
  useEffect(() => {
    if (!open && !parkedSale) {
      setCart([]);
      setProductSearch('');
      setProductResults([]);
      setDiscountAmount('0');
      setNotes('');
      setCustomerId('');
      setVendorId('');
      setParkedName('');
      setBarcode('');
      setParkedSaleId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Al éxito de crear venta
  useEffect(() => {
    if (createState.timestamp > 0) {
      if (createState.success) {
        showToast(`Venta ${createState.saleNumber} registrada`, 'success');
        onClose();
        if (createState.saleId) {
          router.push(`/admin/ventas/${createState.saleId}`);
        }
      } else if (createState.error) {
        showToast(createState.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createState.timestamp]);

  // Al éxito de pausar venta
  useEffect(() => {
    if (parkState.timestamp > 0) {
      if (parkState.success) {
        showToast('Venta guardada en espera', 'success');
        setShowParkModal(false);
        onClose();
      } else if (parkState.error) {
        showToast(parkState.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkState.timestamp]);

  // ============================================
  // LÓGICA DE NEGOCIO
  // ============================================

  function getPrice(product: Product, variantId: string | null): number {
    const priceByCurrency = product.prices_by_currency?.find(
      (p) => p.currency_id === currencyId && !p.variant_id
    );
    if (priceByCurrency && !isBaseCurrency) {
      return Number(priceByCurrency.price);
    }

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
      const price = getPrice(product, variantId);
      const cost = isBaseCurrency
        ? Number(product.cost)
        : convertCurrency(
            Number(product.cost),
            exchangeRate?.rate ?? 1,
            selectedCurrency.decimals
          );
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
          unit_price: price,
          unit_cost: cost,
          discount_amount: 0,
          stock_available: stockAvailable,
          currency_code: selectedCurrency.code,
        },
      ]);
    }
  }

  async function handleBarcodeSubmit() {
    if (!barcode.trim()) return;
    setScanning(true);
    const res = await findByBarcodeAction(barcode.trim());
    setScanning(false);
    setBarcode('');

    if (res.error || !res.product) {
      showToast(res.error ?? 'Producto no encontrado', 'error');
      barcodeInputRef.current?.focus();
      return;
    }

    const product = res.product as unknown as Product & {
      inventory?: Inventory[];
    };

    if (product.has_variants && product.variants && product.variants.length > 0) {
      // Si tiene variantes, mostrar resultados de búsqueda
      setProductResults([product]);
      setProductSearch(product.name);
      showToast(
        `Producto con ${product.variants.length} variante(s). Selecciona una.`,
        'info'
      );
      return;
    }

    const stock = getStock(product, null);
    addToCart(product, null, null, stock);
    showToast(`${product.name} anadido`, 'success');
    barcodeInputRef.current?.focus();
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

  function updateUnitPrice(index: number, newPrice: string) {
    const price = Number(newPrice);
    if (isNaN(price) || price < 0) return;
    setCart(cart.map((c, i) => (i === index ? { ...c, unit_price: price } : c)));
  }

  function updateItemDiscount(index: number, newDiscount: string) {
    const discount = Number(newDiscount);
    if (isNaN(discount) || discount < 0) return;
    setCart(
      cart.map((c, i) => (i === index ? { ...c, discount_amount: discount } : c))
    );
  }

  function removeItem(index: number) {
    setCart(cart.filter((_, i) => i !== index));
  }

  // Totales
  const subtotal = cart.reduce(
    (sum, item) => sum + item.unit_price * item.quantity - item.discount_amount,
    0
  );
  const discountNum = Number(discountAmount) || 0;
  const total = Math.max(0, subtotal - discountNum);

  const rate = isBaseCurrency ? 1 : exchangeRate?.rate ?? 0;
  const baseTotal = total * rate;

  // Payload de items para el servidor
  const itemsPayload = cart.map((item) => ({
    product_id: item.product_id,
    variant_id: item.variant_id,
    product_name: item.product_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    unit_cost: item.unit_cost,
    discount_amount: item.discount_amount,
  }));

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={isResuming ? `Retomar: ${parkedSale?.name}` : 'Nueva venta'}
        description="Busca o escanea productos, ajusta cantidades y confirma. El stock se descuenta al confirmar."
        size="full"
      >
        <div className="space-y-4">
          {/* Configuración */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select
              label="Moneda"
              value={currencyId}
              onChange={(e) => setCurrencyId(e.target.value)}
            >
              {currencies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} - {c.name}
                </option>
              ))}
            </Select>

            <Select
              label="Metodo de pago"
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
            >
              <option value="">Selecciona...</option>
              {paymentMethods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>

            <Select
              label="Cliente (opcional)"
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

            {cashRegisters.length > 0 && (
              <Select
                label="Caja (opcional)"
                value={cashRegisterId}
                onChange={(e) => setCashRegisterId(e.target.value)}
              >
                <option value="">Sin caja</option>
                {cashRegisters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}

            {!isBaseCurrency && exchangeRate && (
              <div className="flex items-center rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-800">
                1 {selectedCurrency.code} ={' '}
                {Number(exchangeRate.rate).toFixed(6).replace(/\.?0+$/, '')}{' '}
                {primaryCurrency?.code}
              </div>
            )}

            {!isBaseCurrency && !exchangeRate && (
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                <AlertCircle className="h-3.5 w-3.5" />
                Sin tipo de cambio
              </div>
            )}
          </div>

          {/* Escáner de código de barras */}
          <div className="rounded-md border bg-background p-3">
            <div className="flex items-center gap-2">
              <Scan className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Escanear codigo de barras / QR</p>
            </div>
            <div className="mt-2 flex gap-2">
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleBarcodeSubmit();
                  }
                }}
                placeholder="Escanea o escribe el codigo y presiona Enter"
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus={open && !isResuming}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleBarcodeSubmit}
                loading={scanning}
              >
                Buscar
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Compatible con lectores USB. Al recibir el codigo, presiona Enter para
              agregar el producto.
            </p>
          </div>

          {/* Búsqueda por nombre */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Buscar por nombre o SKU
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Nombre o SKU..."
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

          {/* Carrito */}
          {cart.length > 0 && (
            <div className="rounded-md border">
              <div className="border-b bg-muted/30 px-3 py-2">
                <p className="text-sm font-medium">
                  Carrito ({cart.length} producto{cart.length !== 1 ? 's' : ''})
                </p>
              </div>
              <div className="divide-y">
                {cart.map((item, i) => (
                  <div
                    key={`${item.product_id}-${item.variant_id ?? 'null'}-${i}`}
                    className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center"
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
                      <input
                        type="number"
                        min={1}
                        max={item.stock_available}
                        value={item.quantity}
                        onChange={(e) => updateQuantity(i, Number(e.target.value))}
                        className="w-14 rounded-md border bg-background px-1 py-1 text-center font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => updateQuantity(i, item.quantity + 1)}
                        className="rounded-md border p-1 hover:bg-muted"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unit_price}
                        onChange={(e) => updateUnitPrice(i, e.target.value)}
                        className="w-20 rounded-md border bg-background px-1 py-1 text-right font-mono text-sm"
                      />
                      <span className="text-xs text-muted-foreground">
                        {selectedCurrency.code}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.discount_amount}
                        onChange={(e) => updateItemDiscount(i, e.target.value)}
                        className="w-16 rounded-md border bg-background px-1 py-1 text-right font-mono text-xs"
                        title="Descuento del item"
                        placeholder="Desc."
                      />
                    </div>

                    <div className="w-20 text-right">
                      <p className="font-mono text-sm font-medium">
                        {formatCurrency(
                          item.unit_price * item.quantity - item.discount_amount,
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
              <ShoppingCart className="mx-auto mb-2 h-6 w-6" />
              Escanea o busca productos para comenzar
            </div>
          )}

          {/* Totales */}
          <div className="rounded-md border bg-muted/20 p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">
                  {formatCurrency(subtotal, selectedCurrency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Descuento global</span>
                <input
                  type="number"
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

          {/* Notas */}
          <Textarea
            label="Notas (opcional)"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observaciones sobre la venta..."
          />

          {/* Errores */}
          {createState.error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {createState.error}
            </div>
          )}

          {/* Formulario oculto para submit */}
          <form
            id="new-sale-form"
            action={createFormAction}
            className="hidden"
          >
            <input type="hidden" name="items" value={JSON.stringify(itemsPayload)} />
            <input type="hidden" name="currency_id" value={currencyId} />
            <input
              type="hidden"
              name="payment_method_id"
              value={paymentMethodId}
            />
            <input type="hidden" name="customer_id" value={customerId} />
            <input type="hidden" name="vendor_id" value={vendorId} />
            <input
              type="hidden"
              name="cash_register_id"
              value={cashRegisterId}
            />
            <input
              type="hidden"
              name="discount_amount"
              value={discountAmount}
            />
            <input type="hidden" name="notes" value={notes} />
            <input
              type="hidden"
              name="idempotency_key"
              value={idempotencyKey}
            />
            {parkedSaleId && (
              <input
                type="hidden"
                name="parked_sale_id"
                value={parkedSaleId}
              />
            )}
          </form>

          {/* Botones */}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowParkModal(true)}
              disabled={cart.length === 0}
            >
              <Pause className="h-4 w-4" />
              {isResuming ? 'Actualizar espera' : 'Guardar en espera'}
            </Button>
            <Button
              type="submit"
              form="new-sale-form"
              disabled={cart.length === 0 || !paymentMethodId}
              loading={createState.timestamp > 0 && createState.success === false}
            >
              Confirmar venta
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal para nombrar la venta en espera */}
      <Modal
        open={showParkModal}
        onClose={() => setShowParkModal(false)}
        title={isResuming ? 'Actualizar venta en espera' : 'Guardar venta en espera'}
        description="Ponle un nombre para identificarla despues (ej: Mesa 3, Juan Perez)."
      >
        <form id="park-sale-form" action={parkFormAction} className="space-y-4">
          <input
            type="hidden"
            name="items"
            value={JSON.stringify(itemsPayload)}
          />
          <input type="hidden" name="currency_id" value={currencyId} />
          <input
            type="hidden"
            name="payment_method_id"
            value={paymentMethodId}
          />
          <input type="hidden" name="customer_id" value={customerId} />
          <input type="hidden" name="vendor_id" value={vendorId} />
          <input
            type="hidden"
            name="cash_register_id"
            value={cashRegisterId}
          />
          <input type="hidden" name="discount_amount" value={discountAmount} />
          <input type="hidden" name="notes" value={notes} />

          <Input
            label="Nombre de la venta en espera"
            name="name"
            value={parkedName}
            onChange={(e) => setParkedName(e.target.value)}
            placeholder="Ej: Mesa 3, Cliente Juan, Pedido grande..."
            required
          />

          {parkState.error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {parkState.error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowParkModal(false)}
            >
              Cancelar
            </Button>
            <SubmitButton loadingText="Guardando...">
              {isResuming ? 'Actualizar' : 'Guardar en espera'}
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}