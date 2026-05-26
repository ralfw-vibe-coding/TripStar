import type { AnalyzedBookingInput } from "../providers/booking-analysis-provider";

export function deduplicateAnalyzedBookings(bookings: AnalyzedBookingInput[]): AnalyzedBookingInput[] {
  const byKey = new Map<string, AnalyzedBookingInput>();
  for (const booking of bookings) {
    const key = duplicateKey(booking);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, booking);
      continue;
    }
    byKey.set(key, mergeAnalyzedBookings(existing, booking));
  }
  return [...byKey.values()];
}

function duplicateKey(booking: AnalyzedBookingInput): string {
  return [
    booking.type,
    normalizeKeyPart(booking.serviceIdentifier),
    normalizeKeyPart(booking.startAt),
    normalizeKeyPart(booking.endAt),
    normalizeKeyPart(booking.fromText),
    normalizeKeyPart(booking.toText),
    normalizeKeyPart(booking.title),
  ].join("|");
}

function mergeAnalyzedBookings(left: AnalyzedBookingInput, right: AnalyzedBookingInput): AnalyzedBookingInput {
  return {
    ...left,
    travelers: unique([...left.travelers, ...right.travelers]),
    details: unique([...lines(left.details), ...lines(right.details)]).join("\n"),
    extractedJson: mergeExtractedJson(left.extractedJson, right.extractedJson),
  };
}

function mergeExtractedJson(left: unknown, right: unknown): unknown {
  if (!left || !right) return left ?? right;
  return { primary: left, duplicates: [right] };
}

function normalizeKeyPart(value: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
