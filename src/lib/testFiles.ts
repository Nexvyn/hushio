type Fs = {
  readFileSync(path: string, encoding: "utf8"): string;
  readdirSync(path: string): string[];
  statSync(path: string): { isDirectory(): boolean };
};

const runtime = (globalThis as unknown as {
  process: { cwd(): string; getBuiltinModule(id: "node:fs"): unknown };
}).process;

export const fs = runtime.getBuiltinModule("node:fs") as Fs;

export const SRC_DIR = runtime.cwd().split("\\").join("/") + "/src/";
