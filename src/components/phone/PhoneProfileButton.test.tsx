import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const auth = vi.hoisted(() => ({
  account: {
    mode: "guest" as "guest" | "google",
    googleSub: null,
    name: null as string | null,
    email: null,
    pictureUrl: null as string | null,
    configured: false,
    keyringAvailable: true,
  },
}));

vi.mock("../../stores/auth", () => ({
  useAuth: (selector: (state: { account: typeof auth.account }) => unknown) => selector({ account: auth.account }),
}));

import { PhoneProfileButton } from "./PhoneProfileButton";
import { useNavigation } from "../../stores/navigation";

beforeEach(() => {
  auth.account = { ...auth.account, mode: "guest", pictureUrl: null, name: null };
  useNavigation.setState({ view: { name: "home" }, navPast: [], navFuture: [], pendingScroll: null });
});

afterEach(cleanup);

describe("PhoneProfileButton", () => {
  it("is a labelled 44px target", () => {
    render(<PhoneProfileButton />);
    const button = screen.getByRole("button", { name: "Profile" });
    expect(button.className).toContain("size-11");
  });

  it("shows the Google picture when signed in with one", () => {
    auth.account = { ...auth.account, mode: "google", pictureUrl: "https://example.test/a.png", name: "Ada" };
    const { container } = render(<PhoneProfileButton />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.test/a.png");
  });

  it("shows a plain icon with no background without a picture", () => {
    const { container } = render(<PhoneProfileButton />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("span.bg-wash")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("opens settings when tapped", () => {
    render(<PhoneProfileButton />);
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    expect(useNavigation.getState().view).toEqual({ name: "settings" });
  });
});
