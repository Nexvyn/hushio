import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageHeader } from "./PageHeader";
import { useNavigation } from "../stores/navigation";

vi.mock("../lib/usePhone", () => ({ usePhone: () => true }));

const initial = useNavigation.getState();

beforeEach(() => {
  useNavigation.setState({ ...initial, view: { name: "home" }, navPast: [], navFuture: [] }, true);
});

afterEach(cleanup);

describe("PageHeader back arrow on phone", () => {
  it("shows no back arrow on the Home tab root", () => {
    render(<PageHeader title="Home" />);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("shows a back arrow on a non-root collection page", () => {
    useNavigation.setState({ view: { name: "playlist", param: "p1" } });
    render(<PageHeader title="Liked Songs" />);
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });

  it("goes back in history when there is history", () => {
    useNavigation.setState({
      view: { name: "album", param: "a1" },
      navPast: [{ view: { name: "search" }, scroll: 0 }],
    });
    render(<PageHeader title="Album" />);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(useNavigation.getState().view).toEqual({ name: "search" });
  });

  it("goes to the tab root when history is empty", () => {
    useNavigation.setState({ view: { name: "newreleases" }, tab: "hotlist", navPast: [] });
    render(<PageHeader title="New releases" />);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(useNavigation.getState().view).toEqual({ name: "charts" });
  });
});
