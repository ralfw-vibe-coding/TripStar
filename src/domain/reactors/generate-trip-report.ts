import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import JSZip from "jszip";
import { randomUUID } from "node:crypto";
import type { Id } from "../model";
import type { TripStarStateProvider } from "../providers/state-provider";
import type { DocumentStorageProvider } from "../providers/document-storage-provider";
import { SbOrderDocument } from "../reports/sb-order-pdf";
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

  // Generate Sb Order PDF
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbOrderPdf = await renderToBuffer(
    React.createElement(SbOrderDocument, { trip, user }) as any,
  );

  // Build ZIP
  const zip = new JSZip();
  zip.file(`order #${trip.tripNumber}.pdf`, sbOrderPdf);
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
