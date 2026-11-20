import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import ciYaml from "../../.github/workflows/ci.yml?raw";
import releaseYaml from "../../.github/workflows/release.yml?raw";
import gradleKts from "../../src-tauri/gen/android/app/build.gradle.kts?raw";

type Step = {
  name?: string;
  id?: string;
  uses?: string;
  run?: string;
  if?: string;
  shell?: string;
  "timeout-minutes"?: number;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};

type Job = {
  needs?: string | string[];
  uses?: string;
  "runs-on"?: string;
  "timeout-minutes"?: number;
  if?: string;
  outputs?: Record<string, string>;
  strategy?: { "fail-fast"?: boolean; "max-parallel"?: number; matrix?: Record<string, unknown> };
  env?: Record<string, string>;
  steps?: Step[];
};

type DispatchInput = { description?: string; required?: boolean; type?: string; default?: string | boolean };

type Workflow = {
  name: string;
  on: {
    workflow_dispatch?: { inputs: Record<string, DispatchInput> };
    push?: { branches?: string[]; "paths-ignore"?: string[]; tags?: string[] };
  };
  permissions?: Record<string, string>;
  concurrency?: { group: string; "cancel-in-progress": boolean };
  env?: Record<string, string>;
  jobs: Record<string, Job>;
};

const release = parse(releaseYaml) as Workflow;
const ci = parse(ciYaml) as Workflow;
const jobs = release.jobs;
const ciJobs = ci.jobs;

const SIGNING_SECRETS = ["TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"];
const ANDROID_SECRETS = ["ANDROID_KEYSTORE_BASE64", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD"];
const APPLE_SECRETS = ["APPLE_CERTIFICATE", "APPLE_CERTIFICATE_PASSWORD", "APPLE_SIGNING_IDENTITY", "APPLE_ID", "APPLE_PASSWORD", "APPLE_TEAM_ID"];
const CLIENT_ID_SECRETS = ["HUSHIO_GOOGLE_CLIENT_ID", "HUSHIO_SPOTIFY_CLIENT_ID"];
const REQUIRED_SECRETS = [...SIGNING_SECRETS, ...ANDROID_SECRETS];
const ALLOWED_SECRETS = ["GITHUB_TOKEN", ...REQUIRED_SECRETS, ...APPLE_SECRETS, ...CLIENT_ID_SECRETS];
const SECRET_ENV_KEYS = [...REQUIRED_SECRETS, ...APPLE_SECRETS, ...CLIENT_ID_SECRETS];

const needsOf = (job: Job): string[] => (typeof job.needs === "string" ? [job.needs] : (job.needs ?? []));
const stepsOf = (job: Job): Step[] => job.steps ?? [];
const allSteps = (wf: Workflow): Step[] => Object.values(wf.jobs).flatMap(stepsOf);
const allRuns = (wf: Workflow): string[] => allSteps(wf).flatMap((step) => (step.run ? [step.run] : []));
const allUses = (wf: Workflow): string[] => allSteps(wf).flatMap((step) => (step.uses ? [step.uses] : []));
const allEnvEntries = (wf: Workflow): [string, string][] => [
  ...Object.entries(wf.env ?? {}),
  ...Object.values(wf.jobs).flatMap((job) => Object.entries(job.env ?? {})),
  ...allSteps(wf).flatMap((step) => Object.entries(step.env ?? {})),
];
const stepNamed = (job: Job, name: string): Step => {
  const step = stepsOf(job).find((candidate) => candidate.name === name);
  if (!step) throw new Error(`missing step ${name}`);
  return step;
};
const usesIn = (job: Job, prefix: string): Step[] => stepsOf(job).filter((step) => step.uses?.startsWith(prefix));
const stepsUsing = (wf: Workflow, prefix: string): Step[] => allSteps(wf).filter((step) => step.uses?.startsWith(prefix));
const secretNamesIn = (text: string): string[] => [...new Set([...text.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]))];
const releaseJobNames = Object.keys(jobs).sort();

describe("release workflow", () => {
  it("has the prepare, tests, windows, macos, verify-macos, linux, android and publish jobs", () => {
    expect(releaseJobNames).toEqual(["android", "linux", "macos", "prepare", "publish", "tests", "verify-macos", "windows"]);
  });

  it("points every needs entry in both workflows at an existing job", () => {
    for (const job of Object.values(jobs)) for (const need of needsOf(job)) expect(releaseJobNames).toContain(need);
    for (const job of Object.values(ciJobs)) for (const need of needsOf(job)) expect(Object.keys(ciJobs)).toContain(need);
  });

  it("runs on a tag push or a manual dispatch with a required tag and a publish switch that defaults to on", () => {
    const inputs = release.on.workflow_dispatch?.inputs ?? {};
    expect(Object.keys(inputs).sort()).toEqual(["publish", "tag"]);
    expect(inputs.tag).toMatchObject({ required: true, type: "string", description: "Release tag, for example v1.0.1" });
    expect(inputs.publish).toMatchObject({ type: "boolean", default: true });
    expect(release.on.push?.tags).toEqual(["v*"]);
  });

  it("has contents write permission and a per-tag concurrency group that cancels older runs", () => {
    expect(release.permissions).toEqual({ contents: "write" });
    expect(release.concurrency).toEqual({ group: "release-${{ inputs.tag || github.ref_name }}", "cancel-in-progress": true });
  });

  it("sets the pnpm version, Linux deps and tag at the top level", () => {
    expect(release.env?.PNPM_VERSION).toBe("10.34.5");
    expect(release.env?.LINUX_DEPS).toContain("libwebkit2gtk-4.1-dev");
    expect(release.env?.TAG).toBe("${{ inputs.tag || github.ref_name }}");
  });

  it("checks out the commit the run started on, with no ref input, in every job that builds", () => {
    const checkouts = allSteps(release).filter((step) => step.uses?.startsWith("actions/checkout@"));
    expect(checkouts).toHaveLength(5);
    for (const step of checkouts) expect(step.with?.ref).toBeUndefined();
  });

  it("checks the versions, the tag, the secrets and the release in the prepare job", () => {
    const prepare = jobs.prepare;
    expect(prepare.needs).toBeUndefined();
    expect(prepare["runs-on"]).toBe("ubuntu-latest");
    expect(prepare["timeout-minutes"]).toBe(10);
    expect(prepare.outputs).toEqual({ version: "${{ steps.check.outputs.version }}" });
    const script = stepNamed(prepare, "Check the version, secrets and release").run ?? "";
    for (const expected of [
      "require('./package.json').version",
      "require('./src-tauri/tauri.conf.json').version",
      "sed -n 's/^version = ",
      "src-tauri/Cargo.toml",
      "does not match the app version",
      "Missing secrets",
      "is already published.",
      'gh release create "$TAG" --draft --target "$GITHUB_SHA"',
      '"version=$VERSION" >> "$GITHUB_OUTPUT"',
    ]) {
      expect(script).toContain(expected);
    }
  });

  it("passes the publish flag from the event type, not from inputs.publish != false", () => {
    const check = stepNamed(jobs.prepare, "Check the version, secrets and release");
    expect(check.env?.PUBLISH).toBe("${{ github.event_name == 'push' || inputs.publish }}");
    expect(releaseYaml).not.toContain("!= false");
  });

  it("gives the prepare check the six signing and keystore secrets under their own names", () => {
    const env = stepNamed(jobs.prepare, "Check the version, secrets and release").env ?? {};
    for (const name of REQUIRED_SECRETS) expect(env[name]).toBe(`\${{ secrets.${name} }}`);
    const script = stepNamed(jobs.prepare, "Check the version, secrets and release").run ?? "";
    for (const name of REQUIRED_SECRETS) expect(script).toContain(name);
    expect(script).toContain("${!name}");
  });

  it("calls the ci workflow from the tests job, which nothing waits for except publish", () => {
    expect(jobs.tests.uses).toBe("./.github/workflows/ci.yml");
    expect(jobs.tests.needs).toBeUndefined();
    for (const [name, job] of Object.entries(jobs)) {
      if (name === "publish") expect(needsOf(job)).toContain("tests");
      else expect(needsOf(job)).not.toContain("tests");
    }
  });

  it("lets the windows, macos, linux and android jobs run in parallel after prepare only", () => {
    for (const name of ["windows", "macos", "linux", "android"]) expect(needsOf(jobs[name])).toEqual(["prepare"]);
  });

  it("makes publish wait for every other job", () => {
    const others = releaseJobNames.filter((name) => name !== "publish");
    expect([...needsOf(jobs.publish)].sort()).toEqual(others);
  });

  it("gives every job a timeout except the reusable tests call", () => {
    for (const [name, job] of Object.entries(jobs)) {
      if (name === "tests") continue;
      expect(job["timeout-minutes"], name).toBeGreaterThan(0);
    }
    for (const [name, job] of Object.entries(ciJobs)) expect(job["timeout-minutes"], name).toBeGreaterThan(0);
  });

  it("builds only the NSIS installer on Windows and uploads it under the release name", () => {
    const windows = jobs.windows;
    expect(windows["runs-on"]).toBe("windows-latest");
    expect(stepNamed(windows, "Build the installer").run).toBe("pnpm tauri build --bundles nsis");
    const upload = stepNamed(windows, "Upload the installer").run ?? "";
    expect(upload).toContain("Hushio-${VERSION}-x64-setup.exe");
    expect(upload).toContain('gh release upload "$TAG" "$OUT"/* --clobber');
    expect(upload).not.toContain("delete");
  });

  it("builds arm64 and x64 macOS in parallel with no max-parallel cap", () => {
    const macos = jobs.macos;
    expect(macos.strategy?.["fail-fast"]).toBe(false);
    expect(macos.strategy?.["max-parallel"]).toBeUndefined();
    const include = (macos.strategy?.matrix?.include ?? []) as Record<string, string>[];
    expect(include.map((row) => row.target)).toEqual(["aarch64-apple-darwin", "x86_64-apple-darwin"]);
    expect(include.map((row) => row.arch)).toEqual(["arm64", "x64"]);
    expect(macos["runs-on"]).toBe("macos-latest");
    expect(macos["timeout-minutes"]).toBe(60);
  });

  it("builds the macOS app once and then bundles the DMG from it with retries", () => {
    const runs = stepsOf(jobs.macos).flatMap((step) => (step.run ? [step.run] : []));
    expect(runs.filter((run) => run.includes("tauri build"))).toEqual([
      "pnpm tauri build --target ${{ matrix.target }} --bundles app",
    ]);
    const dmg = stepNamed(jobs.macos, "Build the DMG").run ?? "";
    expect(dmg).toContain("pnpm tauri bundle --target ${{ matrix.target }} --bundles dmg");
    expect(dmg).toContain("for attempt in 1 2 3; do");
    expect(dmg).toContain("sleep 15");
    expect(dmg).not.toContain("|| true");
  });

  it("switches off Spotlight before the macOS app build", () => {
    const names = stepsOf(jobs.macos).map((step) => step.name ?? step.run ?? "");
    expect(names.indexOf("Turn off Spotlight")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("Turn off Spotlight")).toBeLessThan(names.indexOf("Build the app"));
    expect(stepNamed(jobs.macos, "Turn off Spotlight").run).toBe("sudo mdutil -a -i off");
  });

  it("uploads the macOS archive and DMG under release names and keeps the arch artifact for verify-macos", () => {
    const upload = stepNamed(jobs.macos, "Upload the app archive and DMG").run ?? "";
    expect(upload).toContain('"$OUT/Hushio-${VERSION}-${ARCH}.app.tar.gz"');
    expect(upload).toContain('"$OUT/Hushio-${VERSION}-${ARCH}.app.tar.gz.sig"');
    expect(upload).toContain('"$OUT/Hushio-${VERSION}-${ARCH}.dmg"');
    expect(upload).toContain('gh release upload "$TAG" "$OUT"/* --clobber');
    const artifact = usesIn(jobs.macos, "actions/upload-artifact@")[0];
    expect(artifact?.with?.name).toBe("mac-bundles-${{ matrix.arch }}");
    expect(artifact?.with?.path).toBe("src-tauri/target/**/bundle/**");
    const download = usesIn(jobs["verify-macos"], "actions/download-artifact@")[0];
    expect(download?.with?.name).toBe("mac-bundles-${{ matrix.arch }}");
  });

  it("runs verify-macos after the macOS builds, on both arches, with a 10 minute cap", () => {
    expect(needsOf(jobs["verify-macos"])).toEqual(["macos"]);
    expect(jobs["verify-macos"]["timeout-minutes"]).toBe(10);
    expect(jobs["verify-macos"].strategy?.matrix?.arch).toEqual(["arm64", "x64"]);
  });

  it("keeps the Developer ID signing mode guard before the HUSHIO_DEVELOPER_ID flag", () => {
    expect(releaseYaml.match(/HUSHIO_DEVELOPER_ID/g)).toHaveLength(1);
    const run = stepNamed(jobs.macos, "Select macOS signing mode").run ?? "";
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

  it("verifies the DMG, the archive, the signature, Gatekeeper and the minimum macOS version", () => {
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

  it("builds only the deb and rpm on Linux with updater artifacts turned off and verifies them", () => {
    expect(stepNamed(jobs.linux, "Build the deb and rpm").run).toBe(
      `pnpm tauri build --bundles deb,rpm --config '{"bundle":{"createUpdaterArtifacts":false}}'`,
    );
    const verify = stepNamed(jobs.linux, "Verify Linux bundles").run ?? "";
    expect(verify).toContain("dpkg-deb --info");
    expect(verify).toContain("rpm -qpR");
    expect(usesIn(jobs.linux, "actions/upload-artifact@")).toHaveLength(0);
  });

  it("installs the Linux packages non-interactively with a 15 minute cap and includes libasound2-dev", () => {
    const install = stepNamed(jobs.linux, "Install Linux build dependencies");
    expect(install["timeout-minutes"]).toBe(15);
    expect(install.run).toContain("DEBIAN_FRONTEND=noninteractive apt-get install -y $LINUX_DEPS");
    expect(release.env?.LINUX_DEPS).toContain("libasound2-dev");
  });

  it("uploads the deb and rpm under their release names", () => {
    const upload = stepNamed(jobs.linux, "Upload the deb and rpm").run ?? "";
    expect(upload).toContain('"$OUT/Hushio-${VERSION}-linux-amd64.deb"');
    expect(upload).toContain('"$OUT/Hushio-${VERSION}-linux-x86_64.rpm"');
    expect(upload).toContain('gh release upload "$TAG" "$OUT"/* --clobber');
  });

  it("runs the android job after prepare only on Ubuntu 22.04 with a 60 minute cap and the version from prepare", () => {
    expect(needsOf(jobs.android)).toEqual(["prepare"]);
    expect(jobs.android["runs-on"]).toBe("ubuntu-22.04");
    expect(jobs.android["timeout-minutes"]).toBe(60);
    expect(jobs.android.env?.VERSION).toBe("${{ needs.prepare.outputs.version }}");
  });

  it("installs JDK 17 with the Gradle cache and the NDK pinned in build.gradle.kts", () => {
    const ndkVersion = /ndkVersion = "([\d.]+)"/.exec(gradleKts)?.[1];
    expect(ndkVersion).toBeDefined();
    const setupJava = usesIn(jobs.android, "actions/setup-java@")[0];
    expect(setupJava?.with?.["java-version"]).toBe("17");
    expect(setupJava?.with?.cache).toBe("gradle");
    expect(jobs.android.env?.ANDROID_NDK_VERSION).toBe(ndkVersion);
    const ndk = stepNamed(jobs.android, "Install the pinned NDK").run ?? "";
    expect(ndk).toContain('SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"');
    expect(ndk).toContain('"$SDKMANAGER" "ndk;${ANDROID_NDK_VERSION}"');
    expect(ndk).toContain("NDK_HOME=$ANDROID_HOME/ndk/${ANDROID_NDK_VERSION}");
  });

  it("installs only the three Rust Android targets, without i686", () => {
    const toolchain = usesIn(jobs.android, "actions-rust-lang/setup-rust-toolchain@")[0];
    expect(toolchain?.with?.target).toBe("aarch64-linux-android,armv7-linux-androideabi,x86_64-linux-android");
    expect(JSON.stringify(jobs.android)).not.toMatch(/i686/);
  });

  it("runs the web build once and passes the no-web config to both APK builds", () => {
    const runs = stepsOf(jobs.android).flatMap((step) => (step.run ? [step.run] : []));
    expect(runs.filter((run) => run.includes("pnpm build:web"))).toHaveLength(1);
    const build = stepNamed(jobs.android, "Build the APKs").run ?? "";
    expect(build.indexOf("pnpm build:web")).toBeLessThan(build.indexOf("pnpm tauri android build"));
    expect(build).toContain(`NO_WEB='{"build":{"beforeBuildCommand":null}}'`);
    expect(build.split('--config "$NO_WEB"')).toHaveLength(3);
    expect(build).toContain("pnpm tauri android build --apk --split-per-abi --target aarch64 armv7 x86_64");
    expect(build).toContain("pnpm tauri android build --apk --target aarch64 armv7 x86_64");
  });

  it("reads the keystore and client IDs only through the secrets context and only in the android job", () => {
    expect(stepNamed(jobs.android, "Decode the release keystore").env?.ANDROID_KEYSTORE_BASE64).toBe("${{ secrets.ANDROID_KEYSTORE_BASE64 }}");
    const build = stepNamed(jobs.android, "Build the APKs").env ?? {};
    expect(build.ANDROID_KEYSTORE_PASSWORD).toBe("${{ secrets.ANDROID_KEYSTORE_PASSWORD }}");
    expect(build.ANDROID_KEY_ALIAS).toBe("${{ secrets.ANDROID_KEY_ALIAS }}");
    expect(build.ANDROID_KEY_PASSWORD).toBe("${{ secrets.ANDROID_KEY_PASSWORD }}");
    expect(build.HUSHIO_GOOGLE_CLIENT_ID).toBe("${{ secrets.HUSHIO_GOOGLE_CLIENT_ID }}");
    expect(build.HUSHIO_SPOTIFY_CLIENT_ID).toBe("${{ secrets.HUSHIO_SPOTIFY_CLIENT_ID }}");
    for (const name of ["windows", "macos", "linux", "publish"] as const) {
      expect(JSON.stringify(jobs[name])).not.toContain("ANDROID_");
    }
  });

  it("deletes the decoded keystore even when the build fails", () => {
    const remove = stepNamed(jobs.android, "Delete the keystore");
    expect(remove.if).toBe("always()");
    expect(remove.run).toContain("$RUNNER_TEMP/hushio-release.jks");
  });

  it("names and verifies the APKs, then uploads the APK files without a checksum file", () => {
    const names = stepNamed(jobs.android, "Name and verify the APKs").run ?? "";
    for (const expected of [
      "for pair in arm64:arm64-v8a arm:armeabi-v7a x86_64:x86_64",
      'cp "$BUILD/$flavor/release/app-$flavor-release.apk" "$APK_DIR/hushio-$VERSION-$abi.apk"',
      'cp "$BUILD/universal/release/app-universal-release.apk" "$APK_DIR/hushio-$VERSION-universal.apk"',
      '"$APKSIGNER" verify --verbose',
    ]) {
      expect(names).toContain(expected);
    }
    expect(names).not.toContain("SHA256SUMS");
    expect(stepNamed(jobs.android, "Upload the APKs").run).toBe('gh release upload "$TAG" "$APK_DIR"/*.apk --clobber');
  });

  it("writes latest.json with the windows nsis key and both darwin keys with -app variants", () => {
    const script = stepNamed(jobs.publish, "Write latest.json and SHA256SUMS.txt").run ?? "";
    for (const key of [
      '"windows-x86_64"',
      '"windows-x86_64-nsis"',
      '"darwin-aarch64"',
      '"darwin-aarch64-app"',
      '"darwin-x86_64"',
      '"darwin-x86_64-app"',
    ]) {
      expect(script).toContain(key);
    }
    expect(script).toContain('fs.writeFileSync("latest.json"');
    expect(script).toContain("Hushio-${version}-x64-setup.exe");
    expect(script).toContain("Hushio-${version}-arm64.app.tar.gz");
    expect(script).toContain("Hushio-${version}-x64.app.tar.gz");
  });

  it("reads each updater signature from the downloaded assets and checksums everything except .sig files", () => {
    const script = stepNamed(jobs.publish, "Write latest.json and SHA256SUMS.txt").run ?? "";
    expect(script).toContain('fs.readFileSync(file + ".sig", "utf8")');
    expect(script).toContain("grep -v '\\.sig$'");
    expect(script).toContain("sha256sum");
    expect(script).toContain('gh release upload "$TAG" SHA256SUMS.txt latest.json --clobber');
  });

  it("publishes only on a tag push or when the publish input is on", () => {
    const publish = stepNamed(jobs.publish, "Publish the release");
    expect(publish.if).toBe("github.event_name == 'push' || inputs.publish");
    expect(publish.run).toBe('gh release edit "$TAG" --draft=false --latest');
  });

  it("reads every signing and keystore value only through the secrets context", () => {
    for (const [key, value] of allEnvEntries(release)) {
      if (!SECRET_ENV_KEYS.includes(key)) continue;
      expect(value, key).toMatch(/^\$\{\{ secrets\.[A-Z0-9_]+ \}\}$/);
    }
    for (const name of secretNamesIn(releaseYaml)) expect(ALLOWED_SECRETS).toContain(name);
    expect(releaseYaml).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
  });

  it("passes the Developer ID secrets only to the macOS jobs", () => {
    const signing = stepNamed(jobs.macos, "Select macOS signing mode").env ?? {};
    for (const name of APPLE_SECRETS) expect(signing[name]).toBe(`\${{ secrets.${name} }}`);
    expect(JSON.stringify(jobs.windows)).not.toContain("APPLE_");
    expect(JSON.stringify(jobs.linux)).not.toContain("APPLE_");
    expect(JSON.stringify(jobs.android)).not.toContain("APPLE_");
  });

  it("uses no tauri-action and no delete-asset anywhere", () => {
    for (const text of [releaseYaml, ciYaml]) {
      expect(text).not.toContain("tauri-apps/tauri-action");
      expect(text).not.toContain("delete-asset");
    }
  });

  it("uses no npm or npx commands in either workflow", () => {
    for (const wf of [release, ci]) for (const run of allRuns(wf)) expect(run).not.toMatch(/\b(npm|npx)\b/);
  });

  it("pins every action in both workflows to a full version tag", () => {
    for (const wf of [release, ci]) {
      const uses = allUses(wf);
      expect(uses.length).toBeGreaterThan(0);
      for (const ref of uses) expect(ref).toMatch(/@v\d+\.\d+\.\d+$/);
    }
  });

  it("has no comment lines in either workflow", () => {
    expect(releaseYaml).not.toMatch(/^\s*#/m);
    expect(ciYaml).not.toMatch(/^\s*#/m);
  });

  it("gives every setup-rust-toolchain step an empty rustflags and no built-in cache", () => {
    const toolchains = [...stepsUsing(release, "actions-rust-lang/setup-rust-toolchain@"), ...stepsUsing(ci, "actions-rust-lang/setup-rust-toolchain@")];
    expect(toolchains).toHaveLength(6);
    for (const step of toolchains) {
      expect(step.with?.rustflags).toBe("");
      expect(step.with?.cache).toBe(false);
    }
  });

  it("gives every rust-cache step the src-tauri workspace, cache-on-failure and a unique shared key", () => {
    const caches = [...stepsUsing(release, "swatinem/rust-cache@"), ...stepsUsing(ci, "swatinem/rust-cache@")];
    expect(caches).toHaveLength(6);
    const keys = caches.map((step) => step.with?.["shared-key"]);
    expect(new Set(keys).size).toBe(keys.length);
    for (const step of caches) {
      expect(step.with?.workspaces).toBe("src-tauri");
      expect(step.with?.["cache-on-failure"]).toBe(true);
    }
  });
});

describe("ci workflow", () => {
  it("runs on a push to main with the docs-only paths ignored, on pull requests and when called", () => {
    expect(ci.on.push?.branches).toEqual(["main"]);
    expect(ci.on.push?.["paths-ignore"]).toEqual(["**.md", "LICENSE"]);
    expect(Object.keys(ci.on)).toEqual(expect.arrayContaining(["pull_request", "workflow_call"]));
    expect(ci.name).toBe("ci");
  });

  it("has contents read permission and a per-ref concurrency group that cancels older runs", () => {
    expect(ci.permissions).toEqual({ contents: "read" });
    expect(ci.concurrency).toEqual({ group: "ci-${{ github.workflow }}-${{ github.ref }}", "cancel-in-progress": true });
  });

  it("shares the pnpm version and Linux deps with the release workflow", () => {
    expect(ci.env?.PNPM_VERSION).toBe("10.34.5");
    expect(ci.env?.LINUX_DEPS).toBe(release.env?.LINUX_DEPS);
  });

  it("has the web, rust and android jobs", () => {
    expect(Object.keys(ciJobs).sort()).toEqual(["android", "rust", "web"]);
  });

  it("runs install, typecheck and frontend tests in the web job on Ubuntu with a 15 minute cap", () => {
    const web = ciJobs.web;
    expect(web["runs-on"]).toBe("ubuntu-22.04");
    expect(web["timeout-minutes"]).toBe(15);
    const runs = stepsOf(web).flatMap((step) => (step.run ? [step.run] : []));
    expect(runs).toEqual(["pnpm install --frozen-lockfile", "pnpm typecheck", "pnpm test"]);
  });

  it("runs the cargo tests on ubuntu-22.04 and windows-latest with fail-fast off and a 30 minute cap", () => {
    const rust = ciJobs.rust;
    expect(rust.strategy?.matrix?.os).toEqual(["ubuntu-22.04", "windows-latest"]);
    expect(rust.strategy?.["fail-fast"]).toBe(false);
    expect(rust["timeout-minutes"]).toBe(30);
    expect(stepsOf(rust).flatMap((step) => (step.run ? [step.run] : []))).toContain("cargo test --manifest-path src-tauri/Cargo.toml");
  });

  it("installs the Linux packages only on Linux, with a 15 minute cap", () => {
    const install = stepNamed(ciJobs.rust, "Install Linux build dependencies");
    expect(install.if).toBe("runner.os == 'Linux'");
    expect(install["timeout-minutes"]).toBe(15);
    expect(install.run).toContain("DEBIAN_FRONTEND=noninteractive apt-get install -y $LINUX_DEPS");
  });

  it("runs cargo check for aarch64-linux-android in the android job with the NDK compiler environment", () => {
    const android = ciJobs.android;
    expect(android["runs-on"]).toBe("ubuntu-22.04");
    expect(android["timeout-minutes"]).toBe(30);
    const toolchain = stepsUsing(ci, "actions-rust-lang/setup-rust-toolchain@").find((step) => step.with?.target);
    expect(toolchain?.with?.target).toBe("aarch64-linux-android");
    const check = stepNamed(android, "Check the Rust code for Android").run ?? "";
    expect(check).toContain("cargo check --manifest-path src-tauri/Cargo.toml --target aarch64-linux-android --lib");
    expect(check).toContain("$ANDROID_NDK_LATEST_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin");
    expect(check).toContain("CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER");
  });
});
