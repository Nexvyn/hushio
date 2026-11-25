import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WifiHigh, SpeakerHigh } from "@phosphor-icons/react";
import { RadioGroup } from "../../components/RadioGroup";
import { Button } from "../../components/Button";
import { Slider } from "../../components/Slider";
import { GroupView } from "./SettingsLayout";
import type { SettingsGroup } from "./categories";

vi.mock("../../lib/usePhone", () => ({ usePhone: () => true }));

afterEach(cleanup);

const options = [
  { value: "a", label: "Auto" },
  { value: "b", label: "High" },
];

describe("GroupView on phone", () => {
  it("keeps a segmented control on the right of its title", () => {
    const group: SettingsGroup = {
      rows: [
        {
          id: "theme",
          icon: WifiHigh,
          title: "Theme",
          control: <RadioGroup label="Theme" options={options} value="a" onChange={() => {}} />,
        },
      ],
    };
    render(<GroupView group={group} />);
    const row = screen.getByRole("radiogroup").closest("section > div > div") as HTMLElement;
    expect(row.className).not.toContain("flex-col");
    expect(row.className).toContain("items-center");
  });

  it("stacks a stacked control under its title", () => {
    const group: SettingsGroup = {
      rows: [
        {
          id: "font",
          icon: WifiHigh,
          title: "App font",
          stacked: true,
          control: <RadioGroup label="App font" options={options} value="a" onChange={() => {}} />,
        },
      ],
    };
    render(<GroupView group={group} />);
    const row = screen.getByRole("radiogroup").closest("section > div > div") as HTMLElement;
    expect(row.className).toContain("flex-col");
    expect(screen.getByRole("radiogroup").className).toContain("shrink-0");
  });

  it("stacks a slider so it can use the full width", () => {
    const group: SettingsGroup = {
      rows: [
        {
          id: "speed",
          icon: SpeakerHigh,
          title: "Playback speed",
          value: "1x",
          control: <Slider label="Playback speed" min={0.5} max={2} step={0.05} value={1} onChange={() => {}} />,
        },
      ],
    };
    render(<GroupView group={group} />);
    const row = screen.getByRole("slider").closest("section > div > div") as HTMLElement;
    expect(row.className).toContain("flex-col");
  });

  it("keeps a short button beside its label", () => {
    const group: SettingsGroup = {
      rows: [
        {
          id: "volume",
          icon: SpeakerHigh,
          title: "Volume leveling",
          control: <Button onClick={() => {}}>Open</Button>,
        },
      ],
    };
    render(<GroupView group={group} />);
    const row = screen.getByRole("button", { name: "Open" }).closest("section > div > div") as HTMLElement;
    expect(row.className).not.toContain("flex-col");
    expect(row.className).toContain("items-center");
  });

  it("draws no dividers between rows", () => {
    const group: SettingsGroup = {
      rows: [
        { id: "a", icon: WifiHigh, title: "One", control: <Button onClick={() => {}}>Open</Button> },
        { id: "b", icon: WifiHigh, title: "Two", control: <Button onClick={() => {}}>Open</Button> },
      ],
    };
    const { container } = render(<GroupView group={group} />);
    expect(container.querySelector("[class*='divide-']")).toBeNull();
  });
});
