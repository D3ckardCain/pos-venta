'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  MessageCircle,
  Star,
  ShoppingBag,
} from 'lucide-react';
import type {
  Product,
  Category,
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
  buildCategoryMessage,
  buildProductMessage,
  shareOnWhatsApp,
} from '@/lib/utils/whatsapp';

interface Props {
  category: Category;
  products: Product[];
  currencies: Currency[];
  currencySettings: CurrencySetting | null;
  exchangeRates: ExchangeRate[];
  systemSettings: SystemSetting[];
}

function getSetting<T>(settings: SystemSetting[], key: string, fallback: T): T {
  const found = settings.find((s) => s.key === key);
  return (found?.value as T) ?? fallback;
}

export function CategoriaCatalogoClient({
  category,
  products,
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

  function priceFor(p: Product): number {
    if (!selectedCurrency || !primaryCurrency) return Number(p.base_price);
    if (selectedCurrency.id === primaryCurrency.id) return Number(p.base_price);
    const fixed = p.prices_by_currency?.find(
      (pc) => pc.currency_id === selectedCurrency.id && !pc.variant_id
    );
    if (fixed) return Number(fixed.price);
    return convertCurrency(
      Number(p.base_price),
      rateToBase,
      selectedCurrency.decimals
    );
  }

  const filtered = useMemo(() => products, [products]);

  function shareCategory() {
    const url = `${window.location.origin}/catalogo/categoria/${category.slug}`;
    shareOnWhatsApp({
      message: buildCategoryMessage(businessName, category.name, url),
    });
  }

  function shareProduct(p: Product) {
    const url = `${window.location.origin}/catalogo/producto/${p.slug}`;
    const price = selectedCurrency
      ? formatCurrency(priceFor(p), selectedCurrency)
      : undefined;
    shareOnWhatsApp({
      message: buildProductMessage(businessName, p.name, url, price),
    });
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/catalogo"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al catalogo
            </Link>
            <button
              type="button"
              onClick={shareCategory}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <MessageCircle className="h-4 w-4" />
              Compartir categoria
            </button>
          </div>
          <h1 className="mt-2 text-xl font-bold">{category.name}</h1>
          {category.description && (
            <p className="text-sm text-muted-foreground">
              {category.description}
            </p>
          )}

          {currencySettings?.show_currency_selector && currencies.length > 1 && (
            <div className="mt-2">
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
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ShoppingBag className="mb-3 h-10 w-10 text-muted-foreground" />
            <h2 className="text-base font-semibold">Sin productos</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Esta categoria aun no tiene productos.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {filtered.length} producto{filtered.length !== 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((p) => {
                const img =
                  p.images?.find((i) => i.is_primary) ?? p.images?.[0];
                return (
                  <div
                    key={p.id}
                    className="group flex flex-col overflow-hidden rounded-lg border bg-background hover:shadow-md"
                  >
                    <Link
                      href={`/catalogo/producto/${p.slug}`}
                      className="aspect-square overflow-hidden bg-muted"
                    >
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
                    </Link>
                    <div className="flex flex-1 flex-col p-3">
                      <Link href={`/catalogo/producto/${p.slug}`}>
                        <h3 className="line-clamp-2 text-sm font-medium hover:underline">
                          {p.name}
                        </h3>
                      </Link>
                      {p.is_featured && (
                        <div className="mt-1">
                          <Badge tone="warning">
                            <Star className="mr-1 inline h-3 w-3" />
                            Destacado
                          </Badge>
                        </div>
                      )}
                      <div className="mt-auto pt-3">
                        <p className="text-base font-semibold">
                          {selectedCurrency
                            ? formatCurrency(priceFor(p), selectedCurrency)
                            : priceFor(p).toFixed(2)}
                        </p>
                        <div className="mt-2 flex gap-1.5">
                          <Link
                            href={`/catalogo/producto/${p.slug}`}
                            className="flex-1 rounded-md border bg-background px-2 py-1.5 text-center text-xs font-medium hover:bg-muted"
                          >
                            Ver detalle
                          </Link>
                          <button
                            type="button"
                            onClick={() => shareProduct(p)}
                            className="rounded-md bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {businessPhone && (
          <div className="mt-12 rounded-lg border bg-background p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Tienes preguntas sobre esta categoria?
            </p>
            <button
              type="button"
              onClick={() =>
                shareOnWhatsApp({
                  phone: businessPhone,
                  message: `Hola, quiero informacion sobre la categoria *${category.name}*.`,
                })
              }
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <MessageCircle className="h-4 w-4" />
              Contactar por WhatsApp
            </button>
          </div>
        )}
      </main>
    </div>
  );
}