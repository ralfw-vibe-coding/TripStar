import type { DocumentRecord, Id } from "../model";
import type { TripStarStateProvider, UpdateDocumentInput } from "../providers/state-provider";
import { autoConvertToEur, type ExchangeRateProvider } from "../providers/exchange-rate-provider";
import { updateDocument } from "../rpus/documents";

/**
 * Updates a receipt document.  If no explicit EUR override is provided,
 * auto-converts the amount to EUR via the exchange-rate provider.
 */
export async function updateReceipt(
  state: TripStarStateProvider,
  exchangeRates: ExchangeRateProvider,
  documentId: Id,
  input: UpdateDocumentInput,
): Promise<DocumentRecord> {
  const enriched = { ...input };

  // Only auto-convert when receiptAmount is actually being updated in this request.
  // If receiptAmount is absent (e.g. a pure isReceipt:true patch), leave the
  // existing receiptAmountEur in the DB untouched.
  if (
    enriched.receiptAmount !== undefined &&
    (enriched.receiptAmountEur === undefined || enriched.receiptAmountEur === null)
  ) {
    enriched.receiptAmountEur = await autoConvertToEur(
      enriched.receiptAmount ?? null,
      enriched.receiptCurrency ?? null,
      enriched.receiptDate ?? null,
      exchangeRates,
    );
  }

  return updateDocument(state, documentId, enriched);
}
