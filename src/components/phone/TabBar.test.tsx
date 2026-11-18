import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { House } from "@phosphor-icons/react";
import { TabBar } from "./TabBar";
import { useNavigation } from "../../stores/navigation";
import { haptic } from "../../lib/haptics";

vi.mock("../../lib/haptics", () => ({ haptic: vi.fn() }));

afterEach(() => cleanup());

beforeEach(() => {
  useNavigation.setState({ view: { name: "home" }, tab: "home", navPast: [], navFuture: [], pendingScroll: null });
});

describe("TabBar", () => {
  it("shows the four tabs in order", () => {
    render(<TabBar />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const labels = within(nav)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels).toEqual(["Home", "Search", "Library", "Hotlist"]);
  });

  it("marks the tab of the current view as the page", () => {
    render(<TabBar />);
    expect(screen.getByRole("button", { name: "Home" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "Search" }).getAttribute("aria-current")).toBeNull();
  });

  it("distinguishes the selected tab with theme ink colours", () => {
    render(<TabBar />);
    expect(screen.getByRole("button", { name: "Home" }).className).toContain("text-ink-1");
    expect(screen.getByRole("button", { name: "Search" }).className).toContain("text-ink-2");
  });

  it("uses the theme surface for the bar and no hard-coded colours", () => {
    render(<TabBar />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav.className).toContain("bg-surface");
    expect(nav.className).not.toMatch(/#|bg-white/);
    for (const button of nav.querySelectorAll("button")) {
      expect(button.className).not.toMatch(/#|text-white/);
    }
  });

  it("uses 24px phone icons", () => {
    const { container } = render(<TabBar />);
    for (const svg of container.querySelectorAll("svg")) {
      expect(svg.getAttribute("width")).toBe("24");
    }
  });

  it("re-tapping the active tab pops it to its root and scrolls to the top", () => {
    useNavigation.setState({ view: { name: "playlist", param: "p1" }, tab: "library" });
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

  it("gives a tick when the active tab is tapped again", () => {
    useNavigation.setState({ view: { name: "library" }, tab: "library" });
    render(<TabBar />);
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    expect(haptic).toHaveBeenCalledWith("tick");
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

  it("dims the tab content to 0.6 opacity while pressed, without scaling", () => {
    render(<TabBar />);
    const content = screen.getByRole("button", { name: "Home" }).querySelector("span");
    expect(content?.className).toContain("group-active:opacity-60");
    expect(content?.className).not.toContain("scale");
  });

  it("fills the active icon and keeps the others regular", () => {
    const { container } = render(<TabBar />);
    const filled = render(<House size={24} weight="fill" />).container.querySelector("svg");
    const regular = render(<House size={24} weight="regular" />).container.querySelector("svg");
    const buttons = within(screen.getByRole("navigation", { name: "Main" })).getAllByRole("button");
    expect(buttons[0].querySelector("svg")?.innerHTML).toBe(filled?.innerHTML);
    expect(buttons[1].querySelector("svg")?.innerHTML).not.toBe(filled?.innerHTML);
    expect(regular?.innerHTML).not.toBe(filled?.innerHTML);
    expect(container.querySelectorAll("svg")).toHaveLength(4);
  });

  it("sets the active label to semibold and the others to medium", () => {
    render(<TabBar />);
    expect(screen.getByText("Home").className).toContain("font-semibold");
    expect(screen.getByText("Search").className).toContain("font-medium");
  });

  it("has no capsule behind the active icon and no top border", () => {
    const { container } = render(<TabBar />);
    expect(container.querySelector("button > span.flex")?.className).not.toContain("rounded-full");
    expect(container.querySelector("nav")?.className).not.toContain("border");
  });

  it("keeps Library active for a view opened from Library", () => {
    useNavigation.setState({ view: { name: "playlist", param: "p1" }, tab: "library" });
    render(<TabBar />);
    expect(screen.getByRole("button", { name: "Library" }).getAttribute("aria-current")).toBe("page");
  });

  it("keeps Search active for an album opened from Search", () => {
    useNavigation.setState({ view: { name: "album", param: "a1" }, tab: "search" });
    render(<TabBar />);
    expect(screen.getByRole("button", { name: "Search" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "Library" }).getAttribute("aria-current")).toBeNull();
  });

  it("keeps Library active for Downloads and Home for Settings", () => {
    useNavigation.setState({ view: { name: "downloads" }, tab: "library" });
    const { unmount } = render(<TabBar />);
    expect(screen.getByRole("button", { name: "Library" }).getAttribute("aria-current")).toBe("page");
    unmount();
    useNavigation.setState({ view: { name: "settings" }, tab: "home" });
    render(<TabBar />);
    expect(screen.getByRole("button", { name: "Home" }).getAttribute("aria-current")).toBe("page");
  });
  it("shows no background pill behind the active tab", () => {
    const { container } = render(<TabBar />);
    expect(container.querySelector('nav > span[aria-hidden="true"]')).toBeNull();
  });
});
