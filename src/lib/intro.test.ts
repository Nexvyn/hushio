import { describe, expect, it, vi } from "vitest";
import { introFinished, introPlan, markIntroFinished, waitUntil } from "./intro";
import { DURATION_MS, INTRO_HOLD_MS, INTRO_POLL_MS, INTRO_READY_CAP_MS } from "./motion";

describe("launch intro plan (PRD 30, 28A.10.K)", () => {
  it("glides the logo to the top bar on desktop when the target exists", () => {
    expect(introPlan({ reduce: false, platform: "windows", hasTarget: true }).glide).toBe(true);
    expect(introPlan({ reduce: false, platform: "linux", hasTarget: true }).glide).toBe(true);
  });

  it("skips the glide under Reduce Motion", () => {
    expect(introPlan({ reduce: true, platform: "windows", hasTarget: true }).glide).toBe(false);
  });

  it("skips the glide on Android phones and when no target is mounted", () => {
    expect(introPlan({ reduce: false, platform: "android", hasTarget: true }).glide).toBe(false);
    expect(introPlan({ reduce: false, platform: "windows", hasTarget: false }).glide).toBe(false);
  });

  it("uses the named hold, cap and poll tokens and the intro fade", () => {
    const plan = introPlan({ reduce: false, platform: "windows", hasTarget: true });
    expect(plan).toMatchObject({
      holdMs: INTRO_HOLD_MS,
      readyCapMs: INTRO_READY_CAP_MS,
      pollMs: INTRO_POLL_MS,
      fadeMs: DURATION_MS.intro,
    });
  });
});

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
