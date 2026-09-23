'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  MessageCircle,
  Star,
  ShoppingBag,
  Tag,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type {
  Product,
  Currency,
  CurrencySetting,
  ExchangeRate,
  SystemSetting,
} from '@/lib/types/database';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import {
  formatCurrency,
  convertCurrency,
} from '@/lib/utils/currency';
import {
  buildProductMessage,
  shareOnWhatsApp,
} from '@/lib/utils/whatsapp';

interface Props {
  product: Product;
  related: Product[];
  currencies: Currency[];
  currencySettings: CurrencySetting | null;
  exchangeRates: ExchangeRate[];
  systemSettings: SystemSetting[];
}

function getSetting<T>(settings: SystemSetting[], key: string, fallback: T): T {
  const found = settings.find((s) => s.key === key);
  return (found?.value as T) ?? fallback;
}

export function ProductoDetailClient({
  product,
  related,
  currencies,
  currencySettings,
  exchangeRates,
  systemSettings,
}: Props) {
  const businessName = getSetting(
    systemSettings,
    'business_name',
    'Mi Negocio'
  ) as string;
  const businessPhone = getSetting(
    systemSettings,
    'business_phone',
    ''
  ) as string;

  const primaryCurrency =
    currencySettings?.primary_currency ?? currencies[0] ?? null;

  const [selectedCurrencyId, setSelectedCurrencyId] = useState(
    primaryCurrency?.id ?? ''
  );
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null
  );
  const [imageIndex, setImageIndex] = useState(0);

  const selectedCurrency =
    currencies.find((c) => c.id === selectedCurrencyId) ?? primaryCurrency;

  const rateToBase =
    !primaryCurrency || selectedCurrencyId === primaryCurrency.id
      ? 1
      : Number(
          exchangeRates.find(
            (r) =>
              r.from_currency_id === selectedCurrencyId &&
              r.to_currency_id === primaryCurrency.id
          )?.rate ?? 1
        );

  function priceFor(): number {
    if (!selectedCurrency || !primaryCurrency)
      return Number(product.base_price);

    const selectedVariant = product.variants?.find(
      (v) => v.id === selectedVariantId
    );
    const basePrice = selectedVariant?.base_price ?? product.base_price;

    if (selectedCurrency.id === primaryCurrency.id) return Number(basePrice);

    const fixed = product.prices_by_currency?.find(
      (p) =>
        p.currency_id === selectedCurrency.id &&
        (selectedVariantId
          ? p.variant_id === selectedVariantId
          : !p.variant_id)
    );
    if (fixed) return Number(fixed.price);

    return convertCurrency(
      Number(basePrice),
      rateToBase,
      selectedCurrency.decimals
    );
  }

  function shareProduct() {
    const url = `${window.location.origin}/catalogo/producto/${product.slug}`;
    const price = selectedCurrency
      ? formatCurrency(priceFor(), selectedCurrency)
      : undefined;
    shareOnWhatsApp({
      message: buildProductMessage(businessName, product.name, url, price),
    });
  }

  function contactWhatsApp() {
    const url = `${window.location.origin}/catalogo/producto/${product.slug}`;
    const price = selectedCurrency
      ? formatCurrency(priceFor(), selectedCurrency)
      : '';
    shareOnWhatsApp({
      phone: businessPhone || undefined,
      message: `Hola, me interesa este producto:\n\n*${product.name}*\n${
        price ? `Precio: ${price}\n` : ''
      }\n${url}`,
    });
  }

  const images = product.images ?? [];
  const currentImage = images[imageIndex];

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <Link
            href="/catalogo"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al catalogo
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Imagenes */}
          <div>
            <div className="relative aspect-square overflow-hidden rounded-lg border bg-background">
              {currentImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentImage.url}
                  alt={currentImage.alt_text ?? product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <ShoppingBag className="h-12 w-12 text-muted-foreground" />
                </div>
              )}

              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setImageIndex((i) =>
                        i === 0 ? images.length - 1 : i - 1
                      )
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow hover:bg-background"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setImageIndex((i) =>
                        i === images.length - 1 ? 0 : i + 1
                      )
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow hover:bg-background"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              )}

              {product.is_featured && (
                <div className="absolute left-3 top-3">
                  <Badge tone="warning">
                    <Star className="mr-1 inline h-3 w-3" />
                    Destacado
                  </Badge>
                </div>
              )}
            </div>

            {images.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {images.map((img, i) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setImageIndex(i)}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 ${
                      i === imageIndex
                        ? 'border-primary'
                        : 'border-transparent'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.alt_text ?? ''}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detalles */}
          <div>
            {product.category && (
              <Link
                href={`/catalogo/categoria/${product.category.slug}`}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <Tag className="h-3.5 w-3.5" />
                {product.category.name}
              </Link>
            )}

            <h1 className="mt-2 text-2xl font-bold tracking-tight">
              {product.name}
            </h1>

            {product.brand && (
              <p className="mt-1 text-sm text-muted-foreground">
                Marca: {product.brand}
              </p>
            )}

            {currencySettings?.show_currency_selector &&
              currencies.length > 1 && (
                <div className="mt-4">
                  <Select
                    value={selectedCurrencyId}
                    onChange={(e) => setSelectedCurrencyId(e.target.value)}
                    className="w-48"
                  >
                    {currencies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

            <div className="mt-4 rounded-lg border bg-background p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">
                  {selectedCurrency
                    ? formatCurrency(priceFor(), selectedCurrency)
                    : priceFor().toFixed(2)}
                </span>
                {selectedCurrency && (
                  <span className="text-sm text-muted-foreground">
                    {selectedCurrency.code}
                  </span>
                )}
              </div>
              {product.unit && product.unit !== 'unidad' && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Precio por {product.unit}
                </p>
              )}
            </div>

            {product.variants && product.variants.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">
                  Variantes disponibles
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedVariantId(null)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      selectedVariantId === null
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'hover:bg-muted'
                    }`}
                  >
                    Estandar
                  </button>
                  {product.variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariantId(v.id)}
                      className={`rounded-md border px-3 py-1.5 text-sm ${
                        selectedVariantId === v.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'hover:bg-muted'
                      }`}
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              {businessPhone && (
                <button
                  type="button"
                  onClick={contactWhatsApp}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  Consultar por WhatsApp
                </button>
              )}
              <button
                type="button"
                onClick={shareProduct}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted"
              >
                <MessageCircle className="h-4 w-4" />
                Compartir producto
              </button>
            </div>

            {product.description && (
              <div className="mt-6 rounded-lg border bg-background p-4">
                <h2 className="text-sm font-semibold">Descripcion</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {product.description}
                </p>
              </div>
            )}

            {product.sku && (
              <p className="mt-4 font-mono text-xs text-muted-foreground">
                SKU: {product.sku}
              </p>
            )}
          </div>
        </div>

        {related.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-4 text-lg font-semibold">
              Productos relacionados
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {related.map((p) => {
                const img =
                  p.images?.find((i) => i.is_primary) ?? p.images?.[0];
                const fixed = p.prices_by_currency?.find(
                  (pc) =>
                    pc.currency_id === selectedCurrencyId && !pc.variant_id
                );
                const price = fixed
                  ? Number(fixed.price)
                  : selectedCurrency && primaryCurrency
                  ? selectedCurrency.id === primaryCurrency.id
                    ? Number(p.base_price)
                    : convertCurrency(
                        Number(p.base_price),
                        rateToBase,
                        selectedCurrency.decimals
                      )
                  : Number(p.base_price);

                return (
                  <Link
                    key={p.id}
                    href={`/catalogo/producto/${p.slug}`}
                    className="group flex flex-col overflow-hidden rounded-lg border bg-background hover:shadow-md"
                  >
                    <div className="aspect-square overflow-hidden bg-muted">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img.url}
                          alt={p.name}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ShoppingBag className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="line-clamp-2 text-sm font-medium">
                        {p.name}
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {selectedCurrency
                          ? formatCurrency(price, selectedCurrency)
                          : price.toFixed(2)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}