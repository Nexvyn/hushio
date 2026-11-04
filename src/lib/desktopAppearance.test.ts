import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopAppearance } from "./bridge";

const bridge = vi.hoisted(() => ({
  listenDesktopAppearance: vi.fn(),
  readDesktopAppearance: vi.fn(),
}));

vi.mock("./bridge", () => bridge);

import {
  desktopAppearance,
  NO_DESKTOP_APPEARANCE,
  setDesktopAppearance,
  startDesktopAppearance,
} from "./desktopAppearance";

const dark: DesktopAppearance = { colorScheme: "dark", reduceMotion: true };
const light: DesktopAppearance = { colorScheme: "light", reduceMotion: false };

beforeEach(() => {
  vi.clearAllMocks();
  setDesktopAppearance(NO_DESKTOP_APPEARANCE);
});

describe("startDesktopAppearance", () => {
  it("applies the value read at boot", async () => {
    bridge.listenDesktopAppearance.mockResolvedValue(() => {});
    bridge.readDesktopAppearance.mockResolvedValue(dark);
    const onChange = vi.fn();

    await startDesktopAppearance(onChange);

    expect(desktopAppearance()).toEqual(dark);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("applies later changes from the portal", async () => {
    let emit: (value: DesktopAppearance) => void = () => {};
    bridge.listenDesktopAppearance.mockImplementation(async (onChange: typeof emit) => {
      emit = onChange;
      return () => {};
    });
    bridge.readDesktopAppearance.mockResolvedValue(NO_DESKTOP_APPEARANCE);
    const onChange = vi.fn();

    await startDesktopAppearance(onChange);
    emit(light);

    expect(desktopAppearance()).toEqual(light);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("keeps a change that arrives before the boot read finishes", async () => {
    let emit: (value: DesktopAppearance) => void = () => {};
    bridge.listenDesktopAppearance.mockImplementation(async (onChange: typeof emit) => {
      emit = onChange;
      return () => {};
    });
    bridge.readDesktopAppearance.mockImplementation(async () => {
      emit(light);
      return dark;
    });

    await startDesktopAppearance(() => {});

    expect(desktopAppearance()).toEqual(light);
  });

  it("keeps the defaults when the boot read fails", async () => {
    bridge.listenDesktopAppearance.mockResolvedValue(() => {});
    bridge.readDesktopAppearance.mockRejectedValue(new Error("no portal"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await startDesktopAppearance(() => {});

    expect(desktopAppearance()).toEqual(NO_DESKTOP_APPEARANCE);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
