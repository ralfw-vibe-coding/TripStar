export interface ExchangeRateProvider {
  /**
   * Converts `amount` from `fromCurrency` to `toCurrency`.
   * Pass `date` (ISO 8601, e.g. "2025-06-01") for a historical rate; null for today's rate.
   * Returns null when the rate cannot be determined (network error, unknown currency, etc.).
   */
  convert(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    date: string | null,
  ): Promise<number | null>;
}

/**
 * Resolves the EUR equivalent of a receipt amount.
 * - Null amount → null
 * - EUR (or no currency) → same amount (no conversion needed)
 * - Any other currency → calls the provider; returns null if conversion fails
 */
export async function autoConvertToEur(
  amount: number | null,
  currency: string | null,
  date: string | null,
  rates: ExchangeRateProvider,
): Promise<number | null> {
  if (amount == null) return null;
  if (!currency || currency === "EUR") return amount;
  return rates.convert(amount, currency, "EUR", date);
}
