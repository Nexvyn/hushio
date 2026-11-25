import type { LyricsResult } from "../../lib/bridge";

export const PANEL_TRAVEL_SHARE = 0.5;
const PANEL_COMMIT_SHARE = 0.3;
export const PANEL_FLICK_PX_S = 450;

export type PanelKind = "lyrics" | "queue";
export type PanelMode = "panel" | "sheet" | "scroll";

export function panelKindAt(x: number, width: number): PanelKind {
  return x >= (width * 2) / 3 ? "queue" : "lyrics";
}

export function panelGestureMode(input: { open: boolean; movedUp: boolean; held: boolean }): PanelMode {
  if (input.open) return input.held ? "scroll" : "panel";
  return input.movedUp ? "panel" : "sheet";
}

export function panelReleaseTarget(input: { progress: number; start: number; velocity: number; startOpen: boolean }): 0 | 1 {
  if (input.velocity < -PANEL_FLICK_PX_S) return 1;
  if (input.velocity > PANEL_FLICK_PX_S) return 0;
  const moved = input.progress - input.start;
  if (moved > PANEL_COMMIT_SHARE) return 1;
  if (moved < -PANEL_COMMIT_SHARE) return 0;
  return input.startOpen ? 1 : 0;
}

export function scrollHoldsDrag(scrollTop: number | null): boolean {
  return scrollTop !== null && scrollTop > 0;
}

export function hasLyricsText(lyrics: LyricsResult | null): boolean {
  return Boolean(lyrics?.synced?.length || lyrics?.plain?.trim());
}

export function lyricsHintVisible(input: { loading: boolean; lyrics: LyricsResult | null }): boolean {
  return input.loading || hasLyricsText(input.lyrics);
}
