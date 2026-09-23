'use client';

import { useEffect, useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import {
  Package,
  Image as ImageIcon,
  Boxes,
  Coins,
  Trash2,
  Star,
  Plus,
  Upload,
  AlertCircle,
} from 'lucide-react';
import type {
  Product,
  Category,
  Currency,
  ProductVariant,
  ProductImage,
  PriceByCurrency,
} from '@/lib/types/database';
import {
  createProductAction,
  updateProductAction,
  addProductImageAction,
  deleteProductImageAction,
  setPrimaryImageAction,
  uploadProductImageAction,
  createVariantAction,
  deleteVariantAction,
  upsertPriceByCurrencyAction,
  deletePriceByCurrencyAction,
  generateUniqueSkuAction,
  generateUniqueVariantSkuAction,
  getProductByIdAction,
  type ActionState,
} from './actions';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Checkbox } from '@/components/ui/Checkbox';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/utils/currency';

const initialActionState: ActionState = {
  error: null,
  success: false,
  timestamp: 0,
};

type Tab = 'general' | 'images' | 'variants' | 'prices';

interface Props {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  categories: Category[];
  currencies: Currency[];
}

export function ProductFormModal({
  open,
  onClose,
  product,
  categories,
  currencies,
}: Props) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('general');

  const [currentProduct, setCurrentProduct] = useState<Product | null>(product);
  const [refreshing, setRefreshing] = useState(false);

  const [createState, createFormAction] = useFormState(
    createProductAction,
    initialActionState
  );
  const [updateState, updateFormAction] = useFormState(
    updateProductAction,
    initialActionState
  );

  const isEditing = !!currentProduct;
  const state = isEditing ? updateState : createState;
  const action = isEditing ? updateFormAction : createFormAction;

  useEffect(() => {
    setCurrentProduct(product);
  }, [product]);

  useEffect(() => {
    if (createState.timestamp > 0) {
      if (createState.success) {
        showToast('Producto creado', 'success');
        onClose();
      } else if (createState.error) {
        showToast(createState.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createState.timestamp]);

  useEffect(() => {
    if (updateState.timestamp > 0) {
      if (updateState.success) {
        showToast('Producto actualizado', 'success');
        onClose();
      } else if (updateState.error) {
        showToast(updateState.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateState.timestamp]);

  useEffect(() => {
    if (open) setTab('general');
  }, [open]);

  const productId = currentProduct?.id ?? null;
  const showTabs = isEditing && productId;

  async function refreshProduct() {
    if (!productId) return;
    setRefreshing(true);
    const res = await getProductByIdAction(productId);
    setRefreshing(false);
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    if (res.product) setCurrentProduct(res.product);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        isEditing ? `Editar ${currentProduct?.name}` : 'Nuevo producto'
      }
      description={
        isEditing
          ? 'Modifica los datos del producto y gestiona imagenes, variantes y precios.'
          : 'Completa los datos basicos. Despues podras anadir imagenes, variantes y precios por moneda.'
      }
      size="lg"
    >
      {showTabs && (
        <div className="mb-4 flex border-b">
          <TabButton
            active={tab === 'general'}
            onClick={() => setTab('general')}
            icon={<Package className="h-4 w-4" />}
          >
            General
          </TabButton>
          <TabButton
            active={tab === 'images'}
            onClick={() => setTab('images')}
            icon={<ImageIcon className="h-4 w-4" />}
          >
            Imagenes ({currentProduct?.images?.length ?? 0})
          </TabButton>
          <TabButton
            active={tab === 'variants'}
            onClick={() => setTab('variants')}
            icon={<Boxes className="h-4 w-4" />}
          >
            Variantes ({currentProduct?.variants?.length ?? 0})
          </TabButton>
          <TabButton
            active={tab === 'prices'}
            onClick={() => setTab('prices')}
            icon={<Coins className="h-4 w-4" />}
          >
            Precios
          </TabButton>
        </div>
      )}

      {tab === 'general' && (
        <form
          id="product-form"
          action={action}
          className="space-y-4"
          autoComplete="off"
        >
          {currentProduct && (
            <input type="hidden" name="id" value={currentProduct.id} />
          )}
          <GeneralTab
            key={currentProduct?.id ?? 'new'}
            product={currentProduct}
            categories={categories}
            currencies={currencies}
            fieldErrors={state.fieldErrors ?? {}}
            error={state.error}
            isEditing={isEditing}
            onClose={onClose}
          />
        </form>
      )}

      {showTabs && tab === 'images' && currentProduct && (
        <ImagesTab product={currentProduct} onRefresh={refreshProduct} />
      )}

      {showTabs && tab === 'variants' && currentProduct && (
        <VariantsTab product={currentProduct} onRefresh={refreshProduct} />
      )}

      {showTabs && tab === 'prices' && currentProduct && (
        <PricesTab
          product={currentProduct}
          currencies={currencies}
          onRefresh={refreshProduct}
        />
      )}

      {refreshing && (
        <div className="pointer-events-none fixed inset-0 z-40 bg-black/5" />
      )}
    </Modal>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

interface GeneralTabProps {
  product: Product | null;
  categories: Category[];
  currencies: Currency[];
  fieldErrors: Record<string, string>;
  error: string | null;
  isEditing: boolean;
  onClose: () => void;
}

function GeneralTab({
  product,
  categories,
  currencies,
  fieldErrors,
  error,
  isEditing,
  onClose,
}: GeneralTabProps) {
  const { showToast } = useToast();
  const [name, setName] = useState(product?.name ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(!!product);
  const [sku, setSku] = useState(product?.sku ?? '');
  const [skuTouched, setSkuTouched] = useState(!!product?.sku);
  const [generatingSku, setGeneratingSku] = useState(false);
  const primaryCurrency = currencies[0];

  function slugify(text: string): string {
    return text
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async function handleGenerateSku() {
    if (!name.trim()) return;
    setGeneratingSku(true);
    const res = await generateUniqueSkuAction(
      name,
      product?.id ?? undefined
    );
    setGeneratingSku(false);
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    setSku(res.sku);
    setSkuTouched(true);
  }

  useEffect(() => {
    if (!name.trim() || skuTouched) return;
    const t = setTimeout(async () => {
      const res = await generateUniqueSkuAction(
        name,
        product?.id ?? undefined
      );
      if (!res.error) {
        setSku(res.sku);
      }
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, skuTouched]);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            label="Nombre"
            name="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            error={fieldErrors.name}
            required
          />
        </div>

        <div className="sm:col-span-2">
          <Input
            label="Slug (URL publica)"
            name="slug"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            error={fieldErrors.slug}
            hint="Solo minusculas, numeros y guiones."
            required
          />
        </div>

        <div className="sm:col-span-2">
          <Input
            label="SKU (opcional)"
            name="sku"
            value={sku}
            onChange={(e) => {
              setSku(e.target.value);
              setSkuTouched(true);
            }}
            error={fieldErrors.sku}
            hint="Se autogenera desde el nombre. Puedes editarlo."
          />
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={handleGenerateSku}
              disabled={!name.trim() || generatingSku}
              className="text-xs text-primary hover:underline disabled:opacity-40"
            >
              {generatingSku ? 'Generando...' : 'Regenerar SKU unico'}
            </button>
          </div>
        </div>

        <Input
          label="Codigo de barras (opcional)"
          name="barcode"
          defaultValue={product?.barcode ?? ''}
          error={fieldErrors.barcode}
        />

        <Select
          label="Categoria"
          name="category_id"
          defaultValue={product?.category_id ?? ''}
          error={fieldErrors.category_id}
        >
          <option value="">Sin categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        <Input
          label="Marca (opcional)"
          name="brand"
          defaultValue={product?.brand ?? ''}
          error={fieldErrors.brand}
        />

        <Input
          label="Unidad de venta"
          name="unit"
          defaultValue={product?.unit ?? 'unidad'}
          error={fieldErrors.unit}
          hint="Ej: unidad, kg, litro, caja."
        />

        <Input
          label={`Costo (${primaryCurrency?.code ?? 'moneda principal'})`}
          name="cost"
          type="number"
          step="0.01"
          min="0"
          defaultValue={product?.cost ?? 0}
          error={fieldErrors.cost}
          required
        />

        <Input
          label={`Precio base (${primaryCurrency?.code ?? 'moneda principal'})`}
          name="base_price"
          type="number"
          step="0.01"
          min="0"
          defaultValue={product?.base_price ?? 0}
          error={fieldErrors.base_price}
          required
          hint="Los precios en otras monedas se convierten desde aqui o se definen en la pestana Precios."
        />

        <Input
          label="Stock minimo"
          name="min_stock"
          type="number"
          step="0.01"
          min="0"
          defaultValue={product?.min_stock ?? 0}
          error={fieldErrors.min_stock}
          hint="Alerta cuando el stock baje de este valor."
        />
      </div>

      <Textarea
        label="Descripcion (opcional)"
        name="description"
        rows={4}
        defaultValue={product?.description ?? ''}
        error={fieldErrors.description}
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Checkbox
          name="is_active"
          label="Activo"
          defaultChecked={product?.is_active ?? true}
        />
        <Checkbox
          name="is_featured"
          label="Destacado"
          defaultChecked={product?.is_featured ?? false}
        />
        <Checkbox
          name="has_variants"
          label="Tiene variantes"
          defaultChecked={product?.has_variants ?? false}
          hint="Activalo si vas a crear variantes (talla, color, etc.)."
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <SubmitButton loadingText={isEditing ? 'Guardando...' : 'Creando...'}>
          {isEditing ? 'Guardar cambios' : 'Crear producto'}
        </SubmitButton>
      </div>
    </>
  );
}

function ImagesTab({
  product,
  onRefresh,
}: {
  product: Product;
  onRefresh: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('La imagen supera 2 MB', 'error');
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('product_id', product.id);

      const res = await uploadProductImageAction(fd);
      if (res.error || !res.url) {
        showToast(res.error ?? 'Error al subir', 'error');
        setUploading(false);
        return;
      }

      const addRes = await addProductImageAction(product.id, res.url);
      if (addRes.error) {
        showToast(addRes.error, 'error');
      } else {
        showToast('Imagen anadida', 'success');
        await onRefresh();
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Error al procesar imagen',
        'error'
      );
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function handleDelete(image: ProductImage) {
    startTransition(async () => {
      const res = await deleteProductImageAction(image.id);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Imagen eliminada', 'success');
        await onRefresh();
      }
    });
  }

  function handleSetPrimary(image: ProductImage) {
    startTransition(async () => {
      const res = await setPrimaryImageAction(image.id, product.id);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Imagen principal actualizada', 'success');
        await onRefresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-muted/20 px-6 py-8 text-center hover:bg-muted/40">
        <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
        <span className="text-sm font-medium">
          {uploading ? 'Subiendo...' : 'Subir imagen'}
        </span>
        <span className="mt-1 text-xs text-muted-foreground">
          JPG, PNG, WEBP o GIF - Max 2 MB
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleUpload}
          disabled={uploading}
          className="hidden"
        />
      </label>

      {product.images && product.images.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {product.images.map((img) => (
            <div
              key={img.id}
              className="group relative overflow-hidden rounded-lg border bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.alt_text ?? product.name}
                className="aspect-square w-full object-cover"
              />
              {img.is_primary && (
                <div className="absolute left-2 top-2">
                  <Badge tone="success">Principal</Badge>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-2">
                {!img.is_primary && (
                  <button
                    type="button"
                    title="Marcar como principal"
                    onClick={() => handleSetPrimary(img)}
                    className="rounded-md bg-white/90 p-1.5 text-amber-600 hover:bg-white"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  title="Eliminar"
                  onClick={() => handleDelete(img)}
                  className="rounded-md bg-white/90 p-1.5 text-destructive hover:bg-white"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Sin imagenes aun.
        </p>
      )}
    </div>
  );
}

function VariantsTab({
  product,
  onRefresh,
}: {
  product: Product;
  onRefresh: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [skuTouched, setSkuTouched] = useState(false);
  const [generatingSku, setGeneratingSku] = useState(false);
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [isPending, startTransition] = useTransition();

  async function handleGenerateSku() {
    if (!product.sku || !name.trim()) return;
    setGeneratingSku(true);
    const res = await generateUniqueVariantSkuAction(product.sku, name);
    setGeneratingSku(false);
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    setSku(res.sku);
    setSkuTouched(true);
  }

  useEffect(() => {
    if (!adding) return;
    if (!name.trim() || skuTouched) return;
    if (!product.sku) return;
    const t = setTimeout(async () => {
      const res = await generateUniqueVariantSkuAction(product.sku!, name);
      if (!res.error) {
        setSku(res.sku);
      }
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, skuTouched, adding]);

  function handleAdd() {
    if (!name.trim()) return;
    startTransition(async () => {
      const res = await createVariantAction(product.id, {
        name: name.trim(),
        sku: sku.trim() || undefined,
        base_price: price ? Number(price) : null,
        cost: cost ? Number(cost) : null,
      });
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Variante creada', 'success');
        setName('');
        setSku('');
        setSkuTouched(false);
        setPrice('');
        setCost('');
        setAdding(false);
        await onRefresh();
      }
    });
  }

  function handleDelete(v: ProductVariant) {
    startTransition(async () => {
      const res = await deleteVariantAction(v.id);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Variante eliminada', 'success');
        await onRefresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {!adding ? (
        <Button onClick={() => setAdding(true)} size="sm">
          <Plus className="h-4 w-4" />
          Anadir variante
        </Button>
      ) : (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Nombre de variante"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: 1 metro, Talla M, Rojo"
              required
            />
            <Input
              label="SKU (opcional)"
              value={sku}
              onChange={(e) => {
                setSku(e.target.value);
                setSkuTouched(true);
              }}
              hint="Se autogenera desde el nombre. Puedes editarlo."
            />
            <Input
              label="Precio override (opcional)"
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <Input
              label="Costo override (opcional)"
              type="number"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleGenerateSku}
              disabled={!name.trim() || generatingSku || !product.sku}
              className="text-xs text-primary hover:underline disabled:opacity-40"
            >
              {generatingSku ? 'Generando...' : 'Regenerar SKU unico'}
            </button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  setSkuTouched(false);
                }}
              >
                Cancelar
              </Button>
              <Button size="sm" onClick={handleAdd} loading={isPending}>
                Crear variante
              </Button>
            </div>
          </div>
        </div>
      )}

      {product.variants && product.variants.length > 0 ? (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Nombre
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  SKU
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Precio
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Costo
                </th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => (
                <tr key={v.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{v.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {v.sku ?? '-'}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {v.base_price ?? '-'}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {v.cost ?? '-'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(v)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Sin variantes. El producto se vende como unidad simple.
        </p>
      )}
    </div>
  );
}

function PricesTab({
  product,
  currencies,
  onRefresh,
}: {
  product: Product;
  currencies: Currency[];
  onRefresh: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [, startTransition] = useTransition();

  const existingPrices = (product.prices_by_currency ?? []) as PriceByCurrency[];
  const primaryCurrencyId = currencies[0]?.id ?? null;

  function getPriceForCurrency(currencyId: string): PriceByCurrency | undefined {
    return existingPrices.find(
      (p) => p.currency_id === currencyId && !p.variant_id
    );
  }

  function handleSave(currency: Currency, priceStr: string) {
    const price = Number(priceStr);
    if (isNaN(price) || price < 0) {
      showToast('Precio invalido', 'error');
      return;
    }
    startTransition(async () => {
      const res = await upsertPriceByCurrencyAction({
        product_id: product.id,
        currency_id: currency.id,
        price,
      });
      if (res.error) showToast(res.error, 'error');
      else {
        showToast(`Precio en ${currency.code} guardado`, 'success');
        await onRefresh();
      }
    });
  }

  function handleDelete(p: PriceByCurrency) {
    startTransition(async () => {
      const res = await deletePriceByCurrencyAction(p.id);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Precio eliminado', 'success');
        await onRefresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          El precio base esta en la moneda principal. Aqui puedes definir precios
          especificos por moneda. Si no defines uno, se usara la conversion
          automatica con el tipo de cambio vigente.
        </p>
      </div>

      <div className="space-y-3">
        {currencies.map((c) => {
          const existing = getPriceForCurrency(c.id);
          const isPrimary = c.id === primaryCurrencyId;

          return (
            <div
              key={c.id}
              className="flex flex-col gap-3 rounded-lg border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted font-mono text-xs font-semibold">
                  {c.code}
                </div>
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {isPrimary
                      ? `Precio base: ${formatCurrency(Number(product.base_price), c)}`
                      : existing
                      ? `Precio fijo: ${formatCurrency(Number(existing.price), c)}`
                      : 'Sin precio fijo (se convierte automaticamente)'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={existing ? String(existing.price) : '0.00'}
                  defaultValue={existing?.price ?? ''}
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val && Number(val) !== Number(existing?.price ?? NaN)) {
                      handleSave(c, val);
                    }
                  }}
                  className="w-32 rounded-md border bg-background px-2 py-1.5 text-sm"
                />
                <span className="text-xs text-muted-foreground">{c.symbol}</span>
                {existing && !isPrimary && (
                  <button
                    type="button"
                    title="Eliminar precio fijo"
                    onClick={() => handleDelete(existing)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}