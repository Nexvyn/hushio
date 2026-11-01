import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../lib/replayCard", () => ({ renderReplayCard: vi.fn(), copyReplayCard: vi.fn() }));

import { ReplayShareSheet } from "./ReplayShareSheet";
import { copyReplayCard, renderReplayCard, type ReplayCardInput } from "../lib/replayCard";
import { useUI } from "../stores/ui";

const card: ReplayCardInput = {
  periodLabel: "November 2026",
  minutes: 10,
  plays: 1,
  activeDays: 1,
  streak: 1,
  songs: [],
  artists: [],
  sleeve: null,
  label: null,
  colors: ["60 60 64", "100 100 104"],
};

const picture = new Blob(["png"], { type: "image/png" });
const originalToast = useUI.getState().toast;
let toast: Mock<(message: string, kind?: string) => void>;

beforeEach(() => {
  toast = vi.fn<(message: string, kind?: string) => void>();
  useUI.setState({ toast });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:card"), revokeObjectURL: vi.fn() }));
  vi.mocked(renderReplayCard).mockResolvedValue(picture);
  vi.mocked(copyReplayCard).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  useUI.setState({ toast: originalToast });
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ReplayShareSheet", () => {
  it("shows the rendered card once it is drawn and enables the copy button", async () => {
    render(<ReplayShareSheet card={card} onClose={() => {}} />);
    expect((screen.getByRole("button", { name: "Copy image" }) as HTMLButtonElement).disabled).toBe(true);
    expect((await screen.findByRole("img", { name: "Your Replay card" }) as HTMLImageElement).getAttribute("src")).toBe("blob:card");
    expect((screen.getByRole("button", { name: "Copy image" }) as HTMLButtonElement).disabled).toBe(false);
    expect(renderReplayCard).toHaveBeenCalledWith(card);
  });

  it("copies the picture and confirms with a toast", async () => {
    render(<ReplayShareSheet card={card} onClose={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Copy image" }));
    expect(copyReplayCard).toHaveBeenCalledWith(picture);
    expect(toast).toHaveBeenCalledWith("Copied — paste it into a story or a chat", "success");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("reports a failed copy with an error toast", async () => {
    vi.mocked(copyReplayCard).mockRejectedValueOnce(new Error("no clipboard"));
    render(<ReplayShareSheet card={card} onClose={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Copy image" }));
    expect(toast).toHaveBeenCalledWith("Couldn't copy the card", "error");
  });

  it("explains when the card cannot be drawn", async () => {
    vi.mocked(renderReplayCard).mockRejectedValueOnce(new Error("no canvas"));
    render(<ReplayShareSheet card={card} onClose={() => {}} />);
    expect((await screen.findByRole("alert")).textContent).toContain("The card couldn't be drawn. Close this and try again.");
    expect((screen.getByRole("button", { name: "Copy image" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("closes on Escape, on a press outside the sheet and on Close", async () => {
    const onClose = vi.fn();
    const { container } = render(<ReplayShareSheet card={card} onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    container.firstElementChild?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("is a labelled dialog", () => {
    render(<ReplayShareSheet card={card} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Share your Replay" })).toBeTruthy();
  });
});
