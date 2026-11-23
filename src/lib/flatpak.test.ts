import { describe, expect, it } from "vitest";
import { fs, SRC_DIR } from "./testFiles";

describe("Flatpak sandbox", () => {
  it("can write downloads and edit tags in the music folder", () => {
    const manifest = fs.readFileSync(`${SRC_DIR}../packaging/flatpak/dev.nexvyn.Hushio.yml`, "utf8");
    expect(manifest).toContain("  - --filesystem=xdg-music:rw\n");
    expect(manifest).toContain("  - --filesystem=xdg-download/Hushio:create\n");
    expect(manifest).not.toContain("xdg-music:ro");
  });
});
