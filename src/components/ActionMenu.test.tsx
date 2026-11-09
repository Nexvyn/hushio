import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { ActionMenu } from "./ActionMenu";
import { ContextMenu } from "./ContextMenu";
import { useUI } from "../stores/ui";

beforeEach(() => {
  useUI.setState({ contextMenu: null });
});

afterEach(() => {
  cleanup();
});

function renderMenu() {
  const onSelect = vi.fn();
  render(
    <>
      <p>outside</p>
      <ActionMenu
        label="More options"
        items={[
          { label: "Play now", icon: PlayIcon, onSelect },
          { label: "Locked", icon: PlayIcon, disabled: true, onSelect: vi.fn() },
          { label: "Remove", icon: PlayIcon, onSelect: vi.fn(), separatorBefore: true },
        ]}
      />
      <ContextMenu />
    </>,
  );
  return { onSelect };
}

describe("ActionMenu", () => {
  it("starts closed and opens the shared menu with its items", async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole("button", { name: "More options" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    await user.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
  });

  it("runs the chosen item and closes", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderMenu();

    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("menuitem", { name: "Play now" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("does not run a disabled item", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "More options" }));
    const locked = screen.getByRole("menuitem", { name: "Locked" });
    expect((locked as HTMLButtonElement).disabled).toBe(true);
    await user.click(locked);

    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("closes when its trigger is pressed again", async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole("button", { name: "More options" });
    await user.click(trigger);
    await user.click(trigger);

    expect(screen.getByRole("button", { name: "More options" }).getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("opens nothing when its items are empty", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ActionMenu label="More options" items={[]} />
        <ContextMenu />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "More options" }));

    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });
});
