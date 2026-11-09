import { platform, type Platform } from "./bridge";
import { desktopAppearance } from "./desktopAppearance";
import { motionVars } from "./motion";
import { useSettings } from "../stores/settings";

export const OS_REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const PLATFORM_CLASSES: Record<Platform, string> = {
  windows: "platform-windows",
  macos: "platform-mac",
  linux: "platform-linux",
  android: "platform-android",
};

const MANAGED_CLASSES = ["reduce-motion", "reduce-blur", ...Object.values(PLATFORM_CLASSES)];

export type HtmlFlags = {
  reduceAnimation: boolean;
  reduceDynamicBlur: boolean;
  osReduceMotion: boolean;
  desktopReduceMotion: boolean;
  systemMotion: boolean;
  platform: Platform;
};

export function htmlClassNames(flags: HtmlFlags): string[] {
  const names = [PLATFORM_CLASSES[flags.platform]];
  if (flags.reduceAnimation || flags.osReduceMotion || flags.desktopReduceMotion || flags.systemMotion) {
    names.push("reduce-motion");
  }
  if (flags.reduceDynamicBlur) names.push("reduce-blur");
  return names;
}

export function applyHtmlClasses(root: HTMLElement, flags: HtmlFlags): void {
  root.classList.remove(...MANAGED_CLASSES);
  const names = htmlClassNames(flags);
  root.classList.add(...names);
  const reduced = names.includes("reduce-motion");
  for (const [name, value] of Object.entries(motionVars(reduced))) {
    root.style.setProperty(name, value);
  }
}

function currentFlags(): HtmlFlags {
  const settings = useSettings.getState();
  return {
    reduceAnimation: settings.reduceAnimation,
    reduceDynamicBlur: settings.reduceDynamicBlur,
    osReduceMotion: window.matchMedia?.(OS_REDUCE_MOTION_QUERY)?.matches ?? false,
    desktopReduceMotion: desktopAppearance().reduceMotion,
    systemMotion: document.documentElement.dataset.systemMotion === "reduce",
    platform,
  };
}

export function refreshHtmlClasses(): void {
  applyHtmlClasses(document.documentElement, currentFlags());
}

export function startHtmlClasses(): () => void {
  refreshHtmlClasses();
  const unsubscribe = useSettings.subscribe(refreshHtmlClasses);
  const query = window.matchMedia?.(OS_REDUCE_MOTION_QUERY);
  query?.addEventListener("change", refreshHtmlClasses);
  window.addEventListener("hushio-system-motion", refreshHtmlClasses);
  return () => {
    unsubscribe();
    query?.removeEventListener("change", refreshHtmlClasses);
    window.removeEventListener("hushio-system-motion", refreshHtmlClasses);
  };
}
