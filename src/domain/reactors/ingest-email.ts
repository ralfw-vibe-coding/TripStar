import type { IngestPart } from "../model";
import type { BookingAnalysisProvider } from "../providers/booking-analysis-provider";
import type { DocumentStorageProvider } from "../providers/document-storage-provider";
import type { TripStarStateProvider } from "../providers/state-provider";
import { deduplicateAnalyzedBookings } from "./analyzed-bookings";

export type IngestEmailResult =
  | { status: "part_received" }
  | { status: "duplicate" }
  | { status: "unknown_sender" }
  | { status: "complete"; bookingCount: number };

export async function ingestEmailPart(
  state: TripStarStateProvider,
  storage: DocumentStorageProvider,
  analyzer: BookingAnalysisProvider,
  part: IngestPart,
): Promise<IngestEmailResult> {
  const sender = part.sender.trim().toLowerCase();

  const user = await state.findUserByEmail(sender);
  if (!user) {
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
  await state.appendActivity({
    level: "info",
    scope: "inbox",
    message: `[Inbox] Part ${part.part}/${part.of} received: ${part.document.filename}`,
    documentName: part.document.filename,
    details: { txId: part.txId, sender, part: part.part, of: part.of, mimeType: part.document.mimeType },
  });

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

  const allAnalyzed = [];
  for (const p of allParts) {
    try {
      let analyzed;
      if (p.document.mimeType === "text/plain") {
        const text = Buffer.from(p.document.data, "base64").toString("utf-8");
        analyzed = await analyzer.analyzeText(text);
      } else if (p.document.mimeType === "application/pdf") {
        analyzed = await analyzer.analyzePdf({ base64: p.document.data, originalFileName: p.document.filename });
      } else {
        continue;
      }
      allAnalyzed.push(...analyzed);
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

  const deduplicated = deduplicateAnalyzedBookings(allAnalyzed);

  const stored = await storage.storeTextDocument({
    text: `Email from ${sender} (${part.txId})`,
    originalFileName: `Email ${sender}`,
  });
  const document = await state.createDocument({
    tripId: null,
    storageKey: stored.storageKey,
    originalFileName: stored.originalFileName,
    mimeType: "message/rfc822",
    sourceType: "email_text",
    sourceEmailIngestId: part.txId,
    extractedText: null,
    processingStatus: "ready",
  });

  const bookings =
    deduplicated.length > 0
      ? await state.createBookings(
          deduplicated.map((booking) => ({
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
    documentName: document.originalFileName,
    details: { txId: part.txId, sender, bookingCount: bookings.length, documentId: document.id },
  });

  return { status: "complete", bookingCount: bookings.length };
}
