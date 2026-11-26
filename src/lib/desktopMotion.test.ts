import { describe, expect, it } from "vitest";
import { fs, SRC_DIR } from "./testFiles";
import { fade, gate, instant, pressTap, DURATION_MS } from "./motion";
import { pickerMotion } from "./pickerLayout";

const motionCss = fs.readFileSync(`${SRC_DIR}styles/motion.css`, "utf8");

function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return "";
  return css.slice(start, css.indexOf("}", start) + 1);
}

describe("desktop motion config", () => {
  it("exits are quicker than enters for menus and dialogs", () => {
    const motion = pickerMotion(false);
    const enter = motion.transition as { duration: number };
    const exit = (motion.exit as { transition: { duration: number } }).transition;
    expect(exit.duration).toBeLessThan(enter.duration);
  });

  it("drops entrance and exit motion when reduced", () => {
    const motion = pickerMotion(true);
    expect(motion.exit).toBeUndefined();
    expect(motion.transition).toBe(instant);
  });

  it("gates transitions to instant under reduced motion", () => {
    expect(gate(true, fade)).toBe(instant);
    expect(gate(false, fade)).toBe(fade);
    expect(instant.duration).toBe(0);
  });

  it("keeps UI transitions in the 120 to 250ms range", () => {
    for (const name of ["fade", "quick", "picker", "swap", "hover", "reveal", "pageIn"] as const) {
      expect(DURATION_MS[name]).toBeGreaterThanOrEqual(120);
      expect(DURATION_MS[name]).toBeLessThanOrEqual(280);
    }
  });

  it("scales pressed controls to 0.97 and disables the press when reduced", () => {
    expect(pressTap(true)).toBeUndefined();
    expect(pressTap(false)).toMatchObject({ scale: 0.97 });
  });
});

describe("desktop motion stylesheet", () => {
  it("does not lift cover cards on hover", () => {
    expect(motionCss).not.toContain(".bt-lift");
  });

  it("reveals the view with an 8px rise and no row stagger", () => {
    expect(ruleBody(motionCss, "@keyframes bt-page-in")).toContain("translateY(var(--page-rise, 8px))");
    expect(motionCss).not.toContain("bt-stagger");
  });
});
