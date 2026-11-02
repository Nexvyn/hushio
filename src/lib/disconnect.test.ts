import { describe, expect, it } from "vitest";
import { runErase, type EraseOptions, type EraseSteps } from "./disconnect";

function fakeSteps(failing?: keyof EraseSteps) {
  const calls: string[] = [];
  const make = (name: keyof EraseSteps) => async () => {
    calls.push(name);
    if (name === failing) throw new Error(`${name} failed`);
  };
  const steps: EraseSteps = {
    stopSync: make("stopSync"),
    resumeSync: make("resumeSync"),
    deleteYoutubePlaylists: make("deleteYoutubePlaylists"),
    deleteDriveFiles: make("deleteDriveFiles"),
    revokeTokens: make("revokeTokens"),
    removeKeyring: make("removeKeyring"),
    wipeLocal: async (deleteDownloads: boolean) => {
      calls.push(deleteDownloads ? "wipeLocal:downloads" : "wipeLocal");
      if (failing === "wipeLocal") throw new Error("wipeLocal failed");
    },
  };
  return { steps, calls };
}

const ACCOUNT: EraseOptions = { scope: "account", deleteYoutubePlaylists: false, deleteDownloads: false };
const LOCAL_ONLY: EraseOptions = { scope: "computer", deleteYoutubePlaylists: false, deleteDownloads: false };

const LOCAL_STEPS = ["stopSync", "removeKeyring", "wipeLocal"];
const REMOTE_STEPS = ["stopSync", "deleteDriveFiles", "revokeTokens"];

describe("runErase", () => {
  it("runs every remote step before the local wipe", async () => {
    const { steps, calls } = fakeSteps();
    const outcome = await runErase(steps, { ...ACCOUNT, deleteYoutubePlaylists: true });
    expect(outcome).toEqual({ ok: true });
    expect(calls).toEqual(["stopSync", "deleteYoutubePlaylists", "deleteDriveFiles", "revokeTokens", "removeKeyring", "wipeLocal"]);
  });

  it("removes the keyring entries before the app data is wiped", async () => {
    const { steps, calls } = fakeSteps();
    await runErase(steps, ACCOUNT);
    expect(calls.indexOf("removeKeyring")).toBeLessThan(calls.indexOf("wipeLocal"));
  });

  it("skips YouTube playlist deletion unless the box is ticked", async () => {
    const { steps, calls } = fakeSteps();
    await runErase(steps, ACCOUNT);
    expect(calls).not.toContain("deleteYoutubePlaylists");
  });

  it("stops at a failed remote step and erases nothing locally", async () => {
    const { steps, calls } = fakeSteps("deleteDriveFiles");
    const outcome = await runErase(steps, ACCOUNT);
    expect(outcome).toEqual({ ok: false, stage: "remote", message: "deleteDriveFiles failed" });
    expect(calls).toEqual(REMOTE_STEPS.slice(0, 2));
    expect(calls).not.toContain("removeKeyring");
    expect(calls).not.toContain("wipeLocal");
  });

  it("a retry runs the remote steps again from the start", async () => {
    const failing = fakeSteps("revokeTokens");
    await runErase(failing.steps, ACCOUNT);
    const retry = fakeSteps();
    const outcome = await runErase(retry.steps, ACCOUNT, "remote");
    expect(outcome).toEqual({ ok: true });
    expect(retry.calls.slice(0, 3)).toEqual(REMOTE_STEPS);
  });

  it("erase-only skips every remote step", async () => {
    const { steps, calls } = fakeSteps();
    await runErase(steps, { ...LOCAL_ONLY, deleteYoutubePlaylists: true });
    expect(calls).toEqual(LOCAL_STEPS);
  });

  it("a failed local wipe is reported as local and retrying local does not repeat the remote steps", async () => {
    const failing = fakeSteps("wipeLocal");
    const outcome = await runErase(failing.steps, ACCOUNT);
    expect(outcome).toEqual({ ok: false, stage: "local", message: "wipeLocal failed" });
    const retry = fakeSteps();
    await runErase(retry.steps, ACCOUNT, "local");
    expect(retry.calls).toEqual(LOCAL_STEPS);
  });

  it("passes the download choice to the local wipe", async () => {
    const { steps, calls } = fakeSteps();
    await runErase(steps, { ...LOCAL_ONLY, deleteDownloads: true });
    expect(calls).toContain("wipeLocal:downloads");
  });

  it("reports each step name while it runs", async () => {
    const { steps } = fakeSteps();
    const labels: string[] = [];
    await runErase(steps, ACCOUNT, "remote", (label) => labels.push(label));
    expect(labels).toEqual([
      "Stopping sync",
      "Deleting Google Drive files",
      "Signing out of Google",
      "Signing out of Google",
      "Erasing this computer",
    ]);
  });

  it("reset erases local data only, keeps the remote steps out, and resumes sync", async () => {
    const { steps, calls } = fakeSteps();
    const outcome = await runErase(steps, { scope: "reset", deleteYoutubePlaylists: false, deleteDownloads: false });
    expect(outcome).toEqual({ ok: true });
    expect(calls).toEqual(["stopSync", "wipeLocal", "resumeSync"]);
  });

  it("reset still resumes sync when the wipe fails", async () => {
    const { steps, calls } = fakeSteps("wipeLocal");
    const outcome = await runErase(steps, { scope: "reset", deleteYoutubePlaylists: false, deleteDownloads: false });
    expect(outcome.ok).toBe(false);
    expect(calls.at(-1)).toBe("resumeSync");
  });
});
