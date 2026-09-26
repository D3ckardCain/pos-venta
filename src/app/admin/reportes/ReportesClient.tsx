'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  BarChart3,
  Calendar,
  Users,
  Package,
  Tag,
  Coins,
  CreditCard,
  Download,
  Filter,
  X,
  TrendingUp,
  DollarSign,
  ShoppingCart,
} from 'lucide-react';
import type {
  Currency,
  Vendor,
  Customer,
  PaymentMethod,
  Category,
  Product,
} from '@/lib/types/database';
import {
  reportSalesByDay,
  exportSalesByDayExcel,
  reportByVendor,
  exportByVendorExcel,
  reportByProduct,
  exportByProductExcel,
  reportByCategory,
  exportByCategoryExcel,
  reportByCurrency,
  exportByCurrencyExcel,
  reportByPaymentMethod,
  exportByPaymentMethodExcel,
  type ReportFilters,
  type SalesByDayRow,
  type ByVendorRow,
  type ByProductRow,
  type ByCategoryRow,
  type ByCurrencyRow,
  type ByPaymentRow,
} from './actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/utils/currency';

// ============================================
// TIPOS
// ============================================
type ReportType =
  | 'sales-by-day'
  | 'by-vendor'
  | 'by-product'
  | 'by-category'
  | 'by-currency'
  | 'by-payment';

interface Props {
  currencies: Currency[];
  vendors: Vendor[];
  customers: Pick<Customer, 'id' | 'full_name' | 'email' | 'phone'>[];
  paymentMethods: PaymentMethod[];
  categories: Pick<Category, 'id' | 'name'>[];
  products: Pick<Product, 'id' | 'name' | 'sku'>[];
  primaryCurrency: Currency | null;
}

const REPORTS: Array<{
  id: ReportType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'sales-by-day',
    label: 'Ventas por día',
    description: 'Ventas, descuentos, costos y utilidad agrupados por día.',
    icon: Calendar,
  },
  {
    id: 'by-vendor',
    label: 'Por vendedor',
    description: 'Ventas, utilidad y comisiones por vendedor.',
    icon: Users,
  },
  {
    id: 'by-product',
    label: 'Por producto',
    description: 'Productos más vendidos, cantidad, utilidad y margen.',
    icon: Package,
  },
  {
    id: 'by-category',
    label: 'Por categoría',
    description: 'Ventas y utilidad por categoría.',
    icon: Tag,
  },
  {
    id: 'by-currency',
    label: 'Por moneda',
    description: 'Volumen por moneda original y consolidado.',
    icon: Coins,
  },
  {
    id: 'by-payment',
    label: 'Por método de pago',
    description: 'Distribución de ventas por método de pago.',
    icon: CreditCard,
  },
];

// ============================================
// COMPONENTE
// ============================================
export function ReportesClient({
  currencies,
  vendors,
  customers,
  paymentMethods,
  categories,
  products,
  primaryCurrency,
}: Props) {
  const { showToast } = useToast();

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [reportType, setReportType] = useState<ReportType>('sales-by-day');
  const [filters, setFilters] = useState<ReportFilters>({
    from: firstOfMonth.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  });
  const [loading, setLoading] = useState(false);
  const [isExporting, startExportTransition] = useTransition();

  // Resultados
  const [salesByDayRows, setSalesByDayRows] = useState<SalesByDayRow[]>([]);
  const [vendorRows, setVendorRows] = useState<ByVendorRow[]>([]);
  const [productRows, setProductRows] = useState<ByProductRow[]>([]);
  const [categoryRows, setCategoryRows] = useState<ByCategoryRow[]>([]);
  const [currencyRows, setCurrencyRows] = useState<ByCurrencyRow[]>([]);
  const [paymentRows, setPaymentRows] = useState<ByPaymentRow[]>([]);

  const activeFiltersCount = Object.entries(filters).filter(
    ([, v]) => v !== undefined && v !== ''
  ).length;

  function clearFilters() {
    setFilters({});
  }

  function setFilter<K extends keyof ReportFilters>(
    key: K,
    value: ReportFilters[K]
  ) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  }

  async function runReport() {
    setLoading(true);
    try {
      switch (reportType) {
        case 'sales-by-day': {
          const res = await reportSalesByDay(filters);
          if (res.error) showToast(res.error, 'error');
          else setSalesByDayRows(res.rows ?? []);
          break;
        }
        case 'by-vendor': {
          const res = await reportByVendor(filters);
          if (res.error) showToast(res.error, 'error');
          else setVendorRows(res.rows ?? []);
          break;
        }
        case 'by-product': {
          const res = await reportByProduct(filters);
          if (res.error) showToast(res.error, 'error');
          else setProductRows(res.rows ?? []);
          break;
        }
        case 'by-category': {
          const res = await reportByCategory(filters);
          if (res.error) showToast(res.error, 'error');
          else setCategoryRows(res.rows ?? []);
          break;
        }
        case 'by-currency': {
          const res = await reportByCurrency(filters);
          if (res.error) showToast(res.error, 'error');
          else setCurrencyRows(res.rows ?? []);
          break;
        }
        case 'by-payment': {
          const res = await reportByPaymentMethod(filters);
          if (res.error) showToast(res.error, 'error');
          else setPaymentRows(res.rows ?? []);
          break;
        }
      }
    } finally {
      setLoading(false);
    }
  }

  function handleExport() {
    startExportTransition(async () => {
      let res: { fileBase64?: string; filename?: string; error?: string } = {};
      switch (reportType) {
        case 'sales-by-day':
          res = await exportSalesByDayExcel(filters);
          break;
        case 'by-vendor':
          res = await exportByVendorExcel(filters);
          break;
        case 'by-product':
          res = await exportByProductExcel(filters);
          break;
        case 'by-category':
          res = await exportByCategoryExcel(filters);
          break;
        case 'by-currency':
          res = await exportByCurrencyExcel(filters);
          break;
        case 'by-payment':
          res = await exportByPaymentMethodExcel(filters);
          break;
      }
      if (res.error) {
        showToast(res.error, 'error');
        return;
      }
      if (res.fileBase64 && res.filename) {
        downloadExcelFromBase64(res.fileBase64, res.filename);
        showToast('Reporte exportado', 'success');
      }
    });
  }

  // ============================================
  // KPIs calculados a partir del reporte activo
  // ============================================
  const kpis = useMemo(() => {
    if (reportType === 'sales-by-day') {
      return {
        total_sales: salesByDayRows.reduce((s, r) => s + r.sales_count, 0),
        total_net: salesByDayRows.reduce((s, r) => s + r.net_total, 0),
        total_profit: salesByDayRows.reduce((s, r) => s + r.profit_total, 0),
        total_cost: salesByDayRows.reduce((s, r) => s + r.cost_total, 0),
      };
    }
    if (reportType === 'by-vendor') {
      return {
        total_sales: vendorRows.reduce((s, r) => s + r.sales_count, 0),
        total_net: vendorRows.reduce((s, r) => s + r.base_total, 0),
        total_profit: vendorRows.reduce((s, r) => s + r.base_profit, 0),
        total_cost: vendorRows.reduce((s, r) => s + r.commission, 0),
      };
    }
    if (reportType === 'by-product') {
      return {
        total_sales: productRows.reduce((s, r) => s + r.quantity_sold, 0),
        total_net: productRows.reduce((s, r) => s + r.base_total, 0),
        total_profit: productRows.reduce((s, r) => s + r.base_profit, 0),
        total_cost: productRows.reduce((s, r) => s + r.base_cost, 0),
      };
    }
    if (reportType === 'by-category') {
      return {
        total_sales: categoryRows.reduce((s, r) => s + r.quantity_sold, 0),
        total_net: categoryRows.reduce((s, r) => s + r.base_total, 0),
        total_profit: categoryRows.reduce((s, r) => s + r.base_profit, 0),
        total_cost: 0,
      };
    }
    if (reportType === 'by-currency') {
      return {
        total_sales: currencyRows.reduce((s, r) => s + r.sales_count, 0),
        total_net: currencyRows.reduce((s, r) => s + r.base_total, 0),
        total_profit: 0,
        total_cost: 0,
      };
    }
    if (reportType === 'by-payment') {
      return {
        total_sales: paymentRows.reduce((s, r) => s + r.sales_count, 0),
        total_net: paymentRows.reduce((s, r) => s + r.base_total, 0),
        total_profit: 0,
        total_cost: 0,
      };
    }
    return { total_sales: 0, total_net: 0, total_profit: 0, total_cost: 0 };
  }, [
    reportType,
    salesByDayRows,
    vendorRows,
    productRows,
    categoryRows,
    currencyRows,
    paymentRows,
  ]);

  // ============================================
  // Columnas por reporte
  // ============================================
  const salesByDayColumns: Column<SalesByDayRow>[] = [
    { key: 'date', header: 'Fecha', render: (r) => <span className="font-mono text-sm">{r.date}</span> },
    { key: 'sales_count', header: 'Ventas', render: (r) => <span className="font-mono text-sm">{r.sales_count}</span> },
    { key: 'gross_total', header: 'Bruto', render: (r) => <span className="font-mono text-sm">{fmt(r.gross_total, primaryCurrency)}</span> },
    { key: 'discount_total', header: 'Descuentos', render: (r) => <span className="font-mono text-sm text-muted-foreground">{fmt(r.discount_total, primaryCurrency)}</span> },
    { key: 'net_total', header: 'Neto', render: (r) => <span className="font-mono text-sm font-semibold">{fmt(r.net_total, primaryCurrency)}</span> },
    { key: 'cost_total', header: 'Costo', render: (r) => <span className="font-mono text-sm text-muted-foreground">{fmt(r.cost_total, primaryCurrency)}</span> },
    { key: 'profit_total', header: 'Utilidad', render: (r) => <span className="font-mono text-sm text-emerald-600 font-semibold">{fmt(r.profit_total, primaryCurrency)}</span> },
    { key: 'margin_percent', header: 'Margen', render: (r) => <span className="font-mono text-sm">{r.margin_percent.toFixed(1)}%</span> },
  ];

  const vendorColumns: Column<ByVendorRow>[] = [
    { key: 'vendor_name', header: 'Vendedor', render: (r) => <span className="text-sm font-medium">{r.vendor_name}</span> },
    { key: 'sales_count', header: 'Ventas', render: (r) => <span className="font-mono text-sm">{r.sales_count}</span> },
    { key: 'base_total', header: 'Total base', render: (r) => <span className="font-mono text-sm font-semibold">{fmt(r.base_total, primaryCurrency)}</span> },
    { key: 'base_profit', header: 'Utilidad', render: (r) => <span className="font-mono text-sm text-emerald-600">{fmt(r.base_profit, primaryCurrency)}</span> },
    { key: 'commission', header: 'Comisión estimada', render: (r) => <span className="font-mono text-sm text-amber-600 font-semibold">{fmt(r.commission, primaryCurrency)}</span> },
  ];

  const productColumns: Column<ByProductRow>[] = [
    {
      key: 'product_name',
      header: 'Producto',
      render: (r) => (
        <div>
          <p className="text-sm font-medium">{r.product_name}</p>
          {r.sku && <p className="font-mono text-xs text-muted-foreground">{r.sku}</p>}
        </div>
      ),
    },
    { key: 'quantity_sold', header: 'Cantidad', render: (r) => <span className="font-mono text-sm">{r.quantity_sold.toFixed(2)}</span> },
    { key: 'base_total', header: 'Total base', render: (r) => <span className="font-mono text-sm font-semibold">{fmt(r.base_total, primaryCurrency)}</span> },
    { key: 'base_cost', header: 'Costo', render: (r) => <span className="font-mono text-sm text-muted-foreground">{fmt(r.base_cost, primaryCurrency)}</span> },
    { key: 'base_profit', header: 'Utilidad', render: (r) => <span className="font-mono text-sm text-emerald-600">{fmt(r.base_profit, primaryCurrency)}</span> },
    { key: 'margin_percent', header: 'Margen', render: (r) => <span className="font-mono text-sm">{r.margin_percent.toFixed(1)}%</span> },
  ];

  const categoryColumns: Column<ByCategoryRow>[] = [
    { key: 'category_name', header: 'Categoría', render: (r) => <span className="text-sm font-medium">{r.category_name}</span> },
    { key: 'quantity_sold', header: 'Cantidad', render: (r) => <span className="font-mono text-sm">{r.quantity_sold.toFixed(2)}</span> },
    { key: 'base_total', header: 'Total base', render: (r) => <span className="font-mono text-sm font-semibold">{fmt(r.base_total, primaryCurrency)}</span> },
    { key: 'base_profit', header: 'Utilidad', render: (r) => <span className="font-mono text-sm text-emerald-600">{fmt(r.base_profit, primaryCurrency)}</span> },
    { key: 'margin_percent', header: 'Margen', render: (r) => <span className="font-mono text-sm">{r.margin_percent.toFixed(1)}%</span> },
  ];

  const currencyColumns: Column<ByCurrencyRow>[] = [
    { key: 'currency_code', header: 'Moneda', render: (r) => <Badge tone="info">{r.currency_code}</Badge> },
    { key: 'sales_count', header: 'Ventas', render: (r) => <span className="font-mono text-sm">{r.sales_count}</span> },
    { key: 'total_original', header: 'Total original', render: (r) => <span className="font-mono text-sm">{r.total_original.toFixed(2)}</span> },
    { key: 'base_total', header: 'Consolidado', render: (r) => <span className="font-mono text-sm font-semibold">{fmt(r.base_total, primaryCurrency)}</span> },
  ];

  const paymentColumns: Column<ByPaymentRow>[] = [
    { key: 'payment_method_name', header: 'Método', render: (r) => <span className="text-sm font-medium">{r.payment_method_name}</span> },
    { key: 'sales_count', header: 'Ventas', render: (r) => <span className="font-mono text-sm">{r.sales_count}</span> },
    { key: 'base_total', header: 'Total base', render: (r) => <span className="font-mono text-sm font-semibold">{fmt(r.base_total, primaryCurrency)}</span> },
  ];

  const currentReport = REPORTS.find((r) => r.id === reportType);

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
          <p className="text-sm text-muted-foreground">
            Análisis del negocio con exportación a Excel.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={isExporting}
        >
          <Download className="h-4 w-4" />
          Exportar Excel
        </Button>
      </div>

      {/* Selector de reporte */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          const active = reportType === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setReportType(r.id)}
              className={`flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors ${
                active
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted'
              }`}
            >
              <div className={active ? 'text-primary' : 'text-muted-foreground'}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-sm font-medium">{r.label}</p>
            </button>
          );
        })}
      </div>

      {/* Descripción del reporte activo */}
      {currentReport && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          {currentReport.description}
        </div>
      )}

      {/* KPIs */}
      {(kpis.total_sales > 0 || kpis.total_net > 0) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Operaciones / Unidades"
            value={String(kpis.total_sales)}
            icon={<ShoppingCart className="h-4 w-4" />}
          />
          <KpiCard
            label="Total base"
            value={fmt(kpis.total_net, primaryCurrency)}
            icon={<DollarSign className="h-4 w-4" />}
            tone="success"
          />
          {kpis.total_cost > 0 && (
            <KpiCard
              label={reportType === 'by-vendor' ? 'Comisión estimada' : 'Costo'}
              value={fmt(kpis.total_cost, primaryCurrency)}
              icon={<TrendingUp className="h-4 w-4" />}
              tone="warning"
            />
          )}
          {kpis.total_profit > 0 && (
            <KpiCard
              label="Utilidad"
              value={fmt(kpis.total_profit, primaryCurrency)}
              icon={<TrendingUp className="h-4 w-4" />}
              tone="success"
            />
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="rounded-lg border bg-background p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Filter className="h-4 w-4" />
            Filtros
            {activeFiltersCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                {activeFiltersCount}
              </span>
            )}
          </h3>
          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              <X className="h-3 w-3" />
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Desde"
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => setFilter('from', e.target.value)}
          />
          <Input
            label="Hasta"
            type="date"
            value={filters.to ?? ''}
            onChange={(e) => setFilter('to', e.target.value)}
          />

          {/* Vendedor: aplica a todos excepto categoría y moneda */}
          {reportType !== 'by-category' && reportType !== 'by-currency' && (
            <Select
              label="Vendedor"
              value={filters.vendor_id ?? ''}
              onChange={(e) => setFilter('vendor_id', e.target.value)}
            >
              <option value="">Todos</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.profile?.full_name ?? v.code ?? v.id.slice(0, 8)}
                </option>
              ))}
            </Select>
          )}

          {/* Cliente: aplica a todos excepto categoría y moneda */}
          {reportType !== 'by-category' && reportType !== 'by-currency' && (
            <Select
              label="Cliente"
              value={filters.customer_id ?? ''}
              onChange={(e) => setFilter('customer_id', e.target.value)}
            >
              <option value="">Todos</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </Select>
          )}

          {/* Moneda: aplica a todos excepto el propio reporte por moneda */}
          {reportType !== 'by-currency' && (
            <Select
              label="Moneda"
              value={filters.currency_id ?? ''}
              onChange={(e) => setFilter('currency_id', e.target.value)}
            >
              <option value="">Todas</option>
              {currencies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          )}

          {/* Método de pago */}
          {reportType !== 'by-payment' &&
            reportType !== 'by-currency' && (
              <Select
                label="Método de pago"
                value={filters.payment_method_id ?? ''}
                onChange={(e) => setFilter('payment_method_id', e.target.value)}
              >
                <option value="">Todos</option>
                {paymentMethods.map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.name}
                  </option>
                ))}
              </Select>
            )}

          {/* Categoría: solo aplica al reporte por producto */}
          {reportType === 'by-product' && (
            <Select
              label="Categoría"
              value={filters.category_id ?? ''}
              onChange={(e) => setFilter('category_id', e.target.value)}
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}

          {/* Producto: solo aplica al reporte por producto */}
          {reportType === 'by-product' && (
            <Select
              label="Producto"
              value={filters.product_id ?? ''}
              onChange={(e) => setFilter('product_id', e.target.value)}
            >
              <option value="">Todos</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.sku ? `(${p.sku})` : ''}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={runReport} loading={loading}>
            <BarChart3 className="h-4 w-4" />
            Generar reporte
          </Button>
        </div>
      </div>

      {/* Resultados */}
      <div className="rounded-lg border bg-background">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            {currentReport?.label ?? 'Reporte'}
          </h2>
        </div>
        {reportType === 'sales-by-day' &&
          (salesByDayRows.length === 0 ? (
            <EmptyReport onRun={runReport} />
          ) : (
            <DataTable
              columns={salesByDayColumns}
              rows={salesByDayRows}
              rowKey={(r) => r.date}
            />
          ))}
        {reportType === 'by-vendor' &&
          (vendorRows.length === 0 ? (
            <EmptyReport onRun={runReport} />
          ) : (
            <DataTable
              columns={vendorColumns}
              rows={vendorRows}
              rowKey={(r) => r.vendor_id ?? 'none'}
            />
          ))}
        {reportType === 'by-product' &&
          (productRows.length === 0 ? (
            <EmptyReport onRun={runReport} />
          ) : (
            <DataTable
              columns={productColumns}
              rows={productRows}
              rowKey={(r) => r.product_id}
            />
          ))}
        {reportType === 'by-category' &&
          (categoryRows.length === 0 ? (
            <EmptyReport onRun={runReport} />
          ) : (
            <DataTable
              columns={categoryColumns}
              rows={categoryRows}
              rowKey={(r) => r.category_id ?? 'none'}
            />
          ))}
        {reportType === 'by-currency' &&
          (currencyRows.length === 0 ? (
            <EmptyReport onRun={runReport} />
          ) : (
            <DataTable
              columns={currencyColumns}
              rows={currencyRows}
              rowKey={(r) => r.currency_id}
            />
          ))}
        {reportType === 'by-payment' &&
          (paymentRows.length === 0 ? (
            <EmptyReport onRun={runReport} />
          ) : (
            <DataTable
              columns={paymentColumns}
              rows={paymentRows}
              rowKey={(r) => r.payment_method_id ?? 'none'}
            />
          ))}
      </div>
    </div>
  );
}

// ============================================
// AUXILIARES
// ============================================
function fmt(v: number, currency: Currency | null): string {
  if (!currency) return Number(v).toFixed(2);
  return formatCurrency(Number(v), currency);
}

function EmptyReport({ onRun }: { onRun: () => void }) {
  return (
    <EmptyState
      title="Sin datos"
      description="Ajusta los filtros y pulsa 'Generar reporte'."
      icon={<BarChart3 className="h-8 w-8" />}
      action={
        <Button onClick={onRun}>
          <BarChart3 className="h-4 w-4" />
          Generar reporte
        </Button>
      }
    />
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: 'default' | 'success' | 'warning';
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-emerald-50 text-emerald-600'
      : tone === 'warning'
      ? 'bg-amber-50 text-amber-600'
      : 'bg-primary/10 text-primary';
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-semibold">{value}</p>
        </div>
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-md ${toneClass}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

// ============================================
// DESCARGA DEL EXCEL (decodifica base64)
// ============================================
function downloadExcelFromBase64(base64: string, filename: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}