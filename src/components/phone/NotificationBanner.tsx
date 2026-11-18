import { useEffect, useRef, useState } from "react";
import { Bell } from "@phosphor-icons/react";
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

export function NotificationBanner() {
  const [state, setState] = useState<NotificationState>("granted");
  const playing = usePlayer((player) => currentTrack(player) !== null);
  const asked = useRef(false);

  useEffect(() => {
    notificationState()
      .then((value) => setState(parseNotificationState(value)))
      .catch(() => setState("granted"));
  }, []);

  useEffect(() => {
    if (!playing || !shouldAskAtPlayback(state, asked.current)) return;
    asked.current = true;
    notificationRequest()
      .then((value) => setState(parseNotificationState(value)))
      .catch(() => setState("settings"));
  }, [playing, state]);

  if (!showNotificationBanner(state, playing)) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 z-40 flex items-center gap-3 rounded-2xl bg-elevated px-4 py-3 text-ink-1"
      style={{ top: "calc(var(--inset-top, 0px) + 8px)" }}
    >
      <span className="text-ink-2">
        <PhoneIcon icon={Bell} />
      </span>
      <p className="min-w-0 flex-1 text-sm">
        Notifications are off. Playback still works, but the media controls are hidden.
      </p>
      <Button variant="ghost" onClick={() => void notificationSettings()}>
        Open settings
      </Button>
    </div>
  );
}
