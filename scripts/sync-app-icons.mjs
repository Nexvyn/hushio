import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const copy = (source, target) => {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
};
const copyTree = (source, target) => {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.isDirectory()) copyTree(join(source, entry.name), join(target, entry.name));
    else copy(join(source, entry.name), join(target, entry.name));
  }
};
copy(join(root, "public/hushio.svg"), join(root, "src/assets/hushio.svg"));
copy(join(root, "public/hushio.svg"), join(root, "src-tauri/icons/scalable/hushio.svg"));
copy(join(root, "src-tauri/icons/1024x1024.png"), join(root, "src-tauri/app-icon-1024.png"));
const android = join(root, "src-tauri/gen/android/app/src/main/res");
if (existsSync(android)) copyTree(join(root, "src-tauri/icons/android"), android);
