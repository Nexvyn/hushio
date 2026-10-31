import { describe, expect, it } from "vitest";
import {
  addEqPreset,
  checkPresetName,
  clampEqGain,
  cleanPresetName,
  deleteEqPreset,
  EQ_BAND_LABELS,
  EQ_BANDS_HZ,
  EQ_PRESET_LIMIT,
  EQ_PRESETS,
  EQ_RANGE,
  type EqPreset,
  eqY,
  flatGains,
  formatEqGain,
  isBuiltInEqPreset,
  normalizeEqGains,
  normalizeEqPresets,
  presetMatching,
  presetNameMessage,
  renameEqPreset,
  sameGains,
  updateEqPreset,
} from "./eq";

const CURVE = [3, 0, 0, 0, 0, 0, 0, 0, 0, -2];

function presetsNamed(count: number): EqPreset[] {
  return Array.from({ length: count }, (_, index) => ({ name: `Preset ${index}`, gains: flatGains() }));
}

describe("built-in presets", () => {
  it("lists the five PRD presets in order with their exact gains", () => {
    expect(Object.keys(EQ_PRESETS)).toEqual(["Flat", "Bass", "Treble", "Vocal", "Loudness"]);
    expect(EQ_PRESETS.Bass).toEqual([6, 5, 4, 2, 0, 0, 0, 0, 0, 0]);
    expect(EQ_PRESETS.Vocal).toEqual([-2, -2, -1, 0, 2, 4, 4, 2, 0, -1]);
    expect(EQ_PRESETS.Loudness).toEqual([5, 4, 2, 0, -1, -1, 0, 2, 4, 5]);
  });

  it("refuses built-in names with Object.hasOwn semantics", () => {
    expect(isBuiltInEqPreset("Bass")).toBe(true);
    expect(isBuiltInEqPreset("bass")).toBe(false);
    expect(isBuiltInEqPreset("toString")).toBe(false);
  });

  it("names the built-in preset that matches the curve", () => {
    expect(presetMatching([...EQ_PRESETS.Treble], [])).toBe("Treble");
    expect(presetMatching(flatGains(), [])).toBe("Flat");
  });
});

describe("gains", () => {
  it("clamps each band to plus or minus 12 dB in whole steps", () => {
    expect(clampEqGain(30)).toBe(EQ_RANGE);
    expect(clampEqGain(-30)).toBe(-EQ_RANGE);
    expect(clampEqGain(2.6)).toBe(3);
    expect(clampEqGain(Number.NaN)).toBe(0);
    expect(Object.is(clampEqGain(-0.2), 0)).toBe(true);
  });

  it("rounds half steps toward plus infinity and zeroes infinite gains", () => {
    expect(clampEqGain(2.5)).toBe(3);
    expect(clampEqGain(-2.5)).toBe(-2);
    expect(clampEqGain(12.4)).toBe(12);
    expect(clampEqGain(-12.6)).toBe(-12);
    expect(clampEqGain(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("uses the 10 PRD centre frequencies and their short labels", () => {
    expect(EQ_BANDS_HZ).toEqual([32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]);
    expect(EQ_BAND_LABELS).toEqual(["32", "64", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"]);
  });

  it("clamps the knob position at the board edges", () => {
    expect(eqY(20)).toBe(eqY(EQ_RANGE));
    expect(eqY(-20)).toBe(eqY(-EQ_RANGE));
  });

  it("normalises a stored gain array, falling back to flat for bad lengths", () => {
    expect(normalizeEqGains([99, -99, 1, 0, 0, 0, 0, 0, 0, 0])).toEqual([12, -12, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(normalizeEqGains([1, 2, 3])).toEqual(flatGains());
    expect(normalizeEqGains("bass")).toEqual(flatGains());
  });

  it("formats gains with a real minus sign and no sign at zero", () => {
    expect([formatEqGain(3), formatEqGain(0), formatEqGain(-2)]).toEqual(["+3", "0", "−2"]);
  });

  it("places the knob by the PRD formula for the board height", () => {
    expect(eqY(12)).toBe(8);
    expect(eqY(-12)).toBe(152);
    expect(eqY(0)).toBe(80);
  });

  it("compares curves band by band", () => {
    expect(sameGains(CURVE, [...CURVE])).toBe(true);
    expect(sameGains(CURVE, flatGains())).toBe(false);
  });
});

describe("preset names", () => {
  it("trims saved names and cuts them at 40 characters on load", () => {
    expect(cleanPresetName("  My mix  ")).toBe("My mix");
    expect(cleanPresetName("x".repeat(50))).toHaveLength(40);
    expect(cleanPresetName(`${"a".repeat(39)} b`)).toBe("a".repeat(39));
  });

  it("keeps a saved name over 40 characters by trimming it on load", () => {
    const [preset] = normalizeEqPresets([{ name: `  ${"x".repeat(50)}  `, gains: flatGains() }]);
    expect(preset.name).toBe("x".repeat(40));
  });

  it("accepts a fresh name and returns the cleaned value", () => {
    expect(checkPresetName("  Late night  ", [])).toEqual({ name: "Late night" });
  });

  it("refuses a built-in name", () => {
    expect(checkPresetName("Flat", [])).toEqual({ error: "builtin" });
  });

  it("refuses a duplicate of an own preset", () => {
    const presets = [{ name: "Late night", gains: CURVE }];
    expect(checkPresetName(" Late night ", presets)).toEqual({ error: "duplicate" });
  });

  it("allows keeping the same name while renaming that preset", () => {
    const presets = [{ name: "Late night", gains: CURVE }];
    expect(checkPresetName("Late night", presets, "Late night")).toEqual({ name: "Late night" });
  });

  it("refuses an empty name", () => {
    expect(checkPresetName("   ", [])).toEqual({ error: "empty" });
  });

  it("writes the PRD toast text for built-in and duplicate names", () => {
    expect(presetNameMessage("builtin", "Bass")).toBe('"Bass" is a built-in preset. Pick another name');
    expect(presetNameMessage("duplicate", "Late night")).toBe('You already have a preset called "Late night"');
  });

  it("writes the empty-name message", () => {
    expect(presetNameMessage("empty", "")).toBe("Give the preset a name");
  });

  it("refuses renaming a preset onto another own preset's name", () => {
    const presets = [
      { name: "Late", gains: CURVE },
      { name: "Gym", gains: flatGains() },
    ];
    expect(checkPresetName("Gym", presets, "Late")).toEqual({ error: "duplicate" });
  });

  it("accepts a built-in name in a different case", () => {
    expect(checkPresetName("bass", [])).toEqual({ name: "bass" });
  });

  it("accepts a name of exactly 40 characters without cutting it", () => {
    const name = "n".repeat(40);
    expect(checkPresetName(name, [])).toEqual({ name });
  });

  it("refuses a name over 40 characters", () => {
    expect(checkPresetName("n".repeat(41), [])).toEqual({ error: "long" });
    expect(checkPresetName(`${"a".repeat(39)} b`, [])).toEqual({ error: "long" });
  });

  it("counts only the trimmed name against the 40 character limit", () => {
    expect(checkPresetName(`   ${"n".repeat(40)}   `, [])).toEqual({ name: "n".repeat(40) });
  });

  it("writes the length message", () => {
    expect(presetNameMessage("long", "")).toBe("Names can be up to 40 characters");
  });
});

describe("own presets", () => {
  it("adds a preset to the end", () => {
    const result = addEqPreset(presetsNamed(2), "Late", CURVE);
    expect(result.map((preset) => preset.name)).toEqual(["Preset 0", "Preset 1", "Late"]);
    expect(result[2].gains).toEqual(CURVE);
  });

  it("drops the oldest preset once the list passes 20", () => {
    const full = presetsNamed(EQ_PRESET_LIMIT);
    const result = addEqPreset(full, "Newest", CURVE);
    expect(result).toHaveLength(EQ_PRESET_LIMIT);
    expect(result[0].name).toBe("Preset 1");
    expect(result[EQ_PRESET_LIMIT - 1].name).toBe("Newest");
  });

  it("does not share the gain array with the caller", () => {
    const gains = [...CURVE];
    const [saved] = addEqPreset([], "Copy", gains);
    gains[0] = 9;
    expect(saved.gains[0]).toBe(3);
  });

  it("renames in place and keeps the position", () => {
    const result = renameEqPreset(presetsNamed(3), "Preset 1", "Renamed");
    expect(result.map((preset) => preset.name)).toEqual(["Preset 0", "Renamed", "Preset 2"]);
  });

  it("updates the curve and moves the preset to the end", () => {
    const result = updateEqPreset(presetsNamed(3), "Preset 0", CURVE);
    expect(result.map((preset) => preset.name)).toEqual(["Preset 1", "Preset 2", "Preset 0"]);
    expect(result[2].gains).toEqual(CURVE);
  });

  it("keeps the cap at 20 when an update replaces a preset in a full list", () => {
    const result = updateEqPreset(presetsNamed(EQ_PRESET_LIMIT), "Preset 5", CURVE);
    expect(result).toHaveLength(EQ_PRESET_LIMIT);
    expect(result[0].name).toBe("Preset 0");
    expect(result[EQ_PRESET_LIMIT - 1]).toEqual({ name: "Preset 5", gains: CURVE });
  });

  it("deletes by name", () => {
    expect(deleteEqPreset(presetsNamed(2), "Preset 0").map((preset) => preset.name)).toEqual(["Preset 1"]);
  });

  it("finds an own preset that matches the curve", () => {
    expect(presetMatching(CURVE, [{ name: "Late", gains: CURVE }])).toBe("Late");
    expect(presetMatching(CURVE, [])).toBeNull();
  });
});

describe("stored presets", () => {
  it("keeps valid entries and drops built-in names, empty names and broken gains", () => {
    const stored = [
      { name: "Late", gains: CURVE },
      { name: "Bass", gains: CURVE },
      { name: "  ", gains: CURVE },
      { name: 4, gains: CURVE },
      { gains: CURVE },
      null,
    ];
    expect(normalizeEqPresets(stored)).toEqual([{ name: "Late", gains: CURVE }]);
  });

  it("keeps the first of two entries with the same name", () => {
    const result = normalizeEqPresets([
      { name: "Late", gains: CURVE },
      { name: "Late", gains: flatGains() },
    ]);
    expect(result).toEqual([{ name: "Late", gains: CURVE }]);
  });

  it("caps the stored list at 20 and keeps the newest", () => {
    const stored = presetsNamed(25).map((preset) => ({ ...preset }));
    const result = normalizeEqPresets(stored);
    expect(result).toHaveLength(EQ_PRESET_LIMIT);
    expect(result[0].name).toBe("Preset 5");
  });

  it("returns an empty list for anything that is not an array", () => {
    expect(normalizeEqPresets(undefined)).toEqual([]);
    expect(normalizeEqPresets({ name: "Late" })).toEqual([]);
  });
});
