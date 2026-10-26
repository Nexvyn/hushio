import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { ActionMenu } from "./ActionMenu";

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
    </>,
  );
  return { onSelect };
}

describe("ActionMenu", () => {
  it("starts closed and opens with its items", async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole("button", { name: "More options" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Play now" })).not.toBeTruthy();

    await user.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });

  it("runs the chosen item and closes", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderMenu();

    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("button", { name: "Play now" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Play now" })).not.toBeTruthy();
  });

  it("does not run a disabled item", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "More options" }));
    const locked = screen.getByRole("button", { name: "Locked" });
    expect((locked as HTMLButtonElement).disabled).toBe(true);
    await user.click(locked);

    expect(screen.getByRole("button", { name: "Locked" })).toBeTruthy();
  });

  it("closes on Escape and on a press outside", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Play now" })).not.toBeTruthy();

    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByText("outside"));
    expect(screen.queryByRole("button", { name: "Play now" })).not.toBeTruthy();
  });

  it("closes when its trigger is pressed again", async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole("button", { name: "More options" });
    await user.click(trigger);
    await user.click(trigger);

    expect(screen.getByRole("button", { name: "More options" }).getAttribute("aria-expanded")).toBe("false");
  });
});
