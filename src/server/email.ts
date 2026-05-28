export interface OtpEmailInput {
  to: string;
  otp: string;
  expiresAt: string;
}

export interface ReportReadyEmailInput {
  to: string;
  tripNumber: string;
  tripTitle: string;
  downloadUrl: string;
}

export interface IngestErrorEmailInput {
  to: string;
  errorMessage: string;
  filename?: string;
  txId?: string;
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
      subject: "Your TripStar sign-in code",
      text: [
        "Your TripStar sign-in code:",
        "",
        input.otp,
        "",
        `This code expires at ${new Date(input.expiresAt).toLocaleString("de-DE")}.`,
      ].join("\n"),
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px 24px;color:#18212f">
          <p style="margin:0 0 16px">Your TripStar sign-in code:</p>
          <p style="margin:24px 0;font-size:36px;font-weight:700;letter-spacing:8px;text-align:center;
                     background:#f3f4f6;border-radius:8px;padding:16px 0">${input.otp}</p>
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280">
            This code expires at ${new Date(input.expiresAt).toLocaleString("de-DE")}.
          </p>
        </div>
      `.trim(),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Could not send OTP email: ${response.status} ${body}`);
  }
}

export async function sendReportReadyEmail(input: ReportReadyEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_FROM_EMAIL;
  if (!apiKey || !from) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: `TripStar: Report for Trip #${input.tripNumber} ready`,
      text: [
        `Your report for Trip #${input.tripNumber} — ${input.tripTitle} is ready.`,
        "",
        `Download: ${input.downloadUrl}`,
        "",
        "The link can be forwarded directly to your tax advisor.",
      ].join("\n"),
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px 24px;color:#18212f">
          <p style="margin:0 0 8px">Your report is ready:</p>
          <p style="margin:0 0 20px;font-weight:700">Trip #${input.tripNumber} — ${input.tripTitle}</p>
          <a href="${input.downloadUrl}"
             style="display:inline-block;padding:12px 24px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
            Download report (ZIP)
          </a>
          <p style="margin:20px 0 0;font-size:13px;color:#6b7280">
            You can forward this email or the link directly to your tax advisor.
          </p>
        </div>
      `.trim(),
    }),
  });
}

export async function sendIngestErrorEmail(input: IngestErrorEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_FROM_EMAIL;
  if (!apiKey || !from) return; // silently skip if not configured

  const lines = [
    "TripStar konnte ein weitergeleitetes Dokument nicht verarbeiten.",
    "",
    input.filename ? `Dokument: ${input.filename}` : null,
    input.txId ? `Message-ID: ${input.txId}` : null,
    "",
    "Fehler:",
    input.errorMessage,
    "",
    "Bitte leite das Dokument erneut weiter oder öffne es direkt in TripStar.",
  ].filter((line) => line !== null).join("\n");

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: "TripStar: Fehler beim Email-Import",
      text: lines,
    }),
  });
  // Errors are swallowed intentionally — notification is best-effort
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
