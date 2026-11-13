import { render } from "@testing-library/react";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { describe, expect, it } from "vitest";
import { PhoneIcon } from "./PhoneIcon";

describe("PhoneIcon", () => {
  it("renders at 24px with a 2px stroke", () => {
    const { container } = render(<PhoneIcon icon={PlayIcon} />);
    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("height")).toBe("24");
    expect(svg?.getAttribute("stroke-width")).toBe("2");
  });
});
