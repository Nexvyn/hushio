import { afterEach, describe, expect, it, vi } from "vitest";
import { playFailedMessage } from "./playFailed";

afterEach(() => vi.restoreAllMocks());

describe("playFailedMessage", () => {
  it("names the song when online", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    expect(playFailedMessage("Song")).toBe(`Couldn't play "Song"`);
  });

  it("says the phone is offline when there is no connection", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    expect(playFailedMessage("Song")).toBe("You're offline. Connect to play this song.");
  });
});
