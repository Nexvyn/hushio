import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

const drop = vi.hoisted(() => {
  const state: { handler: ((event: unknown) => void) | null; stopped: boolean } = { handler: null, stopped: false };
  return {
    state,
    listenFileDrop: vi.fn(async (handler: (event: unknown) => void) => {
      state.handler = handler;
      return () => {
        state.stopped = true;
      };
    }),
    dropPaths: vi.fn(async () => {}),
  };
});

vi.mock("../lib/bridge", () => ({ listenFileDrop: drop.listenFileDrop }));
vi.mock("../lib/localDrop", () => ({ dropPaths: drop.dropPaths }));

import { FileDrop } from "./FileDrop";

function emit(event: unknown) {
  act(() => {
    drop.state.handler?.(event);
  });
}

afterEach(() => {
  cleanup();
  drop.state.handler = null;
  drop.state.stopped = false;
  vi.clearAllMocks();
});

describe("FileDrop", () => {
  it("shows the Drop to play overlay while files hover over the window", async () => {
    render(<FileDrop />);
    await act(async () => {});
    expect(screen.queryByText("Drop to play")).toBeNull();
    emit({ type: "enter", paths: ["C:\\a.mp3"] });
    expect(screen.getByRole("status").textContent).toContain("Drop to play");
    emit({ type: "over" });
    expect(screen.getByText("Drop to play")).toBeTruthy();
    emit({ type: "leave" });
    expect(screen.queryByText("Drop to play")).toBeNull();
  });

  it("hands dropped paths to the drop handler and hides the overlay", async () => {
    render(<FileDrop />);
    await act(async () => {});
    emit({ type: "enter", paths: ["C:\\a.mp3"] });
    emit({ type: "drop", paths: ["C:\\a.mp3", "C:\\Music"] });
    expect(drop.dropPaths).toHaveBeenCalledWith(["C:\\a.mp3", "C:\\Music"]);
    expect(screen.queryByText("Drop to play")).toBeNull();
  });

  it("unsubscribes from window drops on unmount", async () => {
    const view = render(<FileDrop />);
    await act(async () => {});
    view.unmount();
    expect(drop.state.stopped).toBe(true);
  });

  it("does not let the overlay block clicks", async () => {
    render(<FileDrop />);
    await act(async () => {});
    emit({ type: "enter", paths: [] });
    expect(screen.getByRole("status").className).toContain("pointer-events-none");
  });
});
