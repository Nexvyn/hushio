import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CreditsBlock } from "./CreditsBlock";

afterEach(cleanup);

describe("CreditsBlock", () => {
  it("shows the performers and the source, and says written and produced credits are missing", () => {
    render(<CreditsBlock song={{ artist: "NOVA,SOL" }} />);

    expect(screen.getByRole("region", { name: "Credits" })).toBeTruthy();
    expect(screen.getByText("Performed by")).toBeTruthy();
    expect(screen.getByText("Nova, Sol")).toBeTruthy();
    expect(screen.getByText("Source")).toBeTruthy();
    expect(screen.getByText("Online catalogue")).toBeTruthy();
    expect(screen.getByText(/not available for this song/)).toBeTruthy();
    expect(screen.queryByText(/written by|produced by/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/YouTube Music/);
  });

  it("omits the performer row when the song has no artist", () => {
    render(<CreditsBlock song={{ artist: "" }} />);

    expect(screen.queryByText("Performed by")).toBeNull();
    expect(screen.getByText("Source")).toBeTruthy();
  });
});
