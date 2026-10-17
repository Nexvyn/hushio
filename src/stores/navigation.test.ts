import { beforeEach, describe, expect, it } from "vitest";
import { useNavigation } from "./navigation";

const initial = useNavigation.getState();

beforeEach(() => {
  useNavigation.setState(initial, true);
});

describe("navigation history", () => {
  it("keeps at most 40 back entries", () => {
    for (let i = 0; i < 45; i++) {
      useNavigation.getState().navigate({ name: "album", param: String(i) });
    }
    expect(useNavigation.getState().navPast).toHaveLength(40);
  });

  it("ignores a navigation to the same view", () => {
    useNavigation.getState().navigate({ name: "explore" });
    useNavigation.getState().navigate({ name: "explore" });
    expect(useNavigation.getState().navPast).toHaveLength(1);
  });

  it("goes back and forward", () => {
    useNavigation.getState().navigate({ name: "explore" });
    useNavigation.getState().navigate({ name: "library" });

    useNavigation.getState().goBack();
    expect(useNavigation.getState().view).toEqual({ name: "explore" });

    useNavigation.getState().goForward();
    expect(useNavigation.getState().view).toEqual({ name: "library" });
  });
});
