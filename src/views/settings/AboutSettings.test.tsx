import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AboutHeader, AboutMaker } from "./AboutSettings";

afterEach(cleanup);

describe("AboutMaker", () => {
  it("shows the maker text", () => {
    render(<AboutMaker onOpen={() => {}} />);
    expect(
      screen.getByText(
        "Made by Nexvyn. A free, calm music player with no ads and no servers. Built because music apps got too noisy.",
      ),
    ).toBeTruthy();
  });

  it("opens the GitHub profile through the handler", () => {
    const onOpen = vi.fn();
    render(<AboutMaker onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "GitHub" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("AboutHeader", () => {
  it("shows the app name, version and licence", () => {
    render(<AboutHeader version="2.0.0" />);
    expect(screen.getByText("Version 2.0.0")).toBeTruthy();
    expect(screen.getByText("Free and open source under GPL-3.0")).toBeTruthy();
  });

  it("omits the version line while the version is unknown", () => {
    render(<AboutHeader version={null} />);
    expect(screen.queryByText(/^Version/)).toBeNull();
  });
});
