import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import JSZip from "jszip";
import { randomUUID } from "node:crypto";
import type { DocumentRecord, Id } from "../model";
import type { TripStarStateProvider } from "../providers/state-provider";
import type { DocumentStorageProvider } from "../providers/document-storage-provider";
import { SbOrderDocument } from "../reports/sb-order-pdf";
import { SbFinancialReportDocument } from "../reports/sb-financial-report-pdf";
import { listDocumentsForUser } from "../rpus/documents";
import { sendReportReadyEmail } from "../../server/email";

export interface GenerateTripReportInput {
  tripId: Id;
  userId: Id;
  siteUrl: string;
}

// Per-step timeouts so a hung external call (R2, Resend, PDF image resolution)
// surfaces as a logged error instead of silently eating the 15-minute
// background-function budget.
const STATE_TIMEOUT_MS = 30_000;
const RENDER_TIMEOUT_MS = 120_000;
const RECEIPT_DOWNLOAD_TIMEOUT_MS = 60_000;
const ZIP_TIMEOUT_MS = 120_000;
const STORE_TIMEOUT_MS = 120_000;
const EMAIL_TIMEOUT_MS = 30_000;

export async function generateTripReport(
  state: TripStarStateProvider,
  storage: DocumentStorageProvider,
  input: GenerateTripReportInput,
): Promise<void> {
  const { tripId, userId, siteUrl } = input;
  const startedAt = Date.now();

  // Progress/failure logging is best-effort: a broken activity log must not
  // kill an otherwise healthy report run.
  async function progress(message: string, details?: Record<string, unknown>): Promise<void> {
    await state
      .appendActivity({ level: "info", scope: "report", message, documentName: null, details: { tripId, ...details } })
      .catch(() => undefined);
  }
  async function failure(message: string, details?: Record<string, unknown>): Promise<void> {
    await state
      .appendActivity({ level: "error", scope: "report", message, documentName: null, details: { tripId, ...details } })
      .catch(() => undefined);
  }

  let step = "load trip data";
  try {
    await progress("Report generation started");

    const trips = await withTimeout(step, STATE_TIMEOUT_MS, state.listTrips());
    const trip = trips.find((t) => t.id === tripId);
    if (!trip) throw new Error(`Trip not found: ${tripId}`);

    const users = await withTimeout(step, STATE_TIMEOUT_MS, state.listUsers());
    const user = users.find((u) => u.id === userId);
    if (!user) throw new Error(`User not found: ${userId}`);

    const receipts = await withTimeout("load receipts", STATE_TIMEOUT_MS, loadTripReportReceipts(state, userId, trip.id));
    await progress(`Report: loaded trip #${trip.tripNumber} with ${receipts.length} receipt(s) (${elapsed(startedAt)})`);

    // Generate PDFs
    step = "render order PDF";
    let stepStartedAt = Date.now();
    const sbOrderPdf = await withTimeout(
      step,
      RENDER_TIMEOUT_MS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      renderToBuffer(React.createElement(SbOrderDocument, { trip, user }) as any),
    );
    await progress(`Report: order PDF rendered (${elapsed(stepStartedAt)}, ${fmtBytes(sbOrderPdf.length)})`);

    step = "render financial report PDF";
    stepStartedAt = Date.now();
    const sbFinancialPdf = await withTimeout(
      step,
      RENDER_TIMEOUT_MS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      renderToBuffer(React.createElement(SbFinancialReportDocument, { trip, user, receipts }) as any),
    );
    await progress(`Report: financial report PDF rendered (${elapsed(stepStartedAt)}, ${fmtBytes(sbFinancialPdf.length)})`);

    // Build ZIP — all files go into a folder matching the ZIP filename
    const zipName = `tripstar report #${trip.tripNumber}`;
    const zip = new JSZip();
    const folder = zip.folder(zipName)!;
    folder.file(`order #${trip.tripNumber}.pdf`, sbOrderPdf);
    folder.file(`financial report #${trip.tripNumber}.pdf`, sbFinancialPdf);

    // Add receipt document files into subfolders
    const reimbursable = receipts.filter((r) => r.receiptType === "reimbursable");
    const nonReimbursable = receipts.filter((r) => r.receiptType !== "reimbursable");

    step = "download receipt files";
    async function addReceiptsToFolder(docs: typeof receipts, subfolderName: string) {
      if (docs.length === 0) return;
      const sub = folder.folder(subfolderName)!;
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        if (!doc.storageKey) continue;
        const ext = extForMime(doc.mimeType);
        const baseName = doc.originalFileName ?? `receipt-${doc.id}${ext}`;
        const fileStartedAt = Date.now();
        try {
          const { base64 } = await withTimeout(
            `download receipt "${baseName}"`,
            RECEIPT_DOWNLOAD_TIMEOUT_MS,
            storage.readDocument(doc.storageKey),
          );
          const buffer = Buffer.from(base64, "base64");
          const safeName = baseName.replace(/[/\\]/g, "_");
          const fileName = `${String(i + 1).padStart(2, "0")}_${safeName}`;
          sub.file(fileName, buffer);
          await progress(
            `Report: receipt ${i + 1}/${docs.length} added to ${subfolderName} — ${safeName} (${elapsed(fileStartedAt)}, ${fmtBytes(buffer.length)})`,
          );
        } catch (caught) {
          // Skip the file but make the failure visible; the report still ships.
          const msg = caught instanceof Error ? caught.message : String(caught);
          await failure(`Report: could not add receipt "${baseName}" (${subfolderName}): ${msg}`, { documentId: doc.id });
        }
      }
    }

    await addReceiptsToFolder(reimbursable, "receipts-reimbursable");
    await addReceiptsToFolder(nonReimbursable, "receipts-non-reimbursable");

    step = "build ZIP";
    stepStartedAt = Date.now();
    const zipBuffer = await withTimeout(step, ZIP_TIMEOUT_MS, zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
    await progress(`Report: ZIP built (${elapsed(stepStartedAt)}, ${fmtBytes(zipBuffer.length)})`);

    // Store in R2 under reports/ prefix with a random key
    step = "store ZIP";
    stepStartedAt = Date.now();
    const token = randomUUID();
    const reportKey = `reports/${token}.zip`;
    await withTimeout(step, STORE_TIMEOUT_MS, storage.storeBuffer({ key: reportKey, buffer: zipBuffer, mimeType: "application/zip" }));
    await progress(`Report: ZIP stored (${elapsed(stepStartedAt)})`);

    // Download URL embeds trip number (for Content-Disposition filename) + token (unguessable key)
    const downloadUrl = `${siteUrl}/api/reports/download/${encodeURIComponent(trip.tripNumber)}/${token}`;

    await progress(`Report generation finished for trip #${trip.tripNumber} (total ${elapsed(startedAt)})`, { downloadUrl });

    step = "send email";
    stepStartedAt = Date.now();
    const emailResult = await withTimeout(
      step,
      EMAIL_TIMEOUT_MS,
      sendReportReadyEmail({ to: user.email, tripNumber: trip.tripNumber, tripTitle: trip.title, downloadUrl }),
    );
    if (emailResult === "sent") {
      await progress(`Report for trip #${trip.tripNumber} sent to ${user.email} (${elapsed(stepStartedAt)})`, {
        recipientEmail: user.email,
        downloadUrl,
      });
    } else {
      await progress(`Report for trip #${trip.tripNumber} ready, but email skipped — Resend is not configured`, { downloadUrl });
    }
  } catch (caught) {
    const msg = caught instanceof Error ? caught.message : String(caught);
    await failure(`Report generation failed at step "${step}" after ${elapsed(startedAt)}: ${msg}`);
    throw caught;
  }
}

/** Rejects with a descriptive error if the promise does not settle within `ms`. */
export async function withTimeout<T>(label: string, ms: number, promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Step "${label}" timed out after ${Math.round(ms / 1000)}s`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function elapsed(since: number): string {
  const ms = Date.now() - since;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function loadTripReportReceipts(
  state: TripStarStateProvider,
  userId: Id,
  tripId: Id,
): Promise<DocumentRecord[]> {
  const documents = await listDocumentsForUser(state, userId);
  return selectTripReportReceipts(documents, tripId);
}

export function selectTripReportReceipts(documents: DocumentRecord[], tripId: Id): DocumentRecord[] {
  return documents.filter((d) => d.tripId === tripId && d.isReceipt && !d.deletedAt);
}

function extForMime(mimeType: string | null): string {
  switch (mimeType) {
    case "application/pdf": return ".pdf";
    case "image/jpeg":      return ".jpg";
    case "image/png":       return ".png";
    case "image/webp":      return ".webp";
    case "image/gif":       return ".gif";
    case "text/plain":      return ".txt";
    default:                return "";
  }
}
