import type { Booking } from "../model";

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

export interface BookingAnalysisProvider {
  analyzeText(text: string): Promise<AnalyzedBookingInput[]>;
  analyzeImage(input: { base64: string; mimeType: string }): Promise<AnalyzedBookingInput[]>;
  analyzePdf(input: { base64: string; originalFileName: string }): Promise<AnalyzedBookingInput[]>;
}
