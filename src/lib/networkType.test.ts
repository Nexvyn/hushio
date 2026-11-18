import { describe, expect, it } from "vitest";
import { classifyNetwork, subscribeNetworkType } from "./networkType";

describe("classifyNetwork", () => {
  it("counts only a cellular connection type as cellular", () => {
    expect(classifyNetwork({ type: "cellular" })).toBe("cellular");
    expect(classifyNetwork({ type: "wifi" })).toBe("wifi");
    expect(classifyNetwork({ type: "ethernet" })).toBe("wifi");
    expect(classifyNetwork({ effectiveType: "2g" })).toBe("unknown");
    expect(classifyNetwork({ type: "none" })).toBe("unknown");
    expect(classifyNetwork(undefined)).toBe("unknown");
  });
});

describe("subscribeNetworkType", () => {
  it("returns a function that stops the subscription", () => {
    const stop = subscribeNetworkType(() => {});
    expect(() => stop()).not.toThrow();
  });
});
