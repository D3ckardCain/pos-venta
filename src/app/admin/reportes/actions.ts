'use server';

import { createClient } from '@/lib/supabase/server';

// ============================================
// TIPOS
// ============================================
export interface ReportFilters {
  from?: string;
  to?: string;
  vendor_id?: string;
  customer_id?: string;
  currency_id?: string;
  payment_method_id?: string;
  category_id?: string;
  product_id?: string;
}

export interface SalesByDayRow {
  date: string;
  sales_count: number;
  gross_total: number;
  discount_total: number;
  net_total: number;
  cost_total: number;
  profit_total: number;
  margin_percent: number;
}

export interface ByVendorRow {
  vendor_id: string | null;
  vendor_name: string;
  sales_count: number;
  base_total: number;
  base_profit: number;
  commission: number;
}

export interface ByProductRow {
  product_id: string;
  product_name: string;
  sku: string | null;
  quantity_sold: number;
  base_total: number;
  base_cost: number;
  base_profit: number;
  margin_percent: number;
}

export interface ByCategoryRow {
  category_id: string | null;
  category_name: string;
  quantity_sold: number;
  base_total: number;
  base_profit: number;
  margin_percent: number;
}

export interface ByCurrencyRow {
  currency_id: string;
  currency_code: string;
  sales_count: number;
  total_original: number;
  base_total: number;
}

export interface ByPaymentRow {
  payment_method_id: string | null;
  payment_method_name: string;
  sales_count: number;
  base_total: number;
}

// ============================================
// HELPERS DE FILTROS
// ============================================

function applySaleFilters<T extends { gte: Function; lte: Function; eq: Function }>(
  query: T,
  filters: ReportFilters
): T {
  let q = query;
  if (filters.from) q = q.gte('created_at', filters.from) as T;
  if (filters.to) q = q.lte('created_at', filters.to) as T;
  if (filters.vendor_id) q = q.eq('vendor_id', filters.vendor_id) as T;
  if (filters.customer_id) q = q.eq('customer_id', filters.customer_id) as T;
  if (filters.currency_id) q = q.eq('currency_id', filters.currency_id) as T;
  if (filters.payment_method_id)
    q = q.eq('payment_method_id', filters.payment_method_id) as T;
  return q;
}

// ============================================
// 1) VENTAS POR DÍA
// ============================================
export async function reportSalesByDay(filters: ReportFilters): Promise<{
  rows?: SalesByDayRow[];
  error?: string;
}> {
  const supabase = await createClient();

  let query = supabase
    .from('sales')
    .select(
      'created_at, base_subtotal, base_discount_amount, base_total, base_cost, base_profit'
    )
    .eq('status', 'completada')
    .order('created_at', { ascending: true });

  query = applySaleFilters(query, filters) as typeof query;

  const { data, error } = await query;
  if (error) return { error: error.message };

  const grouped = new Map<string, SalesByDayRow>();
  for (const s of data ?? []) {
    const day = new Date(s.created_at).toISOString().slice(0, 10);
    const row = grouped.get(day) ?? {
      date: day,
      sales_count: 0,
      gross_total: 0,
      discount_total: 0,
      net_total: 0,
      cost_total: 0,
      profit_total: 0,
      margin_percent: 0,
    };
    row.sales_count += 1;
    row.gross_total += Number(s.base_subtotal);
    row.discount_total += Number(s.base_discount_amount);
    row.net_total += Number(s.base_total);
    row.cost_total += Number(s.base_cost);
    row.profit_total += Number(s.base_profit);
    grouped.set(day, row);
  }

  const rows = Array.from(grouped.values()).map((r) => ({
    ...r,
    margin_percent: r.net_total > 0 ? (r.profit_total / r.net_total) * 100 : 0,
  }));

  return { rows };
}

export async function exportSalesByDayExcel(filters: ReportFilters): Promise<{
  fileBase64?: string;
  filename?: string;
  error?: string;
}> {
  const { rows, error } = await reportSalesByDay(filters);
  if (error || !rows) return { error };

  const totals = {
    date: 'TOTALES',
    sales_count: rows.reduce((s, r) => s + r.sales_count, 0),
    gross_total: rows.reduce((s, r) => s + r.gross_total, 0),
    discount_total: rows.reduce((s, r) => s + r.discount_total, 0),
    net_total: rows.reduce((s, r) => s + r.net_total, 0),
    cost_total: rows.reduce((s, r) => s + r.cost_total, 0),
    profit_total: rows.reduce((s, r) => s + r.profit_total, 0),
  };

  const { buildExcelWorkbook, workbookToBuffer } = await import(
    '@/lib/utils/excel'
  );

  const wb = buildExcelWorkbook({
    name: 'Ventas por día',
    columns: [
      { header: 'Fecha', key: 'date', type: 'date', width: 14 },
      { header: 'Ventas', key: 'sales_count', type: 'number', width: 12 },
      { header: 'Bruto', key: 'gross_total', type: 'currency', width: 16 },
      { header: 'Descuentos', key: 'discount_total', type: 'currency', width: 16 },
      { header: 'Neto', key: 'net_total', type: 'currency', width: 16 },
      { header: 'Costo', key: 'cost_total', type: 'currency', width: 16 },
      { header: 'Utilidad', key: 'profit_total', type: 'currency', width: 16 },
      { header: 'Margen %', key: 'margin_percent', type: 'percent', width: 12 },
    ],
    rows,
    totals,
  });

  const buffer = await workbookToBuffer(wb);
  return {
    fileBase64: Buffer.from(buffer).toString('base64'),
    filename: `reporte-ventas-por-dia-${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}

// ============================================
// 2) POR VENDEDOR
// ============================================
export async function reportByVendor(filters: ReportFilters): Promise<{
  rows?: ByVendorRow[];
  error?: string;
}> {
  const supabase = await createClient();

  let query = supabase
    .from('sales')
    .select(
      `base_total, base_profit, vendor_id,
       vendor:vendors(id, code, commission_rate, profile:profiles!profile_id(full_name))`
    )
    .eq('status', 'completada');

  query = applySaleFilters(query, filters) as typeof query;

  const { data, error } = await query;
  if (error) return { error: error.message };

  const grouped = new Map<string, ByVendorRow>();
  for (const s of data ?? []) {
    const v = (s as unknown as {
      vendor?: {
        id: string;
        code: string | null;
        commission_rate: number;
        profile?: { full_name: string } | null;
      } | null;
    }).vendor;
    const key = v?.id ?? 'sin-vendedor';
    const name = v?.profile?.full_name ?? v?.code ?? 'Sin vendedor';
    const commissionRate = Number(v?.commission_rate ?? 0);
    const row = grouped.get(key) ?? {
      vendor_id: v?.id ?? null,
      vendor_name: name,
      sales_count: 0,
      base_total: 0,
      base_profit: 0,
      commission: 0,
    };
    row.sales_count += 1;
    row.base_total += Number(s.base_total);
    row.base_profit += Number(s.base_profit);
    row.commission += (Number(s.base_total) * commissionRate) / 100;
    grouped.set(key, row);
  }

  const rows = Array.from(grouped.values()).sort(
    (a, b) => b.base_total - a.base_total
  );
  return { rows };
}

export async function exportByVendorExcel(filters: ReportFilters): Promise<{
  fileBase64?: string;
  filename?: string;
  error?: string;
}> {
  const { rows, error } = await reportByVendor(filters);
  if (error || !rows) return { error };

  const totals = {
    vendor_name: 'TOTALES',
    sales_count: rows.reduce((s, r) => s + r.sales_count, 0),
    base_total: rows.reduce((s, r) => s + r.base_total, 0),
    base_profit: rows.reduce((s, r) => s + r.base_profit, 0),
    commission: rows.reduce((s, r) => s + r.commission, 0),
  };

  const { buildExcelWorkbook, workbookToBuffer } = await import(
    '@/lib/utils/excel'
  );

  const wb = buildExcelWorkbook({
    name: 'Por vendedor',
    columns: [
      { header: 'Vendedor', key: 'vendor_name', width: 26 },
      { header: 'Ventas', key: 'sales_count', type: 'number', width: 12 },
      { header: 'Total base', key: 'base_total', type: 'currency', width: 18 },
      { header: 'Utilidad', key: 'base_profit', type: 'currency', width: 18 },
      { header: 'Comisión', key: 'commission', type: 'currency', width: 18 },
    ],
    rows,
    totals,
  });

  const buffer = await workbookToBuffer(wb);
  return {
    fileBase64: Buffer.from(buffer).toString('base64'),
    filename: `reporte-por-vendedor-${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}

// ============================================
// 3) POR PRODUCTO
// ============================================
export async function reportByProduct(filters: ReportFilters): Promise<{
  rows?: ByProductRow[];
  error?: string;
}> {
  const supabase = await createClient();

  let query = supabase
    .from('sale_items')
    .select(
      `quantity, unit_cost, base_total, product_id,
       product:products(id, name, sku, category_id),
       sale:sales!inner(created_at, status, vendor_id, customer_id, currency_id, payment_method_id)`
    )
    .eq('sale.status', 'completada');

  if (filters.from) query = query.gte('sale.created_at', filters.from);
  if (filters.to) query = query.lte('sale.created_at', filters.to);
  if (filters.vendor_id) query = query.eq('sale.vendor_id', filters.vendor_id);
  if (filters.customer_id)
    query = query.eq('sale.customer_id', filters.customer_id);
  if (filters.currency_id)
    query = query.eq('sale.currency_id', filters.currency_id);
  if (filters.payment_method_id)
    query = query.eq('sale.payment_method_id', filters.payment_method_id);
  if (filters.product_id) query = query.eq('product_id', filters.product_id);
  if (filters.category_id)
    query = query.eq('product.category_id', filters.category_id);

  const { data, error } = await query;
  if (error) return { error: error.message };

  const grouped = new Map<string, ByProductRow>();
  for (const item of data ?? []) {
    const p = (item as unknown as {
      product?: { id: string; name: string; sku: string | null } | null;
    }).product;
    if (!p) continue;

    const qty = Number(item.quantity);
    const total = Number(item.base_total);
    const cost = qty * Number(item.unit_cost);

    const row = grouped.get(p.id) ?? {
      product_id: p.id,
      product_name: p.name,
      sku: p.sku,
      quantity_sold: 0,
      base_total: 0,
      base_cost: 0,
      base_profit: 0,
      margin_percent: 0,
    };
    row.quantity_sold += qty;
    row.base_total += total;
    row.base_cost += cost;
    row.base_profit += total - cost;
    grouped.set(p.id, row);
  }

  const rows = Array.from(grouped.values())
    .map((r) => ({
      ...r,
      margin_percent: r.base_total > 0 ? (r.base_profit / r.base_total) * 100 : 0,
    }))
    .sort((a, b) => b.base_total - a.base_total);

  return { rows };
}

export async function exportByProductExcel(filters: ReportFilters): Promise<{
  fileBase64?: string;
  filename?: string;
  error?: string;
}> {
  const { rows, error } = await reportByProduct(filters);
  if (error || !rows) return { error };

  const totals = {
    product_name: 'TOTALES',
    quantity_sold: rows.reduce((s, r) => s + r.quantity_sold, 0),
    base_total: rows.reduce((s, r) => s + r.base_total, 0),
    base_cost: rows.reduce((s, r) => s + r.base_cost, 0),
    base_profit: rows.reduce((s, r) => s + r.base_profit, 0),
  };

  const { buildExcelWorkbook, workbookToBuffer } = await import(
    '@/lib/utils/excel'
  );

  const wb = buildExcelWorkbook({
    name: 'Por producto',
    columns: [
      { header: 'Producto', key: 'product_name', width: 32 },
      { header: 'SKU', key: 'sku', width: 16 },
      { header: 'Cantidad', key: 'quantity_sold', type: 'number', width: 14 },
      { header: 'Total base', key: 'base_total', type: 'currency', width: 18 },
      { header: 'Costo', key: 'base_cost', type: 'currency', width: 18 },
      { header: 'Utilidad', key: 'base_profit', type: 'currency', width: 18 },
      { header: 'Margen %', key: 'margin_percent', type: 'percent', width: 12 },
    ],
    rows,
    totals,
  });

  const buffer = await workbookToBuffer(wb);
  return {
    fileBase64: Buffer.from(buffer).toString('base64'),
    filename: `reporte-por-producto-${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}

// ============================================
// 4) POR CATEGORÍA
// ============================================
export async function reportByCategory(filters: ReportFilters): Promise<{
  rows?: ByCategoryRow[];
  error?: string;
}> {
  const supabase = await createClient();

  let query = supabase
    .from('sale_items')
    .select(
      `quantity, unit_cost, base_total,
       product:products(id, category_id, category:categories(id, name)),
       sale:sales!inner(created_at, status, vendor_id, customer_id, currency_id, payment_method_id)`
    )
    .eq('sale.status', 'completada');

  if (filters.from) query = query.gte('sale.created_at', filters.from);
  if (filters.to) query = query.lte('sale.created_at', filters.to);
  if (filters.vendor_id) query = query.eq('sale.vendor_id', filters.vendor_id);
  if (filters.customer_id)
    query = query.eq('sale.customer_id', filters.customer_id);
  if (filters.currency_id)
    query = query.eq('sale.currency_id', filters.currency_id);
  if (filters.payment_method_id)
    query = query.eq('sale.payment_method_id', filters.payment_method_id);

  const { data, error } = await query;
  if (error) return { error: error.message };

  const grouped = new Map<string, ByCategoryRow>();
  for (const item of data ?? []) {
    const p = (item as unknown as {
      product?: {
        category_id: string | null;
        category?: { id: string; name: string } | null;
      } | null;
    }).product;
    const cat = p?.category;
    const key = cat?.id ?? 'sin-categoria';
    const name = cat?.name ?? 'Sin categoría';

    const qty = Number(item.quantity);
    const total = Number(item.base_total);
    const cost = qty * Number(item.unit_cost);

    const row = grouped.get(key) ?? {
      category_id: cat?.id ?? null,
      category_name: name,
      quantity_sold: 0,
      base_total: 0,
      base_profit: 0,
      margin_percent: 0,
    };
    row.quantity_sold += qty;
    row.base_total += total;
    row.base_profit += total - cost;
    grouped.set(key, row);
  }

  const rows = Array.from(grouped.values())
    .map((r) => ({
      ...r,
      margin_percent: r.base_total > 0 ? (r.base_profit / r.base_total) * 100 : 0,
    }))
    .sort((a, b) => b.base_total - a.base_total);

  return { rows };
}

export async function exportByCategoryExcel(filters: ReportFilters): Promise<{
  fileBase64?: string;
  filename?: string;
  error?: string;
}> {
  const { rows, error } = await reportByCategory(filters);
  if (error || !rows) return { error };

  const totals = {
    category_name: 'TOTALES',
    quantity_sold: rows.reduce((s, r) => s + r.quantity_sold, 0),
    base_total: rows.reduce((s, r) => s + r.base_total, 0),
    base_profit: rows.reduce((s, r) => s + r.base_profit, 0),
  };

  const { buildExcelWorkbook, workbookToBuffer } = await import(
    '@/lib/utils/excel'
  );

  const wb = buildExcelWorkbook({
    name: 'Por categoría',
    columns: [
      { header: 'Categoría', key: 'category_name', width: 28 },
      { header: 'Cantidad', key: 'quantity_sold', type: 'number', width: 14 },
      { header: 'Total base', key: 'base_total', type: 'currency', width: 18 },
      { header: 'Utilidad', key: 'base_profit', type: 'currency', width: 18 },
      { header: 'Margen %', key: 'margin_percent', type: 'percent', width: 12 },
    ],
    rows,
    totals,
  });

  const buffer = await workbookToBuffer(wb);
  return {
    fileBase64: Buffer.from(buffer).toString('base64'),
    filename: `reporte-por-categoria-${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}

// ============================================
// 5) POR MONEDA
// ============================================
export async function reportByCurrency(filters: ReportFilters): Promise<{
  rows?: ByCurrencyRow[];
  error?: string;
}> {
  const supabase = await createClient();

  let query = supabase
    .from('sales')
    .select('total, base_total, currency_id, currency:currencies!currency_id(code)')
    .eq('status', 'completada');

  query = applySaleFilters(query, filters) as typeof query;

  const { data, error } = await query;
  if (error) return { error: error.message };

  const grouped = new Map<string, ByCurrencyRow>();
  for (const s of data ?? []) {
    const c = (s as unknown as { currency?: { code: string } | null }).currency;
    const key = s.currency_id;
    const row = grouped.get(key) ?? {
      currency_id: key,
      currency_code: c?.code ?? '—',
      sales_count: 0,
      total_original: 0,
      base_total: 0,
    };
    row.sales_count += 1;
    row.total_original += Number(s.total);
    row.base_total += Number(s.base_total);
    grouped.set(key, row);
  }

  const rows = Array.from(grouped.values()).sort(
    (a, b) => b.base_total - a.base_total
  );
  return { rows };
}

export async function exportByCurrencyExcel(filters: ReportFilters): Promise<{
  fileBase64?: string;
  filename?: string;
  error?: string;
}> {
  const { rows, error } = await reportByCurrency(filters);
  if (error || !rows) return { error };

  const totals = {
    currency_code: 'TOTALES',
    sales_count: rows.reduce((s, r) => s + r.sales_count, 0),
    total_original: rows.reduce((s, r) => s + r.total_original, 0),
    base_total: rows.reduce((s, r) => s + r.base_total, 0),
  };

  const { buildExcelWorkbook, workbookToBuffer } = await import(
    '@/lib/utils/excel'
  );

  const wb = buildExcelWorkbook({
    name: 'Por moneda',
    columns: [
      { header: 'Moneda', key: 'currency_code', width: 12 },
      { header: 'Ventas', key: 'sales_count', type: 'number', width: 12 },
      { header: 'Total original', key: 'total_original', type: 'currency', width: 18 },
      { header: 'Consolidado', key: 'base_total', type: 'currency', width: 18 },
    ],
    rows,
    totals,
  });

  const buffer = await workbookToBuffer(wb);
  return {
    fileBase64: Buffer.from(buffer).toString('base64'),
    filename: `reporte-por-moneda-${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}

// ============================================
// 6) POR MÉTODO DE PAGO
// ============================================
export async function reportByPaymentMethod(filters: ReportFilters): Promise<{
  rows?: ByPaymentRow[];
  error?: string;
}> {
  const supabase = await createClient();

  let query = supabase
    .from('sales')
    .select(
      'base_total, payment_method_id, payment_method:payment_methods(id, name)'
    )
    .eq('status', 'completada');

  query = applySaleFilters(query, filters) as typeof query;

  const { data, error } = await query;
  if (error) return { error: error.message };

  const grouped = new Map<string, ByPaymentRow>();
  for (const s of data ?? []) {
    const pm = (s as unknown as {
      payment_method?: { id: string; name: string } | null;
    }).payment_method;
    const key = pm?.id ?? 'sin-metodo';
    const row = grouped.get(key) ?? {
      payment_method_id: pm?.id ?? null,
      payment_method_name: pm?.name ?? 'Sin método',
      sales_count: 0,
      base_total: 0,
    };
    row.sales_count += 1;
    row.base_total += Number(s.base_total);
    grouped.set(key, row);
  }

  const rows = Array.from(grouped.values()).sort(
    (a, b) => b.base_total - a.base_total
  );
  return { rows };
}

export async function exportByPaymentMethodExcel(filters: ReportFilters): Promise<{
  fileBase64?: string;
  filename?: string;
  error?: string;
}> {
  const { rows, error } = await reportByPaymentMethod(filters);
  if (error || !rows) return { error };

  const totals = {
    payment_method_name: 'TOTALES',
    sales_count: rows.reduce((s, r) => s + r.sales_count, 0),
    base_total: rows.reduce((s, r) => s + r.base_total, 0),
  };

  const { buildExcelWorkbook, workbookToBuffer } = await import(
    '@/lib/utils/excel'
  );

  const wb = buildExcelWorkbook({
    name: 'Por método de pago',
    columns: [
      { header: 'Método', key: 'payment_method_name', width: 24 },
      { header: 'Ventas', key: 'sales_count', type: 'number', width: 12 },
      { header: 'Total base', key: 'base_total', type: 'currency', width: 18 },
    ],
    rows,
    totals,
  });

  const buffer = await workbookToBuffer(wb);
  return {
    fileBase64: Buffer.from(buffer).toString('base64'),
    filename: `reporte-por-metodo-pago-${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}