import type { Booking, DocumentRecord } from "../model";

export interface AnalyzedBookingInput {
  type: Booking["type"];
  title: string;
  startAt: string | null;
  endAt: string | null;
  timePoints?: Booking["timePoints"];
  fromText: string | null;
  toText: string | null;
  travelers: string[];
  serviceIdentifier: string | null;
  operator: string | null;
  details: string;
  extractedJson: unknown | null;
}

/** Receipt fields extracted from a document by the analysis provider. */
export interface ReceiptInfo {
  isReceipt: boolean;
  receiptAmount: number | null;
  receiptCurrency: string | null;
  receiptDate: string | null;
  receiptPurpose: string | null;
  receiptType: DocumentRecord["receiptType"];
}

export const emptyReceiptInfo: ReceiptInfo = {
  isReceipt: false,
  receiptAmount: null,
  receiptCurrency: null,
  receiptDate: null,
  receiptPurpose: null,
  receiptType: null,
};

export interface BookingAnalysisResult {
  bookings: AnalyzedBookingInput[];
  receiptInfo: ReceiptInfo;
}

export interface BookingAnalysisProvider {
  analyzeText(text: string): Promise<BookingAnalysisResult>;
  analyzeImage(input: { base64: string; mimeType: string }): Promise<BookingAnalysisResult>;
  analyzePdf(input: { base64: string; originalFileName: string }): Promise<BookingAnalysisResult>;
}
