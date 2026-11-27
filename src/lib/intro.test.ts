import { describe, expect, it, vi } from "vitest";
import { introFinished, markIntroFinished, waitUntil } from "./intro";

describe("intro once per launch", () => {
  it("is not finished at the start of a launch and is finished after it plays", () => {
    expect(introFinished()).toBe(false);
    markIntroFinished();
    expect(introFinished()).toBe(true);
  });
});

describe("waitUntil", () => {
  it("resolves true as soon as the condition holds", async () => {
    vi.useFakeTimers();
    let ready = false;
    const pending = waitUntil(() => ready, 1000, 50);
    ready = true;
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toBe(true);
    vi.useRealTimers();
  });

  it("gives up after the cap so a missing ready event never blocks the intro", async () => {
    vi.useFakeTimers();
    const pending = waitUntil(() => false, 200, 50);
    await vi.advanceTimersByTimeAsync(300);
    await expect(pending).resolves.toBe(false);
    vi.useRealTimers();
  });
});
