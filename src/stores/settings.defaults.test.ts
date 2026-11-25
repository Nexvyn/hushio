import { describe, expect, it } from "vitest";
import { useSettings } from "./settings";

describe("settings defaults", () => {
  it("turns AutoPlay and restoring the queue on for a fresh install", () => {
    const state = useSettings.getState();
    expect(state.autoplay).toBe(true);
    expect(state.restoreQueueOnRestart).toBe(true);
  });

  it("falls back to the defaults when a stored value is not a boolean", () => {
    const merged = useSettings.persist.getOptions().merge?.(
      { autoplay: "no", restoreQueueOnRestart: null },
      useSettings.getState(),
    ) as { autoplay: boolean; restoreQueueOnRestart: boolean };
    expect(merged.autoplay).toBe(true);
    expect(merged.restoreQueueOnRestart).toBe(true);
  });
});
