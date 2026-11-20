import { APP_NAME } from "./app";

type UpdateStatus = "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "error";
export type UpdateRoute = "inApp" | "website" | "releases" | "flathub";
type UpdatePhase = "check" | "install";

export type UpdateState = {
  status: UpdateStatus;
  current: string;
  version: string | null;
  percent: number | null;
  error: string | null;
  errorFrom: UpdatePhase | null;
  route: UpdateRoute;
};

export const INITIAL_UPDATE_STATE: UpdateState = {
  status: "idle",
  current: "",
  version: null,
  percent: null,
  error: null,
  errorFrom: null,
  route: "inApp",
};

export const DOWNLOAD_PAGE = "https://hushio.nexvyn.dev/download";
export const RELEASES_PAGE = "https://github.com/Nexvyn/hushio/releases/latest";

export function shouldNotify(state: UpdateState, notified: string | null): boolean {
  return state.status === "available" && state.version !== null && state.version !== notified;
}

export function noticeText(state: UpdateState): string {
  const tail = state.route === "inApp" ? "Click to update." : "Click to download it.";
  return `${APP_NAME} ${state.version} is available. ${tail}`;
}

export function actionLabel(route: UpdateRoute): string {
  if (route === "inApp") return "Update";
  if (route === "website") return "Download";
  return "Open releases";
}

type ChipAction = "install" | "restart" | "about";

export type ChipModel = { label: string; action: ChipAction; icon: "download" | "restart" | null };

export function chipModel(state: UpdateState): ChipModel | null {
  if (!state.version || state.status === "current") return null;
  switch (state.status) {
    case "available":
      return { label: "Update", action: "install", icon: "download" };
    case "ready":
      return { label: "Restart to update", action: "restart", icon: "restart" };
    case "downloading":
      return { label: `Updating ${state.percent ?? 0}%`, action: "about", icon: null };
    case "checking":
      return { label: "Check for updates", action: "about", icon: null };
    case "error":
      return { label: "Update failed", action: "about", icon: null };
    default:
      return null;
  }
}

export function updateCopy(state: UpdateState): { title: string; note?: string } {
  const version = state.version ?? "";
  if (state.route === "flathub") return { title: "Updates", note: "Updates come from Flathub." };
  switch (state.status) {
    case "checking":
      return { title: "Checking for updates…" };
    case "current":
      return { title: `${APP_NAME} is up to date`, note: `Version ${state.current} is the newest` };
    case "available":
      return { title: `Version ${version} is available`, note: availableNote(state) };
    case "downloading":
      return { title: `Downloading version ${version}…`, note: `${state.percent ?? 0}%` };
    case "ready":
      return { title: `Version ${version} is ready`, note: `Restart ${APP_NAME} to finish updating` };
    case "error":
      return state.errorFrom === "install"
        ? { title: "Couldn't update", note: state.error ?? undefined }
        : { title: "Couldn't check for updates", note: state.error ?? undefined };
    default:
      return { title: "Updates" };
  }
}

function availableNote(state: UpdateState): string {
  if (state.route === "releases") {
    return "Update with your package manager, or download it from GitHub Releases.";
  }
  if (state.route === "website") {
    return `You have version ${state.current}. Get it from hushio.nexvyn.dev.`;
  }
  return `You have version ${state.current}. It installs right here.`;
}
