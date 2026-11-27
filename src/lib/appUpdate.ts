export type UpdatePhase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current"; version: string }
  | { kind: "available"; version: string }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "ready"; version: string }
  | { kind: "unknown-sources" }
  | { kind: "error"; during: "check" | "update"; message: string };

export type UpdateCopy = { title: string; note: string | null };

export function updateCopy(phase: UpdatePhase, current: string | null): UpdateCopy | null {
  switch (phase.kind) {
    case "idle":
      return null;
    case "checking":
      return { title: "Checking for updates…", note: null };
    case "current":
      return { title: "Hushio is up to date", note: `Version ${phase.version} is the newest.` };
    case "available":
      return {
        title: `Version ${phase.version} is available`,
        note: current ? `You have version ${current}. It installs right here.` : null,
      };
    case "downloading":
      return { title: `Downloading version ${phase.version}…`, note: `${phase.percent}%` };
    case "ready":
      return { title: `Version ${phase.version} is ready`, note: "Install it to finish updating." };
    case "unknown-sources":
      return { title: "Allow installs from Hushio in the settings, then try again", note: null };
    case "error":
      return {
        title: phase.during === "check" ? "Couldn't check for updates" : "Couldn't update",
        note: phase.message,
      };
  }
}

export function errorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim() !== "") return error;
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  return "Try again later.";
}
