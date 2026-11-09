import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TabBar } from "./TabBar";
import { useNavigation } from "../../stores/navigation";

afterEach(() => cleanup());

beforeEach(() => {
  useNavigation.setState({ view: { name: "home" }, navPast: [], navFuture: [], pendingScroll: null });
});

describe("TabBar", () => {
  it("shows the five tabs in order", () => {
    render(<TabBar />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const labels = within(nav)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels).toEqual(["Home", "Search", "Library", "Downloads", "Settings"]);
  });

  it("marks the tab of the current view as the page", () => {
    render(<TabBar />);
    expect(screen.getByRole("button", { name: "Home" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "Search" }).getAttribute("aria-current")).toBeNull();
  });

  it("navigates to the tab's route when tapped", () => {
    render(<TabBar />);
    fireEvent.click(screen.getByRole("button", { name: "Downloads" }));
    expect(useNavigation.getState().view).toEqual({ name: "downloads" });
    expect(screen.getByRole("button", { name: "Downloads" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "Home" }).getAttribute("aria-current")).toBeNull();
  });

  it("keeps Library active for a view opened from Library", () => {
    useNavigation.setState({ view: { name: "playlist", param: "p1" } });
    render(<TabBar />);
    expect(screen.getByRole("button", { name: "Library" }).getAttribute("aria-current")).toBe("page");
  });
});
