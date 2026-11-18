import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { FIRST_LOAD_STAGGER_FALLBACK_MS, useFirstLoadStagger } from "./useFirstLoadStagger";

function Probe({ label, ready, count = 3 }: { label: string; ready: boolean; count?: number }) {
  const stagger = useFirstLoadStagger(ready);
  return (
    <ol data-testid="list" className={stagger.className} onAnimationEnd={stagger.onAnimationEnd}>
      {Array.from({ length: count }, (_, index) => (
        <li key={index} data-testid={`row-${index}`}>{`${label}${index}`}</li>
      ))}
    </ol>
  );
}

const listClass = () => screen.getByTestId("list").className;

function endRise(testId: string, animationName = "bt-rise-soft") {
  const node = screen.getByTestId(testId);
  const event = createEvent.animationEnd(node);
  Object.defineProperty(event, "animationName", { value: animationName });
  fireEvent(node, event);
}

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.classList.remove("reduce-motion");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.classList.remove("reduce-motion");
});

describe("useFirstLoadStagger", () => {
  it("applies no class until the data is ready", () => {
    const { rerender } = render(<Probe label="a" ready={false} />);
    expect(listClass()).toBe("");
    rerender(<Probe label="a" ready />);
    expect(listClass()).toBe("bt-stagger");
  });

  it("clears the class when the last animated child finishes", () => {
    render(<Probe label="a" ready count={7} />);
    endRise("row-0");
    endRise("row-3");
    expect(listClass()).toBe("bt-stagger");
    endRise("row-4");
    expect(listClass()).toBe("");
  });

  it("ignores the end of a child's other animations", () => {
    render(<Probe label="a" ready count={3} />);
    endRise("row-2", "some-other-animation");
    expect(listClass()).toBe("bt-stagger");
  });

  it("uses the last of the first five children when the list is longer", () => {
    render(<Probe label="a" ready count={9} />);
    endRise("row-4");
    expect(listClass()).toBe("");
  });

  it("falls back to a timer when no animation end arrives", () => {
    render(<Probe label="a" ready />);
    act(() => {
      vi.advanceTimersByTime(FIRST_LOAD_STAGGER_FALLBACK_MS - 1);
    });
    expect(listClass()).toBe("bt-stagger");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(listClass()).toBe("");
  });

  it("does not bring the class back on a re-render", () => {
    const { rerender } = render(<Probe label="a" ready />);
    endRise("row-2");
    rerender(<Probe label="b" ready />);
    expect(listClass()).toBe("");
  });

  it("never applies the class under reduced motion", () => {
    document.documentElement.classList.add("reduce-motion");
    render(<Probe label="a" ready />);
    expect(listClass()).toBe("");
  });
});
