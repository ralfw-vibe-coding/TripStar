import type { DocumentRecord, IngestPart } from "../model";
import type { AnalyzedBookingInput, BookingAnalysisProvider } from "../providers/booking-analysis-provider";
import type { DocumentStorageProvider } from "../providers/document-storage-provider";
import type { TripStarStateProvider } from "../providers/state-provider";
import { deduplicateAnalyzedBookings } from "./analyzed-bookings";

export type IngestEmailResult =
  | { status: "part_received" }
  | { status: "duplicate" }
  | { status: "unknown_sender" }
  | { status: "complete"; bookingCount: number };

interface AnalyzedPart {
  document: DocumentRecord;
  bookings: AnalyzedBookingInput[];
}

export async function ingestEmailPart(
  state: TripStarStateProvider,
  storage: DocumentStorageProvider,
  analyzer: BookingAnalysisProvider,
  part: IngestPart,
): Promise<IngestEmailResult> {
  const sender = part.sender.trim().toLowerCase();

  await state.appendActivity({
    level: "info",
    scope: "inbox",
    message: `[Inbox] Received part ${part.part}/${part.of} from ${sender || "(no sender)"}: ${part.document.filename}`,
    documentName: part.document.filename,
    details: { txId: part.txId, sender, part: part.part, of: part.of, mimeType: part.document.mimeType },
  });

  const user = await state.findUserByEmail(sender);
  if (!user) {
    await state.appendActivity({
      level: "warn",
      scope: "inbox",
      message: `[Inbox] Unknown sender, rejected: ${sender || "(empty)"}`,
      documentName: null,
      details: { txId: part.txId, sender },
    });
    return { status: "unknown_sender" };
  }

  const existing = await state.findDocumentByEmailMessageId(part.txId);
  if (existing) {
    if (part.part === part.of) {
      await state.appendActivity({
        level: "warn",
        scope: "inbox",
        message: `[Inbox] Duplicate email ignored: ${part.txId}`,
        documentName: null,
        details: { txId: part.txId, sender },
      });
    }
    return { status: "duplicate" };
  }

  await state.storeIngestPart(part);

  const allParts = await state.getIngestParts(part.txId);
  if (allParts.length < part.of) {
    return { status: "part_received" };
  }

  await state.appendActivity({
    level: "info",
    scope: "inbox",
    message: `[Inbox] All ${part.of} part(s) received for ${part.txId}, starting analysis`,
    documentName: null,
    details: { txId: part.txId, sender },
  });

  // Sort: PDFs first (more authoritative than email body text)
  const sortedParts = [...allParts].sort((a, b) => {
    const rank = (p: IngestPart) => (p.document.mimeType === "application/pdf" ? 0 : 1);
    return rank(a) - rank(b);
  });

  const analyzedParts: AnalyzedPart[] = [];
  for (const p of sortedParts) {
    try {
      const { document, bookings } = await analyzeAndStorePart(state, storage, analyzer, p, sender, part.txId);
      analyzedParts.push({ document, bookings });
      await state.appendActivity({
        level: "info",
        scope: "inbox",
        message: `[Inbox] ${p.document.filename}: ${bookings.length} booking(s) found`,
        documentName: p.document.filename,
        details: { txId: part.txId, filename: p.document.filename, bookingCount: bookings.length },
      });
    } catch (error) {
      await state.appendActivity({
        level: "error",
        scope: "inbox",
        message: `[Inbox] Analysis failed for ${p.document.filename}: ${error instanceof Error ? error.message : String(error)}`,
        documentName: p.document.filename,
        details: { txId: part.txId, filename: p.document.filename },
      });
    }
  }

  const mergedBookings = mergeAcrossParts(analyzedParts);
  const bookings =
    mergedBookings.length > 0
      ? await state.createBookings(
          mergedBookings.map(({ booking, document }) => ({
            ...booking,
            tripId: null,
            sourceDocumentId: document.id,
            participantUserIds: [user.id],
            status: "inbox" as const,
          })),
        )
      : [];

  await state.deleteIngestParts(part.txId);
  await state.purgeStaleIngestParts(60);

  await state.appendActivity({
    level: "info",
    scope: "inbox",
    message:
      bookings.length === 0
        ? `[Inbox] Email processed, no bookings found`
        : `[Inbox] Email processed: ${bookings.length} booking(s) extracted`,
    documentName: null,
    details: { txId: part.txId, sender, bookingCount: bookings.length },
  });

  return { status: "complete", bookingCount: bookings.length };
}

async function analyzeAndStorePart(
  state: TripStarStateProvider,
  storage: DocumentStorageProvider,
  analyzer: BookingAnalysisProvider,
  p: IngestPart,
  sender: string,
  txId: string,
): Promise<AnalyzedPart> {
  if (p.document.mimeType === "text/plain") {
    const text = Buffer.from(p.document.data, "base64").toString("utf-8");
    const bookings = await analyzer.analyzeText(text);
    const stored = await storage.storeTextDocument({ text, originalFileName: `Email from ${sender}` });
    const document = await state.createDocument({
      tripId: null,
      storageKey: stored.storageKey,
      originalFileName: stored.originalFileName,
      mimeType: stored.mimeType,
      sourceType: "email_text",
      sourceEmailIngestId: txId,
      extractedText: text,
      processingStatus: "ready",
    });
    return { document, bookings: deduplicateAnalyzedBookings(bookings) };
  }

  if (p.document.mimeType === "application/pdf") {
    const bookings = await analyzer.analyzePdf({ base64: p.document.data, originalFileName: p.document.filename });
    const stored = await storage.storePdfDocument({ base64: p.document.data, originalFileName: p.document.filename });
    const document = await state.createDocument({
      tripId: null,
      storageKey: stored.storageKey,
      originalFileName: stored.originalFileName,
      mimeType: stored.mimeType,
      sourceType: "email_attachment",
      sourceEmailIngestId: txId,
      extractedText: null,
      processingStatus: "ready",
    });
    return { document, bookings: deduplicateAnalyzedBookings(bookings) };
  }

  throw new Error(`Unsupported MIME type: ${p.document.mimeType}`);
}

/**
 * Merge bookings from multiple parts into a deduplicated list.
 * PDFs come first (higher priority). A booking from a lower-priority source
 * is dropped if a booking with the same route+time already exists.
 */
function mergeAcrossParts(parts: AnalyzedPart[]): Array<{ booking: AnalyzedBookingInput; document: DocumentRecord }> {
  const result: Array<{ booking: AnalyzedBookingInput; document: DocumentRecord; routeKey: string }> = [];

  for (const { document, bookings } of parts) {
    for (const booking of bookings) {
      const rk = routeTimeKey(booking);
      const existingIndex = result.findIndex((e) => e.routeKey === rk);
      if (existingIndex === -1) {
        result.push({ booking, document, routeKey: rk });
      } else {
        // Prefer the one with more information (serviceIdentifier, longer details)
        const existing = result[existingIndex];
        const currentScore = detailScore(booking);
        const existingScore = detailScore(existing.booking);
        if (currentScore > existingScore) {
          result[existingIndex] = { booking, document, routeKey: rk };
        }
        // Also merge travelers from both versions
        result[existingIndex].booking = {
          ...result[existingIndex].booking,
          travelers: unique([...result[existingIndex].booking.travelers, ...booking.travelers]),
        };
      }
    }
  }

  return result.map(({ booking, document }) => ({ booking, document }));
}

function routeTimeKey(booking: AnalyzedBookingInput): string {
  const fromCode = extractLocationCode(booking.fromText);
  const toCode = extractLocationCode(booking.toText);
  // Match within the same hour: "2026-12-21T21" — covers timezone rounding
  const startHour = (booking.startAt ?? "").slice(0, 13);
  return `${booking.type}|${startHour}|${fromCode}|${toCode}`;
}

function extractLocationCode(text: string | null): string {
  if (!text) return "";
  const match = text.match(/^([A-Z]{3})\b/);
  if (match) return match[1];
  return text.toLowerCase().slice(0, 8).trim();
}

function detailScore(booking: AnalyzedBookingInput): number {
  return (booking.serviceIdentifier ? 10 : 0) + (booking.details?.length ?? 0);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
