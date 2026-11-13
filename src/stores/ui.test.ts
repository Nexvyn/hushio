import { beforeEach, describe, expect, it } from "vitest";
import { useUI } from "./ui";

const initial = useUI.getState();

beforeEach(() => {
  useUI.setState(initial, true);
});

describe("toasts", () => {
  it("shows four and queues the fifth", () => {
    const { toast } = useUI.getState();
    for (let i = 1; i <= 5; i++) toast(`Message ${i}`);

    expect(useUI.getState().toasts).toHaveLength(4);
    expect(useUI.getState().pendingToasts).toHaveLength(1);
    expect(useUI.getState().pendingToasts[0].message).toBe("Message 5");
  });

  it("promotes the waiting toast when one closes", () => {
    const { toast } = useUI.getState();
    for (let i = 1; i <= 5; i++) toast(`Message ${i}`);

    const first = useUI.getState().toasts[0];
    useUI.getState().dismissToast(first.id);

    expect(useUI.getState().toasts).toHaveLength(4);
    expect(useUI.getState().toasts.at(-1)?.message).toBe("Message 5");
    expect(useUI.getState().pendingToasts).toHaveLength(0);
  });

  it("uses the default duration", () => {
    useUI.getState().toast("Saved");
    expect(useUI.getState().toasts[0].duration).toBe(4600);
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
    for (let i = 1; i <= 4; i++) toast(`Message ${i}`);
    const queued = toast("Waiting");

    useUI.getState().dismissToast(queued);

    expect(useUI.getState().pendingToasts).toHaveLength(0);
    expect(useUI.getState().toasts).toHaveLength(4);
  });

  it("dismisses a shown toast and promotes the waiting one", () => {
    const { toast } = useUI.getState();
    const shown = toast("Loading");
    for (let i = 1; i <= 4; i++) toast(`Message ${i}`);

    useUI.getState().dismissToast(shown);

    expect(useUI.getState().toasts.map((item) => item.message)).toEqual(["Message 1", "Message 2", "Message 3", "Message 4"]);
  });
});
