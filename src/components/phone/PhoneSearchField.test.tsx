import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PhoneSearchField } from "./PhoneSearchField";
import { useUI } from "../../stores/ui";

if (!("PointerEvent" in window)) {
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: class PointerEvent extends MouseEvent {} });
}

describe("PhoneSearchField", () => {
  beforeEach(() => {
    useUI.setState({ searchQuery: "", searchFocused: false });
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps the same input and focus while typing after focus", () => {
    const { container } = render(<PhoneSearchField suggest={false} />);
    const input = screen.getByRole("combobox", { name: "Search" });
    act(() => input.focus());
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "ab" } });
    expect(document.activeElement).toBe(input);
    expect(container.querySelector("#phone-search")).toBe(input);
    expect(useUI.getState().searchFocused).toBe(true);
  });

  it("does not remount the input when focus state changes", () => {
    render(<PhoneSearchField suggest={false} />);
    const before = screen.getByRole("combobox", { name: "Search" });
    act(() => useUI.getState().setSearchFocused(true));
    act(() => useUI.getState().setSearchQuery("query"));
    expect(screen.getByRole("combobox", { name: "Search" })).toBe(before);
  });

  it("shows suggestions inline in the field, never as the desktop overlay", () => {
    render(<PhoneSearchField />);
    const input = screen.getByRole("combobox", { name: "Search" });
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "ab" } });
    const list = screen.getByRole("listbox", { name: "Search suggestions" });
    expect(list.className).not.toContain("absolute");
    expect(list.querySelector("[data-goo-panel]")).toBeNull();
  });

  it("has no Cancel button and blurs when the user taps outside", () => {
    render(<PhoneSearchField suggest={false} />);
    const input = screen.getByRole("combobox", { name: "Search" });
    act(() => input.focus());
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    fireEvent.pointerDown(document.body);
    expect(document.activeElement).not.toBe(input);
    expect(useUI.getState().searchFocused).toBe(false);
  });
});
