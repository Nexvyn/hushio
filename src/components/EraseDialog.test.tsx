import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EraseDialog } from "./EraseDialog";
import type { EraseSteps } from "../lib/disconnect";
import { useErase } from "../stores/erase";

type Failing = keyof EraseSteps | null;

function fakeSteps() {
  const calls: string[] = [];
  const failing: { current: Failing } = { current: null };
  const make = (name: keyof EraseSteps) => async () => {
    calls.push(name);
    if (failing.current === name) throw new Error(`${name} failed`);
  };
  const steps: EraseSteps = {
    stopSync: make("stopSync"),
    resumeSync: make("resumeSync"),
    deleteYoutubePlaylists: make("deleteYoutubePlaylists"),
    revokeTokens: make("revokeTokens"),
    removeKeyring: make("removeKeyring"),
    wipeLocal: make("wipeLocal"),
  };
  return { steps, calls, failing };
}

function open(mode: "google" | "guest" | "reset") {
  act(() => useErase.getState().open(mode));
}

afterEach(() => {
  cleanup();
  useErase.setState({ mode: null });
});

describe("EraseDialog", () => {
  it("shows the Google copy with both boxes unticked and Cancel focused", () => {
    const { steps } = fakeSteps();
    open("google");
    render(<EraseDialog steps={steps} onErased={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Disconnect and erase Hushio data?" })).toBeTruthy();
    expect(screen.getByText(/This signs Hushio out of your Google account/)).toBeTruthy();
    const youtube = screen.getByLabelText("Also delete playlists Hushio created on YouTube") as HTMLInputElement;
    const downloads = screen.getByLabelText("Also delete downloaded files") as HTMLInputElement;
    expect(youtube.checked).toBe(false);
    expect(downloads.checked).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  });

  it("closes on Escape without running any step", () => {
    const { steps, calls } = fakeSteps();
    open("google");
    render(<EraseDialog steps={steps} onErased={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useErase.getState().mode).toBeNull();
    expect(calls).toEqual([]);
  });

  it("runs the YouTube playlist step only when its box is ticked", async () => {
    const { steps, calls } = fakeSteps();
    const onErased = vi.fn();
    open("google");
    render(<EraseDialog steps={steps} onErased={onErased} />);
    fireEvent.click(screen.getByLabelText("Also delete playlists Hushio created on YouTube"));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect & erase" }));
    await waitFor(() => expect(onErased).toHaveBeenCalledTimes(1));
    expect(calls).toContain("deleteYoutubePlaylists");
    expect(calls.indexOf("revokeTokens")).toBeLessThan(calls.indexOf("wipeLocal"));
  });

  it("shows the remote error, erases nothing locally, and Try again reruns the remote steps", async () => {
    const { steps, calls, failing } = fakeSteps();
    const onErased = vi.fn();
    failing.current = "revokeTokens";
    open("google");
    render(<EraseDialog steps={steps} onErased={onErased} />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect & erase" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't reach Google. Nothing was erased. Try again.",
    );
    expect(calls).not.toContain("wipeLocal");
    failing.current = null;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(onErased).toHaveBeenCalledTimes(1));
    expect(calls.filter((call) => call === "revokeTokens")).toHaveLength(2);
  });

  it("Erase this computer only skips the remote steps after a failure", async () => {
    const { steps, calls, failing } = fakeSteps();
    failing.current = "revokeTokens";
    open("google");
    render(<EraseDialog steps={steps} onErased={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect & erase" }));
    await screen.findByRole("alert");
    failing.current = null;
    const before = calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Erase this computer only" }));
    await waitFor(() => expect(calls).toContain("wipeLocal"));
    expect(calls.slice(before)).toEqual(["stopSync", "removeKeyring", "wipeLocal"]);
  });

  it("a failed local wipe offers Retry local cleanup without repeating the remote steps", async () => {
    const { steps, calls, failing } = fakeSteps();
    const onErased = vi.fn();
    failing.current = "wipeLocal";
    open("google");
    render(<EraseDialog steps={steps} onErased={onErased} />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect & erase" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Disconnected, but some local data could not be removed.",
    );
    failing.current = null;
    const before = calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Retry local cleanup" }));
    await waitFor(() => expect(onErased).toHaveBeenCalledTimes(1));
    expect(calls.slice(before)).toEqual(["stopSync", "removeKeyring", "wipeLocal"]);
  });

  it("guest mode shows only the download box and runs the local steps", async () => {
    const { steps, calls } = fakeSteps();
    const onErased = vi.fn();
    open("guest");
    render(<EraseDialog steps={steps} onErased={onErased} />);
    expect(screen.queryByLabelText("Also delete playlists Hushio created on YouTube")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Erase all local data" }));
    await waitFor(() => expect(onErased).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(["stopSync", "removeKeyring", "wipeLocal"]);
  });

  it("reset shows no boxes and does not touch the remote services", async () => {
    const { steps, calls } = fakeSteps();
    open("reset");
    render(<EraseDialog steps={steps} onErased={vi.fn()} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reset app data" }));
    await waitFor(() => expect(calls).toContain("resumeSync"));
    expect(calls).toEqual(["stopSync", "wipeLocal", "resumeSync"]);
  });

  it("returns focus to the control that opened it", () => {
    const { steps } = fakeSteps();
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    open("guest");
    render(<EraseDialog steps={steps} onErased={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
