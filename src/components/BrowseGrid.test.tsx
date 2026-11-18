import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BrowseGrid, DESKTOP_BROWSE } from "./BrowseGrid";
import { useNavigation } from "../stores/navigation";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

afterEach(() => {
  cleanup();
});

describe("BrowseGrid", () => {
  it("shows every desktop entry and opens its view", () => {
    render(<BrowseGrid items={DESKTOP_BROWSE} />);
    expect(screen.getByRole("heading", { name: "Browse all" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(DESKTOP_BROWSE.length);

    fireEvent.click(screen.getByRole("button", { name: "Liked Songs" }));
    expect(useNavigation.getState().view).toEqual({ name: "library", param: "liked" });
  });
});
