import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportPage } from "./ImportPage";

vi.mock("../lib/usePhone", () => ({ usePhone: () => true }));

afterEach(cleanup);

describe("ImportPage on phone", () => {
  it("renders the Spotify sheet in the overlay layer above the page and dock", async () => {
    const user = userEvent.setup();
    render(
      <main className="relative isolate z-0">
        <ImportPage />
      </main>,
    );
    await user.click(await screen.findByRole("button", { name: "Connect" }));
    const dialog = await screen.findByRole("dialog", { name: "Spotify" });
    const layer = dialog.closest<HTMLElement>(".fixed");
    expect(layer).not.toBeNull();
    expect(layer?.parentElement).toBe(document.body);
    expect(layer?.className).toContain("z-[115]");
    expect(dialog.closest("main")).toBeNull();
  });
});
