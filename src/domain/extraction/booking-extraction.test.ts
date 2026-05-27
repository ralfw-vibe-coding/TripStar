import { describe, expect, it } from "vitest";
import { projectExtractedBooking, type ExtractedBooking } from "./booking-extraction";
import { normalizeDateTime } from "../providers/openai/openai-booking-analysis-provider";

describe("projectExtractedBooking", () => {
  it("projects flight-specific JSON into the booking surface", () => {
    const extracted: ExtractedBooking = {
      type: "flight",
      summary: "Lufthansa flight from Sofia to Frankfurt",
      flight: {
        flightNumber: "LH1429",
        airline: "Lufthansa",
        airlineCode: "LH",
        departure: {
          code: "SOF",
          name: "Sofia Airport",
          city: "Sofia",
          terminal: "2",
          gate: "B4",
        },
        arrival: {
          code: "FRA",
          name: "Frankfurt Airport",
          city: "Frankfurt",
          terminal: "1",
          gate: null,
        },
        departureAtLocal: "03.07. 06:00",
        arrivalAtLocal: "03.07. 07:35",
        boardingAtLocal: "03.07. 05:25",
        bookingReference: "ABC123",
        ticketNumber: "2201234567890",
        passengers: ["Ralf Westphal"],
        seats: ["12A"],
        cabinClass: "Economy",
        baggage: "1 checked bag",
      },
      train: null,
      lodging: null,
      rentalCar: null,
      ferry: null,
      event: null,
      other: null,
      importantDetails: ["Check-in closes 45 minutes before departure."],
      evidence: [{ field: "flight.flightNumber", value: "LH1429", sourceText: "Flight LH1429", page: 1 }],
      warnings: [],
      confidence: 0.93,
    };

    const booking = projectExtractedBooking(extracted, { currentYear: 2026, normalizeDateTime });

    expect(booking).toMatchObject({
      type: "flight",
      title: "SOF -> FRA",
      startAt: "2026-07-03T03:00:00.000Z",
      endAt: "2026-07-03T05:35:00.000Z",
      fromText: "SOF · Sofia",
      toText: "FRA · Frankfurt",
      travelers: ["Ralf Westphal"],
      serviceIdentifier: "LH1429",
      operator: "Lufthansa",
    });
    expect(booking.timePoints).toMatchObject([
      {
        label: "departure",
        localDateTime: "2026-07-03T06:00",
        timeZone: "Europe/Sofia",
        instant: "2026-07-03T03:00:00.000Z",
      },
      {
        label: "arrival",
        localDateTime: "2026-07-03T07:35",
        timeZone: "Europe/Berlin",
        instant: "2026-07-03T05:35:00.000Z",
      },
    ]);
    expect(booking.details).toContain("Departure: SOF · Sofia Airport, Terminal 2, Gate B4");
    expect(booking.details).toContain("Ticket number: 2201234567890");
    expect(booking.extractedJson).toMatchObject({ type: "flight", confidence: 0.93 });
  });

  it("projects lodging JSON and preserves rich details", () => {
    const extracted: ExtractedBooking = {
      type: "lodging",
      summary: "Hotel stay in Hamburg",
      flight: null,
      train: null,
      lodging: {
        propertyName: "Hotel Hafenblick",
        address: "Am Hafen 1",
        city: "Hamburg",
        checkInAtLocal: "2026-07-10T15:00:00",
        checkOutAtLocal: "2026-07-12T11:00:00",
        bookingReference: "HOTEL-42",
        guests: ["Ralf Westphal"],
        phone: "+49 40 123456",
        cancellationDeadlineAtLocal: "2026-07-09T18:00:00",
      },
      rentalCar: null,
      ferry: null,
      event: null,
      other: null,
      importantDetails: ["Breakfast included."],
      evidence: [],
      warnings: ["City tax may be due at check-in."],
      confidence: 0.88,
    };

    const booking = projectExtractedBooking(extracted, { currentYear: 2026, normalizeDateTime });

    expect(booking).toMatchObject({
      type: "lodging",
      title: "Hotel Hafenblick",
      fromText: "Am Hafen 1",
      toText: "Hamburg",
      serviceIdentifier: "HOTEL-42",
      operator: "Hotel Hafenblick",
    });
    expect(booking.details).toContain("Phone: +49 40 123456");
    expect(booking.details).toContain("Breakfast included.");
    expect(booking.details).toContain("Warnings: City tax may be due at check-in.");
  });
});
