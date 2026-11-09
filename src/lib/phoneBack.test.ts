import { describe, expect, it } from "vitest";
import { EXIT_WINDOW_MS, nextArmedAt, resolveBack, type BackInput } from "./phoneBack";

const base: BackInput = { sheetOpen: false, nowPlayingOpen: false, canGoBack: false, atHome: true, armedAt: null, now: 10_000 };

describe("resolveBack", () => {
  it("closes the top sheet first, then Now Playing", () => {
    expect(resolveBack({ ...base, sheetOpen: true, nowPlayingOpen: true, canGoBack: true })).toBe("close-sheet");
    expect(resolveBack({ ...base, nowPlayingOpen: true, canGoBack: true })).toBe("close-now-playing");
  });

  it("goes back one history entry before arming an exit", () => {
    expect(resolveBack({ ...base, canGoBack: true, atHome: false })).toBe("history-back");
  });

  it("returns to Home when there is no history and the view is elsewhere", () => {
    expect(resolveBack({ ...base, atHome: false })).toBe("go-home");
  });

  it("arms an exit at Home and exits on a second back within 2 s", () => {
    expect(resolveBack(base)).toBe("arm-exit");
    const armed = { ...base, armedAt: 10_000 };
    expect(resolveBack({ ...armed, now: 10_000 + EXIT_WINDOW_MS })).toBe("exit");
    expect(resolveBack({ ...armed, now: 10_000 + EXIT_WINDOW_MS + 1 })).toBe("arm-exit");
  });
});

describe("nextArmedAt", () => {
  it("keeps the timer only after arming an exit", () => {
    expect(nextArmedAt("arm-exit", 5)).toBe(5);
    expect(nextArmedAt("history-back", 5)).toBeNull();
    expect(nextArmedAt("exit", 5)).toBeNull();
  });
});
