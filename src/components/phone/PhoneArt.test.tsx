import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { PhoneArt } from "./PhoneArt";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PhoneArt pending state", () => {
  it("keeps a pending image quiet and shows the fallback only when art is absent or failed", () => {
    const pending = render(<PhoneArt src="https://example.test/pending.jpg" />);
    expect(pending.container.querySelector("svg")).toBeNull();
    fireEvent.error(pending.container.querySelector("img")!);
    expect(pending.container.querySelector("svg")).toBeTruthy();
    pending.unmount();

    const missing = render(<PhoneArt src={null} />);
    expect(missing.container.querySelector("svg")).toBeTruthy();
  });

  it("fades in an image that finished loading before React attached its load handler", async () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(300);
    const { container } = render(<PhoneArt src="https://example.test/cached-before-mount.jpg" />);
    const img = container.querySelector("img")!;
    await waitFor(() => expect(img.style.opacity).toBe("1"));
  });
});
