import { useEffect, useRef, useState } from "react";
import { Bell, X } from "@phosphor-icons/react";
import { Button } from "../Button";
import { PhoneIcon } from "./PhoneIcon";
import {
  notificationRequest,
  notificationSettings,
  notificationState,
} from "../../lib/bridge";
import {
  parseNotificationState,
  shouldAskAtPlayback,
  showNotificationBanner,
  type NotificationState,
} from "../../lib/notifications";
import { currentTrack, usePlayer } from "../../stores/player";

const AUTO_HIDE_MS = 6000;

export function NotificationBanner() {
  const [state, setState] = useState<NotificationState>("granted");
  const playing = usePlayer((player) => currentTrack(player) !== null);
  const [dismissed, setDismissed] = useState(false);
  const asked = useRef(false);

  useEffect(() => {
    notificationState()
      .then((value) => setState(parseNotificationState(value)))
      .catch(() => setState("granted"));
  }, []);

  const shouldExplain = shouldAskAtPlayback(state, asked.current);
  const visible = !dismissed && playing && (shouldExplain || showNotificationBanner(state, playing));

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setDismissed(true), AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 z-40 flex items-center gap-3 rounded-2xl bg-elevated px-4 py-3 text-ink-1"
      style={{ top: "calc(var(--inset-top, 0px) + 8px)" }}
    >
      <span className="text-ink-2">
        <PhoneIcon icon={Bell} />
      </span>
      <p className="min-w-0 flex-1 text-meta">
        {shouldExplain ? "Allow notifications to show playback controls on your lock screen." : "Notifications are off. Playback still works, but the media controls are hidden."}
      </p>
      {shouldExplain ? (
        <Button variant="ghost" onClick={() => {
          asked.current = true;
          void notificationRequest().then((value) => setState(parseNotificationState(value))).catch(() => setState("settings"));
        }}>Allow</Button>
      ) : <Button variant="ghost" onClick={() => void notificationSettings()}>Open settings</Button>}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-2 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <PhoneIcon icon={X} />
      </button>
    </div>
  );
}
