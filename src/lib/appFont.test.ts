import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bridge")>()),
  persistWrite: vi.fn(async () => true),
  persistRead: vi.fn(async () => null),
}));
import { APP_FONTS, applyFontVars, DEFAULT_FONT, fontStack, isAppFont } from "./fonts";
import { refreshHtmlClasses } from "./htmlClasses";
import { useSettings } from "../stores/settings";

const root = document.documentElement;

describe("app font", () => {
  beforeEach(() => {
    useSettings.setState({ appFont: DEFAULT_FONT });
    root.style.removeProperty("--font-app");
    root.style.removeProperty("--font-lyric");
  });

  afterEach(() => {
    root.style.removeProperty("--font-app");
    root.style.removeProperty("--font-lyric");
  });

  it("offers four fonts with the system font as the default", () => {
    expect(APP_FONTS.map((font) => font.id)).toEqual(["system", "classic", "round", "mono"]);
    expect(DEFAULT_FONT).toBe("system");
  });

  it("knows the stack of each font and falls back to the system stack", () => {
    expect(fontStack("mono")).toContain("Cascadia Mono");
    expect(fontStack("nope")).toBe(fontStack("system"));
  });

  it("only accepts known font ids", () => {
    expect(isAppFont("classic")).toBe(true);
    expect(isAppFont("comic")).toBe(false);
    expect(isAppFont(undefined)).toBe(false);
  });

  it("writes the chosen stack to the UI and lyric font variables on the root element", () => {
    applyFontVars(root, "classic");

    expect(root.style.getPropertyValue("--font-app")).toContain("Georgia");
    expect(root.style.getPropertyValue("--font-lyric")).toContain("Georgia");
  });

  it("applies a changed font to the whole app when settings refresh the html classes", () => {
    useSettings.getState().setValue("appFont", "mono");
    refreshHtmlClasses();

    expect(root.style.getPropertyValue("--font-app")).toContain("Cascadia Mono");
  });

  it("falls back to the default when a stored font id is not known", () => {
    const options = useSettings.persist.getOptions();
    const merged = options.merge?.({ appFont: "comic" } as never, useSettings.getState());

    expect(merged).toMatchObject({ appFont: DEFAULT_FONT });
  });

  it("keeps a stored font that is known", () => {
    const options = useSettings.persist.getOptions();
    const merged = options.merge?.({ appFont: "round" } as never, useSettings.getState());

    expect(merged).toMatchObject({ appFont: "round" });
  });
});
