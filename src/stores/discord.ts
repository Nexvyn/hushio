import { create } from "zustand";
import { discordSetEnabled, discordStatus, type DiscordStatus } from "../lib/bridge";
import { useUI } from "./ui";

const OFF: DiscordStatus = { available: false, enabled: false, connected: false };

type DiscordState = {
  status: DiscordStatus;
  load: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
};

export const useDiscord = create<DiscordState>()((set) => ({
  status: OFF,

  load: async () => {
    const status = await discordStatus().catch(() => null);
    if (status) set({ status });
  },

  setEnabled: async (enabled) => {
    const status = await discordSetEnabled(enabled).catch((error: unknown) => {
      const message = error instanceof Error && error.message ? error.message : "Couldn't change that setting.";
      useUI.getState().toast(message, "error");
      return null;
    });
    if (status) set({ status });
  },
}));
