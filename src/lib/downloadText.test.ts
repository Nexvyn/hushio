import { describe, expect, it } from "vitest";
import { safeFileName } from "./downloadText";

describe("safeFileName", () => {
  it("replaces characters Windows does not allow in file names", () => {
    expect(safeFileName("a<b>c:d\"e/f\\g|h?i*j")).toBe("a_b_c_d_e_f_g_h_i_j");
  });

  it("replaces control characters and trims the ends", () => {
    expect(safeFileName("  Mix\tTape\n  ")).toBe("Mix_Tape_");
  });

  it("falls back to playlist when nothing is left", () => {
    expect(safeFileName("   ")).toBe("playlist");
    expect(safeFileName("")).toBe("playlist");
  });

  it("keeps ordinary names unchanged", () => {
    expect(safeFileName("Road trip 2026")).toBe("Road trip 2026");
  });
});
