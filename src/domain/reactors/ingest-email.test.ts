import { describe, expect, it } from "vitest";
import type { IngestPart, User } from "../model";
import { LocalStateProvider } from "../providers/local/local-state-provider";
import { receiveIngestPart } from "./ingest-email";

const now = "2026-06-17T09:00:00.000Z";

const user: User = {
  id: "user_ralf",
  email: "ralf@example.com",
  shortCode: "RW",
  name: null,
  companyName: null,
  jobPosition: null,
  signatureEmployee: null,
  signatureManager: null,
  createdAt: now,
  updatedAt: now,
};

const ingestPart: IngestPart = {
  txId: "email_1",
  part: 1,
  of: 1,
  sender: "work@example.com",
  document: {
    filename: "email-body.txt",
    mimeType: "text/plain",
    data: Buffer.from("booking").toString("base64"),
  },
};

describe("email ingest receiving", () => {
  it("accepts sender addresses from the ingest email allowlist", async () => {
    const state = new LocalStateProvider({
      now: () => new Date(now),
      users: [user],
      ingestEmailAddresses: [
        { email: "work@example.com", userId: user.id, isPrimary: false, createdAt: now },
      ],
    });

    await expect(receiveIngestPart(state, ingestPart)).resolves.toEqual({ status: "ready_to_process", userId: user.id });
  });

  it("rejects sender addresses that are not in the ingest email allowlist", async () => {
    const state = new LocalStateProvider({
      now: () => new Date(now),
      users: [user],
      ingestEmailAddresses: [],
    });

    await expect(receiveIngestPart(state, ingestPart)).resolves.toEqual({ status: "unknown_sender" });
  });
});
