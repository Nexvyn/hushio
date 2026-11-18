import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toasts } from "./Toasts";
import { useUI } from "../stores/ui";

const initial = useUI.getState();

beforeEach(() => {
  useUI.setState({ ...initial, toasts: [], pendingToasts: [], dialog: null, contextMenu: null, playlistPicker: null }, true);
});

afterEach(() => {
  cleanup();
});

describe("Toasts", () => {
  it("announces info politely and errors as alerts", () => {
    render(<Toasts />);
    act(() => {
      useUI.getState().toast("Saved");
      useUI.getState().toast("Couldn't play", "error");
    });

    expect(screen.getByRole("status").textContent).toContain("Saved");
    expect(screen.getByRole("alert").textContent).toContain("Couldn't play");
  });

  it("shows the detail line and runs the focusable action", () => {
    const run = vi.fn();
    render(<Toasts />);
    act(() => {
      useUI.getState().toast("Removed from queue", "info", undefined, { label: "Undo", run }, { detail: "Song · Band" });
    });

    expect(screen.getByText("Song · Band")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(run).toHaveBeenCalledTimes(1);
    expect(useUI.getState().toasts).toHaveLength(0);
  });

  it("dismisses the newest toast with Escape", () => {
    render(<Toasts />);
    act(() => {
      useUI.getState().toast("First");
      useUI.getState().toast("Second");
    });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(useUI.getState().toasts.map((item) => item.message)).toEqual(["First"]);
  });

  it("bumps a repeated message instead of adding a second toast", () => {
    render(<Toasts />);
    act(() => {
      useUI.getState().toast("Added to queue");
      useUI.getState().toast("Added to queue");
    });

    expect(useUI.getState().toasts).toHaveLength(1);
    expect(screen.getAllByText("Added to queue")).toHaveLength(1);
  });
});
