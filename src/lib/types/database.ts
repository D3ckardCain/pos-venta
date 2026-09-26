// ============================================
// TIPOS BASE DE BASE DE DATOS
// ============================================

export type UserRole = 'admin' | 'vendedor' | 'cliente';

export interface Role {
  id: string;
  name: UserRole;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  role_id: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
  role?: Role;
}

export interface SystemSetting {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  decimal_separator: string;
  thousand_separator: string;
  symbol_position: 'before' | 'after';
  is_active: boolean;
  usable_in_sales: boolean;
  usable_in_purchases: boolean;
  usable_in_cash: boolean;
  usable_in_catalog: boolean;
  usable_by_customers: boolean;
  usable_by_vendors: boolean;
  created_at: string;
  updated_at: string;
}

export interface CurrencySetting {
  id: string;
  primary_currency_id: string;
  is_singleton: boolean;
  auto_convert_catalog: boolean;
  show_currency_selector: boolean;
  created_at: string;
  updated_at: string;
  primary_currency?: Currency;
}

export interface ExchangeRate {
  id: string;
  from_currency_id: string;
  to_currency_id: string;
  rate: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  source: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  from_currency?: Currency;
  to_currency?: Currency;
}

export interface ExchangeRateHistory {
  id: string;
  exchange_rate_id: string | null;
  from_currency_id: string;
  to_currency_id: string;
  old_rate: number | null;
  new_rate: number;
  changed_by: string | null;
  reason: string | null;
  changed_at: string;
  from_currency?: Currency;
  to_currency?: Currency;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  was_active_before_parent_disable: boolean | null;
  created_at: string;
  updated_at: string;
  parent?: Pick<Category, 'id' | 'name' | 'slug'> | null;
  children?: Pick<Category, 'id' | 'name' | 'slug'>[];
}

export interface Product {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  brand: string | null;
  unit: string;
  cost: number;
  base_price: number;
  min_stock: number;
  has_variants: boolean;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
  category?: Pick<Category, 'id' | 'name' | 'slug'> | null;
  images?: ProductImage[];
  variants?: ProductVariant[];
  prices_by_currency?: PriceByCurrency[];
}

export interface ProductImage {
  id: string;
  product_id: string;
  variant_id: string | null;
  url: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string | null;
  name: string;
  attributes: Record<string, string>;
  base_price: number | null;
  cost: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PriceByCurrency {
  id: string;
  product_id: string;
  variant_id: string | null;
  currency_id: string;
  price: number;
  min_quantity: number;
  created_at: string;
  updated_at: string;
  currency?: Currency;
}

export interface PaymentMethod {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  requires_reference: boolean;
  sort_order: number;
  created_at: string;
}

export interface CashRegister {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
}

export type CashSessionStatus = 'abierta' | 'pendiente_cierre' | 'cerrada';

export interface CashSession {
  id: string;
  cash_register_id: string | null;
  currency_id: string | null;
  opened_by: string;
  opened_by_user_id: string | null;
  closed_by: string | null;
  opening_amount: number;
  closing_amount: number | null;
  expected_amount: number | null;
  difference: number | null;
  status: CashSessionStatus;
  is_auto_opened: boolean;
  cutoff_at: string | null;
  expected_amounts: Record<string, Record<string, number>> | null;
  counted_amounts: Record<string, Record<string, number>> | null;
  differences: Record<string, Record<string, number>> | null;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
  updated_at: string;
  _pending_difference?: number;
  cash_register?: CashRegister | null;
  currency?: Currency | null;
  opened_by_user?: { id: string; full_name: string | null; email: string } | null;
  closed_by_user?: { id: string; full_name: string | null; email: string } | null;
  movements?: CashMovement[];
}

export interface CashMovement {
  id: string;
  cash_session_id: string;
  movement_type:
    | 'apertura'
    | 'cierre'
    | 'entrada'
    | 'salida'
    | 'retiro'
    | 'deposito'
    | 'ajuste'
    | 'venta'
    | 'devolucion';
  currency_id: string;
  amount: number;
  balance_after: number;
  payment_method_id: string | null;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
  currency?: Currency;
  payment_method?: { id: string; name: string; code: string } | null;
  user?: { id: string; full_name: string | null; email: string } | null;
}

export interface Customer {
  id: string;
  profile_id: string | null;
  code: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  total_purchases: number;
  total_orders: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  points?: CustomerPoints | null;
}

export interface CustomerPoints {
  id: string;
  customer_id: string;
  points: number;
  lifetime_points: number;
  updated_at: string;
}

export interface Vendor {
  id: string;
  profile_id: string;
  code: string | null;
  type: VendorType;
  commission_mode: CommissionMode;
  commission_rate: number;
  delivery_fixed_fee: number;
  delivery_commission_rate: number;
  pending_commission: number;
  total_sales: number;
  total_commission: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  profile?: Pick<Profile, 'id' | 'email' | 'full_name' | 'phone' | 'avatar_url'>;
}

export type SaleStatus = 'completada' | 'cancelada' | 'devuelta' | 'pendiente';

export interface Sale {
  id: string;
  sale_number: string;
  customer_id: string | null;
  vendor_id: string | null;
  status: SaleStatus;
  currency_id: string;
  exchange_rate_id: string | null;
  exchange_rate_value: number;
  base_currency_id: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  base_subtotal: number;
  base_tax_amount: number;
  base_discount_amount: number;
  base_total: number;
  base_cost: number;
  base_profit: number;
  payment_method_id: string | null;
  cash_register_id: string | null;
  notes: string | null;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  customer?: {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
  } | null;
  vendor?: {
    id: string;
    code: string | null;
    profile?: { id: string; full_name: string | null; email: string } | null;
  } | null;
  currency?: Currency;
  base_currency?: Currency;
  exchange_rate?: ExchangeRate | null;
  payment_method?: { id: string; name: string; code: string } | null;
  cash_register?: { id: string; name: string; code: string | null } | null;
  items?: SaleItem[];
  created_by_user?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  variant_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount_amount: number;
  subtotal: number;
  total: number;
  base_unit_price: number;
  base_total: number;
  created_at: string;
  product?: Pick<Product, 'id' | 'name' | 'sku' | 'unit'> | null;
  variant?: Pick<ProductVariant, 'id' | 'name' | 'sku'> | null;
}

export interface Inventory {
  id: string;
  product_id: string;
  variant_id: string | null;
  stock: number;
  reserved: number;
  available: number;
  updated_at: string;
  product?: Pick<
    Product,
    | 'id'
    | 'name'
    | 'sku'
    | 'slug'
    | 'unit'
    | 'min_stock'
    | 'cost'
    | 'base_price'
    | 'category_id'
    | 'is_active'
  > | null;
  variant?: Pick<ProductVariant, 'id' | 'name' | 'sku'> | null;
  category?: Pick<Category, 'id' | 'name'> | null;
}

export type MovementType =
  | 'entrada'
  | 'salida'
  | 'ajuste'
  | 'devolucion'
  | 'cancelacion'
  | 'reserva'
  | 'liberacion_reserva'
  | 'transferencia';

export interface InventoryMovement {
  id: string;
  product_id: string;
  variant_id: string | null;
  movement_type: MovementType;
  quantity: number;
  stock_before: number;
  stock_after: number;
  unit_cost: number | null;
  reference_type: string | null;
  reference_id: string | null;
  reason: string | null;
  notes: string | null;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string;
  product?: Pick<Product, 'id' | 'name' | 'sku'>;
  variant?: Pick<ProductVariant, 'id' | 'name' | 'sku'> | null;
  user?: { id: string; full_name: string | null; email: string } | null;
}

export interface InventoryReservation {
  id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  reference_type: string;
  reference_id: string;
  status: 'activa' | 'confirmada' | 'liberada' | 'expirada';
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  product?: Pick<Product, 'id' | 'name' | 'sku'>;
  variant?: Pick<ProductVariant, 'id' | 'name' | 'sku'> | null;
}

export interface ParkedSaleItem {
  product_id: string;
  variant_id: string | null;
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount_amount: number;
  stock_available: number;
}

export interface ParkedSale {
  id: string;
  name: string;
  customer_id: string | null;
  vendor_id: string | null;
  currency_id: string;
  payment_method_id: string | null;
  cash_register_id: string | null;
  items: ParkedSaleItem[];
  discount_amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer?: { id: string; full_name: string } | null;
  vendor?: {
    id: string;
    code: string | null;
    profile?: { id: string; full_name: string | null } | null;
  } | null;
  currency?: Currency;
  created_by_user?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}
export type OrderStatus =
  | 'pendiente'
  | 'confirmado'
  | 'preparando'
  | 'enviado'
  | 'entregado'
  | 'cancelado'
  | 'devuelto';

export interface Order {
  id: string;
  order_number: string;
  customer_id: string | null;
  vendor_id: string | null;
  status: OrderStatus;

  currency_id: string;
  exchange_rate_id: string | null;
  exchange_rate_value: number;
  base_currency_id: string;

  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;

  base_subtotal: number;
  base_tax_amount: number;
  base_discount_amount: number;
  base_total: number;

  delivery_address: string | null;
  delivery_notes: string | null;
  notes: string | null;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;

  customer?: {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
  } | null;
  vendor?: {
    id: string;
    code: string | null;
    profile?: { id: string; full_name: string | null; email: string } | null;
  } | null;
  currency?: Currency;
  base_currency?: Currency;
  exchange_rate?: ExchangeRate | null;
  items?: OrderItem[];
  status_history?: OrderStatusHistory[];
  created_by_user?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
  reservations?: InventoryReservation[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  subtotal: number;
  total: number;
  base_unit_price: number;
  base_total: number;
  created_at: string;
  product?: Pick<Product, 'id' | 'name' | 'sku' | 'unit'> | null;
  variant?: Pick<ProductVariant, 'id' | 'name' | 'sku'> | null;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  old_status: OrderStatus | null;
  new_status: OrderStatus;
  changed_by: string | null;
  notes: string | null;
  created_at: string;
  user?: { id: string; full_name: string | null; email: string } | null;
}
// ====================================================
// PAGOS A VENDEDORES Y MENSAJEROS
// ====================================================
export type VendorType = 'vendedor' | 'mensajero' | 'ambos';
export type CommissionMode = 'total' | 'profit';
export type VendorPaymentMethod = 'efectivo' | 'transferencia' | 'otro';
export type VendorPaymentItemType = 'sale_commission' | 'delivery_fee';

export interface VendorPayment {
  id: string;
  vendor_id: string;
  amount_base: number;
  base_currency_id: string;
  amount_paid: number;
  paid_currency_id: string;
  exchange_rate_value: number;
  payment_method: VendorPaymentMethod;
  notes: string | null;
  paid_by: string | null;
  paid_at: string;
  created_at: string;
  vendor?: Pick<Vendor, 'id' | 'code' | 'type'> & {
    profile?: Pick<Profile, 'id' | 'full_name' | 'email'>;
  };
  base_currency?: Currency;
  paid_currency?: Currency;
  paid_by_user?: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
  items?: VendorPaymentItem[];
}

export interface VendorPaymentItem {
  id: string;
  payment_id: string;
  vendor_id: string;
  item_type: VendorPaymentItemType;
  reference_type: string;
  reference_id: string | null;
  amount: number;
  base_amount: number;
  description: string | null;
  created_at: string;
}
// ====================================================
// PROMOCIONES
// ====================================================
export type PromotionType =
  | 'porcentaje'
  | 'monto_fijo'
  | 'precio_especial'
  | '2x1';

export interface PromotionProduct {
  promotion_id: string;
  product_id: string;
  variant_id: string | null;
  product?: Pick<Product, 'id' | 'name' | 'sku'>;
  variant?: Pick<ProductVariant, 'id' | 'name' | 'sku'> | null;
}

export interface PromotionCategory {
  promotion_id: string;
  category_id: string;
  category?: Pick<Category, 'id' | 'name'>;
}

export interface Promotion {
  id: string;
  name: string;
  description: string | null;
  type: PromotionType;
  value: number;
  currency_id: string | null;
  min_quantity: number | null;
  min_amount: number | null;
  starts_at: string;
  ends_at: string | null;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  only_with_points: boolean;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  currency?: Currency | null;
  products?: PromotionProduct[];
  categories?: PromotionCategory[];
}

export interface PromotionStatusHistory {
  id: string;
  promotion_id: string;
  previous_status: string | null;
  new_status: string;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
  user?: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
}

// ====================================================
// PUNTOS
// ====================================================
export type CustomerPointsMovementType =
  | 'acumulacion'
  | 'canje'
  | 'expiracion'
  | 'ajuste';

export interface CustomerPointsMovement {
  id: string;
  customer_id: string;
  movement_type: CustomerPointsMovementType;
  points: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  user?: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
  customer?: Pick<Customer, 'id' | 'full_name' | 'code' | 'phone'> | null;
}

export interface PointRedemptionCode {
  id: string;
  customer_id: string;
  code: string;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_in_sale_id: string | null;
  invalidated_at: string | null;
  invalidated_by: string | null;
}

// ====================================================
// NOTIFICACIONES
// ====================================================
export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}

// ====================================================
// AUDITORÍA
// ====================================================
export interface AuditLog {
  id: string;
  user_id: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  table_name: string;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  reason: string | null;
  created_at: string;
  user?: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
}

// ====================================================
// REPORTES
// ====================================================
export interface SalesReportRow {
  date: string;
  sales_count: number;
  gross_total: number;
  discount_total: number;
  net_total: number;
  cost_total: number;
  profit_total: number;
  margin_percent: number;
}

export interface VendorReportRow {
  vendor_id: string | null;
  vendor_name: string;
  sales_count: number;
  base_total: number;
  base_profit: number;
  commission: number;
}

export interface ProductReportRow {
  product_id: string;
  product_name: string;
  sku: string | null;
  quantity_sold: number;
  base_total: number;
  base_cost: number;
  base_profit: number;
  margin_percent: number;
}

export interface CategoryReportRow {
  category_id: string | null;
  category_name: string;
  quantity_sold: number;
  base_total: number;
  base_profit: number;
}

export interface CurrencyReportRow {
  currency_id: string;
  currency_code: string;
  sales_count: number;
  total_original: number;
  base_total: number;
}

export interface PaymentReportRow {
  payment_method_id: string | null;
  payment_method_name: string;
  sales_count: number;
  base_total: number;
}