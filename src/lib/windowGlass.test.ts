import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  setReduceTransparency: vi.fn(async () => {}),
  persistWrite: vi.fn(async () => true),
  persistRead: vi.fn(async () => null),
}));

vi.mock("./bridge", () => bridge);

import { useSettings } from "../stores/settings";
import { startWindowGlass } from "./windowGlass";

describe("startWindowGlass", () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    useSettings.setState({ reduceDynamicBlur: false });
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
  });

  it("sends the stored Reduce transparency value on start", () => {
    useSettings.setState({ reduceDynamicBlur: true });
    stop = startWindowGlass();

    expect(bridge.setReduceTransparency).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("sends each change of the setting and skips unrelated updates", () => {
    stop = startWindowGlass();
    bridge.setReduceTransparency.mockClear();

    useSettings.setState({ reduceAnimation: true });
    expect(bridge.setReduceTransparency).not.toHaveBeenCalled();

    useSettings.setState({ reduceDynamicBlur: true });
    useSettings.setState({ reduceDynamicBlur: false });
    expect(bridge.setReduceTransparency.mock.calls).toEqual([[true], [false]]);
  });

  it("stops sending after the returned cleanup runs", () => {
    stop = startWindowGlass();
    bridge.setReduceTransparency.mockClear();
    stop();
    stop = undefined;

    useSettings.setState({ reduceDynamicBlur: true });
    expect(bridge.setReduceTransparency).not.toHaveBeenCalled();
  });
});
