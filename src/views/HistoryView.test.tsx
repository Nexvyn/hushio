import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HistoryView } from "./HistoryView";
import type { JournalEntry } from "../lib/replay";
import { useUI } from "../stores/ui";

const bridge = vi.hoisted(() => ({
  platform: "windows",
  persistRead: vi.fn(async () => null),
  persistWrite: vi.fn(async () => true),
  replayJournal: vi.fn(),
  replayJournalRemove: vi.fn(),
}));

vi.mock("../lib/bridge", () => bridge);

function play(id: string, title: string, at: Date): JournalEntry {
  return { track: { id, title, artist: `${title} artist`, thumb: null }, at: at.getTime(), heard: 90 };
}

const NOW = new Date();
const TODAY = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 0, 30);
const EARLIER = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 9, 10, 0);

beforeEach(() => {
  useUI.setState({ toasts: [], pendingToasts: [], contextMenu: null });
  bridge.replayJournal.mockReset();
  bridge.replayJournalRemove.mockReset().mockResolvedValue(1);
});

afterEach(() => {
  cleanup();
});

describe("History view", () => {
  it("shows the empty state when nothing has been played", async () => {
    bridge.replayJournal.mockResolvedValue([]);
    render(<HistoryView />);
    expect(await screen.findByText("No listening history yet")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Play history" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lists plays newest first under Today and an older date", async () => {
    bridge.replayJournal.mockResolvedValue([play("old", "Old song", EARLIER), play("new", "New song", TODAY)]);
    render(<HistoryView />);

    expect(await screen.findByRole("heading", { name: "Today" })).toBeTruthy();
    expect(screen.getByText("New song")).toBeTruthy();
    expect(screen.getByText("Old song")).toBeTruthy();
    const titles = screen.getAllByText(/song$/).map((element) => element.textContent);
    expect(titles).toEqual(["New song", "Old song"]);
  });

  it("removes one play from the log and from the list", async () => {
    const entry = play("new", "New song", TODAY);
    bridge.replayJournal.mockResolvedValue([entry]);
    render(<HistoryView />);
    const row = (await screen.findByText("New song")).closest("li");
    if (!row) throw new Error("no row");

    fireEvent.contextMenu(row, { clientX: 10, clientY: 10 });
    const remove = useUI.getState().contextMenu?.items.find((item) => item.label === "Remove from history");
    remove?.onSelect?.();

    await waitFor(() => expect(bridge.replayJournalRemove).toHaveBeenCalledWith([{ at: entry.at, id: "new" }]));
    await waitFor(() => expect(screen.queryByText("New song")).toBeNull());
    expect(await screen.findByText("No listening history yet")).toBeTruthy();
  });
});
