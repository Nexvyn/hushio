import { describe, expect, it } from "vitest";
import { fs, SRC_DIR } from "./testFiles";

const read = (path: string) => fs.readFileSync(SRC_DIR + path, "utf8");

describe("icon sizes and weights", () => {
  it("phone icons use the 24 px default, not 12, 13 or 28", () => {
    expect(read("components/RightRail.tsx")).not.toContain("size={14}");
    expect(read("components/phone/PhoneLibraryRows.tsx")).not.toContain("size={12}");
    expect(read("components/phone/PhoneNowPlaying.tsx")).not.toMatch(/size=\{(13|28)\}|glyph=\{28\}/);
  });

  it("phone surfaces use the phone icon wrapper", () => {
    expect(read("components/phone/PhoneArt.tsx")).not.toMatch(/<Icon /);
  });

  it("only an active or selected icon is filled", () => {
    expect(read("components/Toasts.tsx")).not.toContain('"fill"');
    expect(read("components/PageHeader.tsx")).not.toContain('"fill"');
    expect(read("components/TrackListControls.tsx")).not.toContain('fill="currentColor"');
  });

  it("the miniplayer liked heart is filled when liked", () => {
    expect(read("pip/PipApp.tsx")).toContain('fill={pressed ? "fill" : "none"}');
  });
});
