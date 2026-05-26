import type { Booking, DocumentRecord, Id } from "../model";
import type { BookingAnalysisProvider } from "../providers/booking-analysis-provider";
import type { DocumentStorageProvider } from "../providers/document-storage-provider";
import type { TripStarStateProvider } from "../providers/state-provider";

export interface SubmitImageDocumentInput {
  base64: string;
  mimeType: string;
  tripId: Id | null;
  currentUserId: Id;
}

export interface SubmitImageDocumentResult {
  document: DocumentRecord | null;
  bookings: Booking[];
}

export async function submitImageDocument(
  state: TripStarStateProvider,
  storage: DocumentStorageProvider,
  analyzer: BookingAnalysisProvider,
  input: SubmitImageDocumentInput,
): Promise<SubmitImageDocumentResult> {
  if (!input.base64.trim()) {
    throw new Error("Screenshot is required.");
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(input.mimeType)) {
    throw new Error("Screenshot must be PNG, JPEG, or WebP.");
  }

  let analyzedBookings;
  try {
    analyzedBookings = await analyzer.analyzeImage({ base64: input.base64, mimeType: input.mimeType });
  } catch (error) {
    await state.appendActivity({
      level: "error",
      scope: "documents",
      message: "Screenshot analysis failed",
      documentName: "Clipboard screenshot",
      details: { bookingCount: null, tripId: input.tripId, error: errorMessage(error) },
    });
    throw error;
  }
  if (analyzedBookings.length === 0) {
    await state.appendActivity({
      level: "info",
      scope: "documents",
      message: "Submitted screenshot without bookings",
      documentName: "Clipboard screenshot",
      details: { bookingCount: 0, tripId: input.tripId },
    });
    return { document: null, bookings: [] };
  }

  const stored = await storage.storeBase64Document({
    base64: input.base64,
    mimeType: input.mimeType,
    originalFileName: "Clipboard screenshot",
  });
  const document = await state.createDocument({
    tripId: input.tripId,
    storageKey: stored.storageKey,
    originalFileName: stored.originalFileName,
    mimeType: stored.mimeType,
    sourceType: "screenshot",
    sourceEmailIngestId: null,
    extractedText: null,
    isReceipt: false,
    receiptAmount: null,
    receiptCurrency: null,
    receiptJson: null,
    processingStatus: "ready",
  });
  const bookings = await state.createBookings(
    analyzedBookings.map((booking) => ({
      ...booking,
      tripId: input.tripId,
      sourceDocumentId: document.id,
      participantUserIds: [input.currentUserId],
      status: "inbox",
    })),
  );

  await state.appendActivity({
    level: "info",
    scope: "documents",
    message: "Submitted screenshot",
    documentName: document.originalFileName,
    details: { documentId: document.id, bookingCount: bookings.length, tripId: input.tripId },
  });

  return { document, bookings };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
