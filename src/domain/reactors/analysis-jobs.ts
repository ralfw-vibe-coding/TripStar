import type { AnalysisJob, Id } from "../model";
import type { BookingAnalysisProvider } from "../providers/booking-analysis-provider";
import type { DocumentStorageProvider } from "../providers/document-storage-provider";
import type { TripStarStateProvider } from "../providers/state-provider";
import { submitImageDocument, type SubmitImageDocumentInput } from "./submit-image-document";
import { submitPdfDocuments, type SubmitPdfDocumentsInput } from "./submit-pdf-documents";
import { submitTextDocument, type SubmitTextDocumentInput } from "./submit-text-document";

export type SubmitAnalysisJobInput =
  | ({ sourceType: "text"; documentName?: string } & SubmitTextDocumentInput)
  | ({ sourceType: "screenshot"; documentName?: string } & SubmitImageDocumentInput)
  | ({ sourceType: "pdf"; documentName?: string } & SubmitPdfDocumentsInput);

export interface SubmitAnalysisJobResult {
  job: AnalysisJob;
}

export async function submitAnalysisJob(
  state: TripStarStateProvider,
  storage: DocumentStorageProvider,
  analyzer: BookingAnalysisProvider,
  input: SubmitAnalysisJobInput,
): Promise<SubmitAnalysisJobResult> {
  const job = await state.createAnalysisJob({
    sourceType: input.sourceType,
    documentName: input.documentName ?? defaultDocumentName(input),
    tripId: input.tripId,
    currentUserId: input.currentUserId,
  });
  await appendAnalysisActivity(state, job, "queued", null, null);

  queueAnalysisJob(() => processAnalysisJob(state, storage, analyzer, job.id, input));
  return { job };
}

export async function processAnalysisJob(
  state: TripStarStateProvider,
  storage: DocumentStorageProvider,
  analyzer: BookingAnalysisProvider,
  jobId: Id,
  input: SubmitAnalysisJobInput,
): Promise<void> {
  const runningJob = await state.updateAnalysisJob(jobId, { status: "running" });
  await appendAnalysisActivity(state, runningJob, "running", null, null);
  try {
    const result =
      input.sourceType === "text"
        ? await submitTextDocument(state, storage, analyzer, input)
        : input.sourceType === "screenshot"
        ? await submitImageDocument(state, storage, analyzer, input)
        : await submitPdfDocuments(state, storage, analyzer, input);

    const doneJob = await state.updateAnalysisJob(jobId, {
      status: "done",
      bookingCount: result.bookings.length,
      error: null,
      completedAt: new Date().toISOString(),
    });
    await appendAnalysisActivity(state, doneJob, "done", result.bookings.length, null);
  } catch (error) {
    const errorText = errorMessage(error);
    const failedJob = await state.updateAnalysisJob(jobId, {
      status: "failed",
      bookingCount: null,
      error: errorText,
      completedAt: new Date().toISOString(),
    });
    await appendAnalysisActivity(state, failedJob, "failed", null, errorText);
  }
}

function queueAnalysisJob(work: () => Promise<void>): void {
  setTimeout(() => {
    void work();
  }, 0);
}

function defaultDocumentName(input: SubmitAnalysisJobInput): string {
  if (input.sourceType === "text") return "Texteingabe";
  if (input.sourceType === "screenshot") return "Clipboard screenshot";
  if (input.documents.length === 1) return input.documents[0]?.originalFileName ?? "PDF document";
  return `${input.documents.length} PDF documents`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function appendAnalysisActivity(
  state: TripStarStateProvider,
  job: AnalysisJob,
  status: AnalysisJob["status"],
  bookingCount: number | null,
  error: string | null,
): Promise<unknown> {
  return state.appendActivity({
    level: status === "failed" ? "error" : "info",
    scope: "analysis",
    message: analysisMessage(job.documentName, status, bookingCount, error),
    documentName: job.documentName,
    details: {
      analysisJobId: job.id,
      status,
      sourceType: job.sourceType,
      bookingCount,
      tripId: job.tripId,
      error,
    },
  });
}

function analysisMessage(documentName: string, status: AnalysisJob["status"], bookingCount: number | null, error: string | null): string {
  if (status === "queued") return `${documentName} queued for analysis`;
  if (status === "running") return `${documentName} is being analyzed`;
  if (status === "failed") return error ?? `${documentName} analysis failed`;
  if (bookingCount === 0) return `${documentName} analyzed, no bookings extracted`;
  if (bookingCount === 1) return `${documentName} analyzed and created 1 booking`;
  if (bookingCount !== null) return `${documentName} analyzed and created ${bookingCount} bookings`;
  return `${documentName} analyzed`;
}
