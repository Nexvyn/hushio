import { create } from "zustand";
import { call } from "../lib/bridge";

export type CrashLog = {
  at: number;
  message: string;
};

type CrashesState = {
  logs: CrashLog[];
  loaded: boolean;
  fetchCrashes: () => Promise<void>;
  clearCrashes: () => Promise<void>;
};

export const useCrashes = create<CrashesState>()((set) => ({
  logs: [],
  loaded: false,
  fetchCrashes: async () => {
    try {
      const logs = await call<CrashLog[]>("crash_logs");
      set({ logs, loaded: true });
    } catch (error) {
      console.error("Failed to load crash logs", error);
      set({ loaded: true });
    }
  },
  clearCrashes: async () => {
    try {
      const logs = await call<CrashLog[]>("crash_logs_clear");
      set({ logs, loaded: true });
    } catch (error) {
      console.error("Failed to clear crash logs", error);
    }
  },
}));
