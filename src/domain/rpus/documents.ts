import type { DocumentRecord, Id } from "../model";
import type { TripStarStateProvider, UpdateDocumentInput } from "../providers/state-provider";
import type { DocumentStorageProvider } from "../providers/document-storage-provider";
import type { BookingAnalysisProvider, ReceiptInfo } from "../providers/booking-analysis-provider";
import { emptyReceiptInfo } from "../providers/booking-analysis-provider";

/**
 * Returns all documents visible to a user — either directly assigned to one of
 * their trips, or referenced by a booking that belongs to one of their trips.
 * Documents without a direct tripId get the tripId inferred from the booking
 * relationship so the caller can filter by trip without knowing the internals.
 */
export async function listDocumentsForUser(
  provider: TripStarStateProvider,
  userId: Id,
): Promise<DocumentRecord[]> {
  const [allTrips, allDocuments, allBookings] = await Promise.all([
    provider.listTrips(),
    provider.listDocuments(),
    provider.listBookings(),
  ]);

  const visibleTripIds = new Set(
    allTrips
      .filter((trip) => trip.ownerUserId === userId || trip.sharedWithUserIds.includes(userId))
      .map((trip) => trip.id),
  );

  // documentId → tripId inferred from bookings in visible trips
  const tripIdByDocId = new Map<string, string>();
  for (const booking of allBookings) {
    if (booking.tripId !== null && visibleTripIds.has(booking.tripId) && booking.sourceDocumentId !== null) {
      tripIdByDocId.set(booking.sourceDocumentId, booking.tripId);
    }
  }

  return allDocuments
    .filter(
      (doc) =>
        (doc.tripId !== null && visibleTripIds.has(doc.tripId)) ||
        tripIdByDocId.has(doc.id),
    )
    .map((doc) => ({
      ...doc,
      tripId: doc.tripId ?? tripIdByDocId.get(doc.id) ?? null,
    }));
}

export interface UploadDocumentInput {
  base64: string;
  originalFileName: string;
  mimeType: string;
  tripId: Id;
}

/**
 * Stores a file and creates a DocumentRecord assigned to the given trip.
 * Runs receipt detection via the analyzer so payment receipts are auto-classified.
 */
export async function uploadDocument(
  provider: TripStarStateProvider,
  storage: DocumentStorageProvider,
  analyzer: BookingAnalysisProvider,
  input: UploadDocumentInput,
): Promise<DocumentRecord> {
  const stored = await storage.storeBase64Document({
    base64: input.base64,
    mimeType: input.mimeType,
    originalFileName: input.originalFileName,
  });

  // Run receipt detection in the background of the upload — ignore booking
  // extraction results, we only want the receipt fields.
  let receiptInfo: ReceiptInfo = emptyReceiptInfo;
  try {
    const result = input.mimeType === "application/pdf"
      ? await analyzer.analyzePdf({ base64: input.base64, originalFileName: input.originalFileName })
      : await analyzer.analyzeImage({ base64: input.base64, mimeType: input.mimeType });
    receiptInfo = result.receiptInfo;
  } catch {
    // Receipt detection failure is non-fatal — document is still stored
  }

  return provider.createDocument({
    tripId: input.tripId,
    storageKey: stored.storageKey,
    originalFileName: stored.originalFileName,
    mimeType: stored.mimeType,
    sourceType: "upload",
    sourceEmailIngestId: null,
    extractedText: null,
    isReceipt: receiptInfo.isReceipt,
    receiptAmount: receiptInfo.receiptAmount,
    receiptCurrency: receiptInfo.receiptCurrency,
    receiptDate: receiptInfo.receiptDate,
    receiptPurpose: receiptInfo.receiptPurpose,
    receiptType: receiptInfo.receiptType,
    receiptJson: null,
    processingStatus: "ready",
  });
}

export async function updateDocument(
  provider: TripStarStateProvider,
  id: Id,
  input: UpdateDocumentInput,
): Promise<DocumentRecord> {
  const updated = await provider.updateDocument(id, input);
  // If the document has no direct tripId, enrich from the booking relationship
  // (same logic as listDocumentsForUser) so the caller always gets a usable tripId
  if (updated.tripId === null) {
    const bookings = await provider.listBookings();
    const inferredTripId = bookings.find((b) => b.sourceDocumentId === id && b.tripId !== null)?.tripId ?? null;
    if (inferredTripId !== null) {
      return { ...updated, tripId: inferredTripId };
    }
  }
  return updated;
}
