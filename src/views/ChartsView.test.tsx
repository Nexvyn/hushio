import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ChartsPage } from "../lib/charts";

const { fetchCharts } = vi.hoisted(() => ({ fetchCharts: vi.fn() }));

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

const TEN_MINUTES = 10 * 60 * 1000;
let now = 1_000_000;

beforeEach(() => {
  clearChartsCache();
  fetchCharts.mockReset();
  fetchCharts.mockResolvedValue(page);
  now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const skeleton = () => screen.queryByRole("status", { name: "Loading Charts" });

describe("ChartsView cache", () => {
  it("shows the skeleton on the first visit and then the charts", async () => {
    render(<ChartsView />);

    expect(skeleton()).toBeTruthy();
    expect(await screen.findByText("Chart Song")).toBeTruthy();
    expect(skeleton()).toBeNull();
  });

  it("shows the loaded charts at once on a revisit inside ten minutes without refetching", async () => {
    const first = render(<ChartsView />);
    await screen.findByText("Chart Song");
    first.unmount();

    now += TEN_MINUTES / 2;
    render(<ChartsView />);

    expect(skeleton()).toBeNull();
    expect(screen.getByText("Chart Song")).toBeTruthy();
    expect(fetchCharts).toHaveBeenCalledTimes(1);
  });

  it("keeps the cached charts on screen and refreshes quietly after ten minutes", async () => {
    const first = render(<ChartsView />);
    await screen.findByText("Chart Song");
    first.unmount();

    now += TEN_MINUTES + 1000;
    render(<ChartsView />);

    expect(skeleton()).toBeNull();
    expect(screen.getByText("Chart Song")).toBeTruthy();
    await waitFor(() => expect(fetchCharts).toHaveBeenCalledTimes(2));
    expect(skeleton()).toBeNull();
  });
});
