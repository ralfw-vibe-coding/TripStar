import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import JSZip from "jszip";
import { randomUUID } from "node:crypto";
import type { Id } from "../model";
import type { TripStarStateProvider } from "../providers/state-provider";
import type { DocumentStorageProvider } from "../providers/document-storage-provider";
import { SbOrderDocument } from "../reports/sb-order-pdf";
import { SbFinancialReportDocument } from "../reports/sb-financial-report-pdf";
import { sendReportReadyEmail } from "../../server/email";

export interface GenerateTripReportInput {
  tripId: Id;
  userId: Id;
  siteUrl: string;
}

export async function generateTripReport(
  state: TripStarStateProvider,
  storage: DocumentStorageProvider,
  input: GenerateTripReportInput,
): Promise<void> {
  const { tripId, userId, siteUrl } = input;

  await state.appendActivity({
    level: "info",
    scope: "report",
    message: "Generating trip report…",
    documentName: null,
    details: { tripId },
  });

  // Load trip and user
  const trips = await state.listTrips();
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) throw new Error(`Trip not found: ${tripId}`);

  const users = await state.listUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error(`User not found: ${userId}`);

  // Load receipt documents for this trip
  const allDocuments = await state.listDocuments();
  const receipts = allDocuments.filter(
    (d) => d.tripId === trip.id && d.isReceipt && !d.deletedAt,
  );

  // Generate PDFs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbOrderPdf = await renderToBuffer(
    React.createElement(SbOrderDocument, { trip, user }) as any,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbFinancialPdf = await renderToBuffer(
    React.createElement(SbFinancialReportDocument, { trip, user, receipts }) as any,
  );

  // Build ZIP — all files go into a folder matching the ZIP filename
  const zipName = `tripstar report #${trip.tripNumber}`;
  const zip = new JSZip();
  const folder = zip.folder(zipName)!;
  folder.file(`order #${trip.tripNumber}.pdf`, sbOrderPdf);
  folder.file(`financial report #${trip.tripNumber}.pdf`, sbFinancialPdf);

  // Add receipt document files into subfolders
  const reimbursable = receipts.filter((r) => r.receiptType === "reimbursable");
  const nonReimbursable = receipts.filter((r) => r.receiptType !== "reimbursable");

  async function addReceiptsToFolder(docs: typeof receipts, subfolderName: string) {
    if (docs.length === 0) return;
    const sub = folder.folder(subfolderName)!;
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      if (!doc.storageKey) continue;
      try {
        const { base64 } = await storage.readDocument(doc.storageKey);
        const ext = extForMime(doc.mimeType);
        const baseName = doc.originalFileName ?? `receipt-${doc.id}${ext}`;
        const safeName = baseName.replace(/[/\\]/g, "_");
        const fileName = `${String(i + 1).padStart(2, "0")}_${safeName}`;
        sub.file(fileName, Buffer.from(base64, "base64"));
      } catch {
        // skip unreadable files silently
      }
    }
  }

  await addReceiptsToFolder(reimbursable, "receipts-reimbursable");
  await addReceiptsToFolder(nonReimbursable, "receipts-non-reimbursable");

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  // Store in R2 under reports/ prefix with a random key
  const token = randomUUID();
  const reportKey = `reports/${token}.zip`;
  await storage.storeBuffer({ key: reportKey, buffer: zipBuffer, mimeType: "application/zip" });

  // Download URL embeds trip number (for Content-Disposition filename) + token (unguessable key)
  const downloadUrl = `${siteUrl}/api/reports/download/${encodeURIComponent(trip.tripNumber)}/${token}`;

  await state.appendActivity({
    level: "info",
    scope: "report",
    message: `Trip ${trip.tripNumber} report ready`,
    documentName: null,
    details: { tripId, downloadUrl },
  });

  await sendReportReadyEmail({
    to: user.email,
    tripNumber: trip.tripNumber,
    tripTitle: trip.title,
    downloadUrl,
  });
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
