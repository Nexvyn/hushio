import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AboutText } from "./AboutText";

function clamp(scrollHeight: number, clientHeight: number) {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => scrollHeight });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => clientHeight });
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
});

describe("AboutText", () => {
  it("shows the heading and text without a toggle when the text fits", () => {
    clamp(40, 60);
    render(<AboutText heading="About the artist" text="Short." />);

    expect(screen.getByRole("heading", { name: "About the artist" })).toBeTruthy();
    expect(screen.getByText("Short.")).toBeTruthy();
    expect(screen.queryByRole("button")).not.toBeTruthy();
  });

  it("clamps clipped text and toggles More and Less", async () => {
    const user = userEvent.setup();
    clamp(120, 60);
    render(<AboutText heading="About the artist" text="A long story." />);

    const body = screen.getByText("A long story.");
    expect(body.className).toContain("overflow-hidden");

    await user.click(await screen.findByRole("button", { name: "More" }));
    expect(screen.getByText("A long story.").className).not.toContain("overflow-hidden");

    await user.click(screen.getByRole("button", { name: "Less" }));
    expect(screen.getByRole("button", { name: "More" })).toBeTruthy();
  });

  it("expands when the text itself is pressed while clipped", async () => {
    const user = userEvent.setup();
    clamp(120, 60);
    render(<AboutText heading="About the artist" text="Tap me." />);

    await user.click(await screen.findByText("Tap me."));

    expect(screen.getByRole("button", { name: "Less" })).toBeTruthy();
  });
});
