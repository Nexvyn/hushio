import type { PersistStorage, StorageValue } from "zustand/middleware";
import { persistRead, persistWrite } from "./bridge";
import { useUI } from "../stores/ui";

const GUEST = "guest";
const SAVE_FAILED_TOAST_MS = 60_000;
const writeQueues = new Map<string, Promise<void>>();
const lastSaveFailureToast = new Map<string, number>();

function reportSaveFailure(name: string, error: unknown): void {
  console.error(`[hushio] could not save store "${name}"`, error);
  const now = Date.now();
  const last = lastSaveFailureToast.get(name);
  if (last !== undefined && now - last < SAVE_FAILED_TOAST_MS) return;
  lastSaveFailureToast.set(name, now);
  useUI.getState().toast("Couldn't save your data. Recent changes may be lost.", "error");
}

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

async function saveQueued(name: string, key: string, write: () => Promise<unknown>): Promise<void> {
  try {
    await queueWrite(key, write);
  } catch (error) {
    reportSaveFailure(name, error);
  }
}

export function persistStorage<S>(name: string, owner = GUEST): PersistStorage<S> {
  const key = `${owner}:${name}`;
  return {
    getItem: async () => {
      const value = await persistRead<StorageValue<S>>(name, owner);
      return value ?? null;
    },
    setItem: async (_name, value) => {
      await saveQueued(name, key, () => persistWrite(name, value, owner));
    },
    removeItem: async () => {
      await saveQueued(name, key, () => persistWrite(name, null, owner));
    },
  };
}
