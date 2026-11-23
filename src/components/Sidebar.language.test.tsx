import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { Sidebar } from "./Sidebar";
import { setLanguage } from "../lib/i18n";

afterEach(() => {
  act(() => setLanguage("en"));
  cleanup();
});

describe("Sidebar language", () => {
  it("switches its labels to Hindi and back", () => {
    render(<Sidebar />);
    expect(screen.getByText("Liked Songs")).toBeTruthy();

    act(() => setLanguage("hi"));
    expect(screen.getByText("पसंदीदा गाने")).toBeTruthy();
    expect(screen.queryByText("Liked Songs")).toBeNull();

    act(() => setLanguage("en"));
    expect(screen.getByText("Liked Songs")).toBeTruthy();
  });
});
