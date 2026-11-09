export const EXIT_WINDOW_MS = 2000;

export type BackInput = {
  sheetOpen: boolean;
  nowPlayingOpen: boolean;
  canGoBack: boolean;
  atHome: boolean;
  armedAt: number | null;
  now: number;
};

export type BackAction = "close-sheet" | "close-now-playing" | "history-back" | "go-home" | "arm-exit" | "exit";

export function resolveBack(input: BackInput): BackAction {
  if (input.sheetOpen) return "close-sheet";
  if (input.nowPlayingOpen) return "close-now-playing";
  if (input.canGoBack) return "history-back";
  if (!input.atHome) return "go-home";
  if (input.armedAt !== null && input.now - input.armedAt <= EXIT_WINDOW_MS) return "exit";
  return "arm-exit";
}

export function nextArmedAt(action: BackAction, now: number): number | null {
  return action === "arm-exit" ? now : null;
}
