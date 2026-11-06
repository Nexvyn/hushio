import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import releaseYaml from "../../.github/workflows/release.yml?raw";

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};
type Job = {
  needs?: string | string[];
  "runs-on": string;
  strategy?: { matrix?: { os?: string[] } };
  env?: Record<string, string>;
  steps: Step[];
};

const parsed = parse(releaseYaml) as { env?: Record<string, string>; jobs: Record<string, Job> };
const jobs = parsed.jobs;
const needsOf = (job: Job): string[] =>
  typeof job.needs === "string" ? [job.needs] : (job.needs ?? []);
const allSteps = Object.values(jobs).flatMap((job) => job.steps);
const allRuns = allSteps.flatMap((step) => (step.run ? [step.run] : []));
const allEnvValues = [
  ...Object.values(jobs).flatMap((job) => Object.values(job.env ?? {})),
  ...allSteps.flatMap((step) => Object.values(step.env ?? {})),
];

describe("release workflow", () => {
  it("has the test, build and linux jobs and no macOS or Android jobs yet", () => {
    expect(Object.keys(jobs).sort()).toEqual(["build", "linux", "test"]);
  });

  it("points every needs entry at an existing job", () => {
    for (const job of Object.values(jobs)) {
      for (const need of needsOf(job)) expect(Object.keys(jobs)).toContain(need);
    }
  });

  it("runs the test job first on Windows and Ubuntu 22.04", () => {
    expect(needsOf(jobs.test)).toEqual([]);
    expect(jobs.test.strategy?.matrix?.os).toEqual(["windows-latest", "ubuntu-22.04"]);
  });

  it("gates both build jobs on test and builds Linux after the Windows release", () => {
    expect(needsOf(jobs.build)).toContain("test");
    expect(needsOf(jobs.linux)).toContain("build");
    expect(jobs.linux["runs-on"]).toBe("ubuntu-22.04");
    expect(jobs.build["runs-on"]).toBe("windows-latest");
  });

  it("runs the frozen install, typecheck, frontend tests and cargo tests in the test job", () => {
    const runs = jobs.test.steps.flatMap((step) => (step.run ? [step.run] : []));
    expect(runs).toContain("pnpm install --frozen-lockfile");
    expect(runs).toContain("pnpm typecheck");
    expect(runs).toContain("pnpm test");
    expect(runs).toContain("cargo test --manifest-path src-tauri/Cargo.toml");
  });

  it("installs the webkit2gtk and friends on Linux only", () => {
    const install = jobs.test.steps.find((step) => step.name === "Install Linux build dependencies");
    expect(install?.if).toBe("runner.os == 'Linux'");
    expect(parsed.env?.LINUX_DEPS).toContain("libwebkit2gtk-4.1-dev");
  });

  it("reads signing secrets only through the secrets context", () => {
    const signingEnv = allEnvValues.filter((value) => value.includes("TAURI_SIGNING"));
    expect(signingEnv.length).toBeGreaterThan(0);
    for (const value of signingEnv) expect(value).toMatch(/^\$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)? \}\}$/);
    expect(releaseYaml).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
  });

  it("uploads latest.json for the Windows and Linux updater entries", () => {
    expect(jobs.build.steps.some((step) => step.run?.includes("latest.json"))).toBe(true);
    expect(jobs.linux.steps.some((step) => step.run?.includes("latest.json"))).toBe(true);
    expect(releaseYaml).toContain("Hushio-${VERSION}-linux-x86_64.AppImage");
    expect(releaseYaml).toContain('Hushio_"$VERSION"_x64-setup.nsis.zip');
  });

  it("uses no npm or npx commands", () => {
    for (const run of allRuns) expect(run).not.toMatch(/\b(npm|npx)\b/);
  });

  it("pins every action to a full version tag", () => {
    const uses = allSteps.flatMap((step) => (step.uses ? [step.uses] : []));
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) expect(ref).toMatch(/@v\d+\.\d+\.\d+$/);
  });
});
