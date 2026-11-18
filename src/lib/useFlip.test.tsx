import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { useFlip } from "./useFlip";

type Call = { key: string; frames: Keyframe[]; options: KeyframeAnimationOptions };

let calls: Call[] = [];

function List({ keys, skip }: { keys: string[]; skip?: () => boolean }) {
  const ref = useRef<HTMLUListElement>(null);
  useFlip(ref, keys.join("\n"), skip);
  return (
    <ul ref={ref}>
      {keys.map((key, index) => (
        <li key={key} data-row-key={key} data-top={index * 40} />
      ))}
    </ul>
  );
}

const callsFor = (key: string) => calls.filter((call) => call.key === key);

const originalOffsetTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");

beforeEach(() => {
  calls = [];
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get(this: HTMLElement) {
      return Number(this.dataset.top ?? 0);
    },
  });
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    writable: true,
    value(this: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
      calls.push({ key: this.dataset.rowKey ?? "", frames, options });
      return { cancel() {}, finished: Promise.resolve() } as unknown as Animation;
    },
  });
});

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("reduce-motion");
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  if (originalOffsetTop) Object.defineProperty(HTMLElement.prototype, "offsetTop", originalOffsetTop);
});

describe("useFlip", () => {
  it("plays nothing on the first mount", () => {
    render(<List keys={["a", "b", "c"]} />);
    expect(calls).toHaveLength(0);
  });

  it("slides moved rows from their old top to the new one", () => {
    const { rerender } = render(<List keys={["a", "b", "c"]} />);
    rerender(<List keys={["b", "a", "c"]} />);
    expect(callsFor("c")).toHaveLength(0);
    expect(callsFor("a")).toEqual([
      {
        key: "a",
        frames: [{ transform: "translateY(-40px)" }, { transform: "translateY(0)" }],
        options: { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      },
    ]);
    expect(callsFor("b")[0]?.frames).toEqual([{ transform: "translateY(40px)" }, { transform: "translateY(0)" }]);
  });

  it("closes the gap left by a removed row", () => {
    const { rerender } = render(<List keys={["a", "b", "c"]} />);
    rerender(<List keys={["a", "c"]} />);
    expect(callsFor("b")).toHaveLength(0);
    expect(callsFor("c")[0]?.frames).toEqual([{ transform: "translateY(40px)" }, { transform: "translateY(0)" }]);
  });

  it("fades a newly added row in over the fade token", () => {
    const { rerender } = render(<List keys={["a", "b"]} />);
    rerender(<List keys={["a", "x", "b"]} />);
    expect(callsFor("x")).toEqual([
      { key: "x", frames: [{ opacity: 0 }, { opacity: 1 }], options: { duration: 120, easing: "cubic-bezier(0.22, 1, 0.36, 1)" } },
    ]);
  });

  it("does nothing while the skip check reports a sortable move or drag", () => {
    const { rerender } = render(<List keys={["a", "b", "c"]} skip={() => true} />);
    rerender(<List keys={["b", "a", "c"]} skip={() => true} />);
    expect(calls).toHaveLength(0);
  });

  it("does nothing when the signature has not changed", () => {
    const { rerender } = render(<List keys={["a", "b"]} />);
    rerender(<List keys={["a", "b"]} />);
    expect(calls).toHaveLength(0);
  });

  it("plays nothing under reduced motion", () => {
    document.documentElement.classList.add("reduce-motion");
    const { rerender } = render(<List keys={["a", "b", "c"]} />);
    rerender(<List keys={["b", "a", "c"]} />);
    expect(calls).toHaveLength(0);
  });
});
