import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeDateTime, OpenAIBookingAnalysisProvider } from "./openai-booking-analysis-provider";

describe("normalizeDateTime", () => {
  it("uses the current year for German dates without a year", () => {
    expect(normalizeDateTime("03.07. 09:30", 2026)).toBe("2026-07-03T09:30:00.000Z");
    expect(normalizeDateTime("04.07.", 2026)).toBe("2026-07-04T00:00:00.000Z");
  });

  it("keeps explicit years intact", () => {
    expect(normalizeDateTime("2027-07-03T09:30:00.000Z", 2026)).toBe("2027-07-03T09:30:00.000Z");
  });
});

describe("OpenAIBookingAnalysisProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tells OpenAI which year to assume for yearless dates", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            bookings: [
              {
                type: "flight",
                title: "Flight",
                startAt: "03.07. 09:30",
                endAt: null,
                fromText: "Sofia",
                toText: "Berlin",
                travelers: [],
                serviceIdentifier: null,
                operator: null,
                details: "Flight",
              },
            ],
          }),
        }),
        { status: 200 },
      ),
    );
    const provider = new OpenAIBookingAnalysisProvider("sk-test", "gpt-test", () => new Date("2026-05-26T12:00:00.000Z"));

    const bookings = await provider.analyzeText("Flug am 03.07. um 09:30");

    expect(bookings[0].startAt).toBe("2026-07-03T09:30:00.000Z");
    expect(JSON.stringify(fetchMock.mock.calls[0][1]?.body)).toContain("assume 2026");
  });

  it("sends screenshots as image inputs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ output_text: JSON.stringify({ bookings: [] }) }), { status: 200 }),
    );
    const provider = new OpenAIBookingAnalysisProvider("sk-test", "gpt-test", () => new Date("2026-05-26T12:00:00.000Z"));

    await provider.analyzeImage({ base64: "aW1hZ2U=", mimeType: "image/png" });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.input[1].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "input_image",
          image_url: "data:image/png;base64,aW1hZ2U=",
          detail: "high",
        }),
      ]),
    );
  });

  it("sends PDFs as file inputs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ output_text: JSON.stringify({ bookings: [] }) }), { status: 200 }),
    );
    const provider = new OpenAIBookingAnalysisProvider("sk-test", "gpt-test", () => new Date("2026-05-26T12:00:00.000Z"));

    await provider.analyzePdf({ base64: "JVBERi0=", originalFileName: "booking.pdf" });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.input[1].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "input_file",
          filename: "booking.pdf",
          file_data: "data:application/pdf;base64,JVBERi0=",
        }),
      ]),
    );
  });
});
