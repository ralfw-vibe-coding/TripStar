import type { DocumentRecord, IngestPart } from "../model";
import type { AnalyzedBookingInput, BookingAnalysisProvider } from "../providers/booking-analysis-provider";
import type { DocumentStorageProvider } from "../providers/document-storage-provider";
import type { TripStarStateProvider } from "../providers/state-provider";
import { sendIngestErrorEmail } from "../../server/email";
import { deduplicateAnalyzedBookings } from "./analyzed-bookings";

export type ReceiveIngestPartResult =
  | { status: "part_received" }
  | { status: "duplicate" }
  | { status: "unknown_sender" }
  | { status: "ready_to_process"; userId: string };

/**
 * Fast phase — runs synchronously within the HTTP request.
 * Logs receipt, validates sender, checks idempotency, stores the part.
 * Returns immediately; does NOT call OpenAI.
 */
export async function receiveIngestPart(
  state: TripStarStateProvider,
  part: IngestPart,
): Promise<ReceiveIngestPartResult> {
  const sender = part.sender.trim().toLowerCase();

  // Look up the user first so every log entry can carry userId.
  const user = await state.findUserByEmail(sender);
  const userId = user?.id ?? null;

  await state.appendActivity({
    level: "info",
    scope: "inbox",
    message: `[Inbox] Received part ${part.part}/${part.of} from ${sender || "(no sender)"}: ${part.document.filename}`,
    documentName: part.document.filename,
    userId,
    details: { txId: part.txId, sender, part: part.part, of: part.of, mimeType: part.document.mimeType },
  });

  if (!user) {
    await state.appendActivity({
      level: "warn",
      scope: "inbox",
      message: `[Inbox] Unknown sender, rejected: ${sender || "(empty)"}`,
      documentName: null,
      userId: null,
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
        userId,
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
    message: `[Inbox] All ${part.of} part(s) received for ${part.txId}, queuing analysis`,
    documentName: null,
    userId,
    details: { txId: part.txId, sender },
  });

  return { status: "ready_to_process", userId: user.id };
}

/**
 * Slow phase for local dev — deferred via setTimeout so it runs after the
 * HTTP response is returned.  In production on Netlify the caller triggers
 * a Background Function instead (15-minute timeout); this fallback is only
 * used when process.env.URL is not set (i.e. local dev server).
 */
export function queueIngestProcessing(
  state: TripStarStateProvider,
  storage: DocumentStorageProvider,
  analyzer: BookingAnalysisProvider,
  txId: string,
  sender: string,
  userId: string,
): void {
  setTimeout(() => {
    void processIngestEmail(state, storage, analyzer, txId, sender, userId);
  }, 0);
}

export async function processIngestEmail(
  state: TripStarStateProvider,
  storage: DocumentStorageProvider,
  analyzer: BookingAnalysisProvider,
  txId: string,
  sender: string,
  userId: string,
): Promise<void> {
  try {
    const allParts = await state.getIngestParts(txId);

    // PDFs first (more authoritative than email body text)
    const sortedParts = [...allParts].sort((a, b) => {
      const rank = (p: IngestPart) => (p.document.mimeType === "application/pdf" ? 0 : 1);
      return rank(a) - rank(b);
    });

    const hasPdf = sortedParts.some((p) => p.document.mimeType === "application/pdf");

    const analyzedParts: Array<{ document: DocumentRecord; bookings: AnalyzedBookingInput[] }> = [];
    for (const p of sortedParts) {
      // When a PDF attachment is present it is the authoritative source.
      // Skip analysing the plain-text email body to save one OpenAI round-trip
      // and avoid hitting Netlify's function timeout.
      if (hasPdf && p.document.mimeType === "text/plain") {
        await state.appendActivity({
          level: "info",
          scope: "inbox",
          message: `[Inbox] ${p.document.filename}: skipped (PDF attachment takes priority)`,
          documentName: p.document.filename,
          userId,
          details: { txId, filename: p.document.filename },
        });
        continue;
      }

      try {
        const result = await analyzeAndStorePart(state, storage, analyzer, p, sender, txId);
        analyzedParts.push(result);
        await state.appendActivity({
          level: "info",
          scope: "inbox",
          message: `[Inbox] ${p.document.filename}: ${result.bookings.length} booking(s) found`,
          documentName: p.document.filename,
          userId,
          details: { txId, filename: p.document.filename, bookingCount: result.bookings.length },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await state.appendActivity({
          level: "error",
          scope: "inbox",
          message: `[Inbox] Analysis failed for ${p.document.filename}: ${errorMessage}`,
          documentName: p.document.filename,
          userId,
          details: { txId, filename: p.document.filename },
        });
        await sendIngestErrorEmail({ to: sender, errorMessage, filename: p.document.filename, txId });
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
              participantUserIds: [userId],
              status: "inbox" as const,
            })),
          )
        : [];

    await state.deleteIngestParts(txId);
    await state.purgeStaleIngestParts(60);

    await state.appendActivity({
      level: "info",
      scope: "inbox",
      message:
        bookings.length === 0
          ? `[Inbox] Email processed, no bookings found`
          : `[Inbox] Email processed: ${bookings.length} booking(s) extracted`,
      documentName: null,
      userId,
      details: { txId, sender, bookingCount: bookings.length },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await state.appendActivity({
      level: "error",
      scope: "inbox",
      message: `[Inbox] Processing failed for ${txId}: ${errorMessage}`,
      documentName: null,
      userId,
      details: { txId, sender },
    });
    await sendIngestErrorEmail({ to: sender, errorMessage, txId });
  }
}

async function analyzeAndStorePart(
  state: TripStarStateProvider,
  storage: DocumentStorageProvider,
  analyzer: BookingAnalysisProvider,
  p: IngestPart,
  sender: string,
  txId: string,
): Promise<{ document: DocumentRecord; bookings: AnalyzedBookingInput[] }> {
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
 * Merge bookings from multiple parts. PDFs come first (higher priority).
 * A booking from a lower-priority source is dropped if the same route+time exists already.
 */
function mergeAcrossParts(
  parts: Array<{ document: DocumentRecord; bookings: AnalyzedBookingInput[] }>,
): Array<{ booking: AnalyzedBookingInput; document: DocumentRecord }> {
  const result: Array<{ booking: AnalyzedBookingInput; document: DocumentRecord; routeKey: string }> = [];

  for (const { document, bookings } of parts) {
    for (const booking of bookings) {
      const rk = routeTimeKey(booking);
      const existingIndex = result.findIndex((e) => e.routeKey === rk);
      if (existingIndex === -1) {
        result.push({ booking, document, routeKey: rk });
      } else {
        const existing = result[existingIndex];
        const currentScore = detailScore(booking);
        const existingScore = detailScore(existing.booking);
        const winner = currentScore > existingScore ? { booking, document } : { booking: existing.booking, document: existing.document };
        result[existingIndex] = {
          ...winner,
          routeKey: rk,
          booking: {
            ...winner.booking,
            travelers: unique([...existing.booking.travelers, ...booking.travelers]),
          },
        };
      }
    }
  }

  return result.map(({ booking, document }) => ({ booking, document }));
}

function routeTimeKey(booking: AnalyzedBookingInput): string {
  const fromCode = extractLocationCode(booking.fromText);
  const toCode = extractLocationCode(booking.toText);
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
