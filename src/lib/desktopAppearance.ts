import { listenDesktopAppearance, readDesktopAppearance, type DesktopAppearance } from "./bridge";

export const NO_DESKTOP_APPEARANCE: DesktopAppearance = { colorScheme: "none", reduceMotion: false };

let current: DesktopAppearance = NO_DESKTOP_APPEARANCE;

export function desktopAppearance(): DesktopAppearance {
  return current;
}

export function setDesktopAppearance(next: DesktopAppearance): void {
  current = next;
}

export async function startDesktopAppearance(onChange: () => void): Promise<() => void> {
  let heard = false;
  const unlisten = await listenDesktopAppearance((next) => {
    heard = true;
    setDesktopAppearance(next);
    onChange();
  });
  try {
    const initial = await readDesktopAppearance();
    if (!heard) {
      setDesktopAppearance(initial);
      onChange();
    }
  } catch (error) {
    console.warn(`[hushio] desktop appearance unavailable: ${String(error)}`);
  }
  return unlisten;
}
