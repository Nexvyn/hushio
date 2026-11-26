import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ChartsPage } from "../lib/charts";

const { fetchCharts } = vi.hoisted(() => ({ fetchCharts: vi.fn() }));

vi.mock("../lib/usePhone", () => ({ usePhone: () => true }));
vi.mock("../lib/charts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/charts")>()),
  fetchCharts,
}));

import { ChartsView, clearChartsCache } from "./ChartsView";

const page: ChartsPage = {
  shelves: [
    {
      title: "Top songs",
      songs: [{ id: "c1", title: "Chart Song", artist: "Band", thumb: null, album: null, duration: 0, explicit: false, artistId: null, albumId: null, isVideo: false }],
      albums: [],
    },
  ],
  continuation: null,
};

beforeEach(() => {
  clearChartsCache();
  fetchCharts.mockReset();
  fetchCharts.mockResolvedValue(page);
});

afterEach(() => {
  cleanup();
});

describe("ChartsView on phone", () => {
  it("titles the page Charts without the desktop subtitle", async () => {
    render(<ChartsView />);
    expect(await screen.findByRole("heading", { name: "Charts" })).toBeTruthy();
    expect(screen.queryByText("What's playing everywhere")).toBeNull();
  });

  it("hides a shelf that has no songs or albums", async () => {
    fetchCharts.mockResolvedValue({
      ...page,
      shelves: [...page.shelves, { title: "Top artists", songs: [], albums: [] }],
    });
    render(<ChartsView />);
    expect(await screen.findByText("Top songs")).toBeTruthy();
    expect(screen.queryByText("Top artists")).toBeNull();
  });
});
