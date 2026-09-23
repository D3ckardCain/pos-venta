export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  decimal_separator: string;
  thousand_separator: string;
  symbol_position: 'before' | 'after';
}

export function formatCurrency(
  amount: number | string | null | undefined,
  currency: Currency
): string {
  if (amount === null || amount === undefined) return '-';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '-';

  const fixed = num.toFixed(currency.decimals);
  const [intPart, decPart] = fixed.split('.');
  const intFormatted = intPart.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    currency.thousand_separator
  );
  const formatted =
    currency.decimals > 0
      ? `${intFormatted}${currency.decimal_separator}${decPart}`
      : intFormatted;

  return currency.symbol_position === 'before'
    ? `${currency.symbol}${formatted}`
    : `${formatted}${currency.symbol}`;
}

export function convertCurrency(
  amount: number,
  exchangeRate: number,
  targetDecimals: number
): number {
  const converted = amount * exchangeRate;
  return roundCurrency(converted, targetDecimals);
}

export function roundCurrency(amount: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(amount * factor) / factor;
}