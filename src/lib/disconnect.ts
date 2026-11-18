import { platform } from "./bridge";
import { deviceNoun } from "./desktopPlatform";

type EraseScope = "account" | "computer" | "reset";

export type EraseOptions = {
  scope: EraseScope;
  deleteYoutubePlaylists: boolean;
  deleteDownloads: boolean;
};

export type EraseSteps = {
  stopSync: () => Promise<unknown>;
  resumeSync: () => Promise<unknown>;
  deleteYoutubePlaylists: () => Promise<unknown>;
  revokeTokens: () => Promise<unknown>;
  removeKeyring: () => Promise<unknown>;
  wipeLocal: (deleteDownloads: boolean) => Promise<unknown>;
};

export type EraseStage = "remote" | "local";

export type EraseOutcome = { ok: true } | { ok: false; stage: EraseStage; message: string };

type EraseStep = Exclude<keyof EraseSteps, "resumeSync">;

const STEP_LABELS: Record<Exclude<EraseStep, "wipeLocal">, string> = {
  stopSync: "Stopping sync",
  deleteYoutubePlaylists: "Deleting YouTube playlists",
  revokeTokens: "Signing out of Google",
  removeKeyring: "Signing out of Google",
};

function stepLabel(step: EraseStep): string {
  return step === "wipeLocal" ? `Erasing this ${deviceNoun(platform)}` : STEP_LABELS[step];
}

type Planned = { step: EraseStep; run: () => Promise<unknown> };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function execute(
  stage: EraseStage,
  planned: Planned[],
  onStep: (label: string) => void,
): Promise<EraseOutcome> {
  for (const { step, run } of planned) {
    onStep(stepLabel(step));
    try {
      await run();
    } catch (error) {
      return { ok: false, stage, message: messageOf(error) };
    }
  }
  return { ok: true };
}

function remotePlan(steps: EraseSteps, options: EraseOptions): Planned[] {
  const plan: Planned[] = [{ step: "stopSync", run: steps.stopSync }];
  if (options.deleteYoutubePlaylists) {
    plan.push({ step: "deleteYoutubePlaylists", run: steps.deleteYoutubePlaylists });
  }
  plan.push({ step: "revokeTokens", run: steps.revokeTokens });
  return plan;
}

function localPlan(steps: EraseSteps, options: EraseOptions, stopped: boolean): Planned[] {
  const wipe = { step: "wipeLocal" as const, run: () => steps.wipeLocal(options.deleteDownloads) };
  const stop: Planned[] = stopped ? [] : [{ step: "stopSync", run: steps.stopSync }];
  if (options.scope === "reset") {
    return [...stop, wipe];
  }
  return [...stop, { step: "removeKeyring", run: steps.removeKeyring }, wipe];
}

export async function runErase(
  steps: EraseSteps,
  options: EraseOptions,
  from: EraseStage = "remote",
  onStep: (label: string) => void = () => {},
): Promise<EraseOutcome> {
  if (options.scope === "reset") {
    const outcome = await execute("local", localPlan(steps, options, false), onStep);
    await steps.resumeSync();
    return outcome;
  }
  let stopped = false;
  if (from === "remote" && options.scope === "account") {
    const remote = await execute("remote", remotePlan(steps, options), onStep);
    if (!remote.ok) return remote;
    stopped = true;
  }
  return execute("local", localPlan(steps, options, stopped), onStep);
}
