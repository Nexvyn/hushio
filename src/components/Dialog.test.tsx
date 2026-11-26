import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Dialog } from "./Dialog";
import { useUI } from "../stores/ui";

const initialUI = useUI.getState();
const onConfirm = vi.fn();
const validate = (value: string) => (/^\d+$/.test(value) ? null : "Numbers only");

function openValidated() {
  act(() => {
    useUI.getState().openDialog({
      title: "Count",
      initialValue: "60",
      confirmLabel: "Start",
      validate,
      onConfirm,
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useUI.setState(initialUI, true);
});

afterEach(cleanup);

describe("Dialog validation", () => {
  it("keeps the dialog open and shows the error when confirm is refused", () => {
    render(<Dialog />);
    openValidated();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(useUI.getState().dialog).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Numbers only");
    expect(screen.getByRole("textbox")).toHaveProperty("value", "abc");
  });

  it("refuses Enter the same way and keeps the typed value", () => {
    render(<Dialog />);
    openValidated();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    fireEvent.keyDown(window, { key: "Enter" });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(useUI.getState().dialog).not.toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("confirms with the value and closes once the value passes", () => {
    render(<Dialog />);
    openValidated();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(onConfirm).toHaveBeenCalledWith("15");
    expect(useUI.getState().dialog).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears a previous error when a different dialog opens", () => {
    render(<Dialog />);
    openValidated();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByRole("alert")).toBeTruthy();

    act(() => {
      useUI.getState().closeDialog();
      useUI.getState().openDialog({ title: "Other", onConfirm });
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Dialog Enter on a focused button", () => {
  it("leaves Enter on Cancel to the button instead of confirming", () => {
    render(<Dialog />);
    act(() => {
      useUI.getState().openDialog({ title: "Delete it?", danger: true, confirmLabel: "Delete", onConfirm });
    });

    const cancel = screen.getByRole("button", { name: /cancel/i });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: "Enter" });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does not confirm a danger dialog when Enter arrives with Cancel focused", () => {
    render(<Dialog />);
    act(() => {
      useUI.getState().openDialog({ title: "Remove it?", danger: true, confirmLabel: "Delete", onConfirm });
    });

    screen.getByRole("button", { name: /cancel/i }).focus();
    fireEvent.keyDown(window, { key: "Enter" });

    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("phone dialog keyboard inset", () => {
  it("moves the sheet above the visual keyboard viewport", () => {
    const viewport = Object.assign(new EventTarget(), { height: 500, offsetTop: 0 });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    render(<Dialog sheet />);
    act(() => {
      useUI.getState().openDialog({ title: "New playlist", initialValue: "My Playlist #1", onConfirm });
    });

    viewport.height = 300;
    act(() => viewport.dispatchEvent(new Event("resize")));
    expect(screen.getByRole("dialog").parentElement?.style.bottom).toBe(`${window.innerHeight - viewport.height - viewport.offsetTop}px`);
    expect(screen.getByRole("textbox").className).toContain("text-base");
  });
});
