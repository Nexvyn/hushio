import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GoogleAccountCard } from "./GoogleAccountCard";
import type { GoogleAccount } from "../lib/bridge";

const GUEST: GoogleAccount = {
  mode: "guest",
  googleSub: null,
  name: null,
  email: null,
  pictureUrl: null,
  configured: true,
  keyringAvailable: true,
};

const SIGNED_IN: GoogleAccount = {
  mode: "google",
  googleSub: "sub-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  pictureUrl: "https://img.example/ada.png",
  configured: true,
  keyringAvailable: true,
};

function renderCard(props: Partial<Parameters<typeof GoogleAccountCard>[0]> = {}) {
  const handlers = { onSignIn: vi.fn(), onCancelSignIn: vi.fn() };
  render(
    <GoogleAccountCard account={GUEST} signingIn={false} {...handlers} {...props} />,
  );
  return handlers;
}

afterEach(cleanup);

describe("GoogleAccountCard", () => {
  it("offers sign-in to guests and reports the click", () => {
    const { onSignIn } = renderCard();
    expect(screen.getByText("Using Hushio as a guest")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Sign in with Google" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("disables sign-in with an honest message when this build has no client ID", () => {
    renderCard({ account: { ...GUEST, configured: false } });
    const button = screen.getByRole("button", { name: "Sign in with Google" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Google sign-in isn't available in this build.")).toBeTruthy();
  });

  it("shows the waiting state and cancels the pending sign-in", () => {
    const { onCancelSignIn } = renderCard({ signingIn: true });
    const waiting = screen.getByRole("button", { name: "Waiting for Google…" });
    expect((waiting as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelSignIn).toHaveBeenCalledTimes(1);
  });

  it("shows the name, email and avatar when signed in", () => {
    renderCard({ account: SIGNED_IN });
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("ada@example.com")).toBeTruthy();
    const avatar = document.querySelector("img");
    expect(avatar?.getAttribute("src")).toBe("https://img.example/ada.png");
    expect(screen.queryByRole("button", { name: "Sign in with Google" })).toBeNull();
  });

  it("falls back to a neutral label and icon when the profile has no name or picture", () => {
    renderCard({ account: { ...SIGNED_IN, name: null, pictureUrl: null } });
    expect(screen.getByText("Google account")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });

  it("explains a missing keyring with the PRD text", () => {
    renderCard({ account: { ...GUEST, keyringAvailable: false } });
    expect(
      screen.getByText(
        "No keyring found, so Hushio can't keep you signed in. Install GNOME Keyring or KWallet, then sign in again.",
      ),
    ).toBeTruthy();
  });
});
