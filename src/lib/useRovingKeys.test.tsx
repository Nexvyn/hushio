import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { useRovingKeys } from "./useRovingKeys";
import type { RovingOrientation } from "./roving";

function Tabs({ orientation = "horizontal" as RovingOrientation }) {
  const ref = useRef<HTMLDivElement>(null);
  useRovingKeys(ref, "button", orientation);
  return (
    <div ref={ref}>
      <button type="button">One</button>
      <button type="button">Two</button>
      <button type="button" disabled>Skipped</button>
      <button type="button">Three</button>
    </div>
  );
}

describe("useRovingKeys", () => {
  it("moves focus with arrows, skipping disabled items, and Home and End", async () => {
    cleanup();
    const user = userEvent.setup();
    render(<Tabs />);
    screen.getByRole("button", { name: "One" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement?.textContent).toBe("Two");
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement?.textContent).toBe("Three");
    await user.keyboard("{Home}");
    expect(document.activeElement?.textContent).toBe("One");
    await user.keyboard("{End}");
    expect(document.activeElement?.textContent).toBe("Three");
  });

  it("ignores Alt+arrow so row reordering keeps its own shortcut", async () => {
    cleanup();
    const user = userEvent.setup();
    render(<Tabs orientation="vertical" />);
    screen.getByRole("button", { name: "One" }).focus();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(document.activeElement?.textContent).toBe("One");
  });
});
