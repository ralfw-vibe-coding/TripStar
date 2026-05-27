export interface OtpEmailInput {
  to: string;
  otp: string;
  expiresAt: string;
}

export async function sendOtpEmail(input: OtpEmailInput): Promise<void> {
  const apiKey = requiredEnv("RESEND_API_KEY");
  const from = requiredEnv("AUTH_FROM_EMAIL");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: "Your TripStar login code",
      text: `Your TripStar login code is ${input.otp}.\n\nIt expires at ${new Date(input.expiresAt).toLocaleString("de-DE")}.`,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Could not send OTP email: ${response.status} ${body}`);
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
