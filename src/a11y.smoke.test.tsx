import { describe, expect, it, vi } from "vitest";
import { fs, SRC_DIR } from "./lib/testFiles";
import { cleanup, render } from "@testing-library/react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { PlayerBar } from "./components/PlayerBar";
import { HomeView } from "./views/HomeView";
import { SearchView } from "./views/SearchView";
import { LibraryView } from "./views/LibraryView";
import { LikedView } from "./views/LikedView";
import { DownloadsView } from "./views/DownloadsView";
import { LocalMusicView } from "./views/LocalMusicView";
import { SettingsView } from "./views/SettingsView";

vi.mock("./lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/bridge")>()),
  persistRead: vi.fn(async () => null),
  persistWrite: vi.fn(async () => true),
}));

function accessibleName(control: Element): string {
  const labelledBy = control.getAttribute("aria-labelledby");
  if (labelledBy) {
    return labelledBy.split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
  }
  return control.getAttribute("aria-label") ?? control.textContent ?? "";
}

const FOCUS_RING_TAGS = ["button", "a", "input", "select", "textarea", "summary"];
const FOCUS_RING_ROLES = ["button", "menuitem", "option", "tab", "switch", "radio", "slider"];

function hasFocusRing(control: Element): boolean {
  const covered =
    FOCUS_RING_TAGS.includes(control.tagName.toLowerCase()) ||
    FOCUS_RING_ROLES.includes(control.getAttribute("role") ?? "") ||
    control.hasAttribute("tabindex");
  return covered && focusRuleCss().includes(":where(button, a, [role=\"button\"]");
}

function focusRuleCss(): string {
  return fs.readFileSync(`${SRC_DIR}index.css`, "utf8");
}

const VIEWS = {
  Sidebar, TopBar, PlayerBar, HomeView, SearchView, LibraryView,
  LikedView, DownloadsView, LocalMusicView, SettingsView,
};

describe("a11y smoke: main views", () => {
  for (const [name, View] of Object.entries(VIEWS)) {
    it(`${name}: every control has a name and every icon is 20 px`, () => {
      const view = render(<View />);
      for (const control of Array.from(view.container.querySelectorAll("button, a[href], [role=button], [role=switch], [role=radio], [role=slider]"))) {
        expect(accessibleName(control), `${name}: unnamed ${control.outerHTML.slice(0, 120)}`).not.toBe("");
        expect(hasFocusRing(control), `${name}: no focus ring ${control.outerHTML.slice(0, 80)}`).toBe(true);
      }
      for (const icon of Array.from(view.container.querySelectorAll("svg"))) {
        if (icon.closest(".app-logo")) continue;
        expect(icon.getAttribute("width"), `${name}: icon size`).toBe("20");
      }
      cleanup();
    });
  }
});

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((name) => {
    const path = `${dir}${name}`;
    if (fs.statSync(path).isDirectory()) return sourceFiles(`${path}/`);
    return /\.tsx$/.test(path) && !/\.test\.tsx$/.test(path) ? [path] : [];
  });
}

describe("icons", () => {
  it("no hand-written svg is inlined; every icon comes from Hugeicons", () => {
    const offenders = sourceFiles(SRC_DIR).filter((path) => /<svg[\s>]/.test(fs.readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("touch targets", () => {
  const SMALL_CONTROLS = [
    "components/Switch.tsx",
    "components/TopBar.tsx",
    "components/PlayerBar.tsx",
    "components/RightRail.tsx",
    "components/ProfileButton.tsx",
    "components/Toasts.tsx",
    "components/Dialog.tsx",
    "components/EraseDialog.tsx",
    "components/LyricsTiming.tsx",
    "components/LyricsCenter.tsx",
    "components/NowPlaying.tsx",
    "components/ContextMenu.tsx",
    "views/SettingsView.tsx",
    "views/LocalMusicView.tsx",
    "pip/PipButton.tsx",
  ];

  it("grows every sub-40 px control through the shared hit-area, 48 px on Android", () => {
    for (const file of SMALL_CONTROLS) {
      expect(fs.readFileSync(`${SRC_DIR}${file}`, "utf8"), file).toContain("hit-area");
    }
    const css = fs.readFileSync(`${SRC_DIR}index.css`, "utf8");
    expect(css).toContain("--hit-min: 40px");
    expect(css).toContain(".platform-android");
    expect(css).toContain("--hit-min: 48px");
  });
});
