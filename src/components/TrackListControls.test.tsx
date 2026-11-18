import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhoneTrackFilter, TrackTools, arrangeTracks, FILTER_MIN_TRACKS } from "./TrackListControls";

afterEach(cleanup);

const tracks = [
  { title: "Blue Hour", artist: "Nova" },
  { title: "Red Sun", artist: "Ember" },
  { title: "Quiet", artist: "NOVA Ensemble" },
];

describe("arrangeTracks filter", () => {
  it("matches title or artist without regard to case and keeps the original positions", () => {
    expect(arrangeTracks(tracks, "NOVA", "custom").map((row) => row.index)).toEqual([0, 2]);
    expect(arrangeTracks(tracks, "sun", "custom").map((row) => row.index)).toEqual([1]);
  });

  it("returns every row for a blank filter", () => {
    expect(arrangeTracks(tracks, "  ", "custom")).toHaveLength(3);
  });
});

describe("phone track filter", () => {
  it("is hidden for short lists", () => {
    const { container } = render(
      <PhoneTrackFilter query="" onQuery={vi.fn()} count={FILTER_MIN_TRACKS - 1} />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("filters through the field and clears it with the clear button", async () => {
    const user = userEvent.setup();
    const onQuery = vi.fn();
    render(<PhoneTrackFilter query="nova" onQuery={onQuery} count={FILTER_MIN_TRACKS} />);

    await user.type(screen.getByRole("searchbox", { name: "Filter this list" }), "x");
    expect(onQuery).toHaveBeenLastCalledWith("novax");

    await user.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(onQuery).toHaveBeenLastCalledWith("");
  });

  it("offers no clear button while the field is empty", () => {
    render(<PhoneTrackFilter query="" onQuery={vi.fn()} count={FILTER_MIN_TRACKS} />);

    expect(screen.queryByRole("button", { name: "Clear filter" })).toBeNull();
  });
});

describe("desktop track tools", () => {
  const sortProps = { sort: "custom" as const, onSort: vi.fn() };

  it("shows the filter toggle for filterable lists", () => {
    render(<TrackTools query="" onQuery={vi.fn()} {...sortProps} filterable />);

    expect(screen.getByRole("button", { name: "Filter this list" })).not.toBeNull();
  });

  it("hides the filter toggle for short lists", () => {
    render(<TrackTools query="" onQuery={vi.fn()} {...sortProps} filterable={false} />);

    expect(screen.queryByRole("button", { name: "Filter this list" })).toBeNull();
  });

  it("clears the open filter with its clear button", async () => {
    const user = userEvent.setup();
    const onQuery = vi.fn();
    render(<TrackTools query="red" onQuery={onQuery} {...sortProps} filterable />);

    await user.click(screen.getByRole("button", { name: "Clear filter" }));

    expect(onQuery).toHaveBeenLastCalledWith("");
  });
});
