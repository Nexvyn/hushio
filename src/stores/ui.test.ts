import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUI } from "./ui";

const initial = useUI.getState();

beforeEach(() => {
  useUI.setState(initial, true);
});

describe("toasts", () => {
  it("shows three and queues the fourth", () => {
    const { toast } = useUI.getState();
    for (let i = 1; i <= 4; i++) toast(`Message ${i}`);

    expect(useUI.getState().toasts).toHaveLength(3);
    expect(useUI.getState().pendingToasts).toHaveLength(1);
    expect(useUI.getState().pendingToasts[0].message).toBe("Message 4");
  });

  it("promotes the waiting toast when one closes", () => {
    const { toast } = useUI.getState();
    for (let i = 1; i <= 4; i++) toast(`Message ${i}`);

    const first = useUI.getState().toasts[0];
    useUI.getState().dismissToast(first.id);

    expect(useUI.getState().toasts).toHaveLength(3);
    expect(useUI.getState().toasts.at(-1)?.message).toBe("Message 4");
    expect(useUI.getState().pendingToasts).toHaveLength(0);
  });

  it("leaves the duration to the toaster when none is given", () => {
    useUI.getState().toast("Saved");
    expect(useUI.getState().toasts[0].duration).toBeUndefined();
  });

  it("keeps art, detail and progress from the options", () => {
    useUI.getState().toast("Downloading", "info", undefined, undefined, { art: "cover.jpg", detail: "Song", progress: 0.4 });
    const [shown] = useUI.getState().toasts;
    expect(shown.art).toBe("cover.jpg");
    expect(shown.detail).toBe("Song");
    expect(shown.progress).toBe(0.4);
  });

  it("bumps a repeated toast instead of stacking a duplicate", () => {
    const { toast } = useUI.getState();
    const first = toast("Added to queue", "info", undefined, undefined, { detail: "Song A" });
    const again = toast("Added to queue", "info", undefined, undefined, { detail: "Song B" });

    expect(again).toBe(first);
    expect(useUI.getState().toasts).toHaveLength(1);
    expect(useUI.getState().toasts[0].detail).toBe("Song B");
    expect(useUI.getState().toasts[0].bump).toBe(1);
  });

  it("does not merge toasts of different kinds", () => {
    const { toast } = useUI.getState();
    toast("Saved", "info");
    toast("Saved", "success");
    expect(useUI.getState().toasts).toHaveLength(2);
  });

  it("updates progress without bumping the toast", () => {
    const id = useUI.getState().toast("Downloading", "info");
    useUI.getState().updateToast(id, { progress: 0.75 });
    const [shown] = useUI.getState().toasts;
    expect(shown.progress).toBe(0.75);
    expect(shown.bump).toBeUndefined();
  });
});

describe("toast ids", () => {
  it("returns the id of the toast it shows", () => {
    const first = useUI.getState().toast("First");
    const second = useUI.getState().toast("Second");
    expect(useUI.getState().toasts.map((item) => item.id)).toEqual([first, second]);
  });

  it("dismisses a queued toast without touching the shown ones", () => {
    const { toast } = useUI.getState();
    for (let i = 1; i <= 3; i++) toast(`Message ${i}`);
    const queued = toast("Waiting");

    useUI.getState().dismissToast(queued);

    expect(useUI.getState().pendingToasts).toHaveLength(0);
    expect(useUI.getState().toasts).toHaveLength(3);
  });

  it("dismisses a shown toast and promotes the waiting one", () => {
    const { toast } = useUI.getState();
    const shown = toast("Loading");
    for (let i = 1; i <= 3; i++) toast(`Message ${i}`);

    useUI.getState().dismissToast(shown);

    expect(useUI.getState().toasts.map((item) => item.message)).toEqual(["Message 1", "Message 2", "Message 3"]);
  });
});

describe("right rail", () => {
  it("switches between the queue and now playing without closing the rail", () => {
    useUI.getState().toggleQueue();
    expect(useUI.getState()).toMatchObject({ railColumnOpen: true, rightPanel: "queue" });

    useUI.getState().toggleQueue();
    expect(useUI.getState()).toMatchObject({ railColumnOpen: true, rightPanel: "details" });
  });

  it("closes the rail and returns it to now playing", () => {
    useUI.getState().toggleQueue();
    useUI.getState().closeRail();
    expect(useUI.getState()).toMatchObject({ railColumnOpen: false, rightPanel: "details" });
  });

  it("opens the sheet rail in the queue view and closes only the sheet", () => {
    useUI.getState().toggleQueue(true);
    expect(useUI.getState()).toMatchObject({ railSheetOpen: true, rightPanel: "queue" });

    useUI.getState().closeRail(true);
    expect(useUI.getState().railSheetOpen).toBe(false);
  });
});

describe("launch", () => {
  it("starts with Now Playing closed", async () => {
    vi.resetModules();
    const { useUI: fresh } = await import("./ui");
    expect(fresh.getState().nowPlayingOpen).toBe(false);
  });
});
