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

  it("gives a native drop over an owner to that owner instead of playing it", async () => {
    const owner = document.createElement("div");
    owner.setAttribute("data-owns-drop", "");
    const inside = document.createElement("span");
    owner.appendChild(inside);
    document.body.appendChild(owner);
    const original = document.elementFromPoint;
    document.elementFromPoint = vi.fn(() => inside);
    const received = vi.fn();
    owner.addEventListener("hushio-owned-drop", (event) => received((event as CustomEvent).detail));
    try {
      render(<FileDrop />);
      await act(async () => {});
      emit({ type: "drop", paths: ["C:\\Music\\a.txt"], position: { x: 10, y: 10 } });
      expect(received).toHaveBeenCalledWith({ paths: ["C:\\Music\\a.txt"] });
      expect(drop.dropPaths).not.toHaveBeenCalled();
    } finally {
      document.elementFromPoint = original;
      owner.remove();
    }
  });

  it("unsubscribes from window drops on unmount", async () => {
    const view = render(<FileDrop />);
    await act(async () => {});
    view.unmount();
    expect(drop.state.stopped).toBe(true);
  });

  it("stays hidden and leaves the drop alone over an element that owns drops", async () => {
    const owner = document.createElement("div");
    owner.setAttribute("data-owns-drop", "");
    const inside = document.createElement("span");
    owner.appendChild(inside);
    document.body.appendChild(owner);
    const original = document.elementFromPoint;
    document.elementFromPoint = vi.fn(() => inside);
    try {
      render(<FileDrop />);
      await act(async () => {});
      emit({ type: "enter", paths: ["C:\\a.mp3"], position: { x: 10, y: 10 } });
      expect(screen.queryByText("Drop to play")).toBeNull();
      emit({ type: "drop", paths: ["C:\\a.mp3"], position: { x: 10, y: 10 } });
      expect(drop.dropPaths).not.toHaveBeenCalled();
    } finally {
      document.elementFromPoint = original;
      owner.remove();
    }
  });

  it("shows the overlay and plays the drop when the target does not own drops", async () => {
    const plain = document.createElement("div");
    document.body.appendChild(plain);
    const original = document.elementFromPoint;
    document.elementFromPoint = vi.fn(() => plain);
    try {
      render(<FileDrop />);
      await act(async () => {});
      emit({ type: "enter", paths: ["C:\\a.mp3"], position: { x: 10, y: 10 } });
      expect(screen.getByText("Drop to play")).toBeTruthy();
      emit({ type: "drop", paths: ["C:\\a.mp3"], position: { x: 10, y: 10 } });
      expect(drop.dropPaths).toHaveBeenCalledWith(["C:\\a.mp3"]);
    } finally {
      document.elementFromPoint = original;
      plain.remove();
    }
  });

  it("does not let the overlay block clicks", async () => {
    render(<FileDrop />);
    await act(async () => {});
    emit({ type: "enter", paths: [] });
    expect(screen.getByRole("status").className).toContain("pointer-events-none");
  });
});
