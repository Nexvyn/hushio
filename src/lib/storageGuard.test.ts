import { describe, expect, it } from "vitest";
import { fs, SRC_DIR } from "./testFiles";

const WEBVIEW_STORAGE = /\b(localStorage|sessionStorage|indexedDB|openDatabase)\b|\bcaches\.|\bdocument\.cookie\b|\bnavigator\.storage\b/;
const ALLOWED = new Set(["lib/streamTrace.ts"]);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((name) => {
    const path = `${dir}${name}`;
    if (fs.statSync(path).isDirectory()) return sourceFiles(`${path}/`);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(name) && !/\.test\.(ts|tsx|js|jsx)$/.test(name) ? [path] : [];
  });
}

function relative(path: string): string {
  return path.slice(SRC_DIR.length);
}

function read(path: string): string {
  return fs.readFileSync(path, "utf8");
}

describe("user data stays out of WebView storage", () => {
  const files = sourceFiles(SRC_DIR);

  it("scans the app source", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("no non-test source file uses localStorage, sessionStorage, IndexedDB, Cache Storage or cookies", () => {
    const offenders = files
      .filter((path) => !ALLOWED.has(relative(path)))
      .filter((path) => WEBVIEW_STORAGE.test(read(path)))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  it("every allow-listed file still needs its exception", () => {
    const stale = [...ALLOWED].filter((rel) => !WEBVIEW_STORAGE.test(read(SRC_DIR + rel)));
    expect(stale).toEqual([]);
  });

  it("every zustand persist() store saves through persistStorage() with an explicit version", () => {
    const stores = files
      .filter((path) => relative(path).startsWith("stores/"))
      .filter((path) => /\bpersist\(/.test(read(path)));
    expect(stores.length).toBeGreaterThan(0);
    for (const path of stores) {
      const text = read(path);
      const persistCalls = text.match(/\bpersist\(/g)?.length ?? 0;
      const versions = text.match(/\bversion:\s*[\w.]+/g)?.length ?? 0;
      expect(text, relative(path)).toMatch(/\bpersistStorage(<[^>]*>)?\(/);
      expect(text, relative(path)).not.toMatch(/createJSONStorage/);
      expect(versions, relative(path)).toBeGreaterThanOrEqual(persistCalls);
    }
  });
});
