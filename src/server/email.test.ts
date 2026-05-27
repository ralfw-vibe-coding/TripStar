import { afterEach, describe, expect, it, vi } from "vitest";
import { sendOtpEmail } from "./email";

describe("sendOtpEmail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends OTP codes through Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("AUTH_FROM_EMAIL", "TripStar <login@example.com>");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    await sendOtpEmail({
      to: "ralf@example.com",
      otp: "123456",
      expiresAt: "2026-05-26T09:05:00.000Z",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer re_test" }),
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      from: "TripStar <login@example.com>",
      to: "ralf@example.com",
      subject: "Your TripStar login code",
    });
    expect(body.text).toContain("123456");
  });

  it("reports Resend failures", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("AUTH_FROM_EMAIL", "TripStar <login@example.com>");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad sender", { status: 403 }));

    await expect(
      sendOtpEmail({
        to: "ralf@example.com",
        otp: "123456",
        expiresAt: "2026-05-26T09:05:00.000Z",
      }),
    ).rejects.toThrow("Could not send OTP email: 403 bad sender");
  });
});
