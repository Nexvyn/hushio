import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Trash } from "@phosphor-icons/react";
import { SettingRow } from "./SettingRow";
import { Slider } from "./Slider";

describe("SettingRow", () => {
  afterEach(cleanup);

  it("keeps a short control beside the title", () => {
    render(<SettingRow icon={Trash} title="Import" control={<button type="button">Open</button>} />);
    const control = screen.getByRole("button", { name: "Open" }).parentElement;
    expect(control?.className).toContain("shrink-0");
    expect(control?.className).not.toContain("pl-[52px]");
  });

  it("puts a stacked control under the title, lined up with the title", () => {
    render(
      <SettingRow icon={Trash} title="Song versions" stacked control={<button type="button">Any</button>} />,
    );
    const control = screen.getByRole("button", { name: "Any" }).parentElement;
    expect(control?.className).not.toContain("shrink-0");
    expect(control?.className).not.toContain("pl-");
    expect(control?.parentElement?.className).toContain("flex-col");
  });

  it("does not render the icon tile", () => {
    const { container } = render(<SettingRow icon={Trash} title="Import" />);
    expect(container.querySelector("span.rounded-\\[9px\\]")).toBeNull();
    expect(screen.getByText("Import").className).toContain("text-[0.9375rem]");
  });

  it("keeps a slider's value readout on tabular figures", () => {
    render(
      <SettingRow
        icon={Trash}
        title="Crossfade"
        value="12s"
        control={<Slider label="Crossfade" min={0} max={12} step={1} value={12} onChange={() => {}} />}
      />,
    );
    expect(screen.getByText("12s").className).toContain("tabular-nums");
  });

  it("gives the value label a fixed width and tabular figures", () => {
    render(<SettingRow icon={Trash} title="Playback speed" value="1.25x" control={<button type="button">Set</button>} />);
    const value = screen.getByText("1.25x");
    expect(value.className).toContain("w-24");
    expect(value.className).toContain("tabular-nums");
    expect(value.className).toContain("text-right");
  });

  it("gives an unchecked switch's title the tertiary text colour when disabled", () => {
    render(<SettingRow icon={Trash} title="Gapless" disabled toggle={{ checked: false, onChange: () => {} }} />);
    expect(screen.getByText("Gapless").className).toContain("text-ink-3");
  });
});
