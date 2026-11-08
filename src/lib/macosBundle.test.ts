import { describe, expect, it } from "vitest";
import { fs, SRC_DIR } from "./testFiles";

type Json = Record<string, unknown>;

function readConfig(relative: string): Json {
  return JSON.parse(fs.readFileSync(`${SRC_DIR}../src-tauri/${relative}`, "utf8")) as Json;
}

const base = readConfig("tauri.conf.json") as { bundle: { targets: string[] } };
const macos = readConfig("tauri.macos.conf.json") as {
  app: { windows: { titleBarStyle: string; hiddenTitle: boolean; trafficLightPosition: unknown }[] };
  bundle: {
    copyright: string;
    macOS: {
      minimumSystemVersion: string;
      signingIdentity: string;
      hardenedRuntime: boolean;
      entitlements: unknown;
      dmg: { windowSize: unknown; appPosition: unknown; applicationFolderPosition: unknown };
    };
  };
};

describe("macOS bundle configuration", () => {
  it("packages the app as a DMG and as a bare .app", () => {
    expect(base.bundle.targets).toEqual(expect.arrayContaining(["dmg", "app"]));
  });

  it("is ad-hoc signed without hardened runtime or entitlements", () => {
    const mac = macos.bundle.macOS;
    expect(mac.signingIdentity).toBe("-");
    expect(mac.hardenedRuntime).toBe(false);
    expect(mac.entitlements).toBeNull();
  });

  it("requires macOS 13 or newer", () => {
    expect(macos.bundle.macOS.minimumSystemVersion).toBe("13.0");
  });

  it("places the app and the Applications link in the DMG window", () => {
    const dmg = macos.bundle.macOS.dmg;
    expect(dmg.windowSize).toEqual({ width: 660, height: 400 });
    expect(dmg.appPosition).toEqual({ x: 130, y: 220 });
    expect(dmg.applicationFolderPosition).toEqual({ x: 410, y: 220 });
  });

  it("carries a copyright line", () => {
    expect(macos.bundle.copyright).toMatch(/^Copyright © \d{4} Nexvyn$/);
  });

  it("keeps the title bar settings from the macOS window", () => {
    const window = macos.app.windows[0];
    expect(window.titleBarStyle).toBe("Overlay");
    expect(window.hiddenTitle).toBe(true);
    expect(window.trafficLightPosition).toEqual({ x: 20, y: 28 });
  });
});
