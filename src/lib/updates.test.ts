import { describe, expect, it } from "vitest";
import { INITIAL_UPDATE_STATE, actionLabel, chipModel, noticeText, shouldNotify, updateCopy, type UpdateState } from "./updates";

function state(patch: Partial<UpdateState>): UpdateState {
  return { ...INITIAL_UPDATE_STATE, current: "1.1.1", ...patch };
}

describe("shouldNotify", () => {
  it("notifies once per version", () => {
    const available = state({ status: "available", version: "1.2.0" });
    expect(shouldNotify(available, null)).toBe(true);
    expect(shouldNotify(available, "1.1.5")).toBe(true);
    expect(shouldNotify(available, "1.2.0")).toBe(false);
  });

  it("stays silent unless an update is available", () => {
    expect(shouldNotify(state({ status: "current" }), null)).toBe(false);
    expect(shouldNotify(state({ status: "ready", version: "1.2.0" }), null)).toBe(false);
  });
});

describe("notice and action text", () => {
  it("says click to update when the app installs itself", () => {
    const text = noticeText(state({ status: "available", version: "1.2.0", route: "inApp" }));
    expect(text).toBe("Hushio 1.2.0 is available. Click to update.");
    expect(noticeText(state({ status: "available", version: "1.2.0", route: "website" }))).toBe(
      "Hushio 1.2.0 is available. Click to download it.",
    );
  });

  it("names the action for each install route", () => {
    expect(actionLabel("inApp")).toBe("Update");
    expect(actionLabel("website")).toBe("Download");
    expect(actionLabel("releases")).toBe("Open releases");
  });
});

describe("chipModel", () => {
  it("hides the chip without a version or when up to date", () => {
    expect(chipModel(state({ status: "current" }))).toBeNull();
    expect(chipModel(state({ status: "checking" }))).toBeNull();
    expect(chipModel(INITIAL_UPDATE_STATE)).toBeNull();
  });

  it("shows update, restart, progress and failure labels", () => {
    expect(chipModel(state({ status: "available", version: "1.2.0" }))).toEqual({
      label: "Update",
      action: "install",
      icon: "download",
    });
    expect(chipModel(state({ status: "ready", version: "1.2.0" }))).toEqual({
      label: "Restart to update",
      action: "restart",
      icon: "restart",
    });
    expect(chipModel(state({ status: "downloading", version: "1.2.0", percent: 40 }))?.label).toBe("Updating 40%");
    expect(chipModel(state({ status: "checking", version: "1.2.0" }))?.label).toBe("Check for updates");
    expect(chipModel(state({ status: "error", version: "1.2.0" }))).toEqual({
      label: "Update failed",
      action: "about",
      icon: null,
    });
  });
});

describe("updateCopy", () => {
  it("uses the install route to pick the available note", () => {
    expect(updateCopy(state({ status: "available", version: "1.2.0", route: "inApp" }))).toEqual({
      title: "Version 1.2.0 is available",
      note: "You have version 1.1.1. It installs right here.",
    });
    expect(updateCopy(state({ status: "available", version: "1.2.0", route: "website" })).note).toBe(
      "You have version 1.1.1. Get it from hushio.space.",
    );
    expect(updateCopy(state({ status: "available", version: "1.2.0", route: "releases" })).note).toBe(
      "Update with your package manager, or download it from GitHub Releases.",
    );
  });

  it("gives each status its own title and note", () => {
    expect(updateCopy(state({ status: "checking" })).title).toBe("Checking for updates…");
    expect(updateCopy(state({ status: "current" }))).toEqual({
      title: "Hushio is up to date",
      note: "Version 1.1.1 is the newest",
    });
    expect(updateCopy(state({ status: "downloading", version: "1.2.0", percent: 7 }))).toEqual({
      title: "Downloading version 1.2.0…",
      note: "7%",
    });
    expect(updateCopy(state({ status: "ready", version: "1.2.0" }))).toEqual({
      title: "Version 1.2.0 is ready",
      note: "Restart Hushio to finish updating",
    });
  });

  it("names the failed phase in the title", () => {
    expect(updateCopy(state({ status: "error", errorFrom: "install", error: "x" })).title).toBe("Couldn't update");
    expect(updateCopy(state({ status: "error", errorFrom: "check", error: "GitHub answered 404" }))).toEqual({
      title: "Couldn't check for updates",
      note: "GitHub answered 404",
    });
  });

  it("explains Flathub installs", () => {
    expect(updateCopy(state({ route: "flathub" })).note).toBe("Updates come from Flathub.");
  });
});
