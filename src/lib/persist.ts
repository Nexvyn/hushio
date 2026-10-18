import type { PersistStorage, StorageValue } from "zustand/middleware";
import { persistRead, persistWrite } from "./bridge";

const GUEST = "guest";

export function persistStorage<S>(name: string, owner = GUEST): PersistStorage<S> {
  return {
    getItem: async () => {
      const value = await persistRead<StorageValue<S>>(name, owner);
      return value ?? null;
    },
    setItem: async (_name, value) => {
      await persistWrite(name, value, owner);
    },
    removeItem: async () => {
      await persistWrite(name, null, owner);
    },
  };
}
