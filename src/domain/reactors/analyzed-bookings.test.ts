import { describe, expect, it } from "vitest";
import { deduplicateAnalyzedBookings } from "./analyzed-bookings";
import type { AnalyzedBookingInput } from "../providers/booking-analysis-provider";

function booking(overrides: Partial<AnalyzedBookingInput> = {}): AnalyzedBookingInput {
  return {
    type: "flight",
    title: "DAD -> KTI",
    startAt: "2026-04-13T19:30:00.000Z",
    endAt: "2026-04-13T21:55:00.000Z",
    fromText: "DAD · Da Nang",
    toText: "KTI · Phnom Penh",
    travelers: ["Ralf"],
    serviceIdentifier: "K6843",
    operator: "Cambodia Angkor Air",
    details: "Ticket number: 123",
    extractedJson: { page: 1 },
    ...overrides,
  };
}

describe("deduplicateAnalyzedBookings", () => {
  it("merges duplicate bookings extracted from the same document", () => {
    const deduplicated = deduplicateAnalyzedBookings([
      booking(),
      booking({
        travelers: ["Birgit"],
        details: "Ticket number: 123\nSeat: 14A",
        extractedJson: { page: 2 },
      }),
    ]);

    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]).toMatchObject({
      serviceIdentifier: "K6843",
      travelers: ["Ralf", "Birgit"],
    });
    expect(deduplicated[0].details).toBe("Ticket number: 123\nSeat: 14A");
    expect(deduplicated[0].extractedJson).toMatchObject({ primary: { page: 1 }, duplicates: [{ page: 2 }] });
  });

  it("keeps distinct bookings with different times", () => {
    const deduplicated = deduplicateAnalyzedBookings([booking(), booking({ startAt: "2026-04-14T19:30:00.000Z" })]);

    expect(deduplicated).toHaveLength(2);
  });
});
