import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { useSettings } from "./settings";

describe("rollHintOpens removal", () => {
  it("is no longer a setting", () => {
    expect(useSettings.getState()).not.toHaveProperty("rollHintOpens");
  });

  it("drops the stored counter when migrating from version 4", () => {
    const migrate = useSettings.persist.getOptions().migrate;
    const migrated = migrate?.({ theme: "system", libraryLayout: "list", sidebarLayout: "list", rollHintOpens: 2 } as never, 4) as Record<string, unknown>;
    expect(migrated).not.toHaveProperty("rollHintOpens");
    expect(migrated.sidebarLayout).toBe("list");
  });
});
