import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({ platform: "windows" as "windows" | "android" | "linux" | "macos" }));

vi.mock("./bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bridge")>()),
  persistWrite: vi.fn(async () => true),
  persistRead: vi.fn(async () => null),
  get platform() {
    return bridge.platform;
  },
}));
import { APP_FONTS, applyFontVars, DEFAULT_FONT, fontStack, isAppFont, TITLE_STACK } from "./fonts";
import { refreshHtmlClasses } from "./htmlClasses";
import { useSettings } from "../stores/settings";

const root = document.documentElement;

describe("app font", () => {
  beforeEach(() => {
    useSettings.setState({ appFont: DEFAULT_FONT });
    root.style.removeProperty("--font-app");
    root.style.removeProperty("--font-lyric");
    root.style.removeProperty("--font-title");
    bridge.platform = "windows";
  });

  afterEach(() => {
    root.style.removeProperty("--font-app");
    root.style.removeProperty("--font-lyric");
    root.style.removeProperty("--font-title");
    bridge.platform = "windows";
  });

  it("offers five fonts with the system font as the default", () => {
    expect(APP_FONTS.map((font) => font.id)).toEqual(["system", "hushio", "classic", "round", "mono"]);
    expect(DEFAULT_FONT).toBe("system");
  });

  it("knows the stack of each font and falls back to the system stack", () => {
    expect(fontStack("mono")).toContain("Cascadia Mono");
    expect(fontStack("nope")).toBe(fontStack("system"));
  });

  it("maps the system font to the Hushio stack on Android only", () => {
    expect(fontStack("system")).toContain("Segoe UI Variable Display");

    bridge.platform = "android";
    expect(fontStack("system")).toBe(fontStack("hushio"));
    expect(fontStack("system")).toContain("Inter Variable");
    expect(fontStack("classic")).toContain("Georgia");
  });

  it("uses the title stack for titles on Android and for the Hushio font", () => {
    applyFontVars(root, "system");
    expect(root.style.getPropertyValue("--font-title")).toBe(root.style.getPropertyValue("--font-app"));

    bridge.platform = "android";
    applyFontVars(root, "system");
    expect(root.style.getPropertyValue("--font-title")).toContain("Instrument Sans Variable");
    expect(root.style.getPropertyValue("--font-title")).toBe(TITLE_STACK);

    bridge.platform = "windows";
    applyFontVars(root, "hushio");
    expect(root.style.getPropertyValue("--font-title")).toBe(TITLE_STACK);
    expect(root.style.getPropertyValue("--font-app")).toContain("Inter Variable");
  });

  it("keeps the title font equal to the app font for other desktop choices", () => {
    applyFontVars(root, "classic");

    expect(root.style.getPropertyValue("--font-title")).toBe(root.style.getPropertyValue("--font-app"));
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
