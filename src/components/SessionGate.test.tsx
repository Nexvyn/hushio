import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { stop, start, introDone } = vi.hoisted(() => {
  const stop = vi.fn();
  return { stop, start: vi.fn(() => stop), introDone: vi.fn(() => new Promise<void>(() => {})) };
});

vi.mock("../App", () => ({ default: () => <main>Home is ready</main> }));
vi.mock("../stores/auth", () => ({ startGoogleAuth: start }));
vi.mock("../lib/bridge", () => ({ introDone }));

import { SessionGate } from "./SessionGate";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("SessionGate", () => {
  it("opens the app while native startup is still pending", () => {
    const { unmount } = render(<SessionGate />);
    expect(screen.getByRole("main").textContent).toBe("Home is ready");
    expect(start).toHaveBeenCalledOnce();
    expect(introDone).toHaveBeenCalledOnce();
    unmount();
    expect(stop).toHaveBeenCalledOnce();
  });
});
