let finishedThisLaunch = false;

export function introFinished(): boolean {
  return finishedThisLaunch;
}

export function markIntroFinished(): void {
  finishedThisLaunch = true;
}

export function resetIntroForTests(): void {
  finishedThisLaunch = false;
}

export async function waitUntil(isReady: () => boolean, capMs: number, pollMs: number): Promise<boolean> {
  let waited = 0;
  while (!isReady()) {
    if (waited >= capMs) return false;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    waited += pollMs;
  }
  return true;
}
