import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Books } from "@phosphor-icons/react";

const { haptic } = vi.hoisted(() => ({ haptic: vi.fn() }));

vi.mock("../../lib/haptics", () => ({ haptic }));

import { PhoneCollage, PhoneLibraryRow } from "./PhoneLibraryRows";

const cover = "https://lh3.googleusercontent.com/abc=w120-h120-l90-rj";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("library collage images", () => {
  it("fade in from transparent once the image has loaded", () => {
    const { container } = render(<PhoneCollage covers={[cover]} fallback={Books} sizeClass="size-10" radiusClass="rounded-md" />);
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.className).toContain("opacity-0");
    expect(img?.className).toContain("motion-safe:transition-opacity");

    fireEvent.load(img!);
    expect(img?.className).toContain("opacity-100");
  });
});

describe("phone library rows", () => {
  it("shows the count and trailing chevron without a pin glyph", () => {
    const onOpen = vi.fn();
    render(
      <PhoneLibraryRow
        title="Liked Songs"
        subtitle="0 songs"
        art={<span className="grid size-12 place-items-center bg-elevated"><Books size={24} /></span>}
        onOpen={onOpen}
      />,
    );

    const row = screen.getByRole("button", { name: "Liked Songs" });
    expect(screen.getByText("0 songs")).toBeTruthy();
    expect(row.querySelectorAll("svg")).toHaveLength(2);
    expect(row.textContent).not.toContain("Pinned");
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
