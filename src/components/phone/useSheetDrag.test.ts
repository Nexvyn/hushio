import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { projectDistance } from "../../lib/gesturePhysics";
import { dragOffset, sheetReleaseCloses, useSheetDrag } from "./useSheetDrag";

describe("sheetReleaseCloses", () => {
  const screen = 800;

  it("closes when the drag passes 28% of the screen height", () => {
    expect(sheetReleaseCloses(224, screen, 0)).toBe(false);
    expect(sheetReleaseCloses(225, screen, 0)).toBe(true);
  });

  it("closes on a fast downward fling even for a short drag", () => {
    expect(sheetReleaseCloses(20, screen, 400)).toBe(false);
    expect(sheetReleaseCloses(20, screen, 601)).toBe(true);
    expect(sheetReleaseCloses(0, screen, 1200)).toBe(true);
  });

  it("closes when a fast flick would carry the sheet past the threshold", () => {
    expect(sheetReleaseCloses(20, screen, 450)).toBe(true);
  });

  it("springs back for a short, slow drag", () => {
    expect(sheetReleaseCloses(100, screen, 200)).toBe(false);
  });
});

describe("projectDistance", () => {
  it("lands a flick farther than the release point", () => {
    expect(100 + projectDistance(1000)).toBeGreaterThan(100);
  });
});

describe("useSheetDrag travel", () => {
  it("dismisses to the travel distance when one is given", async () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useSheetDrag(onClose, () => "grab", undefined, () => 500));
    act(() => result.current.close());
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 3000 });
    expect(result.current.y.get()).toBeCloseTo(500);
  });
});

describe("dragOffset", () => {
  it("follows a downward drag one to one", () => {
    expect(dragOffset(150)).toBe(150);
  });

  it("rubber bands upward past the rest position, resisting more the further it goes", () => {
    const near = dragOffset(-20, 800);
    const far = dragOffset(-200, 800);
    expect(near).toBeLessThan(0);
    expect(near).toBeGreaterThan(-20);
    expect(far).toBeLessThan(-40);
    expect(far).toBeGreaterThan(-200 * 0.6);
  });
});
