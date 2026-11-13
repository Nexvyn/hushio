import { describe, expect, it } from "vitest";

import { discordNote } from "./discord";

describe("discord note", () => {
  it("says the build has no client id", () => {
    expect(discordNote({ available: false, enabled: false, connected: false })).toBe(
      "Discord isn't set up in this build.",
    );
  });

  it("says Discord is listening when it is connected", () => {
    expect(discordNote({ available: true, enabled: true, connected: true })).toBe(
      "Discord is running and listening.",
    );
  });

  it("says Discord isn't running when it is not connected", () => {
    expect(discordNote({ available: true, enabled: true, connected: false })).toBe(
      "Discord isn't running right now. This turns on by itself when it starts.",
    );
  });
});
