import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filePath, fs as nodeFs } from "./testFiles";
import { applyHtmlClasses, htmlClassNames, refreshHtmlClasses, startHtmlClasses } from "./htmlClasses";
import { NO_DESKTOP_APPEARANCE, setDesktopAppearance } from "./desktopAppearance";
import { DURATION_MS, motionVars } from "./motion";
import { useSettings } from "../stores/settings";

vi.mock("./bridge", () => ({
  platform: "windows",
  listenDesktopAppearance: vi.fn(),
  readDesktopAppearance: vi.fn(),
  persistWrite: vi.fn(),
  persistRead: vi.fn(),
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

const base = {
  reduceAnimation: false,
  reduceDynamicBlur: false,
  osReduceMotion: false,
  desktopReduceMotion: false,
  systemMotion: false,
  platform: "windows" as const,
};

describe("html class names", () => {
  it("sets only the platform class by default", () => {
    expect(htmlClassNames(base)).toEqual(["platform-windows"]);
  });

  it("sets reduce-motion for the app setting, the OS setting or the desktop setting", () => {
    expect(htmlClassNames({ ...base, reduceAnimation: true })).toContain("reduce-motion");
    expect(htmlClassNames({ ...base, osReduceMotion: true })).toContain("reduce-motion");
    expect(htmlClassNames({ ...base, desktopReduceMotion: true })).toContain("reduce-motion");
    expect(htmlClassNames({ ...base, systemMotion: true })).toContain("reduce-motion");
  });

  it("sets reduce-blur and maps macOS to platform-mac", () => {
    expect(htmlClassNames({ ...base, reduceDynamicBlur: true, platform: "macos" })).toEqual([
      "platform-mac",
      "reduce-blur",
    ]);
    expect(htmlClassNames({ ...base, platform: "android" })).toEqual(["platform-android"]);
  });
});

describe("applying html classes", () => {
  it("replaces managed classes and zeroes the duration vars under reduce motion", () => {
    const root = document.createElement("html");
    root.classList.add("reduce-motion", "platform-linux", "unrelated");
    applyHtmlClasses(root, base);
    expect(root.classList.contains("reduce-motion")).toBe(false);
    expect(root.classList.contains("platform-linux")).toBe(false);
    expect(root.classList.contains("platform-windows")).toBe(true);
    expect(root.classList.contains("unrelated")).toBe(true);
    expect(root.style.getPropertyValue("--dur-quick")).toBe(`${DURATION_MS.quick}ms`);

    applyHtmlClasses(root, { ...base, reduceAnimation: true });
    expect(root.classList.contains("reduce-motion")).toBe(true);
    expect(root.style.getPropertyValue("--dur-quick")).toBe("0ms");
    expect(root.style.getPropertyValue("--dur-spin")).toBe("0ms");
  });

  it("exposes every motion token as a css var", () => {
    const vars = motionVars(false);
    expect(Object.keys(vars)).toHaveLength(Object.keys(DURATION_MS).length);
    expect(vars["--dur-swap"]).toBe("220ms");
  });

  it("keeps the reduce-motion rule in the keyframe file", () => {
    const motionCss = nodeFs.readFileSync(filePath("styles/motion.css"), "utf8");
    expect(motionCss).toMatch(/:root\.reduce-motion \*[\s\S]*?animation: none !important/);
    expect(motionCss).toMatch(/:root\.reduce-blur \*[\s\S]*?backdrop-filter: none !important/);
  });
});

describe("tracking settings and the desktop value", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    useSettings.setState({ reduceAnimation: false, reduceDynamicBlur: false });
  });

  afterEach(() => {
    setDesktopAppearance(NO_DESKTOP_APPEARANCE);
    document.documentElement.className = "";
    delete document.documentElement.dataset.systemMotion;
  });

  it("follows the app setting as soon as it changes", () => {
    const stop = startHtmlClasses();
    try {
      expect(document.documentElement.classList.contains("reduce-motion")).toBe(false);
      useSettings.getState().setReduceAnimation(true);
      expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);
      useSettings.getState().setReduceDynamicBlur(true);
      expect(document.documentElement.classList.contains("reduce-blur")).toBe(true);
      useSettings.getState().setReduceAnimation(false);
      expect(document.documentElement.classList.contains("reduce-motion")).toBe(false);
    } finally {
      stop();
    }
  });

  it("follows the system motion signal from the Android bridge", () => {
    const stop = startHtmlClasses();
    try {
      document.documentElement.dataset.systemMotion = "reduce";
      window.dispatchEvent(new Event("hushio-system-motion"));
      expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);
      delete document.documentElement.dataset.systemMotion;
      window.dispatchEvent(new Event("hushio-system-motion"));
      expect(document.documentElement.classList.contains("reduce-motion")).toBe(false);
    } finally {
      stop();
    }
  });

  it("follows the desktop reduce-motion value when it is refreshed", () => {
    setDesktopAppearance({ colorScheme: "none", reduceMotion: true });
    refreshHtmlClasses();
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);
  });
});
