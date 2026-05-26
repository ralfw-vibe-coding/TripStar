import { describe, expect, it } from "vitest";
import { getStateProvider, setStateProviderForTests } from "./provider-factory";

describe("provider factory", () => {
  it("keeps local state in a process-wide provider", async () => {
    setStateProviderForTests(null);
    const firstProvider = getStateProvider();
    const secondProvider = getStateProvider();

    expect(secondProvider).toBe(firstProvider);
  });
});
