import { describe, expect, it } from "vitest";
import { parseEnvFile } from "./local-env";

describe("parseEnvFile", () => {
  it("parses plain, quoted, exported, and commented environment values", () => {
    expect(
      parseEnvFile(`
        # ignored
        OPENAI_API_KEY=sk-test
        OPENAI_MODEL="gpt-5.4-mini"
        export LOCAL_PERSISTENCE_DIR=./data # local files
        INVALID LINE
      `),
    ).toEqual({
      OPENAI_API_KEY: "sk-test",
      OPENAI_MODEL: "gpt-5.4-mini",
      LOCAL_PERSISTENCE_DIR: "./data",
    });
  });
});
