import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../lib/bridge", () => ({ platform: "windows", replaySummary: vi.fn(), replayJournal: vi.fn(), copyImage: vi.fn() }));
vi.mock("../lib/palette", () => ({ useArtTint: () => "60 60 64" }));
vi.mock("../lib/audio", () => ({ audio: new Audio(), play: vi.fn(), pause: vi.fn(), seekTo: vi.fn(), setVolume: vi.fn(), setMuted: vi.fn(), playStream: vi.fn() }));
vi.mock("../lib/persist", () => ({ persistStorage: () => ({ getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }) }));

import { ReplayView } from "./ReplayView";
import { replayJournal, replaySummary } from "../lib/bridge";
import { forgetReplayCache } from "../lib/replayData";
import { isoDay, shiftDay, type ReplayData } from "../lib/replay";

const today = new Date();
const hours = new Array<number>(24).fill(0);
hours[9] = 3_600_000;
hours[20] = 3_600_000;

const data: ReplayData = {
  period: "month",
  months: ["2026-11"],
  totalMs: 7_200_000,
  plays: 5,
  tracks: [
    { id: "s1", title: "Opening song", artist: "Band A", thumb: null, ms: 3_600_000, plays: 3 },
    { id: "s2", title: "Closing song", artist: "Band B", thumb: null, ms: 3_600_000, plays: 2 },
  ],
  artists: [
    { name: "Band A", ms: 3_600_000, plays: 3 },
    { name: "Band B", ms: 3_600_000, plays: 2 },
  ],
  albums: [],
  hours,
  days: [{ date: isoDay(today), ms: 7_200_000 }],
  counts: { tracks: 3, artists: 2, albums: 0 },
};

const empty: ReplayData = { ...data, totalMs: 0, plays: 0, tracks: [], artists: [], hours: new Array(24).fill(0), days: [], counts: { tracks: 0, artists: 0, albums: 0 } };

beforeEach(() => {
  document.documentElement.classList.add("reduce-motion");
  forgetReplayCache();
  vi.mocked(replaySummary).mockReset();
  vi.mocked(replayJournal).mockReset();
  vi.mocked(replaySummary).mockResolvedValue(data);
  vi.mocked(replayJournal).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("reduce-motion");
  vi.restoreAllMocks();
});

describe("ReplayView states", () => {
  it("shows a loading placeholder before the stats arrive", () => {
    vi.mocked(replaySummary).mockReturnValue(new Promise(() => {}));
    render(<ReplayView />);
    expect(screen.getByLabelText("Loading your Replay").getAttribute("aria-busy")).toBe("true");
  });

  it("shows the error state and retries on request", async () => {
    vi.mocked(replaySummary).mockRejectedValueOnce(new Error("locked")).mockResolvedValueOnce(data);
    render(<ReplayView />);
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("heading", { name: "Replay couldn't load" })).toBeTruthy();
    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Top songs" })).toBeTruthy();
    expect(replaySummary).toHaveBeenCalledTimes(2);
  });

  it("explains an empty period with the copy for that period", async () => {
    vi.mocked(replaySummary).mockResolvedValue(empty);
    render(<ReplayView />);
    expect(await screen.findByRole("heading", { name: "Nothing on this record yet" })).toBeTruthy();
    expect(
      screen.getByText("Play at least three different songs and Replay fills in with what you actually listen to."),
    ).toBeTruthy();
  });

  it("explains an empty week with the week copy", async () => {
    vi.mocked(replayJournal).mockResolvedValue([]);
    render(<ReplayView />);
    await screen.findByRole("tab", { name: "This month" });
    await userEvent.click(screen.getByRole("tab", { name: "This week" }));
    expect(
      await screen.findByText("Your week fills in as you listen. Play a few different songs and they will show up here."),
    ).toBeTruthy();
    expect(replayJournal).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("tab", { name: "This month" }));
    expect(await screen.findByText("120")).toBeTruthy();
  });
});

describe("ReplayView content", () => {
  it("shows the minutes, the play and day line, and the lists", async () => {
    render(<ReplayView />);
    expect(await screen.findByText("120")).toBeTruthy();
    expect(screen.getByText("5 plays · 1 day of listening")).toBeTruthy();
    expect(screen.getByText("Opening song")).toBeTruthy();
  });

  it("lists the top artist and the peak hour in the liner notes", async () => {
    render(<ReplayView />);
    await screen.findByText("120");
    expect(screen.getByText("Top artist")).toBeTruthy();
    expect(screen.getByText("Your hour")).toBeTruthy();
    expect(screen.getByText("50% of all your listening")).toBeTruthy();
  });

  it("gives every chart a text alternative", async () => {
    render(<ReplayView />);
    await screen.findByText("120");
    const hourChart = screen.getByRole("img", { name: /Listening by hour/ });
    expect(hourChart.getAttribute("aria-label")).toContain("Peak hour 9.");
    const hourList = hourChart.closest("figure")?.querySelector("ul");
    expect(hourList?.textContent).toContain("9:00: 1 hr");
    expect(hourList?.textContent).toContain("0:00: no music");
  });

  it("names the period in the subtitle", async () => {
    render(<ReplayView />);
    expect(await screen.findByText(/^November 2026$/)).toBeTruthy();
  });

  it("opens the share sheet from the hero", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(<ReplayView />);
    await screen.findByText("120");
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(screen.getByRole("dialog", { name: "Share your Replay" })).toBeTruthy();
    expect(await screen.findByRole("alert")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("ReplayView period switch", () => {
  it("loads the period a tab selects and moves with the arrow keys", async () => {
    render(<ReplayView />);
    await screen.findByText("120");
    const month = screen.getByRole("tab", { name: "This month" });
    expect(month.getAttribute("aria-selected")).toBe("true");
    month.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(replaySummary).toHaveBeenLastCalledWith("lastMonth");
    expect(screen.getByRole("tab", { name: "Last month" }).getAttribute("aria-selected")).toBe("true");
  });

  it("names all time from the first recorded month", async () => {
    render(<ReplayView />);
    await screen.findByText("120");
    await userEvent.click(screen.getByRole("tab", { name: "All time" }));
    expect(await screen.findByText("Since Nov 2026")).toBeTruthy();
    expect(replaySummary).toHaveBeenLastCalledWith("all");
  });

  it("remembers the last period across visits", async () => {
    const first = render(<ReplayView />);
    await screen.findByText("120");
    await userEvent.click(screen.getByRole("tab", { name: "This year" }));
    await screen.findByText(String(today.getFullYear()));
    first.unmount();
    render(<ReplayView />);
    expect(screen.getByRole("tab", { name: "This year" }).getAttribute("aria-selected")).toBe("true");
    expect(shiftDay(today, 0).getFullYear()).toBe(today.getFullYear());
  });
});
