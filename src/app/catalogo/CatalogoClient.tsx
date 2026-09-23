'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  ShoppingBag,
  Star,
  MessageCircle,
  Store,
  Tag,
  X,
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
  buildCatalogMessage,
  buildProductMessage,
  shareOnWhatsApp,
} from '@/lib/utils/whatsapp';

interface Props {
  products: Product[];
  categories: Category[];
  currencies: Currency[];
  currencySettings: CurrencySetting | null;
  exchangeRates: ExchangeRate[];
  systemSettings: SystemSetting[];
}

function getSetting<T>(settings: SystemSetting[], key: string, fallback: T): T {
  const found = settings.find((s) => s.key === key);
  return (found?.value as T) ?? fallback;
}

export function CatalogoClient({
  products,
  categories,
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
  const catalogUrl = getSetting(
    systemSettings,
    'catalog_url',
    ''
  ) as string;
  const customMessage = getSetting(
    systemSettings,
    'whatsapp_message_template',
    ''
  ) as string;

  const primaryCurrency =
    currencySettings?.primary_currency ?? currencies[0] ?? null;

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedCurrencyId, setSelectedCurrencyId] = useState<string>(
    primaryCurrency?.id ?? ''
  );
  const [sortBy, setSortBy] = useState<
    'featured' | 'price_asc' | 'price_desc' | 'name'
  >('featured');

  const selectedCurrency =
    currencies.find((c) => c.id === selectedCurrencyId) ?? primaryCurrency;

  const rateToBase = useMemo(() => {
    if (!primaryCurrency || selectedCurrencyId === primaryCurrency.id) return 1;
    const rate = exchangeRates.find(
      (r) =>
        r.from_currency_id === selectedCurrencyId &&
        r.to_currency_id === primaryCurrency.id
    );
    return rate ? Number(rate.rate) : 1;
  }, [exchangeRates, selectedCurrencyId, primaryCurrency]);

  function priceFor(product: Product): number {
    if (!selectedCurrency || !primaryCurrency)
      return Number(product.base_price);
    if (selectedCurrency.id === primaryCurrency.id)
      return Number(product.base_price);

    const fixed = product.prices_by_currency?.find(
      (p) => p.currency_id === selectedCurrency.id && !p.variant_id
    );
    if (fixed) return Number(fixed.price);

    return convertCurrency(
      Number(product.base_price),
      rateToBase,
      selectedCurrency.decimals
    );
  }

  const filtered = useMemo(() => {
    let list = [...products];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q) ||
          (p.brand ?? '').toLowerCase().includes(q) ||
          (p.sku ?? '').toLowerCase().includes(q)
      );
    }

    if (selectedCategory !== 'all') {
      list = list.filter((p) => p.category_id === selectedCategory);
    }

    list.sort((a, b) => {
      if (sortBy === 'featured') {
        if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
        return 0;
      }
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'price_asc') return priceFor(a) - priceFor(b);
      if (sortBy === 'price_desc') return priceFor(b) - priceFor(a);
      return 0;
    });

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, search, selectedCategory, sortBy, selectedCurrencyId]);

  function shareCatalog() {
    const finalUrl =
      catalogUrl || (typeof window !== 'undefined' ? window.location.href : '');
    shareOnWhatsApp({
      phone: businessPhone || undefined,
      message: buildCatalogMessage(businessName, finalUrl, customMessage),
    });
  }

  function shareProduct(product: Product) {
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/catalogo/producto/${product.slug}`;
    const price = selectedCurrency
      ? formatCurrency(priceFor(product), selectedCurrency)
      : undefined;
    shareOnWhatsApp({
      message: buildProductMessage(businessName, product.name, url, price),
    });
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Store className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-base font-semibold">{businessName}</h1>
                <p className="text-xs text-muted-foreground">
                  Catalogo actualizado
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {currencySettings?.show_currency_selector &&
                currencies.length > 1 && (
                  <div className="hidden sm:block">
                    <Select
                      value={selectedCurrencyId}
                      onChange={(e) => setSelectedCurrencyId(e.target.value)}
                      className="w-32"
                    >
                      {currencies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              <button
                type="button"
                onClick={shareCatalog}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Compartir catalogo</span>
                <span className="sm:hidden">Compartir</span>
              </button>
            </div>
          </div>

          {/* Buscador */}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar productos..."
                className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="sm:w-48"
            >
              <option value="featured">Destacados primero</option>
              <option value="name">Nombre A-Z</option>
              <option value="price_asc">Precio: menor a mayor</option>
              <option value="price_desc">Precio: mayor a menor</option>
            </Select>
          </div>

          {currencySettings?.show_currency_selector &&
            currencies.length > 1 && (
              <div className="mt-2 sm:hidden">
                <Select
                  value={selectedCurrencyId}
                  onChange={(e) => setSelectedCurrencyId(e.target.value)}
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

      {/* Categorías */}
      {categories.length > 0 && (
        <div className="border-b bg-background">
          <div className="mx-auto max-w-6xl overflow-x-auto px-4 py-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
                  selectedCategory === 'all'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'hover:bg-muted'
                }`}
              >
                Todos
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategory(c.id)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
                    selectedCategory === c.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'hover:bg-muted'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Grid de productos */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ShoppingBag className="mb-3 h-10 w-10 text-muted-foreground" />
            <h2 className="text-base font-semibold">Sin productos</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {search
                ? 'Prueba con otro termino de busqueda.'
                : 'Aun no hay productos disponibles.'}
            </p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {filtered.length} producto{filtered.length !== 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  price={priceFor(p)}
                  currency={selectedCurrency}
                  onShare={() => shareProduct(p)}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-background">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-muted-foreground">
          <p>{businessName} - Catalogo actualizado automaticamente</p>
          {businessPhone && (
            <button
              type="button"
              onClick={() =>
                shareOnWhatsApp({
                  phone: businessPhone,
                  message:
                    'Hola, quiero informacion sobre sus productos.',
                })
              }
              className="mt-2 inline-flex items-center gap-1 text-emerald-600 hover:underline"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Contactar por WhatsApp
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

function ProductCard({
  product,
  price,
  currency,
  onShare,
}: {
  product: Product;
  price: number;
  currency: Currency | null;
  onShare: () => void;
}) {
  const primaryImage =
    product.images?.find((i) => i.is_primary) ?? product.images?.[0];

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border bg-background transition-shadow hover:shadow-md">
      <Link
        href={`/catalogo/producto/${product.slug}`}
        className="relative aspect-square overflow-hidden bg-muted"
      >
        {primaryImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primaryImage.url}
            alt={primaryImage.alt_text ?? product.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ShoppingBag className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        {product.is_featured && (
          <div className="absolute left-2 top-2">
            <Badge tone="warning">
              <Star className="mr-1 inline h-3 w-3" />
              Destacado
            </Badge>
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-3">
        <Link href={`/catalogo/producto/${product.slug}`}>
          <h3 className="line-clamp-2 text-sm font-medium hover:underline">
            {product.name}
          </h3>
        </Link>
        {product.brand && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {product.brand}
          </p>
        )}
        {product.category && (
          <Link
            href={`/catalogo/categoria/${product.category.slug}`}
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Tag className="h-3 w-3" />
            {product.category.name}
          </Link>
        )}

        <div className="mt-auto pt-3">
          <div className="flex items-baseline gap-1">
            <span className="text-base font-semibold">
              {currency ? formatCurrency(price, currency) : price.toFixed(2)}
            </span>
            {currency && (
              <span className="text-xs text-muted-foreground">
                {currency.code}
              </span>
            )}
          </div>

          <div className="mt-2 flex gap-1.5">
            <Link
              href={`/catalogo/producto/${product.slug}`}
              className="flex-1 rounded-md border bg-background px-2 py-1.5 text-center text-xs font-medium hover:bg-muted"
            >
              Ver detalle
            </Link>
            <button
              type="button"
              onClick={onShare}
              title="Compartir por WhatsApp"
              className="rounded-md bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}