import type { Booking, DocumentRecord, Id } from "../model";
import type { AnalyzedBookingInput, BookingAnalysisProvider, ReceiptInfo } from "../providers/booking-analysis-provider";
import type { DocumentStorageProvider, StoredDocument } from "../providers/document-storage-provider";
import type { TripStarStateProvider } from "../providers/state-provider";
import { deduplicateAnalyzedBookings } from "./analyzed-bookings";

export interface SubmitPdfDocumentInput {
  base64: string;
  originalFileName: string;
}

export interface SubmitPdfDocumentsInput {
  documents: SubmitPdfDocumentInput[];
  tripId: Id | null;
  currentUserId: Id;
}

export interface SubmitPdfDocumentsResult {
  documents: DocumentRecord[];
  bookings: Booking[];
}

export async function submitPdfDocuments(
  state: TripStarStateProvider,
  storage: DocumentStorageProvider,
  analyzer: BookingAnalysisProvider,
  input: SubmitPdfDocumentsInput,
): Promise<SubmitPdfDocumentsResult> {
  if (input.documents.length === 0) {
    throw new Error("At least one PDF document is required.");
  }

  const documents: DocumentRecord[] = [];
  const bookings: Booking[] = [];
  for (const upload of input.documents) {
    const result = await submitSinglePdfDocument(state, storage, analyzer, upload, input.tripId, input.currentUserId);
    documents.push(result.document);
    bookings.push(...result.bookings);
  }
  return { documents, bookings };
}

async function submitSinglePdfDocument(
  state: TripStarStateProvider,
  storage: DocumentStorageProvider,
  analyzer: BookingAnalysisProvider,
  upload: SubmitPdfDocumentInput,
  tripId: Id | null,
  currentUserId: Id,
): Promise<{ document: DocumentRecord; bookings: Booking[] }> {
  validatePdfUpload(upload);
  const stored = await storage.storePdfDocument(upload);

  let analysisResult;
  try {
    analysisResult = await analyzer.analyzePdf(upload);
  } catch (error) {
    const failedDocument = await createPdfDocument(state, stored, tripId, "failed");
    await state.appendActivity({
      level: "error",
      scope: "documents",
      message: "PDF analysis failed",
      documentName: failedDocument.originalFileName,
      details: { documentId: failedDocument.id, bookingCount: null, tripId, error: errorMessage(error) },
    });
    throw error;
  }

  const { receiptInfo } = analysisResult;
  const extractedBookingCount = analysisResult.bookings.length;
  const dedupedBookings = deduplicateAnalyzedBookings(analysisResult.bookings);
  const document = await createPdfDocument(state, stored, tripId, "ready", receiptInfo);
  const bookings = await state.createBookings(
    dedupedBookings.map((booking) => ({
      ...booking,
      tripId,
      sourceDocumentId: document.id,
      participantUserIds: [currentUserId],
      status: "reviewed",
    })),
  );

  await state.appendActivity({
    level: "info",
    scope: "documents",
    message:
      bookings.length === 0
        ? "PDF analyzed, no bookings extracted"
        : `PDF analyzed, created ${bookings.length} booking${bookings.length === 1 ? "" : "s"}`,
    documentName: document.originalFileName,
    details: { documentId: document.id, bookingCount: bookings.length, extractedBookingCount, tripId },
  });
  return { document, bookings };
}

function createPdfDocument(
  state: TripStarStateProvider,
  stored: StoredDocument,
  tripId: Id | null,
  processingStatus: DocumentRecord["processingStatus"],
  receiptInfo?: ReceiptInfo,
): Promise<DocumentRecord> {
  return state.createDocument({
    tripId,
    storageKey: stored.storageKey,
    originalFileName: stored.originalFileName,
    mimeType: stored.mimeType,
    sourceType: "upload",
    sourceEmailIngestId: null,
    extractedText: null,
    isReceipt: receiptInfo?.isReceipt ?? false,
    receiptAmount: receiptInfo?.receiptAmount ?? null,
    receiptCurrency: receiptInfo?.receiptCurrency ?? null,
    receiptDate: receiptInfo?.receiptDate ?? null,
    receiptPurpose: receiptInfo?.receiptPurpose ?? null,
    receiptType: receiptInfo?.receiptType ?? null,
    receiptJson: null,
    processingStatus,
  });
}

function validatePdfUpload(upload: SubmitPdfDocumentInput): void {
  if (!upload.base64.trim()) {
    throw new Error("PDF document is empty.");
  }
  if (!upload.originalFileName.toLowerCase().endsWith(".pdf")) {
    throw new Error("Only PDF documents are accepted.");
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
