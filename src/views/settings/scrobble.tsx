import { CheckCircle, LinkSimple, SignOut } from "@phosphor-icons/react";
import { Button } from "../../components/Button";
import type { SettingRowProps } from "../../components/SettingRow";
import { useUI } from "../../stores/ui";
import type { ScrobbleStatus } from "../../lib/bridge";

export type ScrobbleContext = {
  status: ScrobbleStatus;
  busy: boolean;
  setEnabled: (service: "lastfm" | "listenbrainz", enabled: boolean) => void;
  connectListenbrainz: (token: string) => void;
  disconnectListenbrainz: () => void;
  beginLastfm: () => void;
  finishLastfm: () => void;
  disconnectLastfm: () => void;
};

export type ScrobbleRowSpec = SettingRowProps & { id: string };

const TOKEN_HELP =
  "Open your ListenBrainz settings page, copy the user token, then paste it here.";

export function scrobbleRows(context: ScrobbleContext): ScrobbleRowSpec[] {
  return [...lastfmRows(context), ...listenbrainzRows(context)];
}

function lastfmRows(context: ScrobbleContext): ScrobbleRowSpec[] {
  const { status, busy } = context;
  if (status.lastfm.connected) {
    return [
      {
        id: "lastfm-account",
        icon: CheckCircle,
        title: "Last.fm",
        note: `Signed in as ${status.lastfm.username ?? "you"}`,
        value: status.lastfm.enabled ? "On" : "Off",
      },
      {
        id: "lastfm-enabled",
        icon: CheckCircle,
        title: "Send scrobbles to Last.fm",
        note: "Turn off to keep listening without sending anything.",
        toggle: {
          checked: status.lastfm.enabled,
          onChange: (value) => context.setEnabled("lastfm", value),
        },
      },
      {
        id: "lastfm-disconnect",
        icon: SignOut,
        title: "Disconnect Last.fm",
        control: <Button onClick={context.disconnectLastfm}>Disconnect</Button>,
      },
    ];
  }
  if (status.lastfm.awaitingApproval) {
    return [
      {
        id: "lastfm-approve",
        icon: LinkSimple,
        title: "Last.fm",
        note: "Allow access on the Last.fm page, then finish connecting.",
        control: (
          <Button disabled={busy} onClick={context.finishLastfm}>
            Finish
          </Button>
        ),
      },
    ];
  }
  return [
    {
      id: "lastfm-connect",
      icon: LinkSimple,
      title: "Last.fm",
      note: status.lastfm.available
        ? "Opens a browser page where you allow access."
        : "Last.fm isn't set up in this build.",
      disabled: !status.lastfm.available || busy,
      control: (
        <Button disabled={!status.lastfm.available || busy} onClick={context.beginLastfm}>
          Connect
        </Button>
      ),
    },
  ];
}

function listenbrainzRows(context: ScrobbleContext): ScrobbleRowSpec[] {
  const { status, busy } = context;
  if (status.listenbrainz.connected) {
    return [
      {
        id: "listenbrainz-account",
        icon: CheckCircle,
        title: "ListenBrainz",
        note: `Signed in as ${status.listenbrainz.username ?? "you"}`,
        value: status.listenbrainz.enabled ? "On" : "Off",
      },
      {
        id: "listenbrainz-enabled",
        icon: CheckCircle,
        title: "Send scrobbles to ListenBrainz",
        note: "Turn off to keep listening without sending anything.",
        toggle: {
          checked: status.listenbrainz.enabled,
          onChange: (value) => context.setEnabled("listenbrainz", value),
        },
      },
      {
        id: "listenbrainz-disconnect",
        icon: SignOut,
        title: "Disconnect ListenBrainz",
        control: <Button onClick={context.disconnectListenbrainz}>Disconnect</Button>,
      },
    ];
  }
  return [
    {
      id: "listenbrainz-connect",
      icon: LinkSimple,
      title: "ListenBrainz",
      note: "Paste the user token from your ListenBrainz settings page.",
      disabled: busy,
      control: (
        <Button disabled={busy} onClick={() => openTokenDialog(context)}>
          Connect
        </Button>
      ),
    },
  ];
}

function openTokenDialog(context: ScrobbleContext): void {
  useUI.getState().openDialog({
    title: "Connect ListenBrainz",
    body: TOKEN_HELP,
    initialValue: "",
    placeholder: "User token",
    confirmLabel: "Connect",
    validate: (value) => (value.trim() ? null : "Paste your user token first."),
    onConfirm: (value) => context.connectListenbrainz(value),
  });
}
