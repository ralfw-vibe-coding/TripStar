import type { Booking, DocumentRecord, Id } from "../model";
import type { BookingAnalysisProvider } from "../providers/booking-analysis-provider";
import type { DocumentStorageProvider } from "../providers/document-storage-provider";
import type { TripStarStateProvider } from "../providers/state-provider";
import { deduplicateAnalyzedBookings } from "./analyzed-bookings";

export interface SubmitTextDocumentInput {
  text: string;
  tripId: Id | null;
  currentUserId: Id;
}

export interface SubmitTextDocumentResult {
  document: DocumentRecord | null;
  bookings: Booking[];
}

export async function submitTextDocument(
  state: TripStarStateProvider,
  storage: DocumentStorageProvider,
  analyzer: BookingAnalysisProvider,
  input: SubmitTextDocumentInput,
): Promise<SubmitTextDocumentResult> {
  const text = input.text.trim();
  if (!text) {
    throw new Error("Document text is required.");
  }

  let analyzedBookings;
  try {
    analyzedBookings = await analyzer.analyzeText(text);
  } catch (error) {
    await state.appendActivity({
      level: "error",
      scope: "documents",
      message: "Text document analysis failed",
      documentName: "Texteingabe",
      details: { bookingCount: null, tripId: input.tripId, error: errorMessage(error) },
    });
    throw error;
  }
  if (analyzedBookings.length === 0) {
    await state.appendActivity({
      level: "info",
      scope: "documents",
      message: "Submitted text document without bookings",
      documentName: "Texteingabe",
      details: { bookingCount: 0, tripId: input.tripId },
    });
    return { document: null, bookings: [] };
  }
  analyzedBookings = deduplicateAnalyzedBookings(analyzedBookings);

  const stored = await storage.storeTextDocument({
    text,
    originalFileName: "Texteingabe",
  });
  const document = await state.createDocument({
    tripId: input.tripId,
    storageKey: stored.storageKey,
    originalFileName: stored.originalFileName,
    mimeType: stored.mimeType,
    sourceType: "text_input",
    sourceEmailIngestId: null,
    extractedText: text,
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
    message: "Submitted text document",
    documentName: document.originalFileName,
    details: { documentId: document.id, bookingCount: bookings.length, tripId: input.tripId },
  });

  return { document, bookings };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
