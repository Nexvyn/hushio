import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PhoneHeader } from "./PhoneHeader";

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty("--phone-status-bg");
});

describe("PhoneHeader", () => {
  it("sets page titles in the display face", () => {
    render(<PhoneHeader title="Library" />);
    const title = screen.getByRole("heading", { name: "Library" });
    expect(title.className).toContain("font-title");
    expect(title.className).toContain("text-phone-page-title");
  });

  it("reserves the final header geometry before the cover colour is ready", () => {
    const { container } = render(<PhoneHeader title="Mix" artwork="https://example.test/cover.jpg" />);
    const header = container.querySelector("header") as HTMLElement;
    expect(header.style.backgroundColor).toBe("");
    expect(header.className).toContain("rounded-b-[24px]");
    expect(header.className).toContain("px-4");
    const title = screen.getByRole("heading", { name: "Mix" });
    expect(title.className).toContain("text-ink-1");
    expect(title.className).toContain("font-title");
  });

  it("keeps the status strip on its default colour", () => {
    render(<PhoneHeader title="Mix" artwork="https://example.test/cover.jpg" />);
    expect(document.documentElement.style.getPropertyValue("--phone-status-bg")).toBe("");
  });

  it("holds the title until the shared cover has morphed in", () => {
    render(<PhoneHeader title="Mix" artwork="https://example.test/cover.jpg" sharedArtworkId="cover:album:1" />);
    const block = screen.getByRole("heading", { name: "Mix" }).parentElement as HTMLElement;
    expect(block.style.opacity).toBe("0");
  });
});
