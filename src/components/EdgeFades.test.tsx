import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EdgeFades } from "./EdgeFades";

afterEach(cleanup);

function setScroll(node: HTMLElement, position: number, size: number, view: number) {
  Object.defineProperty(node, "scrollTop", { configurable: true, value: position });
  Object.defineProperty(node, "scrollHeight", { configurable: true, value: size });
  Object.defineProperty(node, "clientHeight", { configurable: true, value: view });
  fireEvent.scroll(node);
}

describe("EdgeFades", () => {
  it("renders an overlay scroll area with the edge fade class", () => {
    render(
      <EdgeFades id="list">
        <p>row</p>
      </EdgeFades>,
    );
    const area = document.getElementById("list") as HTMLElement;
    expect(area.classList.contains("edge-fades")).toBe(true);
    expect(area.classList.contains("overlay-scroll")).toBe(true);
    expect(area.classList.contains("overflow-y-auto")).toBe(true);
    expect(screen.getByText("row")).toBeTruthy();
  });

  it("marks only the edge with more content beyond it", () => {
    render(
      <EdgeFades id="list">
        <p>row</p>
      </EdgeFades>,
    );
    const area = document.getElementById("list") as HTMLElement;
    setScroll(area, 0, 900, 300);
    expect(area.dataset.fadeStart).toBe("false");
    expect(area.dataset.fadeEnd).toBe("true");

    setScroll(area, 300, 900, 300);
    expect(area.dataset.fadeStart).toBe("true");
    expect(area.dataset.fadeEnd).toBe("true");

    setScroll(area, 600, 900, 300);
    expect(area.dataset.fadeEnd).toBe("false");
  });

  it("uses the horizontal axis when asked", () => {
    render(
      <EdgeFades id="shelf" axis="x">
        <p>tile</p>
      </EdgeFades>,
    );
    const area = document.getElementById("shelf") as HTMLElement;
    expect(area.classList.contains("overflow-x-auto")).toBe(true);
    expect("fadeX" in area.dataset).toBe(true);
  });
});
