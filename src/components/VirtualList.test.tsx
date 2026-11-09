import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VirtualList } from "./VirtualList";

const rows = (count: number) => Array.from({ length: count }, (_, index) => index);

afterEach(() => cleanup());

function renderList(count: number) {
  return render(
    <div data-testid="scroller" style={{ overflowY: "auto" }}>
      <VirtualList
        label="Tracks"
        items={rows(count)}
        rowHeight={56}
        getKey={(item) => String(item)}
        renderRow={(item) => <span>Row {item}</span>}
      />
    </div>,
  );
}

describe("VirtualList", () => {
  it("renders every row of a list up to 200 rows", () => {
    renderList(150);
    expect(screen.getAllByRole("listitem")).toHaveLength(150);
  });

  it("renders only a window of a list over 200 rows", () => {
    renderList(1000);
    const rendered = screen.getAllByRole("listitem");
    expect(rendered.length).toBeLessThan(30);
    expect(screen.getByText("Row 0")).toBeTruthy();
    expect(screen.queryByText("Row 999")).toBeNull();
  });

  it("moves the window when the scroller scrolls", () => {
    renderList(1000);
    const scroller = screen.getByTestId("scroller");
    const list = screen.getByRole("list", { name: "Tracks" });
    let scrollTop = 0;
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 560 });
    list.getBoundingClientRect = () => ({ top: -scrollTop, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: -scrollTop, toJSON: () => ({}) }) as DOMRect;

    scrollTop = 28000;
    fireEvent.scroll(scroller);

    expect(screen.getByText("Row 500")).toBeTruthy();
    expect(screen.queryByText("Row 0")).toBeNull();
    expect(screen.getAllByRole("listitem").length).toBeLessThan(30);

  });
});
