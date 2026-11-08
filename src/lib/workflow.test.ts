import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import releaseYaml from "../../.github/workflows/release.yml?raw";

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  shell?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};
type Job = {
  needs?: string | string[];
  "runs-on": string;
  strategy?: {
    "fail-fast"?: boolean;
    "max-parallel"?: number;
    matrix?: { os?: string[]; arch?: string[]; include?: Record<string, string>[] };
  };
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
const stepNamed = (job: Job, name: string): Step => {
  const step = job.steps.find((candidate) => candidate.name === name);
  if (!step) throw new Error(`missing step ${name}`);
  return step;
};
const macosInclude = jobs["build-macos"].strategy?.matrix?.include ?? [];
const secretNames = new Set([...releaseYaml.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]));

describe("release workflow", () => {
  it("has the test, build, macOS build and verify jobs plus linux, and no Android job yet", () => {
    expect(Object.keys(jobs).sort()).toEqual(["build", "build-macos", "linux", "test", "verify-macos"]);
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

  it("gates both build jobs on test and builds Linux after the Windows and macOS releases", () => {
    expect(needsOf(jobs.build)).toContain("test");
    expect(needsOf(jobs.linux)).toEqual(expect.arrayContaining(["build", "build-macos"]));
    expect(jobs.linux["runs-on"]).toBe("ubuntu-22.04");
    expect(jobs.build["runs-on"]).toBe("windows-latest");
  });

  it("chains the macOS build behind the Windows build and the verify job behind the macOS build", () => {
    expect(needsOf(jobs["build-macos"])).toEqual(["build"]);
    expect(needsOf(jobs["verify-macos"])).toEqual(["build-macos"]);
    expect(jobs["build-macos"]["runs-on"]).toBe("macos-latest");
    expect(jobs["verify-macos"]["runs-on"]).toBe("macos-latest");
  });

  it("builds arm64 and x64 macOS bundles one at a time, because both write the same release assets", () => {
    expect(macosInclude.map((row) => row.target)).toEqual(["aarch64-apple-darwin", "x86_64-apple-darwin"]);
    expect(macosInclude.map((row) => row.platform)).toEqual(["darwin-aarch64", "darwin-x86_64"]);
    expect(jobs["build-macos"].strategy?.["max-parallel"]).toBe(1);
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

  it("passes the Developer ID secrets only through the secrets context and only to the macOS build", () => {
    const appleSecrets = ["APPLE_CERTIFICATE", "APPLE_CERTIFICATE_PASSWORD", "APPLE_SIGNING_IDENTITY", "APPLE_ID", "APPLE_PASSWORD", "APPLE_TEAM_ID"];
    const signing = stepNamed(jobs["build-macos"], "Select macOS signing mode");
    for (const name of appleSecrets) expect(signing.env?.[name]).toBe(`\${{ secrets.${name} }}`);
    for (const name of secretNames) expect(["GITHUB_TOKEN", ...appleSecrets, "TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"]).toContain(name);
    expect(jobs.build.steps.some((step) => Object.keys(step.env ?? {}).some((key) => key.startsWith("APPLE_")))).toBe(false);
  });

  it("sets HUSHIO_DEVELOPER_ID only after a Developer ID certificate secret is present", () => {
    expect(releaseYaml.match(/HUSHIO_DEVELOPER_ID/g)).toHaveLength(1);
    expect(allEnvValues.some((value) => value.includes("HUSHIO_DEVELOPER_ID"))).toBe(false);
    const run = stepNamed(jobs["build-macos"], "Select macOS signing mode").run ?? "";
    const guard = run.indexOf('if [ -z "$APPLE_CERTIFICATE" ]');
    const exit = run.indexOf("exit 0");
    const flag = run.indexOf("HUSHIO_DEVELOPER_ID=1");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(exit);
    expect(exit).toBeLessThan(flag);
    expect(run).toContain('echo "APPLE_SIGNING_IDENTITY=-" >> "$GITHUB_ENV"');
  });

  it("gates the verify job's expected signature on the same certificate secret", () => {
    expect(jobs["verify-macos"].env?.EXPECT_DEVELOPER_ID).toBe("${{ secrets.APPLE_CERTIFICATE != '' && '1' || '' }}");
  });

  it("switches off Spotlight before the macOS bundle build and builds the app bundle with tauri-action", () => {
    const steps = jobs["build-macos"].steps;
    const spotlight = steps.findIndex((step) => step.run === "sudo mdutil -a -i off");
    const build = steps.findIndex((step) => step.uses?.startsWith("tauri-apps/tauri-action@"));
    expect(spotlight).toBeGreaterThanOrEqual(0);
    expect(spotlight).toBeLessThan(build);
    expect(steps[build].with?.args).toBe("--target ${{ matrix.target }} --bundles app");
    expect(steps[build].with?.includeUpdaterJson).toBe(true);
  });

  it("builds the DMG as best effort so a DMG failure never fails the matrix job", () => {
    const dmg = stepNamed(jobs["build-macos"], "Build DMG (best effort)");
    expect(dmg.run).toBe("pnpm tauri build --target ${{ matrix.target }} --bundles dmg || true");
  });

  it("uploads the macOS bundles as one artifact per arch, which the verify job downloads by the same name", () => {
    const upload = jobs["build-macos"].steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
    expect(upload?.with?.name).toBe("mac-bundles-${{ matrix.arch }}");
    expect(upload?.with?.path).toBe("src-tauri/target/**/bundle/**");
    const download = jobs["verify-macos"].steps.find((step) => step.uses?.startsWith("actions/download-artifact@"));
    expect(download?.with?.name).toBe("mac-bundles-${{ matrix.arch }}");
  });

  it("names the macOS release files by arch and writes darwin entries into latest.json", () => {
    const rename = stepNamed(jobs["build-macos"], "Rename macOS archive and update latest.json");
    expect(rename.run).toContain('NAME="Hushio-${VERSION}-${ARCH}.app.tar.gz"');
    expect(rename.run).toContain("latest.json");
    expect(rename.run).toContain("$WORK/$NAME.sig");
    expect(rename.run).toContain('[key]: { signature: fs.readFileSync(sig, "utf8").trim(), url }');
    expect(stepNamed(jobs["build-macos"], "Publish DMG (best effort)").run).toContain('NAME="Hushio-${VERSION}-${ARCH}.dmg"');
    expect(rename.env?.PLATFORM).toBe("${{ matrix.platform }}");
  });

  it("uploads latest.json for the Windows, macOS and Linux updater entries", () => {
    expect(jobs.build.steps.some((step) => step.run?.includes("latest.json"))).toBe(true);
    expect(jobs["build-macos"].steps.some((step) => step.run?.includes("latest.json"))).toBe(true);
    expect(jobs.linux.steps.some((step) => step.run?.includes("latest.json"))).toBe(true);
    expect(releaseYaml).toContain("Hushio-${VERSION}-linux-x86_64.AppImage");
    expect(releaseYaml).toContain('Hushio_"$VERSION"_x64-setup.nsis.zip');
  });

  it("verifies the DMG, the archive, the signature and the minimum macOS version", () => {
    const script = stepNamed(jobs["verify-macos"], "Verify DMG, archive, signature and minimum macOS version").run ?? "";
    for (const expected of [
      "hdiutil attach",
      'hdiutil detach "$MNT"',
      "codesign --verify --deep --strict",
      "codesign -dv",
      "Signature=adhoc",
      "Authority=Developer ID Application",
      "spctl --assess",
      "vtool -show-build",
      "LSMinimumSystemVersion",
      "::error::declared minimum",
      'tar -xzf "$ARCHIVE"',
      "kill -0",
    ]) {
      expect(script).toContain(expected);
    }
    expect(script).toContain("::warning::spctl rejected (expected while ad-hoc signed)");
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
