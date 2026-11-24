import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Groove } from "./Groove";

const lines = [
  { time: 10, text: "first line" },
  { time: 50, text: "second line" },
];

function slider(): HTMLElement {
  return screen.getByRole("slider", { name: "Seek" });
}

function mockTrack(element: HTMLElement) {
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 16, right: 200, bottom: 16, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

function pointer(node: HTMLElement, type: string, clientX: number) {
  fireEvent(node, new MouseEvent(type, { bubbles: true, clientX, button: 0 }));
}

describe("Groove", () => {
  afterEach(() => {
    cleanup();
  });

  it("exposes a slider with the time as value text", () => {
    render(<Groove seed="t1" position={69} duration={213} onSeek={vi.fn()} />);
    const node = slider();
    expect(node.getAttribute("aria-valuemax")).toBe("213");
    expect(node.getAttribute("aria-valuenow")).toBe("69");
    expect(node.getAttribute("aria-valuetext")).toBe("1:09 of 3:33");
    expect(screen.getByText("1:09")).toBeTruthy();
    expect(screen.getByText("3:33")).toBeTruthy();
  });

  it("seeks with the arrow keys, shift for 15 s, and Home and End", () => {
    const onSeek = vi.fn();
    render(<Groove seed="t1" position={60} duration={200} onSeek={onSeek} />);
    const node = slider();
    fireEvent.keyDown(node, { key: "ArrowRight" });
    expect(onSeek).toHaveBeenLastCalledWith(65);
    fireEvent.keyDown(node, { key: "ArrowLeft", shiftKey: true });
    expect(onSeek).toHaveBeenLastCalledWith(45);
    fireEvent.keyDown(node, { key: "Home" });
    expect(onSeek).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(node, { key: "End" });
    expect(onSeek).toHaveBeenLastCalledWith(200);
  });

  it("seeks to the clicked point on release", () => {
    const onSeek = vi.fn();
    render(<Groove seed="t1" position={0} duration={200} onSeek={onSeek} />);
    const node = slider();
    mockTrack(node);
    pointer(node, "pointerdown", 50);
    pointer(node, "pointerup", 100);
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(100);
  });

  it("does not seek when the pointer is cancelled", () => {
    const onSeek = vi.fn();
    render(<Groove seed="t1" position={0} duration={200} onSeek={onSeek} />);
    const node = slider();
    mockTrack(node);
    pointer(node, "pointerdown", 50);
    pointer(node, "pointercancel", 50);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("draws no lyric ticks, even when hovered or focused", () => {
    const { container } = render(<Groove seed="t1" position={0} duration={100} onSeek={vi.fn()} lyrics={lines} />);
    const node = slider();
    mockTrack(node);
    pointer(node, "pointermove", 60);
    fireEvent.focus(node);
    expect(container.querySelectorAll("[data-groove-tick]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-groove-tick], span.h-\\[3px\\]")).toHaveLength(0);
  });

  it("sizes the slider and knob per mode", () => {
    const expected = [
      ["stage", 21, 14],
      ["bar", 14, 10],
      ["compact", 11, 8],
    ] as const;
    for (const [profile, height, knob] of expected) {
      const { container, unmount } = render(
        <Groove seed="t1" position={20} duration={200} onSeek={vi.fn()} profile={profile} />,
      );
      expect(slider().style.height).toBe(`${height}px`);
      const knobNode = container.querySelector("[data-groove-knob]") as HTMLElement;
      expect(knobNode.style.width).toBe(`${knob}px`);
      expect(knobNode.style.height).toBe(`${knob}px`);
      unmount();
    }
  });

  it("keeps the invisible hit area at least 24 px tall", () => {
    render(<Groove seed="t1" position={0} duration={100} onSeek={vi.fn()} profile="compact" />);
    const hit = slider().querySelector("span[aria-hidden]") as HTMLElement;
    const pad = -Number.parseFloat(hit.style.top);
    expect(11 + pad * 2).toBeGreaterThanOrEqual(24);
  });

  it("shows the time and the lyric line under the pointer", () => {
    render(<Groove seed="t1" position={0} duration={100} onSeek={vi.fn()} lyrics={lines} />);
    const node = slider();
    mockTrack(node);
    pointer(node, "pointermove", 60);
    expect(screen.getByText("first line")).toBeTruthy();
    expect(screen.getByText("0:30")).toBeTruthy();
  });

  it("places the tooltip in its own strip above the track, not over the controls around it", () => {
    render(<Groove seed="t1" position={0} duration={100} onSeek={vi.fn()} lyrics={lines} />);
    const node = slider();
    mockTrack(node);
    pointer(node, "pointermove", 60);
    const tip = screen.getByText("first line").closest("span[aria-hidden]") as HTMLElement;
    expect(tip.className).toContain("bottom-0");
    expect(tip.className).not.toContain("bottom-full");
    expect(node.contains(tip)).toBe(false);
  });

  it("hides ticks and the tooltip in compact form but keeps seeking", () => {
    const onSeek = vi.fn();
    const { container } = render(
      <Groove seed="t1" position={0} duration={100} onSeek={onSeek} lyrics={lines} compact />,
    );
    const node = slider();
    mockTrack(node);
    pointer(node, "pointermove", 60);
    expect(screen.queryByText("first line")).toBeNull();
    expect(container.querySelectorAll("span.w-px")).toHaveLength(0);
    fireEvent.keyDown(node, { key: "ArrowRight" });
    expect(onSeek).toHaveBeenCalledWith(5);
  });

  it("is disabled until the song has a duration", () => {
    const onSeek = vi.fn();
    render(<Groove seed="t1" position={0} duration={0} onSeek={onSeek} />);
    const node = slider();
    expect(node.getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(node, { key: "ArrowRight" });
    expect(onSeek).not.toHaveBeenCalled();
  });
});

describe("Groove wave loop", () => {
  let frames: Map<number, FrameRequestCallback>;
  let clock: number;
  let raf: ReturnType<typeof vi.fn>;

  function stub(reduced: boolean) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: reduced && query.includes("reduce"),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  function step(count = 1) {
    for (let index = 0; index < count; index++) {
      clock += 40;
      const batch = [...frames.entries()];
      frames.clear();
      for (const [, callback] of batch) callback(clock);
    }
  }

  function settle() {
    let guard = 0;
    while (frames.size > 0 && guard < 200) {
      step();
      guard += 1;
    }
    return guard;
  }

  beforeEach(() => {
    frames = new Map();
    clock = 0;
    let next = 1;
    raf = vi.fn((callback: FrameRequestCallback) => {
      const id = next++;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frames.delete(id);
    });
    stub(false);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete (window as { matchMedia?: unknown }).matchMedia;
    Reflect.deleteProperty(document, "visibilityState");
  });

  it("runs the loop only while playing", () => {
    const { rerender } = render(<Groove seed="t1" position={10} duration={200} onSeek={vi.fn()} />);
    expect(raf).not.toHaveBeenCalled();
    rerender(<Groove seed="t1" position={10} duration={200} onSeek={vi.fn()} playing />);
    expect(raf).toHaveBeenCalled();
    expect(frames.size).toBe(1);
  });

  it("stops the loop after pausing, once the wave has eased to still", () => {
    const { rerender } = render(<Groove seed="t1" position={10} duration={200} onSeek={vi.fn()} playing />);
    step(5);
    expect(frames.size).toBe(1);
    rerender(<Groove seed="t1" position={10} duration={200} onSeek={vi.fn()} playing={false} />);
    const steps = settle();
    expect(steps).toBeGreaterThan(0);
    expect(steps).toBeLessThan(40);
    expect(frames.size).toBe(0);
    const calls = raf.mock.calls.length;
    step(3);
    expect(raf.mock.calls.length).toBe(calls);
  });

  it("never starts the loop under reduced motion", () => {
    stub(true);
    render(<Groove seed="t1" position={10} duration={200} onSeek={vi.fn()} playing />);
    expect(raf).not.toHaveBeenCalled();
  });

  it("never starts the loop while the document is hidden", () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    render(<Groove seed="t1" position={10} duration={200} onSeek={vi.fn()} playing />);
    expect(raf).not.toHaveBeenCalled();
  });

  it("places the knob at the progress with a transform", () => {
    const { container } = render(<Groove seed="t1" position={50} duration={200} onSeek={vi.fn()} />);
    const knob = container.querySelector("[data-groove-knob]") as HTMLElement;
    const head = container.querySelector("[data-groove-head]") as HTMLElement;
    expect(head.style.transform).toBe("translateX(25%)");
    expect(knob.style.left).toBe("");
    expect(knob.className).toContain("left-0");
  });

  it("moves the progress with transforms only, never width or left", () => {
    const { container } = render(<Groove seed="t1" position={50} duration={200} onSeek={vi.fn()} variant="plain" />);
    const fill = slider().querySelector("span.bg-accent") as HTMLElement;
    const head = container.querySelector("[data-groove-head]") as HTMLElement;
    expect(fill.style.transform).toBe("scaleX(0.25)");
    expect(fill.style.width).toBe("");
    expect(head.style.transform).toBe("translateX(25%)");
    expect(container.querySelector("[style*='left:']")).toBeNull();
  });
});

describe("Groove variants", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps the hills canvas by default", () => {
    const { container } = render(<Groove seed="t1" position={10} duration={200} onSeek={vi.fn()} profile="stage" />);
    expect(container.querySelector("canvas")).not.toBeNull();
  });

  it("renders a plain track with an accent fill and a knob, and no canvas", () => {
    const { container } = render(<Groove seed="t1" position={50} duration={200} onSeek={vi.fn()} variant="plain" />);
    expect(container.querySelector("canvas")).toBeNull();
    expect(slider().style.height).toBe("12px");
    const knob = container.querySelector("[data-groove-knob]") as HTMLElement;
    expect(knob.style.width).toBe("12px");
    expect(knob.className).toContain("group-hover:opacity-100");
    const fill = slider().querySelector("span.bg-accent") as HTMLElement;
    expect(fill.style.transform).toBe("scaleX(0.25)");
  });

  it("runs no animation loop in plain mode, even while playing", () => {
    const frame = vi.spyOn(window, "requestAnimationFrame");
    render(<Groove seed="t1" position={10} duration={200} onSeek={vi.fn()} variant="plain" playing />);
    expect(frame).not.toHaveBeenCalled();
  });

  it("reserves no strip above the plain track, so the bar stays compact", () => {
    const { container } = render(<Groove seed="t1" position={0} duration={100} onSeek={vi.fn()} variant="plain" />);
    expect(container.querySelectorAll(".h-5")).toHaveLength(0);
    expect(container.firstElementChild?.className).toContain("h-4");
  });

  it("shows the hover time above the plain track", () => {
    render(<Groove seed="t1" position={0} duration={100} onSeek={vi.fn()} variant="plain" lyrics={[{ time: 10, text: "first line" }]} />);
    const node = slider();
    node.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 12, right: 200, bottom: 12, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent(node, new MouseEvent("pointermove", { bubbles: true, clientX: 60, button: 0 }));
    const tip = screen.getByText("first line").closest("span[aria-hidden]") as HTMLElement;
    expect(tip.className).toContain("bottom-full");
    expect(node.contains(tip)).toBe(false);
  });

  it("keeps the time labels level with the track in plain mode", () => {
    const { container } = render(<Groove seed="t1" position={69} duration={213} onSeek={vi.fn()} variant="plain" />);
    expect(screen.getByText("1:09")).toBeTruthy();
    expect(screen.getByText("3:33")).toBeTruthy();
    expect(container.firstElementChild?.className).toContain("items-center");
  });
});
