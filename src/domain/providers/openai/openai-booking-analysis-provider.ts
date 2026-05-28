import type { AnalyzedBookingInput, BookingAnalysisProvider, BookingAnalysisResult, ReceiptInfo } from "../booking-analysis-provider";
import { projectExtractedBooking, type ExtractedBooking } from "../../extraction/booking-extraction";
import { localDateTimeToInstant, normalizeLocalDateTime } from "../../time/booking-time";

interface OpenAIResponsesPayload {
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  output_text?: string;
}

export class OpenAIBookingAnalysisProvider implements BookingAnalysisProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async analyzeText(text: string): Promise<BookingAnalysisResult> {
    if (!text.trim()) {
      return { bookings: [], receiptInfo: emptyReceipt() };
    }

    return this.createAnalysis([
      {
        type: "input_text",
        text,
      },
    ]);
  }

  async analyzeImage(input: { base64: string; mimeType: string }): Promise<BookingAnalysisResult> {
    if (!input.base64.trim()) {
      return { bookings: [], receiptInfo: emptyReceipt() };
    }

    return this.createAnalysis([
      {
        type: "input_text",
        text: "Extract travel bookings from this screenshot. Read visible text carefully.",
      },
      {
        type: "input_image",
        image_url: `data:${input.mimeType};base64,${input.base64}`,
        detail: "high",
      },
    ]);
  }

  async analyzePdf(input: { base64: string; originalFileName: string }): Promise<BookingAnalysisResult> {
    if (!input.base64.trim()) {
      return { bookings: [], receiptInfo: emptyReceipt() };
    }

    return this.createAnalysis([
      {
        type: "input_file",
        filename: input.originalFileName,
        file_data: `data:application/pdf;base64,${input.base64}`,
      },
      {
        type: "input_text",
        text: "Extract travel bookings from this PDF document. Read invoices, confirmations, receipts, and visible page content carefully.",
      },
    ]);
  }

  private async createAnalysis(content: Array<Record<string, unknown>>): Promise<BookingAnalysisResult> {
    const currentYear = this.now().getFullYear();
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            role: "system",
            content:
              `Extract travel bookings from the user's document into type-specific JSON. Return only JSON matching the requested schema. If no bookings are present, return an empty bookings array. Use exactly one type-specific object per booking and set the others to null. Important: when a document contains multiple flight segments of the same itinerary (e.g. connecting flights or a multi-leg journey with a layover), extract each individual flight segment as its own separate booking entry — even if they share a booking reference or ticket number. For flights, prefer structured flight data over prose: flight number, airline, airport IATA codes, airport names, cities, terminals, gates, departure and arrival times, booking reference, ticket number, passengers, seats, cabin, and baggage. Airport IATA codes are important: if the document names an airport or city and the commercial airport code is well-known, infer the IATA code and add a warning that it was inferred; leave it null only when genuinely uncertain. For every date or time found, always include the IANA timezone identifier (e.g. "Europe/Berlin", "Asia/Hong_Kong", "America/New_York") for the location where that time applies — derive it from the city, country, address, airport code, or any other location hint present in the document; leave null only when genuinely uncertain. Preserve extra useful source information in importantDetails. Add evidence entries for important fields using short source excerpts. Add warnings when a value is inferred, ambiguous, or missing. If a booking date has no year, assume ${currentYear}. Return date/time values as ISO 8601 strings whenever possible; otherwise keep the source date string so it can be normalized later. Also detect if the document is a payment receipt: set receipt.isReceipt to true if the document is or contains an invoice, bill, or proof of payment for a travel-related expense (e.g. hotel invoice, taxi, airline fee, conference fee, restaurant during travel). If isReceipt is true, extract: amount (total amount paid as a number), currency (ISO 4217 code, e.g. EUR), date (payment or invoice date as YYYY-MM-DD), purpose (brief description, e.g. "Hotel Berlin", "Taxi to airport"), type ("reimbursable" if a business expense to be reimbursed by an employer/client, "report_only" if to be declared but not reimbursed, null if unclear).`,
          },
          {
            role: "user",
            content,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "tripstar_booking_extraction",
            strict: true,
            schema: bookingExtractionSchema(),
          },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI booking analysis failed: ${response.status} ${body}`);
    }

    const payload = (await response.json()) as OpenAIResponsesPayload;
    const json = extractOutputText(payload);
    const parsed = JSON.parse(json) as { bookings: ExtractedBooking[]; receipt: RawReceipt };
    const bookings = parsed.bookings.map((extracted) => {
      const booking = projectExtractedBooking(extracted, { currentYear, normalizeDateTime });
      return {
        ...booking,
        extractedJson: {
          provider: "openai",
          model: this.model,
          extracted,
        },
      };
    });
    return { bookings, receiptInfo: parseReceiptInfo(parsed.receipt) };
  }
}

function bookingExtractionSchema(): Record<string, unknown> {
  const stringOrNull = { type: ["string", "null"] };
  const stringArray = { type: "array", items: { type: "string" } };
  const airport = {
    type: "object",
    additionalProperties: false,
    required: ["code", "name", "city", "terminal", "gate"],
    properties: {
      code: stringOrNull,
      name: stringOrNull,
      city: stringOrNull,
      terminal: stringOrNull,
      gate: stringOrNull,
    },
  };
  const flight = {
    type: ["object", "null"],
    additionalProperties: false,
    required: [
      "flightNumber",
      "airline",
      "airlineCode",
      "departure",
      "arrival",
      "departureAtLocal",
      "arrivalAtLocal",
      "boardingAtLocal",
      "departureTimeZone",
      "arrivalTimeZone",
      "bookingReference",
      "ticketNumber",
      "passengers",
      "seats",
      "cabinClass",
      "baggage",
    ],
    properties: {
      flightNumber: stringOrNull,
      airline: stringOrNull,
      airlineCode: stringOrNull,
      departure: airport,
      arrival: airport,
      departureAtLocal: stringOrNull,
      arrivalAtLocal: stringOrNull,
      boardingAtLocal: stringOrNull,
      departureTimeZone: stringOrNull,
      arrivalTimeZone: stringOrNull,
      bookingReference: stringOrNull,
      ticketNumber: stringOrNull,
      passengers: stringArray,
      seats: stringArray,
      cabinClass: stringOrNull,
      baggage: stringOrNull,
    },
  };
  const train = {
    type: ["object", "null"],
    additionalProperties: false,
    required: [
      "trainNumber",
      "operator",
      "fromStation",
      "toStation",
      "departureAtLocal",
      "arrivalAtLocal",
      "departureTimeZone",
      "arrivalTimeZone",
      "bookingReference",
      "passengers",
      "seats",
    ],
    properties: {
      trainNumber: stringOrNull,
      operator: stringOrNull,
      fromStation: stringOrNull,
      toStation: stringOrNull,
      departureAtLocal: stringOrNull,
      arrivalAtLocal: stringOrNull,
      departureTimeZone: stringOrNull,
      arrivalTimeZone: stringOrNull,
      bookingReference: stringOrNull,
      passengers: stringArray,
      seats: stringArray,
    },
  };
  const lodging = {
    type: ["object", "null"],
    additionalProperties: false,
    required: [
      "propertyName",
      "address",
      "city",
      "checkInAtLocal",
      "checkOutAtLocal",
      "timeZone",
      "bookingReference",
      "guests",
      "phone",
      "cancellationDeadlineAtLocal",
    ],
    properties: {
      propertyName: stringOrNull,
      address: stringOrNull,
      city: stringOrNull,
      checkInAtLocal: stringOrNull,
      checkOutAtLocal: stringOrNull,
      timeZone: stringOrNull,
      bookingReference: stringOrNull,
      guests: stringArray,
      phone: stringOrNull,
      cancellationDeadlineAtLocal: stringOrNull,
    },
  };
  const generic = {
    type: ["object", "null"],
    additionalProperties: false,
    required: ["providerName", "serviceIdentifier", "fromText", "toText", "startAtLocal", "endAtLocal", "startTimeZone", "endTimeZone", "people"],
    properties: {
      providerName: stringOrNull,
      serviceIdentifier: stringOrNull,
      fromText: stringOrNull,
      toText: stringOrNull,
      startAtLocal: stringOrNull,
      endAtLocal: stringOrNull,
      startTimeZone: stringOrNull,
      endTimeZone: stringOrNull,
      people: stringArray,
    },
  };
  const evidence = {
    type: "object",
    additionalProperties: false,
    required: ["field", "value", "sourceText", "page"],
    properties: {
      field: { type: "string" },
      value: { type: "string" },
      sourceText: { type: "string" },
      page: { type: ["number", "null"] },
    },
  };

  return {
    type: "object",
    additionalProperties: false,
    required: ["bookings", "receipt"],
    properties: {
      bookings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "type",
            "summary",
            "flight",
            "train",
            "lodging",
            "rentalCar",
            "ferry",
            "event",
            "other",
            "importantDetails",
            "evidence",
            "warnings",
            "confidence",
          ],
          properties: {
            type: { type: "string", enum: ["flight", "lodging", "train", "rental_car", "ferry", "event", "other"] },
            summary: { type: "string" },
            flight,
            train,
            lodging,
            rentalCar: generic,
            ferry: generic,
            event: generic,
            other: generic,
            importantDetails: stringArray,
            evidence: { type: "array", items: evidence },
            warnings: stringArray,
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
      receipt: {
        type: "object",
        additionalProperties: false,
        required: ["isReceipt", "amount", "currency", "date", "purpose", "type"],
        properties: {
          isReceipt: { type: "boolean" },
          amount: { type: ["number", "null"] },
          currency: { type: ["string", "null"] },
          date: { type: ["string", "null"] },
          purpose: { type: ["string", "null"] },
          type: { type: ["string", "null"] },
        },
      },
    },
  };
}

interface RawReceipt {
  isReceipt: boolean;
  amount: number | null;
  currency: string | null;
  date: string | null;
  purpose: string | null;
  type: string | null;
}

function emptyReceipt(): ReceiptInfo {
  return { isReceipt: false, receiptAmount: null, receiptCurrency: null, receiptDate: null, receiptPurpose: null, receiptType: null };
}

function parseReceiptInfo(raw: RawReceipt | null | undefined): ReceiptInfo {
  if (!raw || !raw.isReceipt) return emptyReceipt();
  return {
    isReceipt: true,
    receiptAmount: typeof raw.amount === "number" && Number.isFinite(raw.amount) ? raw.amount : null,
    receiptCurrency: raw.currency ?? null,
    receiptDate: raw.date ?? null,
    receiptPurpose: raw.purpose ?? null,
    receiptType: raw.type === "reimbursable" || raw.type === "report_only" ? raw.type : null,
  };
}

function extractOutputText(payload: OpenAIResponsesPayload): string {
  if (payload.output_text) {
    return payload.output_text;
  }

  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text" || content.text)?.text;
  if (!text) {
    throw new Error("OpenAI booking analysis returned no text output.");
  }
  return text;
}

export function normalizeDateTime(value: string | null, currentYear: number, timeZone?: string | null): string | null {
  if (!value) return null;
  if (timeZone) {
    const localDateTime = normalizeLocalDateTime(value, currentYear);
    return localDateTime ? localDateTimeToInstant(localDateTime, timeZone) : null;
  }
  const germanDate = /^(\d{1,2})\.(\d{1,2})\.?(?:\s+(\d{1,2}):(\d{2}))?$/.exec(value.trim());
  if (germanDate) {
    const [, day, month, hour = "0", minute = "0"] = germanDate;
    return new Date(Date.UTC(currentYear, Number(month) - 1, Number(day), Number(hour), Number(minute))).toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (!/\b\d{4}\b/.test(value)) {
    parsed.setUTCFullYear(currentYear);
  }
  return parsed.toISOString();
}
