import type { DiscordStatus } from "../../lib/bridge";

export type DiscordContext = {
  status: DiscordStatus;
  setEnabled: (enabled: boolean) => void;
};

export function discordNote(status: DiscordStatus): string {
  if (!status.available) return "Discord isn't set up in this build.";
  if (status.connected) return "Discord is running and listening.";
  return "Discord isn't running right now. This turns on by itself when it starts.";
}
