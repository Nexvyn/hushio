import { describe, expect, it } from "vitest";
import { streamBitrate, DATA_SAVER_KBPS } from "./streamingQuality";
import { classifyNetwork } from "./networkType";
import type { StreamingQuality } from "../stores/settings";

function pick(network: "wifi" | "cellular" | "unknown", wifiQuality: StreamingQuality, mobileQuality: StreamingQuality, dataSaver: boolean) {
  return streamBitrate({ network, wifiQuality, mobileQuality, dataSaver });
}

describe("streamBitrate", () => {
  it.each([
    ["wifi", "low", 48],
    ["wifi", "medium", 128],
    ["wifi", "high", 256],
    ["cellular", "low", 48],
    ["cellular", "medium", 128],
    ["cellular", "high", 256],
    ["unknown", "high", 256],
  ] as const)("%s network with quality %s gives %i kbps", (network, quality, kbps) => {
    expect(pick(network, quality, quality, false)).toBe(kbps);
  });

  it("uses the Wi-Fi quality on Wi-Fi and unknown networks", () => {
    expect(pick("wifi", "high", "low", false)).toBe(256);
    expect(pick("unknown", "high", "low", false)).toBe(256);
  });

  it("uses the mobile quality only on cellular", () => {
    expect(pick("cellular", "high", "low", false)).toBe(48);
    expect(pick("cellular", "low", "high", false)).toBe(256);
  });

  it("leaves lossless unbounded on Wi-Fi, mobile and unknown networks", () => {
    expect(pick("wifi", "lossless", "medium", false)).toBeUndefined();
    expect(pick("cellular", "medium", "lossless", false)).toBeUndefined();
    expect(pick("unknown", "lossless", "medium", false)).toBeUndefined();
  });

  it.each(["wifi", "cellular", "unknown"] as const)(
    "forces the data saver cap on %s even when quality is lossless",
    (network) => {
      expect(pick(network, "lossless", "lossless", true)).toBe(DATA_SAVER_KBPS);
      expect(pick(network, "high", "high", true)).toBe(DATA_SAVER_KBPS);
    },
  );
});

describe("classifyNetwork", () => {
  it("treats no connection info as unknown", () => {
    expect(classifyNetwork(undefined)).toBe("unknown");
    expect(classifyNetwork({})).toBe("unknown");
  });

  it("reads the connection type", () => {
    expect(classifyNetwork({ type: "wifi" })).toBe("wifi");
    expect(classifyNetwork({ type: "ethernet" })).toBe("wifi");
    expect(classifyNetwork({ type: "cellular" })).toBe("cellular");
  });

  it("ignores speed estimates and the data-saver hint", () => {
    expect(classifyNetwork({ effectiveType: "4g" })).toBe("unknown");
    expect(classifyNetwork({ type: "wifi", effectiveType: "3g" })).toBe("wifi");
    expect(classifyNetwork({ type: "wifi", saveData: true })).toBe("wifi");
  });
});
