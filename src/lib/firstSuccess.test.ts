import { afterEach, describe, expect, it, vi } from "vitest";
import { firstSuccess } from "./firstSuccess";

describe("firstSuccess", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the first success and aborts the other attempts", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const pending = firstSuccess(
      3,
      (index, cancel) => {
        signals.push(cancel);
        if (index === 1) return new Promise((resolve) => setTimeout(() => resolve("second"), 100));
        return new Promise(() => {});
      },
      600,
    );

    await vi.advanceTimersByTimeAsync(700);

    await expect(pending).resolves.toBe("second");
    expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
  });

  it("starts the next attempt at once when one fails, without waiting for the stagger", async () => {
    vi.useFakeTimers();
    const started: number[] = [];

    const pending = firstSuccess(
      2,
      async (index) => {
        started.push(index);
        if (index === 0) throw new Error("down");
        return "ok";
      },
      600,
    );

    await expect(pending).resolves.toBe("ok");
    expect(started).toEqual([0, 1]);
  });

  it("keeps a later attempt's result when it finishes before the slower winner", async () => {
    vi.useFakeTimers();
    const pending = firstSuccess(
      2,
      (index) =>
        new Promise((resolve) => setTimeout(() => resolve(index === 0 ? "slow" : "fast"), index === 0 ? 1000 : 200)),
      600,
    );

    await vi.advanceTimersByTimeAsync(900);

    await expect(pending).resolves.toBe("fast");
  });

  it("rejects with the last error once every attempt has failed", async () => {
    const pending = firstSuccess(
      2,
      async (index) => {
        throw new Error(index === 0 ? "first" : "last");
      },
      600,
    );

    await expect(pending).rejects.toThrow("last");
  });

  it("rejects straight away when there is nothing to try", async () => {
    await expect(firstSuccess(0, async () => "x", 600)).rejects.toThrow("no attempts");
  });
});
