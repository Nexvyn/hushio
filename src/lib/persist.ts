import type { PersistStorage, StorageValue } from "zustand/middleware";
import { persistRead, persistWrite } from "./bridge";

const GUEST = "guest";
const writeQueues = new Map<string, Promise<void>>();

function queueWrite(key: string, write: () => Promise<unknown>): Promise<void> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const run = previous.then(write).then(() => undefined);
  const settled = run.catch(() => undefined);
  writeQueues.set(key, settled);
  void settled.then(() => {
    if (writeQueues.get(key) === settled) writeQueues.delete(key);
  });
  return run;
}

export function persistStorage<S>(name: string, owner = GUEST): PersistStorage<S> {
  const key = `${owner}:${name}`;
  return {
    getItem: async () => {
      const value = await persistRead<StorageValue<S>>(name, owner);
      return value ?? null;
    },
    setItem: async (_name, value) => {
      await queueWrite(key, () => persistWrite(name, value, owner));
    },
    removeItem: async () => {
      await queueWrite(key, () => persistWrite(name, null, owner));
    },
  };
}
