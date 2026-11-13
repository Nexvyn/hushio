import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TabBar } from "./TabBar";
import { useNavigation } from "../../stores/navigation";

afterEach(() => cleanup());

beforeEach(() => {
  useNavigation.setState({ view: { name: "home" }, navPast: [], navFuture: [], pendingScroll: null });
});

describe("TabBar", () => {
  it("shows the three tabs in order", () => {
    render(<TabBar />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const labels = within(nav)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels).toEqual(["Home", "Search", "Library"]);
  });

  it("marks the tab of the current view as the page", () => {
    render(<TabBar />);
    expect(screen.getByRole("button", { name: "Home" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "Search" }).getAttribute("aria-current")).toBeNull();
  });

  it("paints the active tab in the accent and the others in ink-2", () => {
    render(<TabBar />);
    expect(screen.getByRole("button", { name: "Home" }).className).toContain("text-accent");
    expect(screen.getByRole("button", { name: "Search" }).className).toContain("text-ink-2");
  });

  it("uses 24px phone icons", () => {
    const { container } = render(<TabBar />);
    for (const svg of container.querySelectorAll("svg")) {
      expect(svg.getAttribute("width")).toBe("24");
    }
  });

  it("re-tapping the active tab pops it to its root and scrolls to the top", () => {
    useNavigation.setState({ view: { name: "playlist", param: "p1" } });
    const scroller = document.createElement("div");
    scroller.id = "view-scroll";
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo;
    document.body.appendChild(scroller);
    render(<TabBar />);
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    expect(useNavigation.getState().view).toEqual({ name: "library" });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    scroller.remove();
  });

  it("navigates to the tab's route when tapped", () => {
    render(<TabBar />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(useNavigation.getState().view).toEqual({ name: "search" });
    expect(screen.getByRole("button", { name: "Search" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "Home" }).getAttribute("aria-current")).toBeNull();
  });

  it("gives every tab a 48px minimum target", () => {
    render(<TabBar />);
    for (const button of screen.getByRole("navigation", { name: "Main" }).querySelectorAll("button")) {
      expect(button.className).toContain("min-h-12");
      expect(button.className).toContain("min-w-12");
    }
  });

  it("presses the tab content to 0.96 scale", () => {
    render(<TabBar />);
    const content = screen.getByRole("button", { name: "Home" }).querySelector("span");
    expect(content?.className).toContain("group-active:scale-[0.96]");
    expect(content?.className).toContain("duration-fade");
  });

  it("has no capsule behind the active icon and no top border", () => {
    const { container } = render(<TabBar />);
    expect(container.querySelector(".rounded-full")).toBeNull();
    expect(container.querySelector("nav")?.className).not.toContain("border");
  });

  it("keeps Library active for a view opened from Library", () => {
    useNavigation.setState({ view: { name: "playlist", param: "p1" } });
    render(<TabBar />);
    expect(screen.getByRole("button", { name: "Library" }).getAttribute("aria-current")).toBe("page");
  });

  it("keeps Library active for Downloads and Home for Settings", () => {
    useNavigation.setState({ view: { name: "downloads" } });
    const { unmount } = render(<TabBar />);
    expect(screen.getByRole("button", { name: "Library" }).getAttribute("aria-current")).toBe("page");
    unmount();
    useNavigation.setState({ view: { name: "settings" } });
    render(<TabBar />);
    expect(screen.getByRole("button", { name: "Home" }).getAttribute("aria-current")).toBe("page");
  });
});
