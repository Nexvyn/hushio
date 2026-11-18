import { describe, expect, it } from "vitest";
import { miniAxis, pullClaim } from "./gestureClaim";

describe("pullClaim", () => {
  it("waits until the finger has moved past the axis lock", () => {
    expect(pullClaim(0, 3, 0)).toBe("pending");
    expect(pullClaim(2, 2, 0)).toBe("pending");
  });

  it("releases horizontal pans so shelves scroll natively", () => {
    expect(pullClaim(30, 4, 0)).toBe("release");
    expect(pullClaim(-30, 12, 0)).toBe("release");
  });

  it("claims a downward vertical pull only at the top of the list", () => {
    expect(pullClaim(1, 20, 0)).toBe("pull");
    expect(pullClaim(1, 20, 40)).toBe("release");
  });

  it("releases an upward vertical move", () => {
    expect(pullClaim(0, -20, 0)).toBe("release");
  });
});

describe("miniAxis", () => {
  it("locks to the horizontal axis after 8px of sideways travel", () => {
    expect(miniAxis(8, 1)).toBe("x");
    expect(miniAxis(-9, 3)).toBe("x");
  });

  it("locks to the vertical axis when the move is mostly up or down", () => {
    expect(miniAxis(2, -10)).toBe("y");
  });

  it("stays undecided under 8px", () => {
    expect(miniAxis(5, 5)).toBeNull();
  });
});
