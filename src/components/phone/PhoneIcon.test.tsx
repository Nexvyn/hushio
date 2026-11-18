import { render } from "@testing-library/react";
import { Play } from "@phosphor-icons/react";
import { describe, expect, it } from "vitest";
import { PhoneIcon } from "./PhoneIcon";

describe("PhoneIcon", () => {
  it("renders at 24px in the regular weight", () => {
    const { container } = render(<PhoneIcon icon={Play} />);
    const svg = container.querySelector("svg");
    const regular = render(<Play size={24} weight="regular" />).container.querySelector("svg");

    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("height")).toBe("24");
    expect(svg?.innerHTML).toBe(regular?.innerHTML);
  });

  it("uses the fill weight when filled", () => {
    const { container } = render(<PhoneIcon icon={Play} fill="currentColor" />);
    const filled = render(<Play size={24} weight="fill" />).container.querySelector("svg");

    expect(container.querySelector("svg")?.innerHTML).toBe(filled?.innerHTML);
  });
});
