import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import releaseYaml from "../../.github/workflows/release.yml?raw";
import gradleKts from "../../src-tauri/gen/android/app/build.gradle.kts?raw";

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
  if?: string;
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
const secretNames = new Set([...releaseYaml.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]));

describe("release workflow", () => {
  it("has the test, build, macOS build, verify and linux jobs plus the android job", () => {
    expect(Object.keys(jobs).sort()).toEqual(["android", "build", "build-macos", "linux", "test", "verify-macos"]);
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
    const androidSecrets = ["ANDROID_KEYSTORE_BASE64", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD", "HUSHIO_GOOGLE_CLIENT_ID"];
    for (const name of secretNames) expect(["GITHUB_TOKEN", ...appleSecrets, ...androidSecrets, "TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"]).toContain(name);
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

describe("android release job", () => {
  const android = jobs.android;
  const androidSteps = android.steps;
  const androidRuns = androidSteps.flatMap((step) => (step.run ? [step.run] : []));
  const androidText = JSON.stringify(android);
  const usesStep = (prefix: string): Step | undefined => androidSteps.find((step) => step.uses?.startsWith(prefix));
  const ndkVersion = /ndkVersion = "([\d.]+)"/.exec(gradleKts)?.[1];

  it("runs after the test and build jobs, only for version tags, on Ubuntu", () => {
    expect(needsOf(android).sort()).toEqual(["build", "test"]);
    expect(android["runs-on"]).toBe("ubuntu-22.04");
    expect(android.if).toBe("startsWith(inputs.tag || github.ref_name, 'v')");
  });

  it("installs JDK 17 and the NDK version pinned in the Gradle build", () => {
    expect(usesStep("actions/setup-java@")?.with?.["java-version"]).toBe("17");
    expect(usesStep("android-actions/setup-android@")).toBeDefined();
    expect(ndkVersion).toBeDefined();
    expect(android.env?.ANDROID_NDK_VERSION).toBe(ndkVersion);
    expect(androidRuns).toContain('sdkmanager "ndk;${ANDROID_NDK_VERSION}"');
  });

  it("installs the Rust Android targets without i686", () => {
    const rust = usesStep("actions-rust-lang/setup-rust-toolchain@");
    expect(rust?.with?.target).toBe("aarch64-linux-android,armv7-linux-androideabi,x86_64-linux-android");
    expect(androidText).not.toMatch(/i686/);
  });

  it("installs the frozen dependencies and builds split and universal APKs for the three ABIs", () => {
    expect(androidRuns).toContain("pnpm install --frozen-lockfile");
    const build = stepNamed(android, "Build the APKs").run ?? "";
    expect(build).toContain("pnpm tauri android build --apk --split-per-abi --target aarch64 armv7 x86_64");
    expect(build).toContain("pnpm tauri android build --apk --target aarch64 armv7 x86_64");
  });

  it("reads the keystore and Google client ID only through the secrets context", () => {
    expect(stepNamed(android, "Decode the release keystore").env?.ANDROID_KEYSTORE_BASE64).toBe("${{ secrets.ANDROID_KEYSTORE_BASE64 }}");
    const build = stepNamed(android, "Build the APKs").env ?? {};
    expect(build.ANDROID_KEYSTORE_PASSWORD).toBe("${{ secrets.ANDROID_KEYSTORE_PASSWORD }}");
    expect(build.ANDROID_KEY_ALIAS).toBe("${{ secrets.ANDROID_KEY_ALIAS }}");
    expect(build.ANDROID_KEY_PASSWORD).toBe("${{ secrets.ANDROID_KEY_PASSWORD }}");
    expect(build.HUSHIO_GOOGLE_CLIENT_ID).toBe("${{ secrets.HUSHIO_GOOGLE_CLIENT_ID }}");
    const androidSecretNames = [...androidText.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
    for (const name of androidSecretNames) {
      expect(["GITHUB_TOKEN", "ANDROID_KEYSTORE_BASE64", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD", "HUSHIO_GOOGLE_CLIENT_ID"]).toContain(name);
    }
  });

  it("deletes the decoded keystore even when the build fails", () => {
    const remove = stepNamed(android, "Delete the keystore");
    expect(remove.if).toBe("always()");
    expect(remove.run).toContain("$RUNNER_TEMP/hushio-release.jks");
  });

  it("names the APKs, verifies them, writes SHA256SUMS.txt and uploads them to the tag's release", () => {
    const names = stepNamed(android, "Name the APKs, verify the signature and write SHA256SUMS.txt").run ?? "";
    for (const expected of [
      "for abi in arm64-v8a armeabi-v7a x86_64",
      "hushio-$VERSION-$abi.apk",
      "hushio-$VERSION-universal.apk",
      '"$APKSIGNER" verify --verbose',
      "sha256sum hushio-*.apk > SHA256SUMS.txt",
    ]) {
      expect(names).toContain(expected);
    }
    const upload = stepNamed(android, "Upload the files to the GitHub Release");
    expect(upload.run).toContain('gh release view "$TAG"');
    expect(upload.run).toContain('gh release upload "$TAG" "$APK_DIR"/* --clobber');
  });

  it("pins every action in the job to a full version tag", () => {
    const uses = androidSteps.flatMap((step) => (step.uses ? [step.uses] : []));
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) expect(ref).toMatch(/@v\d+\.\d+\.\d+$/);
  });

  it("uses no npm or npx commands", () => {
    for (const run of androidRuns) expect(run).not.toMatch(/\b(npm|npx)\b/);
  });
});
