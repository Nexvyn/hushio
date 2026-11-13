import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowseRow } from "./SearchRows";
import type { BrowseItem } from "../lib/searchParse";

vi.mock("../lib/searchActions", () => ({ openBrowse: vi.fn() }));
vi.mock("../lib/browseActions", () => ({ browseMenuItems: vi.fn(() => []) }));

function item(overrides: Partial<BrowseItem>): BrowseItem {
  return { type: "artist", browseId: "UC1", title: "Arijit Singh", subtitle: "", thumb: null, ...overrides };
}

describe("BrowseRow", () => {
  afterEach(cleanup);

  it("shows the type label once and the subtitle after it", () => {
    render(<BrowseRow item={item({ subtitle: "655M monthly audience" })} query="arijit" />);
    expect(screen.getByText("Artist • 655M monthly audience")).toBeTruthy();
  });

  it("does not repeat a subtitle that already starts with the type label", () => {
    render(<BrowseRow item={item({ subtitle: "Artist • 655M monthly audience" })} query="arijit" />);
    expect(screen.getByText("Artist • 655M monthly audience")).toBeTruthy();
    expect(screen.queryByText(/Artist · Artist/)).toBeNull();
  });

  it("falls back to the type label alone", () => {
    render(<BrowseRow item={item({ type: "album", subtitle: "" })} query="arijit" />);
    expect(screen.getByText("Album")).toBeTruthy();
  });

  it("drops the YouTube More label from a video subtitle", () => {
    render(<BrowseRow item={item({ type: "other", browseId: "X1", title: "Mashup", subtitle: "Dec 6, 2024 • AMEET Mashup" })} query="ameet" />);
    expect(screen.getByText("Dec 6, 2024 • AMEET Mashup")).toBeTruthy();
    expect(screen.queryByText(/More/)).toBeNull();
  });
});
