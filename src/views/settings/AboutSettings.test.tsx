import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AboutHeader, AboutMaker, GITHUB_URL, WEBSITE_URL } from "./AboutSettings";

afterEach(cleanup);

describe("About links", () => {
  it("points at the Hushio repository and website", () => {
    expect(GITHUB_URL).toBe("https://github.com/Nexvyn/hushio");
    expect(WEBSITE_URL).toBe("https://hushio.nexvyn.dev");
  });
});

describe("AboutMaker", () => {
  it("shows the maker text", () => {
    render(<AboutMaker onOpen={() => {}} onWebsite={() => {}} />);
    expect(
      screen.getByText(
        "Made by Nexvyn. A free, calm music player with no ads and no servers. Built because music apps got too noisy.",
      ),
    ).toBeTruthy();
  });

  it("opens the GitHub repository through the handler", () => {
    const onOpen = vi.fn();
    render(<AboutMaker onOpen={onOpen} onWebsite={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "GitHub" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("shows a Website button that opens through its own handler", () => {
    const onWebsite = vi.fn();
    const onOpen = vi.fn();
    render(<AboutMaker onOpen={onOpen} onWebsite={onWebsite} />);
    fireEvent.click(screen.getByRole("button", { name: "Website" }));
    expect(onWebsite).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
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
