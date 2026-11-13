import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { SettingRow } from "./SettingRow";

describe("SettingRow", () => {
  afterEach(cleanup);

  it("keeps a short control beside the title", () => {
    render(<SettingRow icon={Delete02Icon} title="Import" control={<button type="button">Open</button>} />);
    const control = screen.getByRole("button", { name: "Open" }).parentElement;
    expect(control?.className).toContain("shrink-0");
    expect(control?.className).not.toContain("pl-[52px]");
  });

  it("puts a stacked control under the title, lined up with the title", () => {
    render(
      <SettingRow icon={Delete02Icon} title="Song versions" stacked control={<button type="button">Any</button>} />,
    );
    const control = screen.getByRole("button", { name: "Any" }).parentElement;
    expect(control?.className).not.toContain("shrink-0");
    expect(control?.className).not.toContain("pl-");
    expect(control?.parentElement?.className).toContain("flex-col");
  });

  it("does not render the icon tile", () => {
    const { container } = render(<SettingRow icon={Delete02Icon} title="Import" />);
    expect(container.querySelector("span.rounded-\\[9px\\]")).toBeNull();
    expect(screen.getByText("Import").className).toContain("text-body");
  });
});
