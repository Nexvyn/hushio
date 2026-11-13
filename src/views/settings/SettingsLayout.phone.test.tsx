import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Wifi01Icon, VolumeHighIcon } from "@hugeicons/core-free-icons";
import { RadioGroup } from "../../components/RadioGroup";
import { Button } from "../../components/Button";
import { GroupView } from "./SettingsLayout";
import type { SettingsGroup } from "./categories";

afterEach(cleanup);

const options = [
  { value: "a", label: "Auto" },
  { value: "b", label: "High" },
];

describe("GroupView on phone", () => {
  it("stacks a segmented control full width under its label", () => {
    const group: SettingsGroup = {
      rows: [
        {
          id: "font",
          icon: Wifi01Icon,
          title: "App font",
          note: "Pick the font for the app",
          control: <RadioGroup label="App font" options={options} value="a" onChange={() => {}} />,
        },
      ],
    };
    const { container } = render(<GroupView group={group} phone />);
    const row = container.querySelector("section > div") as HTMLElement;
    expect(row.className).toContain("flex-col");
    expect(row.className).toContain("py-3");
    const radios = screen.getByRole("radiogroup");
    expect(radios.parentElement?.className).toContain("w-full");
    expect(radios.parentElement?.className).toContain("[&_[role=radio]]:flex-1");
  });

  it("keeps a short button beside its label", () => {
    const group: SettingsGroup = {
      rows: [
        {
          id: "volume",
          icon: VolumeHighIcon,
          title: "Volume leveling",
          control: <Button onClick={() => {}}>Open</Button>,
        },
      ],
    };
    const { container } = render(<GroupView group={group} phone />);
    const row = container.querySelector("section > div") as HTMLElement;
    expect(row.className).not.toContain("flex-col");
    expect(row.className).toContain("items-start");
  });
});
