import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { motionValue } from "motion/react";
import { useScrimMounted } from "./useScrimMounted";
import { fs, SRC_DIR } from "./testFiles";

describe("useScrimMounted", () => {
  it("is mounted only while the shade is above zero", () => {
    const shade = motionValue(0);
    const { result } = renderHook(() => useScrimMounted(shade));
    expect(result.current).toBe(false);
    act(() => shade.set(0.4));
    expect(result.current).toBe(true);
    act(() => shade.set(0));
    expect(result.current).toBe(false);
  });

  it("starts mounted when the shade is already open", () => {
    const shade = motionValue(1);
    const { result } = renderHook(() => useScrimMounted(shade));
    expect(result.current).toBe(true);
  });
});

describe("roll scrims", () => {
  it("draw the shade without a backdrop blur in both shells", () => {
    for (const file of ["App.tsx", "components/phone/PhoneShell.tsx"]) {
      const text = fs.readFileSync(`${SRC_DIR}${file}`, "utf8");
      expect(text, file).not.toMatch(/backdrop-blur/);
    }
  });
});
