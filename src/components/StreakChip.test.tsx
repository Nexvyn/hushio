import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../lib/bridge", () => ({ replaySummary: vi.fn() }));
vi.mock("../lib/audio", () => ({ audio: new Audio(), play: vi.fn(), pause: vi.fn(), seekTo: vi.fn(), setVolume: vi.fn(), setMuted: vi.fn(), playStream: vi.fn() }));
vi.mock("../lib/persist", () => ({ persistStorage: () => ({ getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }) }));

import { StreakChip } from "./StreakChip";
import { replaySummary } from "../lib/bridge";
import { isoDay, shiftDay, type DayMs, type ReplayData } from "../lib/replay";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";

function summaryWith(days: DayMs[]): ReplayData {
  return {
    period: "all",
    months: [],
    totalMs: 0,
    plays: 0,
    tracks: [],
    artists: [],
    albums: [],
    hours: new Array(24).fill(0),
    days,
    counts: { tracks: 0, artists: 0, albums: 0 },
  };
}

const now = new Date();
const heardOn = (back: number): DayMs => ({ date: isoDay(shiftDay(now, -back)), ms: 60_000 });

beforeEach(() => {
  useNavigation.setState({ view: { name: "home" }, navPast: [], navFuture: [] });
  usePlayer.setState({ playing: false, queue: [], index: 0 });
});

afterEach(() => {
  cleanup();
  vi.mocked(replaySummary).mockReset();
});

describe("StreakChip", () => {
  it("shows the number of consecutive days ending today", async () => {
    vi.mocked(replaySummary).mockResolvedValue(summaryWith([heardOn(0), heardOn(1), heardOn(2)]));
    render(<StreakChip />);
    expect(await screen.findByRole("button", { name: "Listening streak: 3 days" })).toBeTruthy();
  });

  it("reads 1 day in the singular and 0 days when nothing is heard", async () => {
    vi.mocked(replaySummary).mockResolvedValueOnce(summaryWith([heardOn(0)]));
    const { unmount } = render(<StreakChip />);
    expect(await screen.findByRole("button", { name: "Listening streak: 1 day" })).toBeTruthy();
    unmount();

    vi.mocked(replaySummary).mockResolvedValueOnce(summaryWith([heardOn(3)]));
    render(<StreakChip />);
    expect(await screen.findByRole("button", { name: "Listening streak: 0 days" })).toBeTruthy();
  });

  it("counts music playing right now toward today", async () => {
    vi.mocked(replaySummary).mockResolvedValue(summaryWith([heardOn(1), heardOn(2)]));
    usePlayer.setState({ playing: true, queue: [{ id: "s", title: "Song", artist: "A", thumb: null }], index: 0 });
    render(<StreakChip />);
    expect(await screen.findByRole("button", { name: "Listening streak: 3 days" })).toBeTruthy();
  });

  it("stays hidden when the stats cannot be read", async () => {
    vi.mocked(replaySummary).mockRejectedValue(new Error("unavailable"));
    const { container } = render(<StreakChip />);
    await waitFor(() => expect(replaySummary).toHaveBeenCalled());
    expect(container.childElementCount).toBe(0);
  });

  it("opens Replay when clicked", async () => {
    vi.mocked(replaySummary).mockResolvedValue(summaryWith([heardOn(0)]));
    render(<StreakChip />);
    await userEvent.click(await screen.findByRole("button", { name: /Listening streak/ }));
    expect(useNavigation.getState().view).toEqual({ name: "replay" });
  });
});
