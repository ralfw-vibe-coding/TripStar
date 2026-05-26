import type { AnalyzedBookingInput, BookingAnalysisProvider } from "../booking-analysis-provider";

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

  async analyzeText(text: string): Promise<AnalyzedBookingInput[]> {
    if (!text.trim()) {
      return [];
    }

    return this.createAnalysis([
      {
        type: "input_text",
        text,
      },
    ]);
  }

  async analyzeImage(input: { base64: string; mimeType: string }): Promise<AnalyzedBookingInput[]> {
    if (!input.base64.trim()) {
      return [];
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

  private async createAnalysis(content: Array<Record<string, unknown>>): Promise<AnalyzedBookingInput[]> {
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
              `Extract travel bookings from the user's text. Return only JSON matching the requested schema. If no bookings are present, return an empty bookings array. If a booking date has no year, assume ${currentYear}. Return date/time values as ISO 8601 strings whenever possible.`,
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
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["bookings"],
              properties: {
                bookings: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "type",
                      "title",
                      "startAt",
                      "endAt",
                      "fromText",
                      "toText",
                      "travelers",
                      "serviceIdentifier",
                      "operator",
                      "details",
                    ],
                    properties: {
                      type: {
                        type: "string",
                        enum: ["flight", "lodging", "train", "rental_car", "ferry", "event", "other"],
                      },
                      title: { type: "string" },
                      startAt: { type: ["string", "null"] },
                      endAt: { type: ["string", "null"] },
                      fromText: { type: ["string", "null"] },
                      toText: { type: ["string", "null"] },
                      travelers: { type: "array", items: { type: "string" } },
                      serviceIdentifier: { type: ["string", "null"] },
                      operator: { type: ["string", "null"] },
                      details: { type: "string" },
                    },
                  },
                },
              },
            },
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
    const parsed = JSON.parse(json) as { bookings: Array<Omit<AnalyzedBookingInput, "extractedJson">> };
    return parsed.bookings.map((booking) => ({
      ...booking,
      startAt: normalizeDateTime(booking.startAt, currentYear),
      endAt: normalizeDateTime(booking.endAt, currentYear),
      extractedJson: { provider: "openai", model: this.model },
    }));
  }
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

export function normalizeDateTime(value: string | null, currentYear: number): string | null {
  if (!value) return null;
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
