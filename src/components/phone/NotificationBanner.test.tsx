import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { notificationState, notificationRequest, notificationSettings, persistRead, persistWrite } = vi.hoisted(() => ({
  notificationState: vi.fn(),
  notificationRequest: vi.fn(),
  notificationSettings: vi.fn(),
  persistRead: vi.fn(async () => null),
  persistWrite: vi.fn(async () => true),
}));

vi.mock("../../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/bridge")>()),
  notificationState,
  notificationRequest,
  notificationSettings,
  persistRead,
  persistWrite,
}));

vi.mock("../../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { NotificationBanner } from "./NotificationBanner";
import { usePlayer } from "../../stores/player";

const track = { id: "nb-1", title: "Quiet Song", artist: "The Band", thumb: null as string | null };

beforeEach(() => {
  notificationState.mockReset();
  notificationRequest.mockReset();
  notificationSettings.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  usePlayer.setState({ queue: [], index: 0, playing: false });
});

describe("NotificationBanner", () => {
  it("stays hidden while notifications are granted", async () => {
    notificationState.mockResolvedValue("granted");
    usePlayer.setState({ queue: [track], index: 0, playing: true });
    render(<NotificationBanner />);
    await waitFor(() => expect(notificationState).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("explains notifications at first playback and requests permission after Allow", async () => {
    notificationState.mockResolvedValue("request");
    notificationRequest.mockResolvedValue("granted");
    render(<NotificationBanner />);
    await waitFor(() => expect(notificationState).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
    expect(notificationRequest).not.toHaveBeenCalled();
    await act(async () => {
      usePlayer.setState({ queue: [track], index: 0, playing: true });
    });
    expect((await screen.findByRole("status")).textContent).toContain("playback controls on your lock screen");
    expect(notificationRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(notificationRequest).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("shows the banner when denied and opens system settings from it", async () => {
    notificationState.mockResolvedValue("settings");
    usePlayer.setState({ queue: [track], index: 0, playing: true });
    render(<NotificationBanner />);
    expect((await screen.findByRole("status")).textContent).toContain("Playback still works");
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(notificationSettings).toHaveBeenCalledTimes(1);
  });
  it("closes when dismissed", async () => {
    notificationState.mockResolvedValue("settings");
    usePlayer.setState({ queue: [track], index: 0, playing: true });
    render(<NotificationBanner />);
    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("hides itself after a few seconds", async () => {
    vi.useFakeTimers();
    try {
      notificationState.mockResolvedValue("settings");
      usePlayer.setState({ queue: [track], index: 0, playing: true });
      render(<NotificationBanner />);
      await act(async () => {});
      expect(screen.getByRole("status")).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(5999);
      });
      expect(screen.getByRole("status")).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.queryByRole("status")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
