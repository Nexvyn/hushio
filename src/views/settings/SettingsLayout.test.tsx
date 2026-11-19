import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Trash, WifiHigh } from "@phosphor-icons/react";
import { Button } from "../../components/Button";
import { GroupView } from "./SettingsLayout";
import type { SettingsGroup } from "./categories";

afterEach(cleanup);

const group: SettingsGroup = {
  title: "Library",
  rows: [
    { id: "one", icon: WifiHigh, title: "Keep updated", note: "A long note that wraps across the row", control: <Button>Open</Button> },
    { id: "two", icon: Trash, title: "Erase", toggle: { checked: true, onChange: () => {} } },
  ],
};

describe("GroupView on desktop", () => {
  it("renders every row at the same minimum height with no box or dividers", () => {
    const { container } = render(<GroupView group={group} />);
    const section = container.querySelector("section");
    expect(section?.querySelector("[class*='rounded-[14px]']")).toBeNull();
    expect(section?.querySelector("[class*='bg-surface']")).toBeNull();
    expect(section?.querySelector("[class*='divide-']")).toBeNull();
    const rows = container.querySelectorAll('[class*="min-h-[56px]"]');
    expect(rows).toHaveLength(2);
  });

  it("keeps the group title and note aligned with the page title", () => {
    render(<GroupView group={{ ...group, note: "Shared across devices" }} />);
    expect(screen.getByText("Library").className).not.toContain("px-4");
    expect(screen.getByText("Shared across devices").className).not.toContain("px-4");
  });

  it("keeps the control at its natural size beside a long note", () => {
    render(<GroupView group={group} />);
    const control = screen.getByRole("button", { name: "Open" }).parentElement;
    expect(control?.className).toContain("shrink-0");
  });
});
