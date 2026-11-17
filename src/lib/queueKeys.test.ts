import { describe, expect, it } from "vitest";
import { queueEntryKeys } from "./queueKeys";

const t = (id: string) => ({ id });

describe("queueEntryKeys", () => {
  it("keeps a row's key when an earlier row is removed", () => {
    const before = [t("a"), t("b"), t("c")];
    const after = [t("b"), t("c")];
    const keysBefore = queueEntryKeys(before);
    const keysAfter = queueEntryKeys(after);
    expect(keysAfter).toEqual([keysBefore[1], keysBefore[2]]);
  });

  it("numbers repeated tracks by occurrence so duplicates stay distinct", () => {
    expect(queueEntryKeys([t("a"), t("b"), t("a")])).toEqual(["a#0", "b#0", "a#1"]);
  });

  it("returns no keys for an empty queue", () => {
    expect(queueEntryKeys([])).toEqual([]);
  });
});
