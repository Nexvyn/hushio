import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_CACHE_MB, IMAGE_CACHE_LIMITS_MB, formatBytes, limitLabel } from "./cacheStats";

describe("formatBytes", () => {
  it("shows bytes, kilobytes, megabytes and gigabytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(12 * 1024 * 1024)).toBe("12 MB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.5 GB");
  });
});

describe("cache limits", () => {
  it("offers 256 MB, 512 MB, 1 GB and 2 GB, with 256 MB as the default", () => {
    expect(IMAGE_CACHE_LIMITS_MB).toEqual([256, 512, 1024, 2048]);
    expect(DEFAULT_IMAGE_CACHE_MB).toBe(256);
    expect(IMAGE_CACHE_LIMITS_MB.map(limitLabel)).toEqual(["256 MB", "512 MB", "1 GB", "2 GB"]);
  });
});
