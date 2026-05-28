import type { ExchangeRateProvider } from "../domain/providers/exchange-rate-provider";

/**
 * Exchange-rate provider backed by the free frankfurter.app API (no key required).
 * Supports any currency pair available on that service.
 */
export class FrankfurterExchangeRateProvider implements ExchangeRateProvider {
  async convert(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    date: string | null,
  ): Promise<number | null> {
    if (fromCurrency === toCurrency) return amount;
    try {
      const segment = date ?? "latest";
      const url = `https://api.frankfurter.app/${segment}?from=${encodeURIComponent(fromCurrency)}&to=${encodeURIComponent(toCurrency)}&amount=${amount}`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const data = (await response.json()) as { rates?: Record<string, number> };
      return data.rates?.[toCurrency] ?? null;
    } catch {
      return null;
    }
  }
}
