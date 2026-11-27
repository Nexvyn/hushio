import { describe, expect, it } from "vitest";
import { errorMessage, updateCopy } from "./appUpdate";

describe("updateCopy", () => {
  it("shows nothing while idle", () => {
    expect(updateCopy({ kind: "idle" }, "1.1.1")).toBeNull();
  });

  it("names the installed and offered versions", () => {
    expect(updateCopy({ kind: "current", version: "1.1.1" }, "1.1.1")).toEqual({
      title: "Hushio is up to date",
      note: "Version 1.1.1 is the newest.",
    });
    expect(updateCopy({ kind: "available", version: "1.2.0" }, "1.1.1")).toEqual({
      title: "Version 1.2.0 is available",
      note: "You have version 1.1.1. It installs right here.",
    });
  });

  it("shows the percent while downloading", () => {
    expect(updateCopy({ kind: "downloading", version: "1.2.0", percent: 42 }, "1.1.1")).toEqual({
      title: "Downloading version 1.2.0…",
      note: "42%",
    });
  });

  it("uses the check or update error title with the error text", () => {
    expect(updateCopy({ kind: "error", during: "check", message: "GitHub answered 503" }, "1.1.1")).toEqual({
      title: "Couldn't check for updates",
      note: "GitHub answered 503",
    });
    expect(updateCopy({ kind: "error", during: "update", message: "Couldn't update" }, "1.1.1")).toEqual({
      title: "Couldn't update",
      note: "Couldn't update",
    });
  });

  it("asks for the unknown-sources permission in the PRD words", () => {
    expect(updateCopy({ kind: "unknown-sources" }, "1.1.1")?.title).toBe(
      "Allow installs from Hushio in the settings, then try again",
    );
  });
});

describe("errorMessage", () => {
  it("keeps plugin rejection text and error messages", () => {
    expect(errorMessage("Couldn't update")).toBe("Couldn't update");
    expect(errorMessage(new Error("network down"))).toBe("network down");
  });

  it("falls back for empty or unknown errors", () => {
    expect(errorMessage("")).toBe("Try again later.");
    expect(errorMessage({ code: 1 })).toBe("Try again later.");
  });
});
